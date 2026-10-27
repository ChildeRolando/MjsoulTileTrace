import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export async function stagePdf193Supplement({processingRoot,destination,sourceLibraryPath,binding}){
assert.equal(processingRoot.replaceAll('\\','/'),'E:/AgentData/Coach/knowledge/processing');assert.equal(binding.chapterId,'79-cn-chapter-193-4-pdf193-supplement');
for(const f of [...binding.files,binding.config,binding.reuseReceipt])assert.equal(createHash('sha256').update(await readFile(f.path)).digest('hex'),f.sha256,f.path);
const config=JSON.parse(await readFile(binding.config.path,'utf8')),expected=JSON.parse(await readFile(binding.reuseReceipt.path,'utf8'));
assert.equal(expected.fullChapterPassed,false);assert.equal(expected.originalChapterCoverageIncrement,0);assert.equal(expected.parent.sha256,'046188e3be510f12c1e729353aa01fb5b1ce866685acf84e34284b8571f49e93');
const runtimeManifest=JSON.parse(await readFile(config.runtimeManifest.path,'utf8'));for(const f of runtimeManifest.files)assert.equal(createHash('sha256').update(await readFile(f.current.path)).digest('hex'),f.current.sha256);
const root=config.root,out=config.shared,sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8')),save=async(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const bind=async p=>({path:resolve(p),sha256:sha(await readFile(p))});
async function exact(b){assert.equal(sha(await readFile(b.path)),b.sha256);return load(b.path);}
const prior=config.p193,passed=prior.passedParents[0];
const parent=await exact(passed.candidate),oldAudit=await exact(passed.receipt),page=await exact(prior.pdfPageSource),webSource=await exact(prior.webSource);
const {verifyAuditForCandidate}=await import(pathToFileURL(join(config.runtime,'textbook-audit.mjs')));
const verified=await verifyAuditForCandidate(root,passed.candidate.path);assert.equal(verified.status,'passed');
assert.equal(verified.auditPath,passed.receipt.path);assert.deepEqual(verified.modelReview,oldAudit.modelReview);
const block=parent.body.blocks.find(b=>b.sourceBlockIds?.includes(prior.sourceBlockId));assert.deepEqual(block.sourceBlockIds,[prior.sourceBlockId]);
assert.equal(block.chapterId,'79-cn-chapter-193-4');assert.equal(block.unitId,'79-cn-chapter-193-4-unit-1');
assert.equal(block.text,block.sourceText);assert.equal(block.sourceText,page.blocks.find(b=>b.id===prior.sourceBlockId).lines.map(l=>l.text).join(''));
const owners=await exact(config.ownership);assert.equal(owners.blocks.find(r=>r.sourceBlockId===prior.sourceBlockId).chapterId,block.chapterId);
const parentBytes=sha(await readFile(passed.candidate.path)),webBytes=sha(await readFile(prior.webSource.path));
const slices=prior.quotes.map((q,index)=>{
 const from=block.text.indexOf(q.text);assert(from>=0);assert.equal(block.text.indexOf(q.text,from+1),-1);
 const to=from+q.text.length;assert.equal(block.text.slice(from,to),q.text);
 assert.equal(page.blocks.find(b=>b.id===prior.sourceBlockId).lines[q.lineIndex].text,q.text);
 return {id:`79-cn-p193-b6-version-sentence-${index+1}`,sourceBlockId:prior.sourceBlockId,fromCodepoint:from,toCodepoint:to,text:q.text,lineIndex:q.lineIndex,bbox:q.bbox};
});
const missing=[['b0008','b0009'],['b0015','b0016']].map((ids,i)=>{
 const blocks=ids.map(n=>webSource.blocks.find(b=>b.id.endsWith(':'+n)));assert(blocks.every(Boolean));
 const webText=blocks.map(b=>b.text).join(''),pdfText=slices[i].text.trim();assert.notEqual(webText,pdfText);
 const a=blocks[0].text,z=blocks[1].text;assert(pdfText.startsWith(a)&&pdfText.endsWith(z));
 return {webSourceBlockIds:blocks.map(b=>b.id),webText,pdfText,pdfSliceId:slices[i].id,missingInCapturedWeb:pdfText.slice(a.length,pdfText.length-z.length),operation:'separate-PDF-version-excerpt; never rewrite web source or raw'};
});
const c='79-cn-chapter-193-4-pdf193-supplement',stage=destination;await mkdir(stage,{recursive:false});
const base=await load(sourceLibraryPath);
const library={...base,status:'accepted-source-version-excerpts-not-complete-chapter',title:'PDF193补文（非完整章）',sources:base.sources.filter(s=>s.id==='79-cn'),chapters:[{id:c,title:'防守3—筋（1）：PDF193两句补文（非完整章）',sourceId:'79-cn',startPage:193,bodyStartPage:193,endPage:193,topics:[],anchors:[],relatedChapterIds:[],supplementOf:'79-cn-chapter-193-4',indexDescription:'两句仅来自已过审PDF193/b6；网页版本缺文，图b0042仍未知。本补文不计完整原章，不作完整教材论证引用。',reviewFocus:'只复用既有独审通过的PDF句子，网页整章仍未通过。'}]};
const body={schema:'coach-textbook-bodies/1',language:'zh-CN',modelExperiments:false,chapters:[{chapterId:c,sourceId:'79-cn',sourceSha256:prior.pdfSha256,translationStatus:'batch-audited-pending-user-review',translatorNote:'来源版本补文：逐字节摘录已独审通过PDF193/b6，不改网页残句、不声称网页全章通过；原完整论证/图例仍待全章门禁。',blocks:slices.map(s=>({id:s.id,type:'p',page:193,text:s.text,sourceBlockIds:[s.sourceBlockId],sourceTextSlice:{fromCodepoint:s.fromCodepoint,toCodepoint:s.toCodepoint,parentCandidateSha256:passed.candidate.sha256}}))}]};
const definitions=[{id:c+'-unit-1',chapterId:c,title:'PDF193来源对照补文（非完整章）',from:1,to:2,contentRole:'navigation'}];
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const {compileTextbookCorpus}=await import(pathToFileURL(join(repo,'scripts/scene-study/compile-textbook-corpus.mjs')));
const {buildTextbookReview}=await import(pathToFileURL(join(repo,'scripts/scene-study/textbook-review.mjs')));
for(const [name,data]of[['knowledge-index.json',library],['textbook-bodies.json',body],['textbook-unit-map.json',definitions]])await save(join(stage,name),data);
const build=await compileTextbookCorpus(stage,definitions);await buildTextbookReview(stage,library);
assert.equal(parentBytes,sha(await readFile(passed.candidate.path)));assert.equal(webBytes,sha(await readFile(prior.webSource.path)));
assert.notEqual(slices[0].id,slices[1].id);assert(slices[0].toCodepoint<=slices[1].fromCodepoint);
const receipt={schema:'coac244-passed-pdf-source-version-reuse/1',chapterId:'79-cn-chapter-193-4',status:'two-sentence-PDF-version-supplement-ready-not-chapter-pass',supplementChapterId:c,stage,sourcePdfSha256:prior.pdfSha256,sourcePage:prior.pdfPageSource,ownership:config.ownership,parent:passed.candidate,originalAudit:passed.receipt,originalAuditCallIds:verified.calls.map(c=>c.callId),originalCompleteBlock:block,slices,webSource:prior.webSource,versionDifferences:missing,remainingBlocker:{targetId:'79-bilibili-cn:cv1765377:b0042:figure',reason:'unresolved manzu in river; not resolved by recovering source prose',action:'preserve original candidate/raw/unknown and existing independent issue; only finite source-image adjudication after exact original packet'},fullChapterPassed:false,originalChapterCoverageIncrement:0,duplicateCountedAsOriginalBody:false,sourceAndRawChanged:false,newModelCalls:0,automaticRetry:0,...build};
assert.deepEqual(slices,expected.slices);assert.equal(build.corpusId,expected.corpusId);assert.equal(build.bodySha256,expected.bodySha256);assert.equal(definitions[0].contentRole,'navigation');
receipt.selectionBinding=binding;await save(join(stage,'pdf-version-stage-receipt.json'),receipt);return receipt;
}

