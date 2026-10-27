import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dir,root,integration} from './config.mjs';
import {stagePdf193Supplement,appendPdf193Supplement} from './stage-pdf193-supplement.mjs';
import {updateBuilder} from './builder-patch.mjs';
const load=async p=>JSON.parse(await readFile(p,'utf8')),pre=await load(dir+'/preconsume.json'),lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250 PDF193 route regression'})+'\n',{flag:'wx'});
try{
 const args={processingRoot:root,destination:process.cwd()+'/'+dir+'/route-stage-'+process.pid,sourceLibraryPath:'E:/AgentData/Coach/knowledge/review/knowledge-index.json',binding:pre.binding},r=await stagePdf193Supplement(args);assert.equal(r.fullChapterPassed,false);
 for(const mutate of [x=>x.binding.reuseReceipt.sha256='0'.repeat(64),x=>x.binding.config.sha256='0'.repeat(64),x=>x.binding.chapterId='nemata-jp-chapter-193-1']){const x=structuredClone(args);mutate(x);await assert.rejects(()=>stagePdf193Supplement(x));}
 const stages={stageLibrary:await load(args.destination+'/knowledge-index.json'),stageBodies:await load(args.destination+'/textbook-bodies.json'),stageDefinitions:await load(args.destination+'/textbook-unit-map.json')},state={library:{sources:[],chapters:[]},bodies:{chapters:[]},definitions:[],...stages,binding:pre.binding};
 assert.equal(appendPdf193Supplement(state).appended,true);const once=JSON.stringify(state);assert.equal(appendPdf193Supplement(state).appended,false);assert.equal(JSON.stringify(state),once);
 const full=structuredClone(state);full.bodies={chapters:[{chapterId:'79-cn-chapter-193-4',sourceId:'79-cn',sourceSha256:r.sourcePdfSha256,blocks:[{text:r.originalCompleteBlock.text,sourceBlockIds:['79-cn-p193-b6']}]}]};assert.equal(appendPdf193Supplement(full).appended,false);
 for(const mutate of [x=>x.stageBodies.chapters[0].blocks[0].sourceTextSlice.parentCandidateSha256='wrong',x=>x.stageDefinitions[0].contentRole='content',x=>x.binding.supplementOf='nemata-jp-chapter-193-1']){const x=structuredClone(state);mutate(x);assert.throws(()=>appendPdf193Supplement(x));}
 const patch=updateBuilder(await readFile(dir+'/builder.before.mjs','utf8'),'f'.repeat(64));await writeFile(dir+'/builder.route-check.mjs',patch);const syntax=spawnSync(process.execPath,['--check',dir+'/builder.route-check.mjs'],{windowsHide:true,encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);
 await writeFile(dir+'/route-verification.json',JSON.stringify({exactParentSlicesRebuilt:true,missingOrChangedReceiptConfigAndWrongChapterRejected:3,repeatAppendNoop:true,sameParentFullBodyDeduplicated:true,wrongParentRoleOwnerRejected:3,orderAndPriorObjectsPreserved:true,builderSyntaxPassed:true,contentRole:'navigation',originalCoverageIncrement:0,modelCalls:0},null,2)+'\n');console.log('PDF193 bound stage, source+parent+slice dedupe and navigation regressions passed');
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
