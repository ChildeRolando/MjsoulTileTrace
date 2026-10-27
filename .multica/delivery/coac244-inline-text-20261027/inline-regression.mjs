import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',out='.multica/delivery/coac244-inline-text-20261027',runtime=JSON.parse(await readFile(join(root,'web-production/v1/runs/coac244-inline-japanese-20261027/runtime-manifest.json'))).runtime;
const read=async p=>JSON.parse(await readFile(p));
const {verifyWebRevisionInheritance,verifyWebRevisionContent,webDeterministicChecks}=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')));
const {inlineTextAllowed,assertInlinePlan,loadInlinePlan,normalizeKnownInline155}=await import(pathToFileURL(join(runtime,'inline-japanese-revision.mjs')));
const jobs=await read(join(out,'jobs.json')),results=[],regressions=[];
for(const key of ['155','162','234']){
 const j=jobs.find(j=>j.chapterId.split('-').at(-2)===key),parent=await read(join(root,j.parentPath)),notes=await read(join(root,j.auditPath)),source=await read(join(root,j.source.path)),probe=await read(join(out,`probe-${key}-NOT-A-CANDIDATE.json`)),plan=await read(join(root,j.planPath));
 try{
  const proof=await verifyWebRevisionInheritance(root,probe),digestProbe=structuredClone(probe);delete digestProbe.candidateSha256;
  probe.candidateSha256=createHash('sha256').update(JSON.stringify(digestProbe)).digest('hex');
  const checks=webDeterministicChecks(probe,source,j.source.sha256);assert.equal(checks.passed,true,JSON.stringify(checks));
  results.push({chapterId:j.chapterId,passed:true,modelCalls:0,proof,checks});
 }catch(e){results.push({chapterId:j.chapterId,passed:false,error:String(e),modelCalls:0});}
 const test=(name,f)=>{assert.throws(f);regressions.push({key,name,passed:true});};
 const target=probe.body.blocks.find(b=>b.sourceBlockIds[0]===plan.edits[0].sourceBlockId),old=parent.body.blocks.find(b=>b.sourceBlockIds[0]===plan.edits[0].sourceBlockId);
 assert.equal(inlineTextAllowed(plan,target.sourceBlockIds[0],old.text,target.text),true);
 assert.equal(inlineTextAllowed(plan,target.sourceBlockIds[0],old.text,target.text+'偷加条件'),false);regressions.push({key,name:'non_quote_append_rejected',passed:true});
 assert.equal(inlineTextAllowed(plan,target.sourceBlockIds[0],old.text,target.text.replace(old.text.slice(0,3),'changed')),false);regressions.push({key,name:'surrounding_text_change_rejected',passed:true});
 const uncertain=structuredClone(notes);uncertain.modelReview.issues.find(i=>i.severity==='error').severity='uncertain';
 test('uncertain_parent_still_rejected',()=>assertInlinePlan(plan,parent,uncertain,source,plan.bindings));
 const altered=structuredClone(probe);altered.body.blocks.find(b=>b.sourceBlockIds[0]!==target.sourceBlockIds[0]).sourceText+='bad';
 test('non_target_metadata_rejected',()=>verifyWebRevisionContent(altered,parent,notes));
 const moved=structuredClone(plan);moved.bindings.sourceSha256='0'.repeat(64);
 test('wrong_source_binding_rejected',()=>assertInlinePlan(moved,parent,notes,source,plan.bindings));
 const mismatch=structuredClone(probe);mismatch.provenance.revision.inlineJapanese.plan.edits[0].quotedText+='bad';
 await assert.rejects(()=>loadInlinePlan(root,mismatch.provenance.revision.inlineJapanese,mismatch,parent,notes,source));regressions.push({key,name:'embedded_plan_tamper_rejected',passed:true});
}
const hold=jobs.find(j=>j.chapterId==='79-cn-chapter-182-5'),hp=await read(join(root,hold.parentPath)),hn=await read(join(root,hold.auditPath)),p=structuredClone(hp);
p.provenance.revision={parentPath:hold.parentPath,parentSha256:hold.parentFileSha256,notesPath:hold.auditPath,notesSha256:hold.auditFileSha256,figureIds:[],textBlockIds:hn.modelReview.issues.filter(i=>i.severity==='error').map(i=>i.targetId)};
assert.throws(()=>verifyWebRevisionContent(p,hp,hn));regressions.push({key:'182',name:'uncertain_other_scope_cannot_be_ignored',passed:true});
const j155=jobs.find(j=>j.chapterId==='79-cn-chapter-155-4'),p155=await read(join(root,j155.parentPath)),plan155=await read(join(root,j155.planPath)),raw155=await read(join(root,'web-production/v1/raw-calls/676d346d-772e-4662-8fa9-02b236073167.json'));
const rawText=raw155.parsedOutput.translations[0].text,cid='676d346d-772e-4662-8fa9-02b236073167',rsha='58e786828e31e3acc28fdef753733861a14e1b5331241f515a552d760c557519';
assert.equal(inlineTextAllowed(plan155,plan155.edits[0].sourceBlockId,p155.body.blocks[7].text,rawText),false);
const norm=normalizeKnownInline155(rawText,p155,plan155,cid,rsha);assert.equal(norm.text,rawText.replaceAll('**',''));
assert.throws(()=>normalizeKnownInline155(rawText+'增加新含义',p155,plan155,cid,rsha));
assert.throws(()=>normalizeKnownInline155(rawText,p155,plan155,'other-call',rsha));
assert.throws(()=>normalizeKnownInline155(rawText,p155,plan155,cid,'0'.repeat(64)));
assert.throws(()=>normalizeKnownInline155(rawText+'**',p155,plan155,cid,rsha));
regressions.push(...['exact_known_raw_normalization','non_quote_text_still_rejected','different_call_rejected','different_raw_rejected','extra_markers_rejected'].map(name=>({key:'155',name,passed:true})));
const b=jobs.find(j=>j.chapterId==='79-cn-chapter-157-11'),bp=await read(join(root,b.parentPath)),bn=await read(join(root,b.auditPath)),bv=structuredClone(bp);
bv.provenance.revision={parentPath:b.parentPath,parentSha256:b.parentFileSha256,notesPath:b.auditPath,notesSha256:b.auditFileSha256,figureIds:[...new Set(bn.modelReview.issues.filter(i=>i.severity==='error').map(i=>i.targetId))]};
let bProof;try{bProof={passed:true,proof:await verifyWebRevisionInheritance(root,bv)};}catch(e){bProof={passed:false,error:String(e)};}
const br=await read(join(root,'audit/calls',bn.calls[0].callId+'.json'));
bProof={...bProof,chapterId:b.chapterId,parentAuditPath:b.auditPath,parentAuditSha256:b.auditFileSha256,
 callId:bn.calls[0].callId,originalImageAssetIds:bn.calls[0].binding.originalImageAssetIds,
 verifiedAssetIds:bn.calls[0].binding.verifiedAssetIds,rawTerminalEvents:(br.events??[]).filter(e=>['turn.completed','turn.failed'].includes(e.type)),
 qualification:'Existing parent independent audit and actual input binding, not a new visual adjudication. Parent assertions must not be replaced by unsupported producer visual claims. No 157 production dispatched.'};
await writeFile(join(out,'157-parent-clarification.json'),JSON.stringify(bProof,null,2)+'\n');
await writeFile(join(out,'zero-call-parent-proofs.json'),JSON.stringify({newModelCalls:0,results,regressions},null,2)+'\n');
console.log(JSON.stringify({proofs:results.map(r=>({chapter:r.chapterId,passed:r.passed,error:r.error})),regressions:regressions.length,b157:bProof}));
