import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function load100ConditionReview(root,path,binding){
 const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await readFile(path),c=JSON.parse(bytes);
 if(sha(bytes)!=='0415bd3cab999892faec1f3ae6ae8586f4b4adb1b93f486e37b1188bf7c49fc3'||sha(bytes)!==binding.candidateSha256||c.source.sourceId!=='modern-yabejp-ja'||c.source.articleId!=='chapter01-section035')throw Error('condition100_candidate_binding');
 if(binding.module.sha256!=='1b18b13f1f293715e48b362b9ac04e4ca1d01a9aa4f4aa68dc2fe247d14706fb'||binding.manifest.sha256!=='f21b00fec06b471fca4a4417f08405018362991a9f4a748f3f6e0ac250c4bde9')throw Error('condition100_exact_runtime_binding');
 for(const f of [binding.module,binding.manifest,binding.stage,...binding.files])if(sha(await readFile(f.path))!==f.sha256)throw Error('condition100_bound_file_changed:'+f.path);
 const m=JSON.parse(await readFile(binding.manifest.path));if(m.files.length!==53)throw Error('condition100_runtime_count');for(const f of m.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('condition100_runtime_changed:'+f.path);
 return {verify:(await import(pathToFileURL(binding.module.path))).verify100Final,stage:(await import(pathToFileURL(binding.stage.path))).stageWebTextbook};
}
export function updateBuilder(before,selectionSha,previousSha){
 if(before.split('specific-web-variant-selection.v27.json').length!==3||before.split(previousSha).length!==3)throw Error('condition100 v27 selection pins');let s=before.replaceAll('specific-web-variant-selection.v27.json','specific-web-variant-selection.v28.json').replaceAll(previousSha,selectionSha);
 const anchor='try{audit=await verifySelected(root,path);}catch(e)';if(s.split(anchor).length!==2)throw Error('condition100 dispatch anchor');s=s.replace(anchor,"const conditionReview=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article)?.conditionReview;if(conditionReview){const route=await load100ConditionReview(root,path,conditionReview);verifySelected=route.verify;stageSelected=route.stage;}"+anchor);
 const receiptAnchor="  const nextLibrary=await load(join(dest,'knowledge-index.json'))";if(s.split(receiptAnchor).length!==2)throw Error('condition100 receipt anchor');s=s.replace(receiptAnchor,"  if(conditionReview){const job=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article);if(sha(await readFile(job.intakeAnnotations.path))!==job.intakeAnnotations.sha256)throw Error('condition100_intake_changed');Object.assign(receipt,{conditionReview,intakeAnnotations:job.intakeAnnotations,reviewMethod:audit.method,notANewFullArticleModelReview:true});await atomicJson(join(dest,'web-stage-receipt.json'),receipt);}\n"+receiptAnchor);
 const sel='inputAdjudication:audit.inputAdjudication,...(orderReview?';if(s.split(sel).length!==2)throw Error('condition100 selected receipt anchor');s=s.replace(sel,'inputAdjudication:audit.inputAdjudication,...(conditionReview?{conditionReview,intakeAnnotations:receipt.intakeAnnotations,notANewFullArticleModelReview:true}:{}),...(orderReview?');
 const canon='const canon=n=>{';if(s.split(canon).length!==2)throw Error('condition100 canonical filename anchor');s=s.replace(canon,canon+"if(n==='chapter01-section035.condition100-v1-20261028.json'||n==='chapter01-section035.condition100-v1-20261028.display.json')return 'chapter01-section035';");return load100ConditionReview.toString()+'\n'+s;
}
