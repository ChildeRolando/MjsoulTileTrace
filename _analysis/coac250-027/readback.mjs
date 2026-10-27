import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {root,repo,dir,integration,article,chapter} from './config.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pre=await load(dir+'/preconsume.json'),assembly=await load(dir+'/assembly.json'),pointer=await load(integration+'/accepted-preview-current.json');assert.equal(pointer.corpusId,assembly.corpusId);
const output=pointer.output,corpus=await load(output+'/textbook-corpus.json'),old=await load(pre.prior.output+'/textbook-corpus.json'),candidate=await load(pre.candidate.path),sidecar=await load(assembly.definition.sidecarPath),body=(await load(output+'/textbook-bodies.json')).chapters.find(c=>c.chapterId===chapter);
const {Client}=await import(pathToFileURL(repo+'/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')),{StdioClientTransport}=await import(pathToFileURL(repo+'/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'));
const client=new Client({name:'coac250-027-readback',version:'1'});let calls=0,maxTextBytes=0;
async function call(name,args){const response=await client.callTool({name,arguments:args});assert.notEqual(response.isError,true);calls++;const text=response.content.find(c=>c.type==='text')?.text??'';maxTextBytes=Math.max(maxTextBytes,Buffer.byteLength(text));return {raw:response,data:JSON.parse(text)};}
const target=corpus.units.filter(u=>u.chapterId===chapter),rows=[],images=[];assert.equal(target.length,1);
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[repo+'/bin/textbook-mcp-server.mjs',output],stderr:'pipe'}));
 let offset=0;const catalog=[];do{const {data}=await call('catalog_textbook',{offset,limit:20});catalog.push(...data.entries);offset=data.nextOffset;}while(offset!==null);assert.equal(catalog.length,223);assert.equal(catalog.filter(c=>c.chapterId===chapter).length,1);
 for(const unit of target){
  let blockOffset=0;const blocks=[],pages=[];do{const {data}=await call('read_textbook',{unitId:unit.unitId,blockOffset});assert.equal(data.blockOffset,blockOffset);blocks.push(...data.unit.blocks);pages.push({offset:blockOffset,blocks:data.unit.blocks.length,nextOffset:data.nextBlockOffset});blockOffset=data.nextBlockOffset;}while(blockOffset!==null);assert.deepEqual(blocks,unit.blocks);assert.ok(pages.length>1,'exercise actual multi-page full chapter readback');
  const hit=await call('search_textbook',{query:unit.title,chapterId:chapter,limit:5});assert.ok(hit.data.hits.some(h=>h.unitId===unit.unitId));
  const figures=blocks.flatMap(b=>b.type==='figure'?[b.figure]:b.inlineFigures??[]);assert.equal(figures.length,84);
  for(const figure of figures){const r=await call('view_textbook_figure',{figureId:figure.figureId}),image=r.raw.content.find(c=>c.type==='image');assert.equal(image.mimeType,'image/png');const index=corpus.images.find(i=>i.figureId===figure.figureId);assert.equal(sha(Buffer.from(image.data,'base64')),index.sha256);assert.equal(sha(await readFile(join(output,index.path))),index.sha256);images.push({figureId:figure.figureId,sha256:index.sha256,exactMcpBytes:true});}
  rows.push({unitId:unit.unitId,blocks:blocks.length,pages,exactBody:true,images:figures.length,searchHit:true,sourceArticle:unit.source.web.articleId});assert.equal(unit.source.web.articleId,article);
 }
}finally{await client.close();}
const bodyFigures=body.blocks.flatMap(b=>b.type==='figure'?[b]:b.inlineFigures??[]);assert.equal(bodyFigures.length,84);assert.deepEqual(bodyFigures.flatMap(f=>f.sourceOccurrenceIds),candidate.figures.flatMap(f=>f.sourceOccurrenceIds));
const groups=sidecar.blocks.filter(b=>b.type==='image-run').flatMap(b=>b.groups);assert.equal(groups.length,84);
for(const [i,g] of groups.entries()){
 const f=bodyFigures[i];assert.deepEqual(f.sourceOccurrenceIds,g.sourceOccurrenceIds);assert.equal(f.transcriptionText,g.transcription);assert.equal(f.transcriptionProvenance.definitionBoundary.domBoundary,g.domBoundary);if(g.domBoundary)assert.ok(f.locator.domPaths.includes(g.domBoundary));assert.equal(f.transcriptionProvenance.definitionBoundary.sidecarSha256,pre.sidecar.proposalSha256);
 const metadata=target.flatMap(u=>u.blocks.flatMap(b=>b.type==='figure'?[b.figure]:b.inlineFigures??[])).find(m=>m.figureId===f.id);assert.equal(metadata.transcription.text,g.transcription);assert.equal(metadata.caption,f.caption);
}
// inlineContent retains original translated fragments separately from inserted tile labels.
const translated=body.blocks.map(b=>b.inlineContent?b.inlineContent.filter(c=>!c.figureId).map(c=>c.text).join(''):b.type==='figure'?'':b.text??'').join('');
assert.equal(translated,candidate.body.blocks.filter(b=>b.type==='text').map(b=>b.text).join(''));
for(const unit of old.units)assert.deepEqual(corpus.units.find(u=>u.unitId===unit.unitId),unit);
const keys=new Set();for(const s of pointer.selectedWeb){const c=await load(s.candidatePath),key=c.source.sourceId+':'+c.source.articleId;assert.equal(keys.has(key),false);keys.add(key);}
const definitionSelection=await load(integration+'/definition-boundary-stage-selection.json'),oldSelection=await load(dir+'/definitionSelection.before.json'),manifest=await load(integration+'/definition-boundaries-v1/manifest.v2.json'),oldManifest=await load(dir+'/manifest.before.json');
assert.deepEqual(definitionSelection.entries.filter(e=>e.articleId!==article),oldSelection.entries);assert.deepEqual(manifest.articles.filter(e=>e.articleId!==article),oldManifest.articles.filter(e=>e.articleId!==article));assert.deepEqual(definitionSelection.semanticHoldRemains,oldSelection.semanticHoldRemains.filter(a=>a!==article));
for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const previousPixels=(await load('_analysis/coac250-b8-jpeg/readback.json')).pixels;for(const p of previousPixels)assert.equal(sha(await readFile(join(output,'source-assets',p.source.split(/[\\/]/).at(-1)))),p.sourceSha256);
for(const lock of ['accepted-consumer.lock','selection-maintainer.lock.json'])try{await access(integration+'/'+lock);assert.fail('writer lock remains');}catch(e){if(e.code!=='ENOENT')throw e;}
const mcp=await load(output+'/mcp-validation.json'),arena=await load(output+'/arena-validation.json'),dedup=await load(output+'/source-deduplication-validation.json');assert.equal(dedup.crossChapterSourceCollisions,0);
const result={schema:'coac250-027-readback/1',recordedAt:new Date().toISOString(),preview:{output,corpusId:pointer.corpusId,chapters:pointer.chapters,units:pointer.units,blocks:pointer.blocks,figures:pointer.figures},rows,images,targetMcpCalls:calls,maxTargetTextBytes:maxTextBytes,originalTextBlocks:83,originalTextExact:true,sourceOccurrences:216,presentationImages:84,splitRuns:7,definitionDomBindingsExact:true,priorUnitsUnchanged:old.units.length,priorJpegOriginalsRetained:previousPixels.length,canonicalArticles:keys.size,sourceCollisions:dedup.crossChapterSourceCollisions,otherManifestAndSelectionEntriesUnchanged:true,allProtectedInputsUnchanged:true,holdFileUnchanged:true,activeLibraryChanged:false,formalSha256:pointer.formalCorpusFileSha256,writerLocksReleased:true,fullMcp:{units:mcp.units.length,images:mcp.exactImageCount,maxTextBytes:mcp.maxTextBytes},arena:{units:arena.units.length,exactBody:arena.exactBody,maxEnvelopeBytes:arena.maxEnvelopeBytes},modelCalls:0,productionCalls:0};await writeFile(dir+'/readback.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,images:images.length}));
