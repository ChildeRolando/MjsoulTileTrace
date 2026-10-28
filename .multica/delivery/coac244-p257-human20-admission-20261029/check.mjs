import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-p257-human20-admission-20261029',O=fileURLToPath(new URL('./',import.meta.url));
const {verifyLimited,assertScope,load,sha}=await import(pathToFileURL(D+'/admit.mjs')),{stageLimited,verifyStage,verifyDisplay,installOriginalImageLinks}=await import(pathToFileURL(D+'/stage.mjs'));
const m=await load(D+'/manifest.json'),r=await load(m.receipt.path),c=await load(r.candidate.path),parent=await load(r.parent.path),source=await load(r.source.path),raw=await load(r.raw.path),q=await load(m.scope.path),application=r.applicationEvidence;
const g=await verifyLimited(P,r.candidate.path),negative=[];
const {allowInheritedSourceLimit}=await import(pathToFileURL(D+'/assembly.mjs'));
for(const[page,id]of [[253,'nemata-jp-p253-r17'],[258,'nemata-jp-p258-r7']]){const row=g.reuse.find(x=>x.page===page),fig=(await load(row.candidate.path)).figures.find(f=>f.figureId===id),p={sourceId:'nemata-jp',page:{page},audit:{status:'passed'}};assert(allowInheritedSourceLimit(p,fig));assert(!allowInheritedSourceLimit({...p,audit:{status:'needs-repair'}},fig));assert(!allowInheritedSourceLimit(p,{...fig,transcription:fig.transcription+'changed'}));assert(!allowInheritedSourceLimit(p,{...fig,croppedImageSha256:'0'.repeat(64)}));negative.push('inherited-source-limit-'+page+'-wrong-status','inherited-source-limit-'+page+'-changed-transcription','inherited-source-limit-'+page+'-wrong-image');}
for(const[name,fn]of [['wrong-root',()=>verifyLimited(P+'/other',r.candidate.path)],['wrong-candidate-sha',()=>verifyLimited(P,r.parent.path)]]){await assert.rejects(fn);negative.push(name);}
for(const[name,mutate]of [
 ['wrong-source-sha',x=>x.r.source.sha256='0'.repeat(64)],['wrong-source-pdf',x=>x.c.source.pdfSha256='0'.repeat(64)],['wrong-parent-sha',x=>x.r.parent.sha256='0'.repeat(64)],
 ['wrong-canonical',x=>x.q.canonical='79-cn-chapter-257-1'],['author-text-modified',x=>x.c.body.blocks[1].text+='changed'],['non-target-figure-changed',x=>x.c.figures[1].caption+='changed'],
 ['hidden-unknown-dropped',x=>x.c.figures[0].unknowns.pop()],['human-applied-to-wrong-position',x=>x.application.changes.pop()],['first-nine-erased',x=>x.application.firstNineRetained=false],
 ['count-treated-as-physical',x=>x.application.displayCount.physicalMultiplicityCertified=true],['upper15-guess',x=>x.c.figures[0].transcription=x.c.figures[0].transcription.replace('第13—16张为7s 1m 6p 1p','第13—16张为7s 1m 5p 1p')],
 ['wrong-original-call',x=>x.raw.callId='other'],['image-review-fabricated',x=>x.raw.requestExecution.images=['fake.png']],['application-not-faithful',x=>x.raw.output.applications[0].faithful=false],
 ['Q9-not-faithful',x=>x.raw.output.authorArgumentFaithful=false],['uncertain-deleted',x=>x.raw.output.issues=x.raw.output.issues.filter(z=>z.severity!=='uncertain')],
 ['mandatory-limit-deleted',x=>x.q.requiredDisplayLimitations.pop()],['preflight-forged',x=>x.r.preflight={path:'invented'}],['missing-history-substituted',x=>x.r.recovery.currentPointersSubstitutedForHistoricalSnapshots=true],
 ['whole-page-pass-forged',x=>x.r.wholeChapterPassed=true]
]){const x=structuredClone({c,parent,source,r,raw,q,application});mutate(x);assert.throws(()=>assertScope(x.c,x.parent,x.source,x.r,x.raw,x.q,x.application),name);negative.push(name);}
const dest=D+'/stage',exists=await access(dest+'/pdf-stage-receipt.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
if(!exists)await stageLimited({processingRoot:P,candidatePath:r.candidate.path,destination:dest});
await installOriginalImageLinks({processingRoot:P,directory:dest});
const staged=await verifyStage(P,r.candidate.path,dest),display=await load(dest+'/display-limits.json'),bodies=await load(dest+'/textbook-bodies.json'),blocks=bodies.chapters[0].blocks;
for(const[name,mutate]of [
 ['limit-missing',b=>b.splice(b.findIndex(x=>x.id==='p257-human20-limit-2'),1)],['limit-wrong-anchor',b=>b.push(...b.splice(b.findIndex(x=>x.id==='p257-human20-limit-2'),1))],
 ['note-pretends-author',b=>b.find(x=>x.id==='p257-human20-limit-3').authorText=true],['unconfirmed6p-hidden',b=>b.find(x=>x.id==='p257-human20-limit-2').text='hidden hand unknown'],
 ['Q9-text-changed',b=>b.find(x=>x.sourceBlockIds?.includes('nemata-jp-p257-b1')).text+='all proven'],['image-changed',b=>b.find(x=>x.id==='nemata-jp-p257-r1').src='wrong.png'],
 ['raw-source-link-changed',b=>b.find(x=>x.id==='p257-human20-limit-5').displaySegments.find(s=>s.href).href='wrong.png']
]){const b=structuredClone(blocks);mutate(b);assert.throws(()=>verifyDisplay(b,display.originalBlocks,g,c,display.links),name);negative.push(name);}
const originalSourceIds=[...new Set(display.originalBlocks.flatMap(b=>b.sourceBlockIds??[]))],q9=[...Array.from({length:14},(_,i)=>'nemata-jp-p256-b'+(i+27)),...['nemata-jp-p257-b1','nemata-jp-p257-b2','nemata-jp-p257-b3','nemata-jp-p257-b4']];
assert.deepEqual(originalSourceIds.filter(x=>q9.includes(x)),q9,'full18 ordered Q9 source context');
const result={...staged,bindings:m.files.length,negativeChecks:negative,allSixLimitsActuallyInHtmlAndCorpus:true,full18OrderedQ9SourcePositionsRetained:true,allHuman20ApplicationAndFirstNineVerified:true,
 oldUpper15SixPUncertainRetained:true,missingOriginalPreflightAcknowledgedNotRebuilt:true,reused261:g.source261,other11Pages837BlocksVerified:true,allOriginalImagesAndCropReferencesRetained:true,
 corpusSha256:sha(await readFile(dest+'/textbook-corpus.json')),htmlSha256:sha(await readFile(dest+'/knowledge.html')),stageReceipt:{path:dest+'/pdf-stage-receipt.json',sha256:sha(await readFile(dest+'/pdf-stage-receipt.json'))}};
await writeFile(O+'/verification.json',JSON.stringify(result,null,2)+'\n');await writeFile(D+'/verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceBlocksOwned:staged.sourceBlocksOwned,displayBlocks:staged.displayBlocks,figures:staged.figures,limits:6,negativeChecks:negative.length,newCalls:0,globalAdmitted:false}));
