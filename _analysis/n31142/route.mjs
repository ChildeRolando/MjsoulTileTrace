import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function load311Native(root,path,binding){
 const sha=x=>createHash('sha256').update(x).digest('hex');
 if(binding.candidateSha256!=='ca5792a85433de54d0bfa82649a3707707ef64747d3beb5f8944a5bec372ad97'||sha(await readFile(path))!==binding.candidateSha256)throw Error('311_exact_proposal');
 for(const f of [binding.module,binding.stage,binding.manifest,binding.stageSeal,binding.handoff])if(sha(await readFile(f.path))!==f.sha256)throw Error('311_owner_binding');
 const m=JSON.parse(await readFile(binding.manifest.path));for(const f of m.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('311_dependency');
 const a=await import(pathToFileURL(binding.module.path)),s=await import(pathToFileURL(binding.stage.path));
 return {verify:a.verifyLimited,stage:s.stageLimited,verifyStaged:(root,dest)=>s.verifyStage(root,path,dest)};
}
export function patch311(before,newSha,oldSha){
 assert.equal(before.split('specific-web-variant-selection.v41.json').length,3);assert.equal(before.split(oldSha).length,3);
 let s=before.replaceAll('specific-web-variant-selection.v41.json','specific-web-variant-selection.v42.json').replaceAll(oldSha,newSha);
 function change(a,b){assert.equal(s.split(a).length,2,a);s=s.replace(a,b);}
 change('const exact232Job=JSON.parse(variantBytes)',"const exact311Job=JSON.parse(variantBytes).jobs.find(j=>j.sourceId===sid&&j.articleId===article&&j.native311Review);const exact232Job=JSON.parse(variantBytes)");
 change('const path=exact232Job?exact232Job.candidatePath:join(dir,name)', 'const path=exact311Job?exact311Job.candidatePath:exact232Job?exact232Job.candidatePath:join(dir,name)');
 change('const human232Review=exact232Job?.human232Review;if(', 'const native311Review=exact311Job?.native311Review;const human232Review=exact232Job?.human232Review;if(');
 change('&&!human232Review)try{await access', '&&!human232Review&&!native311Review)try{await access');
 change('try{audit=await verifySelected(root,path);}catch(e)', 'if(native311Review){const route=await load311Native(root,path,native311Review);verifySelected=route.verify;stageSelected=route.stage;}try{audit=await verifySelected(root,path);}catch(e)');
 change("  const nextLibrary=await load(join(dest,'knowledge-index.json'))", "  if(native311Review){const route=await load311Native(root,path,native311Review);await route.verifyStaged(root,dest);Object.assign(receipt,{native311Review});await atomicJson(join(dest,'web-stage-receipt.json'),receipt);}\n  const nextLibrary=await load(join(dest,'knowledge-index.json'))");
 change('inputAdjudication:audit.inputAdjudication,...(human232Review?', 'inputAdjudication:audit.inputAdjudication,...(native311Review?{native311Review}:{}),...(human232Review?');
 return load311Native.toString()+'\n'+s;
}
