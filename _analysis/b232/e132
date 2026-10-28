// One authorized textual child of the exact rejected JP193 r1; never an acceptance exception.
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex'),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const job=JSON.parse(await readFile(new URL('./text193-job.json',import.meta.url)));
export function allowed193Text(text,{allowUnchanged=false}={}){
 if(allowUnchanged&&text===job.textBefore)return true;
 if(typeof text!=='string'||!text.startsWith(job.textPrefix)||!text.endsWith(job.textSuffix))return false;
 const clause=text.slice(job.textPrefix.length,-job.textSuffix.length);
 return clause.length<=50&&clause.split('入り目').length===2&&/^[\p{Script=Han}入り目，、（）「」]*$/u.test(clause)&&!/(新摸|同种|面子|搭子|对子|宣言牌|完成)/u.test(clause);
}
export function verify193TextContent(candidate,parent,notes){
 const r=candidate.provenance.revision;
 assert.equal(r.textRecovery193?.authorizationCommentId,job.authorizationCommentId,'193_authority');
 assert.equal(r.textRecovery193?.schema,'coac248-exact193-text-recovery/1');
 for(const k of ['parentPath','parentSha256','notesPath','notesSha256'])assert.equal(r[k],job[k],'193_binding_'+k);
 assert.equal(sha(JSON.stringify(parent)),job.parentObjectSha256,'193_exact_parent');assert.equal(sha(JSON.stringify(notes)),job.notesObjectSha256,'193_exact_review');
 assert.equal(candidate.source.sourceSha256,job.sourceSha256);assert(eq(candidate.source,parent.source));
 assert(eq(r.textBlockIds,[job.targetId])&&eq(r.figureIds,[]));assert.equal(candidate.body.mode,'translated');
 assert(eq({...candidate.body,blocks:parent.body.blocks},parent.body));assert.equal(candidate.body.blocks.length,parent.body.blocks.length);
 for(let i=0;i<parent.body.blocks.length;i++){
  const a=parent.body.blocks[i],b=candidate.body.blocks[i];
  if(eq(a.sourceBlockIds,[job.targetId])){assert(allowed193Text(b.text,{allowUnchanged:true}),'193_clause_only');assert(eq({...b,text:a.text},a));}
  else assert(eq(a,b),'193_non_target_block');
 }
 assert(eq(candidate.figures,parent.figures),'193_complete_figures_unchanged');
 assert.equal(notes.modelReview.textRepair.verdict,'needs-repair');assert.equal(notes.modelReview.figureRepair.verdict,'faithful');
 assert.equal(notes.modelReview.unknownImpact.length,4);assert.equal(notes.modelReview.orderedContextFaithful,false);
 return true;
}
export async function verify193TextInheritance(root,candidate){
 const read=async(p,h)=>{const b=await readFile(resolve(root,p));assert.equal(sha(b),h,'193_file:'+p);return JSON.parse(b);};
 const p=await read(job.parentPath,job.parentSha256),n=await read(job.notesPath,job.notesSha256);verify193TextContent(candidate,p,n);
 await read(job.sourcePath,job.sourceSha256);
 const oldrt=join(root,'audit/runtimes/coac248-193213-mixed-v1-20261028');
 const m=await read(join(oldrt,'runtime-manifest.json'),'722e33f454e4b739cf0fccea1c974086c1e63f2b32083048b572f2b0372fec32');
 for(const f of m.files)assert.equal(sha(await readFile(join(oldrt,f.name))),f.sha256,'193_frozen_parent_runtime');
 const a=await import(pathToFileURL(join(oldrt,'textbook-audit-web.mjs')));
 const production=await a.verifyWebProductionCall(root,p),presentation=await a.verifyWebPresentations(root,p);
 const raw=await read(job.reviewRawPath,job.reviewRawSha256),plan=await read(job.priorReviewPlanPath,job.priorReviewPlanSha256);
 assert(raw.success&&raw.requestExecution.model==='gpt-6.1-terra'&&raw.requestExecution.reasoningEffort==='max');
 assert(eq(JSON.parse(raw.rawLastMessage),n.modelReview));assert.equal(raw.requestPromptSha256,sha(raw.requestPrompt));assert.equal(raw.requestExecution.images.length,2);
 const cli=await import(pathToFileURL(join(oldrt,'textbook-production-cli.mjs')));assert.equal(raw.requestPrompt,cli.textbookClosedPrompt(plan.prompt));assert(eq(raw.schema,plan.schema));
 assert.equal(n.candidate.sha256,job.parentSha256);assert.equal(n.source.sha256,job.sourceSha256);assert.equal(n.raw.sha256,job.reviewRawSha256);
 assert.equal(n.verification.limitedEvidenceVerified,false);assert(eq(n.verification.errors,['textRepair_not_faithful','argument_or_order_gap','no_limited_allowance']));
 return {revision:candidate.provenance.revision,parentAudit:{path:job.notesPath,sha256:job.notesSha256,originalStatus:n.status},parentCall:{path:job.reviewRawPath,sha256:job.reviewRawSha256,callId:raw.callId},parentProduction:production,parentPresentation:presentation,inheritedAssetIds:[...new Set(p.figures.flatMap(f=>f.sourceAssetBindings.map(a=>a.assetId)))],preservedIndependentReview:{orderedContextFaithful:false,verification:n.verification,figureRepair:n.modelReview.figureRepair,unknownImpact:n.modelReview.unknownImpact,issues:n.modelReview.issues},productionOnlyAuthorization:true,chapterAccepted:false,wholeChapterPassed:false};
}
