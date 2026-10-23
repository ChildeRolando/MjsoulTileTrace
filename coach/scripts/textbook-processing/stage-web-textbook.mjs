import {readFile,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {compileTextbookCorpus} from '../scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from '../scene-study/textbook-review.mjs';
import {splitExactText} from './publish-textbooks.mjs';
import {composeWebTables} from './stage-web-tables.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function contained(root,path){const base=await realpath(root),full=await realpath(resolve(base,path)),rel=relative(base,full);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('web_stage_path_outside_root');return full;}
export function compactInlineTiles(text){
 if(!/^(?:[0-9][mpsz])(?:\s+[0-9][mpsz])*$/.test(text))return text;
 const runs=[];for(const tile of text.split(/\s+/)){const last=runs.at(-1);if(last?.suit===tile[1])last.digits+=tile[0];else runs.push({digits:tile[0],suit:tile[1]});}return runs.map(r=>r.digits+r.suit).join('');
}
export function sliceSourceSegments(segments,text,start=0,end=text.length){
 if(!segments?.length||segments.map(s=>s.text).join('')!==text)return [];
 let offset=0;return segments.flatMap(segment=>{const from=Math.max(start,offset),to=Math.min(end,offset+segment.text.length);offset+=segment.text.length;return from<to?[{...segment,text:segment.text.slice(from-(offset-segment.text.length),to-(offset-segment.text.length))}]:[];});
}
export function composeWebParagraphs(raw,sourceId){
 const groups=[];for(const block of raw){const last=groups.at(-1);if(block.paragraphId&&last?.[0].paragraphId===block.paragraphId)last.push(block);else groups.push([block]);}
 return groups.flatMap((parts,index)=>{
  if(parts.length===1)return parts;
  const inlineFigures=parts.filter(b=>b.type==='figure'),inlineContent=parts.map(b=>b.type==='figure'?{figureId:b.id,text:' '+compactInlineTiles(b.transcriptionText)+' '}:{text:b.text,displaySegments:b.displaySegments??b.sourceSegments});
  if(parts.some(b=>!['p','h2','figure'].includes(b.type)))throw Error('web_stage_paragraph_block_type');
  const text=inlineContent.map(s=>s.text).join(''),locator={url:parts[0].locator.url,sourceBlockIds:[...new Set(parts.flatMap(b=>b.locator.sourceBlockIds))],domPaths:[...new Set(parts.flatMap(b=>b.locator.domPaths))]};
  if(!inlineFigures.length){let offset=0;const segments=parts.flatMap(b=>b.displaySegments??b.sourceSegments??[]);return splitExactText(text).map((fragment,part)=>{const displaySegments=sliceSourceSegments(segments,text,offset,offset+fragment.length);offset+=fragment.length;return {type:'p',id:`${sourceId}-p${index+1}-s${part+1}`,page:null,locator,text:fragment,paragraphId:parts[0].paragraphId,sourceSegments:parts.flatMap(b=>b.sourceSegments??[]),displaySegments};});}
  // The response budget remains enforced by the corpus validator; never truncate a sentence.
  return [{type:'p',id:`${sourceId}-p${index+1}`,page:null,locator,text,paragraphId:parts[0].paragraphId,...(inlineFigures.length?{inlineFigures,inlineContent}:{}),sourceSegments:parts.flatMap(b=>b.sourceSegments??[])}];
 });
}
async function validateInputAdjudication(root,audit){
 const a=audit.inputAdjudication;
 if(!a?.path||!a.sha256||a.originalAudit?.status!=='failed'||!a.originalCall?.callId||!a.approvedAt||!a.resolvedIssueIndices?.length)throw Error('web_stage_missing_input_adjudication');
 for(const artifact of [a,a.originalAudit,a.originalCall])if(!artifact?.path||!/^[a-f0-9]{64}$/.test(artifact.sha256)||sha(await readFile(await contained(root,artifact.path)))!==artifact.sha256)throw Error('web_stage_adjudication_changed');
}
/** A chapter preview in a new directory. This never replaces the active library. */
export async function stageWebTextbook({processingRoot,candidatePath,destination,verify}){
 if(typeof verify!=='function')throw Error('web_stage_requires_independent_gate');
 const path=await contained(processingRoot,candidatePath),audit=await verify(processingRoot,path),bytes=await readFile(path),candidate=JSON.parse(bytes);
 if(!['passed','passed-after-specific-input-adjudication'].includes(audit.status)||audit.production?.sha256!==sha(bytes))throw Error('web_stage_audit_identity');
 if(audit.status==='passed-after-specific-input-adjudication')await validateInputAdjudication(processingRoot,audit);
 if(candidate.schema!=='coach-textbook-web-article-draft/1')throw Error('web_stage_candidate_schema');
 const sourceBytes=await readFile(await contained(processingRoot,candidate.source.sourcePath)),source=JSON.parse(sourceBytes);
 if(sha(sourceBytes)!==candidate.source.sourceSha256||source.html.sha256!==candidate.source.htmlSha256||source.url!==candidate.source.url)throw Error('web_stage_source_changed');
 const sourceId=`${source.sourceId}-${source.articleId}`.toLowerCase().replace(/[^a-z0-9-]/g,'-'),chapterId=`${sourceId}-chapter`,unitId=`${sourceId}-argument`;
 if(chapterId.length>90)throw Error('web_stage_identity_too_long');
 const byId=new Map(source.blocks.map(b=>[b.id,b])),figures=new Map(candidate.figures.map(f=>[f.figureId,f])),rawBlocks=[],images=[];
 for(const original of candidate.body.blocks){
  const sources=original.sourceBlockIds.map(id=>byId.get(id));if(!sources.length||sources.some(b=>!b))throw Error('web_stage_source_locator');
  const locator={url:source.url,sourceBlockIds:original.sourceBlockIds,domPaths:sources.map(b=>b.domPath)};
  if(original.type==='text'){
   let offset=0;for(const text of splitExactText(original.text)){const displaySegments=sliceSourceSegments(original.sourceSegments,original.text,offset,offset+text.length);offset+=text.length;rawBlocks.push({type:/^h[1-6]$/.test(sources[0].tag)?'h2':'p',id:`${sourceId}-b${rawBlocks.length+1}`,page:null,locator,text,paragraphId:original.paragraphId??sources[0].paragraphId,sourceSegments:original.sourceSegments,displaySegments,tableContext:original.tableContext});}
  }else if(original.type==='figure'){
   const f=figures.get(original.figureId);if(!f||!f.transcription?.trim())throw Error('web_stage_incomplete_figure');
   // A whole-image asset is lossless. Multi-asset runs require an explicitly audited presentation asset.
   const asset=f.presentationAsset??(f.sourceAssetBindings.length===1?f.sourceAssetBindings[0]:null);if(!asset)throw Error('web_stage_figure_presentation_required');
   const imagePath=await contained(processingRoot,asset.path),image=await readFile(imagePath);if(sha(image)!==asset.sha256||!image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('web_stage_image_identity');
   const id=`${sourceId}-b${rawBlocks.length+1}`,src=`assets/${id}.png`;images.push({from:imagePath,to:src});
   rawBlocks.push({type:'figure',id,page:null,locator,src,caption:f.caption,paragraphId:original.paragraphId??sources[0].paragraphId,transcriptionText:f.transcription+(f.unknowns?.length?'\n原图未显示的信息：'+f.unknowns.join('；'):''),sourceAssetBindings:f.sourceAssetBindings,sourceOccurrenceIds:f.sourceOccurrenceIds,presentationAsset:f.presentationAsset,transcriptionProvenance:f.provenance,...(f.presentationAsset?{imageProvenance:{kind:'derived-source-assets',method:'source-order-horizontal-RGBA-bottom-aligned-no-gap',sourceAssetSha256s:f.sourceAssetBindings.map(a=>a.sha256)}}:{})});
  }else throw Error('web_stage_unknown_block');
 }
 const blocks=composeWebTables(rawBlocks,source,sourceId,composeWebParagraphs),title=source.language==='ja'?candidate.body.blocks.find(b=>b.type==='text'&&/^h[1-6]$/.test(byId.get(b.sourceBlockIds[0])?.tag))?.text:source.title;
 if(!title)throw Error('web_stage_missing_chinese_title');
 const library={schema:'coach-textbook-index/1',status:'chapter-auto-audited',title,policy:{cardRole:'index-only',bodyRole:'complete-source-body-with-chinese-translation',modelExperiments:false,reviewStatus:'pending-user-review'},sources:[{id:sourceId,title,format:'web',language:source.language,url:source.url,articleId:source.articleId,sha256:source.html.sha256,htmlSha256:source.html.sha256,bytes:source.html.bytes,sourceJsonSha256:sha(sourceBytes),sourcePath:candidate.source.sourcePath}],chapters:[{id:chapterId,title,sourceId,startPage:null,bodyStartPage:null,endPage:null,topics:[],indexDescription:'完整原文论证和牌例；索引只定位。',anchors:[],relatedChapterIds:[]}]};
 const bodies={schema:'coach-textbook-bodies/1',language:'zh-CN',modelExperiments:false,chapters:[{chapterId,sourceId,sourceSha256:source.html.sha256,translationStatus:'batch-audited-pending-user-review',translatorNote:source.language==='ja'?'日文原文完整译为中文，句中牌编码按原段落顺序保留。牌列图由原始单牌资产按原序无损组合；所有源资产仍可追溯。自动校对不等于用户审核。':'保留原中文署名和正文。牌图转录如复用已验收 PDF，逐图保留原候选与像素核对出处。自动校对不等于用户审核。',blocks}]};
 const definitions=[{id:unitId,chapterId,title,from:1,to:blocks.length}];
 // Refuse reuse of an existing directory, including the active review library.
 await mkdir(destination,{recursive:false});await mkdir(join(destination,'assets'));
 for(const image of images)await copyFile(image.from,join(destination,image.to));
 for(const [name,data] of [['knowledge-index.json',library],['textbook-bodies.json',bodies],['textbook-unit-map.json',definitions]])await writeFile(join(destination,name),JSON.stringify(data,null,2)+'\n');
 const build=await compileTextbookCorpus(destination,definitions);await buildTextbookReview(destination,library);
 const receipt={schema:'coach-textbook-web-stage/1',status:'independently-audited-chapter-preview',candidatePath:path,candidateSha256:sha(bytes),sourceSha256:sha(sourceBytes),auditPath:audit.auditPath,auditStatus:audit.status,...(audit.inputAdjudication?{inputAdjudication:audit.inputAdjudication,originalAuditStatus:audit.originalStatus,effectiveModelChecks:audit.effectiveModelChecks,originalModelChecks:audit.modelChecks}:{}),...build,modelCalls:0,activeLibraryChanged:false,humanReview:'pending'};
 await writeFile(join(destination,'web-stage-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}

