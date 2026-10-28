// Record completed224/232 review evidence; never invokes, repairs or admits anything.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const P='E:/AgentData/Coach/knowledge/processing',O=fileURLToPath(new URL('./',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const pins={224:{candidate:'82c282e5546ed39278a878cb160ef5ef7645d0190fded81d5b21fd5f5a3b01ea',receipt:'20d624441531f37ebd9b69f5407c69dd03a5eedbc6390edc04fe51c108be4c20',raw:'51549ca0d773aae36a5edee8757571b2f877c5cf82ab0886ffbe99793b9df0e4',inherit:'e9b87d53957533391e300056d4e680ee6e7266ee238e0af1569127331a18d28d',proposal:'7827175073c2bb76c348dc33a13eff8aca026da9e553e55d13f630c1580cf8e5'},
232:{candidate:'d01f86961149215b82d5664f4dbda0bf29046ef87b11de8aa1b50ba9271d19fb',receipt:'5ed3b5117151b9cf5555d223d714131c5593f1f9042c6e91a9bb005a68fbb9ea',raw:'426d49b11f72317b32fdf1b6b7a14ba6308ec8db9da9ae7706079933304eea3c',inherit:'5b951df43fbd4becb26d5d3767641cf5ae68db2f71875acf89d1d6668bb50324',proposal:'ec96eb728673aedb18fbaf9c8a801c7eb99b692690545311959577fddbc9071c'}};
const pairPath=P+'/audit/runtimes/coac269-224232-exact-v1-20261028/pair.mjs',pair=await import(pathToFileURL(pairPath));
const bound=async r=>{const b=await readFile(r.path);assert.equal(sha(b),r.sha256,r.path);return JSON.parse(b);};
const results=[];await mkdir(O+'/evidence',{recursive:true});
for(const key of ['224','232']){
 const pin=pins[key],rr={path:P+'/integration/coac249-'+key+'-target-impact-reviewed-20261028.json',sha256:pin.receipt},ir={path:P+'/integration/coac249-'+key+'-scope-inheritance-20261028.json',sha256:pin.inherit},qr={path:P+'/integration/coac249-'+key+'-display-and-residual-20261028.json',sha256:pin.proposal};
 const r=await bound(rr),inheritance=await bound(ir),proposal=await bound(qr);assert.equal(r.canonical,'nemata-jp-chapter-'+key+'-1');assert.equal(r.candidate.sha256,pin.candidate);assert.equal(r.raw.sha256,pin.raw);
 const c=await bound(r.candidate),parent=await bound(r.parent),source=await bound(r.source),old=await bound(r.parentAudit),raw=await bound(r.raw),plan=await bound(r.plan),rt=await bound(r.runtime),maker=await bound(r.productionProof.raw);
 assert.equal(rt.files.length,32);for(const f of rt.files)assert.equal(sha(await readFile(f.path)),f.sha256);
 const rebuilt=await pair.prepareReview(key,r.candidate.path,r.runtime.sha256);assert.deepEqual(rebuilt,plan);
 assert.deepEqual(await pair.verifyReviewExecution(key,raw,plan,r.runtime.sha256),r.verification);
 assert.equal(r.verification.transportCompleted,true);assert.equal(r.verification.repairPassed,false);assert.equal(r.verification.limitedUnknownOkay,false);assert.equal(r.verification.wholeChapterAccepted,false);
 assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);assert.equal(raw.model,'gpt-6.1-terra');assert.equal(raw.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,2);
 for(let i=0;i<2;i++){const a=raw.requestExecution.images[i];assert.equal(a.path,plan.images[i]);assert.equal(sha(await readFile(a.path)),a.sha256);assert.equal((await readFile(a.path)).length,a.bytes);}
 const projection=JSON.parse(plan.prompt.slice(plan.prompt.indexOf('\n')+1));assert.deepEqual(projection.orderedContext.flatMap(x=>x.source),source.blocks);
 const m=raw.output;assert.equal(m.contextContinuity.verdict,'faithful');assert.equal(m.scopeComplete,'yes');assert.equal(r.status,'needs-repair-or-uncertain');assert.equal(r.admissionGranted,false);assert.equal(r.wholeChapterPassed,false);
 const ledger=(await readFile(P+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.deepEqual(ledger,[r.call]);
 const targetId=pair.job(key).repairFigureIds[0],target=c.figures.find(x=>x.figureId===targetId),textIds=pair.job(key).textIds;
 assert.deepEqual(target.unknowns,m.unknownImpacts.map(x=>x.unknownText));
 for(const b of c.body.blocks)if(!textIds.includes(b.sourceBlockIds[0]))assert.deepEqual(b,parent.body.blocks.find(x=>JSON.stringify(x.sourceBlockIds)===JSON.stringify(b.sourceBlockIds)));
 for(const f of c.figures)if(f.figureId!==targetId)assert.deepEqual(f,parent.figures.find(x=>x.figureId===f.figureId));
 assert.deepEqual(c.source,parent.source);assert.deepEqual(proposal.requiredDisplayLimitations,[...new Set(m.unknownImpacts.flatMap(x=>x.requiredDisplayLimitations))]);
 for(const k of ['implementationVerified','authorBodyInjection','admissionGranted','wholeChapterPassed'])assert.equal(proposal[k],false);
 let residual;
 if(key==='224'){
  assert.equal(c.body.blocks.length,15);assert.equal(c.figures.length,1);assert.equal(m.targetChecks.length,1);assert.equal(m.targetChecks[0].verdict,'needs-repair');
  assert.deepEqual(m.issues.map(x=>x.severity),['error','source-note']);assert(m.unknownImpacts.every(x=>x.disposition==='nonblocking-with-limits'));assert.equal(proposal.requiredDisplayLimitations.length,5);
  const data=maker.output;assert.equal(data.rows.length,7);assert(data.rows.every(x=>x.values.length===15));const cells=data.rows.flatMap(x=>x.values);assert.equal(cells.length,105);assert.equal(cells.filter(x=>x==='unknown').length,24);assert.equal(cells.filter(x=>x!=='unknown').length,81);
  const j=pair.job(key),packet=await load(j.packet.path);assert.equal(pair.chartRender(packet,data),target.transcription);
  const slots=[['放铳率',6,'约15—16'],['放铳率',7,'约15—16'],['和牌中自摸所占比例',6,'约49'],['立直棒被没收率',12,'约20—21'],['和牌时一发比例',6,'约16—17'],['和牌时一发比例',7,'约16—17'],['和牌时一发比例',12,'约22']].map(([series,turn,reviewApproximation])=>{
   const row=data.rows.findIndex(r=>r.series===series);assert(row>=0);assert.equal(data.rows[row].values[turn-1],'unknown');return {series,turn,makerRawPointer:'/output/rows/'+row+'/values/'+(turn-1),current:'unknown',reviewApproximation,sourceEvidencePointer:'/issues/0/sourceEvidence',sourceEvidence:m.issues[0].sourceEvidence,proposedOnly:true};});
  assert.equal(data.rows.find(x=>x.series==='和牌率').values[12],'约30');
  residual={kind:'current-quantitative-omission',chartSlots:slots,existingReadings:81,currentUnknownSlots:24,minimumKnownOmissions:7,remainingSlotUnknownsAfterOnlyTheseSeven:17,
   makerDataOriginal:data,rendererSha256:sha(await readFile(pairPath)),unknownPreciseCoordinatesAndUnitPreserved:target.unknowns,limits:proposal.requiredDisplayLimitations,
   nextProposal:{authorized:false,makerMaximum:1,targetReviewMaximum:1,newCallsMaximum:2,retry:0,failedVoidCount:true,
    target:'Only the seven listed cells and the corresponding derived transcript through an authorized frozen renderer; protect all other cells, units, legends, source-note and all 15 body blocks. Range endpoints must not be selected by the controller. No interpolation or review evidence masquerading as a maker output.',
    context:'Bind original seven series/105-slot maker data, complete original graph and same-pixel view, all 15 source/candidate blocks and b0003/b0012-b0014 author conditions. Audit only changed values plus unchanged-range evidence; do not repeat all 105 slots.'}};
 }else{
  assert.equal(c.body.blocks.length,14);assert.equal(c.figures.length,3);assert.deepEqual(m.targetChecks.map(x=>x.verdict),['faithful','faithful','uncertain']);
  assert.deepEqual(m.unknownImpacts.map(x=>x.disposition),['blocking','nonblocking-with-limits','nonblocking-with-limits']);assert.deepEqual(m.issues.map(x=>x.severity),['uncertain']);assert.equal(proposal.requiredDisplayLimitations.length,7);
  residual={kind:'retained-unknown-with-explicit-independent-blocking',resolvedTextTargets:m.targetChecks.slice(0,2),confirmed3sEvidence:m.targetChecks[2].evidence,
   blockingUnknown:m.unknownImpacts[0],otherLimitedUnknowns:m.unknownImpacts.slice(1),limits:proposal.requiredDisplayLimitations,
   nextProposal:{authorized:false,makerMaximum:0,newCallsMaximum:1,targetImpactReviewMaximum:1,retry:0,failedVoidCount:true,
    prerequisite:'First reuse existing raw and full author context to distinguish bounded author-statement fidelity from complete tile-ledger certification in the existing owner; preserve disposition=blocking and do not admit on that distinction alone.',
    target:'Only if newly authorized and still needed, one independent clarification of whether right-side second unknown manzu blocks specified author rank/white-discard/meld-choice contributions; preserve original image and unknown, do not re-identify all river tiles, do not re-make faithful text or 3s.',
    context:'All 14 source/candidate pairs, full current/parent target figures and original image/same-pixel view, especially b0004-b0010 and the original blocking rationale. If clearer source evidence is supplied, bind its actual source/resolution before any new tile reading. No resolution is promised.'}};
 }
 const refs=[rr,ir,qr,r.raw,r.candidate,r.source,r.parent,r.parentAudit,r.plan,r.runtime,r.handoff,r.productionProof.raw],archive=[];
 for(const[i,f]of refs.entries()){await bound(f);const name=key+'e'+i+'.json';await copyFile(f.path,O+'/evidence/'+name);archive.push({...f,copy:'evidence/'+name});}
 const dependencies=[...refs,...rt.files];for(const f of dependencies)assert.equal(sha(await readFile(f.path)),f.sha256);
 const result={canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,parentAudit:r.parentAudit,receipt:rr,raw:r.raw,actualCall:r.call,status:r.status,verification:r.verification,
  sourceBlockCount:source.blocks.length,unchangedBodyBlocks:r.productionProof.unchangedBodyBlocks,unchangedNonTargetFigures:r.productionProof.unchangedNonTargetFigures,
  targetChecks:m.targetChecks,unknownImpacts:m.unknownImpacts,issues:m.issues,originalParentIssues:old.modelReview.issues,residual,
  fullTargetFigureSha256:sha(JSON.stringify(target)),phaseBudget:r.chapterPhaseCalls,dependencies,archive,admissionGranted:false,wholeChapterPassed:false,limitsInstalled:false,
  originalRequestAndProductionChainVerified:true,uniqueLedger:true,newCalls:0,newConsumers:0,fee:'unknown',upstreamExecutions:'unknown',remoteWeights:'unknown'};
 await writeFile(O+'/recorded'+key+'.json',JSON.stringify(result,null,2)+'\n');results.push(result);
}
await writeFile(O+'/remaining-update.json',JSON.stringify({scope:'only exact224/232; global coverage remains owned by250',items:results.map(x=>({canonical:x.canonical,candidate:x.candidate,receipt:x.receipt,residual:x.residual,originalChecks:x.verification,admissionGranted:false})),batchUsed:4,batchMaximum:4,remaining:0,newCalls:0,newConsumers:0,wholeBookComplete:false},null,2)+'\n');
console.log(JSON.stringify(results.map(x=>({canonical:x.canonical,sourceBlocks:x.sourceBlockCount,repairPassed:false,limitedUnknownOkay:false,residual:x.residual.kind,newCalls:0,admissionGranted:false}))));
