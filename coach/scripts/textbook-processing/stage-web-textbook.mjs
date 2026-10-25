import {readFile,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {compileTextbookCorpus} from '../scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from '../scene-study/textbook-review.mjs';
import {splitExactText} from './publish-textbooks.mjs';
import {composeWebTables} from './stage-web-tables.mjs';
import {splitInlineParagraph} from './stage-inline-chunks.mjs';
import {applyDefinitionBoundaries} from './stage-definition-boundaries.mjs';
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
  const inlineFigures=parts.filter(b=>b.type==='figure'),inlineContent=parts.map(b=>b.type==='figure'?{figureId:b.id,text:' '+compactInlineTiles(b.transcriptionText)+' ',locator:b.locator}:{text:b.text,displaySegments:b.displaySegments??b.sourceSegments,sourceSegments:b.sourceSegments,locator:b.locator});
  if(parts.some(b=>!['p','h2','figure'].includes(b.type)))throw Error('web_stage_paragraph_block_type');
  const text=inlineContent.map(s=>s.text).join(''),locator={url:parts[0].locator.url,sourceBlockIds:[...new Set(parts.flatMap(b=>b.locator.sourceBlockIds))],domPaths:[...new Set(parts.flatMap(b=>b.locator.domPaths))]};
  if(!inlineFigures.length){let offset=0;const segments=parts.flatMap(b=>b.displaySegments??b.sourceSegments??[]);return splitExactText(text).map((fragment,part)=>{const displaySegments=sliceSourceSegments(segments,text,offset,offset+fragment.length);offset+=fragment.length;return {type:'p',id:`${sourceId}-p${index+1}-s${part+1}`,page:null,locator,text:fragment,paragraphId:parts[0].paragraphId,sourceSegments:parts.flatMap(b=>b.sourceSegments??[]),displaySegments};});}
  // The response budget remains enforced by the corpus validator; never truncate a sentence.
  return splitInlineParagraph({type:'p',id:`${sourceId}-p${index+1}`,page:null,locator,text,paragraphId:parts[0].paragraphId,...(inlineFigures.length?{inlineFigures,inlineContent}:{}),sourceSegments:parts.flatMap(b=>b.sourceSegments??[])},`${sourceId}-argument`);
 });
}
async function validateInputAdjudication(root,audit){
 const a=audit.inputAdjudication;
 if(!a?.path||!a.sha256||a.originalAudit?.status!=='failed'||!a.originalCall?.callId||!a.approvedAt||!a.resolvedIssueIndices?.length)throw Error('web_stage_missing_input_adjudication');
 for(const artifact of [a,a.originalAudit,a.originalCall])if(!artifact?.path||!/^[a-f0-9]{64}$/.test(artifact.sha256)||sha(await readFile(await contained(root,artifact.path)))!==artifact.sha256)throw Error('web_stage_adjudication_changed');
}
async function validateTransportRecovery(root,audit){
 const r=audit.transportRecovery;
 if(!r?.reason||!r.originalCall?.callId||!r.verifier?.combinedSha256)throw Error('web_stage_missing_transport_recovery');
 for(const a of [r.originalAudit,r.originalCall,r.verifier])if(!a?.path||!/^[a-f0-9]{64}$/.test(a.sha256)||sha(await readFile(await contained(root,a.path)))!==a.sha256)throw Error('web_stage_transport_recovery_changed');
}
async function validatePresentationRepair(root,audit){
 const r=audit.presentationRepair;
 if(!r?.approvedBy||!r.approvedAt||!r.originalCall?.callId||!r.issue||!r.renderValidation?.checks?.passed||!r.renderValidation.checks.textExact||r.renderValidation.checks.sourceCssExecuted!==false||audit.effectiveModelChecks?.passed!==true)throw Error('web_stage_missing_presentation_repair');
 const artifacts=[r,r.originalAudit,r.effectivePriorAudit,r.originalCall,r.renderValidation,{path:r.renderValidation.fixturePath,sha256:r.renderValidation.fixtureSha256}];
 for(const a of artifacts)if(!a?.path||!/^[a-f0-9]{64}$/.test(a.sha256)||sha(await readFile(await contained(root,a.path)))!==a.sha256)throw Error('web_stage_presentation_repair_changed');
}
async function validateLabelRepair(root,audit){
 const r=audit.labelRepair,n=r?.proof?.normalization;
 if(!n?.replacements?.length||!n.figureIds?.length||n.newProductionModelCalls!==0||!r.originalCall?.callId||audit.calls?.length!==0||!audit.inheritedCalls?.some(c=>c.callId===r.originalCall.callId)||audit.effectiveModelChecks?.passed!==true)throw Error('web_stage_missing_label_repair');
 for(const a of [r.parentAudit,r.originalCall,{path:n.parentPath,sha256:n.parentSha256},{path:n.notesPath,sha256:n.notesSha256}])if(!a?.path||!/^[a-f0-9]{64}$/.test(a.sha256)||sha(await readFile(await contained(root,a.path)))!==a.sha256)throw Error('web_stage_label_repair_changed');
}
async function validateSourceCorrection(root,audit){
 const r=audit.sourceCorrection;
 if(!r?.approvedBy||!r.approvedAt||!r.resolutions?.length||!r.originalCalls?.length||audit.calls?.length!==0||audit.effectiveModelChecks?.passed!==true||r.originalCalls.some(c=>!audit.inheritedCalls?.some(x=>x.callId===c.callId)))throw Error('web_stage_missing_source_correction');
 for(const a of [r,r.parent,r.originalAudit,...r.originalCalls])if(!a?.path||!/^[a-f0-9]{64}$/.test(a.sha256)||sha(await readFile(await contained(root,a.path)))!==a.sha256)throw Error('web_stage_source_correction_changed');
}
async function validateSourceEditorialNote(root,audit,candidate){
 const r=audit.sourceEditorialNote;
 if(!r?.approvedBy||!r.approvedAt||!r.originalIssue?.sha256||!r.originalCalls?.length||!r.appendText?.includes('编者校注（非原文）')||audit.calls?.length!==0||audit.effectiveModelChecks?.passed!==true)throw Error('web_stage_missing_source_editorial_note');
 for(const a of [r,r.manifest,r.originalAudit,...r.originalCalls])if(!a?.path||!/^[a-f0-9]{64}$/.test(a.sha256)||sha(await readFile(await contained(root,a.path)))!==a.sha256)throw Error('web_stage_source_editorial_note_changed');
 for(const a of r.originalCalls){const call=JSON.parse(await readFile(await contained(root,a.path)));if(!call.callId||!audit.inheritedCalls?.some(x=>x.callId===call.callId))throw Error('web_stage_editorial_parent_call');}
 const target=candidate.body.blocks.find(b=>b.sourceBlockIds.includes(r.targetSourceBlockId)),placement=candidate.body.blocks.find(b=>b.sourceBlockIds.includes(r.placementSourceBlockId));
 if(!target||placement?.type!=='text'||target.paragraphId!==r.paragraphId||placement.paragraphId!==r.paragraphId||!placement.text.endsWith(r.appendText)||candidate.body.blocks.filter(b=>b.type==='text'&&b.text.includes(r.appendText)).length!==1)throw Error('web_stage_editorial_note_placement');
}
/** A chapter preview in a new directory. This never replaces the active library. */
export async function stageWebTextbook({processingRoot,candidatePath,destination,verify,definitionSidecarPath,verifyDefinitionSidecar}){
 if(typeof verify!=='function')throw Error('web_stage_requires_independent_gate');
 const path=await contained(processingRoot,candidatePath),audit=await verify(processingRoot,path),bytes=await readFile(path),candidate=JSON.parse(bytes);
 if(!['passed','passed-after-specific-input-adjudication','passed-after-transport-recovery','passed-after-specific-presentation-repair','passed-after-exact-label-translation','passed-after-specific-source-correction','passed-after-specific-source-editorial-note'].includes(audit.status)||audit.production?.sha256!==sha(bytes))throw Error('web_stage_audit_identity');
 if(audit.status==='passed-after-specific-input-adjudication')await validateInputAdjudication(processingRoot,audit);
 if(audit.status==='passed-after-transport-recovery')await validateTransportRecovery(processingRoot,audit);
 if(audit.status==='passed-after-specific-presentation-repair')await validatePresentationRepair(processingRoot,audit);
 if(audit.status==='passed-after-exact-label-translation')await validateLabelRepair(processingRoot,audit);
 if(audit.status==='passed-after-specific-source-correction')await validateSourceCorrection(processingRoot,audit);
 if(audit.status==='passed-after-specific-source-editorial-note')await validateSourceEditorialNote(processingRoot,audit,candidate);
 if(candidate.schema!=='coach-textbook-web-article-draft/1')throw Error('web_stage_candidate_schema');
 const sourceBytes=await readFile(await contained(processingRoot,candidate.source.sourcePath)),source=JSON.parse(sourceBytes);
 if(sha(sourceBytes)!==candidate.source.sourceSha256||source.html.sha256!==candidate.source.htmlSha256||source.url!==candidate.source.url)throw Error('web_stage_source_changed');
 let presentation=candidate,definitionBoundary;
 if(definitionSidecarPath){
  if(typeof verifyDefinitionSidecar!=='function')throw Error('web_stage_requires_definition_gate');
  const sidecarPath=await contained(processingRoot,definitionSidecarPath),proof=await verifyDefinitionSidecar(processingRoot,path,sidecarPath),sidecarBytes=await readFile(sidecarPath),sidecar=JSON.parse(sidecarBytes);
  if(proof.passed!==true||proof.sidecarSha256!==sha(sidecarBytes)||proof.candidateSha256!==sha(bytes)||sidecar.candidateSha256!==sha(bytes)||sidecar.sourceSha256!==sha(sourceBytes))throw Error('web_stage_definition_identity');
  presentation=applyDefinitionBoundaries(candidate,source,sidecar,sha(sidecarBytes));definitionBoundary={path:sidecarPath,sha256:sha(sidecarBytes),proof};
 }
 const sourceId=`${source.sourceId}-${source.articleId}`.toLowerCase().replace(/[^a-z0-9-]/g,'-'),chapterId=`${sourceId}-chapter`,unitId=`${sourceId}-argument`;
 if(chapterId.length>90)throw Error('web_stage_identity_too_long');
 const byId=new Map(source.blocks.map(b=>[b.id,b])),figures=new Map(presentation.figures.map(f=>[f.figureId,f])),rawBlocks=[],images=[];
 for(const original of presentation.body.blocks){
  const sources=original.sourceBlockIds.map(id=>byId.get(id));if(!sources.length||sources.some(b=>!b))throw Error('web_stage_source_locator');
  const locator={url:source.url,sourceBlockIds:original.sourceBlockIds,domPaths:[...new Set([...sources.map(b=>b.domPath),...(original.definitionDomBoundary?[original.definitionDomBoundary]:[])])]};
  if(original.type==='text'){
   const alignedSource=original.sourceSegments?.map(s=>s.text).join('')===original.text;
   let offset=0;for(const text of splitExactText(original.text)){const displaySegments=sliceSourceSegments(original.sourceSegments,original.text,offset,offset+text.length),sourceSegments=alignedSource?displaySegments:offset===0?original.sourceSegments:undefined;offset+=text.length;rawBlocks.push({type:/^h[1-6]$/.test(sources[0].tag)?'h2':'p',id:`${sourceId}-b${rawBlocks.length+1}`,page:null,locator,text,paragraphId:original.paragraphId??sources[0].paragraphId,sourceSegments,displaySegments,tableContext:original.tableContext});}
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
 const receipt={schema:'coach-textbook-web-stage/1',status:'independently-audited-chapter-preview',candidatePath:path,candidateSha256:sha(bytes),sourceSha256:sha(sourceBytes),auditPath:audit.auditPath,auditStatus:audit.status,...(audit.inputAdjudication?{inputAdjudication:audit.inputAdjudication,originalAuditStatus:audit.originalStatus,effectiveModelChecks:audit.effectiveModelChecks,originalModelChecks:audit.modelChecks}:{}),...(audit.transportRecovery?{transportRecovery:audit.transportRecovery}:{}),...(audit.presentationRepair?{presentationRepair:audit.presentationRepair,originalAuditStatus:audit.originalStatus,originalModelChecks:audit.modelChecks,effectiveModelChecks:audit.effectiveModelChecks,effectiveSemanticCompleteness:audit.effectiveSemanticCompleteness}:{}),...(audit.labelRepair?{labelRepair:audit.labelRepair,calls:audit.calls,inheritedCalls:audit.inheritedCalls,originalModelChecks:audit.modelChecks,effectiveModelChecks:audit.effectiveModelChecks}:{}),...(audit.sourceCorrection?{sourceCorrection:audit.sourceCorrection,calls:audit.calls,inheritedCalls:audit.inheritedCalls,originalModelChecks:audit.modelChecks,effectiveModelChecks:audit.effectiveModelChecks}:{}),...(audit.sourceEditorialNote?{sourceEditorialNote:audit.sourceEditorialNote,calls:audit.calls,inheritedCalls:audit.inheritedCalls,originalModelChecks:audit.modelChecks,effectiveModelChecks:audit.effectiveModelChecks}:{}),...(definitionBoundary?{definitionBoundary}:{}),...build,modelCalls:0,activeLibraryChanged:false,humanReview:'pending'};
 await writeFile(join(destination,'web-stage-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}

