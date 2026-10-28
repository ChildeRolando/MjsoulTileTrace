// Read-only verification of the existing250 writer's exact182 implementation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac250-182-limited-display-20261028',O=fileURLToPath(new URL('./',import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const ref=async p=>({path:p,sha256:sha(await readFile(p))});
const get=async b=>{const data=await readFile(b.path);assert.equal(sha(data),b.sha256,'bound file SHA');return JSON.parse(data);};
const save=(p,x)=>writeFile(join(O,p),JSON.stringify(x,null,2)+'\n');
const receiptRef={path:P+'/integration/coac249-182-target-impact-reviewed-20261028.json',sha256:'14442a0ef1dfa65e159ec3e887a56c9d83beb2fb7d32ffdf114a547c31248a62'};
const receipt=await get(receiptRef),candidate=await get(receipt.candidate),raw=await get(receipt.raw),parent=await get(receipt.parent),old=await get(receipt.parentAudit);
assert.equal(receipt.candidate.sha256,'32e040ae1683015cc92dac03381af964842eeef8ad6dcb54b2c38fc26480cabc');
assert.equal(receipt.raw.sha256,'667ec48a9f8132ebde5277f56bc4e98bbdf5d6b5d2d2c6a2fdabe1f6c62c3482');
const proposalRef={path:P+'/integration/coac249-182-display-requirements-20261028.json',sha256:'93f8864e139223dbe9dcb8607bcdd52ae2b799d2b867501fd3bd1ff283fa03c2'};
const proposal=await get(proposalRef);
const inheritanceRef={path:P+'/integration/coac249-182-scope-inheritance-20261028.json',sha256:'b981c50527728b1eb654c43892536566835ac65374686e9f3dfd4dc173bea7b8'};await get(inheritanceRef);
const {verify182Limited,assert182Scope}=await import(pathToFileURL(D+'/admit.mjs'));
const {verify182Display}=await import(pathToFileURL(D+'/stage.mjs'));
const gate=await verify182Limited(P,receipt.candidate.path);
assert.equal(gate.status,'admitted-exact182-source-ambiguity-display');assert.equal(gate.ordinaryWholeArticlePassed,false);
const display=await load(D+'/stage/display-limits.json'),bodies=await load(D+'/stage/textbook-bodies.json'),corpus=await load(D+'/stage/textbook-corpus.json'),stageReceipt=await load(D+'/stage/web-stage-receipt.json');
const blocks=bodies.chapters[0].blocks;verify182Display(blocks,display.originalBlocks,gate);
assert.equal(display.authorCandidateChanged,false);assert.equal(display.originalBlocksSha256,sha(JSON.stringify(display.originalBlocks)));
assert.equal(blocks.length,18);assert.equal(display.originalBlocks.length,13);assert.equal(display.notes.length,4);
assert.equal(stageReceipt.candidateSha256,receipt.candidate.sha256);assert.equal(stageReceipt.modelCalls,0);assert.equal(stageReceipt.standardWholeArticlePassed,false);
assert.equal(raw.callId,'2c5124ed-ccb2-41e0-90db-cbb6e80141fa');assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');assert.deepEqual(raw.requestExecution.images,[]);assert(!raw.requestExecution.args.includes('-i'));
assert.equal(raw.output.translation.verdict,'faithful');assert.equal(raw.output.carriedIssue.requiresResolvedMeaningOrExactTileForAuthorArgument,false);
assert.equal(raw.output.issues.length,1);assert.equal(raw.output.issues[0].severity,'uncertain');
const html=await readFile(D+'/stage/knowledge.html','utf8');
for(const n of display.notes){assert(html.includes(n.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(n.text)));assert.equal(n.authorText,false);}
const negative=[];
for(const[name,mutate]of [
 ['wrong-translation',(_,__,r)=>r.output.translation.verdict='needs-repair'],
 ['meaning-required',(_,__,r)=>r.output.carriedIssue.requiresResolvedMeaningOrExactTileForAuthorArgument=true],
 ['uncertain-converted',(_,__,r)=>r.output.issues[0].severity='source-note'],
 ['argument-condition-missing',(_,__,r)=>r.output.argumentChecks[0].faithfulWithCurrentLimitation=false],
 ['wrong-anchor-offset',(_,p)=>p.anchor.utf8Start++],['wrong-source-quote',(_,p)=>p.anchor.text+='invented'],
 ['missing-limit',(_,p)=>p.allRequiredDisplayLimitations.pop()],['annotation-missing',(_,p)=>p.requiredNeighborAnnotation.text=''],
 ['annotation-as-author',(_,p)=>p.requiredNeighborAnnotation.authorText=true],
 ['body-ambiguity-rewritten',c=>c.body.blocks[12].text+='invented interpretation'],
 ['other-author-text-changed',c=>c.body.blocks[0].text+='edited'],
 ['figure-changed',c=>c.figures[0].caption+='edited']
 ]){
 const c=structuredClone(candidate),p=structuredClone(proposal),r=structuredClone(raw);mutate(c,p,r);
 assert.throws(()=>assert182Scope(c,parent,old,r,p),name);negative.push({name,rejected:true});
}
for(const[name,mutate]of [
 ['note-deleted',bs=>bs.splice(bs.findIndex(b=>b.id==='limited182-1'),1)],
 ['note-unlabelled',bs=>bs.find(b=>b.id==='limited182-1').text='unlabelled'],
 ['note-author-flag',bs=>bs.find(b=>b.id==='limited182-1').authorText=true],
 ['note-not-near-anchor',bs=>{const i=bs.findIndex(b=>b.id==='limited182-1');bs.push(...bs.splice(i,1));}],
 ['author-marks-changed',bs=>bs.find(b=>b.id.endsWith('-182-after-note')).displaySegments=[]]
 ]){const bs=structuredClone(blocks);mutate(bs);assert.throws(()=>verify182Display(bs,display.originalBlocks,gate),name);negative.push({name,rejected:true});}
