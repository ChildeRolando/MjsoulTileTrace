import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export async function stageOwned215({processingRoot,destination,sourceLibraryPath,binding}){
assert.equal(processingRoot.replaceAll('\\','/'),'E:/AgentData/Coach/knowledge/processing');
assert.equal(binding.chapterId,'79-cn-chapter-215-4');
for(const f of binding.files)assert.equal(createHash('sha256').update(await readFile(f.path)).digest('hex'),f.sha256,f.path);
const config=JSON.parse(await readFile(binding.config.path,'utf8'));assert.equal(config.chapterId,binding.chapterId);
assert.equal(config.p217.candidate.sha256,'73410520b240c15305d220c0aa472bb0f53392255dd0167b78d8a4627aac0add');
const priorReceipt=JSON.parse(await readFile(binding.stageReceipt.path,'utf8'));
assert.equal(priorReceipt.corpusId,'82178dd9552e5f2a3f91e7441b0ef3f364f215437e309304811e221902f7ff04');
const root=config.root,out=config.shared,sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async (p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const bind=async p=>({path:resolve(p),sha256:sha(await readFile(p))});
async function exact(b){assert.equal(sha(await readFile(b.path)),b.sha256,'bound evidence changed');return load(b.path);}
const manifest=await exact(config.runtimeManifest);for(const f of manifest.files)await exact(f.current).catch(async e=>{if(sha(await readFile(f.current.path))!==f.current.sha256)throw e;});
const {verifyPdfAuditEvidence,verifyAuditForCandidate,assertPdfCandidateNotExcluded,validateReview}=await import(pathToFileURL(join(config.runtime,'textbook-audit.mjs')));
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const {readApprovedPdfPage,assembleApprovedPdfPages,appendApprovedPdfChapters,mapSourceBlocks}=await import(pathToFileURL(join(repo,'scripts/textbook-processing/publish-textbooks.mjs')));
const {compileTextbookCorpus}=await import(pathToFileURL(join(repo,'scripts/scene-study/compile-textbook-corpus.mjs')));
const {buildTextbookReview}=await import(pathToFileURL(join(repo,'scripts/scene-study/textbook-review.mjs')));
const fullMap=await exact(config.chapterMap),inventory=await exact(config.sourceInventory),owners=await exact(config.ownership);
const chapter=fullMap.chapters.find(c=>c.id===config.chapterId),chapterMap={...fullMap,chapters:[chapter]},source=inventory.sources.find(s=>s.sourceId==='79-cn');assert(chapter);
const evidence=await verifyPdfAuditEvidence(root,config.p217.candidate.path);
await assertPdfCandidateNotExcluded(root,config.p217.candidate.path,config.p217.candidate.sha256);
const original=await exact(config.p217.audit);await exact(config.p217.candidate);
assert.equal(evidence.candidateSha256,config.p217.candidate.sha256);assert.equal(evidence.receipt.auditPath,config.p217.audit.path);
assert.deepEqual(evidence.receipt.modelReview,original.modelReview);assert.equal(evidence.receipt.status,'needs-repair');
assert.deepEqual(validateReview(original.modelReview,evidence.page,evidence.candidate),original.modelChecks);
const ownedIds=config.p217.sourceBlockIds;
const scopeOwners=owners.blocks.filter(r=>r.sourceId==='79-cn'&&r.page===217&&r.chapterId===chapter.id);
assert.deepEqual(scopeOwners.map(r=>r.sourceBlockId),ownedIds);
assert.equal(owners.blocks.find(r=>r.sourceBlockId==='79-cn-p217-b8').chapterId,'79-cn-chapter-217-4');
function requireFaithfulScope(candidate,page,receipt,ids){
 assert.deepEqual(ids,['79-cn-p217-b1','79-cn-p217-b3']);
 assert.equal(receipt.modelReview.completePageCompared,true);assert.equal(receipt.modelReview.flowCheck.verdict,'faithful');
 assert(!receipt.modelReview.issues.some(i=>!i.targetId||ids.includes(i.targetId)||['page','flow','all','body'].includes(i.targetId)),'scope or unscoped issue');
 for(const id of ids){
  const s=page.blocks.find(b=>b.id===id);assert.equal(s?.type,'text');
  const bs=candidate.body.blocks.filter(b=>b.type==='text'&&b.sourceBlockIds.includes(id));
  assert.equal(bs.length,1);const b=bs[0];assert.deepEqual(b.sourceBlockIds,[id]);assert.equal(b.chapterId,config.chapterId);assert.equal(b.unitId,config.chapterId+'-unit-1');
  assert(!(b.inlineFigureIds??[]).length);assert.equal(b.sourceText,s.lines.map(l=>l.text).join(''));assert.equal(b.text,b.sourceText);
  const checks=receipt.modelReview.bodyChecks.filter(c=>c.id===id);assert.equal(checks.length,1);assert.equal(checks[0].verdict,'faithful');
 }
 assert(!candidate.figures.some(f=>f.sourceImageBlockIds.some(id=>ids.includes(id))));
}
requireFaithfulScope(evidence.candidate,evidence.page,original,ownedIds);
const scopeProof={schema:'coac244-existing-independent-audit-scope/1',chapterId:chapter.id,source:await bind(join(root,evidence.pageMeta.pageData)),ownership:config.ownership,chapterMap:config.chapterMap,parent:config.p217.candidate,originalAudit:config.p217.audit,originalPageStatus:'needs-repair',fullPagePassed:false,newModelCalls:0,sourceBlockIds:ownedIds,protectedSourceBlockIds:evidence.page.blocks.filter(b=>!ownedIds.includes(b.id)).map(b=>b.id),inheritedCalls:original.calls,scopeChecks:original.modelReview.bodyChecks.filter(c=>ownedIds.includes(c.id)),flowCheck:original.modelReview.flowCheck,scopeStatus:'faithful-existing-independent-checks-only',excludedFigure:'79-cn-p217-r1',excludedFigureOwner:'79-cn-chapter-217-4'};
assert.deepEqual(scopeProof,await load(binding.scopeProof.path));
const pages=[];
for(const num of [215,216]){
 const selected=config.selected.find(x=>x.page===num),item=source.pages.find(p=>p.page===num);
 pages.push(await readApprovedPdfPage({processingRoot:root,source,item,selected,verify:verifyAuditForCandidate}));
}
// Full immutable parent remains intact; only the existing assembler's explicit chapter ownership excludes the other chapter.
// The original needs-repair receipt is retained, never relabelled passed or written back.
pages.push({sourceId:source.sourceId,source,candidate:evidence.candidate,candidatePath:config.p217.candidate.path,page:evidence.page,audit:evidence.receipt,scopeAdmission:scopeProof});
const actualOwners=mapSourceBlocks(chapterMap,pages,false);
assert.deepEqual([...actualOwners.keys()].filter(k=>k.includes(':217:')).map(k=>k.split(':').at(-1)),ownedIds);
const approved=await assembleApprovedPdfPages({processingRoot:root,inventory,chapterMap,pages,allowOutsideChapters:true});
const baseLibrary=await load(sourceLibraryPath);
const library={...baseLibrary,status:'accepted-pdf-chapter-subset',title:'已审校 PDF 完整章节',sources:baseLibrary.sources.filter(s=>s.id==='79-cn'),chapters:[]};
const bodies={schema:'coach-textbook-bodies/1',language:'zh-CN',modelExperiments:false,chapters:[]};
const definitions=appendApprovedPdfChapters({approved,library,bodies});
const stage=destination;await mkdir(stage,{recursive:false});await mkdir(join(stage,'assets'),{recursive:true});
for(const image of approved.images)await copyFile(image.source,join(stage,image.path));
for(const [name,data]of[['knowledge-index.json',library],['textbook-bodies.json',bodies],['textbook-unit-map.json',definitions]])await save(join(stage,name),data);
const result=await compileTextbookCorpus(stage,definitions);await buildTextbookReview(stage,library);
// Lossless assembled text per original parent block, including split chunks, once and no foreign blocks.
const assembled=bodies.chapters[0].blocks;
for(const p of pages)for(const b of p.candidate.body.blocks.filter(b=>b.type==='text'&&b.text.trim()&&b.sourceBlockIds.some(id=>actualOwners.has(`${p.sourceId}:${p.page.page}:${id}`)))){
 const chunks=assembled.filter(x=>x.type!=='figure'&&x.sourceBlockIds.some(id=>b.sourceBlockIds.includes(id)));assert.equal(chunks.map(x=>x.text).join(''),b.text);
}
assert.equal(new Set(assembled.map(b=>b.id)).size,assembled.length);
assert(!assembled.some(b=>b.sourceBlockIds.some(id=>scopeProof.protectedSourceBlockIds.includes(id))));
const receipt={schema:'coac244-owned-chapter-stage/1',chapterId:chapter.id,status:'complete-owned-chapter-ready-for-incremental-integration',stage,scopeProof:binding.scopeProof,pages:pages.map(p=>({page:p.page.page,candidate:config.selected.find(x=>x.page===p.page.page)??config.p217.candidate,auditStatus:p.audit.status,auditPath:p.audit.auditPath,scopeOnly:p.page.page===217})),blocks:assembled.length,figures:assembled.filter(b=>b.type==='figure').length,sourceBlockIds:[...actualOwners.keys()],...result,modelCalls:0,fullPage217Passed:false,formalActiveChanged:false};
assert.equal(result.corpusId,priorReceipt.corpusId);assert.equal(result.bodySha256,priorReceipt.bodySha256);assert.equal(receipt.blocks,7);assert.equal(receipt.figures,0);receipt.scopeSelection=binding;await save(join(stage,'pdf-stage-receipt.json'),receipt);
return receipt;
}
