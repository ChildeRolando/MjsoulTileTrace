import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-201-limited-display-20261028',O=fileURLToPath(new URL('./',import.meta.url));
const load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const {verify201Limited,assert201Scope}=await import(pathToFileURL(D+'/admit201.mjs'));
const {stage201Limited,verify201Display}=await import(pathToFileURL(D+'/stage201.mjs'));
const manifest=await load(D+'/manifest.json'),r=await load(manifest.receipt.path),c=await load(r.candidate.path),p=await load(r.parent.path),old=await load(r.parentAudit.path),raw=await load(r.raw.path),proposal=await load(manifest.proposal.path);
const gate=await verify201Limited(P,r.candidate.path);assert.equal(gate.ordinaryWholeArticlePassed,false);
const negative=[];
await assert.rejects(()=>verify201Limited(P,r.parent.path));negative.push({name:'actual-wrong-parent-file',rejected:true});
await assert.rejects(()=>verify201Limited(P+'/other',r.candidate.path));negative.push({name:'actual-wrong-processing-root',rejected:true});
for(const[name,mutate]of [
 ['wrong-source',c=>c.source.sourceSha256='0'.repeat(64)],['translation-not-faithful',(_,r)=>r.output.translation.verdict='needs-repair'],
 ['unknown-requires-resolution',(_,r)=>r.output.carriedIssue.requiresResolvedMeaningOrExactTileForAuthorArgument=true],
 ['uncertain-downgraded',(_,r)=>r.output.issues[0].severity='source-note'],['author-condition-lost',(_,r)=>r.output.argumentChecks[0].faithfulWithCurrentLimitation=false],
 ['figure-guessed',c=>c.figures[0].transcription=c.figures[0].transcription.replace('?m','5m')],['unknown-deleted',c=>c.figures[0].unknowns=[]],
 ['unrequested-body-change',c=>c.body.blocks[6].text+='changed'],['source-old-parenthetical-deleted',c=>c.body.blocks[5].text=c.body.blocks[5].text.replace('（这句话不好翻译，总之是形容蠢）','')],
 ['source-old-wording-deleted',c=>c.body.blocks[5].text=c.body.blocks[5].text.replace('和亲家对日','')],
 ['five-limits-missing',(_,__,q)=>q.requiredDisplayLimitations.pop()],['proposal-as-author',(_,__,q)=>q.authorBodyInjection=true],
 ['wrong-full-object-hash',(_,__,q)=>q.figureBindings[0].fullFigureSha256='0'.repeat(64)],['false-already-installed',(_,__,q)=>q.implementationVerified=true]
 ]){const cc=structuredClone(c),rr=structuredClone(raw),q=structuredClone(proposal);mutate(cc,rr,q);assert.throws(()=>assert201Scope(cc,p,old,rr,q),name);negative.push({name,rejected:true});}
const hasStageReceipt=await access(D+'/stage/web-stage-receipt.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const stageReceipt=hasStageReceipt?await load(D+'/stage/web-stage-receipt.json'):await stage201Limited({processingRoot:P,candidatePath:r.candidate.path,destination:D+'/stage'});
assert.equal(stageReceipt.candidateSha256,r.candidate.sha256);assert.equal(stageReceipt.auditStatus,gate.status);
const bodies=await load(D+'/stage/textbook-bodies.json'),display=await load(D+'/stage/display-limits.json'),corpus=await load(D+'/stage/textbook-corpus.json'),html=await readFile(D+'/stage/knowledge.html','utf8'),blocks=bodies.chapters[0].blocks;
verify201Display(blocks,display.originalBlocks,gate);
for(const n of display.notes){assert(html.includes(n.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(n.text)));}
for(const text of ['日本がアメリカに戦争を挑むくらい無謀でしょう。','恐怕就像日本向美国挑起战争一样鲁莽吧。','和亲家对日','这句话不好翻译，总之是形容蠢','?m']){assert(html.includes(text),'actual HTML author/unknown preservation');assert(corpus.units.some(u=>JSON.stringify(u).includes(text)),'compiled author/unknown preservation');}
for(const[name,mutate]of [
 ['display-note-deleted',bs=>bs.splice(bs.findIndex(b=>b.id==='limited201-1'),1)],['display-note-text-changed',bs=>bs.find(b=>b.id==='limited201-3').text='absolute safety'],
 ['display-note-author-flag',bs=>bs.find(b=>b.id==='limited201-2').authorText=true],
 ['display-note-not-near-target',bs=>{const at=bs.findIndex(b=>b.id==='limited201-1');bs.push(...bs.splice(at,1));}],
 ['display-author-marks-lost',bs=>bs.find(b=>b.locator.sourceBlockIds.includes('79-bilibili-cn:cv1770179:b0007')).displaySegments=[]]
 ]){const bs=structuredClone(blocks);mutate(bs);assert.throws(()=>verify201Display(bs,display.originalBlocks,gate),name);negative.push({name,rejected:true});}
await mkdir(join(O,'evidence'),{recursive:true});
const references=[manifest.receipt,r.raw,r.candidate,r.parent,r.parentAudit,manifest.proposal,manifest.inheritance];
const archive=[];for(const[i,f]of references.entries()){const name='e'+i+'.json';await copyFile(f.path,join(O,'evidence',name));assert.equal(sha(await readFile(f.path)),f.sha256);archive.push({...f,copy:'evidence/'+name});}
const result={canonical:'79-cn-chapter-201-6',candidate:r.candidate,receipt:manifest.receipt,independentRaw:r.raw,status:'exact201-five-limit-stage-verified',
 independentConclusion:raw.output.conclusion,originalUncertainPreserved:true,sourceNotePreserved:true,originalModelIssues:raw.output.issues,
 sourceBlocks:7,originalStageBlocks:display.originalBlocks.length,displayBlocks:blocks.length,figures:corpus.images.length,
 fiveNonAuthorLimitsInstalledInStage:true,actualHtmlAndCompiledTextChecked:true,authorCandidateFileChanged:false,
 authorTextMarksImagesOrderPreservedAfterRemovingNotes:true,stageReceipt,negativeChecks:negative,archive,
 sourceMeaningAndExactSafetyNotResolved:true,wholeChapterPassed:false,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,
 globalMcpArenaReadbackRequired:true,newModelCalls:0,newProductionCalls:0,newConsumers:0,fee:null,remoteWeights:null,upstreamExecutions:null};
await writeFile(join(O,'verification.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(join(O,'handoff.json'),JSON.stringify({canonical:result.canonical,candidate:r.candidate,packagePath:D,
 loader:D+'/admit201.mjs',stageEntry:D+'/stage201.mjs',stage:D+'/stage',manifest:D+'/manifest.json',verification:D+'/verification.json',
 status:'ready-for-existing250-global-readback-and-persistent-route',existingWakeup:'01a181c8-b189-79bd-bc7b-fa373f067154',
 onlyExisting250Writer:true,newCalls:0,newConsumers:0,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false},null,2)+'\n');
console.log(JSON.stringify({newCalls:0,originalBlocks:display.originalBlocks.length,displayBlocks:blocks.length,figures:corpus.images.length,notes:5,negativeChecks:negative.length,globalAccepted:false}));
