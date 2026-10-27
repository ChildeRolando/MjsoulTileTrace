import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {prepareContext100Request,validateContext100Response} from 'file:///E:/AgentData/Coach/knowledge/processing/integration/coac244-next3-zero-20261028/context100.mjs';
import {textbookClosedPrompt} from './textbook-production-cli.mjs';
import {auditTransportCompleted} from './textbook-audit.mjs';
import {validateWebReview} from 'file:///E:/AgentData/Coach/knowledge/processing/integration/coac244-next3-zero-20261028/verification-runtime/textbook-audit-web.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root='E:/AgentData/Coach/knowledge/processing';
export const target100='modern-yabejp-ja:chapter01-section035:b0041';
export const parentSha100='0439c38228989d2f997036eaa0e4a4522cfb40e6c141469b1c83abf66db2c077';
const priorContextBytes=await readFile(join(root,'audit/calls/c821f2f0-903b-47f5-8bcc-81db3be2044d.json'));
assert.equal(sha(priorContextBytes),'ec474aaa993b0b00e697cbf95cd3c9448259746f84b5840912080fda27a6efe6');
const priorContext=JSON.parse(priorContextBytes);
export function effective100Review(notes){
 if(notes.method!=='independent-exact100-composite-error-evidence')return notes.effectiveModelReview??notes.modelReview;
 assert.equal(notes.production.sha256,parentSha100);assert.equal(notes.contextSupplement.callId,priorContext.callId);assert.equal(notes.contextSupplement.rawSha256,sha(priorContextBytes));
 const kept=[notes.batchReviews[0],notes.batchReviews[2]];assert(kept.every(r=>r.status==='passed'&&r.modelReview.domOrder.faithful&&r.modelReview.contextContinuity.faithful));assert.equal(kept.reduce((n,r)=>n+r.group.sourceBlockIds.length,0),243);
 assert(priorContext.output.domOrder.faithful&&priorContext.output.contextContinuity.faithful&&priorContext.output.completeBatchCompared);
 const effective=structuredClone(notes.effectiveModelReview);effective.domOrder={faithful:true,evidence:'Explicit independent DOM supplement: original passed batch00139 and batch003204 checks plus c821f2f0 batch00268 complete-context DOM/context checks. Original aggregate false/raw retained; all311 original ordered blocks verified unchanged.'};
 return effective;
}
export function isRepair100(c){return c.source.sourceId==='modern-yabejp-ja'&&c.source.articleId==='chapter01-section035'&&c.provenance.revision?.parentSha256===parentSha100;}
export function compose100(plan,raw,record){
 const old=plan.old,ids=new Set(plan.proof.originalGroup.sourceBlockIds),figs=new Set(plan.candidate.figures.filter(f=>f.sourceBlockIds.some(id=>ids.has(id))).map(f=>f.figureId)),imgs=new Set(plan.source.blocks.filter(b=>ids.has(b.id)).flatMap(b=>b.images??[]).map(i=>i.occurrenceId));
 const effective=structuredClone(old.modelReview);
 for(const [key,set]of[['blockChecks',ids],['figureChecks',figs],['imageChecks',imgs]])effective[key]=effective[key].map(c=>set.has(c.id)?raw.output[key].find(n=>n.id===c.id):c);
 effective.issues=[...effective.issues.filter(i=>!ids.has(i.targetId)&&!figs.has(i.targetId)&&!imgs.has(i.targetId)),...raw.output.issues];
 effective.domOrder={faithful:old.modelReview.domOrder.faithful&&raw.output.domOrder.faithful&&raw.output.contextContinuity.faithful,evidence:'Original full ordered review plus the independently reviewed 68-target/39-definition input; original order unchanged.'};
 effective.semanticCompleteness={complete:false,evidence:'The new independent review found exactly one b0041 condition error. No pass is asserted before its independent repair review.'};
 return {...old,method:'independent-exact100-composite-error-evidence',modelReview:old.modelReview,modelChecks:old.modelChecks,effectiveModelReview:effective,effectiveModelChecks:validateWebReview(effective,plan.source,plan.candidate),originalAudit:plan.proof.oldAudit,contextSupplement:{callId:raw.callId,rawSha256:sha(JSON.stringify(raw,null,2)+'\n'),proof:plan.proof,call:record},calls:old.calls,inheritedCalls:[...old.calls,record]};
}
export async function buildComposite100(){
 const plan=await prepareContext100Request();
 const bytes=await readFile(join(root,'audit/calls/c821f2f0-903b-47f5-8bcc-81db3be2044d.json'));
 assert.equal(sha(bytes),'ec474aaa993b0b00e697cbf95cd3c9448259746f84b5840912080fda27a6efe6');
 const raw=JSON.parse(bytes),rows=(await readFile(join(root,'audit/calls.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);
 assert.equal(rows.length,1);const record=rows[0];
 assert(auditTransportCompleted(raw));assert.equal(raw.prompt,plan.prompt);assert.deepEqual(raw.schema,plan.schema);assert.equal(raw.requestPrompt,textbookClosedPrompt(plan.prompt));assert.deepEqual(raw.binding.contextSupplement,plan.proof);
 assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.output);assert.equal(raw.outputSha256,sha(raw.rawLastMessage));assert.equal(record.outputSha256,raw.outputSha256);assert.deepEqual(raw.requestExecution,record.requestExecution);assert.deepEqual(raw.requestExecution.images,[]);assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');
 assert.equal(raw.output.blockChecks.length,68);assert.equal(raw.output.blockChecks.filter(c=>c.verdict==='faithful').length,67);
 assert.deepEqual(raw.output.issues.filter(i=>i.severity!=='source-note').map(i=>[i.severity,i.targetId]),[['error',target100]]);
 assert(raw.output.domOrder.faithful&&raw.output.contextContinuity.faithful&&raw.output.completeBatchCompared);
 const checks=validateContext100Response(raw.output,plan);assert.equal(checks.passed,false);
 const notes=compose100(plan,raw,record);notes.contextSupplement.rawSha256=sha(bytes);
 return {notes,plan,raw};
}
export async function verifyComposite100(processingRoot,parent,notes){
 assert.equal(resolve(processingRoot),resolve(root));assert.equal(parent.source.sourceSha256,'722ef1a43bed6650c33930abe2625641b0b9ffa271091c376c6efb8b684b517b');
 const {notes:expected,plan}=await buildComposite100();assert.deepEqual(parent,plan.candidate);assert.deepEqual(notes,expected);
 const review=notes.effectiveModelReview;
 assert.equal(review.blockChecks.filter(c=>c.verdict!=='faithful').length,1);assert.equal(review.blockChecks.find(c=>c.id===target100).verdict,'needs-repair');assert(review.figureChecks.every(c=>c.verdict==='faithful'));assert(review.imageChecks.every(c=>c.disposition==='represented'));
 return {method:notes.method,originalAudit:plan.proof.oldAudit,contextSupplement:notes.contextSupplement,passedOriginalBlocks:243,newFaithfulBlocks:67,onlyError:target100};
}
export function projection100(source,candidate,ids){
 assert(isRepair100(candidate));assert.deepEqual(ids,[target100]);
 const selected=source.blocks.slice(0,107),set=new Set(selected.map(b=>b.id));
 assert.equal(selected.length,107);assert(selected.find(b=>b.id.endsWith('b0038')).text.includes('２枚以上切れてない'));
 return {schema:'coach-exact100-condition-review-projection/1',targetTextIds:ids,source:{url:source.url,title:source.title,language:source.language,blocks:selected,tables:source.tables??[]},candidate:{title:candidate.title,blocks:candidate.body.blocks.filter(b=>b.sourceBlockIds.some(id=>set.has(id))),figures:candidate.figures.filter(f=>f.sourceBlockIds.some(id=>set.has(id)))},contextScope:{originalPassedDefinitionBlockIds:selected.slice(0,39).map(b=>b.id),targetGroupBlockIds:selected.slice(39).map(b=>b.id),newCheckIds:ids,inheritedOtherBlocks:310,unchangedFigures:128},visualEvidence:{newImages:[],purpose:'Existing independent exact figures unchanged; this pure-text request does not claim a new visual inspection.'},coverage:'Only b0041 is newly reviewed. Full107 ordered source/candidate blocks retain all39 original A/B definition blocks. Other310 blocks/128 figures inherit the verified composite independent parent evidence.'};
}
