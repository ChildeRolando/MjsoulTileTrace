import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {verifyLimited,sha,BASE,CANON} from './admit.mjs';
import {stageWebTextbook} from './stage-base.mjs';
import {compileTextbookCorpus} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/compile-textbook-corpus.mjs';
import {buildTextbookReview} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-review.mjs';
const load=async p=>JSON.parse(await readFile(p)),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
export function expectedNotes(g,original){
 const notes=[];
 const add=(id,text,afterSourceBlockId,relatedSourceBlockIds)=>{const f=original.find(b=>b.type==='figure'&&b.locator.sourceBlockIds.includes(afterSourceBlockId));assert(f,'note anchor missing');notes.push({type:'p',id,page:null,locator:structuredClone(f.locator),text,authorText:false,afterSourceBlockId,relatedSourceBlockIds});};
 for(const [i,n] of g.existingNotes.entries())add('limited311-original-'+(i+1),n.text,n.afterSourceBlockId,[n.afterSourceBlockId]);
 for(const [i,c] of g.mandatoryDisplayConditions.entries()){const anchor=c.figureId===CANON?BASE+'b0122':c.figureId.replace(/:figure$/,'');add('limited311-required-'+(i+1),c.conditionText,anchor,c.sourceBlockIds);}
 return notes;
}
export function verifyDisplay(blocks,original,g){
 const notes=expectedNotes(g,original),actual=blocks.filter(b=>b.id.startsWith('limited311-'));
 assert.equal(actual.length,18);assert.deepEqual(blocks.filter(b=>!b.id.startsWith('limited311-')),original,'author body/figure/unknown/order changed');
 assert.deepEqual(actual.map(x=>x.id).sort(),notes.map(x=>x.id).sort());
 for(const note of notes){assert.deepEqual(actual.find(x=>x.id===note.id),note);const at=blocks.findIndex(b=>b.type==='figure'&&b.locator.sourceBlockIds.includes(note.afterSourceBlockId));const ni=blocks.findIndex(b=>b.id===note.id);assert(ni>at);assert(blocks.slice(at+1,ni).every(b=>b.id.startsWith('limited311-')),'note is not adjacent to its figure');}
 assert(!JSON.stringify(blocks).includes('审校补录（非原文，按原图读取的约值；unknown不插值）'));
 assert.equal(blocks.filter(b=>b.type==='figure').length,21);
}
export async function verifyStage(root,candidatePath,dest){
 const g=await verifyLimited(root,candidatePath),p=await load(candidatePath),d=await load(dest+'/display-limits.json'),b=await load(dest+'/textbook-bodies.json'),corpus=await load(dest+'/textbook-corpus.json');
 const html=await readFile(dest+'/knowledge.html','utf8'),blocks=b.chapters[0].blocks,original=d.originalBlocks;
 assert.equal(original.length,225);assert.equal(sha(JSON.stringify(original)),d.originalBlocksSha256);assert.deepEqual(d.candidate,g.candidate);assert.deepEqual(d.originalStrictVerification,g.originalStrictVerification);assert.deepEqual(d.oldStrictVerification,g.oldStrictVerification);
 verifyDisplay(blocks,original,g);assert.deepEqual(d.notes,expectedNotes(g,original));
 assert.equal(corpus.images.length,21);assert.equal(corpus.units.flatMap(u=>u.blocks).length,243);
 for(let i=0;i<225;i++){const b=original[i],a=p.body.blocks[i];assert.deepEqual(b.locator.sourceBlockIds,a.sourceBlockIds);if(a.type==='text'){assert.equal(b.text,a.text);assert.deepEqual(b.sourceSegments,a.sourceSegments);assert.deepEqual(b.tableContext,a.tableContext);}else{const f=p.figures.find(x=>x.figureId===a.figureId);assert.equal(b.caption,f.caption);assert.equal(b.transcriptionText,f.transcription+(f.unknowns?.length?'\n原图未显示的信息：'+f.unknowns.join('；'):''));assert.deepEqual(b.sourceAssetBindings,f.sourceAssetBindings);assert.equal(sha(await readFile(dest+'/'+b.src)),f.presentationAsset.sha256);assert(!('sourceNotes' in b));}}
 for(const note of d.notes){assert(html.includes(note.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(note.text)));}
 assert.equal(d.globalAdmissionGranted,false);assert.equal(d.ordinaryWholeArticlePassed,false);assert.equal(d.authorCandidateChanged,false);
 return {status:'verified-exact311-native-stage',canonical:CANON,proposalSha256:g.production.sha256,sourcePositions:225,texts:204,figures:21,existingNotes:8,mandatoryConditions:10,
  displayConditionsImplemented:true,originalStrictVerification:g.originalStrictVerification,conditionalCompositionAllowed:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualMcpArenaReadback:null,newModelCalls:0};
}
export async function stageLimited(options){
 const g=await verifyLimited(options.processingRoot,options.candidatePath),dest=options.destination;
 const r=await stageWebTextbook({...options,verify:verifyLimited});
 const bodies=await load(dest+'/textbook-bodies.json'),lib=await load(dest+'/knowledge-index.json'),defs=await load(dest+'/textbook-unit-map.json');
 const body=bodies.chapters[0],original=structuredClone(body.blocks),notes=expectedNotes(g,original);
 body.blocks=original.flatMap(b=>[b,...notes.filter(n=>b.type==='figure'&&b.locator.sourceBlockIds.includes(n.afterSourceBlockId))]);verifyDisplay(body.blocks,original,g);
 defs[0].to=body.blocks.length;
 body.translatorNote='原文与原图完整保留；18条审校说明为非原文展示层。作者数字和计算未独立证真，历史图读约值未逐点核准。手牌A仅12张可见牌，不推断第13张。历史附件配对不对外显示，图像按源绑定。';
 lib.chapters[0].reviewFocus='固定311原图呈现条件性补证与精确父链继承；原严格false及历史unknown不改，不认证全部数据或作者计算。';
 for(const[n,x]of [['textbook-bodies.json',bodies],['knowledge-index.json',lib],['textbook-unit-map.json',defs]])await save(dest+'/'+n,x);
 const build=await compileTextbookCorpus(dest,defs);await buildTextbookReview(dest,lib);
 await save(dest+'/display-limits.json',{canonical:CANON,candidate:g.candidate,source:g.source,parent:g.parent,independentReceipt:g.independentReceipt,raw:g.raw,scope:g.scope,
  originalBlocks:original,originalBlocksSha256:sha(JSON.stringify(original)),notes,originalStrictVerification:g.originalStrictVerification,oldStrictVerification:g.oldStrictVerification,
  historicalSourceNotesDisplayPolicy:'not copied into outward HTML/corpus; original proposal/parent/sourceNotes and raw remain immutable',
  authorCandidateChanged:false,conditionalCompositionAllowed:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadback:null,newModelCalls:0});
 const receipt={...r,...build,status:'exact311-native-conditional-preview',canonical:CANON,auditStatus:g.status,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualMcpArenaReadback:null,
  displayLimits:{path:dest+'/display-limits.json',sha256:sha(await readFile(dest+'/display-limits.json'))},newModelCalls:0};
 await save(dest+'/web-stage-receipt.json',receipt);return receipt;
}
