import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function load157VisionReview(root,path,binding){
 const bytes=await readFile(path),c=JSON.parse(bytes);
 if(c.source.sourceId!=='79-bilibili-cn'||c.source.articleId!=='cv1751276'||sha(bytes)!==binding.candidateSha256)throw Error('vision157_candidate_binding');
 const manifestBytes=await readFile(binding.manifest.path);if(sha(manifestBytes)!==binding.manifest.sha256)throw Error('vision157_manifest_changed');const manifest=JSON.parse(manifestBytes);
 if(manifest.files.length!==27||manifest.imageRequest.model!=='gpt-6.1-terra'||manifest.imageRequest.reasoningEffort!=='max')throw Error('vision157_runtime_scope');
 for(const f of manifest.files)if(sha(await readFile(binding.runtime+'/'+f.path))!==f.sha256)throw Error('vision157_runtime_changed:'+f.path);
 const deps=await import(pathToFileURL(binding.runtime+'/textbook-audit-verification-dependencies.mjs'));if(JSON.stringify(await deps.collectModuleDependencyFiles(binding.runtime+'/textbook-audit-web.mjs'))!==JSON.stringify(binding.dependencyManifest.files))throw Error('vision157_dependency_binding');
 for(const ref of [binding.stage,binding.audit,binding.requestEvidence.raw])if(sha(await readFile(ref.path))!==ref.sha256)throw Error('vision157_bound_file_changed');
 const raw=JSON.parse(await readFile(binding.requestEvidence.raw.path));if(raw.callId!==binding.requestEvidence.callId||raw.requestExecution?.model!=='gpt-6.1-terra'||raw.requestExecution?.reasoningEffort!=='max')throw Error('vision157_request_binding');
 const verify=(await import(pathToFileURL(binding.runtime+'/textbook-audit-web.mjs'))).verifyAuditForWebCandidate,stage=(await import(pathToFileURL(binding.stage.path))).stageWebTextbook;
 return {verify,stage};
}
export function updateBuilder(builder,pre,nextSha){
 for(const key of ['specific-web-variant-selection.v20.json',pre.configs.variants.sha256])assert.equal(builder.split(key).length,2,key);
 let next=builder.replace('specific-web-variant-selection.v20.json','specific-web-variant-selection.v21.json').replace(pre.configs.variants.sha256,nextSha);next=load157VisionReview.toString()+'\n'+next;
 const before='try{audit=await verifySelected(root,path);}';assert.equal(next.split(before).length,2);next=next.replace(before,"const visionReview=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article)?.visionReview;if(visionReview){const route=await load157VisionReview(root,path,visionReview);verifySelected=route.verify;stageSelected=route.stage;}"+before);
 const afterStage="  const nextLibrary=await load(join(dest,'knowledge-index.json'))";assert.equal(next.split(afterStage).length,2);next=next.replace(afterStage,"  if(visionReview){const job=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article);if(sha(await readFile(job.intakeAnnotations.path))!==job.intakeAnnotations.sha256)throw Error('vision157_intake_evidence_changed');Object.assign(receipt,{visionReview,intakeAnnotations:job.intakeAnnotations});await atomicJson(join(dest,'web-stage-receipt.json'),receipt);}\n"+afterStage);
 const selected='inputAdjudication:audit.inputAdjudication,';assert.equal(next.split(selected).length,2);next=next.replace(selected,selected+'...(visionReview?{visionReview,intakeAnnotations:receipt.intakeAnnotations}:{}),');return next;
}
