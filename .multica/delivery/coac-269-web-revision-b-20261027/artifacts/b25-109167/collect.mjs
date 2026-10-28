import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const here=import.meta.dirname,rt='E:/AgentData/Coach/knowledge/processing/audit/runtimes/coac269-109167-exact-v1-20261028',key=process.argv[2];assert(['109','167'].includes(key));
const m=await import(pathToFileURL(rt+'/pair.mjs')),cli=await import(pathToFileURL(rt+'/textbook-production-cli.mjs'));
const pins=await m.load(here+'/pins.json'),r=await m.load(here+'/'+key+'-result.json');assert.equal(r.exitCode,0);assert(r.candidate);assert.equal(r.callsRecorded,1);
const proof=await m.verifyProduction(key,r.candidate.path,pins.runtime.sha256),raw=await m.load(proof.raw.path),preview=await m.load(here+'/'+key+'-request.json');
assert.equal(raw.requestPrompt,preview.actual.closedPrompt);assert.deepEqual(raw.schema,preview.plan.schema);assert.deepEqual(raw.requestExecution.images,preview.actual.requestExecution.images);assert(raw.events.some(e=>e.type==='thread.started'));assert(raw.events.some(e=>e.type==='turn.completed'));
const plan=await m.prepareReview(key,r.candidate.path,pins.runtime.sha256),work=await mkdtemp(m.stage+'/'+key+'-review-preview-'),actual=await cli.prepareTextbookCliRequest({...plan,work});await m.checkExecution({...actual,requestPrompt:actual.closedPrompt,requestPromptSha256:m.sha(actual.closedPrompt)},plan);
const j=m.job(key),p=await m.load(j.packet.path),candidate=await m.load(r.candidate.path),parent=await m.load(j.parent.path);
for(const [id,unknowns] of Object.entries(p.reviewTargets.existingUnknowns)){assert.deepEqual(candidate.figures.find(f=>f.figureId===id).unknowns,unknowns);for(const u of unknowns)assert(actual.closedPrompt.includes(u));}
const ordered=p.orderedContext.map(x=>({...x,candidate:candidate.body.blocks[x.position],figure:x.figure?candidate.figures.find(f=>f.figureId===x.figure.figureId):null}));assert(actual.closedPrompt.includes(JSON.stringify(ordered)));assert(actual.closedPrompt.includes('不能机械因unknown就降级或放行'));
const request={candidate:r.candidate,plan,actual,modelCalls:0,independentNotDispatchedHere:true};
for(const path of [here+'/'+key+'-review.json',m.stage+'/'+key+'-review-request.json'])await writeFile(path,JSON.stringify(request,null,2)+'\n',{flag:'wx'});
await writeFile(here+'/'+key+'-candidate.json',await readFile(r.candidate.path),{flag:'wx'});
const diff=p.whitelist.map(w=>({pointer:w.pointer,figureId:w.figureId,before:w.before,after:candidate.figures.find(f=>f.figureId===w.figureId).transcription}));
const report={passed:true,modelCallsHere:0,runtime:pins.runtime,productionProof:proof,actualMakerRequestMatchesPreflight:true,actualReviewBuiltNotSent:true,reviewModel:actual.requestExecution.model,reviewEffort:actual.requestExecution.reasoningEffort,reviewImages:actual.requestExecution.images,orderedSourceCandidateBlocks:ordered.length,originalIssuesUnchanged:p.originalIssues,unknownsUnchanged:p.reviewTargets.existingUnknowns,bodyUnchanged:JSON.stringify(parent.body)===JSON.stringify(candidate.body),exactDiff:diff,wholeChapterAccepted:false};
for(const path of [here+'/'+key+'-selfcheck.json',m.stage+'/'+key+'-selfcheck.json'])await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,key,candidate:r.candidate.sha256,callId:r.calls[0].callId,makerImages:raw.requestExecution.images.length,reviewImages:actual.requestExecution.images.length,usage:r.calls[0].usage,durationMs:r.calls[0].durationMs,independentNotSentHere:true}));
