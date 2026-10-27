import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing',out=join(root,'integration/coac244-222-figure-contract-v3-20261028');
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8')),bind=async p=>({path:p,sha256:sha(await readFile(p))});
const save=async(n,x)=>{const bytes=JSON.stringify(x,null,2)+'\n';await writeFile(join(here,n),bytes);await writeFile(join(out,n),bytes);};
await mkdir(out,{recursive:false});
const hpath=join(root,'integration/coac249-reviewed183-stat-context-v3-20261028.json'),h=await load(hpath);assert.equal(sha(await readFile(hpath)),'9ff0d4891ae521a0d389686c3c0689967e3aceeb9ea073a0af8d21ceb078aac7');
for(const b of [h.candidate,h.source,h.parent,h.parentAudit,h.audit,h.raw,h.preservedOldReview.audit,h.preservedOldReview.raw])assert.equal(sha(await readFile(b.path)),b.sha256);
assert.equal(sha(await readFile(h.runtime.manifest.path)),h.runtime.manifest.sha256);
const m=await load(h.runtime.manifest.path);for(const b of m.files)assert.equal(sha(await readFile(resolve(h.runtime.path,b.path??b.name))),b.sha256);
const v183=await import(pathToFileURL(join(h.runtime.path,'textbook-audit-web.mjs'))),verified=await v183.verifyAuditForWebCandidate(root,h.candidate.path);assert.equal(verified.status,'passed');assert.equal(verified.calls[0].callId,'2c2ab5c6-372c-46d9-bc12-7af409803ea0');
const runtime=await load(join(here,'new-runtime-binding.json')),m222=await load(runtime.manifest.path);for(const f of m222.files)assert.equal(sha(await readFile(join(runtime.path,f.path))),f.sha256);
const web=await import(pathToFileURL(join(runtime.path,'textbook-audit-web.mjs'))),candidatePath='web-production/v1/candidates/79-bilibili-cn/cv1775262.r2.display.json',prepared=await web.prepareBound222FigureAudit(root,candidatePath);
const ledger=(await readFile(join(root,'audit/calls.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)),sameSha=ledger.filter(c=>c.binding?.productionSha256===m222.scope.candidateSha256);assert.equal(sameSha.length,0,'do not create another audit when this SHA is already recorded');
const record={schema:'coac244-triple-review-registration/1',newModelCalls:0,firstReview222Remaining:1,chapter183:{handoff:await bind(hpath),candidate:h.candidate,audit:h.audit,raw:h.raw,call:h.call,status:verified.status,budget:h.budget,oldUncertain:h.preservedOldReview,sourceAmbiguityPreserved:true,deliveredTo250By249:true,integrationCompletionNotAssertedHere:true},chapter236:{diagnosis:await bind(join(root,'integration/coac249-236-fidelity-diagnosis-20261028.json')),oldAuditStatus:'needs-repair/uncertain',translationAddedTimeAssertion:false,verifiableNewTranslationDefectIdentified:false,sourceTimingUnstated:true,passedPromoted:false,candidateChanged:false,remainingModelAllowance:0},chapter222:{canonical:'79-cn-chapter-222-5',candidate:{path:candidatePath,sha256:m222.scope.candidateSha256},runtime,method:m222.method,proof:prepared.proof,sameShaAuditCalls:sameSha,status:'contract-ready-not-yet-independently-reviewed',phaseBudget:{used:2,maximum:3,remainingFirstReview:1,retry:0},newCallsThisRun:0,allOldFailuresPreserved:true,semanticGateUnchanged:true},verification:{newChecks:42,existingWebAndImageTests:41,actualRequestConstruction:await bind(join(here,'actual-request.json')),testResults:await bind(join(here,'test-results.json'))},noOtherWorkDispatched:true,formalActiveChanged:false};
await save('registration.json',record);
await save('handoff-249.json',{schema:'coac244-exact-222-target-figure-consumption-handoff/1',processingRoot:root,authorizationComments:['01a17ee7-ff76-70b6-b6cf-b9efc84f01d5','01a17ef9-3d57-76ab-a1c0-6ba9ea2be940'],candidate:record.chapter222.candidate,runtime,canonical:record.chapter222.canonical,sourceSha256:m222.parentRuntime?prepared.proof.sourceSha256:null,parent:prepared.proof.parent,parentAudit:prepared.proof.parentAudit,point:prepared.proof.point,method:m222.method,target:prepared.proof.targetFigureIds,actualRequestProof:await bind(join(out,'registration.json')),plannedImages:prepared.images,usageLimit:{newProduction:0,newPointReading:0,remainingIndependentFirstReview:1,retry:0,phaseUsed:2,phaseMaximum:3,failedVoidCount:true},instruction:'Use this exact runtime auditWebCandidate and verifyAuditForWebCandidate. First re-read current ledger/raw/preview/register and in-flight scope; any same-SHA result takes precedence, no duplicate or retry. Original audit guard/STOP/admission rules remain. PrepareOnly function prepareBound222FigureAudit performs no model. Actual sole first review must match saved scope1 source block/1 figure/1 occurrence,3 context prose blocks,original+x4 images,terra/max. New call cannot claim full-article review. Only actual independently passed merged receipt goes to250 with this runtime and parent/point evidence; otherwise preserve failure and stop. No maker, no paid capability probe, no234. The separately authorized283 budget is not part of this handoff.'});
const changes=[];
for(const name of ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']){
 const path=join(root,'integration',name),before=await readFile(path),data=JSON.parse(before),touched=[];
 function visit(x){if(Array.isArray(x)){for(const v of x)visit(v);return;}if(!x||typeof x!=='object')return;
  if(['nemata-jp-chapter-183-1','nemata-jp-chapter-236-1','79-cn-chapter-222-5'].includes(x.chapterId)){
   const id=x.chapterId;touched.push(id);x.targetedContractRegistration={path:join(out,'registration.json'),sha256:sha(Buffer.from(JSON.stringify(record,null,2)+'\n')),newModelCallsThisRun:0};
   const action=id==='nemata-jp-chapter-183-1'?'唯一授权补审2c2ab5c6已passed；973bbc3e候选不变，原统计口径疑点仍source-note，累计7/7余0。已由249交250；集成以250实际读回为准，不重复制作/审校。':id==='nemata-jp-chapter-236-1'?'旧7a1363b3仍uncertain；中性译文未增加早巡/剩余时点，现回执未指出可验证译误，源作者时点未明须与译稿保真分开。原候选/审不改，无新额度，不凭空选读法或自动pass。':'唯一c51650a4的target-figure请求/父审继承/真实raw验证合同已零调用补齐，精确v3 runtime31文件。42新检查+41旧测试通过；本阶段2/最多3，保留1首审给249，0retry；不重制/重读点/全章审，实际独审pass才交250。';
   if('nextAction'in x)x.nextAction=action;if(x.closurePlan)x.closurePlan.nextAction=action;
   if(id==='nemata-jp-chapter-183-1')x.latestReview={status:'passed',callId:h.call.callId,candidate:h.candidate,audit:h.audit,raw:h.raw,sourceAmbiguityPreserved:true,budget:h.budget,oldReviewPreserved:h.preservedOldReview};
   return;
  }for(const v of Object.values(x))visit(v);
 }
 visit(data);assert.equal(touched.length,3);await writeFile(join(here,name+'.before'),before);await writeFile(path,JSON.stringify(data,null,2)+'\n');await copyFile(path,join(here,name));changes.push({path,touched,sha256:sha(await readFile(path))});
}
await save('registration-checks.json',{changes,newModelCalls:0,'183VerifiedPassed':true,'222Frozen31FilesVerified':true,'222SameShaLedgerCount':0,'236OriginalUncertainPreserved':true});
for(const n of ['actual-request.json','test-results.json','new-runtime-binding.json'])await copyFile(join(here,n),join(out,n));
console.log(JSON.stringify({out,passed183Verified:true,newCalls:0,runtimeManifest:runtime.manifest.sha256,remainingFirstReview222:1}));