await mkdir(join(O,'evidence'),{recursive:true});
const files=[receiptRef,receipt.raw,receipt.candidate,receipt.parent,receipt.parentAudit,receipt.parentRaw,proposalRef,inheritanceRef,
 ...await Promise.all(['admit.mjs','stage.mjs','manifest.json','stage/display-limits.json','stage/textbook-bodies.json','stage/textbook-corpus.json','stage/web-stage-receipt.json','stage/knowledge.html'].map(n=>ref(D+'/'+n)))];
const archive=[];for(const [i,b]of files.entries()){const name='e'+String(i).padStart(2,'0')+'.'+basename(b.path).split('.').at(-1);await copyFile(b.path,join(O,'evidence',name));archive.push({...b,copy:'evidence/'+name});}
const limits=raw.output.carriedIssue.requiredDisplayLimitations;
await save('verification.json',{canonical:'79-cn-chapter-182-5',candidate:receipt.candidate,source:receipt.source,independentReceipt:receiptRef,raw:receipt.raw,
 independentVerdict:'faithful-translation-and-bounded-source-ambiguity',originalUncertainPreserved:true,
 model:'gpt-6.1-sol',reasoningEffort:'high',actualRequestImages:[],usage:raw.usage,durationMs:raw.durationMs,
 originalRuntimeFiles:19,existing250Loader:await ref(D+'/admit.mjs'),existing250Stage:await ref(D+'/stage.mjs'),
 displayInstalledInActualStage:true,displayStage:D+'/stage',sourceBlocks:13,authorBlocks:13,displayBlocks:18,nonAuthorNotes:4,figures:5,
 allAuthorBytesMarksAndImagesRestoredAfterRemovingNotes:true,allFourLimitsVisibleInActualStageHtmlAndCorpus:true,
 requiredNeighborAnnotation:proposal.requiredNeighborAnnotation,requiredDisplayLimitations:limits,
 unresolvedSourceMeaning:raw.output.carriedIssue.unresolvedContributionOrMinimumGap,
 standardWholeArticlePassed:false,sourceMeaningResolved:false,globalAcceptanceNotInferred:true,actualGlobalMcpArenaReadback:'await-existing250-final-readback-artifact',
 newModelCalls:0,newProductionCalls:0,newConsumers:0,budget:'182 maker1+review1=2/2; no retries or transferred allowance',negativeChecks:negative,archive,
 fee:null,remoteWeights:null,upstreamExecutions:null});
await save('handoff.json',{canonical:'79-cn-chapter-182-5',candidate:receipt.candidate,existing250Run:'01a181bd-110f-7cba-bad6-9dfc285b07ec',
 duplicateIntake:false,duplicateLoader:false,newCalls:0,newConsumers:0,
 next:'Only reuse existing250 real global MCP/Arena readback and intake result; no new maker/independent review. If not complete yet, retain pending actual display acceptance.'});
console.log(JSON.stringify({newModelCalls:0,newConsumers:0,actualStageDisplayVerified:true,sourceBlocks:13,displayBlocks:18,figures:5,limits:4,negativeChecks:negative.length,ordinaryWholeArticlePassed:false}));
