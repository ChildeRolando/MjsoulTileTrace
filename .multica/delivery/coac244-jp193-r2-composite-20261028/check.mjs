import assert from 'node:assert/strict';
import {readFile,writeFile,access,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-jp193-r2-composite-20261028',O=fileURLToPath(new URL('./',import.meta.url)),load=async p=>JSON.parse(await readFile(p));
const {verifyLimited,assertFusion,sha}=await import(pathToFileURL(D+'/admit.mjs'));
const {stageLimited,verifyDisplay}=await import(pathToFileURL(D+'/stage.mjs'));
const manifest=await load(D+'/manifest.json'),r=await load(manifest.receipt.path),c=await load(r.candidate.path),p=await load(r.parent.path),old=await load(r.parentAudit.path),priorRaw=await load(r.parentRaw.path),raw=await load(r.raw.path),h=await load(manifest.history.path),q=await load(manifest.proposal.path);
const gate=await verifyLimited(P,r.candidate.path);assert.equal(gate.admissionGranted,false);assert.equal(gate.currentStrictVerification.textTargetEvidenceVerified,false);assert.equal(gate.originalStrictVerification.limitedEvidenceVerified,false);
const negative=[];
for(const[name,run]of [['wrong-parent-file',()=>verifyLimited(P,r.parent.path)],['wrong-root',()=>verifyLimited(P+'/other',r.candidate.path)]]){await assert.rejects(run);negative.push(name);}
for(const[name,mutate]of [
 ['source-mismatch',c=>c.source.sourceSha256='0'.repeat(64)],['author-condition-deleted',c=>c.body.blocks[96].text=''],
 ['old-compound-restored',c=>c.body.blocks[80].text=p.body.blocks[80].text],['source-marks-changed',c=>c.body.blocks[80].sourceSegments=[]],
 ['figure-object-changed',c=>c.figures.at(-1).caption+='changed'],['target-unknown-guessed',c=>c.figures.find(f=>f.figureId.endsWith(':b0080:figure')).unknowns.pop()],
 ['new-translation-not-faithful',(_,__,r)=>r.output.translation.verdict='uncertain'],['new-argument-failed',(_,__,r)=>r.output.argumentChecks[6].faithful=false],
 ['new-context-failed',(_,__,r)=>r.output.orderedContextFaithful=false],['new-call-mismatch',(_,__,r)=>r.callId='other'],
 ['historical-issue-deleted',(_,__,r)=>r.output.issues.pop()],['historical-issue-relabelled',(_,__,r)=>r.output.issues[1].severity='source-note'],
 ['historical-new-issue',(_,__,r)=>r.output.issues.push({...r.output.issues[0]})],['old-false-rewritten',(_,o)=>o.output.orderedContextFaithful=true],
 ['old-figure-not-faithful',(_,o)=>o.output.figureRepair.verdict='uncertain'],['old-unknown-material',(_,o)=>o.output.unknownImpact[0].requiresExactValueForAuthorArgument=true],
 ['history-hash-mismatch',(_,__,___,h)=>h.issuesSerializedSha256='0'.repeat(64)],['history-new-semantic-verdict',(_,__,___,h)=>h.newSemanticVerdict=true],
 ['limit-removed',(_,__,___,____,q)=>q.requiredDisplayLimitations.pop()],['proposal-as-author',(_,__,___,____,q)=>q.authorBodyInjection=true],
 ['proposal-wrong-SHA',(_,__,___,____,q)=>q.candidate.sha256='0'.repeat(64)],['proposal-pretends-installed',(_,__,___,____,q)=>q.implementationVerified=true]
 ]){const cc=structuredClone(c),oo=structuredClone(priorRaw),rr=structuredClone(raw),hh=structuredClone(h),qq=structuredClone(q);mutate(cc,oo,rr,hh,qq);assert.throws(()=>assertFusion(cc,p,oo,rr,hh,qq),name);negative.push(name);}
const dest=D+'/stage',exists=await access(dest+'/web-stage-receipt.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const receipt=exists?await load(dest+'/web-stage-receipt.json'):await stageLimited({processingRoot:P,candidatePath:r.candidate.path,destination:dest});
const bodies=await load(dest+'/textbook-bodies.json'),display=await load(dest+'/display-limits.json'),corpus=await load(dest+'/textbook-corpus.json'),html=await readFile(dest+'/knowledge.html','utf8'),blocks=bodies.chapters[0].blocks;
assert.equal(receipt.candidateSha256,r.candidate.sha256);verifyDisplay(blocks,display.originalBlocks,gate);
for(const n of display.notes){assert(html.includes(n.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(n.text)));}
for(const u of priorRaw.output.unknownImpact){assert(html.includes(u.unknownText));assert(corpus.units.some(x=>JSON.stringify(x).includes(u.unknownText)));}
for(const t of ['若排除入り目的情形','25%以上','50%']){assert(c.body.blocks.some(b=>b.text?.includes(t)));assert(html.includes(t));assert(corpus.units.some(u=>JSON.stringify(u).includes(t)));}
const allIds=[...new Set(display.originalBlocks.flatMap(b=>b.locator?.sourceBlockIds??[]))];
assert.deepEqual(allIds,c.body.blocks.flatMap(b=>b.sourceBlockIds),'all97 ordered source IDs retained by actual rendering');
for(const[name,mutate]of [
 ['display-limit-deleted',b=>b.splice(b.findIndex(x=>x.id==='limitedjp193-1'),1)],
 ['display-limit-altered',b=>b.find(x=>x.id==='limitedjp193-2').text='full board verified'],
 ['display-limit-author-flag',b=>b.find(x=>x.id==='limitedjp193-3').authorText=true],
 ['display-limit-wrong-slot',b=>b.push(...b.splice(b.findIndex(x=>x.id==='limitedjp193-1'),1))],
 ['display-author-changed',b=>b.find(x=>x.type==='p'&&!x.id.startsWith('limitedjp193-')).text+='changed']
 ]){const bs=structuredClone(blocks);mutate(bs);assert.throws(()=>verifyDisplay(bs,display.originalBlocks,gate),name);negative.push(name);}
await mkdir(O+'/evidence',{recursive:true});const archive=[];
for(const[i,f]of [manifest.receipt,r.raw,r.candidate,r.parent,r.parentAudit,r.parentRaw,r.makerRaw,manifest.history,manifest.proposal,manifest.inheritance,r.plan,r.runtime].entries()){
 const name='e'+i+'.json';assert.equal(sha(await readFile(f.path)),f.sha256);await copyFile(f.path,O+'/evidence/'+name);archive.push({...f,copy:'evidence/'+name});}
const proof={canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,receipt:manifest.receipt,raw:r.raw,priorVisionReceipt:r.parentAudit,priorVisionRaw:r.parentRaw,
 newTranslation:raw.output.translation,newArgumentChecks:raw.output.argumentChecks,newOrderedContextFaithful:true,historicalIssuesIdentical:true,historicalIssueHash:h.issuesSerializedSha256,newIssueCount:0,
 originalStrictVerification:old.verification,currentStrictVerification:r.verification,ordinaryWholeArticlePassed:false,admissionGranted:false,
 sourceBlocks:97,unchangedNonTargetBlocks:96,unchangedCompleteFigures:41,stageAuthorBlocks:display.originalBlocks.length,stageDisplayBlocks:blocks.length,corpusImages:corpus.images.length,nonAuthorNotes:7,
 actualHtmlAndCorpusReadback:true,all97SourceIdsRetained:true,allSevenLimitsInstalledInIsolatedStage:true,globalMcpArenaReadbackRequired:true,
 authorCandidateChanged:false,scopeCompositionIsNotNewSemanticModelVerdict:true,stageReceipt:receipt,negativeChecks:negative,archive,newCalls:0,newConsumers:0,fee:'unknown',upstreamExecutions:'unknown'};
await writeFile(O+'/verification.json',JSON.stringify(proof,null,2)+'\n');
await writeFile(O+'/handoff.json',JSON.stringify({canonical:r.canonical,candidate:r.candidate,package:D,loader:D+'/admit.mjs',loaderFunction:'verifyLimited(root,candidatePath)',stageEntry:D+'/stage.mjs',stageFunction:'stageLimited(options)',
 stage:dest,manifest:D+'/manifest.json',verification:D+'/verification.json',existing250Wakeup:'01a181f9-71cb-7352-8729-ee4efcb13197',onlyExisting250Writer:true,
 originalVerifiersFalsePreserved:true,globalAdmissionGranted:false,ordinaryWholeArticlePassed:false,actualGlobalMcpArenaReadbackRequired:true,newCalls:0,newConsumers:0},null,2)+'\n');
console.log(JSON.stringify({sourceBlocks:97,stageAuthorBlocks:display.originalBlocks.length,displayBlocks:blocks.length,images:corpus.images.length,notes:7,negativeChecks:negative.length,newCalls:0,globalAccepted:false}));
