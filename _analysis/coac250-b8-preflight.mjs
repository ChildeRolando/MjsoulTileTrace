// Deterministic verification only. Never dispatch production or review calls.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root='E:/AgentData/Coach/knowledge/processing',repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach',dir='_analysis/coac250-b8';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const handoffBytes=await readFile(dir+'/coac249-incremental-269-b8-20261027.json'),h=JSON.parse(handoffBytes);
assert.equal(sha(handoffBytes),'255873f8301188c7f9e1e8204cc28ef2776f52f0a2b0cf1a964c66e862431ce8');
const testSource=(await readFile(dir+'/transport-diag-test.mjs','utf8'))
 .replace("ROOT+'web-b8-transport-diag-20261027/textbook-audit.mjs'",JSON.stringify(repo+'/scripts/scene-study/textbook-audit.mjs'))
 .replace("ROOT+'web-b8-transport-diag-20261027/textbook-production-cli.mjs'",JSON.stringify(repo+'/scripts/scene-study/textbook-production-cli.mjs'));
await writeFile(dir+'/transport-diag-test-live.mjs',testSource);
const test=spawnSync(process.execPath,[dir+'/transport-diag-test-live.mjs'],{encoding:'utf8',windowsHide:true});
await writeFile(dir+'/transport-diag-test-live.json',test.stdout);assert.equal(test.status,0,test.stderr);
const {verifyAuditForWebCandidate}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-web.mjs'));
const {verifyVerificationDependencyManifest}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-verification-dependencies.mjs'));
const priorBytes=await readFile(root+'/integration/accepted-preview-current.json'),prior=JSON.parse(priorBytes),items=[],protectedFiles=[];
async function bound(path,expected){const bytes=await readFile(path);assert.equal(sha(bytes),expected,path);protectedFiles.push({path,sha256:expected});return JSON.parse(bytes);}
async function snapshot(ref){const s=await bound(join(root,ref.path),ref.sha256);assert.equal(sha(Buffer.concat(s.files.map(f=>Buffer.from(f.content)))),ref.combinedSha256);for(const f of s.files)assert.equal(sha(f.content),f.sha256);return {path:ref.path,combinedSha256:ref.combinedSha256};}
for(const origin of [...h.origin.handoffs,...h.origin.explicitTargets])await bound(join(root,origin.path),origin.sha256);
for(const c of h.chapters){
 const candidate=await bound(join(root,c.candidatePath),c.candidateSha256),source=await bound(join(root,c.sourcePath),c.sourceSha256),parent=await bound(join(root,c.parentPath),c.parentSha256),parentAudit=await bound(join(root,c.parentAuditPath),c.parentAuditSha256),audit=await bound(join(root,c.auditPath),c.auditSha256),failed=await bound(join(root,c.originalFailedAuditPath),c.originalFailedAuditSha256),att=await bound(dir+'/'+c.attestation.file,c.attestation.sha256);
 assert.equal(candidate.source.sourceSha256,c.sourceSha256);assert.equal(candidate.source.articleId,c.articleId);assert.equal(audit.production.sha256,c.candidateSha256);assert.equal(audit.source.sourceSha256,c.sourceSha256);
 assert.equal(candidate.source.mainSha256,source.main.sha256);assert.equal(candidate.source.htmlSha256,source.html.sha256);
 const rev=candidate.provenance.revision;assert.equal(rev.parentSha256,c.parentSha256);assert.equal(rev.notesSha256,c.parentAuditSha256);assert.equal(parentAudit.status,'needs-repair');assert.equal(parentAudit.production.sha256,c.parentSha256);
 assert.equal(audit.status,'passed-after-transport-recovery');assert.equal(failed.status,'failed');assert.equal(audit.transportRecovery.originalAudit.sha256,c.originalFailedAuditSha256);
 assert.deepEqual(candidate.body,parent.body);assert.deepEqual(candidate.figures.map(f=>f.figureId),parent.figures.map(f=>f.figureId));
 const withoutDerived=({presentationAsset,...rest})=>rest;
 const other=candidate.figures.filter(f=>f.figureId!==c.targetFigureId);assert.deepEqual(other.map(withoutDerived),parent.figures.filter(f=>f.figureId!==c.targetFigureId).map(withoutDerived));
 const target=candidate.figures.find(f=>f.figureId===c.targetFigureId),targetParent=parent.figures.find(f=>f.figureId===c.targetFigureId);assert.deepEqual(target.sourceAssetBindings,targetParent.sourceAssetBindings);assert.notEqual(target.transcription,targetParent.transcription);
 for(const f of candidate.figures)for(const asset of f.sourceAssetBindings){const b=await readFile(join(root,asset.path));assert.equal(sha(b),asset.sha256);}
 const aSnap=await snapshot(audit.auditor),recoverySnap=await snapshot(audit.transportRecovery.verifier);assert.equal(aSnap.combinedSha256,c.auditorSnapshotSha256);
 assert.equal(att.manifest.manifestSha256,h.runtime.manifestSha256);assert.equal(att.receipt.sha256,c.auditSha256);assert.equal(att.receipt.path,c.auditPath);
 const mv=await verifyVerificationDependencyManifest({baseDir:att.base,manifest:att.manifest,root});assert.equal(mv.ok,true);
 const raw=await bound(audit.transportRecovery.originalCall.path,audit.transportRecovery.originalCall.sha256);assert.deepEqual(JSON.parse(raw.rawLastMessage),audit.modelReview);assert.deepEqual(raw.usage,audit.calls[0].usage);assert.equal(raw.events.at(-1).type,'turn.completed');
 for(const call of att.originalModelCalls)await bound(join(root,call.path),call.sha256);
 assert.equal(audit.modelChecks.passed,true);assert.equal(audit.deterministicChecks.passed,true);assert.equal(audit.semanticCompleteness.complete,true);
 const gate=await verifyAuditForWebCandidate(root,join(root,c.candidatePath));assert.equal(gate.status,audit.status);assert.equal(sha(await readFile(gate.auditPath)),c.auditSha256);
 const canon=n=>{let v=n.replace(/\.json$/,'');for(;;){const w=v.replace(/\.(?:display|coac269rev\d+|rev\d+|r\d+)$/,'');if(v===w)return v;v=w;}};
 const versions=[];
 for(const n of (await readdir(root+'/web-production/v1/candidates/79-bilibili-cn')).filter(n=>canon(n)===c.articleId)){
  const digest=sha(await readFile(root+'/web-production/v1/candidates/79-bilibili-cn/'+n));
  const auditDir=root+'/audit/web/articles/79-bilibili-cn',base=c.articleId+'.'+digest;
  let effective=null;
  try{let bytes=await readFile(auditDir+'/'+base+'.json');effective={path:auditDir+'/'+base+'.json',sha256:sha(bytes),receipt:JSON.parse(bytes)};}catch(e){if(e.code!=='ENOENT')throw e;}
  if(effective){
   for(const fn of (await readdir(auditDir)).filter(n=>n.startsWith(base+'.retry-')&&n.endsWith('.json')&&!n.endsWith('.transport-recovery.json')).sort()){
    const bytes=await readFile(auditDir+'/'+fn),r=JSON.parse(bytes);
    if(effective.receipt.status==='failed'&&r.retryOfAudit?.sha256===effective.sha256)effective={path:auditDir+'/'+fn,sha256:sha(bytes),receipt:r};
   }
   if(effective.receipt.status==='failed')try{const bytes=await readFile(effective.path.replace(/\.json$/,'.transport-recovery.json')),r=JSON.parse(bytes);assert.equal(r.transportRecovery.originalAudit.sha256,effective.sha256);effective={path:effective.path.replace(/\.json$/,'.transport-recovery.json'),sha256:sha(bytes),receipt:r};}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  versions.push({file:n,sha256:digest,status:effective?.receipt.status??'none',recordedAt:effective?.receipt.recordedAt??null});
 }
 const passed=versions.filter(v=>v.status.startsWith('passed')).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));assert.equal(passed[0].sha256,c.candidateSha256);
 assert.equal(prior.selectedWeb.some(s=>s.candidateSha256===c.candidateSha256),false);
 const chapterId='79-bilibili-cn-'+c.articleId+'-chapter';assert.equal(prior.selectedWeb.some(s=>s.chapterIds.includes(chapterId)),false);
 items.push({...c,previewChapterId:chapterId,gate:{status:gate.status,auditPath:gate.auditPath},manifestVerified:mv.ok,auditor:aSnap,recoveryVerifier:recoverySnap,versions,
  bodyUnchanged:true,nonTargetFigureSubstanceUnchanged:other.length,derivedPresentationOnlyDifferences:other.filter(f=>JSON.stringify(f)!==JSON.stringify(parent.figures.find(p=>p.figureId===f.figureId))).length,retainedNote:{figureId:c.targetFigureId,parentCaption:targetParent.caption,candidateCaption:target.caption,parentSourceNotes:targetParent.sourceNotes??null,candidateSourceNotes:target.sourceNotes??null,parentSha256:c.parentSha256,candidateSha256:c.candidateSha256,decision:c.articleId==='cv1734739'?'Keep reviewed caption bytes including missing full stop.':'Keep reviewed caption; retain parent duplicate-image accounting note in provenance sidecar; bindings unchanged.'}});
}
const lockFiles=(await readdir(root+'/integration')).filter(n=>/(?:\.lock(?:\.json)?|selection.*lock)$/.test(n));assert.deepEqual(lockFiles,[],'no previous writer or selection lock');
let oldPidAlive=false;try{process.kill(38348,0);oldPidAlive=true;}catch(e){if(e.code!=='ESRCH')throw e;}assert.equal(oldPidAlive,false);
const result={schema:'coac250-b8-preconsume/1',recordedAt:new Date().toISOString(),handoff:{commit:'438bdd83ca6b227d98fd64732fe3e0fb4a27d820',sha256:sha(handoffBytes)},prior:{output:prior.output,sha256:sha(priorBytes),chapters:prior.chapters,units:prior.units,blocks:prior.blocks,figures:prior.figures},locks:{oldPid:38348,oldPidAlive,lockFiles},items,protectedFiles,modelCalls:0,productionCalls:0,allPassed:true};
await writeFile(dir+'/preconsume.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({allPassed:true,prior:result.prior,items:items.map(i=>({chapter:i.chapterId,gate:i.gate,versions:i.versions,retainedNote:i.retainedNote})),modelCalls:0},null,1));
