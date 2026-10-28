// Exact conditional composition for one immutable native-display proposal.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export const ROOT='E:/AgentData/Coach/knowledge/processing';
export const PIN='ca5792a85433de54d0bfa82649a3707707ef64747d3beb5f8944a5bec372ad97';
export const CANON='79-cn-chapter-311-18',BASE='79-bilibili-cn:cv1815400:';
export const TARGETS=[122,124,126,128,130,132,156,158];
export const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p));
export function assertScope(p,parent,source,r,raw,q,derivation){
 assert.equal(p.schema,'coach-web311-native-presentation-proposal/1');assert.equal(p.canonical,CANON);
 assert.equal(r.canonical,CANON);assert.equal(q.canonical,CANON);assert.equal(r.proposal.sha256,PIN);assert.equal(q.proposal.sha256,PIN);
 assert.equal(r.source.sha256,'935bbfe6c2404ce9cd6f68fdb36db8ab6c4a20ec440d3a1a66e7ccd22c39afec');
 assert.equal(r.parent.sha256,'f44231f95310e33608a596f1f4153f0e35afb55490fc3db1fdccd3fc11d3a125');
 assert.equal(p.source.sourceSha256,r.source.sha256);assert.equal(p.originCandidate.sha256,r.parent.sha256);
 assert.deepEqual(p.source,parent.source);assert.deepEqual(p.body,parent.body);assert.equal(p.body.blocks.length,225);assert.equal(source.blocks.length,225);
 assert.equal(p.figures.length,21);assert.equal(p.body.blocks.filter(b=>b.type==='text').length,204);
 for(let i=0;i<225;i++){const b=p.body.blocks[i],s=source.blocks[i];assert.deepEqual(b.sourceBlockIds,[s.id]);if(b.type==='text'){assert.equal(b.text,s.text);assert.deepEqual(b.sourceSegments,s.segments);}}
 assert.equal(p.admissionGranted,false);assert.equal(p.wholeChapterPassed,false);assert.equal(p.authorCalculationsVerified,false);assert.equal(p.ordinaryProductionCandidate,false);
 assert.equal(derivation.derivedFileSha256,PIN);assert.equal(derivation.removedArtificialSlots,144);assert.equal(derivation.changes.length,24);
 const restored={body:structuredClone(p.body),figures:structuredClone(p.figures)},touched=new Set();
 for(const d of derivation.changes){const m=/^\/figures\/(\d+)\/(transcription|unknowns|presentationAsset)$/.exec(d.path);assert(m);assert(!touched.has(d.path));touched.add(d.path);const i=+m[1],key=m[2];assert(TARGETS.some(n=>p.figures[i].figureId===BASE+'b'+String(n).padStart(4,'0')+':figure'));assert.deepEqual(restored.figures[i][key],d.to);restored.figures[i][key]=d.from;}
 assert.deepEqual(restored,{body:parent.body,figures:parent.figures});assert.equal(p.editorialNotes.length,8);
 for(const [i,n] of TARGETS.entries()){const note=p.editorialNotes[i];assert.equal(note.figureId,BASE+'b'+String(n).padStart(4,'0')+':figure');assert.equal(note.afterSourceBlockId,note.figureId.replace(/:figure$/,''));assert.equal(note.authorText,false);assert(note.text.startsWith('审校说明（非原文）'));const f=p.figures.find(x=>x.figureId===note.figureId);assert.equal(f.presentationAsset.sha256,f.sourceAssetBindings[0].sha256);assert.equal(f.presentationAsset.path,f.sourceAssetBindings[0].path);assert(!f.transcription.includes('审校补录（非原文，按原图读取的约值；unknown不插值）'));}
 assert.equal(raw.callId,'47c48143-2aaf-433f-829d-91aa9b07461d');assert.equal(raw.model,'gpt-6.1-terra');assert.equal(raw.reasoningEffort,'max');assert.equal(raw.success,true);assert.equal(raw.exitCode,0);assert.equal(raw.timedOut,false);
 assert.equal(raw.binding.proposalSha256,PIN);assert.equal(raw.binding.authorizationComment,'01a1828a-5da5-7c3c-914f-e22fe0311e8a');assert.equal(raw.requestExecution.images.length,9);
 assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);assert.deepEqual(q.modelReview,r.modelReview);
 const m=raw.output;assert.equal(m.nativeDisplayVerdict,'faithful-with-mandatory-limits');assert.equal(m.figureChecks.length,8);assert(m.figureChecks.every(x=>x.verdict==='faithful'));assert.deepEqual(m.figureChecks.map(x=>x.figureId),p.editorialNotes.map(x=>x.figureId));
 assert.deepEqual(m.actualFidelityGaps,[]);assert.equal(m.orderedSourceCoverage,true);assert.equal(m.editorialLimitsSufficient,false);assert.equal(r.verification.limitedFidelityAccepted,false);
 assert.equal(m.handAImpact.sourceFidelityGap,false);assert.equal(m.handAImpact.disposition,'inherited-source-limit-with-mandatory-note');
 assert.equal(q.conditionalAcceptanceExplicitInModel,true);assert.equal(q.allMandatoryConditionsMustBeInstalledBeforeAcceptance,true);assert.equal(q.existingEightNotesMustRemain,true);
 assert.deepEqual(q.mandatoryDisplayConditions,m.mandatoryDisplayConditions);assert.equal(m.mandatoryDisplayConditions.length,10);
 assert(m.mandatoryDisplayConditions.every(x=>x.nonAuthorDisplayRequired===true&&x.conditionText.startsWith('审校说明（非原文）')));
 assert.equal(m.mandatoryDisplayConditions[8].figureId,BASE+'b0154:figure');assert.equal(m.mandatoryDisplayConditions[9].figureId,CANON);
 assert.equal(q.implementationVerified,false);assert.equal(q.admissionGranted,false);assert.equal(r.wholeChapterPassed,false);assert.equal(r.admissionGranted,false);
}
export async function verifyLimited(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));assert.equal(sha(await readFile(candidatePath)),PIN);
 const m=await load(new URL('./manifest.json',import.meta.url));
 const bound=async ref=>{const b=await readFile(ref.path);assert.equal(sha(b),ref.sha256,ref.path);return ref.path.endsWith('.json')?JSON.parse(b):b;};
 for(const ref of m.files)await bound(ref);
 assert.equal(m.receipt.sha256,'9245894ecccf7e94f3fac8f3b5e177d5014d29a8f99baca40bb31e892afc22c6');
 assert.equal(m.scope.sha256,'5502384c26e5e939284b07b9a2ee073a4a75043926acfb1ac4ecaaf72c2c3b12');
 const r=await bound(m.receipt),p=await bound(r.proposal),parent=await bound(r.parent),source=await bound(r.source),raw=await bound(r.raw),q=await bound(m.scope),d=await bound(m.derivation);
 assertScope(p,parent,source,r,raw,q,d);
 const plan=await bound(r.plan);assert.equal(plan.prompt,raw.semanticPrompt);assert.deepEqual(plan.schema,raw.schema);assert.deepEqual(plan.images.map(resolvePath),raw.requestExecution.images.map(x=>resolvePath(x.path)));
 for(const im of raw.requestExecution.images){const b=await readFile(im.path);assert.equal(sha(b),im.sha256);assert.equal(b.length,im.bytes);}
 const ledger=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);assert.equal(ledger.filter(x=>x.callId===raw.callId).length,1);
 assert.equal(ledger.filter(x=>x.binding?.proposalSha256===PIN).length,1);
 const old=await bound(r.inheritedReceipt),oldRaw=await bound(r.inheritedRaw);assert.deepEqual(old.modelReview,oldRaw.output);assert.equal(old.verification.repairPassed,false);assert.equal(old.verification.limitedUnknownOkay,false);
 return {schema:'coac244-exact311-native-conditional-composition/1',status:'verified-exact311-native-conditional-display',canonical:CANON,production:{sha256:PIN},candidate:r.proposal,source:r.source,parent:r.parent,
  auditPath:m.receipt.path,auditSha256:m.receipt.sha256,independentReceipt:m.receipt,raw:r.raw,scope:m.scope,derivation:m.derivation,
  originalStrictVerification:r.verification,oldStrictVerification:old.verification,mandatoryDisplayConditions:q.mandatoryDisplayConditions,existingNotes:p.editorialNotes,
  conditionalCompositionAllowed:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newModelCalls:0};
}
function resolvePath(p){return resolve(p);}
