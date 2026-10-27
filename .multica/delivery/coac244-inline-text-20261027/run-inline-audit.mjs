import {readFile,writeFile,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',stage=join(root,'web-production/v1/runs/coac244-inline-japanese-20261027');
const runtime=JSON.parse(await readFile(join(stage,'runtime-manifest.json'))).runtime;
const key=process.argv[2];if(!['155','162','234'].includes(key))throw Error('not_authorized_chapter');
const read=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
try{await readFile(join(stage,'chapter-'+key,'audit-dispatched.json'));throw Error('already_dispatched_no_retry');}catch(e){if(e.code!=='ENOENT')throw e;}
const jobs=await read(join(stage,'jobs.json')),job=jobs.find(j=>j.chapterId.split('-').at(-2)===key),out=join(stage,'chapter-'+key);
const {auditWebCandidate,verifyAuditForWebCandidate,verifyWebProductionCall,webDeterministicChecks}=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')));
const {invokeTextbookCodex,assertTextbookModelAdmission}=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));
await assertTextbookModelAdmission({stopFiles:[join(root,'audit/STOP-current-audit')]});
for(const f of (await read(join(stage,'runtime-manifest.json'))).files)if(sha(await readFile(join(runtime,f.name)))!==f.sha256)throw Error('frozen_runtime_changed');
const source=await read(join(root,job.source.path)),path=join(root,'web-production/v1/candidates',source.sourceId,source.articleId+'.coac244inline20261027.display.json');
const bytes=await readFile(path),candidate=JSON.parse(bytes),parent=await read(join(root,job.parentPath));
const expected=structuredClone(parent.body);for(const b of expected.blocks){const n=candidate.body.blocks.find(x=>x.sourceBlockIds[0]===b.sourceBlockIds[0]);if(candidate.provenance.revision.textBlockIds.includes(b.sourceBlockIds[0]))b.text=n.text;}
if(JSON.stringify(candidate.body)!==JSON.stringify(expected))throw Error('non_target_body_changed');
const clean=f=>{const c={...f};delete c.presentationAsset;return c;};if(JSON.stringify(candidate.figures.map(clean))!==JSON.stringify(parent.figures.map(clean)))throw Error('non_target_figure_changed');
const checks=webDeterministicChecks(candidate,source,job.source.sha256);if(!checks.passed)throw Error('deterministic_checks_failed:'+JSON.stringify(checks));
const production=await verifyWebProductionCall(root,candidate);
await writeFile(join(out,'before-independent-review.json'),JSON.stringify({candidatePath:path,candidateSha256:sha(bytes),nonTargetBodyUnchanged:true,figureSemanticsUnchanged:true,checks,production},null,2)+'\n');
const guard=join(root,'audit/finite-current-driver.lock.json'),lock=await open(guard,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),owner:'COAC-244/269 inline text first review',workers:1}));await lock.close();
let count=0;
try{
 const receipt=await auditWebCandidate({processingRoot:root,candidatePath:path,retryFailed:false,reviewer:async r=>{
  if(++count>1)throw Error('first_review_budget_exceeded');
  await writeFile(join(out,'audit-dispatched.json'),JSON.stringify({at:new Date().toISOString(),candidatePath:path,candidateSha256:sha(bytes),maxCalls:1,retry:false})+'\n',{flag:'wx'});
  return invokeTextbookCodex(r);
 }});
 await writeFile(join(out,'audit-result.json'),JSON.stringify({...receipt,newCallsThisInvocation:count},null,2)+'\n',{flag:'wx'});
 if(receipt.status.startsWith('passed')){const verified=await verifyAuditForWebCandidate(root,path);await writeFile(join(out,'verified-pass.json'),JSON.stringify({chapterId:job.chapterId,candidatePath:path,candidateSha256:sha(bytes),auditPath:verified.auditPath,auditSha256:verified.auditSha256,status:verified.status,method:verified.method,calls:verified.calls},null,2)+'\n',{flag:'wx'});}
 console.log(JSON.stringify({chapter:job.chapterId,status:receipt.status,newAuditCalls:count,issues:receipt.modelReview?.issues}));
}finally{if((await read(guard)).pid!==process.pid)throw Error('audit_guard_owner_changed');await unlink(guard);}
