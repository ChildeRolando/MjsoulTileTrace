// Persist the one accepted inline candidate's exact gate/stager route in the existing builder.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function load162InlineCompatibility(root,path,binding){
 const bytes=await readFile(path),c=JSON.parse(bytes);
 if(c.source.sourceId!=='79-bilibili-cn'||c.source.articleId!=='cv1751316'||sha(bytes)!==binding.candidateSha256)throw Error('inline162_candidate_binding');
 if(binding.runtime.files.length!==15)throw Error('inline162_runtime_scope');
 for(const f of binding.runtime.files)if(sha(await readFile(binding.runtime.runtime+'/'+f.name))!==f.sha256)throw Error('inline162_runtime_changed:'+f.name);
 const manifest=await readFile(binding.displayManifest.path);if(sha(manifest)!==binding.displayManifest.sha256||JSON.stringify(JSON.parse(manifest))!==JSON.stringify(binding.displayStage))throw Error('inline162_display_manifest_changed');
 for(const ref of [binding.displayStage.original,binding.displayStage.module,binding.displayStage.helper])if(sha(await readFile(ref.path))!==ref.sha256)throw Error('inline162_display_module_changed');
 const verify=(await import(pathToFileURL(binding.runtime.runtime+'/textbook-audit-web.mjs'))).verifyAuditForWebCandidate,stage=(await import(pathToFileURL(binding.displayStage.module.path))).stageWebTextbook;
 return {verify,stage};
}
export function updateBuilder(builder,pre,nextSha){
 for(const key of ['specific-web-variant-selection.v19.json',pre.configs.variants.sha256])assert.equal(builder.split(key).length,2,key);
 let next=builder.replace('specific-web-variant-selection.v19.json','specific-web-variant-selection.v20.json').replace(pre.configs.variants.sha256,nextSha);
 next=load162InlineCompatibility.toString()+'\n'+next;
 const route='const route=await load155InlineCompatibility(root,path,inlineCompatibility);';assert.equal(next.split(route).length,2);
 next=next.replace(route,"const route=await (article==='cv1751316'?load162InlineCompatibility:load155InlineCompatibility)(root,path,inlineCompatibility);");
 const canon='const canon=n=>{';assert.equal(next.split(canon).length,2);next=next.replace(canon,"const canon=n=>{if(n==='cv1751316.coac244inline20261027.json'||n==='cv1751316.coac244inline20261027.display.json')return 'cv1751316';");
 return next;
}
