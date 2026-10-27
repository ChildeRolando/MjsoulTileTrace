import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,access,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dir,repo,root,integration,pkg,chapter} from './config.mjs';
const load=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),bind=async p=>({path:p,sha256:sha(await readFile(p))}),save=async(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
await mkdir(dir,{recursive:true});for(const p of [integration+'/accepted-consumer.lock',integration+'/selection-maintainer.lock.json',integration+'/ACCEPTED-CONSUMER-STOP'])try{await access(p);throw Error('active lock/STOP '+p);}catch(e){if(e.code!=='ENOENT')throw e;}
const prior=await load(integration+'/accepted-preview-current.json');assert.equal(prior.units,239);assert.equal(prior.chapters,231);assert(!(await load(prior.output+'/knowledge-index.json')).chapters.some(x=>x.id===chapter));
const before={pointer:await bind(integration+'/accepted-preview-current.json'),webSelection:await bind(integration+'/current-web-candidate-selection.json'),variants:await bind(integration+'/specific-web-variant-selection.v22.json'),builder:await bind(integration+'/build-accepted-preview.mjs'),register:await bind(integration+'/coac250-unified-chapter-register-20261027b.json'),owner:await bind(repo+'/docs/plans/2026-10-24-full-textbook-processing.md')};for(const [key,b]of Object.entries(before))await copyFile(b.path,dir+'/'+key+'.before'+(key==='builder'?'.mjs':key==='owner'?'.md':'.json'));
const c=await load(pkg+'/config.json'),r=await load(pkg+'/193-reuse-receipt.json');assert.equal(r.parent.sha256,'046188e3be510f12c1e729353aa01fb5b1ce866685acf84e34284b8571f49e93');assert.equal(r.originalAudit.sha256,'a264ce2d6452fda9ccc539910510ab2334f604f10eb7e77a14f6cea6486e449f');assert.equal(r.fullChapterPassed,false);assert.deepEqual(r.originalAuditCallIds,['eb2060c9-7952-40ff-af91-11093800c63d']);
const protectedFiles=(await load('_analysis/coac250-215/preconsume.json')).protectedFiles.filter(f=>f.path!==before.owner.path);const point=await load(dir+'/points/verification.json');protectedFiles.push(...point.protectedFiles);
async function protect(b){const bytes=await readFile(b.path);assert.equal(sha(bytes),b.sha256,b.path);protectedFiles.push(b);return bytes;}
for(const b of [r.parent,r.originalAudit,r.sourcePage,r.ownership,r.webSource,c.runtimeManifest])await protect(b);const manifest=await load(c.runtimeManifest.path);for(const f of manifest.files)await protect(f.current);
const parent=await load(r.parent.path),block=parent.body.blocks.find(b=>b.sourceBlockIds?.includes('79-cn-p193-b6'));for(const s of r.slices){assert.equal([...block.text].slice(s.fromCodepoint,s.toCodepoint).join(''),s.text);assert.equal(block.text.slice(s.fromCodepoint,s.toCodepoint),s.text);assert.equal(Buffer.from(s.text).equals(Buffer.from([...block.text].slice(s.fromCodepoint,s.toCodepoint).join(''))),true);}
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250193 source-version preflight'})+'\n',{flag:'wx'});
try{const result=spawnSync(process.execPath,[pkg+'/reuse-193.mjs'],{windowsHide:true,encoding:'utf8'});await writeFile(dir+'/upstream-revalidation.log',(result.stdout??'')+(result.stderr??''));assert.equal(result.status,0,result.stderr);}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
const reuse=await load(pkg+'/193-reuse-receipt.json');assert.equal(reuse.corpusId,'7d1743898551fa7b8cf3cfcb26f1ee234d332e93434443c5a09fc3340c17c4d7');assert.equal(reuse.bodySha256,'807ad83faf24e1f50b42abe07df1f74a1f35011df9bb1afb988e353d177800fd');assert.equal(reuse.originalChapterCoverageIncrement,0);assert.equal(reuse.supplementChapterId,chapter);
for(const n of ['config.json','reuse-193.mjs','193-reuse-receipt.json','verification-runtime-manifest.json'])await copyFile(pkg+'/'+n,dir+'/upstream-'+n);
const files=[];for(const path of [pkg+'/config.json',pkg+'/193-reuse-receipt.json',c.runtimeManifest.path,repo+'/scripts/scene-study/compile-textbook-corpus.mjs',repo+'/scripts/scene-study/textbook-review.mjs'])files.push(await bind(path));
let stage=await readFile(pkg+'/reuse-193.mjs','utf8');
stage=stage.replace("const config=JSON.parse(await readFile(join(import.meta.dirname,'config.json'),'utf8'));",`export async function stagePdf193Supplement({processingRoot,destination,sourceLibraryPath,binding}){
assert.equal(processingRoot.replaceAll('\\\\','/'),'E:/AgentData/Coach/knowledge/processing');assert.equal(binding.chapterId,'79-cn-chapter-193-4-pdf193-supplement');
for(const f of [...binding.files,binding.config,binding.reuseReceipt])assert.equal(createHash('sha256').update(await readFile(f.path)).digest('hex'),f.sha256,f.path);
const config=JSON.parse(await readFile(binding.config.path,'utf8')),expected=JSON.parse(await readFile(binding.reuseReceipt.path,'utf8'));
assert.equal(expected.fullChapterPassed,false);assert.equal(expected.originalChapterCoverageIncrement,0);assert.equal(expected.parent.sha256,'046188e3be510f12c1e729353aa01fb5b1ce866685acf84e34284b8571f49e93');
const runtimeManifest=JSON.parse(await readFile(config.runtimeManifest.path,'utf8'));for(const f of runtimeManifest.files)assert.equal(createHash('sha256').update(await readFile(f.current.path)).digest('hex'),f.current.sha256);`);
stage=stage.replace("stage=join(out,'stage-193-supplement');await mkdir(stage,{recursive:true});","stage=destination;await mkdir(stage,{recursive:false});");
stage=stage.replace("const pointer=await load(join(root,'integration/accepted-preview-current.json')),base=await load(join(pointer.output,'knowledge-index.json'));","const base=await load(sourceLibraryPath);");
stage=stage.slice(0,stage.indexOf("await save(join(out,'193-reuse-receipt.json')"))+`assert.deepEqual(slices,expected.slices);assert.equal(build.corpusId,expected.corpusId);assert.equal(build.bodySha256,expected.bodySha256);assert.equal(definitions[0].contentRole,'navigation');
receipt.selectionBinding=binding;await save(join(stage,'pdf-version-stage-receipt.json'),receipt);return receipt;
}
`;
await writeFile(dir+'/stage-pdf193-supplement.mjs',stage+'\n'+await readFile(dir+'/append-helper.mjs','utf8'));
const key={sourcePdfSha256:reuse.sourcePdfSha256,page:193,parentSha256:reuse.parent.sha256,sourceBlockId:'79-cn-p193-b6',slices:reuse.slices.map(s=>[s.fromCodepoint,s.toCodepoint])};
const binding={chapterId:chapter,supplementOf:'79-cn-chapter-193-4',module:{path:integration+'/stage-pdf193-supplement.mjs',sha256:sha(await readFile(dir+'/stage-pdf193-supplement.mjs'))},config:await bind(pkg+'/config.json'),reuseReceipt:await bind(pkg+'/193-reuse-receipt.json'),files,sourceIdentity:key,dedupeKey:sha(JSON.stringify(key)),contentRole:'navigation',originalChapterCoverageIncrement:0,fullChapterPassed:false,modelCalls:0};
for(const f of protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
await save(dir+'/preconsume.json',{allPassed:true,before,prior:{...before.pointer,output:prior.output},protectedFiles,binding,expected:{chapters:232,units:240,blocks:6339,figures:5128},originalCoverage:{chapters:231,units:263},modelCalls:0});console.log('PDF193 exact parent/source/slices and original independent gate passed');
