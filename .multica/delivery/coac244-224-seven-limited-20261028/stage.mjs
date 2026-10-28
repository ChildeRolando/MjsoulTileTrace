import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {verifyLimited,sha} from './admit.mjs';
import {stageWebTextbook} from './stage-base.mjs';
import {compileTextbookCorpus} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-review.mjs';
const load=async p=>JSON.parse(await readFile(p)),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
export function verifyDisplay(blocks,original,g){
 const notes=blocks.filter(b=>b.id.startsWith('limited224-'));assert.equal(notes.length,10);
 const at=blocks.findIndex(b=>b.type==='figure'&&b.locator.sourceBlockIds.includes(g.anchor.beforeSourceBlockId));assert(at>=10);
 for(let i=0;i<10;i++){assert.deepEqual(blocks[at-10+i],notes[i]);assert.equal(notes[i].text,'【审校限制（非原文）'+(i+1)+'】'+g.requiredDisplayLimitations[i]);assert.equal(notes[i].authorText,false);}
 assert.deepEqual(blocks.filter(b=>!b.id.startsWith('limited224-')),original,'no author text/sourceSegments/marks/href/figure/order changes');
 const f=blocks[at];assert.equal((f.transcriptionText.match(/unknown/g)??[]).length,18);assert(f.transcriptionText.includes('约16,约16'));assert(!f.transcriptionText.includes('%'));assert(!blocks.some(b=>b.text?.includes('33.09')));
}
export async function stageLimited(options){
 const g=await verifyLimited(options.processingRoot,options.candidatePath),r=await stageWebTextbook({...options,verify:verifyLimited}),dest=options.destination;
 const bodies=await load(dest+'/textbook-bodies.json'),lib=await load(dest+'/knowledge-index.json'),defs=await load(dest+'/textbook-unit-map.json'),body=bodies.chapters[0],original=structuredClone(body.blocks);
 const at=body.blocks.findIndex(b=>b.type==='figure'&&b.locator.sourceBlockIds.includes(g.anchor.beforeSourceBlockId));assert(at>=0);
 const notes=g.requiredDisplayLimitations.map((text,i)=>({type:'p',id:'limited224-'+(i+1),page:null,locator:structuredClone(body.blocks[at].locator),text:'【审校限制（非原文）'+(i+1)+'】'+text,authorText:false}));
 body.blocks.splice(at,0,...notes);verifyDisplay(body.blocks,original,g);defs[0].to+=10;
 body.translatorNote='图前审校限制是非原文显示层。七点及其上下文独审忠实；表为88个约值与17个unknown，不认证完整精确表或所有点不可辨。保留作者条件及原source-note。';
 lib.chapters[0].reviewFocus='仅固定224七点补证＋精确未改父审继承＋十条非原文限制；不是普通全章passed。';
 for(const[n,x]of [['textbook-bodies.json',bodies],['knowledge-index.json',lib],['textbook-unit-map.json',defs]])await save(dest+'/'+n,x);
 const build=await compileTextbookCorpus(dest,defs);await buildTextbookReview(dest,lib);
 await save(dest+'/display-limits.json',{canonical:g.canonical,candidate:g.candidate,independentReceipt:g.independentReceipt,raw:g.raw,anchor:g.anchor,originalBlocks:original,originalBlocksSha256:sha(JSON.stringify(original)),notes,remainingUnknownCellIds:g.remainingUnknownCellIds,originalIssues:g.originalIssues,independentIssues:g.independentIssues,
 originalStrictVerification:g.originalStrictVerification,currentStrictVerification:g.currentStrictVerification,authorCandidateChanged:false,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,newModelCalls:0});
 const receipt={...r,...build,status:'exact224-seven-limited-preview',canonical:g.canonical,auditStatus:g.status,standardWholeArticlePassed:false,globalAdmissionGranted:false,actualMcpArenaReadback:null,newModelCalls:0,displayLimits:{path:dest+'/display-limits.json',sha256:sha(await readFile(dest+'/display-limits.json'))}};
 await save(dest+'/web-stage-receipt.json',receipt);return receipt;
}
