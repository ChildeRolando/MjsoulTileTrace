import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access,copyFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {root,repo,integration,pkg,dir,chapter} from './config.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8')),bind=async p=>({path:p,sha256:sha(await readFile(p))}),save=async(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
await mkdir(dir,{recursive:true});
for(const p of [integration+'/accepted-consumer.lock',integration+'/selection-maintainer.lock.json',integration+'/ACCEPTED-CONSUMER-STOP']){try{await access(p);throw Error('active lock/STOP '+p+': '+await readFile(p,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
const current=await load(integration+'/accepted-preview-current.json');assert.equal(current.units,238);assert.equal(current.chapters,230);assert(!(await load(current.output+'/knowledge-index.json')).chapters.some(c=>c.id===chapter));
const variants=await load(integration+'/specific-web-variant-selection.v21.json');assert(!variants.pdfScopes?.length);
const before={pointer:await bind(integration+'/accepted-preview-current.json'),webSelection:await bind(integration+'/current-web-candidate-selection.json'),variants:await bind(integration+'/specific-web-variant-selection.v21.json'),builder:await bind(integration+'/build-accepted-preview.mjs'),register:await bind(integration+'/coac250-unified-chapter-register-20261027b.json'),owner:await bind(repo+'/docs/plans/2026-10-24-full-textbook-processing.md')};
for(const [key,b]of Object.entries(before))await copyFile(b.path,dir+'/'+key+'.before'+(key==='builder'?'.mjs':key==='owner'?'.md':'.json'));
const c=await load(pkg+'/config.json');assert.equal(c.chapterId,chapter);assert.deepEqual(c.p217.sourceBlockIds,['79-cn-p217-b1','79-cn-p217-b3']);assert.equal(c.p217.candidate.sha256,'73410520b240c15305d220c0aa472bb0f53392255dd0167b78d8a4627aac0add');
const protectedFiles=[...(await load('_analysis/coac250-157/preconsume.json')).protectedFiles];
async function protect(p,h){const b=await readFile(p);if(h)assert.equal(sha(b),h,p);protectedFiles.push({path:p,sha256:sha(b)});return b;}
for(const name of ['config.json','stage-and-verify.mjs','verification-runtime-manifest.json']){await protect(pkg+'/'+name);await copyFile(pkg+'/'+name,dir+'/upstream-'+name);}
const manifest=JSON.parse(await protect(c.runtimeManifest.path,c.runtimeManifest.sha256));for(const f of manifest.files){await protect(f.current.path,f.current.sha256);await protect(f.parent.path,f.parent.sha256);}
const altered=manifest.files.filter(f=>f.current.sha256!==f.parent.sha256);assert.deepEqual(altered.map(f=>f.name),['textbook-audit.mjs']);
const oldAudit=await readFile(altered[0].parent.path,'utf8'),newAudit=await readFile(altered[0].current.path,'utf8');assert.equal(newAudit,oldAudit.replace('async function verifyPdfAuditEvidence(','export async function verifyPdfAuditEvidence('));
for(const b of [c.chapterMap,c.ownership,c.sourceInventory,c.p217.candidate,c.p217.audit])await protect(b.path,b.sha256);
for(const n of ['publish-textbooks.mjs','stage-pdf-chapters.mjs'])await protect(repo+'/scripts/textbook-processing/'+n);
for(const n of ['compile-textbook-corpus.mjs','textbook-review.mjs'])await protect(repo+'/scripts/scene-study/'+n);
for(const selected of c.selected.filter(x=>[215,216].includes(x.page))){await protect(join(root,selected.candidatePath),selected.candidateSha256);await protect(selected.auditPath);}
const p=await load(pkg+'/215-scope-proof.json');await protect(p.source.path,p.source.sha256);for(const call of p.inheritedCalls){const raw=call.rawArtifactPath??('audit/calls/'+call.callId+'.json');await protect(join(root,raw),call.rawArtifactSha256);}
for(const f of protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250 scope215 preflight'})+'\n',{flag:'wx'});
try{
 const r=spawnSync(process.execPath,[pkg+'/stage-and-verify.mjs'],{windowsHide:true,encoding:'utf8'});await writeFile(dir+'/upstream-revalidation.log',(r.stdout??'')+(r.stderr??''));assert.equal(r.status,0,r.stderr);
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
const receipt=await load(pkg+'/215-stage-receipt.json');assert.equal(receipt.blocks,7);assert.equal(receipt.figures,0);assert.equal(receipt.corpusId,'82178dd9552e5f2a3f91e7441b0ef3f364f215437e309304811e221902f7ff04');assert.equal(receipt.bodySha256,'15b1684eb9a3cba8a04f6e8eba0705cf7156af34730a9455952cba116c89de51');assert.equal(receipt.fullPage217Passed,false);
for(const n of ['215-scope-proof.json','215-stage-receipt.json','215-verification.json'])await copyFile(pkg+'/'+n,dir+'/upstream-'+n);
// Derive a reusable, bounded entry from the supplied zero-model assembler. Original package stays intact.
let stage=await readFile(pkg+'/stage-and-verify.mjs','utf8');
stage=stage.replace("const here=import.meta.dirname,config=JSON.parse(await readFile(join(here,'config.json'),'utf8'));","export async function stageOwned215({processingRoot,destination,sourceLibraryPath,binding}){\nassert.equal(processingRoot.replaceAll('\\\\','/'),'E:/AgentData/Coach/knowledge/processing');\nassert.equal(binding.chapterId,'79-cn-chapter-215-4');\nfor(const f of binding.files)assert.equal(createHash('sha256').update(await readFile(f.path)).digest('hex'),f.sha256,f.path);\nconst config=JSON.parse(await readFile(binding.config.path,'utf8'));assert.equal(config.chapterId,binding.chapterId);\nassert.equal(config.p217.candidate.sha256,'73410520b240c15305d220c0aa472bb0f53392255dd0167b78d8a4627aac0add');\nconst priorReceipt=JSON.parse(await readFile(binding.stageReceipt.path,'utf8'));\nassert.equal(priorReceipt.corpusId,'82178dd9552e5f2a3f91e7441b0ef3f364f215437e309304811e221902f7ff04');");
stage=stage.replace('export function requireFaithfulScope','function requireFaithfulScope');
stage=stage.replace("await save(join(out,'215-scope-proof.json'),scopeProof);",'assert.deepEqual(scopeProof,await load(binding.scopeProof.path));');
stage=stage.replace("const prior=await load(join(root,'integration/accepted-preview-current.json')),baseLibrary=await load(join(prior.output,'knowledge-index.json'));","const baseLibrary=await load(sourceLibraryPath);");
stage=stage.replace("const stage=join(out,'stage-215');await mkdir(stage,{recursive:true});",'const stage=destination;await mkdir(stage,{recursive:false});');
stage=stage.replace("scopeProof:await bind(join(out,'215-scope-proof.json'))","scopeProof:binding.scopeProof");
stage=stage.replace("await save(join(stage,'pdf-stage-receipt.json'),receipt);await save(join(out,'215-stage-receipt.json'),receipt);","assert.equal(result.corpusId,priorReceipt.corpusId);assert.equal(result.bodySha256,priorReceipt.bodySha256);assert.equal(receipt.blocks,7);assert.equal(receipt.figures,0);receipt.scopeSelection=binding;await save(join(stage,'pdf-stage-receipt.json'),receipt);");
stage=stage.slice(0,stage.indexOf('// Regression rejects'))+'return receipt;\n}\n';
await writeFile(dir+'/stage-owned-215.mjs',stage);
// Every actual relative module in the new evidence runtime must be in its manifest.
const collect=(await import('file:///'+c.runtime.replaceAll('\\','/')+'/textbook-audit-verification-dependencies.mjs')).collectModuleDependencyFiles;
const dependencies=await collect(c.runtime+'/textbook-audit.mjs');for(const f of dependencies){const listed=manifest.files.find(x=>x.name===f.name);assert(listed,'unbound dependency '+f.name);assert.equal(f.sha256,listed.current.sha256);}
const files=[];for(const path of [pkg+'/config.json',pkg+'/215-scope-proof.json',pkg+'/215-stage-receipt.json',pkg+'/stage-and-verify.mjs',c.runtimeManifest.path,repo+'/scripts/textbook-processing/publish-textbooks.mjs',repo+'/scripts/scene-study/compile-textbook-corpus.mjs',repo+'/scripts/scene-study/textbook-review.mjs'])files.push(await bind(path));
const scope={chapterId:chapter,module:{path:integration+'/stage-owned-215.mjs',sha256:sha(stage)},config:await bind(pkg+'/config.json'),scopeProof:await bind(pkg+'/215-scope-proof.json'),stageReceipt:await bind(pkg+'/215-stage-receipt.json'),runtimeManifest:c.runtimeManifest,files,sourceBlockIds:c.p217.sourceBlockIds,originalPage217Status:'needs-repair',fullPage217Passed:false,modelCalls:0};
await save(dir+'/preconsume.json',{allPassed:true,before,prior:{...before.pointer,output:current.output},protectedFiles,scope,dependencies,runtimeFiles:manifest.files.length,exportOnlyChange:true,expected:{chapters:231,units:239,blocks:6337,figures:5128},modelCalls:0});
console.log(JSON.stringify({allPassed:true,runtimeFiles:manifest.files.length,dependencies:dependencies.length,protectedFiles:protectedFiles.length,stage:receipt.corpusId,modelCalls:0}));
