// Read-only reuse of real evidence and the existing244 display contract. No invocation or integration writer.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',here=import.meta.dirname;
const read=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
const bind=async path=>({path,sha256:sha(await readFile(path))}),same=(a,b)=>assert.deepEqual(a,b);
const pins={receipt:'49dc8c91614a3a4b726b41e69f3c2ddcdbd581c31973763930b222c11bd88b36',raw:'15d6f153d54e1beb35b2405caa8943d6cf79ccb180a8badfd58917a676b1b9c5',inheritance:'bd8e040789cef358c4b615a3a97a2e6ee4edf896a8b7353ab418a4a56b4191a7',candidate:'434120af284195ddf27b491a1c2c4cd9ea25072d40e9c6a366bcd8ac3cb03b9b',runtime:'d167ab2e2beab21dda23336b40e341e1972ffbd894b2413702f04f8d08b3a4bb',handoff:'d9fb437f24d6c446c969be4abb7b519b50be7b7e5ad5c703488571a11a95646c'};
const paths={receipt:root+'/integration/coac249-283-0785-reviewed-20261028.json',raw:root+'/audit/calls/4690455a-50a9-4675-8572-27e789204cc6.json',inheritance:root+'/integration/coac249-283-0785-scope-inheritance-20261028.json',handoff:root+'/integration/coac269-283-0785-handoff-249-20261028.json'};
const refs={};for(const [k,p] of Object.entries(paths)){refs[k]=await bind(p);assert.equal(refs[k].sha256,pins[k]);}
const receipt=await read(paths.receipt),raw=await read(paths.raw),inheritance=await read(paths.inheritance);
refs.candidate=await bind(receipt.candidate.path);assert.equal(refs.candidate.sha256,pins.candidate);refs.runtime=await bind(receipt.runtime.path);assert.equal(refs.runtime.sha256,pins.runtime);
const runtime=receipt.runtime.path.replace(/[/\\]runtime-manifest.json$/,'');
const module=await import(pathToFileURL(runtime+'/b0785.mjs'));
const production=await module.verify0785Production(root,receipt.candidate.path,pins.runtime);
const plan=await read(receipt.plan.path);assert.equal(sha(await readFile(receipt.plan.path)),receipt.plan.sha256);
same(plan,await module.prepare0785Review(root,receipt.candidate.path,pins.runtime));
const execution=await module.verify0785ReviewExecution(raw,plan,pins.runtime);same(execution,receipt.verification);
same(JSON.parse(raw.rawLastMessage),raw.output);same(raw.output,receipt.modelReview);same(raw.schema,plan.schema);
assert(raw.success&&raw.exitCode===0&&!raw.timedOut);assert(raw.events.some(e=>e.type==='thread.started'));assert(raw.events.some(e=>e.type==='turn.completed'));
same(raw.usage,receipt.call.usage);same(raw.requestExecution,receipt.call.requestExecution);assert.equal(raw.durationMs,receipt.call.durationMs);assert.equal(raw.callId,receipt.call.callId);
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse);
const scoped=ledger.filter(c=>c.binding?.productionSha256===pins.candidate);assert.equal(scoped.length,1);same(scoped[0],receipt.call);
const target=receipt.targetId,candidate=await read(receipt.candidate.path),parent=await read(receipt.parent.path),figure=candidate.figures.find(f=>f.figureId===target);
same(candidate.body,parent.body);assert.equal(candidate.body.blocks.length,1195);assert.equal(candidate.figures.filter((f,i)=>JSON.stringify(f)===JSON.stringify(parent.figures[i])).length,523);
for(const b of inheritance.refs)assert.equal(sha(await readFile(b.path)),b.sha256);
for(const b of inheritance.passedBlocks){assert(b.unchanged);assert.equal(hash(candidate.body.blocks.find(x=>x.sourceBlockIds.includes(b.id))),b.sha256);}
assert(inheritance.sixTables.unchanged&&inheritance.Q8.unchanged);assert.equal(inheritance.sixTables.blocks,137);assert.equal(inheritance.sixTables.figures,94);
const mergedRoot=root+'/integration/coac244-283-bounded-merge-20261028';
const manifest=await read(mergedRoot+'/files.sha256.json');for(const f of manifest)assert.equal(sha(await readFile(mergedRoot+'/'+f.path)),f.sha256);
const merge=await import(pathToFileURL(mergedRoot+'/merge.mjs')),handoff=await read(mergedRoot+'/handoff.json');
const composition=await merge.verifyBoundedComposition(handoff.proof,handoff.derived.path,handoff.overlay.path);
assert(composition.passed);assert.equal(composition.displayInstalled,false);assert.equal(composition.admissionGranted,false);
const overlay=await read(handoff.overlay.path),proof=await read(handoff.proof),intakePath=root+'/integration/coac250-b0785-evidence-intake-20261028.json',intake=await read(intakePath);
assert.equal(intake.receipt.sha256,pins.receipt);assert.equal(intake.candidate.sha256,pins.candidate);assert.equal(intake.strictTargetPassed,false);assert.equal(intake.limitedUnknownOkay,true);
const limits=raw.output.mandatoryLimits;
function assertOutcome(r,o){assert.equal(r.modelReview.seatVerdict,'faithful');assert.equal(r.modelReview.contextFaithful,true);assert.equal(r.modelReview.unknownTeachingImpact,'nonblocking-with-limits');assert.equal(r.targetPassed,false);assert.equal(r.limitedUnknownOkay,true);assert.equal(r.status,'needs-repair-or-uncertain');same(r.modelReview.issues,raw.output.issues);assert.equal(r.modelReview.issues.length,1);assert.equal(r.modelReview.issues[0].severity,'uncertain');assert.equal(r.wholeChapterAccepted,false);assert.equal(r.standardWholeArticlePassed,false);assert.equal(r.admissionGranted,false);same(o.limits,limits);assert.equal(o.limits.length,4);assert.equal(o.authorText,false);assert.equal(o.label,'来源限制（编者说明，非作者原文）');same(o.unknowns,figure.unknowns);same(o.retainedRawIssue,r.modelReview.issues[0]);assert.equal(o.originalTargetPassed,false);assert.equal(o.wholeChapterAccepted,false);assert.equal(o.actualMcpArenaReadback,null);assert(o.requiresActualDisplayReadback);assert.equal(o.anchor.beforeFigureId,target);assert.equal(o.anchor.afterSourceBlockId,'modern-yabejp-ja:chapter06-exercise003:b0784');assert(o.anchor.mustBeVisibleWithTarget);same(o.defaultConditionSourceBlocks,candidate.body.blocks.filter(b=>b.sourceBlockIds.some(id=>['b0003','b0004','b0005'].some(n=>id.endsWith(':'+n)))));}
assertOutcome(receipt,overlay);
const negatives=[];
for(const [name,change] of [['target-pass-forged',(r,o)=>r.targetPassed=true],['uncertain-removed',(r,o)=>r.modelReview.issues=[]],['uncertain-relabelled',(r,o)=>r.modelReview.issues[0].severity='source-note'],['chapter-pass-forged',(r,o)=>r.wholeChapterAccepted=true],['missing-limit',(r,o)=>o.limits.pop()],['limit-paraphrase',(r,o)=>o.limits[1]='默认条件等于截图实况'],['author-note',(r,o)=>o.authorText=true],['guess-unknown',(r,o)=>o.unknowns=[]],['unanchored',(r,o)=>o.anchor.mustBeVisibleWithTarget=false],['default-conditions-removed',(r,o)=>o.defaultConditionSourceBlocks=[]],['readback-invented',(r,o)=>o.actualMcpArenaReadback={passed:true}]]){const r=structuredClone(receipt),o=structuredClone(overlay);change(r,o);assert.throws(()=>assertOutcome(r,o),name);negatives.push({name,rejected:true});}
const previewPath=root+'/integration/accepted-preview-current.json',preview=await read(previewPath),selected=[];
for(const s of preview.selectedWeb??[]){const path=/^(?:[A-Za-z]:|[/\\])/.test(s.candidatePath)?s.candidatePath:root+'/'+s.candidatePath;const c=await read(path);if(c.source?.sourceId===candidate.source.sourceId&&c.source?.articleId===candidate.source.articleId)selected.push(s);}
assert.equal(selected.length,0,'current scope requires actual display proof before admission; inspect new owner state rather than infer it');
refs.overlay=await bind(handoff.overlay.path);refs.compositionProof=await bind(handoff.proof);refs.mergeManifest=await bind(mergedRoot+'/files.sha256.json');refs.existing250Intake=await bind(intakePath);refs.preview=await bind(previewPath);
const report={schema:'coac269-b0785-real-review-consumption/1',recordedAt:new Date().toISOString(),canonical:receipt.canonical,targetId:target,candidate:receipt.candidate,refs,
 conclusions:{seatVerdict:'faithful',contextFaithful:true,unknownTeachingImpact:'nonblocking-with-limits',limitedUnknownOkay:true,strictTargetPassed:false,status:receipt.status,retainedUncertain:receipt.modelReview.issues[0],wholeChapterAccepted:false,admissionGranted:false},
 actualCall:receipt.call,actualMaker:production.call,budget:{maker:1,independent:1,consumed:2,maximum:2,remaining:0,newCallsThisRun:0,retries:0,fee:null,remoteWeights:null,upstreamExecutionCount:null},
 ownerDedup:{alreadyConsumedBy250:true,intakeStatus:intake.status,existingContractOwner:'COAC-244',existingDisplayWriter:'COAC-250',duplicateConsumersStarted:0,contractReused:true,otherScopeNotReassembled:true},
 display:{contractPrepared:true,contractCandidate:handoff.derived,targetObjectHash:hash(figure),originalCandidate:pins.candidate,originalTargetObjectPreserved:true,authorTextChanged:false,originalUnknowns:figure.unknowns,limits:limits.map((text,i)=>({index:i+1,text,rawField:'/output/mandatoryLimits/'+i,exactContractTextMatched:overlay.limits[i]===text,rawQuoteBinding:proof.mandatoryLimitQuoteBindings[i],installed:false,actualDisplayVerified:false})),defaultConditionSourceBlocks:overlay.defaultConditionSourceBlocks,anchor:overlay.anchor,label:overlay.label,currentPreviewSelected:false,currentPreviewCreatedAt:preview.createdAt,actualMcpArenaReadback:null,status:'existing-contract-ready-display-install-and-readback-pending',nextAction:'Existing250 writer installs the verbatim non-author contract with Q48 and verifies all four limits, default-condition versus screenshot distinction, full unknowns and prior scope restrictions through actual MCP/Arena readback. No new model, OCR, maker or consumer.'},
 inheritance:{bodyBlocksUnchanged:1195,nonTargetFiguresUnchanged:523,passedBlocks:inheritance.passedBlocks,sixTables:inheritance.sixTables,Q8:inheritance.Q8,batch010:inheritance.batch010},compositionReadOnlyVerification:composition,negativeChecks:negatives};
for(const [k,p] of Object.entries(paths))assert.equal(sha(await readFile(p)),pins[k]);assert.equal(sha(await readFile(receipt.candidate.path)),pins.candidate);assert.equal(sha(await readFile(receipt.runtime.path)),pins.runtime);
for(const [name,path] of [['receipt.json',paths.receipt],['raw.json',paths.raw],['inheritance.json',paths.inheritance],['display-contract.json',handoff.overlay.path]])await writeFile(here+'/'+name,await readFile(path),{flag:'wx'});
for(const path of [here+'/verification.json',root+'/integration/coac269-b0785-result-consumed-20261028.json'])await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified:true,seatVerdict:report.conclusions.seatVerdict,limitedUnknownOkay:true,targetPassed:false,uncertainPreserved:true,limits:4,displayVerified:false,newModelCalls:0,negativeChecks:negatives.length,sharedResult:root+'/integration/coac269-b0785-result-consumed-20261028.json'}));
