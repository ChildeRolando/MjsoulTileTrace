#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname,resolve,relative,isAbsolute,join} from 'node:path';
import {verifyAuditForCandidate} from './textbook-audit.mjs';
import {invokeTextbookCodex} from './textbook-production-cli.mjs';

const processing='E:/AgentData/Coach/knowledge/processing',webRoot=join(processing,'web-sources/v1');
const argv=process.argv.slice(2),option=(key,fallback=null)=>{const i=argv.indexOf(key);return i<0?fallback:argv[i+1];};
const sha=b=>createHash('sha256').update(b).digest('hex');
const tileLabel=e=>(e.code==='back'?'牌背（未知牌面）':e.red?e.code.replace(/^5/,'0'):e.code)+(e.orientation==='upright'?'':e.orientation==='sideways'?'（横置）':e.orientation==='sideways-left'?'（横向左）':'（横向右）');
const runRoot=join(processing,'web-production/v1'),runnerBytes=await readFile(new URL(import.meta.url)),runnerSha256=sha(runnerBytes);
if(await readFile(join(runRoot,'STOP')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('web_dispatch_stopped');
function dataPath(value){const p=resolve(processing,value),r=relative(processing,p);if(!r||isAbsolute(r)||r==='..'||r.startsWith('../')||r.startsWith('..\\'))throw Error('web_path_outside_processing');return p;}
const sourcePath=dataPath(option('--source')),sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes);
if(source.schema!=='coach-textbook-web-article-source/1'||!['zh-CN','ja'].includes(source.language))throw Error('unsupported_web_source');
if(source.status!=='captured-not-translated-or-audited'||source.assets.some(a=>a.status!=='downloaded'))throw Error('web_source_assets_not_complete');
for(const binding of [source.html,source.main,...source.assets]){if(sha(await readFile(join(webRoot,binding.path)))!==binding.sha256)throw Error('web_source_dependency_changed');}
const variant=option('--variant','');if(variant&&!/^[a-zA-Z0-9_-]+$/.test(variant))throw Error('invalid_web_variant');
const revisionFrom=option('--revision-from'),revisionNotes=option('--revision-notes');let revision=null,parentCandidate=null;
if(Boolean(revisionFrom)!==Boolean(revisionNotes))throw Error('web_revision_requires_parent_and_notes');
if(revisionFrom){
 if(!variant||source.language!=='zh-CN')throw Error('web_figure_revision_requires_new_variant_and_verbatim_source');
 const path=dataPath(revisionFrom),notesPath=dataPath(revisionNotes),bytes=await readFile(path),notesBytes=await readFile(notesPath),parent=JSON.parse(bytes),notes=JSON.parse(notesBytes),copy={...parent};delete copy.candidateSha256;
 if(parent.schema!=='coach-textbook-web-article-draft/1'||sha(JSON.stringify(copy))!==parent.candidateSha256||parent.source.sourceSha256!==sha(sourceBytes)||parent.source.sourceId!==source.sourceId||parent.source.articleId!==source.articleId||parent.body.mode!=='verbatim'||notes.schema!=='coach-textbook-web-article-audit/1'||notes.status!=='needs-repair'||notes.production.sha256!==sha(bytes)||notes.source.sourceSha256!==sha(sourceBytes))throw Error('web_revision_parent_or_notes_changed');
 const issues=notes.modelReview.issues.filter(x=>x.severity!=='source-note'),figureIds=[...new Set(issues.map(x=>x.targetId))];
 if(!figureIds.length||figureIds.some(id=>!parent.figures.some(f=>f.figureId===id))||parent.figures.some(f=>!figureIds.includes(f.figureId)&&!notes.modelReview.figureChecks.some(c=>c.id===f.figureId&&c.verdict==='faithful')))throw Error('web_revision_is_not_isolated_figure_repair');
 revision={parentPath:relative(processing,path).replaceAll('\\','/'),parentSha256:sha(bytes),notesPath:relative(processing,notesPath).replaceAll('\\','/'),notesSha256:sha(notesBytes),figureIds};parentCandidate=parent;
}
const output=join(runRoot,'candidates',source.sourceId,source.articleId+(variant?'.'+variant:'')+'.json');
let existingBytes=null;try{existingBytes=await readFile(output);}catch(e){if(e.code!=='ENOENT')throw e;}
if(existingBytes){
 const existing=JSON.parse(existingBytes),content={...existing};delete content.candidateSha256;
 if(sha(JSON.stringify(content))!==existing.candidateSha256||existing.source.sourceSha256!==sha(sourceBytes)||existing.source.sourcePath!==relative(processing,sourcePath).replaceAll('\\','/'))throw Error('existing_web_candidate_binding_changed');
 for(const b of [existing.provenance.reuseMap,existing.provenance.dictionary,existing.provenance.verifiedAssetDictionary].filter(Boolean))if(sha(await readFile(dataPath(b.path)))!==b.sha256)throw Error('existing_web_candidate_dependency_changed');
 for(const a of existing.provenance.attempts??[])if(sha(await readFile(join(runRoot,a.rawArtifactPath)))!==a.rawArtifactSha256)throw Error('existing_web_candidate_raw_changed');
 if(JSON.stringify(existing.provenance.revision??null)!==JSON.stringify(revision))throw Error('existing_web_revision_binding_changed');
 for(const f of existing.figures){if(f.provenance.method==='independently-passed-pdf-transcription-exact-original-image-reuse'){const b=await readFile(dataPath(f.provenance.candidatePath));if(sha(b)!==f.provenance.candidateSha256)throw Error('existing_web_parent_changed');await verifyAuditForCandidate(processing,dataPath(f.provenance.candidatePath));}}
 console.log(JSON.stringify({state:'resumed-existing',candidatePath:output,modelCalls:0}));process.exit(0);
}
const japanese=source.language==='ja';
let reusePath=null,reuseBytes=null,reuse=null,dictionaryPath=null,dictionaryBytes=null,dictionary=null;
if(japanese){dictionaryPath=dataPath(option('--dictionary'));dictionaryBytes=await readFile(dictionaryPath);dictionary=JSON.parse(dictionaryBytes);if(!['coach-root-web-asset-inspection/1','coach-textbook-verified-tile-dictionary/1'].includes(dictionary.schema))throw Error('unsupported_verified_dictionary');}
else{reusePath=dataPath(option('--reuse'));reuseBytes=await readFile(reusePath);reuse=JSON.parse(reuseBytes);if(reuse.schema!=='coach-textbook-exact-web-reuse/1'||reuse.sourceFileSha256!==sha(sourceBytes))throw Error('web_reuse_source_binding_mismatch');
 const frozen=join(runRoot,'reuse-maps',sha(reuseBytes)+'.json');await mkdir(dirname(frozen),{recursive:true});try{await writeFile(frozen,reuseBytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||sha(await readFile(frozen))!==sha(reuseBytes))throw e;}reusePath=frozen;}
const assets=new Map(source.assets.map(a=>[a.assetId,a])),figures=[],flow=[],pendingFigures=[];
const parentCache=new Map();
async function parentFor(match){
 const path=dataPath(match.candidatePath);if(parentCache.has(path))return parentCache.get(path);
 const bytes=await readFile(path);if(sha(bytes)!==match.candidateSha256)throw Error('web_reuse_parent_candidate_changed');
 const receipt=await verifyAuditForCandidate(processing,path);const parent=JSON.parse(bytes);
 const result={parent,receipt};parentCache.set(path,result);return result;
}
for(const block of source.blocks){
 if(block.type==='text'){
  flow.push({type:'text',sourceBlockIds:[block.id],sourceText:block.text,text:block.text,paragraphId:block.paragraphId,sourceSegments:block.segments,tableContext:block.tableContext});continue;
 }
 if(block.type!=='image-run')throw Error('unsupported_web_source_block_type');
 if(japanese){
  const bindings=block.images.map(image=>{const a=assets.get(image.assetId),entry=dictionary.acceptedAssets.find(e=>e.sha256===a.sha256&&e.url===a.url);return{image,asset:a,entry};});
  const figureId=block.id+':figure';
  if(bindings.some(({entry})=>!entry||entry.code==='unknown'||entry.orientation==='unknown')){
   const figure={figureId,sourceBlockIds:[block.id],sourceOccurrenceIds:block.images.map(i=>i.occurrenceId),sourceAssetBindings:bindings.map(({asset:a})=>({assetId:a.assetId,path:'web-sources/v1/'+a.path,sha256:a.sha256,url:a.url})),kind:'mahjong-example',transcription:'',unknowns:[],caption:'',sourceNotes:[],provenance:{method:'model-transcription'}};
   figures.push(figure);pendingFigures.push(figure);flow.push({type:'figure',sourceBlockIds:[block.id],figureId,paragraphId:block.paragraphId,tableContext:block.tableContext});continue;
  }
  const method=dictionary.schema==='coach-root-web-asset-inspection/1'?'root-inspected-exact-tile-assets':'independently-verified-exact-tile-assets';
  if(method==='root-inspected-exact-tile-assets'&&bindings.some(({entry})=>entry.orientation!=='upright'||entry.red!==false))throw Error('root_dictionary_variant_scope_changed');
  figures.push({figureId,sourceBlockIds:[block.id],sourceOccurrenceIds:block.images.map(i=>i.occurrenceId),sourceAssetBindings:bindings.map(({asset:a})=>({assetId:a.assetId,path:'web-sources/v1/'+a.path,sha256:a.sha256,url:a.url})),kind:'mahjong-example',transcription:bindings.map(x=>tileLabel(x.entry)).join(' '),unknowns:[],caption:'原文内联牌列',sourceNotes:[],tiles:bindings.map(({image,asset:a,entry})=>({occurrenceId:image.occurrenceId,assetId:a.assetId,assetSha256:a.sha256,code:entry.code,red:entry.red,orientation:entry.orientation})),provenance:{method,dictionaryPath:relative(processing,dictionaryPath).replaceAll('\\','/'),dictionarySha256:sha(dictionaryBytes)}});
  flow.push({type:'figure',sourceBlockIds:[block.id],figureId,paragraphId:block.paragraphId,tableContext:block.tableContext});continue;
 }
 const image=block.images[0],asset=assets.get(image.assetId),proof=block.images.length===1?reuse.images.find(i=>i.assetId===asset.assetId):null;
 if(reuse.formalReuse?.images?.some(p=>block.images.some(i=>i.assetId===p.assetId)&&p.reusePermitted))throw Error('formal_reuse_requires_bound_formal_adapter_no_new_paid_recognition');
 if(!proof?.reusePermitted||proof.assetSha256!==asset.sha256||proof.exactMatches.length!==1){
  const figureId=block.id+':figure',figure={figureId,sourceBlockIds:[block.id],sourceOccurrenceIds:block.images.map(i=>i.occurrenceId),sourceAssetBindings:block.images.map(i=>{const a=assets.get(i.assetId);return{assetId:a.assetId,path:'web-sources/v1/'+a.path,sha256:a.sha256,url:a.url};}),kind:'mahjong-example',transcription:'',unknowns:[],caption:'',sourceNotes:[],provenance:{method:'model-transcription'}};
  figures.push(figure);pendingFigures.push(figure);flow.push({type:'figure',sourceBlockIds:[block.id],figureId,paragraphId:block.paragraphId,tableContext:block.tableContext});continue;
 }
 const match=proof.exactMatches[0];
 if(JSON.stringify(match.pixelSignature)!==JSON.stringify(proof.pixelSignature)||match.figures.length!==1||match.figures[0].sourceImageBlockIds.length!==1||match.figures[0].sourceImageBlockIds[0]!==match.sourceBlockId)throw Error('web_reuse_is_not_one_complete_identical_figure');
 const {parent,receipt}=await parentFor(match),original=parent.figures.find(f=>f.figureId===match.figures[0].figureId);
 if(!original||original.transcription!==match.figures[0].transcription||original.croppedImageSha256!==match.figures[0].croppedImageSha256)throw Error('web_reuse_figure_changed');
 const figureId=block.id+':figure';
 figures.push({figureId,sourceBlockIds:[block.id],sourceOccurrenceIds:block.images.map(i=>i.occurrenceId),sourceAssetBindings:[{assetId:asset.assetId,path:'web-sources/v1/'+asset.path,sha256:asset.sha256,url:asset.url}],kind:original.kind,transcription:original.transcription,unknowns:original.unknowns,caption:original.caption,sourceNotes:[],provenance:{method:'independently-passed-pdf-transcription-exact-original-image-reuse',candidatePath:match.candidatePath,candidateSha256:match.candidateSha256,figureId:original.figureId,auditPath:receipt.auditPath??match.auditPath,sourceImageBlockId:match.sourceBlockId,sourceImagePath:relative(processing,match.path).replaceAll('\\','/'),pixelSignature:proof.pixelSignature}});
 flow.push({type:'figure',sourceBlockIds:[block.id],figureId,paragraphId:block.paragraphId,tableContext:block.tableContext});
}
if(revision){
 if(JSON.stringify(flow)!==JSON.stringify(parentCandidate.body.blocks))throw Error('web_revision_body_must_remain_identical');
 for(let i=0;i<figures.length;i++){const old=parentCandidate.figures.find(f=>f.figureId===figures[i].figureId);if(!old||JSON.stringify(old.sourceAssetBindings)!==JSON.stringify(figures[i].sourceAssetBindings)||JSON.stringify(old.sourceOccurrenceIds)!==JSON.stringify(figures[i].sourceOccurrenceIds))throw Error('web_revision_figure_source_changed');const copy=structuredClone(old);delete copy.presentationAsset;figures[i]=copy;}
 pendingFigures.splice(0,pendingFigures.length,...figures.filter(f=>revision.figureIds.includes(f.figureId)));
}
if(argv.includes('--reuse-only')&&pendingFigures.length)throw Error('reuse_only_missing_exact_figures');
if(argv.includes('--preflight-only')){console.log(JSON.stringify({preflightPassed:true,sourceId:source.sourceId,articleId:source.articleId,sourceBlocks:source.blocks.length,textBlocks:flow.filter(b=>b.type==='text').length,figureRuns:figures.length,pendingFigureRuns:pendingFigures.length,imageOccurrences:figures.flatMap(f=>f.sourceOccurrenceIds).length,modelCalls:0}));process.exit(0);}
const attempts=[];let usage=null;
if(japanese||pendingFigures.length){
 const textBlocks=japanese?flow.filter(b=>b.type==='text'):[],ids=textBlocks.map(b=>b.sourceBlockIds[0]),figureIds=pendingFigures.map(f=>f.sourceBlockIds[0]);
 const callId=randomUUID();let visualInputs=[];
 if(pendingFigures.length){
  const requestPath=join(runRoot,'visual-requests',callId+'.json');await mkdir(dirname(requestPath),{recursive:true});await writeFile(requestPath,JSON.stringify({sourceAssetBindings:pendingFigures.flatMap(f=>f.sourceAssetBindings)})+'\n',{flag:'wx'});
  const rendererPath=new URL('./textbook-production-web-visual.py',import.meta.url),rendererBytes=await readFile(rendererPath),rendererArchive=join(runRoot,'runners',sha(rendererBytes)+'.visual.py');await mkdir(dirname(rendererArchive),{recursive:true});await writeFile(rendererArchive,rendererBytes);
  const rendered=spawnSync('python',[rendererPath.pathname.replace(/^\/([A-Za-z]:)/,'$1'),requestPath],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(rendered.status!==0)throw Error('web_visual_input_failed:'+rendered.stderr);visualInputs=JSON.parse(rendered.stdout).visualInputs;
  for(const v of visualInputs)if(sha(await readFile(dataPath(v.path)))!==v.sha256)throw Error('web_visual_input_changed');
 }
 const textItem={type:'object',additionalProperties:false,properties:{sourceBlockId:{type:'string',...(ids.length?{enum:ids}:{})},text:{type:'string',minLength:1}},required:['sourceBlockId','text']};
 const figureItem={type:'object',additionalProperties:false,properties:{sourceBlockId:{type:'string',...(figureIds.length?{enum:figureIds}:{})},kind:{type:'string',enum:['mahjong-example','chart','table','diagram','illustration','other']},transcription:{type:'string',minLength:1},unknowns:{type:'array',items:{type:'string'}},caption:{type:'string'},sourceNotes:{type:'array',items:{type:'string'}}},required:['sourceBlockId','kind','transcription','unknowns','caption','sourceNotes']};
 const schema={type:'object',additionalProperties:false,properties:{translations:{type:'array',minItems:ids.length,maxItems:ids.length,items:textItem},figures:{type:'array',minItems:figureIds.length,maxItems:figureIds.length,items:figureItem}},required:['translations','figures']};
 const context=source.blocks.map(b=>b.type==='text'?{id:b.id,paragraphId:b.paragraphId,tag:b.tag,text:b.text,segments:b.segments,tableContext:b.tableContext}:{id:b.id,paragraphId:b.paragraphId,inlineTiles:figures.find(f=>f.sourceBlockIds[0]===b.id).tiles?.map(t=>({code:t.code,red:t.red,orientation:t.orientation})),alreadyVerifiedTranscription:pendingFigures.some(f=>f.sourceBlockIds[0]===b.id)?undefined:figures.find(f=>f.sourceBlockIds[0]===b.id).transcription});
 const prompt=[japanese?'Translate this complete Japanese textbook article into faithful Simplified Chinese. Preserve every argument, condition, exception, numerical expression, author modality and uncertainty. Do not summarize or strengthen claims.':'Preserve the existing Chinese article verbatim. Return translations:[] and transcribe only the explicitly requested original figure runs using all attached source images in their original order. Do not rewrite Chinese prose.',
 japanese?'Return exactly one translation for every requested text block ID, once each. The complete DOM sequence below includes exact inline tile runs already verified from original image bytes; keep those fixed. Some text blocks are phrase fragments on either side of an inline tile run: translate only that block contribution and do not repeat or complete neighboring blocks. paragraphId binds the original paragraph context. Preserve semantic emphasis using Markdown emphasis matching source marked spans; preserve all table-cell meanings and source links. Do not translate the tile codes or invent additional tile ranks.':'Chinese text blocks and already verified figures supply context; do not return translations or transcriptions for them. Only the figureIds in targets require output.',
 'For every requested figure ID return kind, complete transcription, unknowns, caption and sourceNotes. Mahjong codes use 1-9m/p/s, 1-7z (east/south/west/north/white/green/red); preserve tile order, count, red tiles, sideways tiles, labels, draw/discard arrows, and every chart/table datum. Distinguish 2m/3m,6p/8p,1s. If teaching information cannot be read, name the exact unknown and do not guess. Harmless scan/layout traces belong in sourceNotes; never invent a punctuation mark. Reused verified figures are context only and must not be returned in figures.',
 'Original and nearest-neighbor enlarged views refer to the same original assets, never extra tiles or extra source occurrences. Compare both views carefully; enlargement repeats original RGBA pixels without sharpening, denoising, recoloring or redrawing.',
 revision?'This is an isolated figure repair. The prior independent review is only a locator and may itself contain errors. Independently reread the original and enlarged images; do not copy suggested labels as ground truth. All unmodified figures and Chinese body are preserved outside this request. Prior issues: '+JSON.stringify(JSON.parse(await readFile(dataPath(revision.notesPath))).modelReview.issues):null,
 'Lexical glossary only: シャンテン=向听, フリテン=振听, 面子=面子, ターツ=搭子, トイツ=对子, 一色手=染手, ベタオリ=完全弃和, 押し引き=攻守判断. Do not alter the strategy to fit a glossary.',JSON.stringify({title:source.title,blocks:context,targets:{textIds:ids,figureIds},figureAssets:pendingFigures.map(f=>({sourceBlockId:f.sourceBlockIds[0],assetIds:f.sourceAssetBindings.map(a=>a.assetId)})),attachments:visualInputs.map((a,i)=>({attachment:i+1,assetId:a.assetId,view:a.role,scale:a.scale}))})].filter(Boolean).join('\n\n');
 if(await readFile(join(runRoot,'STOP')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('web_dispatch_stopped_before_model');
 const cliBytes=await readFile(new URL('./textbook-production-cli.mjs',import.meta.url)),cliSha256=sha(cliBytes),cliSnapshot=join(runRoot,'runners',cliSha256+'.cli.mjs');await mkdir(dirname(cliSnapshot),{recursive:true});await writeFile(cliSnapshot,cliBytes);
 const call=await invokeTextbookCodex({prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:visualInputs.map(a=>dataPath(a.path)),timeoutMs:240000});
 const rawPath=join(processing,'web-production/v1/raw-calls',callId+'.json');await mkdir(dirname(rawPath),{recursive:true});
 await writeFile(rawPath,JSON.stringify({callId,rawLastMessage:call.rawLastMessage,rawStdout:call.rawStdout,parsedOutput:call.output,events:call.events,terminalEvents:call.terminalEvents,stderr:call.stderr,usage:call.usage,requestPrompt:call.requestPrompt,requestPromptSha256:call.requestPromptSha256,semanticPrompt:prompt,schema,cliSha256,visualInputs,unexpectedTool:call.unexpectedTool,exitCode:call.exitCode,timedOut:call.timedOut,outputOverflow:call.outputOverflow},null,2)+'\n',{flag:'wx'});
 const record={callId,sourceId:source.sourceId,articleId:source.articleId,sourceSha256:sha(sourceBytes),model:'gpt-6.1-sol',reasoningEffort:'high',startedAt:call.startedAt,durationMs:call.durationMs,usage:call.usage,success:call.success,transportStatus:call.success?'completed':call.timedOut?'timeout':'failed',rawArtifactPath:relative(runRoot,rawPath).replaceAll('\\','/'),rawArtifactSha256:sha(await readFile(rawPath)),outputSha256:call.rawLastMessage===null?null:sha(call.rawLastMessage),schemaSha256:sha(JSON.stringify(schema)),promptSha256:call.requestPromptSha256,semanticPromptSha256:sha(prompt),cliSnapshot:{path:relative(processing,cliSnapshot).replaceAll('\\','/'),sha256:cliSha256},targets:{textIds:ids,figureIds},terminalEvents:call.terminalEvents};
 record.visualInputs=visualInputs;if(revision)record.revision=revision;
 const {appendFile}=await import('node:fs/promises');await appendFile(join(processing,'web-production/v1/calls.jsonl'),JSON.stringify(record)+'\n');attempts.push(record);usage=call.usage;
 if(!call.success)throw Error('web_translation_call_failed_raw_preserved');
 const translated=call.output.translations;if(!Array.isArray(translated)||translated.length!==ids.length||new Set(translated.map(t=>t.sourceBlockId)).size!==ids.length||ids.some(id=>!translated.some(t=>t.sourceBlockId===id)))throw Error('web_translation_block_coverage_failed_raw_preserved');
 const byId=new Map(translated.map(t=>[t.sourceBlockId,t.text]));for(const b of textBlocks)b.text=byId.get(b.sourceBlockIds[0]);
 const outputs=call.output.figures;if(!Array.isArray(outputs)||outputs.length!==figureIds.length||new Set(outputs.map(f=>f.sourceBlockId)).size!==figureIds.length||figureIds.some(id=>!outputs.some(f=>f.sourceBlockId===id)))throw Error('web_figure_block_coverage_failed_raw_preserved');
 for(const figure of pendingFigures){const item=outputs.find(f=>f.sourceBlockId===figure.sourceBlockIds[0]);for(const k of ['kind','transcription','unknowns','caption','sourceNotes'])figure[k]=item[k];figure.provenance={method:'model-transcription',callId,outputSourceBlockId:figure.sourceBlockIds[0]};}
}
const candidate={schema:'coach-textbook-web-article-draft/1',status:'draft',productionStatus:'draft-awaiting-independent-web-review',source:{sourceId:source.sourceId,articleId:source.articleId,url:source.url,title:source.title,language:source.language,fetchedAt:source.fetchedAt,sourcePath:relative(processing,sourcePath).replaceAll('\\','/'),sourceSha256:sha(sourceBytes),htmlSha256:source.html.sha256,mainSha256:source.main.sha256},body:{language:'zh-CN',mode:'verbatim',flowOrder:'source-dom-order',blocks:flow},figures,provenance:{sourceVersion:'web-sources/v1',model:null,reasoningEffort:null,artifactRoot:'web-production/v1',attempts:[],usage:null,modelCalls:0,reuseMap:null,runnerSha256:sha(await readFile(new URL(import.meta.url))),extractorSha256:source.extractorSha256,attribution:'Original author, translator and reposter references remain in the bound source HTML; existing Chinese source body is verbatim.'}};
candidate.provenance.runnerSha256=runnerSha256;candidate.body.mode=japanese?'translated':'verbatim';candidate.provenance.model=attempts.length?'gpt-6.1-sol':null;candidate.provenance.reasoningEffort=attempts.length?'high':null;candidate.provenance.attempts=attempts;candidate.provenance.usage=usage;candidate.provenance.modelCalls=attempts.length;
candidate.provenance.reuseMap=reuseBytes?{path:relative(processing,reusePath).replaceAll('\\','/'),sha256:sha(reuseBytes)}:null;
if(revision)candidate.provenance.revision=revision;
if(japanese)candidate.provenance.dictionary={path:relative(processing,dictionaryPath).replaceAll('\\','/'),sha256:sha(dictionaryBytes)};
if(japanese&&option('--verified-assets')){const path=dataPath(option('--verified-assets'));candidate.provenance.verifiedAssetDictionary={path:relative(processing,path).replaceAll('\\','/'),sha256:sha(await readFile(path))};}
if(japanese)candidate.title=flow.find(b=>b.type==='text'&&source.blocks.find(s=>s.id===b.sourceBlockIds[0])?.tag==='h2')?.text??source.title;
candidate.candidateSha256=sha(JSON.stringify(candidate));
await mkdir(dirname(output),{recursive:true});
try{const existing=await readFile(output);if(existing.toString('utf8')!==JSON.stringify(candidate,null,2)+'\n')throw Error('existing_web_candidate_differs_preserve_it_and_use_new_version');}
catch(e){if(e.code!=='ENOENT')throw e;await writeFile(output,JSON.stringify(candidate,null,2)+'\n',{flag:'wx'});}
const runnerArchive=join(processing,'web-production/v1/runners',runnerSha256+'.mjs');await mkdir(dirname(runnerArchive),{recursive:true});await writeFile(runnerArchive,runnerBytes);
console.log(JSON.stringify({sourceId:source.sourceId,articleId:source.articleId,candidatePath:output,textBlocks:flow.filter(b=>b.type==='text').length,figures:figures.length,modelCalls:attempts.length,usage,candidateFileSha256:sha(await readFile(output))}));
