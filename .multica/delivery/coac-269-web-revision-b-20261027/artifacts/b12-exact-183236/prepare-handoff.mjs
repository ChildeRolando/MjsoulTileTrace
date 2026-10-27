// Read-only model/parent verification and a per-chapter handoff. No model dispatch.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const out=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing';
const stage=join(root,'web-production/v1/runs/coac269-exact-183236-v2-20261028');
const key=process.argv[2];assert(['183','236'].includes(key));
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const reference=async path=>({path:path instanceof URL?fileURLToPath(path):path,sha256:sha(await readFile(path))});
const summary=await read(join(out,'stage-summary.json'));
const job=summary.jobs.find(j=>j.chapterId===`nemata-jp-chapter-${key}-1`);
const result=await read(join(stage,`chapter-${key}/production-result.json`));
assert(result.auditReady&&result.exactWhitelistPassed);
assert.equal(sha(await readFile(summary.runtime.path)),summary.runtime.sha256);
const manifest=await read(summary.runtime.path);
for(const f of manifest.files)assert.equal(sha(await readFile(f.path)),f.sha256);
const runtime=new URL('.',pathToFileURL(summary.runtime.path));
const {verifyWebProductionCall,webDeterministicChecks}=await import(new URL('textbook-audit-web.mjs',runtime));
const {validateExactTextOutput}=await import(new URL('exact-text-contract.mjs',runtime));
const contracts=await read(new URL('exact-text-contracts.json',runtime));
const contract=contracts.jobs.find(j=>j.chapterId===job.chapterId);
const path=result.displayPath,candidate=await read(path),parent=await read(job.parent.path);
assert.equal(sha(await readFile(path)),result.displaySha256);
const expected=structuredClone(parent.body);
expected.blocks.find(b=>b.sourceBlockIds[0]===contract.targetId).text=contract.expectedText;
assert.deepEqual(candidate.body,expected);
assert.deepEqual(candidate.figures,parent.figures);
const source=await read(job.source.path);
const checks=webDeterministicChecks(candidate,source,job.source.sha256);assert(checks.passed,JSON.stringify(checks));
const production=await verifyWebProductionCall(root,candidate);
const raw=await read(result.raw.path);
const exactOutput=validateExactTextOutput(contract,raw.parsedOutput);
assert.equal(raw.requestPrompt, (await read(join(stage,`chapter-${key}/preflight.json`))).request.closedPrompt);
const handoff={schema:'coac269-exact-text-first-audit-handoff/1',recordedAt:new Date().toISOString(),chapterId:job.chapterId,
 authorizationCommentId:'01a17ed7-c04d-71e7-82eb-57aed9c7b3e1',status:'pending-first-independent-review',
 candidate:await reference(path),intermediateCandidate:await reference(result.candidatePath),source:job.source,parent:job.parent,parentAudit:job.parentAudit,
 runtime:summary.runtime,contracts:await reference(new URL('exact-text-contracts.json',runtime)),
 raw:result.raw,productionCalls:result.calls,targetIds:job.targetIds,checks,exactOutput,production,
 budgets:{oldFailedProductionCallsBatch:2,newProductionCallsBatchMaximum:2,firstAuditCallsThisChapterMaximum:1,futureCallsAtAuthorizationMaximum:4,lifetimeBatchMaximum:6,failedVoidCount:true,automaticRetry:0},
 reviewInstructions:'Review only this display SHA with the frozen auditWebCandidate/independent target-text path. Keep original uncertain severity; new uncertain still blocks pass. Compare the actual original source and the complete target paragraph plus explicit non-author editorial note. No repeat production, intermediate audit, second review or extra canary. A verified pass goes to COAC-250 with this runtime/parent/raw chain; no formal active switch.'};
const text=JSON.stringify(handoff,null,2)+'\n';
await writeFile(join(stage,`handoff-${key}-to249.json`),text,{flag:'wx'});
await writeFile(join(out,`${key}-handoff-to249.json`),text,{flag:'wx'});
console.log(JSON.stringify({chapterId:job.chapterId,handoffPath:join(stage,`handoff-${key}-to249.json`),handoffSha256:sha(text),candidateSha256:result.displaySha256,modelCalls:0}));