// Bounded source+parent+slice dedupe for the two PDF193 version sentences only.
export function appendPdf193Supplement({library,bodies,definitions,stageLibrary,stageBodies,stageDefinitions,binding}){
 assert.equal(binding.chapterId,'79-cn-chapter-193-4-pdf193-supplement');assert.equal(binding.supplementOf,'79-cn-chapter-193-4');assert.equal(binding.contentRole,'navigation');
 assert.equal(createHash('sha256').update(JSON.stringify(binding.sourceIdentity)).digest('hex'),binding.dedupeKey);
 assert.equal(stageLibrary.chapters.length,1);assert.equal(stageLibrary.chapters[0].id,binding.chapterId);assert.equal(stageLibrary.chapters[0].supplementOf,binding.supplementOf);assert.equal(stageDefinitions.length,1);assert.equal(stageDefinitions[0].contentRole,'navigation');assert.equal(stageBodies.chapters[0].blocks.length,2);
 const target=stageBodies.chapters[0];assert.equal(target.sourceSha256,binding.sourceIdentity.sourcePdfSha256);
 for(const [i,b]of target.blocks.entries()){assert.deepEqual(b.sourceBlockIds,['79-cn-p193-b6']);assert.equal(b.sourceTextSlice.parentCandidateSha256,binding.sourceIdentity.parentSha256);assert.deepEqual([b.sourceTextSlice.fromCodepoint,b.sourceTextSlice.toCodepoint],binding.sourceIdentity.slices[i]);}
 const existing=bodies.chapters.find(c=>c.chapterId===binding.chapterId);
 if(existing){assert.deepEqual(existing,target);assert.deepEqual(library.chapters.find(c=>c.id===binding.chapterId),stageLibrary.chapters[0]);assert.deepEqual(definitions.find(d=>d.chapterId===binding.chapterId),stageDefinitions[0]);return {appended:false,reason:'same-source-parent-slices-already-present',dedupeKey:binding.dedupeKey};}
 const included=target.blocks.map(t=>bodies.chapters.some(c=>c.sourceId==='79-cn'&&c.sourceSha256===target.sourceSha256&&c.blocks.some(b=>b.sourceBlockIds?.includes('79-cn-p193-b6')&&b.text?.includes(t.text)&&(!b.sourceTextSlice||b.sourceTextSlice.parentCandidateSha256===binding.sourceIdentity.parentSha256))));
 if(included.every(Boolean))return {appended:false,reason:'same-parent-source-sentences-already-in-body',dedupeKey:binding.dedupeKey};assert(!included.some(Boolean),'partial PDF193 slice overlap');
 for(const source of stageLibrary.sources){const prior=library.sources.find(s=>s.id===source.id);if(prior)assert.deepEqual(prior,source);else library.sources.push(source);}
 library.chapters.push(...stageLibrary.chapters);bodies.chapters.push(...stageBodies.chapters);definitions.push(...stageDefinitions);return {appended:true,dedupeKey:binding.dedupeKey};
}
