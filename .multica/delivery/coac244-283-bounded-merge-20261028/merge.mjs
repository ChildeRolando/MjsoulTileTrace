// One exact zero-model data composition; no invoke import, no integration pointer writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',O=fileURLToPath(new URL('./',import.meta.url));
const D=P+'/integration/coac244-283-bounded-merge-20261028';
const canonical='nemata-jp-chapter-283-1',prefix='modern-yabejp-ja:chapter06-exercise003:';
const id785=prefix+'b0785:figure',id947=prefix+'b0947:figure';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
const load=async p=>JSON.parse(await readFile(p)),same=(a,b)=>assert.deepEqual(a,b);
const save=(name,x)=>writeFile(join(O,name),JSON.stringify(x,null,2)+'\n');
const ref=async path=>({path,sha256:sha(await readFile(path))});
const get=async b=>{const data=await readFile(b.path);assert.equal(sha(data),b.sha256,'pinned input');return JSON.parse(data);};
const figure=(c,id)=>c.figures.find(f=>f.figureId===id);
const pins={receipt:'49dc8c91614a3a4b726b41e69f3c2ddcdbd581c31973763930b222c11bd88b36',raw:'15d6f153d54e1beb35b2405caa8943d6cf79ccb180a8badfd58917a676b1b9c5',inheritance:'bd8e040789cef358c4b615a3a97a2e6ee4edf896a8b7353ab418a4a56b4191a7',candidate:'434120af284195ddf27b491a1c2c4cd9ea25072d40e9c6a366bcd8ac3cb03b9b',runtime:'d167ab2e2beab21dda23336b40e341e1972ffbd894b2413702f04f8d08b3a4bb',call:'4690455a-50a9-4675-8572-27e789204cc6',b0947:'ee733318a7cc1b62668f8f8b0d6c9ece03bb0c1321b5c5c3a14e5ccf012a7c53'};
export async function verifyExistingEvidence(){
 const receiptRef={path:P+'/integration/coac249-283-0785-reviewed-20261028.json',sha256:pins.receipt};
 const r=await get(receiptRef),raw=await get(r.raw),current=await get(r.candidate),source=await get(r.source);
 assert.equal(r.candidate.sha256,pins.candidate);assert.equal(r.raw.sha256,pins.raw);assert.equal(raw.callId,pins.call);
 same(raw.output,JSON.parse(raw.rawLastMessage));same(raw.output,r.modelReview);
 assert.equal(r.runtime.sha256,pins.runtime);
 const {verify0785Production,verify0785ReviewExecution}=await import(pathToFileURL(P+'/audit/runtimes/coac269-283-0785-v1-20261028/b0785.mjs'));
 const production=await verify0785Production(P,r.candidate.path,pins.runtime);
 const plan=await get(r.plan);const review=await verify0785ReviewExecution(raw,plan,pins.runtime);
 assert.equal(review.targetPassed,false);assert.equal(review.limitedUnknownOkay,true);same(review,r.verification);
 const ledger=(await readFile(P+'/audit/calls.jsonl','utf8')).trim().split('\n').map(JSON.parse).filter(c=>c.callId===pins.call);
 assert.equal(ledger.length,1);
 const inheritance=await get({path:P+'/integration/coac249-283-0785-scope-inheritance-20261028.json',sha256:pins.inheritance});
 for(const b of inheritance.refs)await getOrHash(b);
 same(inheritance.candidate,r.candidate);assert.equal(inheritance.bodyBlocksUnchanged,1195);assert.equal(inheritance.nonTargetFiguresUnchanged,523);
 const oldRoot=P+'/integration/coac244-283-0947-composition-20261028';
 const {verify0947Composition}=await import(pathToFileURL(oldRoot+'/compose.mjs'));
 const b0947Proof=await load(oldRoot+'/composition-proof.json');
 const b0947Verification=await verify0947Composition(oldRoot+'/composition-proof.json',b0947Proof.derived.path);
 assert(b0947Verification.passed);const priorDerived=await get(b0947Proof.derived),parent=await get(r.parent);
 same(current.body,parent.body);same(priorDerived.body,parent.body);
 assert.equal(hash(figure(priorDerived,id947)),pins.b0947);
 const donor=await get(r.reviewedDonor);same(figure(priorDerived,id947),figure(donor,id947));
 same(figure(current,id785).unknowns,figure(donor,id785).unknowns);
 assert.equal(r.modelReview.seatVerdict,'faithful');assert(r.modelReview.contextFaithful&&r.modelReview.preservedUnknowns.acknowledged);
 assert.equal(r.modelReview.unknownTeachingImpact,'nonblocking-with-limits');assert.equal(r.modelReview.mandatoryLimits.length,4);
 assert.equal(r.modelReview.issues.length,1);assert.equal(r.modelReview.issues[0].severity,'uncertain');
 return {r,raw,current,parent,source,donor,priorDerived,b0947Proof,b0947ProofRef:await ref(oldRoot+'/composition-proof.json'),production,review,receiptRef,inheritance};
}
async function getOrHash(b){const data=await readFile(b.path);assert.equal(sha(data),b.sha256);}
function verifyState(c,overlay,proof,e){
 assert.equal(proof.canonical,canonical);assert.equal(proof.primaryParent.sha256,pins.candidate);
 assert.equal(proof.b0785Receipt.sha256,pins.receipt);assert.equal(proof.b0785Raw.sha256,pins.raw);assert.equal(proof.b0785Call,pins.call);
 assert.equal(proof.b0947ObjectSha256,pins.b0947);assert.equal(proof.newModelCalls,0);
 assert.equal(proof.standardWholeArticlePassed,false);assert.equal(proof.admissionGranted,false);
 same(proof.b0947Donor,e.r.reviewedDonor);same(proof.b0947CompositionProof,e.b0947ProofRef);same(proof.b0785Runtime,e.r.runtime);
 assert.equal(proof.b0785OriginalTargetPassed,false);same(proof.b0785IndependentModelReview,e.r.modelReview);
 assert.equal(proof.mandatoryLimitQuoteBindings.length,4);
 const rawBytes=Buffer.from(e.raw.rawLastMessage);
 for(const [i,q]of proof.mandatoryLimitQuoteBindings.entries()){
  assert.equal(q.field,'/mandatoryLimits/'+i);assert.equal(q.text,e.r.modelReview.mandatoryLimits[i]);
  const literal=Buffer.from(JSON.stringify(q.text));assert.equal(q.rawLastMessageUtf8Length,literal.length);assert.equal(q.quotedJsonSha256,sha(literal));
  assert(rawBytes.subarray(q.rawLastMessageUtf8Start,q.rawLastMessageUtf8Start+q.rawLastMessageUtf8Length).equals(literal));
 }
 same(c.source,e.current.source);same(c.body,e.current.body);assert.equal(c.body.blocks.length,1195);
 same(figure(c,id785),figure(e.current,id785));same(figure(c,id947),figure(e.priorDerived,id947));
 assert.equal(c.figures.length,524);
 for(let i=0;i<c.figures.length;i++)if(c.figures[i].figureId!==id947)same(c.figures[i],e.current.figures[i]);
 const rewind=structuredClone(c);rewind.figures=c.figures.map(f=>f.figureId===id947?structuredClone(figure(e.current,id947)):f);
 delete rewind.scopeComposition;delete rewind.candidateSha256;
 const old=structuredClone(e.current);delete old.candidateSha256;same(rewind,old);
 const content={...c};delete content.candidateSha256;assert.equal(c.candidateSha256,hash(content));
 same(c.scopeComposition,{schema:'coac244-exact0785-0947-composition/1',canonical,primaryParent:proof.primaryParent,b0947Donor:proof.b0947Donor,
  b0785FigureSha256:hash(figure(e.current,id785)),b0947FigureSha256:pins.b0947,newModelCalls:0,standardWholeArticlePassed:false,wholeChapterAccepted:false});
 assert.equal(overlay.schema,'coac244-b0785-editorial-display-contract/1');assert.equal(overlay.canonical,canonical);
 assert.equal(overlay.candidateSha256,proof.derived.sha256);assert.equal(overlay.targetFigureSha256,hash(figure(c,id785)));
 assert.equal(overlay.authorText,false);assert.equal(overlay.kind,'editorial-source-limits');
 assert.equal(overlay.label,'来源限制（编者说明，非作者原文）');
 same(overlay.anchor,{afterSourceBlockId:prefix+'b0784',beforeFigureId:id785,scope:'Q48 only',mustBeVisibleWithTarget:true});
 same(overlay.limits,e.r.modelReview.mandatoryLimits);
 same(overlay.unknowns,figure(c,id785).unknowns);
 same(overlay.defaultConditionSourceBlocks,c.body.blocks.filter(b=>b.sourceBlockIds.some(id=>[prefix+'b0003',prefix+'b0004',prefix+'b0005'].includes(id))));
 same(overlay.retainedRawIssue,e.r.modelReview.issues[0]);assert.equal(overlay.originalTargetPassed,false);
 assert.equal(overlay.wholeChapterAccepted,false);assert.equal(overlay.actualMcpArenaReadback,null);
 assert.equal(overlay.requiresActualDisplayReadback,true);
 return {passed:true,scopedCompositionVerified:true,independentLimitedAllowance:true,originalTargetPassed:false,
  originalUncertainPreserved:true,authorBlocksUnchanged:1195,nonTargetFiguresUnchanged:522,
  b0785ExactObjectPreserved:true,b0947ExactObjectPreserved:true,mandatoryLimits:4,newModelCalls:0,
  displayContractPrepared:true,displayInstalled:false,admissionGranted:false,wholeChapterAccepted:false,standardWholeArticlePassed:false};
}
export async function verifyBoundedComposition(proofPath,candidatePath,overlayPath){
 const proof=await load(proofPath),e=await verifyExistingEvidence();
 assert.equal(sha(await readFile(candidatePath)),proof.derived.sha256);
 assert.equal(sha(await readFile(overlayPath)),proof.overlay.sha256);
 return verifyState(await load(candidatePath),await load(overlayPath),proof,e);
}
async function build(){
 const e=await verifyExistingEvidence(),c=structuredClone(e.current);
 c.figures[c.figures.findIndex(f=>f.figureId===id947)]=structuredClone(figure(e.priorDerived,id947));
 c.scopeComposition={schema:'coac244-exact0785-0947-composition/1',canonical,primaryParent:e.r.candidate,b0947Donor:e.r.reviewedDonor,
  b0785FigureSha256:hash(figure(e.current,id785)),b0947FigureSha256:pins.b0947,newModelCalls:0,standardWholeArticlePassed:false,wholeChapterAccepted:false};
 delete c.candidateSha256;c.candidateSha256=hash(c);
 await mkdir(join(O,'evidence'),{recursive:true});
 await save('chapter06-exercise003.bounded-composed.json',c);
 const derived={path:D+'/chapter06-exercise003.bounded-composed.json',sha256:sha(await readFile(join(O,'chapter06-exercise003.bounded-composed.json')))};
 const overlay={schema:'coac244-b0785-editorial-display-contract/1',canonical,candidateSha256:derived.sha256,targetFigureSha256:hash(figure(c,id785)),
  kind:'editorial-source-limits',authorText:false,label:'来源限制（编者说明，非作者原文）',
  anchor:{afterSourceBlockId:prefix+'b0784',beforeFigureId:id785,scope:'Q48 only',mustBeVisibleWithTarget:true},
  limits:e.r.modelReview.mandatoryLimits,unknowns:figure(c,id785).unknowns,
  defaultConditionSourceBlocks:c.body.blocks.filter(b=>b.sourceBlockIds.some(id=>[prefix+'b0003',prefix+'b0004',prefix+'b0005'].includes(id))),
  retainedRawIssue:e.r.modelReview.issues[0],originalTargetPassed:false,wholeChapterAccepted:false,actualMcpArenaReadback:null,requiresActualDisplayReadback:true};
 await save('b0785-display-contract.json',overlay);
 const quotes=e.r.modelReview.mandatoryLimits.map((text,i)=>{const bytes=Buffer.from(e.raw.rawLastMessage),q=Buffer.from(JSON.stringify(text)),start=bytes.indexOf(q);assert(start>=0);return {field:'/mandatoryLimits/'+i,text,rawLastMessageUtf8Start:start,rawLastMessageUtf8Length:q.length,quotedJsonSha256:sha(q)};});
 const proof={schema:'coac244-b0785-b0947-bounded-proof/1',canonical,primaryParent:e.r.candidate,b0785Receipt:e.receiptRef,b0785Raw:e.r.raw,b0785Call:pins.call,
  b0785Runtime:e.r.runtime,b0785FigureSha256:hash(figure(c,id785)),b0785OriginalTargetPassed:false,b0785IndependentModelReview:e.r.modelReview,
  b0947Donor:e.r.reviewedDonor,b0947CompositionProof:await ref(P+'/integration/coac244-283-0947-composition-20261028/composition-proof.json'),
  b0947ObjectSha256:pins.b0947,derived,overlay:{path:D+'/b0785-display-contract.json',sha256:sha(await readFile(join(O,'b0785-display-contract.json')))},
  mandatoryLimitQuoteBindings:quotes,newModelCalls:0,admissionGranted:false,standardWholeArticlePassed:false,wholeChapterAccepted:false,
  effectiveAccount:{original19:{evidenceResolved:16,limitedUnknownPendingActualDisplay:1,sourceNotes:2},oldThree0785:{handTranscription:'resolved-by-reviewed-donor-and-current-unchanged-object',hiddenHandsVersusWall:'resolved-by-reviewed-donor-and-current-unchanged-object',publicManzuUnknown:'independently-allowed-only-with-four-display-limits'},newSeatError:'independent-faithful',remainingPaidReadingTasks:0}};
 const verification=verifyState(c,overlay,proof,e),negative=[];
 for(const[name,mutate]of [
  ['wrong-parent',(_,__,p)=>p.primaryParent.sha256='0'.repeat(64)],['wrong-call',(_,__,p)=>p.b0785Call='fake'],
  ['wrong-raw',(_,__,p)=>p.b0785Raw.sha256='0'.repeat(64)],['wrong-receipt',(_,__,p)=>p.b0785Receipt.sha256='0'.repeat(64)],
  ['missing-limit',(_,o)=>o.limits.pop()],['default-screen-confusion',(_,o)=>o.limits[1]='Screenshot has no calls'],
  ['guess-unknown',c=>figure(c,id785).unknowns=[]],['old-seat-restored',c=>figure(c,id785).transcription+='wrong seat'],
  ['old0947-object',c=>c.figures[c.figures.findIndex(f=>f.figureId===id947)]=figure(e.current,id947)],
  ['body-edited',c=>c.body.blocks[2].text+='edited'],['non-target-figure',c=>c.figures[0].caption+='edited'],
  ['wrong-scope',(_,o)=>o.anchor.scope='whole chapter'],['unanchored',(_,o)=>o.anchor.beforeFigureId='other'],
  ['author-note',(_,o)=>o.authorText=true],['drop-original-uncertain',(_,o)=>o.retainedRawIssue={}],
  ['target-pass-forged',(_,o)=>o.originalTargetPassed=true],['chapter-pass-forged',(_,__,p)=>p.standardWholeArticlePassed=true],
  ['admission-forged',(_,__,p)=>p.admissionGranted=true],['new-call',(_,__,p)=>p.newModelCalls=1],
  ['default-condition-deleted',(_,o)=>o.defaultConditionSourceBlocks.pop()],
  ['wrong-donor',(_,__,p)=>p.b0947Donor.sha256='0'.repeat(64)],
  ['wrong-limit-quote-position',(_,__,p)=>p.mandatoryLimitQuoteBindings[0].rawLastMessageUtf8Start=0],
  ['raw-uncertain-forged',(_,__,p)=>p.b0785IndependentModelReview.issues=[]]
 ]){const cc=structuredClone(c),oo=structuredClone(overlay),pp=structuredClone(proof);mutate(cc,oo,pp);assert.throws(()=>verifyState(cc,oo,pp,e),name);negative.push({name,rejected:true});}
 await save('proof.json',proof);await save('verification.json',{verification,negativeChecks:negative});
 await save('content-hashes.json',{candidateSha256:derived.sha256,body:c.body.blocks.map((b,i)=>({position:i,sourceBlockIds:b.sourceBlockIds,sha256:hash(b)})),figures:c.figures.map((f,i)=>({position:i,figureId:f.figureId,sha256:hash(f)}))});
 const oldIssues=await load(P+'/integration/coac244-283-0947-composition-20261028/effective-issue-register.json');
 for(const issue of oldIssues.issues){if(issue.originalIssue.targetId!==id785)continue;if(issue.originalIssue.severity==='source-note')continue;
  issue.status=issue.originalIssue.severity==='error'?'resolved-by-independent-donor-and-current-scope-proof':'limited-unknown-allowed-pending-display';
  issue.evidence={b0785Receipt:e.receiptRef,raw:e.r.raw,callId:pins.call,scopeProof:D+'/proof.json',originalSeverityUnchanged:true};}
 oldIssues.historicalStateBeforeBoundedMerge=Object.fromEntries(['counts','classification','activeLegacyComplexIssues','effectiveLegacyBlockers','nextOperationalRepair','latestCandidate','deferred'].map(k=>[k,structuredClone(oldIssues[k]??null)]));
 oldIssues.counts=proof.effectiveAccount.original19;oldIssues.candidate=derived;oldIssues.latestCandidate=derived;oldIssues.latestComposedCandidate=derived;
 oldIssues.activeLegacyComplexIssues=[];
 oldIssues.effectiveLegacyBlockers=1;oldIssues.effectiveLegacyBlockerKind='bounded-unknown-display-acceptance-only';
 oldIssues.classification={domTableGeometry:0,semanticConditionOrFigureTranscription:0,criticalUnknownRequiringMoreReading:0,limitedUnknownPendingActualDisplay:1,sourceNotes:2};
 oldIssues.deferred=oldIssues.issues.filter(i=>i.status==='limited-unknown-allowed-pending-display');
 oldIssues.nextOperationalRepair='No new maker or reading. Existing250 writer must install four Q48 non-author limits and perform actual MCP/Arena complete-scope readback; no ordinary pass/raw rewrite.';
 oldIssues.wholeChapterAccepted=false;oldIssues.newModelCalls=0;oldIssues.recordedAt=new Date().toISOString();
 await save('effective-issues.json',oldIssues);
 for(const[name,b]of [['receipt-0785.json',e.receiptRef],['raw-0785.json',e.r.raw],['inheritance-0785.json',{path:P+'/integration/coac249-283-0785-scope-inheritance-20261028.json',sha256:pins.inheritance}]]){await get(b);await copyFile(b.path,join(O,'evidence',name));}
 await save('handoff.json',{canonical,derived,proof:D+'/proof.json',overlay:proof.overlay,verifier:D+'/merge.mjs',
  status:'bounded-scope-and-composition-proof-ready-for-existing250-writer',newCalls:0,newConsumers:0,
  original250IntakeRun:'01a181b5-b8af-7ad3-9e86-1ff49309e1ef',original250IntakeStatus:'completed',original250Commit:'9bb97ed',doNotStartDuplicateConsumer:true,originalTargetPassed:false,admissionGranted:false,
  wholeChapterAccepted:false,remaining:'Existing250 installs all four non-author limits with Q48 and verifies actual MCP/Arena display plus inherited complete scopes before any chapter admission. Do not repeat model reading.'});
 console.log(JSON.stringify({derived:derived.sha256,...verification,negativeChecks:negative.length}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await build();
