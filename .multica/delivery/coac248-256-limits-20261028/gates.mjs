// Reuse only the actual frozen execution verifier; never import or invoke a dispatcher.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',runtime=root+'/audit/runtimes/coac244-256-exact-8s-v1-20261028';
const d=root+'/audit/supplements/coac249-256-impact-20261028',load=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const receipt=await load(d+'/receipt.json'),raw=await load(receipt.raw.path),plan=await load(d+'/plan.json');
const {prepare256ImpactReview,verify256ReviewExecution}=await import(pathToFileURL(runtime+'/textbook-256-impact.mjs'));
assert.equal(resolve(plan.proof.candidatePath),resolve(receipt.candidate.path));
const fresh=await prepare256ImpactReview(root,plan.proof.candidatePath);
assert.equal(sha(JSON.stringify(fresh)),sha(JSON.stringify(plan)),'fresh_plan_changed');const checks=verify256ReviewExecution(raw,plan);assert.equal(checks.passed,true);
assert.deepEqual(checks,receipt.verification);assert.equal(sha(await readFile(receipt.raw.path)),receipt.raw.sha256);
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).trim().split('\n').map(JSON.parse).filter(c=>c.callId===receipt.call.callId);
assert.equal(ledger.length,1);assert.deepEqual(ledger[0],receipt.call);
const register=await load(root+'/integration/coac250-unified-chapter-register-20261027b.json');
const row=register.rows.find(x=>x.chapterId==='79-cn-chapter-256-18');
await writeFile(new URL('./gates.json',import.meta.url),JSON.stringify({recordedAt:new Date().toISOString(),
 checks,rawVerified:true,originalRequestAndFreshPlanEqual:true,uniqueLedgerEntry:true,
 productionAndPresentationRevalidated:true,latestRegisterRow:row,alreadyCovered:row.covered,
 newModelCalls:0,ordinaryWholeChapterPassed:false},null,2)+'\n');
console.log(JSON.stringify({limitedEvidenceVerified:true,allOriginalGatesVerified:true,alreadyCovered:row.covered,newModelCalls:0}));
