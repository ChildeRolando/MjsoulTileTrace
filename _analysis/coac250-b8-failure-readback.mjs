// Read-only failure receipt. No pointer publication or modification of the reviewed candidates.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',dir='_analysis/coac250-b8';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pre=await load(dir+'/preconsume.json'),failure=await load(dir+'/assembly-failure.json');
const pointerBytes=await readFile(root+'/integration/accepted-preview-current.json'),pointer=JSON.parse(pointerBytes);assert.equal(sha(pointerBytes),pre.prior.sha256);
const candidates=[];
for(const i of pre.items){
 const c=await load(join(root,i.candidatePath)),images=[];
 for(const f of c.figures){const asset=f.presentationAsset??(f.sourceAssetBindings.length===1?f.sourceAssetBindings[0]:null);assert.ok(asset);const bytes=await readFile(join(root,asset.path));images.push({figureId:f.figureId,path:asset.path,expectedSha256:asset.sha256,actualSha256:sha(bytes),shaMatches:sha(bytes)===asset.sha256,signatureHex:bytes.subarray(0,8).toString('hex'),isPng:bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),isJpeg:bytes[0]===255&&bytes[1]===216&&bytes[2]===255});}
 candidates.push({chapterId:i.chapterId,candidateSha256:sha(await readFile(join(root,i.candidatePath))),candidateUnchanged:sha(await readFile(join(root,i.candidatePath)))===i.candidateSha256,gate:i.gate,images});
}
for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const outputs=(await readdir(root+'/integration')).filter(n=>n.startsWith('accepted-content-preview-')&&n>'accepted-content-preview-2026-10-27T14-00');
const isolatedStages=[];
for(const output of outputs){const path=root+'/integration/'+output+'/stages/79-bilibili-cn-cv1734739/web-stage-receipt.json';try{const r=await load(path);isolatedStages.push({output:root+'/integration/'+output,path,sha256:sha(await readFile(path)),auditStatus:r.auditStatus,blocks:r.blocks,figures:r.figures,published:false});}catch(e){if(e.code!=='ENOENT')throw e;}}
let lockExists=true;try{await access(root+'/integration/accepted-consumer.lock');}catch(e){if(e.code!=='ENOENT')throw e;lockExists=false;}assert.equal(lockExists,false);
const formalSha=sha(await readFile(pointer.formalCorpusPath));assert.equal(formalSha,pointer.formalCorpusFileSha256);
const v12=await readFile(root+'/integration/specific-web-variant-selection.v12.json');assert.equal(sha(v12),'943b47ee06a8e61cf219995ca860cc2bc3e681ea020d30c4f80bbabc119ea92c');
let v13Created=true;try{await access(root+'/integration/specific-web-variant-selection.v13.json');}catch(e){if(e.code!=='ENOENT')throw e;v13Created=false;}assert.equal(v13Created,false);
const out={schema:'coac250-b8-bounded-stage-failure/1',recordedAt:new Date().toISOString(),status:'blocked-before-publication',failure,
 cause:'stage-web-textbook.mjs:106 requires a PNG signature even when a source-bound single-image JPEG passes SHA verification. The b8 revision omits parent-derived presentationAsset fields; current inheritance runs only for multi-asset figures. No candidate or image was rewritten to bypass this guard.',
 candidates,isolatedStages,readback:{pointerSha256:sha(pointerBytes),pointerUnchanged:true,preview:pointer.output,chapters:pointer.chapters,units:pointer.units,blocks:pointer.blocks,figures:pointer.figures,formalSha256:formalSha,activeLibraryChanged:false,selectionVersion:'v12',selectionUnchanged:true,v13Created,consumerLockReleased:!lockExists,protectedInputFilesUnchanged:pre.protectedFiles.length},
 completed:['Exact approved diagnostic synced to active audit helper; 11 mechanical cases pass.','Both original review recoveries reverify against actual raw bytes and frozen dependency manifest 56287cda.','Both current canonical effective candidates selected without any new audit.','128-14 isolated stage completed, but neither chapter was published.'],
 remaining:'At the next authorized stage, preserve candidate and source bytes; adapt the existing stage to inherit hash/pixel-verified parent PNG presentation for unchanged image bindings or deterministically decode JPEG as a derived presentation. Then finish both chapters and actual MCP/Arena/canonical readback before pointer publication. Do not remake/review the candidates.',
 newModelCalls:0,newProductionCalls:0,newAuditCalls:0,newModelTokens:0,priorOriginalAudits:pre.items.map(i=>({chapterId:i.chapterId,callId:i.auditCallId,usage:i.auditUsage,reauditModelCalls:0})),priorOriginalCallsRepriced:false};
await writeFile(dir+'/failure-readback.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({failure:out.failure.message,jpegBlockers:candidates.flatMap(c=>c.images.filter(i=>!i.isPng).map(i=>({chapter:c.chapterId,...i}))),isolatedStages,readback:out.readback,modelCalls:0},null,1));
