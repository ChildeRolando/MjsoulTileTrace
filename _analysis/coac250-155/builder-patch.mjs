// Persist the one accepted inline candidate's exact gate/stager route in the existing builder.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function load155InlineCompatibility(root,path,binding){
 const bytes=await readFile(path),c=JSON.parse(bytes);
 if(c.source.sourceId!=='79-bilibili-cn'||c.source.articleId!=='cv1751265'||sha(bytes)!==binding.candidateSha256)throw Error('inline155_candidate_binding');
 if(binding.runtime.files.length!==15)throw Error('inline155_runtime_scope');
 for(const f of binding.runtime.files)if(sha(await readFile(binding.runtime.runtime+'/'+f.name))!==f.sha256)throw Error('inline155_runtime_changed:'+f.name);
 const manifest=await readFile(binding.displayManifest.path);if(sha(manifest)!==binding.displayManifest.sha256||JSON.stringify(JSON.parse(manifest))!==JSON.stringify(binding.displayStage))throw Error('inline155_display_manifest_changed');
 for(const ref of [binding.displayStage.original,binding.displayStage.module,binding.displayStage.helper])if(sha(await readFile(ref.path))!==ref.sha256)throw Error('inline155_display_module_changed');
 const verify=(await import(pathToFileURL(binding.runtime.runtime+'/textbook-audit-web.mjs'))).verifyAuditForWebCandidate,stage=(await import(pathToFileURL(binding.displayStage.module.path))).stageWebTextbook;
 return {verify,stage};
}
export function updateBuilder(builder,pre,nextSha){
 let next=builder.replace('specific-web-variant-selection.v18.json','specific-web-variant-selection.v19.json').replace(pre.configs.variants.sha256,nextSha);
 assert.notEqual(next,builder);next=load155InlineCompatibility.toString()+'\n'+next;
 const before='try{audit=await verifyAuditForWebCandidate(root,path);}';assert.equal(next.split(before).length,2);
 next=next.replace(before,"const inlineCompatibility=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article)?.inlineCompatibility;let verifySelected=verifyAuditForWebCandidate,stageSelected=stageWebTextbook;if(inlineCompatibility){const route=await load155InlineCompatibility(root,path,inlineCompatibility);verifySelected=route.verify;stageSelected=route.stage;}try{audit=await verifySelected(root,path);}");
 const stage='receipt=await stageWebTextbook({processingRoot:root,candidatePath:path,destination:dest,verify:verifyAuditForWebCandidate,';assert.equal(next.split(stage).length,2);next=next.replace(stage,'receipt=await stageSelected({processingRoot:root,candidatePath:path,destination:dest,verify:verifySelected,');
 const canon='const canon=n=>{let v=';assert.equal(next.split(canon).length,2);next=next.replace(canon,"const canon=n=>{if(n==='cv1751265.coac244inline20261027.json'||n==='cv1751265.coac244inline20261027.display.json')return 'cv1751265';let v=");
 const afterStage="  const nextLibrary=await load(join(dest,'knowledge-index.json'))";assert.equal(next.split(afterStage).length,2);next=next.replace(afterStage,"  if(inlineCompatibility){const job=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article);for(const ref of [job.displaySegmentsProof,job.intakeAnnotations])if(sha(await readFile(ref.path))!==ref.sha256)throw Error('inline155_intake_evidence_changed');Object.assign(receipt,{inlineCompatibility,displaySegmentsProof:job.displaySegmentsProof,intakeAnnotations:job.intakeAnnotations});await atomicJson(join(dest,'web-stage-receipt.json'),receipt);}\n"+afterStage);
 const selected='inputAdjudication:audit.inputAdjudication,';assert.equal(next.split(selected).length,2);next=next.replace(selected,selected+'...(inlineCompatibility?{inlineCompatibility,displaySegmentsProof:receipt.displaySegmentsProof,intakeAnnotations:receipt.intakeAnnotations}:{}),');
 return next;
}
