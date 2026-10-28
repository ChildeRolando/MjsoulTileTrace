import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as entry from './entry.mjs';
const owner='01a17cae-06e4-7b30-a93f-3a030d1ae63f',load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const x=await entry.inputs(owner),candidate=await load(x.p.candidatePath),events=(await load(x.p.export.path)).events,checks=[];
for(const[name,mutate]of [
 ['withdrawn',e=>e.result.status='withdrawn'],['unclear',e=>e.result.status='unclear'],
 ['missing-image',e=>e.result.status='missing'],['changed-code',e=>e.result.tiles=['9m']],
 ['inference-note-change',e=>e.result.note='inferred'],['wrong-target',e=>e.targetId+='wrong'],
 ['wrong-image',e=>e.imageSha256='bad'],['newer-save',e=>e.revision++],
 ]){const es=structuredClone(events),e=es.findLast(e=>e.id===x.p.facts[0].itemId);mutate(e);assert.throws(()=>entry.validateFacts(x.p,es));checks.push(name);}
for(const[name,mutate]of [
 ['wrong-human-value',c=>c.figures[0].transcription=c.figures[0].transcription.replace('3m 3m 6m 6m 8m 6p','3m 3m 6m 6m 8m 5p')],
 ['body-changed',c=>c.body.blocks[0].text+='bad'],['other-figure',c=>c.figures[1].caption+='bad'],
 ['unknown-deleted',c=>c.figures[0].unknowns=[]],['caption-changed',c=>c.figures[0].caption+='bad'],
 ['first-nine-changed',c=>c.figures[0].transcription=c.figures[0].transcription.replace('第1张为2z','第1张为6z')],
 ['source-changed',c=>c.source.page=256],['fake-model-provenance',c=>c.provenance.humanSecondBatch257.modelProduced=true],
 ['old-provenance-deleted',c=>delete c.provenance.humanDerivation],['self-hash-changed',c=>c.candidateSha256='bad']
 ]){const c=structuredClone(candidate);mutate(c);assert.throws(()=>entry.validateCandidate(c,x));checks.push(name);}
await assert.rejects(()=>entry.inputs('wrong-owner'));checks.push('wrong-owner');
entry.validateFacts(x.p,events);entry.validateCandidate(candidate,x);
const verified=await entry.verify(owner);assert.deepEqual(verified,await load(entry.D+'/receipt.json'));
const request=await entry.request(owner);assert.deepEqual(request,await load(entry.D+'/review-request.json'));
assert.deepEqual(request.images,[]);assert.equal(request.model,'gpt-6.1-sol');assert.equal(request.reasoningEffort,'high');
assert.equal(verified.changes.length,10);assert.equal(verified.events.length,20);assert.equal(verified.firstNineRetained,true);
assert.equal(verified.displayCount.overFour[0].positions.filter(p=>p.humanItemId).length,4);
assert(verified.displayCount.overFour[0].positions.some(p=>p.scope==='upper'&&p.ordinal===15&&!p.humanItemId));
const output={passed:true,negativeCases:checks,negativeCount:checks.length,requestImages:[],model:request.model,reasoningEffort:request.reasoningEffort,
 candidate:verified.candidate,determinate:20,unclear:0,missing:0,withdrawn:0,changed:10,confirmedUnchanged:10,
 firstNineRetained:true,nonTargetBodyAnd3FiguresAndAllImagesAnd4UnknownsUnchanged:true,
 source261Status:verified.source261Verification,reusedPages:11,reusedBlocks:837,newModelCalls:0,newProductionCalls:0,newVisionCalls:0,
 request:{path:entry.D+'/review-request.json',sha256:sha(await readFile(entry.D+'/review-request.json')),promptSha256:sha(request.prompt),schemaSha256:sha(JSON.stringify(request.schema))},
 wholeChapterPassed:false,admissionGranted:false};
await writeFile(import.meta.dirname+'/checks.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output));
