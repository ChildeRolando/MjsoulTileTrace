// One exact PDF257 human20 + recovered independent Q9 evidence composition; no model entry.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const ROOT='E:/AgentData/Coach/knowledge/processing',CANON='nemata-jp-chapter-250-1',OWNER='01a17cae-06e4-7b30-a93f-3a030d1ae63f';
export const PIN='a9ce50898c0407ecca32dc538ad208f667a0a950372acec1114263e177f000e7';
export const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
export function assertScope(c,parent,source,r,raw,q,application){
 assert.equal(r.canonical,CANON);assert.equal(q.canonical,CANON);assert.equal(r.candidate.sha256,PIN);assert.equal(q.candidate.sha256,PIN);
 assert.equal(r.source.sha256,'ca63823638f042d84419560d2618879b80972410d0e290f6b12c9860e19639a6');assert.equal(c.source.pageDataSha256,r.source.sha256);assert.equal(c.source.page,257);assert.equal(c.source.sourceId,'nemata-jp');
 assert.equal(r.parent.sha256,'5403cb35614b1edab17488458dbaf0571e1a48e1972d2d04c9ebc30a03da67dc');assert.equal(c.source.pdfSha256,'4d1c12042589a1b34d6e1f874b79b4ee1d79f4c1c26c62bda0ba94394e47250a');
 assert.deepEqual(c.body,parent.body);assert.equal(c.figures.length,4);assert.deepEqual(c.figures.slice(1),parent.figures.slice(1));
 const cf=structuredClone(c.figures[0]),pf=structuredClone(parent.figures[0]);delete cf.transcription;delete pf.transcription;assert.deepEqual(cf,pf);assert.equal(cf.unknowns.length,4);
 assert.equal(c.figures[0].figureId,'nemata-jp-p257-r1');assert(c.figures[0].transcription.includes('第13—16张为7s 1m 6p 1p'));
 assert.deepEqual(c.figures[0].sourceImageBlockIds,['nemata-jp-p257-b3','nemata-jp-p257-b4']);
 assert.equal(application.deterministicApplicationVerified,true);assert.equal(application.events.length,20);assert.equal(application.changes.length,10);assert.equal(application.firstNineRetained,true);assert.equal(application.sourceBlocksReused,837);
 assert.equal(application.displayCount.totalDisplayPositions,87);assert.equal(application.displayCount.physicalMultiplicityCertified,false);assert.equal(application.displayCount.completeLegalRecordCertified,false);
 assert.equal(application.displayCount.overFour.length,1);assert.equal(application.displayCount.overFour[0].tile,'6p');assert.equal(application.displayCount.overFour[0].count,5);
 const idset=new Set(source.blocks.map(x=>x.id)),used=[...c.body.blocks.filter(x=>x.type==='text').flatMap(x=>x.sourceBlockIds),...c.figures.flatMap(x=>x.sourceImageBlockIds)];assert.equal(used.length,idset.size);assert.deepEqual(new Set(used),idset);
 assert.equal(raw.callId,'2b216edc-24ba-4bdc-aa3c-153bdd6b9608');assert.equal(raw.binding.productionSha256,PIN);assert.equal(raw.success,true);assert.equal(raw.exitCode,0);assert.equal(raw.timedOut,false);
 assert.equal(raw.requestExecution.model,'gpt-6.1-sol');assert.equal(raw.requestExecution.reasoningEffort,'high');assert.deepEqual(raw.requestExecution.images,[]);assert(!raw.requestExecution.args.includes('-i'));
 assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);assert.equal(raw.output.applications.length,20);assert(raw.output.applications.every(a=>a.faithful));assert.deepEqual(raw.output.applications.map(x=>x.itemId),application.events.map(x=>x.itemId));
 for(const key of ['firstNinePreserved','authorArgumentFaithful','completeOrderedScopeCompared'])assert.equal(raw.output[key],true);
 const uncertain=raw.output.issues.filter(x=>x.severity==='uncertain');assert.equal(uncertain.length,1);assert.equal(uncertain[0].targetId,'nemata-jp-p257-b4:old-transcription:upper:15');
 assert.equal(raw.output.requiredDisplayLimitations.length,6);assert.deepEqual(q.requiredDisplayLimitations,raw.output.requiredDisplayLimitations);assert.deepEqual(q.originalModelIssues,raw.output.issues);
 assert.equal(q.conditionalSupportInOriginalModel,true);assert.equal(q.implementationVerified,false);assert.equal(q.admissionGranted,false);assert.equal(q.wholeChapterPassed,false);
 assert.equal(r.preflight,null);assert.equal(r.recovery.originalPreflightLost,true);assert.equal(r.recovery.originalAdmissionSnapshotsLost,true);assert.equal(r.recovery.originalPreflightReconstructedOrForged,false);assert.equal(r.recovery.currentPointersSubstitutedForHistoricalSnapshots,false);
 assert.equal(r.wholeChapterPassed,false);assert.equal(r.admissionGranted,false);assert.equal(r.newReviewCalls,0);assert.equal(r.originalReviewCalls,1);assert.equal(r.budget.remaining,0);
}
export async function verifyLimited(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));assert.equal(sha(await readFile(candidatePath)),PIN);
 const m=await load(new URL('./manifest.json',import.meta.url));
 const bound=async f=>{const b=await readFile(f.path);assert.equal(sha(b),f.sha256,f.path);return f.path.endsWith('.json')?JSON.parse(b):b;};for(const f of m.files)await bound(f);
 assert.equal(m.receipt.sha256,'4e1cc55ad35e0c649bd836946e1b9fddc9476bdee60da552ec212915106a2b0e');assert.equal(m.scope.sha256,'88f4a9dbe87eedd8618705b2d0f0caea3e70e85fa956ae49cc4b5228fc3f225d');
 const r=await bound(m.receipt),c=await bound(r.candidate),parent=await bound(r.parent),source=await bound(r.source),raw=await bound(r.raw),q=await bound(m.scope);
 const mod=await import(pathToFileURL(m.humanApplicationModule.path)),application=await mod.verify(OWNER);assert.deepEqual(application,r.applicationEvidence);assert.equal(application.candidate.sha256,PIN);
 assertScope(c,parent,source,r,raw,q,application);
 const req=await bound(r.plan);assert.equal(raw.semanticPrompt,req.prompt);assert.deepEqual(raw.schema,req.schema);
 const cli=await import(pathToFileURL(m.closedPromptModule.path));assert.equal(raw.requestPrompt,cli.textbookClosedPrompt(req.prompt));assert.equal(raw.requestPromptSha256,sha(raw.requestPrompt));
 const rows=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(x=>x.includes(raw.callId)).map(JSON.parse);assert.equal(rows.length,1);assert.deepEqual(rows[0].usage,raw.usage);
 const inverse=structuredClone(c);delete inverse.provenance.humanSecondBatch257;inverse.figures[0].transcription=parent.figures[0].transcription;inverse.candidateSha256=parent.candidateSha256;assert.deepEqual(inverse,parent);
 return {schema:'coac244-exact-p257-human20-conditional-composition/1',status:'verified-exact-p257-human20-conditional-display',canonical:CANON,candidate:r.candidate,production:{sha256:PIN},source:r.source,parent:r.parent,independentReceipt:m.receipt,raw:r.raw,
 requiredDisplayLimitations:q.requiredDisplayLimitations,originalModelIssues:raw.output.issues,recovery:r.recovery,applicationEvidence:application,
 source261:application.source261,reuse:application.reuse,standardModule:m.standardModule,sourceLibrary:m.sourceLibrary,inventory:m.inventory,chapterMap:m.chapterMap,
 conditionalCompositionAllowed:true,ordinaryWholePagePassed:false,wholeChapterPassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newModelCalls:0};
}
