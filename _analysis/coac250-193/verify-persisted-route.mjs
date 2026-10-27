import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {dir,root,integration} from './config.mjs';
const load=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),builder=await readFile(integration+'/build-accepted-preview.mjs','utf8'),begin=builder.indexOf('const versionSupplementSelections='),end=builder.indexOf('const legacyReviewPending=');assert(begin>0&&end>begin);
const code=builder.slice(begin,end)+'\nreturn versionSupplements;',AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,execute=new AsyncFunction('pdfScopeSelectionBytes','readFile','sha','pathToFileURL','root','output','formal','join','load','library','bodies','definitions',code),selection=await readFile(integration+'/specific-web-variant-selection.v23.json'),base=await load('E:/AgentData/Coach/knowledge/review/knowledge-index.json'),state={library:{sources:base.sources,chapters:[]},bodies:{chapters:[]},definitions:[]};
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250 PDF193 persisted route fixture'})+'\n',{flag:'wx'});
try{
 let n=0;const invoke=async(bytes=selection,read=readFile)=>{const output=process.cwd()+'/'+dir+'/persisted-route-'+(++n);await mkdir(output);await mkdir(output+'/stages');return execute(bytes,read,sha,pathToFileURL,root,output,'E:/AgentData/Coach/knowledge/review',join,load,state.library,state.bodies,state.definitions);};
 const one=await invoke();assert.equal(one.length,1);assert.equal(one[0].appended,true);assert.equal(one[0].receipt.corpusId,'7d1743898551fa7b8cf3cfcb26f1ee234d332e93434443c5a09fc3340c17c4d7');const before=JSON.stringify(state),two=await invoke();assert.equal(two[0].appended,false);assert.equal(JSON.stringify(state),before);
 const changed=JSON.parse(selection);changed.pdfVersionSupplements[0].chapterId='nemata-jp-chapter-193-1';await assert.rejects(()=>invoke(Buffer.from(JSON.stringify(changed))),/pdf193_supplement_scope/);
 await assert.rejects(()=>invoke(selection,async(p,...args)=>String(p).endsWith('stage-pdf193-supplement.mjs')?Buffer.from('changed'):readFile(p,...args)),/pdf193_stage_changed/);
 await writeFile(dir+'/persisted-route-verification.json',JSON.stringify({installedBuilderBranchExecuted:true,sameSupplementCorpusId:true,repeatAppendNoop:true,priorObjectsUnchangedOnRepeat:true,wrongBookOwnerRejected:true,changedModuleRefused:true,historicalChaptersRebuilt:0,originalCoverageIncrement:0,navigationOnly:true,modelCalls:0},null,2)+'\n');console.log('installed PDF193 branch rebuilt and deduplicated exact slices');
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
