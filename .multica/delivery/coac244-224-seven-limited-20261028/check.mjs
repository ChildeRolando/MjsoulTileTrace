import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-224-seven-limited-20261028',O=fileURLToPath(new URL('./',import.meta.url)),load=async p=>JSON.parse(await readFile(p));
const {verifyLimited,assertScope,table,sha}=await import(pathToFileURL(D+'/admit.mjs')),{stageLimited,verifyDisplay}=await import(pathToFileURL(D+'/stage.mjs'));
const m=await load(D+'/manifest.json'),r=await load(m.receipt.path),c=await load(r.candidate.path),p=await load(r.parent.path),raw=await load(r.raw.path),oldRaw=await load(r.parentRaw.path),q=await load(m.proposal.path),proof=r.productionProof;
const gate=await verifyLimited(P,r.candidate.path),negative=[];
for(const[name,run]of [['wrong-parent-file',()=>verifyLimited(P,r.parent.path)],['wrong-root',()=>verifyLimited(P+'/other',r.candidate.path)]]){await assert.rejects(run);negative.push(name);}
for(const[name,mutate]of [
 ['wrong-source',x=>x.c.source.sourceSha256='0'.repeat(64)],['wrong-parent-pin',x=>x.r.parent.sha256='0'.repeat(64)],
 ['author-condition-deleted',x=>x.c.body.blocks[11].text=''],['author-source-note-rewritten',x=>x.c.body.blocks[7].text+='33.09%'],
 ['non-target-unknown-filled',x=>x.c.figures[0].transcription=x.c.figures[0].transcription.replace('约13,unknown','约13,约16')],
 ['target-seven-value-changed',x=>x.c.figures[0].transcription=x.c.figures[0].transcription.replace('unknown,约16,约16','unknown,约17,约16')],
 ['chart-unit-added',x=>x.c.figures[0].transcription=x.c.figures[0].transcription.replace('约49','约49%')],
 ['non-target-caption-changed',x=>x.c.figures[0].caption+='changed'],['original-unknown-deleted',x=>x.c.figures[0].unknowns.pop()],
 ['wrong-review-call',x=>x.raw.callId='other'],['cell-not-faithful',x=>x.raw.output.cellChecks[0].verdict='uncertain'],
 ['context-not-faithful',x=>x.raw.output.contextContinuity.verdict='uncertain'],['unknown-material',x=>x.raw.output.unknownImpacts[1].disposition='blocking'],
 ['source-note-converted',x=>x.raw.output.issues[0].severity='error'],['old-error-erased',x=>x.oldRaw.output.issues=x.oldRaw.output.issues.filter(i=>i.severity!=='error')],
 ['limit-deleted',x=>x.q.requiredDisplayLimitations.pop()],['limit-author-injection',x=>x.q.authorBodyInjection=true],
 ['unknown-slot-removed',x=>x.q.remainingUnknownCellIds.pop()],['proposal-as-installed',x=>x.q.implementationVerified=true],['chapter-pass-fabricated',x=>x.r.wholeChapterPassed=true]
]){const x=structuredClone({c,p,raw,oldRaw,r,q,proof});mutate(x);assert.throws(()=>assertScope(x.c,x.p,x.raw,x.oldRaw,x.r,x.q,x.proof),name);negative.push(name);}
const dest=D+'/stage',exists=await access(dest+'/web-stage-receipt.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const receipt=exists?await load(dest+'/web-stage-receipt.json'):await stageLimited({processingRoot:P,candidatePath:r.candidate.path,destination:dest});
const bodies=await load(dest+'/textbook-bodies.json'),display=await load(dest+'/display-limits.json'),corpus=await load(dest+'/textbook-corpus.json'),html=await readFile(dest+'/knowledge.html','utf8'),blocks=bodies.chapters[0].blocks;
verifyDisplay(blocks,display.originalBlocks,gate);for(const n of display.notes){assert(html.includes(n.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(n.text)));}
assert.deepEqual([...new Set(display.originalBlocks.flatMap(b=>b.locator.sourceBlockIds))],c.body.blocks.flatMap(b=>b.sourceBlockIds));
assert.equal(corpus.images.length,1);assert.equal(sha(JSON.stringify(display.originalBlocks)),display.originalBlocksSha256);
for(const t of ['36.765%','一人','尚未听牌','30%','放过似乎是有效的']){assert(c.body.blocks.some(b=>b.text?.includes(t)),t);assert(html.includes(t),t);assert(corpus.units.some(u=>JSON.stringify(u).includes(t)),t);}
assert(!html.includes('33.09'));const stagedFigure=display.originalBlocks.find(b=>b.type==='figure');assert(stagedFigure.transcriptionText.startsWith(c.figures[0].transcription));
for(const u of c.figures[0].unknowns){assert(stagedFigure.transcriptionText.includes(u));assert(html.includes(u));assert(corpus.units.some(x=>JSON.stringify(x).includes(u)));}
for(const[name,mutate]of [
 ['note-missing',b=>b.splice(b.findIndex(x=>x.id==='limited224-1'),1)],['note-changed',b=>b.find(x=>x.id==='limited224-6').text='105 points verified'],
 ['note-author-flag',b=>b.find(x=>x.id==='limited224-5').authorText=true],['note-wrong-slot',b=>b.push(...b.splice(b.findIndex(x=>x.id==='limited224-1'),1))],
 ['author-condition-display-changed',b=>b.find(x=>x.type==='p'&&!x.id.startsWith('limited224-')).text+='changed']
]){const bs=structuredClone(blocks);mutate(bs);assert.throws(()=>verifyDisplay(bs,display.originalBlocks,gate),name);negative.push(name);}
const notesSha=sha(JSON.stringify(display.notes)),result={canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,receipt:m.receipt,raw:r.raw,inheritance:m.inheritance,ownerHandoff:m.ownerHandoff,
 sevenCells:proof.changedCells,actualRows:table(c.figures[0]),existingValuesInherited:81,remainingUnknowns:17,approximateValues:88,unchangedSourceBlocks:15,
 originalStrictVerification:{repairPassed:false,limitedUnknownOkay:false},currentStrictVerification:{repairPassed:true,limitedUnknownOkay:true,wholeChapterPassed:false},
 originalSourceNoteAndRawUnchanged:true,notesSha256:notesSha,sourceBlocks:15,authorDisplayBlocks:display.originalBlocks.length,displayBlocks:blocks.length,images:corpus.images.length,nonAuthorNotes:10,
 allTenLimitsInstalledAndActuallyReadInHtmlAndCorpus:true,all15OrderedSourceIdsRetained:true,chartUnitsNotAdded:true,sourceNoteArithmeticNotInjected:true,negativeChecks:negative,
 originalCandidateChanged:false,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newModelCalls:0,newConsumers:0};
await writeFile(O+'/verification.json',JSON.stringify(result,null,2)+'\n');
await writeFile(O+'/handoff.json',JSON.stringify({canonical:r.canonical,candidate:r.candidate,package:D,loader:D+'/admit.mjs',loaderFunction:'verifyLimited(root,candidatePath)',stageEntry:D+'/stage.mjs',stageFunction:'stageLimited(options)',stage:dest,
 manifest:D+'/manifest.json',verification:D+'/verification.json',existing250Wakeup:'01a1820d-5a5b-791e-9505-0f3b62bc570d',existing250Run:'01a1820e-a904-7422-8df5-d04e1afb08ff',onlyExisting250Writer:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newCalls:0,newConsumers:0},null,2)+'\n');
console.log(JSON.stringify({sourceBlocks:15,authorDisplayBlocks:display.originalBlocks.length,displayBlocks:blocks.length,images:corpus.images.length,notes:10,negativeChecks:negative.length,newCalls:0,globalAccepted:false}));
