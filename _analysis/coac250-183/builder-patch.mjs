import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function load183ContextReview(root,path,binding){
 const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await readFile(path),c=JSON.parse(bytes);
 if(c.source.sourceId!=='modern-yabejp-ja'||c.source.articleId!=='chapter03-section003'||sha(bytes)!=='973bbc3eb85dedaed18a5b11903b8002b8dffcade1e6d3a3f7bb25cd1684d45a'||sha(bytes)!==binding.candidateSha256)throw Error('context183_candidate_binding');
 if(sha(await readFile(binding.manifest.path))!==binding.manifest.sha256)throw Error('context183_manifest_changed');const m=JSON.parse(await readFile(binding.manifest.path));
 if(m.files.length!==17||m.scope.candidateSha256!==binding.candidateSha256||m.acceptanceRulesChanged!==false)throw Error('context183_runtime_scope');
 for(const f of [...binding.files,...m.files])if(sha(await readFile(f.path))!==f.sha256)throw Error('context183_bound_file_changed:'+f.path);
 const verify=(await import(pathToFileURL(binding.runtime+'/textbook-audit-web.mjs'))).verifyAuditForWebCandidate,stage=(await import(pathToFileURL(binding.stage.path))).stageWebTextbook;return {verify,stage};
}
export function updateBuilder(before,selectionSha){
 if(before.split('specific-web-variant-selection.v23.json').length!==3||before.split('120816d1323e2ae1f73a3085336aa892d3a682f72e2907dc735abfa22a8ef1c5').length!==3)throw Error('builder v23 pins');before=before.replaceAll('specific-web-variant-selection.v23.json','specific-web-variant-selection.v24.json').replaceAll('120816d1323e2ae1f73a3085336aa892d3a682f72e2907dc735abfa22a8ef1c5',selectionSha);
 const once=(a,b)=>{if(before.split(a).length!==2)throw Error('builder context183 patch '+a);before=before.replace(a,b);};
 once('try{audit=await verifySelected(root,path);}',"const contextReview=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article)?.contextReview;if(contextReview){const route=await load183ContextReview(root,path,contextReview);verifySelected=route.verify;stageSelected=route.stage;}try{audit=await verifySelected(root,path);}");
 once("  const nextLibrary=await load(join(dest,'knowledge-index.json'))", "  if(contextReview){const job=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article);if(sha(await readFile(job.intakeAnnotations.path))!==job.intakeAnnotations.sha256)throw Error('context183_intake_changed');Object.assign(receipt,{contextReview,intakeAnnotations:job.intakeAnnotations});await atomicJson(join(dest,'web-stage-receipt.json'),receipt);}\n  const nextLibrary=await load(join(dest,'knowledge-index.json'))");
 once("inputAdjudication:audit.inputAdjudication,...(visionReview?", "inputAdjudication:audit.inputAdjudication,...(contextReview?{contextReview,intakeAnnotations:receipt.intakeAnnotations}:{}),...(visionReview?");
 return load183ContextReview.toString()+'\n'+before;
}
