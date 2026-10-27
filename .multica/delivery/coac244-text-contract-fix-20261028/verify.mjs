import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=import.meta.dirname,paths=JSON.parse(await readFile(join(here,'paths.json'),'utf8')),root=paths.root;
const {jobs}=JSON.parse(await readFile(join(here,'exact-text-contracts.json'),'utf8'));
const batch=JSON.parse(await readFile(join(root,'web-production/v1/runs/coac269-text-183236-20261028/batch-result.json'),'utf8'));
const {validateExactTextOutput}=await import(pathToFileURL(join(paths.runtime,'exact-text-contract.mjs')));
const {verifyWebProductionCall}=await import(pathToFileURL(join(paths.base,'textbook-audit-web.mjs')));
const sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
function ok(name,fn){fn();checks.push({name,passed:true});}
const ledger=join(root,'web-production/v1/calls.jsonl'),ledgerBefore=sha(await readFile(ledger));
const runner=await readFile(join(paths.runtime,'textbook-production-web.mjs'),'utf8');
ok('identical modelRequest object goes to invoke, not a prompt-only preview',()=>assert(runner.includes('call=await invokeTextbookCodex(modelRequest);')));
ok('raw/ledger preserved before validation, validation before paragraph assignment/candidate creation',()=>assert(runner.indexOf('validateExactTextOutput(exactRequest.job,call.output)')>runner.indexOf('attempts.push(record)')&&runner.indexOf('validateExactTextOutput(exactRequest.job,call.output)')<runner.indexOf('const byId=new Map(translated')));
const results=[];
for(const [index,job]of jobs.entries()){
 const old=batch.chapters[index],rawBytes=await readFile(old.raw.path),raw=JSON.parse(rawBytes);
 assert.equal(sha(rawBytes),old.raw.sha256);assert.equal(sha(raw.rawLastMessage),old.calls[0].outputSha256);
 const targetOutput=raw.parsedOutput.translations.find(t=>t.sourceBlockId===job.targetId);
 const args=[join(paths.runtime,'textbook-production-web.mjs'),'--source',job.source.path,'--revision-from',job.parent.path,'--revision-notes',job.parentAudit.path,'--dictionary',join(root,'web-production/v1/dictionaries/modern-accepted-tiles-c33800d79e603fff8d31dfccb7cf26b648f8f9765af7ec01e8beb0f10805ed2a.json'),'--variant','exactcontractv2proof'+(index+1)];
 const r=spawnSync(process.execPath,[...args,'--request-only','true'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);
 const built=JSON.parse(r.stdout);await writeFile(join(here,`${index?'236':'183'}-actual-request-boundary.json`),JSON.stringify(built,null,2)+'\n');
 ok(job.chapterId+' approved full parent and annotation present in CLI-wrapped stdin',()=>{assert(built.closedPrompt.includes(job.editorialNote));assert(built.closedPrompt.includes(JSON.stringify(job.parentText)));assert(built.closedPrompt.includes('校注（非原文）'));assert(!built.closedPrompt.includes('Translate this complete Japanese textbook article'));});
 ok(job.chapterId+' exact full text enum, one target, zero figures/images',()=>{assert.deepEqual(built.request.schema.properties.translations.items.properties.text.enum,[job.expectedText]);assert.deepEqual(built.request.images,[]);assert.equal(built.request.schema.properties.translations.maxItems,1);assert.equal(built.request.schema.properties.figures.maxItems,0);});
 const good={translations:[{sourceBlockId:job.targetId,text:job.expectedText}],figures:[]};
 ok(job.chapterId+' exact synthetic approved output accepted (no candidate or model claim)',()=>validateExactTextOutput(job,good));
 for(const [name,mutate,reason]of [
  ['missing note',x=>x.translations[0].text=job.approvedAuthorText,/editorial_note_missing/],
  ['changed author text',x=>x.translations[0].text='越界'+x.translations[0].text,/outside_whitelist/],
  ['changed punctuation',x=>x.translations[0].text=x.translations[0].text.replace('。','！'),/outside_whitelist/],
  ['foreign target',x=>x.translations.push({sourceBlockId:'foreign',text:'foreign'}),/output_scope/],
  ['figure added',x=>x.figures.push({sourceBlockId:'foreign'}),/output_scope/],
  ['changed note',x=>x.translations[0].text=x.translations[0].text.replace('非原文','原文'),/editorial_note_missing/]]){
  ok(job.chapterId+' rejects '+name,()=>{const x=structuredClone(good);mutate(x);assert.throws(()=>validateExactTextOutput(job,x),reason);});
 }
 ok(job.chapterId+' original actual failed raw rejected by output gate',()=>assert.throws(()=>validateExactTextOutput(job,raw.parsedOutput),/editorial_note_missing/));
 const replay=spawnSync(process.execPath,[...args,'--validate-existing-raw',old.raw.path],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
 ok(job.chapterId+' actual producer CLI rejects original raw before dispatch',()=>{assert.notEqual(replay.status,0);assert(replay.stderr.includes('exact_text_editorial_note_missing_raw_preserved'));});
 // A parent+only-approved-target probe is in memory only: existing verifier must reject the invented raw provenance.
 const proposed=JSON.parse(await readFile(old.candidatePath,'utf8'));proposed.body.blocks.find(b=>b.sourceBlockIds[0]===job.targetId).text=job.expectedText;
 const content={...proposed};delete content.candidateSha256;proposed.candidateSha256=sha(JSON.stringify(content));
 let derivationRejection;try{await verifyWebProductionCall(root,proposed);}catch(e){derivationRejection=String(e);}
 ok(job.chapterId+' existing evidence contract rejects synthetic composite',()=>assert.match(derivationRejection??'',/web_production_translation_not_from_bound_output/));
 results.push({chapterId:job.chapterId,callId:old.calls[0].callId,raw:old.raw,oldPromptSha256:old.calls[0].promptSha256,oldSemanticPrompt:raw.semanticPrompt,oldRequestPrompt:raw.requestPrompt,oldOutput:raw.parsedOutput,targetBefore:job.parentText,targetAfter:targetOutput.text,preciseContractInOldRequest:raw.requestPrompt.includes(job.editorialNote),oldContainsAnnotationSuggestions:raw.requestPrompt.includes('校注'),oldContainsQuotedParent:raw.requestPrompt.includes(JSON.stringify(job.parentText)),newRequestSha256:sha(built.closedPrompt),newRequestArtifact:`${index?'236':'183'}-actual-request-boundary.json`,actualProducerReplay:{exitCode:replay.status,stderr:replay.stderr},derivationRejection,compositeSaved:false,rawUnchanged:sha(await readFile(old.raw.path))===old.raw.sha256});
}
const ledgerAfter=sha(await readFile(ledger));
ok('no new calls appended by actual request construction or raw replay',()=>assert.equal(ledgerAfter,ledgerBefore));
await writeFile(join(here,'request-output-investigation.json'),JSON.stringify({modelCalls:0,oldCallsUsed:2,unusedFirstAudits:2,checks,results,rootCause:'quoted prior audit already suggests annotations and quoted context contains parent; approved exact whitelist and explicitly non-author mandatory note were not bound as instructions/schema; top instruction remained generic Japanese retranslation and prior audit was only a locator; exact whitelist was external after candidate write',derivation:{legalUnderExistingContract:false,reason:'original raw has no editorial annotation; proposed parent+unique-target+annotation is not identical to the real target output; only preexisting inline155-specific normalization exists, cannot reuse for these Japanese paragraphs or claim a new raw',additionalProductionCallsRequired:2,originalUnusedIndependentAudits:2,minimumFutureLocalCalls:4,batchLifetimeMaximumIfApproved:6,automaticRetry:0}},null,2)+'\n');
console.log(JSON.stringify({passedChecks:checks.length,actualRequestBoundaryArtifacts:2,actualProducerOldRawRejections:2,existingEvidenceContractRejections:2,modelCalls:0}));
