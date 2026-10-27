import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function load236FidelityReview(root,path,binding){
 const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await readFile(path),c=JSON.parse(bytes);
 if(c.source.sourceId!=='modern-yabejp-ja'||c.source.articleId!=='chapter04-section015'||sha(bytes)!=='6193212639b7c8abb42adf64b69759a5d00effc67c1f20d2c9ae681ded121a28'||sha(bytes)!==binding.candidateSha256)throw Error('fidelity236_candidate_binding');
 if(sha(await readFile(binding.manifest.path))!=='5ea60649c93530fe4ea330008fefcd3e827fed71fe4fbbb72c26f86d512ab568'||sha(await readFile(binding.manifest.path))!==binding.manifest.sha256)throw Error('fidelity236_manifest_changed');
 const m=JSON.parse(await readFile(binding.manifest.path));
 if(m.files.length!==17||m.scope.chapterId!=='nemata-jp-chapter-236-1'||m.scope.candidateSha256!==binding.candidateSha256||m.acceptanceRulesChanged!==false)throw Error('fidelity236_runtime_scope');
 for(const f of [...binding.files,...m.files])if(sha(await readFile(f.path))!==f.sha256)throw Error('fidelity236_bound_file_changed:'+f.path);
 const verify=(await import(pathToFileURL(binding.runtime+'/textbook-audit-web.mjs'))).verifyAuditForWebCandidate,stage=(await import(pathToFileURL(binding.stage.path))).stageWebTextbook;return {verify,stage};
}
export function updateBuilder(before,selectionSha){
 if(before.split('specific-web-variant-selection.v24.json').length!==3||before.split('d7f2792acecbd12a1d3192e9f6cf79a86ce3f1a5a1ee8c9a598a13030a362d39').length!==3)throw Error('builder v24 pins');
 before=before.replaceAll('specific-web-variant-selection.v24.json','specific-web-variant-selection.v25.json').replaceAll('d7f2792acecbd12a1d3192e9f6cf79a86ce3f1a5a1ee8c9a598a13030a362d39',selectionSha);
 const old='const route=await load183ContextReview(root,path,contextReview);';
 if(before.split(old).length!==2)throw Error('builder exact context dispatch');
 before=before.replace(old,"const route=await (sid==='modern-yabejp-ja'&&article==='chapter04-section015'?load236FidelityReview:load183ContextReview)(root,path,contextReview);");
 return load236FidelityReview.toString()+'\n'+before;
}
