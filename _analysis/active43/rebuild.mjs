import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {sha,load} from './publication.mjs';
// Reproduce the owner-accepted release from sealed source bodies/definitions.
// No model, OCR or semantic re-review; active-directory contents are not inputs.
export async function rebuildAccepted(manifestPath,destination){
 const m=await load(manifestPath);assert.equal(m.corpusId,'bd7a83525edb8cb69f27d8aa050dcb010047f79ae318748bdbe448d5b797836d');
 for(const f of m.files)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);for(const f of m.modules)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 await mkdir(destination,{recursive:false});await mkdir(destination+'/assets');
 for(const n of ['knowledge-index.json','textbook-bodies.json','textbook-unit-map.json']){const f=m.files.find(f=>f.name===n);await copyFile(f.path,destination+'/'+n);}
 for(const f of m.images){const bytes=await readFile(f.path);assert.equal(sha(bytes),f.sha256);await writeFile(destination+'/'+f.relativePath,bytes);}
 const compiler=await import(pathToFileURL(m.compiler)),renderer=await import(pathToFileURL(m.renderer)),definitions=await load(destination+'/textbook-unit-map.json'),build=await compiler.compileTextbookCorpus(destination,definitions);assert.equal(build.corpusId,m.corpusId);await renderer.buildTextbookReview(destination,await load(destination+'/knowledge-index.json'));
 await(await import(pathToFileURL(m.coverHook))).linkCoverSourceNotes(destination);await(await import(pathToFileURL(m.versionHook))).link193VersionPair(destination);await(await import(pathToFileURL(m.originalImageHook))).installOriginalImageLinks({processingRoot:m.processingRoot,directory:destination});
 const layout=spawnSync('F:/Code/python/python.exe',[m.separatorModule,destination],{encoding:'utf8',windowsHide:true});assert.equal(layout.status,0,layout.stderr);
 for(const n of ['knowledge-index.json','textbook-bodies.json','textbook-unit-map.json','textbook-corpus.json','knowledge.html'])assert.equal(sha(await readFile(destination+'/'+n)),m.files.find(f=>f.name===n).sha256,'rebuilt '+n);
 return {passed:true,destination,...build,separatorGroups:772,originalScreenshotLinks:2,codeAndInputFilesVerified:true,newModelCalls:0};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/rebuild.mjs')&&process.argv[2])console.log(JSON.stringify(await rebuildAccepted(process.argv[2],process.argv[3])));
