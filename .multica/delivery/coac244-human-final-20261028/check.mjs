import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {D,inputs,verify,request,validateDerived,latestFactMatches} from './entry.mjs';
const load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const receipts=await load(D+'/derivation-receipts.json');
for(const key of ['232','257']){
 const x=await inputs(key),v=await verify(key,x.plan.ownerIssueId),c=await load(v.candidate.path),fi=c.figures.findIndex(f=>f.figureId===c.provenance.humanDerivation.targetFigureId);
 check(key+' fixed owner and all source/runtime/image/parent byte pins',()=>assert(v.deterministicApplicationVerified));
 await assert.rejects(inputs(key,'wrong-owner'));checks.push(key+' rejects wrong consumer owner');
 for(const [name,mutate]of [
  ['author body',z=>z.body.blocks[0].text='unauthorized'],
  ['caption',z=>z.figures[fi].caption='unauthorized'],
  ['unknown retention',z=>z.figures[fi].unknowns=[]],
  ['source',z=>z.source.extra='unauthorized'],
  ['other figure',z=>z.figures.at(-1).caption='unauthorized'],
  ['human tile application',z=>z.figures[fi].transcription+=' 5m'],
  ['provenance counterfeit',z=>z.provenance.humanDerivation.modelProduced=true]]){
   const z=structuredClone(c);mutate(z);check(key+' rejects '+name,()=>assert.throws(()=>validateDerived(key,z,x)));
 }
 const r=await request(key,x.plan.ownerIssueId),payload=JSON.parse(r.prompt.slice(r.prompt.indexOf('\n')+1));
 check(key+' request has complete actual ordered body/source/figures as JSON transported',()=>{assert.deepEqual(payload.candidateBodyInVisualOrder,c.body.blocks);assert.deepEqual(payload.allCurrentFiguresInOrder,c.figures);assert.equal(JSON.stringify(payload.sourceBlocksInOriginalOrder),JSON.stringify(x.source.blocks));});
 check(key+' text only trusted human application request',()=>{assert.equal(r.model,'gpt-6.1-sol');assert.deepEqual(r.images,[]);assert.equal(r.reasoningEffort,'high');assert.deepEqual(payload.acceptedHumanFacts,v.humanFacts);assert(r.prompt.includes('不得重新猜牌'));});
 check(key+' original source and author body unchanged',()=>{assert.deepEqual(c.source,x.parent.source);assert.deepEqual(c.body,x.parent.body);assert.deepEqual(c.provenance.attempts,x.parent.provenance.attempts);});
 check(key+' candidate self hash matches actual serialized object',()=>{const z=structuredClone(c),h=z.candidateSha256;delete z.candidateSha256;assert.equal(h,sha(JSON.stringify(z)));});
}
const e=await load(D+'/final-evidence.json'),events=(await readFile(D+'/snapshot/events.raw.jsonl','utf8')).trim().split(/\r?\n/).map(JSON.parse),r=e.observations.find(x=>x.itemId==='4ce1c71647c8da4352eb117e5d2f1094'),latest=events.findLast(x=>x.id===r.itemId);
check('actual latest saved event accepted',()=>latestFactMatches(r,latest));
for(const status of ['withdrawn','skipped','unclear','missing'])check('reject '+status+' latest event',()=>assert.throws(()=>latestFactMatches(r,{...latest,result:{...latest.result,status}})));
check('reject changed code/source SHA/target/history timestamp',()=>{for(const z of [{...latest,result:{...latest.result,tiles:['5m']}},{...latest,imageSha256:'bad'},{...latest,targetId:'bad'},{...latest,timestamp:'bad'}])assert.throws(()=>latestFactMatches(r,z));});
check('nonpixel/position/direction/missing evidence remains separated',()=>assert.deepEqual(e.counts.evidenceClasses,{'explicit-mapped-human-observation':46,'position-mapping-needed':1,'missing':2,'human-inference-not-pixel-evidence':3,'direction-unanswered-code-only':2}));
check('232 39 public slots and max four verified',()=>{assert.equal(receipts['232'].counts.after.knownTiles,39);assert.deepEqual(receipts['232'].counts.after.overFour,[]);});
check('257 all nine slots, same 87 panel positions, honest failed multiplicity',()=>{const v=receipts['257'];assert.equal(v.counts.after.totalPositions,87);assert.equal(v.counts.before.unknownPositions,9);assert.equal(v.counts.after.unknownPositions,0);assert.equal(v.fullRecordMultiplicityPassed,false);assert.deepEqual(v.counts.after.overFour.map(x=>[x.tile,x.count]).sort(),[['1s',5],['4p',8],['8s',5],['9s',5]]);});
// Check normalized count rows against the actual pinned transcription, not a second tile reading.
const parent257=await load(receipts['257'].parent.path),text257=parent257.figures[0].transcription;
check('257 count normalization tied to actual machine transcription',()=>{
 for(const phrase of ['下方手牌从左到右为：3m 3m 6m 6m 8m 4p 1s 3s 8s 9s 9s 3z 3z','一组9m 9m 9m副露','第2—5张为3s 4p 3p 9s','第7—12张为2s 4p 5p 2p 2p 5z','第13—16张为7s 1m 6p 1p','第1—6张为6z 3z 3z 2z 1z 1p','第7—12张为1s 1z 8s 7p 4p 5p','第13—15张为9m 6z 2p','第17—18张为6z 7p','第3—6张为5p 9s 6s 3p','第8—12张为2p 1s 4p 7p 4p','第15—17张为4s 8s 8s','第一排1z 4z 5z 7z 4p 4p；第二排2s 7z 4z 3p 3s 2s；第三排7z 9s 4z 2m 2m 1p'])assert(text257.includes(phrase),phrase);
});
const t=await verify('261');
check('261 exact same SHA genuine independent 3m and old5m retained',()=>{assert.equal(t.candidate.sha256,'376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359');assert(t.scopeEvidenceVerified&&t.affectedExampleFaithful);assert(t.old5mErrorPreserved.some(x=>JSON.stringify(x).includes('5m')));assert.equal(t.wholeChapterPassed,false);});
const report={schema:'coac244-human-final-zero-call-regression/1',checks,passed:checks.length,newModelCalls:0,wholeChapterPassed:false,knownOpenGap:'257 transcription multiplicity: 4p=8,9s=5 inherited; after human mapping 1s=5,8s=5. Human observations preserved, no invented correction.'};
await writeFile(D+'/regression.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
