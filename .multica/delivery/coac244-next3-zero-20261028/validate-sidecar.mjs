import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {prepareContext100Request,verifyContext100Raw,verifyRecordedContext100Call,verifyContext100Supplement} from './context100.mjs';
import {prepareTextbookCliRequest} from './verification-runtime/textbook-production-cli.mjs';
const here=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing',plan=await prepareContext100Request(),sha=b=>createHash('sha256').update(b).digest('hex');
const actual=await prepareTextbookCliRequest({...plan,work:await mkdtemp(join(here,'sidecar-test-'))});
const output=structuredClone(plan.old.batchReviews[1].modelReview);for(const c of output.blockChecks)c.verdict='faithful';output.issues=[];output.contextContinuity={faithful:true,evidence:'OFFLINE_FIXTURE'};output.semanticCompleteness={complete:true,evidence:'OFFLINE_FIXTURE'};
const fixture={scope:'textbook-web-chapter100-bound-context-supplement',model:'gpt-6.1-sol',reasoningEffort:'high',binding:{contextSupplement:plan.proof},requestExecution:actual.requestExecution,prompt:plan.prompt,schema:plan.schema,requestPrompt:actual.closedPrompt,semanticPromptSha256:sha(plan.prompt),promptSha256:sha(actual.closedPrompt),schemaSha256:sha(JSON.stringify(plan.schema)),outputSha256:sha(JSON.stringify(output)),output,rawLastMessage:JSON.stringify(output),exitCode:0,timedOut:false,outputOverflow:false,events:[{type:'turn.completed',usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0}}]};
const checks=[];const test=(name,fn)=>{fn();checks.push({name,passed:true});};
test('pure fixture merge validates only as offline contract exercise',()=>assert(verifyContext100Raw(fixture,plan).checks.passed));
for(const kind of ['changed proof','changed prompt','unexpected image','model fallback','changed schema','uncertain result']){
 const q=structuredClone(fixture);
 if(kind==='changed proof')q.binding.contextSupplement.inheritedPassedBlockCount--;
 if(kind==='changed prompt')q.requestPrompt+='x';
 if(kind==='unexpected image')q.requestExecution.images.push({path:'fake',sha256:'0'.repeat(64),bytes:1});
 if(kind==='model fallback')q.model='gpt-6.1-terra';
 if(kind==='changed schema')q.schema.properties.extra={type:'string'};
 if(kind==='uncertain result'){q.output.blockChecks[0].verdict='uncertain';q.rawLastMessage=JSON.stringify(q.output);q.outputSha256=sha(q.rawLastMessage);}
 test('reject '+kind,()=>assert.throws(()=>verifyContext100Raw(q,plan)));
}
await assert.rejects(()=>verifyRecordedContext100Call(plan.proof.originalFailedContextCall));checks.push({name:'real old raw/ledger cannot become a new supplement',passed:true});
await assert.rejects(()=>verifyContext100Supplement(root,plan.proof.candidate.path));checks.push({name:'absent independently generated sidecar cannot stage chapter',passed:true});
const result={newModelCalls:0,sharedRawOrLedgerWrites:0,fixturePassedIsNotARealAudit:true,checks};
await writeFile(join(here,'sidecar-tests.json'),JSON.stringify(result,null,2)+'\n');await writeFile(join(root,'integration/coac244-next3-zero-20261028/sidecar-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks:checks.length,newModelCalls:0,sharedWrites:0}));
