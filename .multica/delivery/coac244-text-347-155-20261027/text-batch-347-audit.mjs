// One admitted candidate, one independent first review; reuse frozen verification.
import {readFile,writeFile,open,unlink,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
const root='E:/AgentData/Coach/knowledge/processing';
const out=resolve('.multica/delivery/coac244-text-347-155-20261027');
const runtime=join(root,'audit/runtimes/web-b8-transport-diag-20261027');
const producer=join(root,'web-production/v1/runs/coac244-text-347-20261027');
const modulePath=join(runtime,'textbook-audit-web.mjs');
const {verifyWebRevisionInheritance,verifyWebProductionCall,webDeterministicChecks,auditWebCandidate,verifyAuditForWebCandidate}=await import(pathToFileURL(modulePath));
const {invokeTextbookCodex,assertTextbookModelAdmission}=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p));
const write=async(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
await mkdir(out,{recursive:true});
const preflight=await read(join(producer,'entry-preflight.json'));
const j=preflight.target;
const parent=await read(join(root,j.parentPath));
const registered=await read(join(root,j.registeredParentPath));
const source=await read(join(root,j.source.path));
const sourceBytes=await readFile(join(root,j.source.path));
const revision={parentPath:j.parentPath,parentSha256:j.parentFileSha256,notesPath:j.auditPath,notesSha256:j.auditFileSha256,
 figureIds:[],textBlockIds:[j.targetId],context:{path:relative(root,join(producer,'term-source-context.json')).replaceAll('\\','/'),sha256:sha(await readFile(join(producer,'term-source-context.json')))}};
const probe=structuredClone(parent);probe.provenance.revision=revision;
const inheritance=await verifyWebRevisionInheritance(root,probe);
if(process.argv[2]==='preflight'){
 await write(join(out,'347-parent-chain-verification.json'),{modelCalls:0,inheritance});
 console.log(JSON.stringify({parentChainVerified:true,modelCalls:0}));
 process.exit(0);
}
const candidatePath=join(root,'web-production/v1/candidates/modern-yabejp-ja/archive01-section008.coac244text20261027.display.json');
const bytes=await readFile(candidatePath),candidate=JSON.parse(bytes);
const expected=structuredClone(registered.body);
const changed=[];
for(let i=0;i<candidate.body.blocks.length;i++){
 const b=candidate.body.blocks[i];
 if(b.sourceBlockIds.includes(j.targetId)){
  changed.push({index:i,before:registered.body.blocks[i].text,after:b.text});
  expected.blocks[i].text=b.text;
 }
}
if(changed.length!==1||!same(candidate.body,expected))throw Error('non_target_body_changed');
const clean=f=>{const c={...f};delete c.presentationAsset;return c;};
if(!same(candidate.figures.map(clean),registered.figures.map(clean))||!same(candidate.source,registered.source)||candidate.title!==registered.title)throw Error('non_target_semantic_fields_changed');
const checks=webDeterministicChecks(candidate,source,sha(sourceBytes));
if(!checks.passed)throw Error('deterministic_checks_failed:'+checks.errors.join('|'));
const productionCall=await verifyWebProductionCall(root,candidate);
await write(join(out,'347-before-first-review.json'),{candidatePath,candidateSha256:sha(bytes),changed,
 nonTargetBodyUnchanged:true,nonTargetFiguresUnchanged:true,checks,productionCall,
 frozenAuditorFiles:await Promise.all(['textbook-audit-web.mjs','textbook-production-cli.mjs'].map(async name=>({name,sha256:sha(await readFile(join(runtime,name)))})))});
await assertTextbookModelAdmission({stopFiles:[join(root,'audit/STOP-current-audit')]});
// Same exclusive guard used by the existing finite audit driver. No second consumer.
const lockPath=join(root,'audit/finite-current-driver.lock.json');
const lock=await open(lockPath,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),runtime,workers:1,owner:'COAC-244 text347 one first review'}));
await lock.close();
let count=0;
try{
 const receipt=await auditWebCandidate({processingRoot:root,candidatePath,retryFailed:false,
  reviewer:async request=>{
   if(++count>1)throw Error('authorized_first_review_budget_exceeded');
   await write(join(out,'347-independent-review-dispatched.json'),{at:new Date().toISOString(),candidatePath,candidateSha256:sha(bytes),maxNewCalls:1,retry:false});
   return invokeTextbookCodex(request);
  }});
 await write(join(out,'347-independent-review-result.json'),{...receipt,newCallsThisInvocation:count});
 if(receipt.status.startsWith('passed')){
  const verified=await verifyAuditForWebCandidate(root,candidatePath);
  await write(join(out,'347-verified-pass.json'),{chapterId:j.chapterId,candidatePath,candidateSha256:sha(bytes),auditPath:verified.auditPath,auditSha256:verified.auditSha256,status:verified.status,method:verified.method,calls:verified.calls,semanticCompleteness:verified.semanticCompleteness});
 }
 console.log(JSON.stringify({chapterId:j.chapterId,status:receipt.status,candidateSha256:sha(bytes),auditPath:receipt.auditPath,calls:count,issues:receipt.modelReview?.issues??[]}));
}finally{
 const held=await read(lockPath);if(held.pid!==process.pid)throw Error('audit_lock_owner_changed');
 await unlink(lockPath);
}
