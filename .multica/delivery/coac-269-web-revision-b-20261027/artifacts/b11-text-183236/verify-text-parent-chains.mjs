import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const root='E:/AgentData/Coach/knowledge/processing',out='.multica/delivery/coac-269-web-revision-b-20261027/artifacts/b11-text-183236';
const packet=JSON.parse(await readFile(join(out,'text-batch-183-236.json'))),jobs=packet.jobs,results=[];
const {pathToFileURL}=await import('node:url');
const {verifyWebRevisionInheritance,verifyWebRevisionContent,validateTargetTextReview}=await import(pathToFileURL(join(packet.runtime.path,'textbook-audit-web.mjs')));
let cases=0;
for(const job of jobs){
 const p=JSON.parse(await readFile(job.parent.path)),child=structuredClone(p);
 // In-memory identity probe only; never written/registered as a candidate or used as a production result.
 child.provenance.revision={parentPath:job.parent.path,parentSha256:job.parent.sha256,notesPath:job.parentAudit.path,notesSha256:job.parentAudit.sha256,figureIds:[],textBlockIds:job.targetIds};
 const proof=await verifyWebRevisionInheritance(root,child);
 const notes=JSON.parse(await readFile(job.parentAudit.path));
 assert.equal(notes.modelReview.issues[0].severity,'uncertain');cases++;
 verifyWebRevisionContent(child,p,notes);cases++;
 for(const mutate of [c=>c.provenance.revision.parentSha256='0'.repeat(64),c=>c.provenance.revision.notesSha256='0'.repeat(64),c=>c.source.sourceSha256='0'.repeat(64),c=>c.provenance.revision.textBlockIds=[c.body.blocks[0].sourceBlockIds[0]],c=>c.body.blocks[0].text+='outside target']){
  const bad=structuredClone(child);mutate(bad);assert.throws(()=>verifyWebRevisionContent(bad,p,notes));cases++;
 }
 const badNotes=structuredClone(notes);badNotes.modelReview.issues.push({severity:'uncertain',targetId:p.body.blocks[0].sourceBlockIds[0]});assert.throws(()=>verifyWebRevisionContent(child,p,badNotes));cases++;
 const review={blockChecks:[{id:job.targetIds[0],verdict:'uncertain',evidence:'source remains ambiguous'}],contextContinuity:{faithful:true},semanticCompleteness:{complete:true},completeTargetScopeCompared:true,issues:[{severity:'uncertain',targetId:job.targetIds[0]}]};
 assert.equal(validateTargetTextReview(review,job.targetIds).passed,false);cases++;
 results.push({chapterId:job.chapterId,probe:'in-memory unchanged parent inheritance, not a production candidate',passed:true,proof});
}
await writeFile(join(out,'text-parent-chain-proofs.json'),JSON.stringify({modelCalls:0,regressionCases:cases,oldGateFailure:'web_revision_notes_scope',results},null,2)+'\n');
console.log(JSON.stringify({results:results.map(r=>({chapterId:r.chapterId,passed:r.passed})),regressionCases:cases,modelCalls:0}));
