import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readApprovedPdfPage,assembleApprovedPdfPages,appendApprovedPdfChapters,mapSourceBlocks} from './publish-textbooks.mjs';
import {compileTextbookCorpus} from '../scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from '../scene-study/textbook-review.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Stage only explicitly selected complete chapters. The real inventory is never narrowed or rewritten. */
export async function stagePdfChapters({processingRoot,chapterMapPath,candidateSelectionPath,chapterIds,sourceLibraryPath,destination,verify,verifySourceFlowLayout}){
 const inventoryBytes=await readFile(join(processingRoot,'source-inventory.json')),inventory=JSON.parse(inventoryBytes),mapBytes=await readFile(chapterMapPath),fullMap=JSON.parse(mapBytes),selectionBytes=await readFile(candidateSelectionPath),selection=JSON.parse(selectionBytes);
 if(fullMap.inventorySha256!==hash(inventoryBytes))throw Error('pdf_stage_inventory_changed');
 if(selection.schema!=='coach-textbook-candidate-selection/1'||!Array.isArray(selection.pages))throw Error('pdf_stage_selection_schema');
 if(!chapterIds?.length||new Set(chapterIds).size!==chapterIds.length)throw Error('pdf_stage_chapter_selection');
 const chapters=chapterIds.map(id=>{const matches=fullMap.chapters.filter(c=>c.id===id);if(matches.length!==1)throw Error('pdf_stage_unknown_chapter');return matches[0];}),chapterMap={...fullMap,chapters},required=new Map();
 for(const chapter of chapters){const source=inventory.sources.find(s=>s.sourceId===chapter.sourceId);if(!source||chapter.sourcePdfSha256!==source.sha256||!chapter.units.length)throw Error('pdf_stage_source_edition');for(const unit of chapter.units)for(let page=unit.from.page;page<=unit.to.page;page++){const item=source.pages.find(p=>p.page===page);if(!item)throw Error('pdf_stage_missing_source_page');required.set(source.sourceId+':'+page,{source,item});}}
 const pages=[];for(const {source,item}of required.values()){
  const choices=selection.pages.filter(p=>p.sourceId===source.sourceId&&p.page===item.page);if(choices.length!==1)throw Error('pdf_stage_incomplete_chapter');
  pages.push(await readApprovedPdfPage({processingRoot,source,item,selected:choices[0],verify,verifySourceFlowLayout}));
 }
 pages.sort((a,b)=>a.sourceId.localeCompare(b.sourceId)||a.page.page-b.page.page);
 const approved=await assembleApprovedPdfPages({processingRoot,inventory,chapterMap,pages,candidateOverridesSha256:hash(selectionBytes),allowOutsideChapters:true});
 const sourceLibrary=JSON.parse(await readFile(sourceLibraryPath,'utf8')),library={...sourceLibrary,status:'accepted-pdf-chapter-subset',title:'已审校 PDF 完整章节',sources:sourceLibrary.sources.filter(s=>chapters.some(c=>c.sourceId===s.id)),chapters:[]},bodies={schema:'coach-textbook-bodies/1',language:'zh-CN',modelExperiments:false,chapters:[]};
 const definitions=appendApprovedPdfChapters({approved,library,bodies});
 await mkdir(destination,{recursive:false});await mkdir(join(destination,'assets'));
 for(const image of approved.images)await copyFile(image.source,join(destination,image.path));
 for(const [name,data]of[['knowledge-index.json',library],['textbook-bodies.json',bodies],['textbook-unit-map.json',definitions]])await writeFile(join(destination,name),JSON.stringify(data,null,2)+'\n');
 const build=await compileTextbookCorpus(destination,definitions);await buildTextbookReview(destination,library);
 const owned=mapSourceBlocks(chapterMap,pages,false),outsideBlocks=pages.flatMap(p=>p.page.blocks.filter(b=>!owned.has(`${p.sourceId}:${p.page.page}:${b.id}`)).map(b=>({sourceId:p.sourceId,page:p.page.page,sourceBlockId:b.id,reason:'neighboring chapter outside explicit complete chapter boundary'})));
 const receipt={schema:'coach-approved-pdf-chapter-stage/1',status:'complete-chapter-subset-not-full-publication',recordedAt:new Date().toISOString(),sourceInventorySha256:hash(inventoryBytes),chapterMapSha256:hash(mapBytes),candidateSelectionSha256:hash(selectionBytes),chapterIds,pages:pages.map(p=>({sourceId:p.sourceId,page:p.page.page,candidatePath:p.candidatePath,candidateSha256:p.audit.production.sha256,auditStatus:p.audit.status,auditPath:p.audit.auditPath,adjudication:p.audit.adjudication,transportRecovery:p.audit.transportRecovery,sourceCorrection:p.audit.sourceCorrection,sourceFlowRepair:p.audit.sourceFlowRepair,originalModelChecks:p.audit.originalModelChecks??p.audit.modelChecks,effectiveModelChecks:p.audit.effectiveModelChecks,calls:p.audit.calls,inheritedCalls:p.audit.inheritedCalls})),outsideBlocks,...build,activeLibraryChanged:false,modelCalls:0,humanReview:'pending'};
 await writeFile(join(destination,'pdf-stage-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
