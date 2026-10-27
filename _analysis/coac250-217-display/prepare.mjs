import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',integration=root+'/integration',repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach',dir='_analysis/coac250-217-display',shared=integration+'/coac250-pdf217-limited-display-20261028',sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8')),save=async(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n'),bind=async p=>({path:p,sha256:sha(await readFile(p))});
await mkdir(dir,{recursive:true});for(const n of ['accepted-consumer.lock','selection-maintainer.lock.json','ACCEPTED-CONSUMER-STOP'])await assert.rejects(access(integration+'/'+n),{code:'ENOENT'});
const before={};for(const [k,n]of Object.entries({pointer:'accepted-preview-current.json',variants:'specific-web-variant-selection.v28.json',register:'coac250-unified-chapter-register-20261027b.json',owner:'coac244-remaining26-closure-register-20261028.json',builder:'build-accepted-preview.mjs',webSelection:'current-web-candidate-selection.json'})){before[k]=await bind(integration+'/'+n);await writeFile(dir+'/'+k+'.before'+(k==='builder'?'.mjs':'.json'),await readFile(before[k].path));}
const prior=await load(before.pointer.path);assert.equal(prior.corpusId,'cbb2a0bb46307d1a17b44f56990300f2864ae25c10cb58360d090af7721a692c');const register=await load(before.register.path);assert.equal(register.rows.find(r=>r.originalChapterId==='79-cn-chapter-217-4').covered,false);assert.equal(register.counts.effectiveCoveredOriginalChapters,237);
const protectedFiles=[];for(const p of ['current-candidate-selection.json','candidate-exclusions.json','source-structure-holds.json','coac250-pdf219-limited-intake-20261028.json'])protectedFiles.push(await bind(integration+'/'+p));protectedFiles.push(await bind('E:/AgentData/Coach/knowledge/review/textbook-corpus.json'),await bind(root+'/audit/calls.jsonl'));
const files=[];for(const path of [integration+'/coac249-pdf218219-bounded-close-reviewed-20261028.json',root+'/source-inventory.json',repo+'/scripts/textbook-processing/publish-textbooks.mjs',repo+'/scripts/scene-study/compile-textbook-corpus.mjs',repo+'/scripts/scene-study/textbook-review.mjs'])files.push(await bind(path));
const binding={chapterId:'79-cn-chapter-217-4',module:{path:shared+'/stage-owned-217.mjs',sha256:sha(await readFile(dir+'/stage-owned-217.mjs'))},inventory:await bind(root+'/source-inventory.json'),files,ownerContract:{path:shared+'/owner-contract.md',sha256:sha(await readFile(dir+'/owner-contract.md'))},scope:'Exact217 paired correction +218 independent bounded author argument with seven mandatory non-author display slots +219 existing limited fidelity +220 full-page pass, only canonical22 owned source blocks; no ordinary whole-page217/218/219 pass.'};
files.push(binding.ownerContract);
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC250 exact217 limited display preparation only; no loop or model'})+'\n',{flag:'wx'});
try{
 await mkdir(shared,{recursive:true});for(const n of ['stage-owned-217.mjs','owner-contract.md'])await writeFile(shared+'/'+n,await readFile(dir+'/'+n),{flag:'wx'});
 const installed=await import(pathToFileURL(binding.module.path)),receipt=await installed.stageOwned217({processingRoot:root,destination:process.cwd()+'/'+dir+'/stage',sourceLibraryPath:'E:/AgentData/Coach/knowledge/review/knowledge-index.json',binding});
 await save(dir+'/stage-receipt.json',receipt);await save(dir+'/binding.json',binding);
 for(const f of [...Object.values(before),...protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 await save(dir+'/preconsume.json',{allPassed:true,canonical:binding.chapterId,before,protectedFiles,prior,binding,expected:{chapters:prior.chapters+1,units:prior.units+1,blocks:prior.blocks+receipt.blocks,figures:prior.figures+receipt.figures},modelCalls:0});
 console.log(JSON.stringify({allPassed:true,...receipt}));
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
