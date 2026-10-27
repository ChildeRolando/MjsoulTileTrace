// Read-only intake verification. No production or audit dispatch.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {root,repo,dir,integration,article,original,chapter} from './config.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8')),resolve=p=>isAbsolute(p)?p:join(root,p);
const protectedFiles=[];
async function protect(path,expected){const bytes=await readFile(resolve(path)),digest=sha(bytes);if(expected)assert.equal(digest,expected,path);protectedFiles.push({path:resolve(path),sha256:digest});return bytes;}
async function bound(path,expected){return JSON.parse(await protect(path,expected));}
const handoffPath=integration+'/coac249-reviewed-090-6-20261027.json',handoffSha='f2fdf82f135bbfd18d9aa0969fd30821614a4e109a651f45d801f66749f23a24',handoff=await bound(handoffPath,handoffSha);await writeFile(dir+'/handoff.json',await readFile(handoffPath));
assert.equal(handoff.batchSize,1);assert.equal(handoff.modelCalls,0);const c=handoff.chapters[0];assert.equal(c.chapterId,original);assert.equal(c.articleId,article);
const candidate=await bound(c.candidatePath,c.candidateSha256),source=await bound(c.sourcePath,c.sourceSha256),parent=await bound(c.parentPath,c.parentSha256),parentAudit=await bound(c.parentAuditPath,c.parentAuditSha256),audit=await bound(c.auditPath,c.auditSha256),raw=await bound(c.auditRaw.path,c.auditRaw.sha256);
assert.equal(candidate.source.sourceSha256,c.sourceSha256);assert.equal(candidate.source.articleId,article);assert.equal(candidate.source.mainSha256,source.main.sha256);assert.equal(candidate.source.htmlSha256,source.html.sha256);
await protect('web-sources/v1/'+source.main.path,source.main.sha256);await protect('web-sources/v1/'+source.html.path,source.html.sha256);
assert.equal(candidate.provenance.revision.parentSha256,c.parentSha256);assert.equal(candidate.provenance.revision.notesSha256,c.parentAuditSha256);assert.equal(parentAudit.status,'needs-repair');assert.equal(parentAudit.production.sha256,c.parentSha256);assert.deepEqual(candidate.body,parent.body);
assert.equal(audit.production.sha256,c.candidateSha256);assert.equal(audit.source.sourceSha256,c.sourceSha256);assert.equal(audit.status,'passed');assert.equal(audit.method,c.auditMethod);assert.equal(audit.modelChecks.passed,true);assert.equal(audit.deterministicChecks.passed,true);assert.equal(audit.semanticCompleteness.complete,true);
assert.equal(audit.calls.length,1);assert.equal(audit.calls[0].callId,c.auditCallId);assert.equal(raw.callId,c.auditCallId);assert.equal(raw.success,true);assert.equal(raw.exitCode,0);assert.equal(raw.timedOut,false);assert.equal(raw.outputOverflow,false);assert.equal(raw.events.at(-1).type,'turn.completed');assert.deepEqual(JSON.parse(raw.rawLastMessage),audit.modelReview);assert.deepEqual(raw.usage,c.auditUsage);assert.deepEqual(raw.binding,audit.calls[0].binding);assert.equal(raw.binding.productionSha256,c.candidateSha256);assert.equal(raw.binding.sourceFileSha256,c.sourceSha256);
assert.deepEqual(audit.modelReview.issues,c.issues);assert.equal(c.issues.length,3);assert.ok(c.issues.every(i=>i.severity==='source-note'));assert.equal(audit.modelReview.blockChecks.length,15);assert.equal(audit.modelReview.figureChecks.length,6);assert.equal(audit.modelReview.imageChecks.length,6);
const snapshot=await bound(audit.auditor.path,audit.auditor.sha256);for(const f of snapshot.files)assert.equal(sha(f.content),f.sha256);assert.equal(sha(Buffer.concat(snapshot.files.map(f=>Buffer.from(f.content)))),audit.auditor.combinedSha256);
const {verifyVerificationDependencyManifest}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-verification-dependencies.mjs'));
const manifest=await verifyVerificationDependencyManifest({baseDir:resolve(handoff.runtime.snapshot),manifest:handoff.runtime.manifest,root});assert.equal(manifest.ok,true);assert.equal(manifest.files,9);assert.equal(manifest.manifestSha256,'56287cda5a49ca62a6f688e3c19dbccee2e3e5ddce5cfd9cff3717f78f56de35');
for(const f of handoff.runtime.manifest.files)await protect(handoff.runtime.snapshot+'/'+f.name,f.sha256);
for(const f of candidate.figures){for(const a of f.sourceAssetBindings)await protect(a.path,a.sha256);if(f.presentationAsset)await protect(f.presentationAsset.path,f.presentationAsset.sha256);}
for(const a of raw.binding.supplementalInputs??[])await protect(a.path,a.sha256);
await bound(c.productionEvidence.path,c.productionEvidence.sha256);await protect(c.sourceHandoff);
const {verifyAuditForWebCandidate}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-web.mjs'));
const gate=await verifyAuditForWebCandidate(root,c.candidatePath);assert.equal(gate.status,'passed');assert.equal(sha(await readFile(gate.auditPath)),c.auditSha256);await writeFile(dir+'/gate-reverified.json',JSON.stringify(gate,null,2)+'\n');
// Resolve only this canonical article's audited versions; do not refresh historical queues.
const versions=[],auditDir=root+'/audit/web/articles/79-bilibili-cn';
for(const name of (await readdir(root+'/web-production/v1/candidates/79-bilibili-cn')).filter(n=>new RegExp('^'+article+'(?:\\.(?:display|r\\d+|rev\\d+|coac269rev\\d+))*\\.json$').test(n))){
 const digest=sha(await readFile(root+'/web-production/v1/candidates/79-bilibili-cn/'+name)),base=article+'.'+digest;let effective=null;
 try{const bytes=await readFile(auditDir+'/'+base+'.json');effective={path:auditDir+'/'+base+'.json',sha256:sha(bytes),receipt:JSON.parse(bytes)};}catch(e){if(e.code!=='ENOENT')throw e;}
 if(effective)for(const fn of (await readdir(auditDir)).filter(n=>n.startsWith(base+'.retry-')&&n.endsWith('.json')&&!n.endsWith('.transport-recovery.json')).sort()){const bytes=await readFile(auditDir+'/'+fn),a=JSON.parse(bytes);if(effective.receipt.status==='failed'&&a.retryOfAudit?.sha256===effective.sha256)effective={path:auditDir+'/'+fn,sha256:sha(bytes),receipt:a};}
 versions.push({file:name,sha256:digest,status:effective?.receipt.status??'none',recordedAt:effective?.receipt.recordedAt??null});
}
const passed=versions.filter(v=>v.status.startsWith('passed')).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));assert.equal(passed.length,1);assert.equal(passed[0].sha256,c.candidateSha256);
const configs={};for(const [key,name] of Object.entries({builder:'build-accepted-preview.mjs',variants:'specific-web-variant-selection.v14.json',definitionSelection:'definition-boundary-stage-selection.json',manifest:'definition-boundaries-v1/manifest.v2.json',guard:'stage-definition-chapters.mjs',holds:'source-structure-holds.json',exclusions:'candidate-exclusions.json',register:'coac250-unified-chapter-register-20261027b.json'})){
 const path=integration+'/'+name,bytes=await readFile(path);configs[key]={path,sha256:sha(bytes)};await writeFile(dir+'/'+key+'.before.'+(key==='builder'||key==='guard'?'mjs':'json'),bytes);if(!['builder','variants','register'].includes(key))await protect(path,sha(bytes));
}
const exclusions=await load(configs.exclusions.path);assert.equal(exclusions.entries.some(e=>JSON.stringify(e).includes(c.candidateSha256)||JSON.stringify(e).includes(article)),false);
const holds=await load(configs.holds.path);assert.equal(holds.articleIds.includes(article),false);
const priorBytes=await readFile(integration+'/accepted-preview-current.json'),prior=JSON.parse(priorBytes);assert.equal(prior.chapters,223);assert.equal(prior.units,231);assert.equal(prior.selectedWeb.some(s=>s.chapterIds.includes(chapter)),false);assert.ok(prior.selectedWeb.some(s=>s.chapterIds.includes('modern-yabejp-ja-chapter01-section010-chapter')));await protect(prior.formalCorpusPath,prior.formalCorpusFileSha256);
const locks=(await readdir(integration)).filter(n=>/(?:\.lock(?:\.json)?|selection.*lock)$/.test(n));assert.deepEqual(locks,[]);
const result={schema:'coac250-090-preconsume/1',recordedAt:new Date().toISOString(),allPassed:true,handoff:{path:handoffPath,sha256:handoffSha},candidate:{path:c.candidatePath,sha256:c.candidateSha256},source:{path:resolve(c.sourcePath),sha256:c.sourceSha256},audit:{path:resolve(c.auditPath),sha256:c.auditSha256},prior:{output:prior.output,sha256:sha(priorBytes),chapters:prior.chapters,units:prior.units,blocks:prior.blocks,figures:prior.figures},versions,gate,manifest,configs,protectedFiles,issues:c.issues,sourceNoteDisposition:c.sourceNoteDisposition,locks,modelCalls:0,productionCalls:0};await writeFile(dir+'/preconsume.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({allPassed:true,versions,manifest,protectedFiles:protectedFiles.length,notes:result.issues.length,prior:result.prior}));
