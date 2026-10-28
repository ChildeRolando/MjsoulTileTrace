// Zero-call intake of the existing 232 independent result. Never grants admission.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {inspect,sha,objectSha,load,R,SHA,CANONICAL} from 'file:///E:/AgentData/Coach/knowledge/processing/integration/coac248-jp232-human-20261028/verify.mjs';
const pins={
 'integration/coac249-232-human-owner-handoff-20261028.md':'57e74739bb231b1214da0145c7b9f359652c0255ac6fcebc2d469e1758680244',
 'integration/coac249-232-human-reviewed-20261028.json':'2280884a55df3ba010ceac36c5c4832deb2b4dc15b15f2e07d8db554a8f3a94c',
 'audit/calls/d1640db7-8722-4d0d-bdba-da5c2ba54f84.json':'f84280661530678891d4d11ab4c00ff0b4f3542c435ed5e3b8716af8ac8ccd7b',
 'integration/coac249-232-human-inheritance-20261028.json':'8b85184a17332b8f0edca95acdecd8f4b96b864c7d68613861a721b8102ac949',
 'integration/coac249-232-human-display-scope-20261028.json':'fdb1e1196023764a5ac571f9ff0175102416848b39332862ca2fb6748b018d84'
};
export function checkScope(receipt,scope,candidate,expectedIssuesSha){
 assert.equal(receipt.canonical,CANONICAL);assert.equal(receipt.candidate.sha256,SHA);
 assert.equal(scope.candidate.sha256,SHA);assert.equal(scope.source.sha256,receipt.source.sha256);
 assert.equal(scope.anchor.figureSha256,objectSha(candidate.figures[0]));
 assert.equal(scope.anchor.afterSourceBlock,'modern-yabejp-ja:chapter04-section012:b0005');
 assert.equal(scope.anchor.beforeSourceBlock,'modern-yabejp-ja:chapter04-section012:b0006');
 const m=receipt.modelReview,v=receipt.verification;
 assert.equal(v.executionVerified,true);assert.equal(v.applicationPassed,true);assert.equal(v.authorArgumentFaithful,true);
 assert.equal(v.limitedUnknownOkay,false);assert.equal(v.wholeChapterPassed,false);
 assert.equal(receipt.wholeChapterPassed,false);assert.equal(receipt.admissionGranted,false);
 assert.equal(m.applications.length,1);assert.equal(m.applications[0].itemId,'4ce1c71647c8da4352eb117e5d2f1094');assert.equal(m.applications[0].faithful,true);
 assert.equal(m.authorArgumentFaithful,true);assert.equal(m.completeOrderedScopeCompared,true);
 const u=m.unknownAndLimits;
 assert.equal(u.overallSufficient,true);assert.equal(u.requiresActualDisplayAndReadback,true);
 assert.equal(u.unknownChecks.length,2);assert(u.unknownChecks.every(x=>x.sufficientWithLimits===true));
 assert.deepEqual(u.unknownChecks.map(x=>x.unknownText),candidate.figures[0].unknowns);
 assert.equal(u.limitChecks.length,4);assert(u.limitChecks.every(x=>x.sufficient===true));
 assert.deepEqual(u.limitChecks.map(x=>x.limitText),scope.requiredDisplayLimitations);
 assert.equal(scope.label,'审校限制（非原文）');assert.equal(scope.implementationVerified,false);
 assert.equal(scope.admissionGranted,false);assert.equal(scope.wholeChapterPassed,false);
 assert.equal(objectSha(m.issues),expectedIssuesSha,'no unbound issue reclassification');
 assert.equal(m.issues.filter(x=>x.severity==='uncertain').length,1);
 assert.equal(m.issues[0].targetId,CANONICAL);
 assert.equal(m.issues[0].description,'四条限制尚未安装，实际展示与读回验收仍待完成。');
 assert(m.issues.slice(1).every(x=>x.severity==='source-note'));
}
export async function verify(){
 const refs=[];
 for(const[path,expected]of Object.entries(pins)){assert.equal(sha(await readFile(R+'/'+path)),expected,path);refs.push({path,sha256:expected});}
 const old=await inspect(),receipt=await load(R+'/integration/coac249-232-human-reviewed-20261028.json');
 const scope=await load(R+'/integration/coac249-232-human-display-scope-20261028.json');
 const proof=await load(R+'/integration/coac249-232-human-inheritance-20261028.json');
 const raw=await load(receipt.raw.path),plan=await load(receipt.plan.path),m=receipt.modelReview;
 assert(raw.success&&raw.exitCode===0&&!raw.timedOut);
 assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,m);
 assert.deepEqual(receipt.verification.modelReview,m);
 assert.equal(raw.binding.productionSha256,SHA);assert.equal(raw.binding.sourceFileSha256,old.ctx.plan.source.sha256);
 assert.equal(raw.binding.parentSha256,old.ctx.plan.parent.sha256);
 assert.equal(raw.binding.humanEventSha256,old.mapping.acceptedHumanFact.eventSha256);
 assert.equal(raw.binding.authorizationComment,'01a18242-25a1-7c1f-843c-16ebe012784c');
 assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');
 assert.equal(raw.requestExecution.model,'gpt-6.1-sol');assert.equal(raw.requestExecution.reasoningEffort,'high');
 assert.deepEqual(raw.requestExecution.images,[]);assert(!raw.requestExecution.args.includes('-i'));
 assert.deepEqual(raw.prompt,plan.prompt);assert.deepEqual(raw.schema,plan.schema);
 assert.equal(raw.semanticPromptSha256,sha(plan.prompt));assert.equal(raw.schemaSha256,objectSha(plan.schema));
 assert.equal(raw.requestPromptSha256,sha(raw.requestPrompt));
 assert.equal(raw.promptSha256,sha(raw.requestPrompt));
 assert(plan.prompt.includes(old.mapping.displayProposal.notes[0]));
 const payload=JSON.parse(plan.prompt.slice(plan.prompt.indexOf('{')));
 assert.deepEqual(payload.sourceBlocksInOriginalOrder,old.ctx.source.blocks);
 assert.deepEqual(payload.candidateBodyInVisualOrder,old.c.body.blocks);
 assert.deepEqual(payload.allCurrentFiguresInOrder,old.c.figures);
 assert.equal(payload.currentCandidate.sha256,SHA);
 for(const note of old.mapping.displayProposal.notes)assert(plan.prompt.includes(note),'actual request must include all four limitations');
 assert.deepEqual(scope.requiredDisplayLimitations,old.mapping.displayProposal.notes);
 const issueSha=objectSha(m.issues);checkScope(receipt,scope,old.c,issueSha);
 assert.equal(proof.humanEventStillCurrent,true);assert.equal(proof.uniqueStandardLedger,true);
 assert.equal(proof.authorBodyUnchanged,true);assert.equal(proof.unchangedNonTargetFigures,2);
 const ledger=(await readFile(R+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
 assert.equal(ledger.filter(x=>x.callId===raw.callId).length,1);
 assert.equal(ledger.filter(x=>x.binding?.productionSha256===SHA).length,1);
 assert.deepEqual(receipt.applicationMap,old.mapping);
 for(const ref of [receipt.plan,receipt.runtime,receipt.parentAudit,receipt.inheritedReceipt,receipt.inheritedRaw]){
  assert.equal(sha(await readFile(ref.path)),ref.sha256,ref.path);refs.push(ref);
 }
 const failed=[];
 const negative=(name,edit)=>{const a=structuredClone(receipt),b=structuredClone(scope);edit(a,b);assert.throws(()=>checkScope(a,b,old.c,issueSha));failed.push({name,rejected:true});};
 negative('wrong candidate SHA',a=>a.candidate.sha256='0'.repeat(64));
 negative('wrong source binding',(_,b)=>b.source.sha256='0'.repeat(64));
 negative('wrong figure SHA',(_,b)=>b.anchor.figureSha256='0'.repeat(64));
 negative('wrong annotation anchor',(_,b)=>b.anchor.afterSourceBlock='b0007');
 negative('omit a limitation',(_,b)=>b.requiredDisplayLimitations.pop());
 negative('guess unknown',a=>a.modelReview.unknownAndLimits.unknownChecks[0].unknownText='guessed');
 negative('promote technical false',a=>a.verification.limitedUnknownOkay=true);
 negative('delete current uncertain',a=>a.modelReview.issues.shift());
 negative('new semantic error',a=>a.modelReview.issues.push({severity:'error',description:'new error'}));
 negative('fake installed state',(_,b)=>b.implementationVerified=true);
 negative('claim chapter passed',a=>a.wholeChapterPassed=true);
 const report={schema:'coac248-232-independent-conditional-intake/1',canonical:CANONICAL,candidate:receipt.candidate,source:receipt.source,parent:receipt.parent,
  references:refs,call:{callId:raw.callId,model:raw.model,reasoningEffort:raw.reasoningEffort,images:[],usage:raw.usage,durationMs:raw.durationMs},
  originalTechnicalVerification:{executionVerified:true,applicationPassed:true,authorArgumentFaithful:true,limitedUnknownOkay:false,wholeChapterPassed:false},
  independentConditions:{applicationFaithful:true,authorArgumentFaithful:true,unknownChecksSufficientWhenImplemented:true,fourLimitationsSufficientWhenImplemented:true},
  issuesSha256:issueSha,currentUncertain:m.issues[0],originalIssuesAndFalsePreserved:true,
  orderedSourceAndCandidateBlocks:14,completeFigures:3,authorBodyUnchanged:true,remainingUnknowns:old.c.figures[0].unknowns,
  annotation:{label:scope.label,anchor:scope.anchor,notes:scope.requiredDisplayLimitations,installedAtIndependentReview:false},
  historicalPreparedRequestHadFourLimits:false,actualReviewedRequestIncludesFourLimits:true,
  actualRequest:{plan:receipt.plan,closedPromptSha256:raw.promptSha256,semanticPromptSha256:raw.semanticPromptSha256,schemaSha256:raw.schemaSha256},
  reviewBudget:receipt.budget,newModelCallsThisRun:0,newProductionCallsThisRun:0,newConsumerCreated:false,
  remainingScope:'仅实际安装四条非原文限制、合法精确组合及250真实MCP/Arena读回；没有新牌码或作者论证语义缺口。',
  currentOrdinaryChapterPass:false,admissionGranted:false,sharedPointersChanged:false,
  negativeChecks:{passed:true,count:failed.length,cases:failed}};
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=await verify();
 if(process.argv.includes('--record'))await writeFile(fileURLToPath(new URL('./verification.json',import.meta.url)),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({intakeVerified:true,candidateSha256:SHA,applicationAndArgumentFaithful:true,technicalLimitedUnknownOkay:false,negativeChecks:report.negativeChecks.count,newModelCalls:0,admissionGranted:false}));
}
