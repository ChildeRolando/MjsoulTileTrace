import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function loadHuman257(root,binding){
 const sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(binding.chapterId,'nemata-jp-chapter-250-1');assert.equal(binding.candidate.sha256,'a9ce50898c0407ecca32dc538ad208f667a0a950372acec1114263e177f000e7');
 for(const f of [binding.candidate,binding.module,binding.admit,binding.manifest,binding.stageSeal,binding.handoff])assert.equal(sha(await readFile(f.path)),f.sha256,'257 binding '+f.path);
 const manifest=JSON.parse(await readFile(binding.manifest.path));for(const f of manifest.files)assert.equal(sha(await readFile(f.path)),f.sha256,'257 dependency '+f.path);
 const a=await import(pathToFileURL(binding.admit.path)),s=await import(pathToFileURL(binding.module.path));
 return {verify:()=>a.verifyLimited(root,binding.candidate.path),stage:o=>s.stageOwnedHuman257({...o,binding}),verifyStaged:dest=>s.verifyStage(root,binding.candidate.path,dest),postBuild:directory=>s.installOriginalImageLinks({processingRoot:root,directory})};
}
export function patch257(before,newSha,oldSha){
 assert.equal(before.split('specific-web-variant-selection.v42.json').length,3);assert.equal(before.split(oldSha).length,3);
 let s=before.replaceAll('specific-web-variant-selection.v42.json','specific-web-variant-selection.v43.json').replaceAll(oldSha,newSha);
 function change(a,b){assert.equal(s.split(a).length,2,a);s=s.replace(a,b);}
 change("pdfScopeSelections.length!==4", "pdfScopeSelections.length!==5");
 change("pdfScopeSelections[3].chapterId!=='nemata-jp-chapter-001-64'", "pdfScopeSelections[3].chapterId!=='nemata-jp-chapter-001-64'||pdfScopeSelections[4].chapterId!=='nemata-jp-chapter-250-1'");
 change("if(ownedScope){if(sha", "if(ownedScope?.chapterId==='nemata-jp-chapter-250-1'){const route=await loadHuman257(root,ownedScope);await route.verify();pdfStage=await route.stage({processingRoot:root,destination:pdfDestination,sourceLibraryPath:join(formal,'knowledge-index.json')});await route.verifyStaged(pdfDestination);}else if(ownedScope){if(sha");
 change(".link193VersionPair(output);", ".link193VersionPair(output);const human257Scope=pdfScopeSelections.find(s=>s.chapterId==='nemata-jp-chapter-250-1');if(human257Scope){const route=await loadHuman257(root,human257Scope);await route.postBuild(output);}");
 return loadHuman257.toString()+'\n'+s;
}
