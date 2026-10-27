import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {dir,root,integration,chapter} from './config.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const builder=await readFile(integration+'/build-accepted-preview.mjs','utf8'),begin=builder.indexOf('const pdfScopeSelectionBytes='),end=builder.indexOf('const legacyReviewPending=');assert(begin>0&&end>begin);
// Execute the installed builder's real PDF branch. Historical ready chapters are omitted only from this fixture.
const code=builder.slice(begin,end)+'\nreturn {pdfStages,pendingPdf};',AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,execute=new AsyncFunction('readFile','load','sha','join','root','formal','output','pathToFileURL','stagePdfChapters','library','bodies','definitions','copyFile',code);
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250 verify persisted scope215 builder branch'})+'\n',{flag:'wx'});
try{
 const output=process.cwd()+'/'+dir+'/persisted-route-stage';await mkdir(output);await mkdir(output+'/stages');const ready=await load(integration+'/ready-pdf-gap-chapters.json'),testLoad=async p=>String(p).endsWith('ready-pdf-gap-chapters.json')?{...ready,ready:[]}:load(p),base=await load('E:/AgentData/Coach/knowledge/review/knowledge-index.json');
 const invoke=(read=readFile,lookup=testLoad)=>execute(read,lookup,sha,join,root,'E:/AgentData/Coach/knowledge/review',output,pathToFileURL,()=>{throw Error('ordinary gate must not be used for scoped fixture');},{sources:base.sources,chapters:[]},{chapters:[]},[],()=>{throw Error('scope215 has no images');});
 const result=await invoke();assert.equal(result.pdfStages.length,1);assert.equal(result.pendingPdf.length,0);assert.equal(result.pdfStages[0].receipt.chapterId,chapter);assert.equal(result.pdfStages[0].receipt.fullPage217Passed,false);assert.equal(result.pdfStages[0].receipt.corpusId,'82178dd9552e5f2a3f91e7441b0ef3f364f215437e309304811e221902f7ff04');
 await assert.rejects(()=>invoke(async(p,...args)=>String(p).endsWith('specific-web-variant-selection.v22.json')?Buffer.from('{}'):readFile(p,...args)),/pdf_scope_selection_changed/);
 await assert.rejects(()=>invoke(readFile,async p=>String(p).endsWith('ready-pdf-gap-chapters.json')?{...ready,ready:[{chapterId:chapter}]}:load(p)),/duplicate_pdf_scope_selection/);
 const altered=await invoke(async(p,...args)=>String(p).endsWith('stage-owned-215.mjs')?Buffer.from('changed'):readFile(p,...args));assert.equal(altered.pdfStages.length,0);assert.equal(altered.pendingPdf[0].error,'owned215_module_changed');
 await writeFile(dir+'/persisted-route-verification.json',JSON.stringify({installedBuilderBranchExecuted:true,selectionVersion:22,fullChapterRebuiltWithSameCorpusId:true,historicalReadyChaptersRebuilt:0,selectionHashRejection:true,duplicateReadyScopeRejection:true,changedStageModuleRefused:true,originalPage217Status:'needs-repair',fullPage217Passed:false,modelCalls:0},null,2)+'\n');console.log('installed PDF rebuild branch passed, changed selection/module and duplicate selection refused');
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
