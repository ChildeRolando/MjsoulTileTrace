import {describe,it,expect} from "vitest";
import {TextbookUnitSchema} from "@riichi-coach/contracts";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createTextbookKnowledge,loadTextbookKnowledge,validateTextbookCorpus,textbookCorpusId} from "../src/textbook-knowledge.js";
import {createArenaTextbookTools} from "../src/arena-textbook-tools.js";
import {makeArenaMcpCase} from "./fixtures/arena-mcp-case.js";
import {fixtureCorpus,writeFixtureCorpus} from "./fixtures/textbook-fixture.js";

describe("complete textbook knowledge",()=>{
 it("preserves table cells across pagination and refuses missing fragments, blanks or overlapping spans",async()=>{
  const c=fixtureCorpus(),u=c.units[0]!,url="https://example.org/table";
  u.source={...u.source,format:"web",pages:[],web:{url,articleId:"table",htmlSha256:u.source.sha256}};c.images=[];
  const base={tableId:"source-table",rowCount:2,columnCount:2,rowspan:1,colspan:1,header:false,empty:false,fragmentIndex:0,fragmentCount:1};
  u.blocks=Array.from({length:4},(_,i)=>({type:"p" as const,id:`cell-${i}`,page:null,locator:{url,sourceBlockIds:[`cell-${i}`]},text:i<2?"完整条件。".repeat(400):i===2?"结论":"（原表空白单元格）",tableCell:i<2?{...base,row:0,column:0,rowspan:2,fragmentIndex:i,fragmentCount:2}:{...base,row:i===2?0:1,column:1,empty:i===3}}));
  c.units[0]=TextbookUnitSchema.parse(u);c.corpusId=textbookCorpusId(c);const port=createTextbookKnowledge(c);let offset:number|null=0;const blocks=[];
  do{const r=await port.read({unitId:u.unitId,blockOffset:offset});blocks.push(...r.unit.blocks);offset=r.nextBlockOffset;}while(offset!==null);
  expect(blocks).toEqual(u.blocks);expect(blocks.filter(b=>b.tableCell?.column===0)).toHaveLength(2);
  for(const missing of [1,3]){const changed=structuredClone(c);changed.units[0]!.blocks.splice(missing,1);changed.corpusId=textbookCorpusId(changed);expect(()=>validateTextbookCorpus(changed)).toThrow(missing===1?"fragment_missing":"blank_slot_missing");}
  const overlap=structuredClone(c);overlap.units[0]!.blocks[2]!.tableCell!.rowspan=2;overlap.corpusId=textbookCorpusId(overlap);expect(()=>validateTextbookCorpus(overlap)).toThrow("cell_overlap");
 });
 it("keeps real web locations through catalog, search, full reads and Arena citations alongside PDF sources",async()=>{
  const c=fixtureCorpus(),u=c.units[0]!,url="https://example.org/lesson.html";
  u.source={...u.source,format:"web",pages:[],web:{url,articleId:"lesson",htmlSha256:u.source.sha256}};
  for(const b of u.blocks){b.page=null;b.locator={url,sourceBlockIds:[`lesson:${b.id}`],domPaths:[`main/${b.id}`]};if(b.type==="figure"){b.figure.page=null;b.figure.locator=b.locator;}}
  c.units[0]=TextbookUnitSchema.parse(u);c.corpusId=textbookCorpusId(c);const port=createTextbookKnowledge(c);
  expect((await port.catalog({chapterId:"pairs"})).entries[0]).toMatchObject({pages:[],sourceUrl:url});
  expect((await port.search({query:"七对子",limit:1})).hits[0]).toMatchObject({pages:[],sourceUrl:url});
  expect((await port.read({unitId:u.unitId})).unit.blocks[0]).toMatchObject({page:null,locator:{url}});
  expect((await port.read({unitId:"open-threat"})).unit.source.pages).toEqual([3]);
  const fixture=makeArenaMcpCase(),tools=createArenaTextbookTools({caseRef:fixture.observation.caseRef,aliases:fixture.aliases,knowledge:port});
  const result=await tools[1]!.execute({unitId:u.unitId},{caseRef:fixture.observation.caseRef,signal:new AbortController().signal});
  expect(tools[1]!.references(result).sourceRefs).toHaveLength(1);
  for(const mutate of [(x:typeof c)=>{x.units[0]!.blocks[0]!.page=1;},(x:typeof c)=>{delete x.units[0]!.blocks[0]!.locator;},(x:typeof c)=>{x.units[0]!.source.web!.htmlSha256="2".repeat(64);}]){
   const bad=structuredClone(c);mutate(bad);bad.corpusId=textbookCorpusId(bad);expect(()=>validateTextbookCorpus(bad)).toThrow();
  }
 });
 it("indexes a complete sentence with inline figures and still serves each original image identity",async()=>{
  const c=fixtureCorpus(),u=c.units[0]!,old=u.blocks[1]!;if(old.type!=="figure")throw Error("fixture");const url="https://example.org/inline",locator={url,sourceBlockIds:["p1","i1","p2"]};
  u.source={...u.source,format:"web",pages:[],web:{url,articleId:"inline",htmlSha256:u.source.sha256}};
  const figure={...old.figure,page:null,locator:{url,sourceBlockIds:["i1"]},transcription:{text:"34m224778p89s5567z"},requiresImageForFullExample:false,imageProvenance:{kind:"derived-source-assets" as const,method:"source-order",sourceAssetSha256s:[old.figure.imageSha256]}};
  u.blocks=[{type:"p",id:"inline-paragraph",page:null,locator,text:"例：34m224778p89s5567z；摸入2m后比较进张。",inlineFigures:[figure]}];c.units[0]=TextbookUnitSchema.parse(u);c.corpusId=textbookCorpusId(c);const port=createTextbookKnowledge(c);
  expect((await port.search({query:"摸入2m进张",limit:1})).hits[0]!.matchedBlockId).toBe("inline-paragraph");
  expect((await port.read({unitId:u.unitId})).unit.blocks).toHaveLength(1);
  expect((await port.figure({figureId:figure.figureId})).figure).toMatchObject({imageSha256:old.figure.imageSha256,transcription:{text:"34m224778p89s5567z"},imageProvenance:{kind:"derived-source-assets"}});
  const bad=structuredClone(c),b=bad.units[0]!.blocks[0]!;if(b.type!=="p")throw Error("fixture");b.inlineFigures![0]!.locator!.sourceBlockIds=["outside-paragraph"];bad.corpusId=textbookCorpusId(bad);expect(()=>validateTextbookCorpus(bad)).toThrow();
 });
 it("search previews locate a parent, and reading includes cross-page conditions and figure references",async()=>{
  const port=createTextbookKnowledge(fixtureCorpus()),search=await port.search({query:"七对子转对对和",limit:3});
  expect(search.previewOnly).toBe(true);expect(search.hits[0]!.unitId).toBe("pairs-route");
  const read=await port.read({unitId:search.hits[0]!.unitId});expect(read.completeArgument).toBe(true);
  expect(read.unit.blocks).toHaveLength(3);expect(JSON.stringify(read)).toContain("见尽的对子");expect(read.unit.source.pages).toEqual([1,2]);
  read.unit.blocks.splice(0);expect((await port.read({unitId:"pairs-route"})).unit.blocks).toHaveLength(3);
 });
 it("browse, no-hit, actual chapter filters and cancellation are explicit",async()=>{
  const port=createTextbookKnowledge(fixtureCorpus());expect((await port.search({query:"",limit:5})).hits).toHaveLength(2);
  expect((await port.search({query:"zzzznotfound",limit:3})).status).toBe("no_hits");
  expect((await port.search({query:"七对子",chapterId:"defense",limit:3})).hits).toEqual([]);
  await expect(port.search({query:"",chapterId:"missing",limit:3})).rejects.toThrow();
  await expect(port.read({unitId:"pairs-route"},AbortSignal.abort())).rejects.toThrow();
 });
 it("rejects unknown fields, guessed IDs, altered corpora and oversized complete arguments",async()=>{
  const c=fixtureCorpus(),port=createTextbookKnowledge(c);
  await expect(port.read({unitId:"../../secret"})).rejects.toThrow();
  await expect(port.read({unitId:"unregistered"})).rejects.toThrow();
  await expect(port.search({query:"",limit:3,path:"secret"} as never)).rejects.toThrow();
  c.units[0]!.title="mutated";expect(()=>validateTextbookCorpus(c)).toThrow("changed");
  c.units[0]!.blocks[0]={type:"p",id:"pairs-b1",page:1,text:"牌".repeat(6000)};c.corpusId=textbookCorpusId(c);
  expect(()=>validateTextbookCorpus(c)).toThrow("over_budget");
 });
 it("matches adjacent Chinese numerals/tiles to the PDF's spaced typography",async()=>{
  const c=fixtureCorpus();c.units[0]!.blocks[0]={type:"p",id:"pairs-b1",page:1,text:"进入第 10 巡以后，通常维持向听数更好。宝牌为 4 饼。"};c.corpusId=textbookCorpusId(c);
  const port=createTextbookKnowledge(c);
  expect((await port.search({query:"第10巡以后维持向听数",limit:1})).hits[0]?.unitId).toBe("pairs-route");
  expect((await port.search({query:"宝牌4筒",limit:1})).hits[0]?.unitId).toBe("pairs-route");
 });
 it("refuses modified image/body files and keeps a loaded snapshot immutable",async()=>{
  const f=await writeFixtureCorpus();try{
   const k=await loadTextbookKnowledge(f.directory);const original=await k.image("pairs-b2");original[0]=0;
   expect((await k.image("pairs-b2"))[0]).toBe(137);
   await writeFile(join(f.directory,"assets/example.png"),"corrupt");await expect(k.image("pairs-b2")).rejects.toThrow("image_changed");await expect((await loadTextbookKnowledge(f.directory)).image("pairs-b2")).rejects.toThrow("image_changed");
   await writeFile(join(f.directory,"textbook-bodies.json"),"new body");await expect(loadTextbookKnowledge(f.directory)).rejects.toThrow("body_changed");
  }finally{await f.cleanup();}
 });
 it("Arena grants citations only for read content, isolates cases and marks images as undelivered",async()=>{
  const c=makeArenaMcpCase(),tools=createArenaTextbookTools({caseRef:c.observation.caseRef,aliases:c.aliases,knowledge:createTextbookKnowledge(fixtureCorpus())});
  const context={caseRef:c.observation.caseRef,signal:new AbortController().signal};
  const search=await tools[0]!.execute({query:"七对子",limit:3},context);expect(tools[0]!.references(search).sourceRefs).toEqual([]);
  const read=await tools[1]!.execute({unitId:"pairs-route"},context);expect(tools[1]!.references(read).sourceRefs).toHaveLength(1);
  expect(JSON.stringify(read)).not.toContain("assets/");expect(read).toMatchObject({imageDelivery:"not-delivered-text-only"});
  const image=await tools[2]!.execute({figureId:"pairs-b2"},context);expect(tools[2]!.references(image).sourceRefs).toEqual([]);
  await expect(tools[1]!.execute({unitId:"pairs-route"},{...context,caseRef:"wrong-case"})).rejects.toThrow("case_mismatch");
 });
 it("Arena receives the entire structured example in both parent reads and figure reads",async()=>{
  const corpus=fixtureCorpus(),figure=corpus.units[0]!.blocks[1]!;
  if(figure.type!=="figure")throw Error("fixture");
  const diagram={concealed:"",drawn:null,doraDisplay:"4z",hiddenTileCount:7,melds:[{kind:"chi" as const,tiles:"324p",calledIndex:0},{kind:"chi" as const,tiles:"345s",calledIndex:0}],notes:"未知暗手7张；南家。"};
  figure.figure.transcription={diagram};figure.figure.requiresImageForFullExample=false;corpus.corpusId=textbookCorpusId(corpus);
  const c=makeArenaMcpCase(),tools=createArenaTextbookTools({caseRef:c.observation.caseRef,aliases:c.aliases,knowledge:createTextbookKnowledge(corpus)}),context={caseRef:c.observation.caseRef,signal:new AbortController().signal};
  const read=await tools[1]!.execute({unitId:"pairs-route"},context);
  expect(read).toMatchObject({result:{unit:{blocks:expect.arrayContaining([expect.objectContaining({figure:expect.objectContaining({transcription:{diagram},requiresImageForFullExample:false})})])}}});
  const detail=await tools[2]!.execute({figureId:"pairs-b2"},context);
  expect(detail).toMatchObject({result:{figure:{transcription:{diagram},requiresImageForFullExample:false}}});
  expect(tools[2]!.references(detail).sourceRefs).toHaveLength(1);expect(tools[2]!.references(detail).evidenceRefs).toEqual([]);
 });
});


