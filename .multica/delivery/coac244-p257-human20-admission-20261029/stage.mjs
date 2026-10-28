import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyLimited,ROOT,CANON,PIN,sha,load} from './admit.mjs';
import {readApprovedPdfPage,mapSourceBlocks} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/publish-textbooks.mjs';
import {assembleApprovedPdfPages,appendApprovedPdfChapters} from './assembly.mjs';
import {compileTextbookCorpus} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-review.mjs';
const FID='nemata-jp-p257-r1',save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
export const htmlText=s=>s.replace(/<[^>]*>/g,'').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const unknownSuffix=c=>'\n保留未知（沿原审继承，不推断暗手或鸣牌来源）：'+c.figures[0].unknowns.join('；');
export function expectedNotes(g,links){return g.requiredDisplayLimitations.map((text,i)=>{
 const shown='【审校限制（非原文）'+(i+1)+'/6】'+text,note={id:'p257-human20-limit-'+(i+1),type:'p',page:257,text:shown,sourceBlockIds:[],authorText:false};
 if(i===4){const segments=[];let at=0;for(const link of links){const pos=shown.indexOf(link.sourceBlockId);assert(pos>=at);if(pos>at)segments.push({text:shown.slice(at,pos)});segments.push({text:link.sourceBlockId,href:link.relativePath});at=pos+link.sourceBlockId.length;}if(at<shown.length)segments.push({text:shown.slice(at)});note.displaySegments=segments;}
 return note;
});}
export function verifyDisplay(blocks,original,g,c,links){
 const notes=expectedNotes(g,links),at=blocks.findIndex(b=>b.id===FID);assert(at>=0);assert.equal(blocks.filter(b=>b.id.startsWith('p257-human20-limit-')).length,6);
 for(let i=0;i<6;i++)assert.deepEqual(blocks[at+1+i],notes[i],'missing/changed/moved limit');
 const recovered=structuredClone(blocks.filter(b=>!b.id.startsWith('p257-human20-limit-'))),f=recovered.find(b=>b.id===FID);assert.equal(f.transcriptionText,c.figures[0].transcription+unknownSuffix(c));f.transcriptionText=c.figures[0].transcription;
 assert.deepEqual(recovered,original,'author/figure/body/source/order changed');
 assert(blocks[at+7].sourceBlockIds.includes('nemata-jp-p257-b5'),'limits must appear before Q10');
}
export async function stageLimited({processingRoot,candidatePath,destination,sourceLibraryPath}){
 const manifest=await load(new URL('./manifest.json',import.meta.url));candidatePath??=(await load(manifest.receipt.path)).candidate.path;
 const g=await verifyLimited(processingRoot,candidatePath),c=await load(candidatePath),inventory=await load(g.inventory.path),full=await load(g.chapterMap.path),chapter=structuredClone(full.chapters.find(x=>x.id===CANON));assert(chapter);
 const chapterMap={...full,chapters:[chapter]},source=inventory.sources.find(x=>x.sourceId==='nemata-jp');assert.equal(source.sha256,c.source.pdfSha256);assert.equal(full.inventorySha256,sha(await readFile(g.inventory.path)));
 const standard=await import(pathToFileURL(g.standardModule.path)),selected=[{page:257,candidate:g.candidate},{page:261,candidate:g.source261},...g.reuse].sort((a,b)=>a.page-b.page),pages=[];
 assert.deepEqual(selected.map(x=>x.page),Array.from({length:13},(_,i)=>250+i));
 for(const row of selected){const item=source.pages.find(x=>x.page===row.page);assert.equal(sha(await readFile(row.candidate.path)),row.candidate.sha256);let p;
  if(row.page===257){const bytes=await readFile(join(ROOT,item.pageData));assert.equal(sha(bytes),g.source.sha256);p={sourceId:'nemata-jp',source,candidate:c,candidatePath:row.candidate.path,page:JSON.parse(bytes),audit:g};}
  else{p=await readApprovedPdfPage({processingRoot:ROOT,source,item,selected:{candidatePath:row.candidate.path,candidateSha256:row.candidate.sha256},verify:standard.verifyAuditForCandidate});assert.equal(p.audit.status,row.page===261?'passed-after-source-adjudication':'passed');}
  pages.push(p);
 }
 const ownership=mapSourceBlocks(chapterMap,pages,false),approved=await assembleApprovedPdfPages({processingRoot:ROOT,inventory,chapterMap,pages,allowOutsideChapters:true});
 const origin=await load(sourceLibraryPath??g.sourceLibrary.path),library={...origin,status:'accepted-pdf-chapter-subset',sources:origin.sources.filter(s=>s.id==='nemata-jp'),chapters:[]},bodies={schema:'coach-textbook-bodies/1',language:'zh-CN',modelExperiments:false,chapters:[]};
 const definitions=appendApprovedPdfChapters({approved,library,bodies});assert.equal(definitions.length,1);const body=bodies.chapters[0],original=structuredClone(body.blocks),at=body.blocks.findIndex(b=>b.id===FID);assert(at>=0);
 // Preserve the actual source screenshots as accessible links, separately from the composed crop.
 const page=pages.find(x=>x.page.page===257).page,links=page.blocks.filter(b=>['nemata-jp-p257-b3','nemata-jp-p257-b4'].includes(b.id)).map(b=>({sourceBlockId:b.id,sourcePath:join(ROOT,b.asset),sha256:b.imageSha256,relativePath:'source-assets/'+b.imageSha256+'.png'}));assert.equal(links.length,2);
 body.blocks[at].transcriptionText+=unknownSuffix(c);body.blocks.splice(at+1,0,...expectedNotes(g,links));definitions[0].to+=6;verifyDisplay(body.blocks,original,g,c,links);
 body.translatorNote='作者原文与原图保留；257人标的确定性应用和Q9文字论证经原独立文字审确认，实际未新看图。六条非原文限制同时展示；上河15旧6p未复核，完整合法牌谱未认证，原uncertain及历史保留。261沿既有3m裁决，其余11页837源块复用父审。';library.chapters[0].reviewFocus='完整Q9及Q10与全章源映射，精确人标应用＋既有独审继承＋六条显示限制；不是普通整页/整章模型passed。';
 await mkdir(destination,{recursive:false});await mkdir(join(destination,'assets'));await mkdir(join(destination,'source-assets'));
 for(const image of approved.images){const b=await readFile(image.source);assert.equal(sha(b),image.sha256);await copyFile(image.source,join(destination,image.path));}
 for(const link of links){assert.equal(sha(await readFile(link.sourcePath)),link.sha256);await copyFile(link.sourcePath,join(destination,link.relativePath));}
 for(const[n,x]of [['knowledge-index.json',library],['textbook-bodies.json',bodies],['textbook-unit-map.json',definitions]])await save(join(destination,n),x);
 const built=await compileTextbookCorpus(destination,definitions);await buildTextbookReview(destination,library);await installOriginalImageLinks({processingRoot:ROOT,directory:destination});
 const mapping=[...ownership.entries()].map(([key,v])=>({key,unitId:v.unit.id,sourceBlockId:key.split(':').at(-1),displayBlockIds:original.filter(b=>(b.sourceBlockIds??[]).includes(key.split(':').at(-1))).map(b=>b.id)}));
 const outsideBlocks=pages.flatMap(p=>p.page.blocks.filter(b=>!ownership.has(`${p.sourceId}:${p.page.page}:${b.id}`)).map(b=>({sourceId:p.sourceId,page:p.page.page,sourceBlockId:b.id,reason:'neighboring chapter outside canonical boundary'})));
 await save(destination+'/display-limits.json',{canonical:CANON,candidate:g.candidate,source:g.source,parent:g.parent,independentReceipt:g.independentReceipt,raw:g.raw,originalModelIssues:g.originalModelIssues,recovery:g.recovery,originalBlocks:original,originalBlocksSha256:sha(JSON.stringify(original)),notes:expectedNotes(g,links),links,sourceMapping:mapping,outsideBlocks,
  pages:pages.map(p=>({page:p.page.page,candidatePath:p.candidatePath,status:p.audit.status,sourceBlocks:p.page.blocks.length})),originalUncertainRetained:true,unknowns:c.figures[0].unknowns,ordinaryWholePagePassed:false,wholeChapterPassed:false,globalAdmissionGranted:false,actualMcpArenaReadback:null,newModelCalls:0});
 const receipt={schema:'coac244-exact-p257-human20-canonical-stage/1',status:'complete-canonical-with-conditional-human20-display',chapterId:CANON,candidate:g.candidate,auditStatus:g.status,
  independentReceipt:g.independentReceipt,pages:pages.map(p=>({sourceId:p.sourceId,page:p.page.page,candidatePath:p.candidatePath,candidateSha256:sha(JSON.stringify(p.candidate)),originalAuditStatus:p.audit.status})),outsideBlocks,
  sourceBlocksOwned:ownership.size,reusedOther11PageBlocks:837,reused261:g.source261,mandatoryDisplayConditions:6,sourceMapping:destination+'/display-limits.json',...built,
  ordinaryWholePagePassed:false,wholeChapterPassed:false,globalAdmissionGranted:false,activeLibraryChanged:false,newModelCalls:0};
 await save(destination+'/pdf-stage-receipt.json',receipt);await verifyStage(ROOT,candidatePath,destination);return receipt;
}
export async function stageOwnedHuman257(options){const m=await load(new URL('./manifest.json',import.meta.url));if(options.binding){assert.equal(options.binding.chapterId,CANON);if(options.binding.candidate)assert.equal(options.binding.candidate.sha256,PIN);}return stageLimited({...options,candidatePath:options.candidatePath??(await load(m.receipt.path)).candidate.path});}
// Call after the existing renderer on a new stage or rebuilt global preview. Does not modify author text.
export async function installOriginalImageLinks({processingRoot,directory}){
 assert.equal(resolve(processingRoot),resolve(ROOT));const m=await load(new URL('./manifest.json',import.meta.url)),r=await load(m.receipt.path);assert.equal(sha(await readFile(r.source.path)),r.source.sha256);
 const source=await load(r.source.path),links=source.blocks.filter(b=>['nemata-jp-p257-b3','nemata-jp-p257-b4'].includes(b.id)).map(b=>({sourceBlockId:b.id,sourcePath:join(ROOT,b.asset),relativePath:'source-assets/'+b.imageSha256+'.png',sha256:b.imageSha256}));assert.equal(links.length,2);
 await mkdir(join(directory,'source-assets'),{recursive:true});let html=await readFile(directory+'/knowledge.html','utf8');const matcher=/<p id="p257-human20-limit-5"[^>]*>[\s\S]*?<\/p>/g,matches=html.match(matcher);assert.equal(matches?.length,1,'exact257 display link anchor');let note=matches[0];
 for(const link of links){assert.equal(sha(await readFile(link.sourcePath)),link.sha256);try{assert.equal(sha(await readFile(join(directory,link.relativePath))),link.sha256);}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(link.sourcePath,join(directory,link.relativePath));}if(!note.includes('href="'+link.relativePath+'"')){assert.equal(note.split(link.sourceBlockId).length,2);note=note.replace(link.sourceBlockId,'<a href="'+link.relativePath+'" target="_blank" rel="noopener">'+link.sourceBlockId+'</a>');}}
 html=html.replace(matches[0],note);await writeFile(directory+'/knowledge.html',html);return {originalScreenshotLinks:links,authorTextChanged:false};
}
export async function verifyStage(root,candidatePath,dest){
 assert.equal(resolve(root),resolve(ROOT));const g=await verifyLimited(root,candidatePath),c=await load(candidatePath),d=await load(dest+'/display-limits.json'),bodies=await load(dest+'/textbook-bodies.json'),corpus=await load(dest+'/textbook-corpus.json'),html=await readFile(dest+'/knowledge.html','utf8');
 assert.equal(d.candidate.sha256,PIN);assert.equal(d.canonical,CANON);assert.equal(sha(JSON.stringify(d.originalBlocks)),d.originalBlocksSha256);assert.deepEqual(d.originalModelIssues,g.originalModelIssues);assert.deepEqual(d.unknowns,c.figures[0].unknowns);assert.deepEqual(d.recovery,g.recovery);
 verifyDisplay(bodies.chapters[0].blocks,d.originalBlocks,g,c,d.links);assert.equal(corpus.units.length,1);assert.equal(corpus.units[0].unitId,CANON+'-unit-1');
 for(const n of d.notes){assert(htmlText(html).includes(n.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(n.text)));}
 for(const u of c.figures[0].unknowns){assert(html.includes(u));assert(JSON.stringify(corpus).includes(u));}
 for(const link of d.links){assert.equal(sha(await readFile(dest+'/'+link.relativePath)),link.sha256);assert(html.includes('href="'+link.relativePath+'"'));}
 for(const image of corpus.images)assert.equal(sha(await readFile(dest+'/'+image.path)),image.sha256);
 const shown=new Set(d.originalBlocks.flatMap(b=>[...(b.sourceBlockIds??[]),...(b.inlineFigures??[]).flatMap(f=>f.sourceBlockIds??[])]));assert(d.sourceMapping.every(x=>shown.has(x.sourceBlockId)), 'owned source position missing');
 assert.equal(d.pages.length,13);assert.equal(d.pages.filter(x=>x.page!==257&&x.page!==261).reduce((n,x)=>n+x.sourceBlocks,0),837);assert.equal(d.pages.find(x=>x.page===261).status,'passed-after-source-adjudication');
 return {status:'verified-exact-p257-human20-canonical-stage',canonical:CANON,sourceBlocksOwned:d.sourceMapping.length,displayBlocks:bodies.chapters[0].blocks.length,figures:corpus.images.length,mandatoryDisplayConditions:6,originalUncertainRetained:true,
  isolatedDisplayVerified:true,ordinaryWholePagePassed:false,wholeChapterPassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newModelCalls:0};
}
