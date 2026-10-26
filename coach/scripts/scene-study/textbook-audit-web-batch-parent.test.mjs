import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyBatchParentRevision,verifyWebRevisionContent,verifyWebRevisionInheritance} from './textbook-audit-web.mjs';

const root='E:/AgentData/Coach/knowledge/processing';
const parentPath=`${root}/web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-05.display.json`;
const notesPath=`${root}/audit/web/articles/modern-yabejp-ja/chapter01-section021-05.42eaabcc8419cf3d6510763a3a4bf549f2ef2cfff264de0378c8d09fd08288c0.json`;
const sourcePath=`${root}/web-sources/v1/modern-yabejp-ja/articles/chapter01-section021-05/source.v2.json`;
const childPath=`${root}/web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-05.r2.display.json`;
const sha=value=>createHash('sha256').update(value).digest('hex');
const [parentBytes,notesBytes,sourceBytes,childBytes]=await Promise.all([readFile(parentPath),readFile(notesPath),readFile(sourcePath),readFile(childPath)]);
const parent=JSON.parse(parentBytes),notes=JSON.parse(notesBytes),source=JSON.parse(sourceBytes),child=JSON.parse(childBytes);
const parentSha=sha(parentBytes),groups=notes.batchReviews.map(record=>record.group),records=notes.batchReviews;

it('accepts a complete batch parent whose group records and merged checks are all bound to the parent and source SHA',()=>{
 const proof=verifyBatchParentRevision({parent,parentSha,notes,source,groups,records});
 expect(proof.method).toBe('batch-parent-complete-groups');
 expect(proof.callIds).toEqual(['92143b63-2c90-43c5-a949-a131999e8aa9','7edc8f1d-8edf-4241-af5e-b8f07547929e']);
 expect(proof.parentSha256).toBe(parentSha);
 expect(proof.sourceSha256).toBe(parent.source.sourceSha256);
});

it('rejects a missing batch group receipt',()=>{
 expect(()=>verifyBatchParentRevision({parent,parentSha,notes,source,groups,records:records.slice(0,1)})).toThrow('web_revision_parent_batch_incomplete');
});

it('rejects a parent/child SHA mismatch',async()=>{
 expect(()=>verifyBatchParentRevision({parent,parentSha:'0'.repeat(64),notes,source,groups,records})).toThrow('web_revision_parent_receipt_changed');
 const changed=structuredClone(child);changed.provenance.revision.parentSha256='0'.repeat(64);
 await expect(verifyWebRevisionInheritance(root,changed)).rejects.toThrow('web_revision_parent_or_notes_changed');
});

it('rejects a failed or unknown batch parent group instead of inheriting it',()=>{
 const failed=structuredClone(records);failed[0].status='failed';
 expect(()=>verifyBatchParentRevision({parent,parentSha,notes,source,groups,records:failed})).toThrow('web_revision_parent_batch_group_changed');
 const unknown=structuredClone(records);unknown[0].modelReview=null;
 expect(()=>verifyBatchParentRevision({parent,parentSha,notes,source,groups,records:unknown})).toThrow('web_revision_parent_batch_group_changed');
});

it('rejects incomplete group coverage even when the receipt array length matches',()=>{
 const badGroups=structuredClone(groups);badGroups[0].sourceBlockIds=badGroups[0].sourceBlockIds.slice(0,-1);
 const badNotes=structuredClone(notes);badNotes.batchReviews[0].group=badGroups[0];
 expect(()=>verifyBatchParentRevision({parent,parentSha,notes:badNotes,source,groups:badGroups,records})).toThrow('web_revision_parent_batch_coverage');
});

it('reuses the parent review only for the unchanged scope and the real r2 target block',async()=>{
 const scope=verifyWebRevisionContent(child,parent,notes);
 expect(scope).toBe(true);
 const proof=await verifyWebRevisionInheritance(root,child);
 expect(proof.batchParent.groups).toEqual(['chapter01-section021-05-batch-001','chapter01-section021-05-batch-002']);
 expect(proof.batchParent.callIds).toHaveLength(2);
});

it('rejects changed non-target scope and requires a real target revision',()=>{
 const changed=structuredClone(child);
 const untouched=changed.body.blocks.find(block=>block.type==='text'&&block.sourceBlockIds[0]!=='modern-yabejp-ja:chapter01-section021-05:b0012');
 untouched.text+='X';
 expect(()=>verifyWebRevisionContent(changed,parent,notes)).toThrow('web_revision_changed_body_or_scope');
 const wrongTargets=structuredClone(notes);wrongTargets.modelReview.issues.push({severity:'error',targetId:'modern-yabejp-ja:chapter01-section021-05:b0014',sourceEvidence:'x',description:'x',suggestedRepair:'x'});
 expect(()=>verifyWebRevisionContent(child,parent,wrongTargets)).toThrow('web_revision_notes_scope');
});
