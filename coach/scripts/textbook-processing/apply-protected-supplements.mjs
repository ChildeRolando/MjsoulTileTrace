import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {compileTextbookCorpus} from '../scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from '../scene-study/textbook-review.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const load=async path=>JSON.parse(await readFile(path,'utf8'));
const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const safeId=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const domPaths=block=>block?.domPath?[block.domPath]:[];

async function contained(root,path){
 const base=resolve(root),full=resolve(base,path),rel=relative(base,full);
 if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('protected_supplement_path_outside_root');
 return full;
}

async function atomicJson(path,value){
 const temp=path+'.tmp-'+process.pid;
 await writeFile(temp,JSON.stringify(value,null,2)+'\n');
 await rename(temp,path);
}

function expectedSupplement({candidate,source,parentChapterId,sourceId,chapterId}){
 const byId=new Map(source.blocks.map(block=>[block.id,block]));
 const blocks=[];
 for(const [index,translation] of candidate.translations.entries()){
  const sourceBlock=byId.get(translation.sourceBlockId);
  const paths=domPaths(sourceBlock);
  blocks.push({
   type:'p',id:`${chapterId}-b${String(index+1).padStart(3,'0')}`,page:null,
   locator:{url:source.url,sourceBlockIds:[translation.sourceBlockId],...(paths.length?{domPaths:paths}:{})},
   text:translation.text
  });
 }
 const chapter={
  id:chapterId,
  title:'补充对照：副露手役的构想（网页版，不计原章）',
  sourceId,
  startPage:null,bodyStartPage:null,endPage:null,
  topics:[],
  indexDescription:'网页版同节补充：按网页源块顺序保留中文对照；完整合并译文与牌例仍在 PDF 父章。不替换父章，也不计入原章覆盖。',
  anchors:[],relatedChapterIds:[parentChapterId],supplementOf:parentChapterId,
  reviewFocus:'仅作网页版来源/块序对照，不并入 PDF 父章；不以相同源块覆盖父稿。'
 };
 const body={
  chapterId,sourceId,sourceSha256:source.html.sha256,
  translationStatus:'batch-audited-pending-user-review',
  translatorNote:'受保护补充稿：中文按已独立语义通过的网页候选逐源块保留，仅作版本与来源对照；PDF 父章完整译文、牌图和判断保持不变，本单元不重复计为原章正文。自动校对不等于用户审核。',
  blocks
 };
 const definition={id:`${chapterId}-unit-1`,chapterId,title:'网页版逐块对照（补充；完整合并译文见 PDF 父章）',from:1,to:blocks.length,contentRole:'navigation'};
 return {chapter,body,definition,blocks};
}

/**
 * Append one independently passed protected-web supplement to an already staged PDF chapter.
 * The PDF parent stays byte-identical; the supplement becomes a sibling web chapter linked by
 * relatedChapterIds/supplementOf, so source identity and block order stay honest.
 */
