// One exact candidate; conditional display evidence never rewrites a model verdict.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const ROOT='E:/AgentData/Coach/knowledge/processing',CANON='nemata-jp-chapter-232-1',PIN='93fdd682bea663f000059057925e39c226c682507b9299eb9c9312a611a6c18c',STATUS='admitted-exact232-human-four-limit-display';
export const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
export function assert232Scope(c,parent,r,raw,scope){
 assert.equal(r.canonical,CANON);assert.equal(r.candidate.sha256,PIN);assert.equal(r.raw.sha256,'f84280661530678891d4d11ab4c00ff0b4f3542c435ed5e3b8716af8ac8ccd7b');
 assert.equal(raw.callId,'d1640db7-8722-4d0d-bdba-da5c2ba54f84');assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);
 const o=raw.output;assert.equal(o.applications.length,1);assert.equal(o.applications[0].itemId,'4ce1c71647c8da4352eb117e5d2f1094');assert.equal(o.applications[0].faithful,true);assert(o.authorArgumentFaithful&&o.completeOrderedScopeCompared);
 assert.equal(o.unknownAndLimits.overallSufficient,true);assert.equal(o.unknownAndLimits.requiresActualDisplayAndReadback,true);assert.equal(o.unknownAndLimits.unknownChecks.length,2);assert(o.unknownAndLimits.unknownChecks.every(x=>x.sufficientWithLimits===true));assert.equal(o.unknownAndLimits.limitChecks.length,4);assert(o.unknownAndLimits.limitChecks.every(x=>x.sufficient===true));
 assert.equal(o.evidenceBasis.acceptedHumanFactUsed,true);assert.equal(o.evidenceBasis.noImagesCompared,true);assert.equal(o.evidenceBasis.semanticArgumentReviewed,true);assert.equal(o.evidenceBasis.wholeChapterPassed,false);
 assert.deepEqual(o.issues.map(x=>x.severity),['uncertain','source-note','source-note']);assert.equal(o.issues[0].targetId,CANON);assert.equal(o.issues[0].description,'四条限制尚未安装，实际展示与读回验收仍待完成。');
 assert(r.verification.executionVerified&&r.verification.applicationPassed&&r.verification.authorArgumentFaithful);assert.equal(r.verification.limitedUnknownOkay,false);assert.equal(r.verification.wholeChapterPassed,false);assert.equal(r.verificationError,null);
 assert.equal(scope.canonical,CANON);assert.equal(scope.candidate.sha256,PIN);assert.equal(scope.label,'审校限制（非原文）');assert(scope.proposalOnly&&scope.actualReadbackRequired);assert.equal(scope.implementationVerified,false);assert.equal(scope.admissionGranted,false);
 assert.deepEqual(scope.requiredDisplayLimitations,o.unknownAndLimits.limitChecks.map(x=>x.limitText));assert.equal(scope.anchor.afterSourceBlock,'modern-yabejp-ja:chapter04-section012:b0005');assert.equal(scope.anchor.beforeSourceBlock,'modern-yabejp-ja:chapter04-section012:b0006');
 const f=c.figures[0];assert.equal(f.figureId,'modern-yabejp-ja:chapter04-section012:b0005:figure');assert.equal(sha(JSON.stringify(f)),'65b278a1f692ab370a91546c53fa6645059a39344d47c85fcbfcb3ebd52e081e');assert.equal(scope.anchor.figureSha256,sha(JSON.stringify(f)));assert.deepEqual(f.unknowns,o.unknownAndLimits.unknownChecks.map(x=>x.unknownText));assert(f.transcription.includes('8s 9m 7z 1z 5z 4z'));assert(f.transcription.includes('4p 4p 3s 4s 6s 7s 8s'));
 assert.deepEqual(c.body,parent.body);assert.equal(c.body.blocks.length,14);assert.equal(c.figures.length,3);assert.deepEqual(c.figures.slice(1),parent.figures.slice(1));assert.equal(c.source.sourceSha256,'893e14abcb3f68a7a22fac37d62387f6775e09d6d3ba706a4ffadb04746ae214');
}
export async function verify232Conditional(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));assert.equal(sha(await readFile(candidatePath)),PIN);
 const m=await load(new URL('./manifest.json',import.meta.url));const bound=async b=>{const bytes=await readFile(b.path);assert.equal(sha(bytes),b.sha256,b.path);return b.path.endsWith('.json')?JSON.parse(bytes):bytes;};
 for(const f of m.files)await bound(f);
 const r=await bound(m.receipt),raw=await bound(r.raw),plan=await bound(r.plan),c=await bound(r.candidate),p=await bound(r.parent),scope=await bound(m.scope),proof=await bound(m.inheritance);
 const prior=await bound(r.inheritedReceipt),priorRaw=await bound(r.inheritedRaw);assert.deepEqual(priorRaw.output,prior.modelReview);assert.equal(prior.candidate.sha256,r.parent.sha256);
 const originalPair=await import(pathToFileURL(ROOT+'/audit/runtimes/coac269-224232-exact-v1-20261028/pair.mjs'));
 const oldPlan=await originalPair.prepareReview('232',r.parent.path,'0d890d3bbfd3fe1dbe588f068e17de41312916c1d068d246d080d0ec6feaa973');assert.deepEqual(await originalPair.verifyReviewExecution('232',priorRaw,oldPlan,'0d890d3bbfd3fe1dbe588f068e17de41312916c1d068d246d080d0ec6feaa973'),prior.verification);
 const human=await import(pathToFileURL(ROOT+'/integration/coac248-jp232-human-20261028/verify.mjs'));const inspected=await human.inspect();assert.equal(inspected.report.candidate.sha256,PIN);
 const cli=await import(pathToFileURL(ROOT+'/audit/runtimes/coac244-vision-production-schema-v2-20261028/textbook-production-cli.mjs'));
 assert.deepEqual(raw.schema,plan.schema);assert.equal(raw.semanticPrompt,plan.prompt);assert.equal(raw.requestPrompt,cli.textbookClosedPrompt(plan.prompt));assert.equal(raw.requestPromptSha256,sha(raw.requestPrompt));assert(raw.success&&raw.exitCode===0&&!raw.timedOut);
 assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');assert.deepEqual(raw.requestExecution.images,[]);assert.deepEqual(plan.images,[]);assert.equal(raw.requestExecution.args.filter(x=>x==='-i').length,0);assert.equal(raw.requestExecution.args[raw.requestExecution.args.indexOf('--model')+1],'gpt-6.1-sol');assert(raw.requestExecution.args.includes('model_reasoning_effort="high"'));
 for(const k of ['productionSha256','sourceFileSha256','parentSha256'])assert.equal(raw.binding[k],({productionSha256:PIN,sourceFileSha256:r.source.sha256,parentSha256:r.parent.sha256})[k]);
 assert.equal(raw.binding.humanEventSha256,'ff8a1be9e06189c487559b4d5ea497a528edac2f64a6fa9009eb2f28ffb0eceb');
 const ledger=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.deepEqual(ledger,[r.call]);
 const payload=JSON.parse(plan.prompt.slice(plan.prompt.indexOf('\n')+1));assert.equal(proof.orderedSourceAndBodyBlocks,14);
 for(const limit of scope.requiredDisplayLimitations)assert(plan.prompt.includes(limit),'actual review request must include every limitation');
 assert232Scope(c,p,r,raw,scope);assert.equal(proof.wholeChapterPassed,false);assert.equal(proof.admissionGranted,false);
 return {schema:'coac244-exact232-conditional-render/1',status:STATUS,production:{sha256:PIN},auditPath:m.receipt.path,auditSha256:m.receipt.sha256,canonical:CANON,candidate:r.candidate,source:r.source,parent:r.parent,independentReceipt:m.receipt,raw:r.raw,anchor:scope.anchor,requiredDisplayLimitations:scope.requiredDisplayLimitations,retainedUnknowns:c.figures[0].unknowns,originalStrictVerification:r.verification,originalIssues:prior.modelReview.issues,independentIssues:raw.output.issues,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,requiresActualDisplayAndReadback:true,newModelCalls:0};
}
