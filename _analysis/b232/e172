#!/usr/bin/env node
// Preserve existing formal transcriptions without claiming a new independent audit.
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{join,resolve,relative,isAbsolute,dirname}from'node:path';

const root='E:/AgentData/Coach/knowledge/processing',webRoot=join(root,'web-sources/v1'),run=join(root,'web-production/v1'),reviewRoot=resolve(root,'../review'),argv=process.argv.slice(2);
const option=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1];},sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),rel=p=>relative(root,p).replaceAll('\\','/');
function contained(base,value){const p=resolve(base,value),r=relative(base,p);if(!r||isAbsolute(r)||r==='..'||r.startsWith('../')||r.startsWith('..\\'))throw Error('formal_reuse_path_outside_authorized_root');return p;}
const bound=p=>contained(root,p),reviewFile=p=>contained(reviewRoot,p);
if(await readFile(join(run,'STOP')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('formal_web_dispatch_stopped');
const variant=option('--variant')??'';if(variant&&!/^[a-zA-Z0-9_-]+$/.test(variant))throw Error('invalid_formal_variant');
const sourcePath=bound(option('--source')),sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes),mapPath=bound(option('--reuse')),mapBytes=await readFile(mapPath),map=JSON.parse(mapBytes);
if(source.schema!=='coach-textbook-web-article-source/1'||source.language!=='zh-CN'||source.status!=='captured-not-translated-or-audited'||map.schema!=='coach-textbook-exact-web-reuse/1'||map.sourceFileSha256!==sha(sourceBytes)||!map.formalReuse)throw Error('formal_reuse_source_or_map_binding');
for(const a of [source.html,source.main,...source.assets])if(!a.path||sha(await readFile(join(webRoot,a.path)))!==a.sha256)throw Error('formal_web_source_dependency_changed');
const formal=map.formalReuse,manifestBytes=await readFile(bound(formal.manifestPath)),manifest=JSON.parse(manifestBytes);
if(sha(manifestBytes)!==formal.manifestSha256||manifest.schema!=='coach-textbook-existing-formal-reuse/1'||manifest.provenanceKind!=='existing-formal-corpus-not-new-page-audit')throw Error('formal_parent_manifest_changed');
const bodyBytes=await readFile(reviewFile(manifest.bodyPath)),corpusBytes=await readFile(reviewFile(manifest.corpusPath)),correctionsBytes=await readFile(reviewFile(manifest.correctionsPath));
if(sha(bodyBytes)!==manifest.bodyFileSha256||sha(corpusBytes)!==manifest.corpusFileSha256||sha(correctionsBytes)!==manifest.correctionsSha256)throw Error('formal_parent_source_changed');
const bodies=JSON.parse(bodyBytes),corpus=JSON.parse(corpusBytes),chapter=manifest.chapters.find(c=>c.chapterId===formal.chapterId),bodyChapter=bodies.chapters.find(c=>c.chapterId===formal.chapterId);
if(!chapter||!bodyChapter||corpus.corpusId!==manifest.corpusId||corpus.bodySha256!==sha(bodyBytes))throw Error('formal_parent_corpus_binding');
async function freeze(bytes,extension){const p=join(run,'formal-parents','objects',sha(bytes)+extension);await mkdir(dirname(p),{recursive:true});try{await writeFile(p,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||sha(await readFile(p))!==sha(bytes))throw e;}return rel(p);}
const originalManifestPath=await freeze(manifestBytes,'.json');
manifest.bodyPath=await freeze(bodyBytes,'.json');manifest.corpusPath=await freeze(corpusBytes,'.json');manifest.correctionsPath=await freeze(correctionsBytes,'.json');
manifest.originalManifest={path:originalManifestPath,sha256:sha(manifestBytes)};
for(const proof of formal.images)for(const match of proof.exactMatches){const image=match.formalImage,b=await readFile(reviewFile(image.path));if(sha(b)!==image.sha256)throw Error('formal_image_changed_before_freeze');image.path=await freeze(b,'.png');}
const frozenManifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
formal.manifestPath=await freeze(frozenManifestBytes,'.json');formal.manifestSha256=sha(frozenManifestBytes);
const frozenMapBytes=Buffer.from(JSON.stringify(map,null,2)+'\n'),mapSnapshot=join(run,'reuse-maps',sha(frozenMapBytes)+'.json'),manifestSnapshot=bound(formal.manifestPath);
for(const[p,b]of[[mapSnapshot,frozenMapBytes]]){await mkdir(dirname(p),{recursive:true});try{await writeFile(p,b,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||sha(await readFile(p))!==sha(b))throw e;}}
const output=join(run,'candidates',source.sourceId,source.articleId+(variant?'.'+variant:'')+'.json'),assets=new Map(source.assets.map(a=>[a.assetId,a])),blocks=[],figures=[];
for(const block of source.blocks){
 if(block.type==='text'){blocks.push({type:'text',sourceBlockIds:[block.id],sourceText:block.text,text:block.text,paragraphId:block.paragraphId,sourceSegments:block.segments,tableContext:block.tableContext});continue;}
 if(block.type!=='image-run'||block.images.length!==1)throw Error('formal_reuse_requires_complete_single_image_run');
 const image=block.images[0],asset=assets.get(image.assetId),proof=formal.images.find(i=>i.assetId===asset.assetId);
 if(!proof?.reusePermitted||proof.assetSha256!==asset.sha256||proof.exactMatches.length!==1)throw Error('formal_reuse_image_not_unique_complete_match');
 const match=proof.exactMatches[0],entry=chapter.blocks.find(b=>b.blockId===match.formalBlockId&&b.unitId===match.unitId),original=bodyChapter.blocks.find(b=>b.id===match.formalBlockId),unit=corpus.units.find(u=>u.unitId===match.unitId&&u.chapterId===formal.chapterId),compiled=unit?.blocks.find(b=>b.id===match.formalBlockId);
 if(!entry||!original||!same(entry.originalFormalBlock,original)||compiled?.type!=='figure'||!same(compiled.figure.transcription,match.transcription)||compiled.figure.requiresImageForFullExample!==false||match.completeFigureAssetCount!==1||match.sourceImageBlocks.length!==1)throw Error('formal_complete_transcription_or_body_changed');
 const sourceImage=match.sourceImageBlocks[0],formalImage=match.formalImage;
 if(!same(sourceImage.pixelSignature,proof.pixelSignature)||sha(await readFile(bound(sourceImage.assetPath)))!==sourceImage.sha256||sha(await readFile(bound(formalImage.path)))!==formalImage.sha256||compiled.figure.imageSha256!==formalImage.sha256||!corpus.images.some(i=>i.figureId===formalImage.figureId&&i.sha256===formalImage.sha256))throw Error('formal_parent_original_image_changed');
 const figureId=block.id+':figure';figures.push({figureId,sourceBlockIds:[block.id],sourceOccurrenceIds:[image.occurrenceId],sourceAssetBindings:[{assetId:asset.assetId,path:'web-sources/v1/'+asset.path,sha256:asset.sha256,url:asset.url}],kind:'mahjong-example',transcription:JSON.stringify(compiled.figure.transcription),unknowns:[],caption:compiled.figure.caption,sourceNotes:[],provenance:{method:'existing-formal-corpus-exact-original-image-reuse',manifestPath:rel(manifestSnapshot),manifestSha256:sha(frozenManifestBytes),chapterId:formal.chapterId,formalBlockId:match.formalBlockId,unitId:match.unitId,sourceImageBlockId:sourceImage.sourceBlockId,sourceImagePath:rel(bound(sourceImage.assetPath)),sourceImageSha256:sourceImage.sha256,pixelSignature:proof.pixelSignature,formalImage}});
 blocks.push({type:'figure',sourceBlockIds:[block.id],figureId,paragraphId:block.paragraphId,tableContext:block.tableContext});
}
const candidate={schema:'coach-textbook-web-article-draft/1',status:'draft',productionStatus:'draft-awaiting-independent-web-review',source:{sourceId:source.sourceId,articleId:source.articleId,url:source.url,title:source.title,language:source.language,fetchedAt:source.fetchedAt,sourcePath:rel(sourcePath),sourceSha256:sha(sourceBytes),htmlSha256:source.html.sha256,mainSha256:source.main.sha256},body:{language:'zh-CN',mode:'verbatim',flowOrder:'source-dom-order',blocks},figures,provenance:{sourceVersion:'web-sources/v1',model:null,reasoningEffort:null,artifactRoot:'web-production/v1',attempts:[],usage:null,modelCalls:0,reuseMap:{path:rel(mapSnapshot),sha256:sha(frozenMapBytes)},runnerSha256:sha(await readFile(new URL(import.meta.url))),extractorSha256:source.extractorSha256,priorVerificationLevel:{provenanceKind:manifest.provenanceKind,bodyStatus:bodies.status,corpusReviewStatus:corpus.reviewStatus,correctionsRecord:{path:manifest.correctionsPath,sha256:manifest.correctionsSha256}},semanticStatus:'inherited-formal-transcription-awaiting-independent-web-review',attribution:source.attributionNote}};
candidate.candidateSha256=sha(JSON.stringify(candidate));
if(argv.includes('--preflight-only')){console.log(JSON.stringify({preflightPassed:true,articleId:source.articleId,textBlocks:blocks.filter(b=>b.type==='text').length,completeFormalFigures:figures.length,modelCalls:0}));process.exit(0);}
await mkdir(dirname(output),{recursive:true});const bytes=JSON.stringify(candidate,null,2)+'\n';try{await writeFile(output,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||sha(await readFile(output))!==sha(bytes))throw Error('existing_formal_web_candidate_differs_preserve_it');}
const rendererBytes=await readFile(new URL(import.meta.url)),archive=join(run,'runners',sha(rendererBytes)+'.mjs');await writeFile(archive,rendererBytes);
console.log(JSON.stringify({candidatePath:output,candidateSha256:sha(await readFile(output)),textBlocks:blocks.filter(b=>b.type==='text').length,formalFigures:figures.length,modelCalls:0,reviewStatus:candidate.productionStatus}));
