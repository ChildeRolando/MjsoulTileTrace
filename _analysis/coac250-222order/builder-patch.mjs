import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function load222OrderAdjudication(root,path,binding){
 const sha=b=>createHash('sha256').update(b).digest('hex'),b=await readFile(path),c=JSON.parse(b);
 if(sha(b)!=='c51650a43ec7b124b8aaf0dba0b3d7918f674e150cc710141d7ee6230688357d'||sha(b)!==binding.candidateSha256||c.source.sourceId!=='79-bilibili-cn'||c.source.articleId!=='cv1775262')throw Error('order222_candidate_binding');
 if(binding.module.sha256!=='08c9ffe76263771259a8e62d55038c5f6c2f86efa1a538e70768457a54877572'||binding.adjudication.sha256!=='9bc8b55f306013a1b434f87ca450ae233979cca3ff27d296737f603be0c818cd')throw Error('order222_exact_adjudication_binding');
 for(const f of [binding.module,binding.stage,binding.adjudication,binding.contract,...binding.files])if(sha(await readFile(f.path))!==f.sha256)throw Error('order222_bound_file_changed:'+f.path);
 return {verify:(await import(pathToFileURL(binding.module.path))).verify222OrderedSupplement,stage:(await import(pathToFileURL(binding.stage.path))).stageWebTextbook};
}
export function updateBuilder(before,selectionSha){
 const oldSha='820d545e5618572f2463996971fcd05b32f02f503d02e0a282a4cd3bcae8db46';if(before.split('specific-web-variant-selection.v26.json').length!==3||before.split(oldSha).length!==3)throw Error('order222 v26 pins');
 let s=before.replaceAll('specific-web-variant-selection.v26.json','specific-web-variant-selection.v27.json').replaceAll(oldSha,selectionSha);const anchor='try{audit=await verifySelected(root,path);}catch(e)';if(s.split(anchor).length!==2)throw Error('order222 dispatch anchor');s=s.replace(anchor,"const orderReview=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article)?.orderReview;if(orderReview){const route=await load222OrderAdjudication(root,path,orderReview);verifySelected=route.verify;stageSelected=route.stage;}"+anchor);
 const receiptAnchor="  const nextLibrary=await load(join(dest,'knowledge-index.json'))";if(s.split(receiptAnchor).length!==2)throw Error('order222 receipt anchor');s=s.replace(receiptAnchor,"  if(orderReview){const job=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article);if(sha(await readFile(job.intakeAnnotations.path))!==job.intakeAnnotations.sha256)throw Error('order222_intake_changed');Object.assign(receipt,{orderReview,intakeAnnotations:job.intakeAnnotations,orderInputAdjudication:audit.orderInputAdjudication,originalModelFlags:audit.originalModelFlags,originalModelChecks:audit.modelChecks,notANewFullArticleModelReview:true});await atomicJson(join(dest,'web-stage-receipt.json'),receipt);}\n"+receiptAnchor);
 const selectionAnchor='inputAdjudication:audit.inputAdjudication,...(limitedUnknownReview?';if(s.split(selectionAnchor).length!==2)throw Error('order222 selection anchor');s=s.replace(selectionAnchor,'inputAdjudication:audit.inputAdjudication,...(orderReview?{orderReview,intakeAnnotations:receipt.intakeAnnotations,notANewFullArticleModelReview:true}:{}),...(limitedUnknownReview?');return load222OrderAdjudication.toString()+'\n'+s;
}
