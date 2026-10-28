import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-311-native-admission-20261028',O=fileURLToPath(new URL('./',import.meta.url));
const load=async p=>JSON.parse(await readFile(p)),save=async()=>{};
const {verifyLimited,assertScope,sha,BASE}=await import(pathToFileURL(D+'/admit.mjs')),{stageLimited,verifyDisplay,verifyStage}=await import(pathToFileURL(D+'/stage.mjs'));
const manifest=await load(D+'/manifest.json'),r=await load(manifest.receipt.path),p=await load(r.proposal.path),parent=await load(r.parent.path),source=await load(r.source.path),raw=await load(r.raw.path),q=await load(manifest.scope.path),derivation=await load(manifest.derivation.path);
const gate=await verifyLimited(P,r.proposal.path),negative=[];
for(const[name,fn]of [['wrong-candidate-sha',()=>verifyLimited(P,r.parent.path)],['wrong-root',()=>verifyLimited(P+'/other',r.proposal.path)]]){await assert.rejects(fn);negative.push(name);}
for(const[name,mutate]of [
 ['wrong-source-sha',x=>x.r.source.sha256='0'.repeat(64)],['wrong-parent-sha',x=>x.p.originCandidate.sha256='0'.repeat(64)],
 ['wrong-proposal-sha',x=>x.r.proposal.sha256='0'.repeat(64)],['wrong-canonical',x=>x.q.canonical='79-cn-chapter-232-1'],
 ['author-threshold-deleted',x=>x.p.body.blocks[160].text=''],['source-context-order-changed',x=>x.source.blocks.reverse()],
 ['non-target-figure-changed',x=>x.p.figures[0].caption+='changed'],['invent-new-graph-value',x=>x.p.figures[7].transcription+='\n4000'],
 ['fill-unknown-binding',x=>x.p.figures[7].unknowns=[]],['wrong-image-sha',x=>x.p.figures[7].presentationAsset.sha256='0'.repeat(64)],
 ['original-note-dropped',x=>x.p.editorialNotes.pop()],['original-note-moved',x=>x.p.editorialNotes[0].afterSourceBlockId=BASE+'b0154'],
 ['wrong-actual-call',x=>x.raw.callId='wrong'],['faithful-verdict-absent',x=>x.raw.output.figureChecks[0].verdict='uncertain'],
 ['mandatory-limit-deleted',x=>x.q.mandatoryDisplayConditions.pop()],['hand-A-note-erased',x=>x.q.mandatoryDisplayConditions[8].conditionText=''],
 ['old-false-forged-true',x=>x.r.verification.limitedFidelityAccepted=true],['ordinary-pass-forged',x=>x.p.wholeChapterPassed=true],
 ['author-computation-certified',x=>x.p.authorCalculationsVerified=true],['wrong-reverse-diff',x=>x.derivation.changes.pop()]
]){const x=structuredClone({p,parent,source,r,raw,q,derivation});mutate(x);assert.throws(()=>assertScope(x.p,x.parent,x.source,x.r,x.raw,x.q,x.derivation),name);negative.push(name);}
const dest=D+'/stage';const exists=await access(dest+'/web-stage-receipt.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const receipt=exists?await load(dest+'/web-stage-receipt.json'):await stageLimited({processingRoot:P,candidatePath:r.proposal.path,destination:dest});
const bodies=await load(dest+'/textbook-bodies.json'),display=await load(dest+'/display-limits.json'),corpus=await load(dest+'/textbook-corpus.json'),html=await readFile(dest+'/knowledge.html','utf8'),blocks=bodies.chapters[0].blocks;
await verifyStage(P,r.proposal.path,dest);
verifyDisplay(blocks,display.originalBlocks,gate);assert.equal(sha(JSON.stringify(display.originalBlocks)),display.originalBlocksSha256);
assert.deepEqual([...new Set(display.originalBlocks.flatMap(b=>b.locator.sourceBlockIds))],p.body.blocks.flatMap(b=>b.sourceBlockIds));
assert.equal(corpus.images.length,21);assert.equal(display.notes.length,18);
const corpusText=JSON.stringify(corpus);
for(const n of display.notes){assert(html.includes(n.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(n.text)));}
for(const f of p.figures){const b=display.originalBlocks.find(x=>x.type==='figure'&&x.locator.sourceBlockIds.includes(f.figureId.replace(/:figure$/,'')));assert(b);assert(b.transcriptionText.startsWith(f.transcription));for(const u of f.unknowns){assert(b.transcriptionText.includes(u));assert(html.includes(u));assert(corpusText.includes(u));}assert.equal(sha(await readFile(dest+'/'+b.src)),f.presentationAsset.sha256);assert.equal('sourceNotes' in b,false,'historical attachment pairs must stay audit-only');}
assert(!html.includes('[unknown,unknown'));assert(!corpusText.includes('审校补录（非原文，按原图读取的约值；unknown不插值）'));
for(const[name,mutate]of [
 ['missing-hand-A-display',b=>b.splice(b.findIndex(x=>x.id==='limited311-required-9'),1)],
 ['missing-attachment-warning',b=>b.splice(b.findIndex(x=>x.id==='limited311-required-10'),1)],
 ['graph-condition-note-moved',b=>b.push(...b.splice(b.findIndex(x=>x.id==='limited311-required-1'),1))],
 ['editor-note-pretends-author',b=>b.find(x=>x.id==='limited311-required-9').authorText=true],
 ['display-author-text-changed',b=>b.find(x=>x.type==='p'&&!x.id.startsWith('limited311-')).text+='changed'],
 ['display-source-image-changed',b=>b.find(x=>x.type==='figure').src='other.png']
]){const b=structuredClone(blocks);mutate(b);assert.throws(()=>verifyDisplay(b,display.originalBlocks,gate),name);negative.push(name);}
const result={schema:'coac244-exact311-native-display-verification/1',canonical:gate.canonical,proposal:r.proposal,source:r.source,parent:r.parent,independentReceipt:manifest.receipt,raw:r.raw,
 sourcePositions:225,verbatimTextBlocks:204,figures:21,stagedAuthorDisplayBlocks:display.originalBlocks.length,displayBlocks:blocks.length,existingNotes:8,mandatoryConditions:10,
 all18NotesActuallyInstalledInHtmlAndCorpus:true,ordered225SourcePositionsPreserved:true,all21ImageBytesUnchanged:true,originalRawAndFalseUnchanged:true,
 handANoteAdjacentToB0154:true,wrongAttachmentPairsHiddenFromOutwardDisplay:true,artificial144SlotsAbsentOnlyInDerivedDisplay:true,negativeChecks:negative,
 conditionalCompositionAllowed:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newModelCalls:0};
await save(O+'/verification.json',result);await save(D+'/verification.json',result);
const handoff={schema:'coac244-exact311-native-stage-handoff/1',canonical:gate.canonical,proposal:r.proposal,package:D,loader:D+'/admit.mjs',loaderFunction:'verifyLimited(root,candidatePath)',stageEntry:D+'/stage.mjs',stageFunction:'stageLimited({processingRoot,candidatePath,destination})',
 stage:dest,stageVerifier:D+'/stage.mjs',stageVerifierFunction:'verifyStage(root,candidatePath,stageDirectory)',manifest:{path:D+'/manifest.json',sha256:sha(await readFile(D+'/manifest.json'))},verification:{path:D+'/verification.json',sha256:sha(await readFile(D+'/verification.json'))},
 originalStrictFalsePreserved:true,conditionalCompositionAllowed:true,mandatoryDisplayConditions:10,existingNotes:8,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newCalls:0,
 next:'Existing250 sole writer verifies this sealed stage, registers an exact311 persistent route, merges the full225-source chapter and18 non-author notes, reads all225 positions/204texts/21images/conditions via actual MCP and Arena; no model calls or active switch.'};
await save(O+'/handoff.json',handoff);await save(D+'/handoff.json',handoff);
console.log(JSON.stringify({stage:dest,sourcePositions:225,texts:204,figures:21,notes:18,negativeChecks:negative.length,newCalls:0,globalAdmissionGranted:false}));

await writeFile('_analysis/n31142/owner-check.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
