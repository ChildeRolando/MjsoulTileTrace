// COAC-250 eighth batch: port the frozen second-order revision gate from
// audit/runtimes/web-target-text-chain-20261027/textbook-audit-web.mjs into the live module.
// The only semantic delta is using notes.effectiveModelReview ?? notes.modelReview (and the
// matching checks) where the live module read the target-only review, so the already-passed
// 215-4 receipt (a75742e9, rev2 on a rev1 parent) verifies instead of failing
// web_revision_notes_scope. Deterministic text splice, zero model calls; pre-patch file kept.
import {readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const live='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-audit-web.mjs';
const backup=live+'.orig-coac250-target-text-chain';
const sha=b=>createHash('sha256').update(b).digest('hex');
const text=await readFile(live,'utf8');
const before=sha(Buffer.from(text));
const patches=[
 {name:'effective-review-binding',
  from:"if(notes.status!=='needs-repair'||!notes.modelReview?.completeArticleCompared||!notes.modelReview.domOrder?.faithful||targets.some(id=>!notes.modelReview.issues.some(i=>i.severity==='error'&&i.targetId===id)||(textMode?notes.modelReview.blockChecks:notes.modelReview.figureChecks).find(c=>c.id===id)?.verdict!=='needs-repair')||notes.modelReview.issues.some(i=>i.severity!=='source-note'&&(!targets.includes(i.targetId)||i.severity!=='error'))",
  to:"if(notes.status!=='needs-repair'||!review?.completeArticleCompared||!review.domOrder?.faithful||targets.some(id=>!review.issues.some(i=>i.severity==='error'&&i.targetId===id)||(textMode?review.blockChecks:review.figureChecks).find(c=>c.id===id)?.verdict!=='needs-repair')||review.issues.some(i=>i.severity!=='source-note'&&(!targets.includes(i.targetId)||i.severity!=='error'))"},
 {name:'review-declaration',
  from:'export function verifyWebRevisionContent(candidate,parent,notes){\n const r=',
  to:'export function verifyWebRevisionContent(candidate,parent,notes){\n const review=notes.effectiveModelReview??notes.modelReview;\n const r='},
 {name:'selected-blocks-review',
  from:'flatMap(f=>f.sourceBlockIds)],review=notes.modelReview;if(review',
  to:'flatMap(f=>f.sourceBlockIds)];if(review'},
 {name:'parent-receipt-binding',
  from:'!same(notes.modelChecks,validateWebReview(notes.modelReview,source,parent))',
  to:'!same(notes.effectiveModelChecks??notes.modelChecks,validateWebReview(notes.effectiveModelReview??notes.modelReview,source,parent))'},
 {name:'coverage-probe',
  from:'const coverageProbe=structuredClone(notes.modelReview),',
  to:'const coverageProbe=structuredClone(notes.effectiveModelReview??notes.modelReview),'},
 {name:'target-text-assembly',
  from:'merged=mergeTargetTextReview(parent.modelReview,receipt.modelReview,ids,source,candidate)',
  to:'merged=mergeTargetTextReview(parent.effectiveModelReview??parent.modelReview,receipt.modelReview,ids,source,candidate)'}
];
let next=text;
for(const p of patches){
 if(next.split(p.from).length!==2)throw Error('anchor_not_unique:'+p.name+':'+(next.split(p.from).length-1));
 next=next.split(p.from).join(p.to);
}
if(next===text)throw Error('no_change');
if(!next.includes('const review=notes.effectiveModelReview??notes.modelReview;'))throw Error('declaration_missing');
if(!next.includes('firstRevision?[]:(candidate.provenance.revision?.textBlockIds??[])'))throw Error('first_revision_gate_lost');
if(!next.includes('verifyWebGroupRevisionInheritance'))throw Error('group_revision_gate_lost');
if(!next.includes('pickBatchCheckpoint'))throw Error('batch_retry_patch_lost');
await copyFile(live,backup);
await writeFile(live,next);
const after=sha(await readFile(live));
console.log(JSON.stringify({schema:'coac250-effective-review-gate-port/1',file:live,backup,beforeSha256:before,afterSha256:after,patches:patches.map(p=>p.name),modelCalls:0},null,2));

// Re-run the live gate over the four batch candidates and every currently selected web article.
const root='E:/AgentData/Coach/knowledge/processing';
const {verifyAuditForWebCandidate}=await import(pathToFileURL(live));
const four=['chapter02-section024.rev1.json','chapter03-section006.rev1.json','chapter03-section012.rev1.json','chapter03-section027.rev2.json'];
for(const name of four){
 const p=join(root,'web-production/v1/candidates/modern-yabejp-ja',name);
 try{const g=await verifyAuditForWebCandidate(root,p);console.log('batch',name,'->',g.status);}catch(e){console.log('batch',name,'-> ERR',e.message);}
}
const pointer=JSON.parse(await readFile(join(root,'integration/accepted-preview-current.json'),'utf8'));
const receipt=JSON.parse(await readFile(join(pointer.output,'accepted-preview-receipt.json'),'utf8'));
let pass=0,fail=[];
for(const s of receipt.selectedWeb){
 const path=s.candidatePath;
 try{const g=await verifyAuditForWebCandidate(root,path);if(g.status==='passed')pass++;else fail.push([path.split(/[\/]/).at(-1),g.status]);}catch(e){fail.push([path.split(/[\/]/).at(-1),e.message]);}
}
console.log(JSON.stringify({selectedWeb:receipt.selectedWeb.length,passed:pass,failed:fail},null,2));
