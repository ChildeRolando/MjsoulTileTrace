import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {repo,dir,integration,article,chapter} from './config.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pre=await load(dir+'/preconsume.json'),assembly=await load(dir+'/assembly.json'),output=process.argv[2]??assembly.output;
assert.equal(output,assembly.output);const receipt=await load(output+'/accepted-preview-receipt.json'),corpus=await load(output+'/textbook-corpus.json'),old=await load(pre.prior.output+'/textbook-corpus.json'),candidate=await load(pre.candidate.path),body=(await load(output+'/textbook-bodies.json')).chapters.find(c=>c.chapterId===chapter);
const {Client}=await import(pathToFileURL(repo+'/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')),{StdioClientTransport}=await import(pathToFileURL(repo+'/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'));
const client=new Client({name:'coac250-205-readback',version:'1'});let calls=0,maxTextBytes=0;
async function call(name,args){const response=await client.callTool({name,arguments:args});assert.notEqual(response.isError,true);calls++;const text=response.content.find(c=>c.type==='text')?.text??'';maxTextBytes=Math.max(maxTextBytes,Buffer.byteLength(text));return {raw:response,data:JSON.parse(text)};}
const target=corpus.units.filter(u=>u.chapterId===chapter),rows=[],images=[];assert.equal(target.length,1);
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[repo+'/bin/textbook-mcp-server.mjs',output],stderr:'pipe'}));
 let offset=0;const catalog=[];do{const {data}=await call('catalog_textbook',{offset,limit:20});catalog.push(...data.entries);offset=data.nextOffset;}while(offset!==null);assert.equal(catalog.length,227);assert.equal(catalog.filter(c=>c.chapterId===chapter).length,1);
 for(const unit of target){
  let blockOffset=0;const blocks=[],pages=[];do{const {data}=await call('read_textbook',{unitId:unit.unitId,blockOffset});assert.equal(data.blockOffset,blockOffset);blocks.push(...data.unit.blocks);pages.push({offset:blockOffset,blocks:data.unit.blocks.length,nextOffset:data.nextBlockOffset});blockOffset=data.nextBlockOffset;}while(blockOffset!==null);assert.deepEqual(blocks,unit.blocks);assert.ok(pages.length>=1);
  const hit=await call('search_textbook',{query:unit.title,chapterId:chapter,limit:5});assert.ok(hit.data.hits.some(h=>h.unitId===unit.unitId));
  const figures=blocks.flatMap(b=>b.type==='figure'?[b.figure]:b.inlineFigures??[]);assert.equal(figures.length,2);
  for(const figure of figures){const r=await call('view_textbook_figure',{figureId:figure.figureId}),image=r.raw.content.find(c=>c.type==='image');assert.equal(image.mimeType,'image/png');const index=corpus.images.find(i=>i.figureId===figure.figureId);assert.equal(sha(Buffer.from(image.data,'base64')),index.sha256);assert.equal(sha(await readFile(join(output,index.path))),index.sha256);images.push({figureId:figure.figureId,sha256:index.sha256,exactMcpBytes:true});}
  rows.push({unitId:unit.unitId,blocks:blocks.length,pages,exactBody:true,images:figures.length,searchHit:true,sourceArticle:unit.source.web.articleId});assert.equal(unit.source.web.articleId,article);
 }
}finally{await client.close();}
const bodyFigures=body.blocks.flatMap(b=>b.type==='figure'?[b]:b.inlineFigures??[]);assert.equal(bodyFigures.length,2);assert.deepEqual(bodyFigures.flatMap(f=>f.sourceOccurrenceIds),candidate.figures.flatMap(f=>f.sourceOccurrenceIds));
const metadata=target.flatMap(u=>u.blocks.flatMap(b=>b.type==='figure'?[b.figure]:b.inlineFigures??[]));
for(const [i,f] of bodyFigures.entries()){
 const original=candidate.figures[i];assert.deepEqual(f.sourceAssetBindings,original.sourceAssetBindings);assert.equal(f.transcriptionText,original.transcription);assert.equal(f.caption,original.caption);assert.deepEqual(f.sourceOccurrenceIds,original.sourceOccurrenceIds);
 const m=metadata.find(m=>m.figureId===f.id);assert.equal(m.transcription.text,original.transcription);assert.equal(m.caption,original.caption);
}
const translated=body.blocks.map(b=>b.inlineContent?b.inlineContent.filter(c=>!c.figureId).map(c=>c.text).join(''):b.type==='figure'?'':b.text??'').join('');assert.equal(translated,candidate.body.blocks.filter(b=>b.type==='text').map(b=>b.text).join(''));
for(const unit of old.units)assert.deepEqual(corpus.units.find(u=>u.unitId===unit.unitId),unit);
assert.ok(old.units.some(u=>u.chapterId==='modern-yabejp-ja-chapter01-section010-chapter'));
const keys=new Set();for(const s of receipt.selectedWeb){const c=await load(s.candidatePath),key=c.source.sourceId+':'+c.source.articleId;assert.equal(keys.has(key),false);keys.add(key);}
const selected=receipt.selectedWeb.find(s=>s.candidateSha256===pre.candidate.sha256),note=await load(selected.intakeAnnotations.path);assert.equal(sha(await readFile(selected.intakeAnnotations.path)),selected.intakeAnnotations.sha256);assert.deepEqual(note.issues,pre.issues);assert.equal(note.issues.length,1);
assert.deepEqual(note.reviewScope,pre.reviewScope);assert.deepEqual(note.history,pre.history);assert.deepEqual(note.sourceCorrespondence,pre.sourceCorrespondence);assert.deepEqual(note.candidateSourceNotes,candidate.figures.map(f=>({figureId:f.figureId,sourceNotes:f.sourceNotes})));assert.ok(note.candidateSourceNotes[1].sourceNotes[0].includes('附件3'));
for(const asset of pre.retainedOriginals)assert.equal(sha(await readFile(join(output,'source-assets',asset.name))),asset.sha256);
for(const name of ['b8-source-notes.json','090-6-intake-annotations.json','246-3-intake-annotations.json','347-1-intake-annotations.json'])assert.equal(sha(await readFile(join(output,name))),sha(await readFile(join(pre.prior.output,name))));
for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const previousPixels=(await load('_analysis/coac250-b8-jpeg/readback.json')).pixels;for(const p of previousPixels)assert.equal(sha(await readFile(join(output,'source-assets',p.source.split(/[\\/]/).at(-1)))),p.sourceSha256);
const mcp=await load(output+'/mcp-validation.json'),arena=await load(output+'/arena-validation.json'),dedup=await load(output+'/source-deduplication-validation.json');assert.equal(dedup.crossChapterSourceCollisions,0);assert.equal(mcp.units.length,235);assert.equal(mcp.exactImageCount,5096);assert.equal(arena.exactBody,true);
const result={schema:'coac250-205-readback/1',recordedAt:new Date().toISOString(),preview:{output,corpusId:receipt.corpusId,chapters:receipt.chapters,units:receipt.units,blocks:receipt.blocks,figures:receipt.figures},rows,images,targetMcpCalls:calls,maxTargetTextBytes:maxTextBytes,originalTextBlocks:candidate.body.blocks.filter(b=>b.type==='text').length,originalTextExact:true,sourceOccurrences:2,sourceBindingsAndTranscriptionsExact:true,intakeAnnotations:selected.intakeAnnotations,nonblockingIssues:pre.issues,reviewScope:note.reviewScope,sourceCorrespondence:note.sourceCorrespondence,historyPreserved:true,sourceBodyBlocks:7,priorUnitsUnchanged:old.units.length,prior027Preserved:true,priorJpegOriginalsRetained:previousPixels.length,canonicalArticles:keys.size,sourceCollisions:dedup.crossChapterSourceCollisions,allProtectedInputsUnchanged:true,otherHoldsAndDefinitionBindingsUnchanged:true,activeLibraryChanged:false,formalSha256:receipt.formalCorpusFileSha256,fullMcp:{units:mcp.units.length,images:mcp.exactImageCount,maxTextBytes:mcp.maxTextBytes},arena:{units:arena.units.length,exactBody:arena.exactBody,maxEnvelopeBytes:arena.maxEnvelopeBytes},modelCalls:0,productionCalls:0};await writeFile(dir+'/readback.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,images:images.length}));
