import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {stageOwned215} from './stage-owned-215.mjs';
import {updateBuilder} from './builder-patch.mjs';
import {dir,repo,root,integration} from './config.mjs';
const pre=JSON.parse(await readFile(dir+'/preconsume.json','utf8')),lock=integration+'/accepted-consumer.lock';
await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250 scope215 bounded route regression'})+'\n',{flag:'wx'});
try{
 const destination=process.cwd()+'/'+dir+'/route-stage';
 const args={processingRoot:root,destination,sourceLibraryPath:'E:/AgentData/Coach/knowledge/review/knowledge-index.json',binding:pre.scope};
 const receipt=await stageOwned215(args);assert.equal(receipt.fullPage217Passed,false);assert.equal(receipt.pages.find(p=>p.page===217).auditStatus,'needs-repair');
 let rejections=0;
 for(const mutate of [x=>x.binding.chapterId='79-cn-chapter-217-4',x=>x.processingRoot+='-other',x=>x.binding.files[0].sha256='0'.repeat(64),x=>x.binding.files.find(f=>f.path.endsWith('215-scope-proof.json')).sha256='0'.repeat(64),x=>x.binding.files.find(f=>f.path.endsWith('215-stage-receipt.json')).sha256='0'.repeat(64)]){const x=structuredClone(args);mutate(x);await assert.rejects(()=>stageOwned215(x));rejections++;}
 const before=await readFile(dir+'/builder.before.mjs','utf8'),next=updateBuilder(before,'f'.repeat(64));await writeFile(dir+'/builder.route-check.mjs',next);const syntax=spawnSync(process.execPath,['--check',dir+'/builder.route-check.mjs'],{encoding:'utf8',windowsHide:true});assert.equal(syntax.status,0,syntax.stderr);
 // The existing ordinary page gate still refuses p217; this new branch never changes it.
 const config=JSON.parse(await readFile(pre.scope.config.path,'utf8')),{verifyAuditForCandidate}=await import('file:///'+config.runtime.replaceAll('\\','/')+'/textbook-audit.mjs');await assert.rejects(()=>verifyAuditForCandidate(root,config.p217.candidate.path));
 await writeFile(dir+'/route-verification.json',JSON.stringify({positiveScopeAssembly:true,sameCorpusId:receipt.corpusId,scopeBindingRejections:rejections,upstreamScopeRegressionCases:5,ordinaryFullPage217GateStillRejects:true,builderSyntaxPassed:true,fullPage217Passed:false,modelCalls:0},null,2)+'\n');console.log('bounded route and ordinary full-page gate verified');
}finally{assert.equal(JSON.parse(await readFile(lock,'utf8')).pid,process.pid);await unlink(lock);}
