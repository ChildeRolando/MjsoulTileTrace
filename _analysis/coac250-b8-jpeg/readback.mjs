// Independent actual stdio MCP readback after publication; verifies body, all 12 image responses,
// JPEG originals and derived decoded pixels, canonical selection, and unchanged prior units.
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root='E:/AgentData/Coach/knowledge/processing',repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach',dir='_analysis/coac250-b8-jpeg';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8')),norm=s=>String(s??'').replace(/\s+/g,'');
const pre=await load(dir+'/preconsume.json'),pointer=await load(root+'/integration/accepted-preview-current.json'),output=pointer.output,corpus=await load(output+'/textbook-corpus.json'),old=await load(pre.prior.output+'/textbook-corpus.json');
const {Client}=await import(pathToFileURL(repo+'/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'));
const {StdioClientTransport}=await import(pathToFileURL(repo+'/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'));
const client=new Client({name:'coac250-b8-jpeg-readback',version:'1'});let calls=0,maxBytes=0;
async function call(name,args){const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true);calls++;const text=r.content.find(c=>c.type==='text')?.text;maxBytes=Math.max(maxBytes,Buffer.byteLength(text??''));return {raw:r,data:JSON.parse(text)};}
const rows=[],pixels=[];
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[repo+'/bin/textbook-mcp-server.mjs',output],stderr:'pipe'}));
 let offset=0;const catalog=[];do{const {data}=await call('catalog_textbook',{offset,limit:20});catalog.push(...data.entries);offset=data.nextOffset;}while(offset!==null);assert.equal(catalog.length,222);
 for(const i of pre.items){
  assert.equal(catalog.filter(c=>c.chapterId===i.previewChapterId).length,1);
  const candidate=await load(join(root,i.candidatePath)),units=corpus.units.filter(u=>u.chapterId===i.previewChapterId);assert.equal(units.length,1);
  const unit=units[0],blocks=[];let blockOffset=0,pages=0;do{const {data}=await call('read_textbook',{unitId:unit.unitId,blockOffset});blocks.push(...data.unit.blocks);blockOffset=data.nextBlockOffset;pages++;}while(blockOffset!==null);assert.deepEqual(blocks,unit.blocks);
  const textChecks=candidate.body.blocks.filter(b=>b.type==='text').map(b=>({id:b.sourceBlockIds[0],exact:blocks.some(s=>s.locator?.sourceBlockIds.includes(b.sourceBlockIds[0])&&norm(s.text).includes(norm(b.text)))}));assert.ok(textChecks.every(c=>c.exact));
  const query=candidate.title??unit.title;const search=await call('search_textbook',{query:query.slice(0,30),chapterId:unit.chapterId,limit:5});assert.ok(search.data.hits.some(h=>h.unitId===unit.unitId));
  const images=[];
  for(const fig of candidate.figures){
   const b=blocks.find(b=>b.type==='figure'&&b.locator.sourceBlockIds.some(id=>fig.sourceBlockIds.includes(id)));assert.ok(b);assert.equal(b.figure.transcription.text,fig.transcription);assert.equal(b.figure.caption,fig.caption);
   const response=await call('view_textbook_figure',{figureId:b.figure.figureId}),image=response.raw.content.find(c=>c.type==='image');assert.equal(image.mimeType,'image/png');const data=Buffer.from(image.data,'base64'),indexed=corpus.images.find(c=>c.figureId===b.figure.figureId);assert.equal(sha(data),indexed.sha256);assert.equal(sha(await readFile(join(output,indexed.path))),indexed.sha256);
   images.push({figureId:b.figure.figureId,mimeType:image.mimeType,imageSha256:indexed.sha256,exactMcpBytes:true,exactTranscription:true});
  }
  assert.equal(images.length,candidate.figures.length);
  const selection=pointer.selectedWeb.find(s=>s.candidateSha256===i.candidateSha256);assert.ok(selection);const receipt=await load(selection.stageReceiptPath);
  for(const p of receipt.imageDerivations){
   assert.equal(p.sourceMimeType,'image/jpeg');assert.equal(p.pixelExact,true);assert.equal(p.decodedRgbaSha256,p.derivedRgbaSha256);
   assert.equal(sha(await readFile(join(output,p.originalCopy))),p.sourceSha256);assert.equal(sha(await readFile(join(root,p.sourcePath))),p.sourceSha256);assert.equal(sha(await readFile(join(output,p.path))),p.derivedSha256);
   pixels.push({source:join(output,p.originalCopy),png:join(output,p.path),width:p.width,height:p.height,pixelSha256:p.decodedRgbaSha256,sourceSha256:p.sourceSha256,derivedSha256:p.derivedSha256});
  }
  rows.push({originalChapterId:i.chapterId,chapterId:unit.chapterId,unitId:unit.unitId,pages,blocks:blocks.length,textBlocks:textChecks.length,exactBody:true,exactText:true,exactCaption:true,images,derivedImages:receipt.imageDerivations.length,searchHitsUnit:true});
 }
}finally{await client.close();}
const pixelResult=spawnSync('python',['-c',`import sys,json,hashlib\nfrom PIL import Image\nrows=json.load(sys.stdin)\nfor r in rows:\n a=Image.open(r['source']);b=Image.open(r['png'])\n assert a.format=='JPEG' and b.format=='PNG'\n a.load();b.load();a=a.convert('RGBA');b=b.convert('RGBA')\n assert a.size==b.size==(r['width'],r['height']) and a.tobytes()==b.tobytes()\n assert hashlib.sha256(a.tobytes()).hexdigest()==r['pixelSha256']\nprint(json.dumps({'pairs':len(rows),'exactPixels':True}))`],{input:JSON.stringify(pixels),encoding:'utf8',windowsHide:true});assert.equal(pixelResult.status,0,pixelResult.stderr);
for(const u of old.units)assert.deepEqual(corpus.units.find(n=>n.unitId===u.unitId),u);
const canon=new Set();for(const s of pointer.selectedWeb){const c=await load(s.candidatePath),key=c.source.sourceId+':'+c.source.articleId;assert.equal(canon.has(key),false);canon.add(key);}
const sidecar=await load(output+'/b8-source-notes.json');assert.deepEqual(sidecar.notes[1].parentSourceNotes,['原图与近邻放大图为同一图像，仅计一次。']);
for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);assert.equal(sha(await readFile(pointer.formalCorpusPath)),pointer.formalCorpusFileSha256);
let lock=false;try{await access(root+'/integration/accepted-consumer.lock');lock=true;}catch(e){if(e.code!=='ENOENT')throw e;}assert.equal(lock,false);
const mcp=await load(output+'/mcp-validation.json'),arena=await load(output+'/arena-validation.json'),dedup=await load(output+'/source-deduplication-validation.json');
const result={schema:'coac250-b8-jpeg-readback/1',recordedAt:new Date().toISOString(),preview:{output,corpusId:pointer.corpusId,chapters:pointer.chapters,units:pointer.units,blocks:pointer.blocks,figures:pointer.figures},rows,pixelVerification:JSON.parse(pixelResult.stdout),pixels,priorUnitsUnchanged:old.units.length,canonicalSelectedArticles:canon.size,sourceCollisions:dedup.crossChapterSourceCollisions,
 fullMcp:{units:mcp.units.length,images:mcp.exactImageCount,maxTextBytes:mcp.maxTextBytes},arena:{units:arena.units.length,exactBody:arena.exactBody,maxEnvelopeBytes:arena.maxEnvelopeBytes,tailCannotGrantCitation:arena.units.every(u=>u.tailCannotGrantCitation)},allProtectedInputsUnchanged:true,duplicateImageNotePreserved:true,formalSha256:pointer.formalCorpusFileSha256,activeLibraryChanged:false,consumerLockReleased:true,targetMcpCalls:calls,maxTargetTextBytes:maxBytes,modelCalls:0,productionCalls:0};
await writeFile(dir+'/readback.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,rows:rows.map(({images,...r})=>({...r,images:images.length})),pixels:undefined},null,1));
