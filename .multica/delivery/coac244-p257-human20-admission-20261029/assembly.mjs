// Private existing assembler: only two exact inherited passed source-limit strings are exempted from the lexical word ban.
import {readFile,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {TextbookIdSchema} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/node_modules/@riichi-coach/contracts/dist/index.js';
import {mapSourceBlocks,splitExactText} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/publish-textbooks.mjs';
import {splitInlineParagraph} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/stage-inline-chunks.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=(s,p,id)=>`${s}:${p}:${id}`;
async function contained(root,path){const base=await realpath(root),full=await realpath(resolve(base,path)),rel=relative(base,full);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('publish_path_outside_root');return full;}
function mappedOwner(ownership,sourceId,page,ids){if(!ids?.length)throw Error('publish_missing_source_blocks');const owners=ids.map(id=>ownership.get(key(sourceId,page,id)));if(owners.some(x=>!x)||owners.some(x=>x.unit.id!==owners[0].unit.id))throw Error('publish_paragraph_crosses_argument_boundary');return owners[0];}
const EXCEPTIONS=[{"page":253,"figureId":"nemata-jp-p253-r17","transcriptionSha256":"92c690cae577044edf73bd8a97b4d7c3d00cd016ea55ba5aaa916c5de7ab43eb","croppedImageSha256":"8ba6cd69cce19b3e0eb204462b4d031c31cc6a238f40f3e77645eacb744fd7a0"},{"page":258,"figureId":"nemata-jp-p258-r7","transcriptionSha256":"8faf2ecc790717330f3f51da9fdd887960c70c8793771a9105b9cbe00911c3c0","croppedImageSha256":"ee2d8d8ec7cb9c805d6c2b477908f21489345e35751a306025acc601d691a88d"}];
export function allowInheritedSourceLimit(p,f){return EXCEPTIONS.some(e=>p.sourceId==='nemata-jp'&&p.page.page===e.page&&p.audit.status==='passed'&&f.figureId===e.figureId&&sha(f.transcription)===e.transcriptionSha256&&f.croppedImageSha256===e.croppedImageSha256);}
export async function assembleApprovedPdfPages({processingRoot,inventory,chapterMap,pages,candidateOverridesSha256=null,allowOutsideChapters=false}){
 for(const chapter of chapterMap.chapters)for(const entry of [chapter,...chapter.units])if(entry.titleStatus==='source-only-pending-audited-translation'){
  const page=pages.find(p=>p.sourceId===chapter.sourceId&&p.page.page===entry.titleSource.page),block=page?.candidate.body.blocks.find(b=>b.type==='text'&&b.sourceBlockIds.length===1&&b.sourceBlockIds[0]===entry.titleSource.sourceBlockId);
  if(!block?.text.trim()||block.text.trim().length>160)throw Error('publish_unresolved_chinese_title');entry.title=block.text.trim();entry.titleStatus='automatically-audited-chinese-title';
 }
 const ownership=mapSourceBlocks(chapterMap,pages,!allowOutsideChapters),blocksByUnit=new Map(),images=[],seenIds=new Set(),coveredSourceBlocks=new Set();
 for(const p of pages){
  const figures=new Map(p.candidate.figures.map(f=>[f.figureId,f])),seenFigures=new Set();
  async function makeFigure(figureId){
   const f=figures.get(figureId);if(!f||seenFigures.has(f.figureId))throw Error('publish_figure_reference');seenFigures.add(f.figureId);
   if(allowOutsideChapters&&f.sourceImageBlockIds.every(id=>!ownership.has(key(p.sourceId,p.page.page,id))))return null;
   const owner=mappedOwner(ownership,p.sourceId,p.page.page,f.sourceImageBlockIds);for(const id of f.sourceImageBlockIds)coveredSourceBlocks.add(key(p.sourceId,p.page.page,id));
   const inheritedKnownSourceLimit=allowInheritedSourceLimit(p,f);
   if(!f.transcription?.trim()||f.transcription.length>3500||(!inheritedKnownSourceLimit&&/无法辨认|无法识别|待补|待核对|若干[万筒饼索]|接上段/.test(f.transcription)))throw Error('publish_unresolved_figure');
   const original=await contained(processingRoot,f.croppedImagePath),bytes=await readFile(original);if(sha(bytes)!==f.croppedImageSha256||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('publish_figure_changed');
   TextbookIdSchema.parse(f.figureId);const asset=`assets/full-${f.croppedImageSha256}.png`;images.push({source:original,path:asset,sha256:f.croppedImageSha256});
   return{owner,out:{id:f.figureId,type:'figure',page:p.page.page,src:asset,caption:f.caption||'教材原图',transcriptionText:f.transcription,sourceBlockIds:f.sourceImageBlockIds,...(f.imageProvenance?{imageProvenance:f.imageProvenance}:{})}};
  }
  for(const block of p.candidate.body.blocks){
   if(block.type==='figure'){
    const figure=await makeFigure(block.figureId);if(!figure)continue;const{owner,out}=figure;
    blocksByUnit.set(owner.unit.id,[...(blocksByUnit.get(owner.unit.id)??[]),out]);
   }else if(block.type==='text'){
    const inline=[];for(const id of block.inlineFigureIds??[])inline.push(await makeFigure(id));
    if(!block.text.trim())continue;
    if(/^[（(]?接上段[）)]?$|^待翻译$|^同上$/.test(block.text.trim()))throw Error('publish_placeholder_body');
    if(allowOutsideChapters&&block.sourceBlockIds.every(id=>!ownership.has(key(p.sourceId,p.page.page,id)))){if(inline.some(Boolean))throw Error('publish_inline_cross_argument');continue;}
    const owner=mappedOwner(ownership,p.sourceId,p.page.page,block.sourceBlockIds);
    for(const id of block.sourceBlockIds)coveredSourceBlocks.add(key(p.sourceId,p.page.page,id));
    if(inline.some(f=>!f||f.owner.unit.id!==owner.unit.id))throw Error('publish_inline_cross_argument');
    if(block.sourceHeading&&(!block.pdfInlineLayout||block.sourceHeading.level!==2||inline.length||block.text.length>160))throw Error('publish_source_heading_binding');
    const out=inline.length?splitInlineParagraph({id:`${block.sourceBlockIds[0]}-inline`,type:'p',page:p.page.page,text:block.text,sourceBlockIds:[...block.sourceBlockIds,...inline.flatMap(f=>f.out.sourceBlockIds)],inlineContent:block.inlineContent,inlineFigures:inline.map(f=>f.out),pdfInlineLayout:block.pdfInlineLayout},owner.unit.id):splitExactText(block.text).map((text,i)=>({id:`${block.sourceBlockIds[0]}-t${i+1}`,type:block.sourceHeading?'h2':'p',page:p.page.page,text,sourceBlockIds:block.sourceBlockIds,...(block.pdfInlineLayout?{pdfInlineLayout:block.pdfInlineLayout}:{}),...(block.sourceHeading?{sourceHeading:block.sourceHeading}:{})}));
    blocksByUnit.set(owner.unit.id,[...(blocksByUnit.get(owner.unit.id)??[]),...out]);
   }else throw Error('publish_body_schema');
  }
  if(seenFigures.size!==figures.size)throw Error('publish_unplaced_figure');
 }
 for(const p of pages)for(const b of p.page.blocks){const id=key(p.sourceId,p.page.page,b.id);if(ownership.has(id)&&(b.type==='image'||b.type==='text'&&(b.lines??[]).some(l=>l.text.trim()))&&!coveredSourceBlocks.has(id))throw Error('publish_unplaced_source_block');}
 for(const blocks of blocksByUnit.values())for(const b of blocks){TextbookIdSchema.parse(b.id);if(seenIds.has(b.id))throw Error('publish_duplicate_block_id');seenIds.add(b.id);}
 for(const c of chapterMap.chapters)for(const u of c.units)if(!blocksByUnit.get(u.id)?.length)throw Error('publish_empty_argument');
 return {inventory,chapterMap,blocksByUnit,images,pages,candidateOverridesSha256,auditNote:'Independently checked; source adjudications and transport recoveries remain distinct in the receipt. User content review remains pending.'};
}
export function appendApprovedPdfChapters({approved,library,bodies}){
 const definitions=[],seen=new Set();
 for(const c of approved.chapterMap.chapters){
  if(seen.has(c.id))throw Error('publish_chapter_id_collision');seen.add(c.id);
  const blocks=c.units.flatMap(u=>approved.blocksByUnit.get(u.id)),pages=[...new Set(blocks.map(b=>b.page))],source=library.sources.find(s=>s.id===c.sourceId);
  if(!source||source.sha256!==approved.inventory.sources.find(s=>s.sourceId===c.sourceId)?.sha256)throw Error('publish_source_edition_mismatch');
  const sourceAdjudicated=approved.pages.some(p=>p.sourceId===c.sourceId&&pages.includes(p.page.page)&&['passed-after-source-adjudication','passed-after-specific-source-correction','passed-after-source-flow-repair'].includes(p.audit.status));
  library.chapters.push({id:c.id,title:c.title,sourceId:c.sourceId,startPage:Math.min(...pages),bodyStartPage:Math.min(...pages),endPage:Math.max(...pages),topics:c.topics??[],anchors:[],relatedChapterIds:[],reviewFocus:sourceAdjudicated?'完整中文论证、牌例和判断力度；包含具体源图复核裁决或修正，原审查与有效验收详见发布记录。用户审核待完成。':'完整中文论证、牌例和判断力度；自动校对已通过，用户审核待完成。'});
  bodies.chapters.push({chapterId:c.id,sourceId:c.sourceId,sourceSha256:source.sha256,translationStatus:'batch-audited-pending-user-review',translatorNote:sourceAdjudicated?'完整正文与牌例经批量制作及独立校对；具体源图裁决或修正、原审查与有效验收分别保留于发布记录。未运行局面模型实验，用户内容审核待完成。':'完整正文与牌例经批量制作及独立自动校对；未运行局面模型实验。用户内容审核待完成。',blocks});
  let offset=0;for(const u of c.units){const length=approved.blocksByUnit.get(u.id).length;definitions.push({id:u.id,chapterId:c.id,title:u.title,from:offset+1,to:offset+length,...(u.contentRole!==undefined?{contentRole:u.contentRole}:{})});offset+=length;}
 }
 return definitions;
}
