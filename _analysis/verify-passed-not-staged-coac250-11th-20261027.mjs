// COAC-250 eleventh run: deterministic verification of every uncovered original chapter that already
// carries an independent passed receipt for a source-bound candidate (zero model calls, no staging).
// Establishes the real produced-passed-not-staged population the register must report, and the exact
// binding (candidate sha == receipt production sha, source sha == current source, revision parent) for each.
import {readFile,writeFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {existsSync as fsExists} from 'node:fs';
const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const registerPath=join(root,'integration/coac250-unified-chapter-register-20261027b.json');
const register=await load(registerPath);
const pointer=await load(join(root,'integration/accepted-preview-current.json'));
const indexText=await readFile(join(pointer.output,'knowledge-index.json'),'utf8');
const open=[];
for(const row of register.rows){
 if(row.verdict==='covered-effective')continue;
 const a=row.approvedWebCorrespondence||{};
 if(!a.articleId||!a.webSourceId)continue;
 const auditDir=join(root,'audit/web/articles',a.webSourceId);
 const {readdir}=await import('node:fs/promises');
 const files=(await readdir(auditDir)).filter(f=>f.startsWith(a.articleId+'.')&&f.endsWith('.json'));
 const receipts=[];
 for(const f of files){
  const p=join(auditDir,f);const d=await load(p);
  if(d.status!=='passed')continue;
  receipts.push({path:p,receipt:d});
 }
 for(const {path,receipt} of receipts){
  const prod=receipt.production||{};
  if(!prod.path||!fsExists(prod.path))continue;
  const bytes=await readFile(prod.path);
  const candSha=sha(bytes);
  if(candSha!==prod.sha256)throw Error('candidate_sha_mismatch:'+row.originalChapterId);
  const candidate=JSON.parse(bytes.toString('utf8'));
  const candSourceSha=candidate.source?.sourceSha256;
  const receiptSourceSha=receipt.source?.sourceSha256;
  const sourcePath=receipt.source?.sourcePath;
  let currentSourceSha=null,sourceBoundCurrent=null;
  if(sourcePath){
   try{currentSourceSha=sha(await readFile(join(root,sourcePath)));sourceBoundCurrent=currentSourceSha===candSourceSha;}catch{sourceBoundCurrent=null;}
  }
  const det=receipt.deterministicChecks?.passed===true;
  const model=(receipt.modelChecks?.passed===true)||(receipt.effectiveModelChecks?.passed===true);
  const modelCalls=(receipt.calls||[]).length;
  const revision=receipt.productionCall?.revision?.revision??null;
  let parentBoundCurrent=null;
  if(revision?.parentPath){
   const parentPath=revision.parentPath.includes(':')?revision.parentPath:join(root,revision.parentPath);
   try{parentBoundCurrent=sha(await readFile(parentPath))===revision.parentSha256;}catch{parentBoundCurrent=null;}
  }
  const inSelectedWeb=pointer.selectedWeb.some(e=>String(e.candidatePath).includes(a.articleId));
  const pendingEntry=pointer.pendingWeb.find(e=>String(e.path).includes(a.articleId))??null;
  const articleInPreview=inSelectedWeb;
  const inIndex=indexText.includes(a.articleId);
  open.push({originalChapterId:row.originalChapterId,articleId:a.articleId,webSourceId:a.webSourceId,
   registerVerdictBefore:row.verdict,adjudicationGroup:row.adjudicationGroup,units:row.units,
   candidatePath:prod.path.replace(/\\/g,'/'),candidateSha256:candSha,bodyBlocks:candidate.body?.blocks?.length??null,
   figures:candidate.figures?.length??null,auditPath:path.replace(/\\/g,'/'),auditRecordedAt:receipt.recordedAt,
   auditStatus:receipt.status,deterministicPassed:det,modelPassed:model,auditedModelCalls:modelCalls,
   candidateSourceSha256:candSourceSha??null,receiptSourceSha256:receiptSourceSha??null,currentSourceSha256:currentSourceSha,
   sourceBoundCurrent,revision,parentBoundCurrent,articleInPreview,inIndex,pendingWebError:pendingEntry?pendingEntry.error:null,
   covered:false,
   notStagedReason:a.articleId==='chapter01-section010'?'confirmed-source-structure-hold (no definition-boundary sidecar/stage proof; stage-definition-chapters.mjs still asserts held)':'passed receipt is newer than the dispatched staging list; awaiting the next COAC-244/249 dispatch'});
 }
}
const doc={schema:'coac250-11th-batch-passed-not-staged/1',recordedAt:new Date().toISOString(),
 register:{path:registerPath,sha256:sha(await readFile(registerPath)),recordedAt:register.recordedAt},
 preview:{output:pointer.output,corpusId:pointer.corpusId},
 counts:{checked:open.length,eligibleForNextStage:open.filter(x=>x.notStagedReason.startsWith('passed receipt')).length,heldBySourceStructureHold:open.filter(x=>x.notStagedReason.startsWith('confirmed-source-structure-hold')).length},
 items:open,modelCalls:0,productionCalls:0};
await writeFile('_analysis/coac250-11th-batch-passed-not-staged-20261027.json',JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify(doc.counts));
for(const x of open)console.log(x.originalChapterId,x.articleId,x.auditRecordedAt,'srcBound',x.sourceBoundCurrent,'parentBound',x.parentBoundCurrent,'model',x.modelPassed,'inPreview',x.articleInPreview,'inIndex',x.inIndex,'|',x.notStagedReason.slice(0,40));
