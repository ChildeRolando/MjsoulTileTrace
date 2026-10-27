// Verify and record existing review evidence only. This file has no model dispatch path.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',out=import.meta.dirname;
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks=[];
async function bound(ref){const bytes=await readFile(ref.path);assert.equal(sha(bytes),ref.sha256,ref.path);checks.push(ref);return bytes;}
const handoffRef={path:join(root,'integration/coac249-reviewed-exact-183236-20261028.json'),sha256:'5f18539ffe7bdda16cbceb5306797209a98fbf1ed711b2da39fd8b966f6ebee5'};
const handoffBytes=await bound(handoffRef),handoff=JSON.parse(handoffBytes);
assert.equal(handoff.lifetimeBatchCalls,6);assert.equal(handoff.remainingAuditOrProductionAllowance,0);
const supplementBytes=await bound(handoff.sourceContextSupplement),supplement=JSON.parse(supplementBytes);
const manifest=JSON.parse(await bound(handoff.runtimeManifest));
for(const f of manifest.files)await bound(f);
const runtime=dirname(handoff.runtimeManifest.path);
const {webTargetTextProjection,validateTargetTextReview,mergeTargetTextReview,verifyWebProductionCall}=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')));
const {auditTransportCompleted}=await import(pathToFileURL(join(runtime,'textbook-audit.mjs')));
const ledger=(await readFile(join(root,'audit/calls.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const old=await read(join(out,'../b12-exact-183236/batch-result.json'));
const productionCalls=[...old.priorFailedProductionCallRecords,...old.newProductionCallRecords];
assert.equal(productionCalls.length,4);
for(const c of productionCalls)await bound({path:join(root,'web-production/v1',c.rawArtifactPath),sha256:c.rawArtifactSha256});
const results=[];
for(const chapter of handoff.chapters){
 const key=chapter.chapterId==='nemata-jp-chapter-183-1'?'183':'236';
 assert(['nemata-jp-chapter-183-1','nemata-jp-chapter-236-1'].includes(chapter.chapterId));
 const candidateBytes=await bound(chapter.candidate),candidate=JSON.parse(candidateBytes);
 const auditBytes=await bound(chapter.audit),audit=JSON.parse(auditBytes);
 const rawBytes=await bound(chapter.raw),raw=JSON.parse(rawBytes),call=chapter.calls[0];
 const sourceBytes=await bound({path:join(root,candidate.source.sourcePath),sha256:candidate.source.sourceSha256}),source=JSON.parse(sourceBytes);
 const revision=candidate.provenance.revision;
 const parent=JSON.parse(await bound({path:join(root,revision.parentPath),sha256:revision.parentSha256}));
 const notes=JSON.parse(await bound({path:join(root,revision.notesPath),sha256:revision.notesSha256}));
 assert.equal(notes.modelReview.issues[0].severity,'uncertain');
 assert.equal(audit.status,'needs-repair');assert.equal(chapter.status,audit.status);
 assert.deepEqual(audit.modelReview,chapter.modelReview);
 assert.deepEqual(JSON.parse(raw.rawLastMessage),audit.modelReview);
 assert.deepEqual(raw.output,audit.modelReview);assert(auditTransportCompleted(raw));
 assert.equal(raw.callId,call.callId);assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');
 assert.deepEqual(raw.binding.originalImageAssetIds,[]);assert.deepEqual(chapter.images,[]);
 assert.equal(raw.binding.productionSha256,chapter.candidate.sha256);
 assert.equal(sha(raw.requestPrompt),call.promptSha256);assert.equal(sha(raw.prompt),call.semanticPromptSha256);
 assert.equal(sha(raw.rawLastMessage),call.outputSha256);assert.equal(sha(JSON.stringify(raw.schema)),call.schemaSha256);
 assert.deepEqual(raw.usage,call.usage);assert.equal(raw.durationMs,chapter.durationMs);
 const projection=webTargetTextProjection(source,candidate,revision.textBlockIds);
 assert.deepEqual(JSON.parse(raw.prompt.slice(raw.prompt.indexOf('{'))),projection);
 assert.equal(sha(JSON.stringify(projection)),call.binding.semanticProjectionSha256);
 assert.deepEqual(validateTargetTextReview(audit.modelReview,revision.textBlockIds),audit.modelChecks);
 const merged=mergeTargetTextReview(notes.effectiveModelReview??notes.modelReview,audit.modelReview,revision.textBlockIds,source,candidate);
 assert.deepEqual(merged.checks,audit.effectiveModelChecks);assert.deepEqual(merged.review,audit.effectiveModelReview);
 assert.equal(audit.modelChecks.passed,false);assert.equal(audit.effectiveModelChecks.passed,false);
 assert.equal(audit.modelReview.blockChecks[0].verdict,'uncertain');
 assert(audit.modelReview.issues.every(i=>i.severity==='uncertain'));
 assert.deepEqual(await verifyWebProductionCall(root,candidate),audit.productionCall);
 const expected=structuredClone(parent.body);
 const target=expected.blocks.find(b=>revision.textBlockIds.includes(b.sourceBlockIds[0]));
 target.text=candidate.body.blocks.find(b=>revision.textBlockIds.includes(b.sourceBlockIds[0])).text;
 assert.deepEqual(candidate.body,expected);assert.deepEqual(candidate.figures,parent.figures);
 const sameShaCalls=ledger.filter(c=>c.binding?.productionSha256===chapter.candidate.sha256);
 assert.equal(sameShaCalls.length,1);assert.equal(sameShaCalls[0].callId,call.callId);
 let boundaryBytes,boundaryEvidenceSource=chapter.execution.boundary.path;
 try{boundaryBytes=await bound(chapter.execution.boundary);}catch(e){
  if(e.code!=='ENOENT')throw e;
  // The original private review worktree has been reclaimed. Recover immutable
  // bytes from the reviewer's existing commit, verifying the original bound SHA.
  boundaryEvidenceSource=`722b23e:.multica/delivery/coac249-text-183236-20261028/chapter-${key}/request-boundary.json`;
  boundaryBytes=execFileSync('git',['show',boundaryEvidenceSource]);
  assert.equal(sha(boundaryBytes),chapter.execution.boundary.sha256);
  checks.push({...chapter.execution.boundary,recoveredFromGit:boundaryEvidenceSource});
 }
 assert(chapter.execution.commandLine.includes('--model gpt-6.1-sol'));
 assert(!chapter.execution.commandLine.includes(' -i '));
 if(key==='183'){
  assert.deepEqual(projection.source.blocks.map(b=>b.id),supplement.defaultReviewProjectionIds);
  for(const block of supplement.sourceExcerpts)assert.deepEqual(source.blocks.find(b=>b.id===block.id),block);
  for(const id of supplement.missingStatisticsInOriginalReview)assert(!projection.source.blocks.some(b=>b.id===id));
  await bound(supplement.source);await bound(supplement.html);await bound(supplement.main);
 }
 await writeFile(join(out,`${key}-audit.json`),auditBytes);
 await writeFile(join(out,`${key}-audit-raw.json`),rawBytes);
 await writeFile(join(out,`${key}-request-boundary.json`),boundaryBytes);
 results.push({chapterId:chapter.chapterId,candidate:chapter.candidate,audit:chapter.audit,raw:chapter.raw,
  status:audit.status,verdict:'uncertain',callId:call.callId,modelChecks:audit.modelChecks,effectiveModelChecks:audit.effectiveModelChecks,
  newCallsThisRun:0,boundaryEvidenceSource,projectionSourceIds:projection.source.blocks.map(b=>b.id)});
}
const calls=[...productionCalls,...handoff.chapters.flatMap(j=>j.calls)];assert.equal(calls.length,6);
assert.equal(new Set(calls.map(c=>c.callId)).size,6);
const usage=Object.fromEntries(['inputTokens','cachedInputTokens','outputTokens'].map(k=>[k,calls.reduce((sum,c)=>sum+c.usage[k],0)]));
await writeFile(join(out,'249-reviewed-handoff.json'),handoffBytes);
await writeFile(join(out,'183-source-context-supplement.json'),supplementBytes);
const result={schema:'coac269-terminal-exact-text-batch/1',at:new Date().toISOString(),modelCallsThisRun:0,
 status:'blocked',outcome:'both-first-independent-reviews-needs-repair-uncertain',receivedHandoff:handoffRef,
 sourceContextSupplement:handoff.sourceContextSupplement,chapters:results,actualLocalCallRecords:6,maximumLocalCalls:6,
 remainingAllowance:0,automaticRetry:0,newlyPassedChapters:0,integrationHandoffs:0,usage,calls,
 remaining:[{chapterId:'nemata-jp-chapter-183-1',targetId:'modern-yabejp-ja:chapter03-section003:b0018',
  blocker:'Independent review lacks b0007/b0008/b0011/b0012 statistics; all four exist in the bound source. The original １枚切れ１枚見え counting meaning remains unresolved.',
  nextStep:'Preserve numbers and original uncertain. Any future independent review needs an explicitly authorized new call and source/hash-bound statistics in its actual review projection; locating rows alone is not semantic approval.'},
 {chapterId:'nemata-jp-chapter-236-1',targetId:'modern-yabejp-ja:chapter04-section015:b0003',
  blocker:'巡目が僅か does not settle elapsed/early versus remaining turns; disclosing the ambiguity is not resolving teaching timing.',
  nextStep:'Preserve neutral text and non-author note. Obtain source-authoritative clarification before a separately authorized change or review; do not choose either reading.'}],
 monetaryCost:null,upstreamRequestCount:null,inputsUnchanged:true};
await writeFile(join(out,'terminal-result.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(join(out,'immutable-checks.json'),JSON.stringify({modelCalls:0,checksPassed:checks.length,checks},null,2)+'\n');
console.log(JSON.stringify({modelCallsThisRun:0,checksPassed:checks.length,localCalls:6,remaining:0,usage,results}));
