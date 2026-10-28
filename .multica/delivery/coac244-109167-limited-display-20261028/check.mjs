import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,mkdir,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-109167-limited-display-20261028',O=fileURLToPath(new URL('./',import.meta.url));
const load=async p=>JSON.parse(await readFile(p));
const {verifyLimited,assertScope,sha}=await import(pathToFileURL(D+'/admit.mjs'));
const {stageLimited,verifyDisplay}=await import(pathToFileURL(D+'/stage.mjs'));
const contract=await load(D+'/contract.json'),manifest=await load(D+'/manifest.json'),results=[];
for(const key of ['109','167']){
 const j=contract.jobs[key],r=await load(j.receipt.path),raw=await load(r.raw.path),q=await load(j.proposal.path),c=await load(r.candidate.path),parent=await load(r.parent.path),old=await load(r.parentAudit.path);
 const gate=await verifyLimited(P,r.candidate.path);assert.equal(gate.originalStrictVerification.limitedUnknownOkay,false);
 const negatives=[];
 for(const[name,run]of [['actual-parent-file',()=>verifyLimited(P,r.parent.path)],['actual-wrong-root',()=>verifyLimited(P+'/wrong',r.candidate.path)]]){await assert.rejects(run);negatives.push(name);}
 for(const[name,mutate]of [
  ['wrong-source',(c)=>c.source.sourceSha256='0'.repeat(64)],['author-condition-deleted',c=>c.body.blocks.at(-1).text=''],
  ['unknown-guessed',c=>c.figures.find(f=>f.figureId===j.unknownFigure).transcription+=' 1m'],
  ['unknown-deleted',c=>c.figures.find(f=>f.figureId===j.unknownFigure).unknowns.pop()],
  ['caption-changed',c=>c.figures[0].caption+='changed'],['image-order-changed',c=>c.body.blocks.reverse()],
  ['wrong-call',(_,r)=>r.callId='other'],['repair-rejected',(_,r)=>r.output.repairChecks[0].verdict='needs-repair'],
  ['context-rejected',(_,r)=>r.output.contextContinuity.faithful=false],['whole-pass-forged',(_,r)=>r.output.wholeChapterAccepted=true],
  ['unknown-needs-exact',(_,r)=>r.output.unknownImpacts[0].requiresExactTile=true],['contribution-not-faithful',(_,r)=>r.output.unknownImpacts[0].faithfulWithExplicitUnknown=false],
  ['unknown-row-missing',(_,r)=>r.output.unknownImpacts.pop()],['context-target-lost',(_,r)=>r.output.unknownImpacts[0].sourceBlockIds.pop()],
  ['uncertain-downgraded',(_,r)=>r.output.issues[0].severity='source-note'],['uncertain-deleted',(_,r)=>r.output.issues=[]],
  ['limit-missing',(_,__,q)=>q.requiredDisplayLimitations.pop()],['annotation-as-author',(_,__,q)=>q.authorBodyInjection=true],
  ['figure-hash-forged',(_,__,q)=>q.figureBindings[0].fullFigureSha256='0'.repeat(64)],['wrong-canonical',(_,__,q)=>q.canonical='other']
 ]){const cc=structuredClone(c),rr=structuredClone(raw),qq=structuredClone(q);mutate(cc,rr,qq);assert.throws(()=>assertScope(key,cc,parent,old,rr,qq,j),name);negatives.push(name);}
 const dest=D+'/stage'+key,exists=await access(dest+'/web-stage-receipt.json').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
 const stageReceipt=exists?await load(dest+'/web-stage-receipt.json'):await stageLimited({processingRoot:P,candidatePath:r.candidate.path,destination:dest});
 assert.equal(stageReceipt.candidateSha256,r.candidate.sha256);assert.equal(stageReceipt.auditStatus,gate.status);
 const bodies=await load(dest+'/textbook-bodies.json'),display=await load(dest+'/display-limits.json'),corpus=await load(dest+'/textbook-corpus.json'),html=await readFile(dest+'/knowledge.html','utf8'),blocks=bodies.chapters[0].blocks;
 verifyDisplay(blocks,display.originalBlocks,gate);
 for(const n of display.notes){assert(html.includes(n.text));assert(corpus.units.some(u=>JSON.stringify(u).includes(n.text)));}
 const target=c.figures.find(f=>f.figureId===j.unknownFigure);
 for(const u of target.unknowns){assert(html.includes(u));assert(corpus.units.some(u0=>JSON.stringify(u0).includes(u)));}
 const terms=key==='109'?['少数时候','3饼','4饼']:['零风险','7饼'];
 for(const t of terms){assert(c.body.blocks.some(b=>b.text?.includes(t)));assert(html.includes(t));assert(corpus.units.some(u=>JSON.stringify(u).includes(t)));}
 const prefix='limited'+key+'-';
 for(const[name,mutate]of [
  ['display-limit-deleted',bs=>bs.splice(bs.findIndex(b=>b.id===prefix+'1'),1)],
  ['display-limit-altered',bs=>bs.find(b=>b.id===prefix+'1').text='absolute safety'],
  ['display-author-forged',bs=>bs.find(b=>b.id===prefix+'1').authorText=true],
  ['display-limit-not-near',bs=>bs.push(...bs.splice(bs.findIndex(b=>b.id===prefix+'1'),1))],
  ['display-author-modified',bs=>bs.find(b=>!b.id.startsWith(prefix)&&b.type==='p').text+='changed']
 ]){const bs=structuredClone(blocks);mutate(bs);assert.throws(()=>verifyDisplay(bs,display.originalBlocks,gate),name);negatives.push(name);}
 await mkdir(O+'/evidence',{recursive:true});const refs=[j.receipt,r.raw,r.candidate,r.parent,r.parentAudit,j.proposal,j.inheritance],archive=[];
 for(const[i,f]of refs.entries()){const name=key+'e'+i+'.json';assert.equal(sha(await readFile(f.path)),f.sha256);await copyFile(f.path,O+'/evidence/'+name);archive.push({...f,copy:'evidence/'+name});}
 const result={canonical:j.canonical,candidate:r.candidate,independentReceipt:j.receipt,raw:r.raw,status:'exact-target-editorial-limits-installed-in-isolated-stage',
  sourceBlocks:c.body.blocks.length,originalStageBlocks:display.originalBlocks.length,displayBlocks:blocks.length,figures:corpus.images.length,notes:display.notes.length,
  originalStrictVerification:r.verification,originalIssuesPreserved:true,independentUnknownImpacts:raw.output.unknownImpacts,
  actualHtmlAndCompiledCorpusChecked:true,authorBlocksImagesOrderPreserved:true,authorCandidateChanged:false,archive,
  stageReceipt,negativeChecks:negatives,globalAdmissionGranted:false,ordinaryWholeArticlePassed:false,globalMcpArenaReadbackRequired:true,newModelCalls:0,newProductionCalls:0,newConsumers:0};
 await writeFile(O+'/verification'+key+'.json',JSON.stringify(result,null,2)+'\n');results.push(result);
}
await writeFile(O+'/handoff.json',JSON.stringify({packagePath:D,manifest:D+'/manifest.json',loader:D+'/admit.mjs',loaderFunction:'verifyLimited(root,candidatePath)',
 stageEntry:D+'/stage.mjs',stageFunction:'stageLimited(options)',stages:results.map(r=>({canonical:r.canonical,candidate:r.candidate,stage:D+'/stage'+r.canonical.split('-')[3],sourceBlocks:r.sourceBlocks,displayBlocks:r.displayBlocks,notes:r.notes,figures:r.figures})),
 originalStrictFalsePreserved:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,existing250Wakeups:['01a181ca-b11e-7bfe-b58e-32e3ad8aae60','01a181cb-dd6c-7383-93ba-7650c3d17db7'],
 onlyExisting250Writer:true,newConsumers:0,newModelCalls:0,actualGlobalReadbackRequired:true},null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({canonical:r.canonical,blocks:r.displayBlocks,figures:r.figures,notes:r.notes,negativeChecks:r.negativeChecks.length,newCalls:0,globalAccepted:false}))));