describe("full textbook navigation",()=>{
 it("paginates every chapter and unit without dropping chapters from a large corpus",async()=>{
  const c=fixtureCorpus(),template=c.units[1]!;c.images=[];
  c.units=Array.from({length:41},(_,i)=>({...template,unitId:`unit-${i}`,chapterId:`chapter-${i}`,previousUnitId:null,nextUnitId:null,blocks:[{type:"p" as const,id:`block-${i}`,page:template.source.pages[0]!,text:`完整正文 ${i}`}]}));c.corpusId=textbookCorpusId(c);
  const port=createTextbookKnowledge(c),seen:string[]=[];let offset:number|null=0;
  do{const r=await port.catalog({offset,limit:20});seen.push(...r.entries.map(x=>x.chapterId));offset=r.nextOffset;}while(offset!==null);
  expect(new Set(seen).size).toBe(41);expect((await port.catalog({chapterId:"chapter-40"})).entries[0]!.unitId).toBe("unit-40");
  expect((await port.search({query:"完整正文",limit:5})).chapters.length).toBeLessThanOrEqual(5);
  await expect(port.catalog({offset:42})).rejects.toThrow("cursor");
 });
 it("shrinks catalog pages by bytes with a resumable cursor instead of omitting entries",async()=>{
  const c=fixtureCorpus(),template=c.units[1]!;c.images=[];c.units=Array.from({length:20},(_,i)=>({...template,unitId:`wide-${i}`,chapterId:`wide-chapter-${i}`,previousUnitId:null,nextUnitId:null,source:{...template.source,pages:Array.from({length:800},(_,n)=>n+1)},blocks:[{type:"p" as const,id:`wide-block-${i}`,page:1,text:"正文"}]}));c.corpusId=textbookCorpusId(c);
  const port=createTextbookKnowledge(c),seen:string[]=[];let offset:number|null=0;
  do{const result=await port.catalog({offset,limit:20});expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(15000);seen.push(...result.entries.map(x=>x.chapterId));offset=result.nextOffset;}while(offset!==null);
  expect(new Set(seen).size).toBe(20);
  const searchSeen:string[]=[];offset=0;
  do{const result=await port.search({query:"正文",limit:5,offset});expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(15000);searchSeen.push(...result.hits.map(x=>x.unitId));offset=result.nextOffset;}while(offset!==null);
  expect(new Set(searchSeen).size).toBe(20);
 });
 it.each(["pdf","web"])("preserves a long %s argument in bounded consecutive reads and withholds citations for skipped blocks",async(format)=>{
  const c=fixtureCorpus(),u=c.units[0]!;c.images=[];c.units=[{...u,previousUnitId:null,nextUnitId:null,blocks:Array.from({length:20},(_,i)=>({type:"p" as const,id:`long-${i}`,page:1,text:`段落${i}：`+"完整条件和例外。".repeat(100)}))}];c.corpusId=textbookCorpusId(c);
  if(format==="web"){
   const url="https://example.org/long-argument",web=c.units[0]!;web.source={...web.source,format:"web",pages:[],web:{url,articleId:"long-argument",htmlSha256:web.source.sha256}};
   for(const b of web.blocks){b.page=null;b.locator={url,sourceBlockIds:[b.id]};}
   c.units=[TextbookUnitSchema.parse(web),fixtureCorpus().units[1]!];c.corpusId=textbookCorpusId(c);
  }
  const port=createTextbookKnowledge(c),fixture=makeArenaMcpCase(),tools=createArenaTextbookTools({caseRef:fixture.observation.caseRef,aliases:fixture.aliases,knowledge:port}),tool=tools[1]!,context={caseRef:fixture.observation.caseRef,signal:new AbortController().signal};
  const tail=await tool.execute({unitId:u.unitId,blockOffset:19},context);expect(tool.references(tail).sourceRefs).toEqual([]);
  expect(tail).toMatchObject({result:{completeArgument:false,nextBlockOffset:null}});
  let offset:number|null=0;const blocks:unknown[]=[];let last:unknown;
  do{const r=await port.read({unitId:u.unitId,blockOffset:offset});expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThan(15000);expect(r.completeArgument).toBe(false);blocks.push(...r.unit.blocks);last=await tool.execute({unitId:u.unitId,blockOffset:offset},context);offset=r.nextBlockOffset;}while(offset!==null);
  expect(blocks).toEqual(c.units[0]!.blocks);expect(tool.references(last).sourceRefs).toHaveLength(1);
  const isolated=createArenaTextbookTools({caseRef:fixture.observation.caseRef,aliases:fixture.aliases,knowledge:port})[1]!;
  expect(isolated.references(await isolated.execute({unitId:u.unitId,blockOffset:19},context)).sourceRefs).toEqual([]);
 });
});
