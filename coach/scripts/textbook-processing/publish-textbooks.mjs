import {readFile,writeFile,mkdir,copyFile,realpath,rename,rm,mkdtemp} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {TextbookIdSchema} from '@riichi-coach/contracts';
import {validateTextbookCorpus} from '@riichi-coach/desktop/textbook-knowledge';
import {verifyAuditForCandidate} from '../scene-study/textbook-audit.mjs';
import {compileTextbookCorpus} from '../scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview,validateLibrary,validateBodies} from '../scene-study/textbook-review.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const parse=async p=>JSON.parse(await readFile(p,'utf8'));
const key=(sourceId,page,id)=>`${sourceId}:${page}:${id}`;
async function contained(root,path){const base=await realpath(root),full=await realpath(resolve(base,path)),rel=relative(base,full);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('publish_path_outside_root');return full;}
/** Mapping is explicit and exhaustive; PDF bookmarks alone are not an argument boundary. */
export function mapSourceBlocks(chapterMap,pages){
 if(chapterMap.schema!=='coach-textbook-chapter-map/1'||!Array.isArray(chapterMap.chapters))throw Error('publish_chapter_map_schema');
 if(chapterMap.blockOrder!==undefined&&chapterMap.blockOrder!=='page-visual-yx')throw Error('publish_unknown_block_order');
 const ownership=new Map(),unitIds=new Set(),chapterIds=new Set();
 for(const chapter of chapterMap.chapters){
  TextbookIdSchema.parse(chapter.id);if(chapterIds.has(chapter.id)||!chapter.title?.trim())throw Error('publish_duplicate_chapter');chapterIds.add(chapter.id);
  const ordered=pages.filter(x=>x.sourceId===chapter.sourceId).flatMap(x=>(chapterMap.blockOrder==='page-visual-yx'?x.page.blocks.map((b,i)=>({...b,_order:i})).sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]||a._order-b._order):x.page.blocks).map(b=>({key:key(x.sourceId,x.page.page,b.id),block:b})));
  for(const unit of chapter.units){TextbookIdSchema.parse(unit.id);if(unitIds.has(unit.id)||!unit.title?.trim())throw Error('publish_duplicate_unit');unitIds.add(unit.id);
   const from=ordered.findIndex(b=>b.key===key(chapter.sourceId,unit.from.page,unit.from.sourceBlockId)),to=ordered.findIndex(b=>b.key===key(chapter.sourceId,unit.to.page,unit.to.sourceBlockId));
   if(from<0||to<from)throw Error('publish_invalid_argument_boundary');
   for(const b of ordered.slice(from,to+1)){if(ownership.has(b.key))throw Error('publish_overlap');ownership.set(b.key,{chapter,unit});}
  }
 }
 for(const p of pages)for(const b of p.page.blocks){if(b.type==='image'||b.type==='text'&&(b.lines??[]).some(l=>l.text.trim()))if(!ownership.has(key(p.sourceId,p.page.page,b.id)))throw Error(`publish_unmapped_source_block:${b.id}`);}
 return ownership;
}
/** No summary substitution. Long paragraphs are split losslessly for bounded transport. */
export function splitExactText(text,maxChars=2500){const chunks=[];let remaining=text;while(remaining.length>maxChars){let cut=remaining.lastIndexOf('\n',maxChars);if(cut<maxChars/2)cut=remaining.lastIndexOf('。',maxChars)+1;if(cut<maxChars/2)cut=maxChars;chunks.push(remaining.slice(0,cut));remaining=remaining.slice(cut);}if(remaining)chunks.push(remaining);if(chunks.join('')!==text)throw Error('publish_text_loss');return chunks;}
function mappedOwner(ownership,sourceId,page,ids){if(!ids?.length)throw Error('publish_missing_source_blocks');const owners=ids.map(id=>ownership.get(key(sourceId,page,id)));if(owners.some(x=>!x)||owners.some(x=>x.unit.id!==owners[0].unit.id))throw Error('publish_paragraph_crosses_argument_boundary');return owners[0];}
export async function prepareApprovedTextbooks({processingRoot,candidateRoot,chapterMapPath,candidateOverridesPath,verify=verifyAuditForCandidate}){
 const inventory=await parse(join(processingRoot,'source-inventory.json')),pages=[];
 const overrides=new Map();let candidateOverridesSha256=null;
 if(candidateOverridesPath){
  const bytes=await readFile(candidateOverridesPath),selection=JSON.parse(bytes);candidateOverridesSha256=sha(bytes);
  if(selection.schema!=='coach-textbook-candidate-selection/1'||!Array.isArray(selection.pages))throw Error('publish_invalid_candidate_selection');
  for(const entry of selection.pages){const id=`${entry.sourceId}:${entry.page}`;
   if(overrides.has(id)||!inventory.sources.some(s=>s.sourceId===entry.sourceId&&s.pages.some(p=>p.page===entry.page))||typeof entry.candidatePath!=='string'||!/^[a-f0-9]{64}$/.test(entry.candidateSha256))throw Error('publish_invalid_candidate_selection');overrides.set(id,entry);
  }
 }
 for(const source of inventory.sources)for(const item of source.pages){
  const selected=overrides.get(`${source.sourceId}:${item.page}`);
  const path=await contained(processingRoot,selected?.candidatePath??join(candidateRoot,source.sourceId,`page-${String(item.page).padStart(4,'0')}.json`));
  if(selected&&sha(await readFile(path))!==selected.candidateSha256)throw Error('publish_selected_candidate_changed');
  const audit=await verify(processingRoot,path);
  if(!['passed','passed-after-source-adjudication','passed-after-transport-recovery'].includes(audit.status))throw Error('publish_audit_not_passed');
  if(audit.status==='passed-after-source-adjudication'&&(!audit.adjudication?.path||!audit.adjudication.sha256))throw Error('publish_missing_adjudication_evidence');
  if(audit.status==='passed-after-transport-recovery'&&(!audit.transportRecovery?.originalAudit?.sha256||!audit.transportRecovery?.originalCall?.sha256))throw Error('publish_missing_transport_recovery_evidence');
  const bytes=await readFile(path),candidate=JSON.parse(bytes),pageBytes=await readFile(await contained(processingRoot,item.pageData));
  if(sha(bytes)!==audit.production.sha256||selected&&sha(bytes)!==selected.candidateSha256||sha(pageBytes)!==item.pageDataSha256||candidate.source.sourceId!==source.sourceId||candidate.source.page!==item.page||candidate.source.pdfSha256!==source.sha256||candidate.source.pageDataSha256!==item.pageDataSha256)throw Error('publish_source_changed');
  const page=JSON.parse(pageBytes);pages.push({sourceId:source.sourceId,source,candidate,candidatePath:path,page,audit});
 }
 const chapterMap=await parse(chapterMapPath);
 if(chapterMap.inventorySha256&&chapterMap.inventorySha256!==sha(await readFile(join(processingRoot,'source-inventory.json'))))throw Error('publish_chapter_map_source_changed');
 for(const chapter of chapterMap.chapters)for(const entry of [chapter,...chapter.units])if(entry.titleStatus==='source-only-pending-audited-translation'){
  const page=pages.find(p=>p.sourceId===chapter.sourceId&&p.page.page===entry.titleSource.page),block=page?.candidate.body.blocks.find(b=>b.type==='text'&&b.sourceBlockIds.length===1&&b.sourceBlockIds[0]===entry.titleSource.sourceBlockId);
  if(!block?.text.trim()||block.text.trim().length>160)throw Error('publish_unresolved_chinese_title');entry.title=block.text.trim();entry.titleStatus='automatically-audited-chinese-title';
 }
 const ownership=mapSourceBlocks(chapterMap,pages),blocksByUnit=new Map(),images=[],seenIds=new Set();
 for(const p of pages){
  const figures=new Map(p.candidate.figures.map(f=>[f.figureId,f])),seenFigures=new Set();
  for(const block of p.candidate.body.blocks){
   if(block.type==='figure'){
    const f=figures.get(block.figureId);if(!f||seenFigures.has(f.figureId))throw Error('publish_figure_reference');seenFigures.add(f.figureId);
    const owner=mappedOwner(ownership,p.sourceId,p.page.page,f.sourceImageBlockIds);
    if(!f.transcription?.trim()||f.transcription.length>3500||/无法辨认|无法识别|待补|待核对|若干[万筒饼索]|接上段/.test(f.transcription))throw Error('publish_unresolved_figure');
    const original=await contained(processingRoot,f.croppedImagePath),bytes=await readFile(original);if(sha(bytes)!==f.croppedImageSha256||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('publish_figure_changed');
    TextbookIdSchema.parse(f.figureId);const asset=`assets/full-${f.croppedImageSha256}.png`;
    images.push({source:original,path:asset,sha256:f.croppedImageSha256});
    const out={id:f.figureId,type:'figure',page:p.page.page,src:asset,caption:f.caption||'教材原图',transcriptionText:f.transcription,sourceBlockIds:f.sourceImageBlockIds};
    blocksByUnit.set(owner.unit.id,[...(blocksByUnit.get(owner.unit.id)??[]),out]);
   }else if(block.type==='text'){
    if(!block.text.trim())continue;
    if(/^[（(]?接上段[）)]?$|^待翻译$|^同上$/.test(block.text.trim()))throw Error('publish_placeholder_body');
    const owner=mappedOwner(ownership,p.sourceId,p.page.page,block.sourceBlockIds);
    const out=splitExactText(block.text).map((text,i)=>({id:`${block.sourceBlockIds[0]}-t${i+1}`,type:'p',page:p.page.page,text,sourceBlockIds:block.sourceBlockIds}));
    blocksByUnit.set(owner.unit.id,[...(blocksByUnit.get(owner.unit.id)??[]),...out]);
   }else throw Error('publish_body_schema');
  }
  if(seenFigures.size!==figures.size)throw Error('publish_unplaced_figure');
 }
 for(const blocks of blocksByUnit.values())for(const b of blocks){TextbookIdSchema.parse(b.id);if(seenIds.has(b.id))throw Error('publish_duplicate_block_id');seenIds.add(b.id);}
 for(const c of chapterMap.chapters)for(const u of c.units)if(!blocksByUnit.get(u.id)?.length)throw Error('publish_empty_argument');
 return {inventory,chapterMap,blocksByUnit,images,pages,candidateOverridesSha256,auditNote:'Independently checked; source adjudications and transport recoveries remain distinct in the receipt. User content review remains pending.'};
}
/** Fail before changing the live library unless every supplied PDF page is audited and mapped. */
export async function publishTextbooks(options){
 const root=await realpath(options.reviewRoot);
 try{if((await parse(join(root,'publication-in-progress.json'))).status==='publishing')throw Error('publish_resume_required');}catch(e){if(e.code!=='ENOENT')throw e;}
 const approved=await prepareApprovedTextbooks(options);
 const library=await parse(join(root,'knowledge-index.json')),bodyBytes=await readFile(join(root,'textbook-bodies.json')),bodies=JSON.parse(bodyBytes),priorCorpus=validateTextbookCorpus(await parse(join(root,'textbook-corpus.json')));
 if(sha(bodyBytes)!==priorCorpus.bodySha256)throw Error('publish_existing_body_changed');
 const replacedChapters=library.chapters.map(c=>({chapterId:c.id,sourceId:c.sourceId,startPage:c.bodyStartPage,endPage:c.endPage}));
 library.chapters=[];bodies.chapters=[];
 const definitions=[],seen=new Set();
 for(const c of approved.chapterMap.chapters){
  if(seen.has(c.id))throw Error('publish_chapter_id_collision');seen.add(c.id);
  const blocks=c.units.flatMap(u=>approved.blocksByUnit.get(u.id)),pages=[...new Set(blocks.map(b=>b.page))],source=library.sources.find(s=>s.id===c.sourceId);
  if(!source||source.sha256!==approved.inventory.sources.find(s=>s.sourceId===c.sourceId)?.sha256)throw Error('publish_source_edition_mismatch');
  const sourceAdjudicated=approved.pages.some(p=>p.sourceId===c.sourceId&&pages.includes(p.page.page)&&p.audit.status==='passed-after-source-adjudication');
  library.chapters.push({id:c.id,title:c.title,sourceId:c.sourceId,startPage:Math.min(...pages),bodyStartPage:Math.min(...pages),endPage:Math.max(...pages),topics:c.topics??[],anchors:[],relatedChapterIds:[],reviewFocus:sourceAdjudicated?'完整中文论证、牌例和判断力度；包含经独立源图复核裁决的模型误审，详见发布记录。用户审核待完成。':'完整中文论证、牌例和判断力度；自动校对已通过，用户审核待完成。'});
  bodies.chapters.push({chapterId:c.id,sourceId:c.sourceId,sourceSha256:source.sha256,translationStatus:'batch-audited-pending-user-review',translatorNote:sourceAdjudicated?'完整正文与牌例经批量制作及独立校对；模型误审的源图裁决及原审查均保留于发布记录。未运行局面模型实验，用户内容审核待完成。':'完整正文与牌例经批量制作及独立自动校对；未运行局面模型实验。用户内容审核待完成。',blocks});
  let offset=0;for(const u of c.units){const length=approved.blocksByUnit.get(u.id).length;definitions.push({id:u.id,chapterId:c.id,title:u.title,from:offset+1,to:offset+length});offset+=length;}
 }
 library.status='full-textbook-auto-audited';validateLibrary(library);validateBodies(library,bodies);
 const stage=await mkdtemp(join(root,'.publish-stage-'));await mkdir(join(stage,'assets'));
 for(const image of approved.images){const bytes=await readFile(image.source);if(sha(bytes)!==image.sha256)throw Error('publish_figure_changed');await writeFile(join(stage,image.path),bytes);}
 await writeFile(join(stage,'textbook-bodies.json'),JSON.stringify(bodies,null,2)+'\n');await writeFile(join(stage,'knowledge-index.json'),JSON.stringify(library,null,2)+'\n');
 const build=await compileTextbookCorpus(stage,definitions);await buildTextbookReview(stage,library);
 const receipt={schema:'coach-textbook-full-publication/1',publishedAt:new Date().toISOString(),sourceInventorySha256:sha(await readFile(join(options.processingRoot,'source-inventory.json'))),pages:approved.pages.length,candidateOverridesSha256:approved.candidateOverridesSha256,...build,modelExperiments:0,humanReview:'pending',auditReceipts:approved.pages.map(p=>({sourceId:p.sourceId,page:p.page.page,status:p.audit.status,candidatePath:p.candidatePath,candidateSha256:p.audit.production.sha256,auditPath:p.audit.auditPath,modelChecks:p.audit.modelChecks??null,adjudication:p.audit.adjudication??null,transportRecovery:p.audit.transportRecovery??null})),replacesPriorCorpusId:priorCorpus.corpusId,replacedChapters:replacedChapters.map(c=>({...c,coveredByFullSource:true,newChapterIds:library.chapters.filter(n=>n.sourceId===c.sourceId&&n.startPage<=c.endPage&&n.endPage>=c.startPage).map(n=>n.id)})),duplicateLegacyUnitsPublished:false};
 // Copy content-addressed new assets first; replace manifests only after the complete stage validates.
 for(const image of approved.images)await copyFile(join(stage,image.path),join(root,image.path));
 await writeFile(join(stage,'textbook-unit-map.json'),JSON.stringify(definitions,null,2)+'\n');await writeFile(join(stage,'full-publication.json'),JSON.stringify(receipt,null,2)+'\n');
 const names=['textbook-bodies.json','knowledge-index.json','textbook-corpus.json','knowledge.html','mcp-build.json','textbook-unit-map.json','full-publication.json'];
 const files=await Promise.all(names.map(async name=>({name,sha256:sha(await readFile(join(stage,name)))})));
 await writeFile(join(root,'publication-in-progress.json'),JSON.stringify({schema:'coach-textbook-publication-journal/1',status:'publishing',stage:relative(root,stage),files},null,2)+'\n');
 await resumeTextbookPublication(root);return receipt;
}
/** A interrupted rename sequence is fail-closed for MCP, and can be resumed without model work. */
export async function resumeTextbookPublication(reviewRoot){
 const root=await realpath(reviewRoot),journalPath=join(root,'publication-in-progress.json'),journal=await parse(journalPath);
 const allowed=new Set(['textbook-bodies.json','knowledge-index.json','textbook-corpus.json','knowledge.html','mcp-build.json','textbook-unit-map.json','full-publication.json']);
 if(journal.schema!=='coach-textbook-publication-journal/1'||journal.status!=='publishing'||!/^\.publish-stage-[a-zA-Z0-9]+$/.test(journal.stage)||journal.files.length!==allowed.size||new Set(journal.files.map(f=>f.name)).size!==allowed.size||journal.files.some(f=>!allowed.has(f.name)||! /^[a-f0-9]{64}$/.test(f.sha256)))throw Error('publish_invalid_journal');
 const stage=await contained(root,journal.stage);
 const pending=[];
 for(const file of journal.files){
  let current=null;try{current=sha(await readFile(join(root,file.name)));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(current===file.sha256)continue;
  const staged=await readFile(await contained(stage,file.name));if(sha(staged)!==file.sha256)throw Error('publish_stage_changed');pending.push(file);
 }
 for(const file of pending)await rename(join(stage,file.name),join(root,file.name));
 const corpus=validateTextbookCorpus(await parse(join(root,'textbook-corpus.json')));if(sha(await readFile(join(root,'textbook-bodies.json')))!==corpus.bodySha256)throw Error('publish_installed_body_mismatch');
 for(const file of journal.files)if(sha(await readFile(join(root,file.name)))!==file.sha256)throw Error('publish_installed_file_changed');
 await writeFile(journalPath,JSON.stringify({...journal,status:'completed',completedAt:new Date().toISOString()},null,2)+'\n');
 const rel=relative(root,stage);if(isAbsolute(rel)||!rel.startsWith('.publish-stage-')||rel.includes(sep))throw Error('publish_stage_cleanup_scope');await rm(stage,{recursive:true});return {status:'completed',corpusId:corpus.corpusId};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [processingRoot,candidateRoot,chapterMapPath,reviewRoot,candidateOverridesPath]=process.argv.slice(2);if(processingRoot==='--resume'){console.log(JSON.stringify(await resumeTextbookPublication(candidateRoot)));}else{if(!reviewRoot)throw Error('Usage: publish-textbooks.mjs PROCESSING_ROOT RELATIVE_CANDIDATE_ROOT CHAPTER_MAP_JSON REVIEW_ROOT [CANDIDATE_SELECTION_JSON]');console.log(JSON.stringify(await publishTextbooks({processingRoot,candidateRoot,chapterMapPath,reviewRoot,candidateOverridesPath})));}}
