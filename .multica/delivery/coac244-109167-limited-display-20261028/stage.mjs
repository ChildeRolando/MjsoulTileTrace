// Exact109/167 display overlays only. No global accepted pointer writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {verifyLimited,sha} from './admit.mjs';
import {stageWebTextbook as baseStage} from './stage-base.mjs';
import {compileTextbookCorpus} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-review.mjs';
const load=async p=>JSON.parse(await readFile(p)),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
export function verifyDisplay(blocks,original,g){
 const prefix='limited'+g.key+'-',notes=blocks.filter(b=>b.id.startsWith(prefix)),n=g.requiredDisplayLimitations.length;
 assert.equal(notes.length,n);for(let i=0;i<n;i++){assert.equal(notes[i].text,'【审校限制（非原文）'+(i+1)+'】'+g.requiredDisplayLimitations[i]);assert.equal(notes[i].authorText,false);}
 const at=blocks.findIndex(b=>!b.id.startsWith(prefix)&&b.type==='figure'&&b.locator?.sourceBlockIds.includes(g.anchor.afterSourceBlockId));assert(at>=0);
 for(let i=0;i<n;i++)assert.equal(blocks[at+1+i].id,prefix+(i+1));
 assert(blocks[at+n+1].locator.sourceBlockIds.includes(g.anchor.beforeSourceBlockId));
 assert.deepEqual(blocks.filter(b=>!b.id.startsWith(prefix)),original,'author blocks/segments/marks/figures/order must remain');
}
export async function stageLimited(options){
 const g=await verifyLimited(options.processingRoot,options.candidatePath),r=await baseStage({...options,verify:verifyLimited}),dest=options.destination;
 const bodies=await load(dest+'/textbook-bodies.json'),lib=await load(dest+'/knowledge-index.json'),defs=await load(dest+'/textbook-unit-map.json'),body=bodies.chapters[0],original=structuredClone(body.blocks);
 const at=body.blocks.findIndex(b=>b.type==='figure'&&b.locator.sourceBlockIds.includes(g.anchor.afterSourceBlockId));assert(at>=0);
 const notes=g.requiredDisplayLimitations.map((text,i)=>({type:'p',id:'limited'+g.key+'-'+(i+1),page:null,locator:structuredClone(body.blocks[at].locator),text:'【审校限制（非原文）'+(i+1)+'】'+text,authorText:false}));
 body.blocks.splice(at+1,0,...notes);verifyDisplay(body.blocks,original,g);defs[0].to+=notes.length;
 body.translatorNote='本章目标图修订已独审确认。图后审校限制为非原文显示层；保留未知及作者条件论述，不认证完整逐牌转录、安全度、概率或最优性。原uncertain与技术false保留。';
 lib.chapters[0].reviewFocus='固定'+g.canonical+'、原图、未知原串、全部非原文限制与原作者条件；不是普通全章passed。';
 for(const[n,x]of [['textbook-bodies.json',bodies],['knowledge-index.json',lib],['textbook-unit-map.json',defs]])await save(dest+'/'+n,x);
 const build=await compileTextbookCorpus(dest,defs);await buildTextbookReview(dest,lib);
 const proof={canonical:g.canonical,candidate:g.candidate,independentReceipt:g.independentReceipt,raw:g.raw,anchor:g.anchor,
  originalBlocks:original,originalBlocksSha256:sha(JSON.stringify(original)),notes,originalIssues:g.originalIssues,independentIssues:g.independentIssues,
  originalStrictVerification:g.originalStrictVerification,authorCandidateChanged:false,ordinaryWholeArticlePassed:false,newModelCalls:0};
 await save(dest+'/display-limits.json',proof);
 const receipt={...r,...build,canonical:g.canonical,auditStatus:g.status,standardWholeArticlePassed:false,globalAdmissionGranted:false,modelCalls:0,
  displayLimits:{path:dest+'/display-limits.json',sha256:sha(await readFile(dest+'/display-limits.json'))}};
 await save(dest+'/web-stage-receipt.json',receipt);return receipt;
}
