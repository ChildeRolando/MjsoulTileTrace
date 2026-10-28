// Read-only assessment of completed213 evidence and existing exact-scope loaders.
// No model, candidate modification, stage build, route write, or admission.
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
const P='E:/AgentData/Coach/knowledge/processing',O=fileURLToPath(new URL('./',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const refs=[['integration/coac249-213-target-impact-reviewed-20261028.json','a91fd5ef0e13a880d32e0036c87f34f341d54b4c7afa9088f636b3dc857321d8'],
 ['integration/coac249-213-scope-inheritance-20261028.json','8ff79cba55f85ca53f3ca30831683c7c9bcd7506dc74a97a6062c8af044ad2f7'],
 ['integration/coac249-213-display-and-residual-20261028.json','d5047dad1115c6c6d81d7dbb26e63e559521d8dde54a589de9f659215dc0eb06']].map(([path,sha256])=>({path:P+'/'+path,sha256}));
const bound=async r=>{const b=await readFile(r.path);assert.equal(sha(b),r.sha256,r.path);return JSON.parse(b);};
const[r,inheritance,proposal]=await Promise.all(refs.map(bound));assert.equal(r.canonical,'nemata-jp-chapter-213-1');
assert.equal(r.candidate.sha256,'a667937d4e119a1b22659fc60987f07d3eea9d246c8b2b6ddabcdacb4fe5dd47');
const c=await bound(r.candidate),p=await bound(r.parent),s=await bound(r.source),old=await bound(r.parentAudit),raw=await bound(r.raw),plan=await bound(r.plan),rt=await bound(r.runtime);
assert.equal(rt.files.length,32);const runtimeRefs=rt.files.map(f=>({path:join(dirname(r.runtime.path),f.name),sha256:f.sha256}));for(const f of runtimeRefs)assert.equal(sha(await readFile(f.path)),f.sha256);
const reviewPath=P+'/integration/coac248-193213-20261028/review.mjs',mod=await import(pathToFileURL(reviewPath));
const rebuilt=await mod.prepare193213Review(P,'213');assert.equal(JSON.stringify(rebuilt),JSON.stringify(plan));
assert.deepEqual(await mod.verify193213ReviewExecution(raw,plan),r.verification);assert.equal(r.verification.limitedEvidenceVerified,false);assert.deepEqual(r.verification.errors,['no_limited_allowance']);
assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);assert.equal(raw.callId,'c0d77d4f-25ea-401b-939e-c956e81e1713');
assert.equal(raw.model,'gpt-6.1-terra');assert.equal(raw.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,2);
for(let i=0;i<2;i++){const a=raw.requestExecution.images[i];assert.equal(sha(await readFile(a.path)),a.sha256);assert.equal((await readFile(a.path)).length,a.bytes);assert.equal(a.path,plan.images[i]);}
assert.equal(plan.projection.orderedSourceCandidateFigurePairs.length,53);assert.deepEqual(plan.projection.orderedSourceCandidateFigurePairs.map(x=>x.source),s.blocks);
const m=raw.output;assert.equal(m.textRepair.verdict,'faithful');assert.equal(m.figureRepair.verdict,'faithful');assert.equal(m.orderedContextFaithful,true);assert.equal(m.completeRequestedScopeCompared,true);
assert.equal(m.argumentChecks.length,6);assert(m.argumentChecks.every(x=>x.faithfulWithCurrentUnknown));assert.equal(m.conclusion,'target-faithful-limited-unknown-acceptable');
assert.equal(m.unknownImpact.length,4);for(const x of m.unknownImpact)assert(x.positionConfirmed&&x.displayFaithful&&x.authorArgumentFaithfulWithUnknown&&!x.requiresExactValueForAuthorArgument);
assert.deepEqual(m.issues.map(i=>i.severity),['error','error','uncertain']);
assert.equal(m.issues[0].targetId,m.textRepair.targetId);assert.equal(m.issues[1].targetId,m.figureRepair.targetId);assert.equal(m.issues[2].targetId,m.figureRepair.targetId);
assert(m.issues[0].description.includes('旧译')&&m.issues[0].description.includes('当前修订'));assert(m.issues[1].description.includes('旧图')&&m.issues[1].description.includes('当前指定替换'));
const target=c.figures.find(f=>f.figureId===m.figureRepair.targetId);assert.deepEqual(target.unknowns,m.unknownImpact.map(x=>x.unknownText));
assert.equal(c.body.blocks.length,53);assert.equal(c.figures.length,24);
for(const x of c.body.blocks)if(!x.sourceBlockIds.includes(m.textRepair.targetId))assert.deepEqual(x,p.body.blocks.find(b=>JSON.stringify(b.sourceBlockIds)===JSON.stringify(x.sourceBlockIds)));
for(const f of c.figures)if(f.figureId!==target.figureId)assert.deepEqual(f,p.figures.find(x=>x.figureId===f.figureId));
assert.deepEqual(c.source,p.source);assert.deepEqual(proposal.requiredDisplayLimitations,r.verification.requiredDisplayLimitations);assert.equal(proposal.requiredDisplayLimitations.length,8);
for(const k of ['implementationVerified','authorBodyInjection','admissionGranted','wholeChapterPassed'])assert.equal(proposal[k],false);
assert.equal(r.admissionGranted,false);assert.equal(r.wholeChapterPassed,false);
const ledger=(await readFile(P+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.deepEqual(ledger,[r.call]);
const loaderPath=P+'/integration/coac244-109167-limited-display-20261028/admit.mjs',otherLoaderPath=P+'/integration/coac244-201-limited-display-20261028/admit201.mjs';
const pairGate=await import(pathToFileURL(loaderPath)),gate201=await import(pathToFileURL(otherLoaderPath));
await assert.rejects(()=>pairGate.verifyLimited(P,r.candidate.path),/only exact two candidate SHAs/);await assert.rejects(()=>gate201.verify201Limited(P,r.candidate.path));
const oldContract=await load(P+'/integration/coac250-limited-159242-20261028/contract.json');
// The existing159/242 loader's fixed pins are source code, not a generic licence.
const oldLoaderPath=P+'/integration/coac250-limited-159242-20261028/admit.mjs',oldLoader=await readFile(oldLoaderPath,'utf8');assert(oldLoader.includes('const pins={159:'));assert(!oldLoader.includes(r.candidate.sha256));
const issues=m.issues.map((issue,i)=>({originalOutputPointer:'/issues/'+i,originalIssue:issue,originalIssueSha256:sha(JSON.stringify(issue)),
 category:i<2?'historical-error-with-current-target-faithful-evidence':'retained-unknown-with-conditional-contribution-evidence',
 resolutionEvidence:i===0?m.textRepair:i===1?m.figureRepair:m.unknownImpact,originalSeverityPreserved:true,ordinaryWholeChapterPassed:false}));
const sourceText=s.blocks.find(b=>b.id===m.textRepair.targetId),currentText=c.body.blocks.find(b=>b.sourceBlockIds.includes(m.textRepair.targetId)),parentText=p.body.blocks.find(b=>b.sourceBlockIds.includes(m.textRepair.targetId));
const contract={schema:'coac244-213-supplement-contract-assessment/1',executable:false,admissionGranted:false,implementationVerified:false,ordinaryWholeChapterPassed:false,
 canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,parentAudit:r.parentAudit,receipt:refs[0],raw:r.raw,callId:raw.callId,
 targetTextId:m.textRepair.targetId,textSha256:sha(JSON.stringify(currentText)),targetFigureId:target.figureId,fullFigureSha256:sha(JSON.stringify(target)),unknowns:target.unknowns,
 targetIssueMapping:issues,requiredDisplayLimitations:proposal.requiredDisplayLimitations,
 requiredSlot:{afterSourceBlockId:target.sourceBlockIds[0],beforeSourceBlockId:c.body.blocks[c.body.blocks.findIndex(x=>x.sourceBlockIds.includes(target.sourceBlockIds[0]))+1].sourceBlockIds[0],label:proposal.label,authorText:false},
 gaps:['exact213 supplementary loader: bind candidate/source/parent/audit/real call and preserve original false and issues; consume only the explicit target and contribution fields',
 'install all eight distinct visible non-author limits beside b0032, preserving every author block, unknown, original image and ordering',
 'read actual rendered/compiled content and reverse-remove the notes to verify author bytes/marks/conditions exactly; fail closed on any missing binding or limit',
 'existing250 unique writer installs persistent exact-SHA route and performs complete MCP/Arena readback before coverage update'],
 missingSemanticJudgmentIdentified:false,additionalModelCallsNeededForThisGap:0,noNewCandidateOrMakerNeeded:true};
await mkdir(O+'/evidence',{recursive:true});const evidenceRefs=[...refs,r.raw,r.candidate,r.source,r.parent,r.parentAudit,r.plan,r.runtime,r.handoff],archive=[];
for(const[i,f]of evidenceRefs.entries()){await bound(f);const name='e'+i+'.json';await copyFile(f.path,O+'/evidence/'+name);archive.push({...f,copy:'evidence/'+name});}
const dependencyPaths=[reviewPath,P+'/integration/coac248-193213-20261028/release.json',loaderPath,otherLoaderPath,oldLoaderPath,P+'/integration/coac250-limited-159242-20261028/contract.json'];
const dependencies=[...evidenceRefs,...runtimeRefs,...await Promise.all(dependencyPaths.map(async path=>({path,sha256:sha(await readFile(path))})))];
const result={canonical:r.canonical,candidate:r.candidate,receipt:refs[0],raw:r.raw,status:r.status,verification:r.verification,sourceText,currentText,parentText,
 targetChecks:{textRepair:m.textRepair,figureRepair:m.figureRepair},issueMapping:issues,argumentChecks:m.argumentChecks,argumentCheckCount:6,allSixArgumentChecksFaithful:true,orderedContextFaithful:true,completeRequestedScopeCompared:true,
 unknownImpact:m.unknownImpact,originalParentIssues:old.modelReview.issues,sourceBlocks:53,unchangedBodyBlocks:52,unchangedCompleteFigures:23,
 runtimeFiles:32,uniqueLedger:true,originalTransportRequestAndFrozenVerifierReplayed:true,existingContracts:{pair109167:'actual gate rejects this candidate SHA',exact201:'actual gate rejects this candidate SHA',exact159242:'static source pins do not cover this candidate',scope193213:'production/review only; verifier returns no_limited_allowance'},
 minimumGap:contract.gaps,additionalModelBudgetNeeded:0,archive,dependencies,phaseBudget:r.chapterPhaseCalls,batchUsed:4,batchMaximum:4,
 admissionGranted:false,ordinaryWholeChapterPassed:false,limitsInstalled:false,newCalls:0,newConsumers:0,fee:'unknown',upstreamExecutions:'unknown',remoteWeights:'unknown'};
for(const f of dependencies)assert.equal(sha(await readFile(f.path)),f.sha256);
await writeFile(O+'/contract-assessment.json',JSON.stringify(contract,null,2)+'\n');await writeFile(O+'/recorded.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({canonical:r.canonical,targetsFaithful:2,argumentChecks:6,historicalErrors:2,retainedUncertain:1,strictEvidenceVerified:false,gaps:4,newCalls:0,admissionGranted:false}));
