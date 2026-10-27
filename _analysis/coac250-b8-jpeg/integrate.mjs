// One bounded incremental assembly. Reuse every prior staged body/asset, stage only b8's two chapters,
// run existing compiler/review/MCP/Arena/dedup gates, then publish the preview pointer. No model calls.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,cp,rename,unlink,access} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const root='E:/AgentData/Coach/knowledge/processing',repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach',dir='_analysis/coac250-b8-jpeg',integration=root+'/integration';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pre=await load(dir+'/preconsume.json');assert.equal(pre.allPassed,true);
const lock=integration+'/accepted-consumer.lock';
await writeFile(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),issue:'COAC-250',scope:'b8 two-chapter foreground incremental assembly'})+'\n',{flag:'wx'});
const atomic=async(p,value)=>{const tmp=p+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(value,null,2)+'\n');await rename(tmp,p);};
const run=async(script,args,label)=>{
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));});
 await writeFile(dir+'/'+label+'.log',result.stdout+result.stderr);assert.equal(result.code,0,label+': '+result.stderr.slice(-1000));console.log('validated',label);
};
try{
 for(const l of ['selection-maintainer.lock.json']){let present=true;try{await access(integration+'/'+l);}catch(e){if(e.code!=='ENOENT')throw e;present=false;}assert.equal(present,false,l);}
 assert.equal(sha(await readFile(integration+'/accepted-preview-current.json')),pre.prior.sha256,'pointer remains at preflight');
 for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 const prior=await load(integration+'/accepted-preview-current.json'),old=prior.output;
 const formalPath=prior.formalCorpusPath,formalSha=sha(await readFile(formalPath));assert.equal(formalSha,prior.formalCorpusFileSha256);
 const output=integration+'/accepted-content-preview-'+new Date().toISOString().replace(/[:.]/g,'-');
 await mkdir(output);await mkdir(output+'/stages');await cp(old+'/assets',output+'/assets',{recursive:true});
 const library=await load(old+'/knowledge-index.json'),bodies=await load(old+'/textbook-bodies.json'),definitions=await load(old+'/textbook-unit-map.json'),oldCorpus=await load(old+'/textbook-corpus.json');
 const {stageWebTextbook}=await import(pathToFileURL(repo+'/scripts/textbook-processing/stage-web-textbook.mjs'));
 const {verifyAuditForWebCandidate}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-web.mjs'));
 const {compileTextbookCorpus}=await import(pathToFileURL(repo+'/scripts/scene-study/compile-textbook-corpus.mjs'));
 const {buildTextbookReview}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-review.mjs'));
 const selections=[...prior.selectedWeb],notes=[];
 for(const item of pre.items){
  const candidatePath=join(root,item.candidatePath),destination=output+'/stages/79-bilibili-cn-'+item.articleId;
  const audit=await verifyAuditForWebCandidate(root,candidatePath);
  const receipt=await stageWebTextbook({processingRoot:root,candidatePath,destination,verify:verifyAuditForWebCandidate});
  const nl=await load(destination+'/knowledge-index.json'),nb=await load(destination+'/textbook-bodies.json'),nd=await load(destination+'/textbook-unit-map.json'),nc=await load(destination+'/textbook-corpus.json');
  for(const ch of nl.chapters)assert.equal(library.chapters.some(c=>c.id===ch.id),false);
  library.sources.push(...nl.sources);library.chapters.push(...nl.chapters);bodies.chapters.push(...nb.chapters);definitions.push(...nd);
  for(const image of nc.images)await copyFile(join(destination,image.path),join(output,image.path));
  if(receipt.imageDerivations?.length)await cp(destination+'/source-assets',output+'/source-assets',{recursive:true});
  selections.push({candidatePath,candidateSha256:item.candidateSha256,stageReceiptPath:destination+'/web-stage-receipt.json',auditStatus:audit.status,auditPath:audit.auditPath,chapterIds:nl.chapters.map(c=>c.id),transportRecovery:audit.transportRecovery,ingestProvenancePath:output+'/b8-source-notes.json'});
  notes.push({imageDerivations:receipt.imageDerivations??[],...item.retainedNote,parentPath:item.parentPath,candidatePath:item.candidatePath,auditPath:item.auditPath,auditSha256:item.auditSha256,sourcePath:item.sourcePath,sourceSha256:item.sourceSha256});
  console.log('staged',item.chapterId,receipt.blocks,receipt.figures);
 }
 await atomic(output+'/b8-source-notes.json',{schema:'coac250-b8-source-notes/1',note:'Provenance from immutable reviewed parents. Not a new candidate or a new review.',notes,modelCalls:0});
 for(const [name,value] of [['knowledge-index.json',library],['textbook-bodies.json',bodies],['textbook-unit-map.json',definitions]])await atomic(output+'/'+name,value);
 const build=await compileTextbookCorpus(output,definitions);await buildTextbookReview(output,library);
 const corpus=await load(output+'/textbook-corpus.json');
 const retained=oldCorpus.units.map(u=>{const next=corpus.units.find(n=>n.unitId===u.unitId);assert.deepEqual(next,u);return {unitId:u.unitId,sha256:sha(JSON.stringify(u))};});
 assert.equal(corpus.units.length,oldCorpus.units.length+2);assert.equal(library.chapters.length,prior.chapters+2);assert.equal(corpus.images.length,oldCorpus.images.length+12);
 for(const unit of corpus.units)for(const id of [unit.previousUnitId,unit.nextUnitId].filter(Boolean))assert.equal(corpus.units.find(u=>u.unitId===id)?.chapterId,unit.chapterId);
 for(const image of corpus.images){const b=await readFile(join(output,image.path));assert.equal(sha(b),image.sha256);}
 const keys=new Set();for(const s of selections){const c=await load(s.candidatePath),key=c.source.sourceId+':'+c.source.articleId;assert.equal(keys.has(key),false,'canonical duplicate '+key);keys.add(key);}
 const targetArticles=new Set(pre.items.map(i=>i.articleId));
 const pending=prior.pendingWeb.filter(p=>!pre.items.some(i=>p.path.replaceAll('\\','/').endsWith('/'+i.articleId+'.display.json')));
 assert.equal(prior.pendingWeb.length-pending.length,2);
 const dedupe=structuredClone(prior.webCandidateDedupe);
 for(const i of pre.items){dedupe.articles=dedupe.articles.filter(a=>!(a.sourceId==='79-bilibili-cn'&&a.articleId===i.articleId));dedupe.articles.push({sourceId:'79-bilibili-cn',articleId:i.articleId,versions:i.versions,effective:{file:i.candidatePath.split('/').at(-1),sha256:i.candidateSha256,auditRecordedAt:i.versions.find(v=>v.sha256===i.candidateSha256).recordedAt,status:i.auditStatus}});}
 const receipt={...prior,...build,output,createdAt:new Date().toISOString(),selectedWeb:selections,pendingWeb:pending,webCandidateDedupe:dedupe,reviewLevels:{...prior.reviewLevels,currentIndependentGateChapters:prior.reviewLevels.currentIndependentGateChapters+2},incrementalAssembly:{from:old,priorPointerSha256:pre.prior.sha256,retainedUnits:retained.length,recompiledPriorStages:0,addedChapters:pre.items.map(i=>i.chapterId),handoff:pre.handoff,provenanceSidecar:{path:output+'/b8-source-notes.json',sha256:sha(await readFile(output+'/b8-source-notes.json'))}},modelCalls:0,productionCalls:0,activeLibraryChanged:false};
 const htmlPath=output+'/knowledge.html',html=await readFile(htmlPath,'utf8');await writeFile(htmlPath,html.replace('<main>','<main><p role="note"><strong>已完成内容预览 · 阶段性</strong>：两套教材仍在加工，本页未替换正式知识库，自动校对不等于用户审核。</p>'));
 await atomic(output+'/accepted-preview-receipt.json',receipt);
 await run(repo+'/scripts/scene-study/verify-textbook-mcp.mjs',[output],'mcp');
 await run(integration+'/verify-accepted-preview-arena.mjs',[output],'arena');
 await run(integration+'/verify-preview-source-dedup.mjs',[output],'source-dedup');
 await atomic(dir+'/assembly.json',{...build,output,prior:pre.prior,retainedUnits:retained.length,unchangedUnitFingerprints:retained,canonicalArticles:keys.size,allImagesVerified:corpus.images.length,modelCalls:0});
 // Publication is last: every protected input and pointer is rechecked after validations.
 for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 assert.equal(sha(await readFile(formalPath)),formalSha);assert.equal(sha(await readFile(integration+'/accepted-preview-current.json')),pre.prior.sha256);
 const v12Path=integration+'/specific-web-variant-selection.v12.json',v12Bytes=await readFile(v12Path),v12=JSON.parse(v12Bytes);
 assert.equal(sha(v12Bytes),'943b47ee06a8e61cf219995ca860cc2bc3e681ea020d30c4f80bbabc119ea92c');
 const jobs=pre.items.map(i=>({sourceId:'79-bilibili-cn',articleId:i.articleId,candidatePath:join(root,i.candidatePath),candidateSha256:i.candidateSha256,sourceSha256:i.sourceSha256,selectionReason:'COAC-249 b8 first independent audit recovered from the same completed raw call; zero re-audit. '+i.retainedNote.decision,provenanceSidecarPath:output+'/b8-source-notes.json'}));
 for(const job of jobs)assert.equal(v12.jobs.some(j=>j.sourceId===job.sourceId&&j.articleId===job.articleId),false);
 const v13={...v12,recordedAt:new Date().toISOString(),previousSelection:{path:v12Path,sha256:sha(v12Bytes)},jobs:[...v12.jobs,...jobs]};
 await atomic(integration+'/specific-web-variant-selection.v13.json',v13);await atomic(dir+'/selection-v13.json',v13);
 const v13Sha=sha(await readFile(integration+'/specific-web-variant-selection.v13.json'));
 const builderPath=integration+'/build-accepted-preview.mjs',builder=await readFile(builderPath,'utf8');
 assert.equal(builder.split('specific-web-variant-selection.v12.json').length,2);assert.equal(builder.split(sha(v12Bytes)).length,2);
 await writeFile(dir+'/build-accepted-preview.before.mjs',builder);await writeFile(integration+'/build-accepted-preview.before-v13-20261027.mjs',builder,{flag:'wx'});
 const nextBuilder=builder.replace('specific-web-variant-selection.v12.json','specific-web-variant-selection.v13.json').replace(sha(v12Bytes),v13Sha);
 await writeFile(builderPath+'.tmp-b8',nextBuilder);await rename(builderPath+'.tmp-b8',builderPath);await writeFile(dir+'/build-accepted-preview.after.mjs',nextBuilder);
 await atomic(dir+'/publication-journal.json',{phase:'validated-before-pointer',output,priorPointerSha256:pre.prior.sha256,v13Sha,builderSha256:sha(nextBuilder),formalSha});
 await atomic(integration+'/accepted-preview-current.json',receipt);
 await atomic(integration+'/current-web-candidate-selection.json',{schema:'coach-textbook-web-candidate-selection/1',recordedAt:new Date().toISOString(),selectionScope:'independently verified and staged accepted subset; not full textbook publication',previewReceiptPath:output+'/accepted-preview-receipt.json',previewReceiptSha256:sha(await readFile(output+'/accepted-preview-receipt.json')),corpusId:build.corpusId,candidates:selections,pending,modelCalls:0});
 await atomic(dir+'/publication-journal.json',{phase:'published',output,pointerSha256:sha(await readFile(integration+'/accepted-preview-current.json')),v13Sha,formalSha});
 console.log('PUBLISHED',JSON.stringify({...build,output,pendingWeb:pending.length,v13Sha}));
}catch(e){await atomic(dir+'/assembly-failure.json',{message:e.message,stack:e.stack,recordedAt:new Date().toISOString(),modelCalls:0});throw e;}
finally{const owner=await load(lock);assert.equal(owner.pid,process.pid);await unlink(lock);}
