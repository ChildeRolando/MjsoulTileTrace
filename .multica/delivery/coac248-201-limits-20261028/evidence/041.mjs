// Isolated exact201 stage only; never writes the global accepted pointer or active library.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verify201Limited,exact201} from './admit201.mjs';
import {stageWebTextbook as baseStage} from './stage-base201.mjs';
import {compileTextbookCorpus} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-review.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p)),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
export function verify201Display(blocks,original,gate){
 const notes=blocks.filter(b=>b.id.startsWith('limited201-'));assert.equal(notes.length,5);
 for(let i=0;i<5;i++){assert.equal(notes[i].text,'【审校限制（非原文）'+(i+1)+'】'+gate.requiredDisplayLimitations[i]);assert.equal(notes[i].authorText,false);}
 const at=blocks.findIndex(b=>b.locator?.sourceBlockIds?.includes('79-bilibili-cn:cv1770179:b0005')&&!b.id.startsWith('limited201-'));assert(at>=0&&blocks[at].type==='figure');
 for(let i=0;i<5;i++)assert.equal(blocks[at+1+i].id,'limited201-'+(i+1));
 assert(blocks[at+6].locator.sourceBlockIds.includes('79-bilibili-cn:cv1770179:b0006'));
 assert.deepEqual(blocks.filter(b=>!b.id.startsWith('limited201-')),original,'all original author text/segments/conditions/images/order preserved');
}
export async function stage201Limited(options){
 const gate=await verify201Limited(options.processingRoot,options.candidatePath);
 const r=await baseStage({...options,verify:verify201Limited}),dest=options.destination;
 const bodies=await load(dest+'/textbook-bodies.json'),lib=await load(dest+'/knowledge-index.json'),defs=await load(dest+'/textbook-unit-map.json');
 const body=bodies.chapters[0],original=structuredClone(body.blocks),at=body.blocks.findIndex(b=>b.type==='figure'&&b.locator.sourceBlockIds.includes('79-bilibili-cn:cv1770179:b0005'));assert(at>=0);
 const notes=gate.requiredDisplayLimitations.map((text,i)=>({type:'p',id:'limited201-'+(i+1),page:null,locator:structuredClone(body.blocks[at].locator),text:'【审校限制（非原文）'+(i+1)+'】'+text,authorText:false}));
 body.blocks.splice(at+1,0,...notes);verify201Display(body.blocks,original,gate);defs[0].to+=5;
 body.translatorNote='未知万子保留?m；五条独立审校限制为非原文显示层。仅忠实呈现作者弃和建议与条件，不认证完整牌谱或具体安全关系；原uncertain及旧源文字不改。';
 lib.chapters[0].reviewFocus='201完整7来源块与原图，新增释义忠实；五条非原文限制锚定目标图，unknown及作者条件不变。';
 for(const[n,x]of [['textbook-bodies.json',bodies],['knowledge-index.json',lib],['textbook-unit-map.json',defs]])await save(dest+'/'+n,x);
 const build=await compileTextbookCorpus(dest,defs);await buildTextbookReview(dest,lib);
 const proof={schema:'coac244-201-installed-display-proof/1',canonical:exact201.canonical,candidate:gate.candidate,independentReceipt:gate.independentReceipt,raw:gate.raw,
  originalBlocks:original,originalBlocksSha256:sha(JSON.stringify(original)),notes,anchor:{afterSourceBlockId:'79-bilibili-cn:cv1770179:b0005',beforeSourceBlockId:'79-bilibili-cn:cv1770179:b0006'},
  authorCandidateChanged:false,originalIssues:gate.originalIssues,independentIssues:gate.independentIssues,ordinaryWholeArticlePassed:false,newModelCalls:0};
 await save(dest+'/display-limits.json',proof);
 const receipt={...r,...build,canonical:gate.canonical,auditStatus:gate.status,standardWholeArticlePassed:false,
  displayLimits:{path:dest+'/display-limits.json',sha256:sha(await readFile(dest+'/display-limits.json'))},modelCalls:0};
 await save(dest+'/web-stage-receipt.json',receipt);return receipt;
}
