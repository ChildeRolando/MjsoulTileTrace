// Technical recovery verification of an already completed independent call. No model entry.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const R='E:/AgentData/Coach/knowledge/processing',D=R+'/integration/coac269-p257-review-recovery-20261028';
const load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const preserved=await load(D+'/preservation.json'),raw=await load(preserved.raw.path),req=await load(R+'/integration/coac269-p257-human20-20261028/review-request.json');
const rt=R+'/audit/runtimes/coac244-vision-production-schema-v2-20261028';
const m=await load(rt+'/runtime-manifest.json');assert.equal(sha(await readFile(rt+'/runtime-manifest.json')),'a5cff9c38466a76030b5269ac4367f07695fa3ddb43fb4cbf374069fa852125c');for(const f of m.files)assert.equal(sha(await readFile(resolve(rt,f.path))),f.sha256);
const packet=R+'/integration/coac269-p257-human20-20261028',pm=await load(packet+'/manifest.json');for(const f of [...pm.files,...pm.inputBindings])assert.equal(sha(await readFile(f.path)),f.sha256);
const cli=await import(pathToFileURL(rt+'/textbook-production-cli.mjs'));
const audit=await import(pathToFileURL(rt+'/textbook-audit.mjs'));
function schema(v,s){if(s.enum)assert(s.enum.includes(v));if(s.type==='object'){assert(v&&!Array.isArray(v)&&typeof v==='object');for(const k of s.required??[])assert(Object.hasOwn(v,k));for(const k of Object.keys(v)){assert(Object.hasOwn(s.properties,k));schema(v[k],s.properties[k]);}}else if(s.type==='array'){assert(Array.isArray(v));for(const x of v)schema(x,s.items);}else assert.equal(typeof v,s.type);}
function execution(r){
 assert(r.success&&r.exitCode===0&&!r.timedOut&&!r.outputOverflow);
 assert.equal(r.callId,'2b216edc-24ba-4bdc-aa3c-153bdd6b9608');
 assert.equal(r.binding.productionSha256,'a9ce50898c0407ecca32dc538ad208f667a0a950372acec1114263e177f000e7');
 assert.equal(r.binding.requestSha256,sha(Buffer.from(JSON.stringify(req,null,2)+'\n')));
 assert.deepEqual(r.output,JSON.parse(r.rawLastMessage));schema(r.output,req.schema);
 assert.deepEqual(r.schema,req.schema);assert.equal(r.semanticPrompt,req.prompt);
 assert.equal(r.requestPrompt,cli.textbookClosedPrompt(req.prompt));assert.equal(r.requestPromptSha256,sha(r.requestPrompt));
 const e=r.requestExecution;assert.equal(e.model,'gpt-6.1-sol');assert.equal(e.reasoningEffort,'high');assert.deepEqual(e.images,[]);
 assert(!e.args.includes('-i'));assert.equal(e.args[e.args.indexOf('--model')+1],'gpt-6.1-sol');assert(e.args.includes('model_reasoning_effort="high"'));
}
execution(raw);assert.equal(sha(await readFile(preserved.raw.path)),preserved.raw.sha256);
assert.equal(await readFile(R+'/audit/supplements/coac249-p257-human20-20261028/stdin.txt','utf8'),raw.requestPrompt);
const result=await load(R+'/audit/supplements/coac249-p257-human20-20261028/cli-result.json');assert.deepEqual(result.output,raw.output);assert.deepEqual(result.requestExecution,raw.requestExecution);assert.deepEqual(result.events,raw.events);
const p=await load(packet+'/plan.json');assert.deepEqual(raw.output.applications.map(x=>x.itemId),p.facts.map(x=>x.itemId));
const live=await import(pathToFileURL(packet+'/entry.mjs'));const actual=await live.verify('01a17cae-06e4-7b30-a93f-3a030d1ae63f');assert.equal(actual.candidate.sha256,raw.binding.productionSha256);
const ledger=(await readFile(R+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(s=>s.includes(raw.callId)).map(JSON.parse);assert.equal(ledger.length,1);assert.deepEqual(ledger[0].usage,raw.usage);assert.deepEqual(audit.auditUsageFromEvents(raw.events),raw.usage);
const checks=[];for(const[name,mutate]of [
 ['wrong-call',r=>r.callId='wrong'],['wrong-candidate',r=>r.binding.productionSha256='wrong'],
 ['wrong-model',r=>r.requestExecution.model='gpt-6.1-terra'],['wrong-effort',r=>r.requestExecution.reasoningEffort='max'],
 ['image-added',r=>r.requestExecution.images=['bad']],['schema-changed',r=>r.schema.additionalProperties=true],
 ['prompt-changed',r=>r.requestPrompt+='bad'],['output-vote',r=>r.output.authorArgumentFaithful=false]
 ]){const bad=structuredClone(raw);mutate(bad);assert.throws(()=>execution(bad));checks.push(name);}
const report={schema:'coac269-completed249-transport-recovery-verification/1',callId:raw.callId,raw:preserved.raw,
 executedByOriginal249:true,newModelCalls:0,retry:0,requestMatchesFrozenSemanticPromptAndSchema:true,
 actualModel:raw.requestExecution.model,actualEffort:raw.requestExecution.reasoningEffort,images:[],
 exactCandidateAndLiveHumanFactsVerified:true,immutablePacketFiles:pm.files.length,inputBindings:pm.inputBindings.length,runtimeFiles:m.files.length,
 strictOutputSchemaVerified:true,ledgerRows:1,usage:raw.usage,durationMs:raw.durationMs,
 originalPreflightAndAdmissionSnapshotsMissing:true,missingArtifactsReconstructedOrSubstituted:false,
 postHocVerificationOnly:true,negativeChecks:checks,originalModelOutputUnchanged:true,
 applicationAllFaithful:raw.output.applications.every(a=>a.faithful),firstNinePreserved:raw.output.firstNinePreserved,
 authorArgumentFaithful:raw.output.authorArgumentFaithful,completeOrderedScopeCompared:raw.output.completeOrderedScopeCompared,
 actualRequiredDisplayLimitations:raw.output.requiredDisplayLimitations,originalModelIssues:raw.output.issues,
 conditionalSemanticEvidenceExists:true,ordinaryWholePagePassed:false,wholeChapterPassed:false,admissionGranted:false};
await writeFile(import.meta.dirname+'/verification.json',JSON.stringify(report,null,2)+'\n');
const bytes=JSON.stringify(report,null,2)+'\n';
try{await writeFile(D+'/transport-recovery-verification.json',bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(D+'/transport-recovery-verification.json','utf8'),bytes,'existing recovery proof differs');}
console.log(JSON.stringify({verified:true,callId:raw.callId,newCalls:0,negativeChecks:checks.length,originalPreflightMissing:true,ordinaryWholePagePassed:false}));
