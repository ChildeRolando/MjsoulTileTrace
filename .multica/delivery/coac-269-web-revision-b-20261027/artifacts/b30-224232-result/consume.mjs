// Fixed-SHA, zero-model receipt consumption. No producer/reviewer/admission invocation.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root='E:/AgentData/Coach/knowledge/processing',here=import.meta.dirname;
const load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex'),hash=o=>sha(JSON.stringify(o)),same=(a,b)=>assert.deepEqual(a,b);
const bind=async path=>({path,sha256:sha(await readFile(path))});
const runtimeSHA='0d890d3bbfd3fe1dbe588f068e17de41312916c1d068d246d080d0ec6feaa973',rt=root+'/audit/runtimes/coac269-224232-exact-v1-20261028';
const pins={
 '224':{candidate:'82c282e5546ed39278a878cb160ef5ef7645d0190fded81d5b21fd5f5a3b01ea',receipt:'20d624441531f37ebd9b69f5407c69dd03a5eedbc6390edc04fe51c108be4c20',raw:'51549ca0d773aae36a5edee8757571b2f877c5cf82ab0886ffbe99793b9df0e4',inheritance:'e9b87d53957533391e300056d4e680ee6e7266ee238e0af1569127331a18d28d',proposal:'7827175073c2bb76c348dc33a13eff8aca026da9e553e55d13f630c1580cf8e5',call:'7d1efbaa-589f-4b2e-9199-28f7141f890b',pairs:15,limits:5,unchangedBody:15,unchangedFigures:0},
 '232':{candidate:'d01f86961149215b82d5664f4dbda0bf29046ef87b11de8aa1b50ba9271d19fb',receipt:'5ed3b5117151b9cf5555d223d714131c5593f1f9042c6e91a9bb005a68fbb9ea',raw:'426d49b11f72317b32fdf1b6b7a14ba6308ec8db9da9ae7706079933304eea3c',inheritance:'5b951df43fbd4becb26d5d3767641cf5ae68db2f71875acf89d1d6668bb50324',proposal:'ec96eb728673aedb18fbaf9c8a801c7eb99b692690545311959577fddbc9071c',call:'0dae5b1a-76be-45d5-b2f0-410bc5853cb3',pairs:14,limits:7,unchangedBody:12,unchangedFigures:2}
};
assert.equal(sha(await readFile(rt+'/runtime-manifest.json')),runtimeSHA);
const runtime=await load(rt+'/runtime-manifest.json');assert.equal(runtime.files.length,32);
for(const f of runtime.files)assert.equal(sha(await readFile(f.path)),f.sha256);
const m=await import(pathToFileURL(rt+'/pair.mjs'));
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse);
const previewBytes=await readFile(root+'/integration/accepted-preview-current.json'),preview=JSON.parse(previewBytes);
const humanRoot=root+'/../human-annotations',queueBytes=await readFile(humanRoot+'/queue.json'),queue=JSON.parse(queueBytes);
const eventBytes=await readFile(humanRoot+'/events.jsonl'),events=eventBytes.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
const reports=[],copies=[];
for(const key of ['224','232']){
 const pin=pins[key],paths={receipt:root+'/integration/coac249-'+key+'-target-impact-reviewed-20261028.json',raw:root+'/audit/calls/'+pin.call+'.json',inheritance:root+'/integration/coac249-'+key+'-scope-inheritance-20261028.json',proposal:root+'/integration/coac249-'+key+'-display-and-residual-20261028.json'};
 const refs={};for(const [k,path] of Object.entries(paths)){refs[k]=await bind(path);assert.equal(refs[k].sha256,pin[k]);}
 const r=await load(paths.receipt),raw=await load(paths.raw),inherit=await load(paths.inheritance),proposal=await load(paths.proposal);
 assert.equal(r.candidate.sha256,pin.candidate);assert.equal(r.runtime.sha256,runtimeSHA);
 for(const k of ['candidate','source','parent','parentAudit','runtime','handoff','plan']){refs[k]=r[k];assert.equal(sha(await readFile(r[k].path)),r[k].sha256);}
 const production=await m.verifyProduction(key,r.candidate.path,runtimeSHA);same(production,r.productionProof);
 const plan=await load(r.plan.path);same(plan,await m.prepareReview(key,r.candidate.path,runtimeSHA));
 const published=await load(m.stage+'/'+key+'-review-request.json');same(plan,published.plan);same(raw.requestPrompt,published.actual.closedPrompt);same(raw.schema,published.plan.schema);same(raw.requestExecution.images,published.actual.requestExecution.images);
 const verification=await m.verifyReviewExecution(key,raw,plan,runtimeSHA);same(verification,r.verification);assert.equal(r.verificationError,null);
 same(raw.output,JSON.parse(raw.rawLastMessage));same(raw.output,r.modelReview);same(raw.usage,r.call.usage);same(raw.requestExecution,r.call.requestExecution);same(raw.durationMs,r.call.durationMs);same(raw.callId,pin.call);
 assert(raw.success&&raw.exitCode===0&&!raw.timedOut);assert(raw.events.some(x=>x.type==='thread.started'));assert(raw.events.some(x=>x.type==='turn.completed'));
 assert.equal(r.call.model,'gpt-6.1-terra');assert.equal(r.call.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,2);assert.equal(r.orderedPairs,pin.pairs);
 same(ledger.filter(c=>c.binding?.productionSha256===pin.candidate),[r.call]);
 const unavailableHistoricalObservations=[];
 for(const ref of inherit.refs){try{assert.equal(sha(await readFile(ref.path)),ref.sha256);}catch(e){if(e.code!=='ENOENT'||!ref.observedPath||!/[\\/]admission-[01]-(preview|register)\.json$/.test(ref.path))throw e;unavailableHistoricalObservations.push({...ref,status:'historical-private-observation-unavailable-not-recreated'});}}
 same(inherit.rawVerification,verification);same(inherit.candidate,r.candidate);assert(inherit.uniqueStandardLedger&&inherit.fullSourceCandidatePairingExact);
 assert.equal(production.unchangedBodyBlocks,pin.unchangedBody);assert.equal(production.unchangedNonTargetFigures,pin.unchangedFigures);
 const candidate=await load(r.candidate.path),parent=await load(r.parent.path);
 assert.equal(candidate.body.blocks.filter((b,i)=>JSON.stringify(b)===JSON.stringify(parent.body.blocks[i])).length,pin.unchangedBody);
 assert.equal(candidate.figures.filter((b,i)=>JSON.stringify(b)===JSON.stringify(parent.figures[i])).length,pin.unchangedFigures);
 const limits=[...new Set(raw.output.unknownImpacts.flatMap(x=>x.requiredDisplayLimitations))];assert.equal(limits.length,pin.limits);same(limits,proposal.requiredDisplayLimitations);same(limits,inherit.requiredDisplayLimitations);
 for(const f of proposal.figureBindings){const fig=candidate.figures.find(x=>x.figureId===f.figureId);assert.equal(hash(fig),f.fullFigureSha256);for(const k of ['unknowns','caption','sourceNotes'])same(fig[k],f[k]);}
 function assertOutcome(receipt,p){
  assert.equal(receipt.status,'needs-repair-or-uncertain');assert.equal(receipt.verification.transportCompleted,true);assert.equal(receipt.verification.repairPassed,false);assert.equal(receipt.verification.limitedUnknownOkay,false);assert.equal(receipt.verification.wholeChapterAccepted,false);
  same(receipt.modelReview,raw.output);same(receipt.verification.modelReview,raw.output);assert.equal(receipt.wholeChapterPassed,false);assert.equal(receipt.admissionGranted,false);
  same(p.modelReview,raw.output);same(p.verification,verification);same(p.candidate,r.candidate);for(const k of ['receipt','raw']){assert.equal(resolve(p[k].path),resolve(refs[k].path));assert.equal(p[k].sha256,refs[k].sha256);}
  same(p.figureBindings,proposal.figureBindings);same(p.requiredDisplayLimitations,limits);assert.equal(p.proposalOnly,true);assert.equal(p.implementationVerified,false);assert.equal(p.actualReadbackRequired,true);assert.equal(p.authorBodyInjection,false);assert.equal(p.admissionGranted,false);assert.equal(p.wholeChapterPassed,false);
 }
 assertOutcome(r,proposal);
 const negativeChecks=[];
 for(const [name,change] of [['repair-upgraded',(r,p)=>r.verification.repairPassed=true],['unknown-upgraded',(r,p)=>r.verification.limitedUnknownOkay=true],['issue-removed',(r,p)=>r.modelReview.issues=[]],['issue-relabelled',(r,p)=>r.modelReview.issues[0].severity='source-note'],['target-forged',(r,p)=>r.modelReview.targetChecks.at(-1).verdict='faithful'],['whole-chapter-passed',(r,p)=>r.wholeChapterPassed=true],['missing-limit',(r,p)=>p.requiredDisplayLimitations.pop()],['limit-paraphrased',(r,p)=>p.requiredDisplayLimitations[0]+='可推算'],['wrong-sha',(r,p)=>p.candidate.sha256='0'.repeat(64)],['wrong-figure',(r,p)=>p.figureBindings[0].fullFigureSha256='0'.repeat(64)],['pretend-installed',(r,p)=>p.implementationVerified=true],['author-note',(r,p)=>p.authorBodyInjection=true],['pretend-admitted',(r,p)=>p.admissionGranted=true]]){const rr=structuredClone(r),pp=structuredClone(proposal);change(rr,pp);assert.throws(()=>assertOutcome(rr,pp),name);negativeChecks.push({name,rejected:true});}
 let residual;
 if(key==='224'){
  const maker=await load(production.raw.path),rows=maker.output.rows;assert.equal(rows.length,7);assert(rows.every(x=>x.values.length===15));assert.equal(rows.flatMap(x=>x.values).filter(v=>v==='unknown').length,24);
  const points=[['放铳率',6,'15—16附近'],['放铳率',7,'15—16附近'],['和牌中自摸所占比例',6,'约49'],['立直棒被没收率',12,'约20—21'],['和牌时一发比例',6,'约16—17'],['和牌时一发比例',7,'约16—17'],['和牌时一发比例',12,'约22']].map(([series,turn,reviewerApproximateEvidence])=>{const row=rows.findIndex(x=>x.series===series);assert(row>=0);assert.equal(rows[row].values[turn-1],'unknown');return {series,turn,makerRawPointer:'/output/rows/'+row+'/values/'+(turn-1),currentValue:'unknown',reviewerApproximateEvidence,evidenceSource:'/output/issues/0/sourceEvidence',applied:false};});
  assert.equal(raw.output.issues[0].severity,'error');assert.equal(raw.output.issues[1].severity,'source-note');same(candidate.body,parent.body);
  residual={kind:'chart-readable-approximate-points-still-missing',targetId:raw.output.targetChecks[0].id,originalCells:105,recordedApproximateCells:81,recordedUnknownCells:24,atLeastSevenDirectlyFlaggedPoints:points,pointEvidenceIsNotNewMakerRaw:true,otherUnknownPointsNotSolved:true,sourceNoteB0008:raw.output.issues[1],sourceNoteTextUnchanged:true,conditionsAndApparentlyEffectiveStrengthPreserved:true,unitNotInvented:true,nextAction:'No calls authorized. Preserve real error and partial-table status; existing owners record the seven exact residual slots. No interpolation, auto-maker, review retry or admission.'};
 }else{
  same(raw.output.targetChecks.map(x=>x.verdict),['faithful','faithful','uncertain']);same(candidate.figures.map(x=>x.unknowns),parent.figures.map(x=>x.unknowns));
  const blocking=raw.output.unknownImpacts.filter(x=>x.disposition==='blocking');assert.equal(blocking.length,1);
  residual={kind:'right-river-second-manzu-blocks-complete-figure-check',faithfulTextTargets:raw.output.targetChecks.slice(0,2),corrected3sFactEvidence:raw.output.targetChecks[2].evidence,figureTargetVerdict:'uncertain',blockingUnknownImpacts:blocking,otherUnknownImpacts:raw.output.unknownImpacts.filter(x=>x.disposition!=='blocking'),rightRiverTileAndRedStateUnresolved:true,nextAction:'Keep existing human target and original unknown. No paid guessing, maker, repeat review or figure/whole-chapter pass; record text fidelity and corrected3s fact separately from the uncertain target verdict.'};
 }
 const humanItems=queue.items.filter(x=>x.canonical===r.canonical),humanEvents=events.filter(x=>x.canonical===r.canonical);
 const limitationMap=limits.map((text,i)=>({index:i+1,text,rawQuotes:raw.output.unknownImpacts.flatMap((u,j)=>u.requiredDisplayLimitations.flatMap((t,k)=>t===text?[{pointer:'/output/unknownImpacts/'+j+'/requiredDisplayLimitations/'+k,unknownText:u.unknownText,sourceBlockIds:u.sourceBlockIds,authorClaim:u.authorClaim,disposition:u.disposition}]:[])),proposalPointer:'/requiredDisplayLimitations/'+i,implementationVerified:false}));
 reports.push({key,canonical:r.canonical,candidate:r.candidate,refs,actualMaker:production.call,actualReview:r.call,status:r.status,verification,issues:raw.output.issues,residual,limitationMap,figureBindings:proposal.figureBindings,displayLabel:proposal.label,displayImplementationVerified:false,admissionGranted:false,wholeChapterPassed:false,exactCandidateInCurrentPreview:JSON.stringify(preview.selectedWeb??[]).includes(pin.candidate),orderedPairs:r.orderedPairs,unchangedBodyBlocks:pin.unchangedBody,unchangedFigures:pin.unchangedFigures,inheritanceRefsRehashed:inherit.refs.length-unavailableHistoricalObservations.length,unavailableHistoricalObservations,human:{items:humanItems,events:humanEvents,queueSha256:sha(queueBytes),eventsSha256:sha(eventBytes),queueChanged:false},negativeChecks,budget:r.chapterPhaseCalls});
 for(const [k,path] of Object.entries(paths))copies.push({name:key+'-'+k+'.json',path,sha256:pin[k]});
 for(const [k,path] of Object.entries(paths))assert.equal(sha(await readFile(path)),pin[k]);assert.equal(sha(await readFile(r.candidate.path)),pin.candidate);
}
for(const f of runtime.files)assert.equal(sha(await readFile(f.path)),f.sha256);assert.equal(sha(await readFile(rt+'/runtime-manifest.json')),runtimeSHA);
const result={schema:'coac269-224232-real-review-consumption/1',recordedAt:new Date().toISOString(),authorizationComment:'01a181c4-730d-7821-8325-b8bc9e48a7cc',reports,ownerDedup:await load(here+'/owner-state.json'),previewObservation:{sha256:sha(previewBytes),createdAt:preview.createdAt},copies,budget:{maker:2,independentReview:2,consumed:4,maximum:4,remaining:0,newCallsThisRun:0,retries:0,fee:null,remoteWeights:null,upstreamExecutionCount:null},newConsumers:0,globalStateWritten:false,sourceCandidateRawAuditChanged:false};
for(const c of copies)await writeFile(here+'/'+c.name,await readFile(c.path),{flag:'wx'});
for(const path of [here+'/verification.json',root+'/integration/coac269-224232-results-consumed-20261028.json'])await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified:true,newCalls:0,runtimeFiles:32,chapters:reports.map(r=>({key:r.key,repairPassed:r.verification.repairPassed,limitedUnknownOkay:r.verification.limitedUnknownOkay,limits:r.limitationMap.length,inheritanceRefs:r.inheritanceRefsRehashed})),negativeChecks:26}));
