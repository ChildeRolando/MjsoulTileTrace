import assert from 'node:assert/strict';
import {readFile,writeFile,access,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-cn234-text-scope-20261028',O=fileURLToPath(new URL('./',import.meta.url)),load=async p=>JSON.parse(await readFile(p));
const {verifyLimited,assertScope,sha,glosses,displayExactSegments}=await import(pathToFileURL(D+'/admit.mjs'));
const {stageLimited,verifyDisplay}=await import(pathToFileURL(D+'/stage.mjs'));
const manifest=await load(D+'/manifest.json'),r=await load(manifest.receipt.path),c=await load(r.candidate.path),p=await load(r.parent.path),raw=await load(r.raw.path),pr=await load(r.parentRaw.path),a=await load(r.parentAudit.path),s=await load(manifest.sidecar.path),q=await load(manifest.proposal.path);
const gate=await verifyLimited(P,r.candidate.path),negative=[];
for(const[name,run]of [['wrong-candidate-parent',()=>verifyLimited(P,r.parent.path)],['wrong-root',()=>verifyLimited(P+'/other',r.candidate.path)]]){await assert.rejects(run);negative.push(name);}
for(const[name,mutate]of [
 ['wrong-source',x=>x.c.source.sourceSha256='0'.repeat(64)],['missing-gloss',x=>x.c.body.blocks[2].text=x.p.body.blocks[2].text],
 ['payment-changed',x=>x.c.body.blocks[2].text=x.c.body.blocks[2].text.replace('20000点','20001点')],['condition-removed',x=>x.c.body.blocks[4].text=''],
 ['source-marks-deleted',x=>x.c.body.blocks[2].sourceSegments=[]],['figure-changed',x=>x.c.figures[0].transcription+='changed'],
 ['parent-nontarget-uncertain',x=>x.pr.output.blockChecks[0].verdict='uncertain'],['parent-target-other',x=>x.pr.output.issues[0].targetId='other'],
 ['new-call-other',x=>x.raw.callId='other'],['new-target-uncertain',x=>x.raw.output.translation.verdict='uncertain'],
 ['new-argument-false',x=>x.raw.output.argumentChecks[0].faithful=false],['new-order-false',x=>x.raw.output.orderedContextFaithful=false],
 ['new-issue',x=>x.raw.output.issues.push({severity:'error'})],['receipt-misrouted193',x=>x.r.call.binding.scope='jp193-b0081-text-only-r2'],
 ['sidecar-wrong-canonical',x=>x.s.canonical='nemata-jp-chapter-193-1'],['sidecar-wrong-call',x=>x.s.callId='other'],
 ['sidecar-new-verdict',x=>x.s.newSemanticVerdict=true],['scope-requirement-deleted',x=>x.q.requiredDisplayLimitations.pop()],
 ['proposal-pretends-installed',x=>x.q.implementationVerified=true],['old-fee-zero',x=>x.q.oldTimeout.fee=0],
 ['old-upstream-known',x=>x.q.oldTimeout.upstreamExecutions=1],['old-recovery-fabricated',x=>x.q.oldTimeout.recoverableOutput=true],
 ['new-attempt-called-recovery',x=>x.q.oldTimeout.newAttemptIsNewCall=false],['whole-chapter-fabricated',x=>x.r.wholeChapterPassed=true]
]){const x=structuredClone({c,p,raw,pr,a,r,s,q});mutate(x);assert.throws(()=>assertScope(x.c,x.p,x.raw,x.pr,x.a,x.r,x.s,x.q),name);negative.push(name);}
const dest=D+'/stage',exists=await access(dest+'/web-stage-receipt.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const receipt=exists?await load(dest+'/web-stage-receipt.json'):await stageLimited({processingRoot:P,candidatePath:r.candidate.path,destination:dest});
const bodies=await load(dest+'/textbook-bodies.json'),display=verifyDisplay(bodies,gate),corpus=await load(dest+'/textbook-corpus.json'),html=await readFile(dest+'/knowledge.html','utf8'),provenance=await load(dest+'/scope-provenance.json');
for(const[a,z]of glosses){assert(html.includes(a+z));assert(corpus.units.some(u=>JSON.stringify(u).includes(a+z)));}
for(const t of ['10000点','5000点','20000点','30000点','5000*4=20000','（待续）']){assert(html.includes(t));assert(corpus.units.some(u=>JSON.stringify(u).includes(t)));}
assert.deepEqual([...new Set(bodies.chapters[0].blocks.flatMap(b=>b.locator.sourceBlockIds))],c.body.blocks.flatMap(b=>b.sourceBlockIds));
assert.equal(corpus.images.length,1);assert.equal(provenance.requirements.length,3);assert.deepEqual(provenance.requirements.map(x=>x.quote),raw.output.requiredDisplayLimitations);
for(const b of c.body.blocks){const shown=bodies.chapters[0].blocks.filter(x=>x.locator.sourceBlockIds.includes(b.sourceBlockIds[0]));if(b.type==='text')assert.equal(shown.map(x=>x.text).join(''),b.text,'all original author text and new gloss bytes retained');else {assert.equal(shown.length,1);const f=c.figures.find(f=>f.figureId===b.figureId);assert.equal(shown[0].caption,f.caption);assert.equal(shown[0].transcriptionText,f.transcription+(f.unknowns.length?'\n原图未显示的信息：'+f.unknowns.join('；'):''));}}
assert.deepEqual(provenance.requirements[2].binding.oldTimeout,q.oldTimeout);assert.equal(provenance.requirements[1].binding.candidate.sha256,r.candidate.sha256);
for(const t of [r.candidate.sha256,raw.callId,q.oldTimeout.callId,'upstreamExecutions','localInvocations'])assert(!html.includes(t),'audit metadata must stay outside teaching HTML');
for(const[name,mutate]of [['rendered-gloss-removed',b=>{b.chapters[0].blocks.find(x=>x.text?.includes('（五—十）')).text='removed';}],['audit-ledger-injected-as-author',b=>b.chapters[0].blocks[0].text+=gate.oldTimeout.callId]]){const bs=structuredClone(bodies);mutate(bs);assert.throws(()=>verifyDisplay(bs,gate),name);negative.push(name);}
const segments=displayExactSegments(c.body.blocks[2]);for(let i=0;i<segments.length;i++){const x={...segments[i]},y={...c.body.blocks[2].sourceSegments[i]};delete x.text;delete y.text;assert.deepEqual(x,y,'all marks/href and segment attributes unchanged');}
await mkdir(O+'/evidence',{recursive:true});const archive=[];
for(const[i,f]of [manifest.receipt,r.raw,r.candidate,r.parent,r.parentAudit,r.parentRaw,r.makerRaw,manifest.sidecar,manifest.proposal,manifest.inheritance,r.plan,r.runtime,q.oldTimeout.raw].entries()){
 const name='e'+i+'.json';assert.equal(sha(await readFile(f.path)),f.sha256);await copyFile(f.path,O+'/evidence/'+name);archive.push({...f,copy:'evidence/'+name});}
const proof={canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,receipt:manifest.receipt,raw:r.raw,metadataSidecar:manifest.sidecar,translation:raw.output.translation,argumentChecks:raw.output.argumentChecks,
 strictVerification:r.verification,originalParentIssues:pr.output.issues,originalReceiptSchemaLabel:r.schema,actualScope:r.call.binding.scope,oldTimeout:q.oldTimeout,
 ...display,images:corpus.images.length,threeGlossesActuallyVisibleInHtmlAndCorpus:true,marksHrefUnchanged:true,allFiveSourceIdsInOrder:true,auditRequirementsMappedInProvenanceOnly:true,
 standardWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,authorCandidateChanged:false,negativeChecks:negative,archive,newCalls:0,newConsumers:0};
await writeFile(O+'/verification.json',JSON.stringify(proof,null,2)+'\n');
await writeFile(O+'/handoff.json',JSON.stringify({canonical:r.canonical,candidate:r.candidate,package:D,loader:D+'/admit.mjs',loaderFunction:'verifyLimited(root,candidatePath)',stageEntry:D+'/stage.mjs',stageFunction:'stageLimited(options)',stage:dest,
 manifest:D+'/manifest.json',verification:D+'/verification.json',existing250Wakeup:'01a18200-0759-7d9d-b455-e21de363f98a',onlyExisting250Writer:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newCalls:0,newConsumers:0},null,2)+'\n');
console.log(JSON.stringify({...display,images:corpus.images.length,negativeChecks:negative.length,newCalls:0,globalAccepted:false}));