export async function applyProtectedSupplement({processingRoot,destination,candidatePath,auditPath,parentChapterId}){
 if(!parentChapterId)throw Error('protected_supplement_parent_chapter_required');
 const root=resolve(processingRoot),stage=resolve(destination);
 const candidateFile=await contained(root,candidatePath),auditFile=await contained(root,auditPath);
 let auditBytes;
 try{auditBytes=await readFile(auditFile);}catch(error){if(error.code==='ENOENT')throw Error('protected_supplement_audit_missing');throw error;}
 let audit;try{audit=JSON.parse(auditBytes);}catch{throw Error('protected_supplement_audit_invalid');}
 const candidateBytes=await readFile(candidateFile),candidate=JSON.parse(candidateBytes),candidateSha256=sha(candidateBytes),auditSha256=sha(auditBytes);
 if(audit.schema!=='coach-protected-supplement-semantic-audit/1')throw Error('protected_supplement_audit_schema');
 if(audit.status!=='passed')throw Error('protected_supplement_not_passed');
 if(audit.candidateSha256!==candidateSha256||audit.sourceSha256!==candidate.sourceSha256)throw Error('protected_supplement_audit_identity');
 if(!isHash(audit.parent?.sha256)||!audit.parent?.path)throw Error('protected_supplement_parent_identity');
 for(const parentAudit of audit.parent.audits??[])if(parentAudit.status!=='passed')throw Error('protected_supplement_parent_audit_not_passed');
 if(candidate.schema!=='coach-protected-web-supplement-draft/1')throw Error('protected_supplement_candidate_schema');
 if(!Array.isArray(candidate.targetTextBlockIds)||!candidate.targetTextBlockIds.length)throw Error('protected_supplement_targets_missing');
 if(new Set(candidate.targetTextBlockIds).size!==candidate.targetTextBlockIds.length)throw Error('protected_supplement_duplicate_target');
 if((candidate.targetFigureBlockIds??[]).length||(candidate.figures??[]).length)throw Error('protected_supplement_figures_not_supported');
 if(!Array.isArray(candidate.translations)||candidate.translations.length!==candidate.targetTextBlockIds.length)throw Error('protected_supplement_translation_scope');
 if(candidate.translations.some(item=>!candidate.targetTextBlockIds.includes(item.sourceBlockId)||typeof item.text!=='string'||!item.text.trim()))throw Error('protected_supplement_translation_invalid');
 if(JSON.stringify(candidate.translations.map(item=>item.sourceBlockId))!==JSON.stringify(candidate.targetTextBlockIds))throw Error('protected_supplement_order');
 const sourceFile=await contained(root,candidate.sourcePath),sourceBytes=await readFile(sourceFile);
 if(sha(sourceBytes)!==candidate.sourceSha256)throw Error('protected_supplement_source_changed');
 const source=JSON.parse(sourceBytes);
 if(!source.html?.sha256||!isHash(source.html.sha256)||!source.url||!source.articleId)throw Error('protected_supplement_source_identity');
 const sourceBlocks=new Map(source.blocks.map(block=>[block.id,block]));
 if(candidate.targetTextBlockIds.some(id=>!sourceBlocks.has(id)))throw Error('protected_supplement_source_block_missing');
 const parentBytes=await readFile(await contained(root,audit.parent.path));
 if(sha(parentBytes)!==audit.parent.sha256)throw Error('protected_supplement_parent_changed');

 const library=await load(join(stage,'knowledge-index.json')),bodies=await load(join(stage,'textbook-bodies.json')),definitions=await load(join(stage,'textbook-unit-map.json')),stageReceipt=await load(join(stage,'pdf-stage-receipt.json'));
 const parentChapter=library.chapters.find(chapter=>chapter.id===parentChapterId),parentBody=bodies.chapters.find(chapter=>chapter.chapterId===parentChapterId);
 if(!parentChapter||!parentBody)throw Error('protected_supplement_parent_stage_missing');
 const parentPages=(stageReceipt.pages??[]).filter(page=>page.candidateSha256===audit.parent.sha256);
 if(parentPages.length!==1||!Number.isInteger(parentPages[0].page))throw Error('protected_supplement_parent_stage_identity');
 const parentPage=parentPages[0].page;
 if(parentPage<parentChapter.startPage||parentPage>parentChapter.endPage)throw Error('protected_supplement_parent_page_outside_chapter');
 const parentBlocksBefore=JSON.stringify(parentBody.blocks);

 const sourceId=safeId(`${candidate.sourceId}-supplement-${candidate.articleId}`),chapterId=safeId(`${candidate.sourceId}-${candidate.articleId}-supplement`);
 if(sourceId.length>96||chapterId.length>90)throw Error('protected_supplement_identity_too_long');
 if(chapterId===parentChapterId)throw Error('protected_supplement_parent_identity');
 const expected=expectedSupplement({candidate,source,parentChapterId,sourceId,chapterId});
 const existingChapter=library.chapters.find(chapter=>chapter.id===chapterId),existingBody=bodies.chapters.find(chapter=>chapter.chapterId===chapterId),existingDefinition=definitions.find(definition=>definition.id===expected.definition.id);
 if(existingChapter||existingBody||existingDefinition){
  if(JSON.stringify(existingChapter)!==JSON.stringify(expected.chapter)||JSON.stringify(existingBody)!==JSON.stringify(expected.body)||JSON.stringify(existingDefinition)!==JSON.stringify(expected.definition))throw Error('protected_supplement_existing_mismatch');
  return {schema:'coach-protected-supplement-stage/1',status:'already-applied',duplicate:true,articleId:candidate.articleId,parentChapterId,supplementChapterId:chapterId,parentBlockCount:parentBody.blocks.length,supplementBlockCount:expected.blocks.length,auditPath:auditFile,auditSha256,candidateSha256,modelCalls:0};
 }

 const sourceEntry={id:sourceId,title:`网页版补充：${source.title}`,format:'web',language:source.language,url:source.url,articleId:source.articleId,sha256:source.html.sha256,htmlSha256:source.html.sha256,bytes:source.html.bytes,sourceJsonSha256:sha(sourceBytes),sourcePath:candidate.sourcePath};
 const priorSource=library.sources.find(item=>item.id===sourceId);
 if(priorSource&&JSON.stringify(priorSource)!==JSON.stringify(sourceEntry))throw Error('protected_supplement_source_edition_conflict');
 if(!priorSource)library.sources.push(sourceEntry);
 library.chapters.push(expected.chapter);
 bodies.chapters.push(expected.body);
 definitions.push(expected.definition);
 if(JSON.stringify(parentBody.blocks)!==parentBlocksBefore)throw Error('protected_supplement_parent_mutated');
 const globalBlockIds=new Set(bodies.chapters.flatMap(chapter=>chapter.blocks.map(block=>block.id)));
 if(globalBlockIds.size!==bodies.chapters.reduce((count,chapter)=>count+chapter.blocks.length,0))throw Error('protected_supplement_duplicate_body_block');
 const represented=candidate.targetTextBlockIds.filter(id=>expected.blocks.filter(block=>block.locator.sourceBlockIds.includes(id)).length===1);
 if(represented.length!==candidate.targetTextBlockIds.length)throw Error('protected_supplement_target_count');

 await atomicJson(join(stage,'knowledge-index.json'),library);
 await atomicJson(join(stage,'textbook-bodies.json'),bodies);
 await atomicJson(join(stage,'textbook-unit-map.json'),definitions);
 const build=await compileTextbookCorpus(stage,definitions);
 await buildTextbookReview(stage,library);
 const receipt={
  schema:'coach-protected-supplement-stage/1',status:'passed-supplement-stage',recordedAt:new Date().toISOString(),
  articleId:candidate.articleId,parentChapterId,supplementChapterId:chapterId,supplementUnitId:expected.definition.id,
  source:{sourceId,articleId:source.articleId,url:source.url,htmlSha256:source.html.sha256,sourceJsonSha256:sha(sourceBytes),sourcePath:candidate.sourcePath},
  candidate:{path:candidateFile,sha256:candidateSha256},
  audit:{path:auditFile,sha256:auditSha256,status:audit.status,verification:audit.verification,semanticCompleteness:audit.semanticCompleteness},
  parent:{chapterId:parentChapterId,page:parentPage,pageCandidateSha256:audit.parent.sha256,blockCount:parentBody.blocks.length,preserved:true},
  supplement:{blockCount:expected.blocks.length,targetTextBlockIds:candidate.targetTextBlockIds,translationCount:candidate.translations.length,figureCount:0,contentRole:'navigation',relatedChapterIds:expected.chapter.relatedChapterIds,supplementOf:parentChapterId},
  bodyAccounting:{parentBlockCountBefore:parentBody.blocks.length,parentBlockCountAfter:parentBody.blocks.length,supplementBlockCount:expected.blocks.length,targetBlocksRepresented:represented.length,duplicateTargetBlocks:0,countedAsOriginalChapter:false},
  ...build,modelCalls:0
 };
 await atomicJson(join(stage,'protected-supplement-stage-receipt.json'),receipt);
 return receipt;
}
