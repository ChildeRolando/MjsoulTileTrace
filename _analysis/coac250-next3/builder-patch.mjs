import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function load159242LimitedFidelity(root,path,binding){
 const sha=b=>createHash('sha256').update(b).digest('hex'),digest=sha(await readFile(path));
 if(!['5f2555f1ad90b99581f054974c7bc29b6536896926cc7c33a3f9574cf51c3373','62987619296c7f7ef775b41967e69f84802a17c08146df9ffd436f51f84b19aa'].includes(digest)||digest!==binding.candidateSha256)throw Error('limited159242_candidate_binding');
 for(const f of [binding.module,binding.stage,binding.manifest,binding.contract])if(sha(await readFile(f.path))!==f.sha256)throw Error('limited159242_bound_file_changed');
 const manifest=JSON.parse(await readFile(binding.manifest.path));if(manifest.contract.sha256!==binding.contract.sha256)throw Error('limited159242_contract');for(const f of manifest.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('limited159242_runtime_changed:'+f.path);
 return {verify:(await import(pathToFileURL(binding.module.path))).verifyLimitedUnknownFidelity,stage:(await import(pathToFileURL(binding.stage.path))).stageWebTextbook};
}
export function updateBuilder(before,selectionSha){
 const oldSha='140a2d6c1919e13484ff2a2dff1c7c8123c6b089a3cd8c7c49bf8238a54295e6';
 if(before.split('specific-web-variant-selection.v25.json').length!==3||before.split(oldSha).length!==3)throw Error('v25 builder pins');
 let s=before.replaceAll('specific-web-variant-selection.v25.json','specific-web-variant-selection.v26.json').replaceAll(oldSha,selectionSha);
 const anchor='try{audit=await verifySelected(root,path);}catch(e)';if(s.split(anchor).length!==2)throw Error('limited route dispatch anchor');
 const dispatch="const limitedUnknownReview=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article)?.limitedUnknownReview;if(limitedUnknownReview){const route=await load159242LimitedFidelity(root,path,limitedUnknownReview);verifySelected=route.verify;stageSelected=route.stage;}";
 s=s.replace(anchor,dispatch+anchor);
 const stageAnchor='  const nextLibrary=await load(join(dest,\'knowledge-index.json\'))';if(s.split(stageAnchor).length!==2)throw Error('limited receipt anchor');
 s=s.replace(stageAnchor,"  if(limitedUnknownReview){const job=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article);if(sha(await readFile(job.intakeAnnotations.path))!==job.intakeAnnotations.sha256)throw Error('limited159242_intake_changed');Object.assign(receipt,{limitedUnknownReview,intakeAnnotations:job.intakeAnnotations});await atomicJson(join(dest,'web-stage-receipt.json'),receipt);}\n"+stageAnchor);
 s=s.replace('inputAdjudication:audit.inputAdjudication,...(contextReview?', 'inputAdjudication:audit.inputAdjudication,...(limitedUnknownReview?{limitedUnknownReview,intakeAnnotations:receipt.intakeAnnotations}:{}),...(contextReview?');
 return load159242LimitedFidelity.toString()+'\n'+s;
}
