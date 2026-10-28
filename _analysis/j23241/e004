// Exact232 editorial overlay only; global MCP/Arena and accepted pointers remain250-owned.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {verify232Conditional,ROOT,PIN,CANON,sha,load} from './admit.mjs';
import {stageWebTextbook as baseStage} from './stage-base.mjs';
import {compileTextbookCorpus} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-review.mjs';
const save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n'),PREFIX='limited232-';
export function verifyDisplay(blocks,original,g){
 const notes=blocks.filter(b=>b.id.startsWith(PREFIX));assert.equal(notes.length,4);
 for(let i=0;i<4;i++){assert.equal(notes[i].id,PREFIX+(i+1));assert.equal(notes[i].text,'【审校限制（非原文）'+(i+1)+'】'+g.requiredDisplayLimitations[i]);assert.equal(notes[i].authorText,false);assert.equal(notes[i].type,'p');}
 const at=blocks.findIndex(b=>!b.id.startsWith(PREFIX)&&b.type==='figure'&&b.locator.sourceBlockIds.includes(g.anchor.afterSourceBlock));assert(at>=0);
 for(let i=0;i<4;i++)assert.equal(blocks[at+1+i].id,PREFIX+(i+1));assert(blocks[at+5].locator.sourceBlockIds.includes(g.anchor.beforeSourceBlock));
 assert.deepEqual(blocks.filter(b=>!b.id.startsWith(PREFIX)),original,'remove overlay: exact original author text/segments/marks/figures/order must remain');
 const main=blocks[at];assert(main.transcriptionText.includes('8s 9m 7z 1z 5z 4z'));assert(main.transcriptionText.includes('4p 4p 3s 4s 6s 7s 8s'));
 for(const u of g.retainedUnknowns)assert(main.transcriptionText.includes(u));assert(!main.transcriptionText.includes('右侧牌河从上数第2张为万子，但无法可靠辨认具体点数'));
 const ids=[...new Set(original.flatMap(b=>b.locator?.sourceBlockIds??[]))];assert.deepEqual(ids,Array.from({length:14},(_,i)=>'modern-yabejp-ja:chapter04-section012:b'+String(i+1).padStart(4,'0')));
}
export async function stage232Conditional(options){
 const g=await verify232Conditional(options.processingRoot,options.candidatePath),r=await baseStage({...options,verify:verify232Conditional}),dest=options.destination;
 const bodies=await load(dest+'/textbook-bodies.json'),lib=await load(dest+'/knowledge-index.json'),defs=await load(dest+'/textbook-unit-map.json'),body=bodies.chapters[0],original=structuredClone(body.blocks);
 const at=body.blocks.findIndex(b=>b.type==='figure'&&b.locator.sourceBlockIds.includes(g.anchor.afterSourceBlock));assert(at>=0);
 const notes=g.requiredDisplayLimitations.map((text,i)=>({id:PREFIX+(i+1),type:'p',page:null,locator:structuredClone(body.blocks[at].locator),text:'【审校限制（非原文）'+(i+1)+'】'+text,authorText:false}));
 body.blocks.splice(at+1,0,...notes);verifyDisplay(body.blocks,original,g);defs[0].to+=4;
 body.translatorNote='右河9m为用户明确观察，独立文字复核确认正确应用及作者论证一致；四条非原文限制逐字显示，保留两项unknown。原技术false/uncertain保留，不认证完整图像、计分或普通全章passed。';
 lib.chapters[0].reviewFocus='232人标9m、继承3s和原论证/条件，四限制位于主图后且独立标非原文；真实全局读回仍待250。';
 for(const[n,x]of [['textbook-bodies.json',bodies],['knowledge-index.json',lib],['textbook-unit-map.json',defs]])await save(dest+'/'+n,x);
 const build=await compileTextbookCorpus(dest,defs);await buildTextbookReview(dest,lib);
 const proof={schema:'coac244-exact232-installed-four-limits/1',canonical:CANON,candidate:g.candidate,receipt:g.independentReceipt,raw:g.raw,anchor:g.anchor,originalBlocks:original,originalBlocksSha256:sha(JSON.stringify(original)),notes,authorCandidateChanged:false,originalStrictVerification:g.originalStrictVerification,originalIssues:g.originalIssues,independentIssues:g.independentIssues,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,globalMcpArenaReadbackCompleted:false,newModelCalls:0};
 await save(dest+'/display-limits.json',proof);
 const baselinePath=new URL('./baseline-pin.json',import.meta.url),baseline={canonical:CANON,candidateSha256:PIN,originalBlocks:original,originalBlocksSha256:sha(JSON.stringify(original))};
 try{await writeFile(baselinePath,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await load(baselinePath),baseline);}
 const receipt={...r,...build,canonical:CANON,auditStatus:g.status,standardWholeArticlePassed:false,globalAdmissionGranted:false,modelCalls:0,displayLimits:{path:dest+'/display-limits.json',sha256:sha(await readFile(dest+'/display-limits.json'))}};await save(dest+'/web-stage-receipt.json',receipt);return receipt;
}
export async function verifyStaged(processingRoot,stagePath){
 const m=await load(new URL('./manifest.json',import.meta.url));assert(m.stageFiles.length>=10,'stage must be sealed after initial exact rendering');for(const f of m.stageFiles)assert.equal(sha(await readFile(stagePath+'/'+f.path)),f.sha256,'sealed stage changed: '+f.path);
 const g=await verify232Conditional(processingRoot,m.candidate.path),p=await load(stagePath+'/display-limits.json'),baseline=await load(new URL('./baseline-pin.json',import.meta.url)),bodies=await load(stagePath+'/textbook-bodies.json');
 assert.equal(p.candidate.sha256,PIN);assert.equal(p.canonical,CANON);assert.deepEqual(p.receipt,g.independentReceipt);assert.deepEqual(p.raw,g.raw);assert.deepEqual(p.anchor,g.anchor);assert.deepEqual(p.originalStrictVerification,g.originalStrictVerification);assert.deepEqual(p.originalBlocks,baseline.originalBlocks);assert.equal(sha(JSON.stringify(p.originalBlocks)),baseline.originalBlocksSha256);
 verifyDisplay(bodies.chapters[0].blocks,baseline.originalBlocks,g);
 const html=await readFile(stagePath+'/knowledge.html','utf8'),corpus=await readFile(stagePath+'/textbook-corpus.json','utf8');
 for(let i=0;i<4;i++){const note='【审校限制（非原文）'+(i+1)+'】'+g.requiredDisplayLimitations[i];assert(html.includes(note));assert(corpus.includes(g.requiredDisplayLimitations[i]));}
 for(const u of g.retainedUnknowns){assert(html.includes(u));assert(corpus.includes(u));}assert(html.includes('8s 9m 7z 1z 5z 4z'));assert(corpus.includes('4p 4p 3s 4s 6s 7s 8s'));
 assert.equal(p.ordinaryWholeArticlePassed,false);assert.equal(p.globalAdmissionGranted,false);assert.equal(p.globalMcpArenaReadbackCompleted,false);
 return {canonical:CANON,candidate:g.candidate,sourcePositions:14,sourceFigures:3,visibleBlocks:bodies.chapters[0].blocks.length,notes:4,editorialAnchorVerified:true,authorBodyPreserved:true,htmlAndCompiledCorpusVerified:true,technicalLimitedUnknownOkayUnchanged:false,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackCompleted:false,newModelCalls:0};
}
