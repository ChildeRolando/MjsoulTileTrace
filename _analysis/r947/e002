// Exact b0947 data composition. No model invocation, no ordinary audit mutation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const P='E:/AgentData/Coach/knowledge/processing',O=import.meta.dirname;
const sha=x=>createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical='nemata-jp-chapter-283-1',id='modern-yabejp-ja:chapter06-exercise003:b0947';
const expected={parent:'de3c0fa24705cbe88a7a7fd3b0da8de5b09d009db43227776aef4d90e444f95c',donor:'849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3',source:'8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de',checkpoint:'50a4862f7d2262d3ac34e1136b1f874e5f342142133dec25e0c5e57abd5cafc7',raw:'cec5e1c91a2db633a5e7fe55eeea9bff61d177e23106e38c6610240229a36d0b',call:'7896f6fb-3a56-4444-bf7f-761db2958445',producer:'fafc75a7-a3fb-4db5-b899-aa4ae346fa0c'};
const packetPath=P+'/integration/coac244-recovery-20261028/complex-original/b0947-packet.json';
const get=async r=>{const b=await readFile(r.path);assert.equal(sha(b),r.sha256,'bound file SHA');return JSON.parse(b)};
const ref=async path=>({path,sha256:sha(await readFile(path))});
const figure=c=>c.figures.find(f=>same(f.sourceBlockIds,[id]));
function validateDerived(c,parent,donor,proof){
 assert.equal(proof.canonical,canonical);assert.equal(proof.parent.sha256,expected.parent);assert.equal(proof.donor.sha256,expected.donor);assert.equal(proof.source.sha256,expected.source);
 assert.equal(proof.independentCallId,expected.call);assert.equal(proof.independentRaw.sha256,expected.raw);assert.equal(proof.independentCheckpoint.sha256,expected.checkpoint);
 assert.equal(proof.wholeChapterAccepted,false);assert.equal(proof.standardWholeArticlePassed,false);assert.equal(proof.newModelCalls,0);
 assert.equal(proof.productionRaw.sha256,'02260915db5aa39d0a08aa51333328b92d8cc941e8cca7b757ee8df2d58ccc9b');
 const f=figure(donor),out=figure(c);assert.equal(hash(f),proof.targetFigureSha256);assert.deepEqual(out,f,'entire independently reviewed figure, including original provenance');assert.equal(out.provenance.callId,expected.producer);assert.equal(out.unknowns.length,5);assert.deepEqual(out.unknowns,f.unknowns);
 assert.equal(c.body.blocks.length,1195);assert.deepEqual(c.body,parent.body,'all author text, conditions, order, tableContext unchanged');assert.equal(c.figures.length,524);assert.equal(proof.contextIds.length,15);
 assert.deepEqual(proof.contextIds,[...Array.from({length:9},(_,i)=>'modern-yabejp-ja:chapter06-exercise003:b'+String(i+1).padStart(4,'0')),...Array.from({length:6},(_,i)=>'modern-yabejp-ja:chapter06-exercise003:b'+String(i+945).padStart(4,'0'))]);
 const parentById=new Map(parent.body.blocks.map(x=>[x.sourceBlockIds[0],x])),donorById=new Map(donor.body.blocks.map(x=>[x.sourceBlockIds[0],x]));
 for(const k of proof.contextIds){assert.deepEqual(parentById.get(k),donorById.get(k),'full Q60 context and definitions');assert.equal(hash(parentById.get(k)),proof.contextHashes[k]);}
 const si=parent.figures.findIndex(x=>same(x.sourceBlockIds,[id]));for(let i=0;i<524;i++)if(i!==si)assert.deepEqual(c.figures[i],parent.figures[i]);
 assert.deepEqual(c.source,parent.source);assert.deepEqual(c.source,donor.source);
 const copy=structuredClone(c);delete copy.scopeComposition;delete copy.candidateSha256;copy.figures[si]=structuredClone(parent.figures[si]);delete copy.candidateSha256;const old=structuredClone(parent);delete old.candidateSha256;assert.deepEqual(copy,old,'no other root, provenance, or figure changes');
 const content={...c};delete content.candidateSha256;assert.equal(c.candidateSha256,hash(content));assert.deepEqual(c.scopeComposition,{schema:'coac244-exact-reviewed-figure-composition/1',canonical,parent:proof.parent,donor:proof.donor,targetId:id,targetFigureSha256:proof.targetFigureSha256,independentCallId:expected.call,newModelCalls:0,wholeChapterAccepted:false,standardWholeArticlePassed:false});
 return {passed:true,status:'accepted-for-exact-b0947-existing-independent-figure-reuse',canonical,targetId:id,wholeChapterAccepted:false,standardWholeArticlePassed:false,newModelCalls:0,unchangedBodyBlocks:1195,unchangedOtherFigures:523,preservedUnknowns:5};
}
export async function verify0947Composition(proofPath,derivedPath){
 const proof=JSON.parse(await readFile(proofPath)),c=JSON.parse(await readFile(derivedPath)),parent=await get(proof.parent),donor=await get(proof.donor);await get(proof.source);
 const manifest=await get(proof.runtime);assert.equal(proof.runtime.sha256,'0f0c2846f961e12c12aaee72c5c06cfef3166087f0da21219cb9c609f13b7715');for(const f of manifest.files)assert.equal(sha(await readFile(f.path)),f.sha256);
 const mod=await import(pathToFileURL(P+'/audit/runtimes/coac269-283-1017-v2-20261028/textbook-audit-web.mjs'));
 const parentGate=await mod.verifyGroupRevisionAudit(P,proof.parent.path),donorGate=await mod.verifyGroupRevisionAudit(P,proof.donor.path);await mod.verifyWebProductionCall(P,donor);await mod.verifyWebProductionCall(P,parent);
 assert.equal(parentGate.auditSha256,proof.parentAudit.sha256);assert.equal(donorGate.auditSha256,proof.donorAudit.sha256);
 const cp=await get(proof.independentCheckpoint),raw=await get(proof.independentRaw),producer=await get(proof.productionRaw);
 assert.equal(raw.callId,expected.call);assert(raw.success&&raw.exitCode===0&&!raw.timedOut);assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.output);assert.deepEqual(raw.output,cp.modelReview);assert.equal(raw.binding.productionSha256,expected.donor);
 const fc=raw.output.figureChecks.find(x=>x.id===id+':figure');assert.equal(fc.verdict,'faithful');assert(fc.preservedUnknowns.acknowledged);assert(raw.output.contextContinuity.faithful);assert(!raw.output.issues.some(x=>x.targetId===id+':figure'));
 const made=JSON.parse(producer.rawLastMessage).figures.find(x=>x.sourceBlockId===id);for(const k of ['kind','transcription','unknowns','caption','sourceNotes'])assert.deepEqual(made[k],figure(donor)[k]);
 assert.equal(sha(await readFile(derivedPath)),proof.derived.sha256);
 return validateDerived(c,parent,donor,proof);
}
async function build(){
 const packet=JSON.parse(await readFile(packetPath)),parent=await get(packet.current),donor=await get(packet.donor),source=await get(packet.source);assert.equal(parent.source.sourceSha256,expected.source);
 const c=structuredClone(parent),i=c.figures.findIndex(x=>same(x.sourceBlockIds,[id]));c.figures[i]=structuredClone(figure(donor));
 const result=JSON.parse(await readFile(P+'/integration/coac249-283-1017-r2-reviewed-20261028.json'));
 const proof={schema:'coac244-b0947-exact-composition-proof/1',authorization:'01a18193-acf0-7b75-a947-a354214b1a45',canonical,parent:packet.current,donor:packet.donor,source:packet.source,parentAudit:result.audit,donorAudit:await ref(P+'/audit/web/articles/modern-yabejp-ja/chapter06-exercise003.'+expected.donor+'.json'),runtime:result.runtime,independentCallId:expected.call,independentCheckpoint:packet.independent.checkpoint,independentRaw:packet.independent.raw,productionRaw:packet.maker.raw,contextIds:packet.orderedSourceCandidatePairs.map(x=>x.source.id),contextHashes:Object.fromEntries(packet.orderedSourceCandidatePairs.map(x=>[x.source.id,hash(x.candidate)])),targetFigureSha256:hash(figure(donor)),originalUnknowns:figure(donor).unknowns,wholeChapterAccepted:false,standardWholeArticlePassed:false,newModelCalls:0,oldRawModified:false,additionalPendingTarget:'b0785 remains on existing269→249 line; no whole283 staging before its true pass'};
 c.scopeComposition={schema:'coac244-exact-reviewed-figure-composition/1',canonical,parent:proof.parent,donor:proof.donor,targetId:id,targetFigureSha256:proof.targetFigureSha256,independentCallId:expected.call,newModelCalls:0,wholeChapterAccepted:false,standardWholeArticlePassed:false};delete c.candidateSha256;c.candidateSha256=hash(c);
 const derivedPath=join(O,'chapter06-exercise003.b0947-derived.json');await writeFile(derivedPath,JSON.stringify(c,null,2)+'\n');proof.derived=await ref(derivedPath);proof.derived.path=P+'/integration/coac244-283-0947-composition-20261028/chapter06-exercise003.b0947-derived.json';
 const proofPath=join(O,'composition-proof.json');await writeFile(proofPath,JSON.stringify(proof,null,2)+'\n');const v=await verify0947Composition(proofPath,derivedPath);
 const tests=[];const rejects=(name,change)=>{const x=structuredClone(c),p=structuredClone(proof);change(x,p);assert.throws(()=>validateDerived(x,parent,donor,p));tests.push({name,rejected:true})};
 rejects('wrong source',(x,p)=>p.source.sha256='0');rejects('wrong parent',(x,p)=>p.parent.sha256='0');rejects('wrong donor',(x,p)=>p.donor.sha256='0');rejects('wrong raw',(x,p)=>p.independentRaw.sha256='0');rejects('wrong checkpoint',(x,p)=>p.independentCheckpoint.sha256='0');rejects('wrong call',(x,p)=>p.independentCallId='other');rejects('wrong target hash',(x,p)=>p.targetFigureSha256='0');rejects('missing public wind unknown',(x)=>figure(x).unknowns.shift());rejects('guessed public wind',(x)=>figure(x).transcription+=' 东');rejects('Q60 condition changed',(x)=>x.body.blocks[945].text+='改');rejects('body order changed',(x)=>x.body.blocks.reverse());rejects('tableContext removed',(x)=>delete x.body.blocks[945].tableContext);rejects('non-target figure changed',(x)=>x.figures[0].caption+='改');rejects('missing definition context',(x,p)=>p.contextIds.shift());rejects('missing context hash',(x,p)=>delete p.contextHashes[p.contextIds[0]]);rejects('whole article passed forged',(x,p)=>p.wholeChapterAccepted=true);rejects('standard pass forged',(x,p)=>p.standardWholeArticlePassed=true);rejects('new production claimed',(x,p)=>p.newModelCalls=1);
 rejects('production raw changed',(x,p)=>p.productionRaw.sha256='0');rejects('ordered context rearranged',(x,p)=>p.contextIds.reverse());rejects('producer provenance changed',(x)=>figure(x).provenance.callId='other');
 await writeFile(join(O,'verification.json'),JSON.stringify({verification:v,negativeTests:tests,newModelCalls:0,parentChain:'real frozen recursive group + production verifiers, both full parent branches',prior84And27Rerun:false},null,2)+'\n');
 console.log(JSON.stringify({derived:proof.derived,verification:v,negativeTests:tests.length}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
