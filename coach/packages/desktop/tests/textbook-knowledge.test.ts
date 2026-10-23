import {describe,it,expect} from "vitest";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {createTextbookKnowledge,loadTextbookKnowledge,validateTextbookCorpus,textbookCorpusId} from "../src/textbook-knowledge.js";
import {createArenaTextbookTools} from "../src/arena-textbook-tools.js";
import {makeArenaMcpCase} from "./fixtures/arena-mcp-case.js";
import {fixtureCorpus,writeFixtureCorpus} from "./fixtures/textbook-fixture.js";

describe("complete textbook knowledge",()=>{
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
   await writeFile(join(f.directory,"assets/example.png"),"corrupt");await expect(loadTextbookKnowledge(f.directory)).rejects.toThrow("image_changed");
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
