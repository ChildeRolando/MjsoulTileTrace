import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,stat,utimes} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claudeUsage,parseClaudeResult,collectClaudeResponse,verifyClaudeRuntime,DEEPSEEK_PREFIX} from './ceiling-claude.mjs';
import {MODEL_BUDGETS,STUDY_MODELS,MODEL_CONCURRENCY,allocateModelCases,assertModelPlan,studyCells,runModelJobs} from './ceiling-model-study.mjs';
import {BudgetLedger,read} from './ceiling-protocol.mjs';
import {runDecision} from './ceiling-run.mjs';
import {indexTextbook} from './ceiling-textbook.mjs';
import {adjustModelComparisons,modelDecision} from './ceiling-model-report.mjs';

const request={tools:[{type:'function',function:{name:'submit_decision',strict:true}}],maxOutputBytes:16384};
const event={type:'result',subtype:'success',is_error:false,num_turns:1,result:JSON.stringify({call:{name:'submit_decision',arguments:{actionRef:'x'}},decisionSummary:'公开说明。'}),usage:{input_tokens:30,cache_read_input_tokens:20,cache_creation_input_tokens:10,output_tokens:4}};
describe('bounded model-amendment transport and accounting',()=>{
  it('consumes one complete API answer without a CLI formatting inference, and never repairs invalid answers',()=>{
    const run=(content,stop='end_turn',complete=true)=>{const c=collectClaudeResponse(request);c.event({type:'message_start',message:{usage:event.usage}});for(const e of content)c.event(e);c.event({type:'message_delta',delta:{stop_reason:stop},usage:{output_tokens:4}});if(complete)c.event({type:'message_stop'});return c.finish();};
    const text=[{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'hidden canary'}},{type:'content_block_delta',delta:{type:'text_delta',text:event.result}}];
    const ready=run(text);expect(ready.result.status).toBe('ready');expect(ready.result.usage.totalTokens).toBe(64);expect(JSON.stringify(ready.proof)).not.toContain('hidden canary');expect(ready.proof.acceptedResponseSource).toBe('first_model_response');
    expect(run(text,'max_tokens').result.status).toBe('provider_error');expect(run(text,'end_turn',false).result.status).toBe('provider_error');
    expect(run([{type:'content_block_delta',delta:{type:'text_delta',text:'prefix '+event.result}}]).result.status).toBe('provider_error');
    const tool={type:'content_block_start',index:0,content_block:{type:'tool_use',name:'StructuredOutput',input:{}}};
    const value={type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:event.result}};
    expect(run([tool,value],'tool_use').result.status).toBe('ready');
    expect(run([tool,value,{...tool,index:1}],'tool_use').result.failureCode).toBe('claude_multiple_submissions');
  });
  it('accepts a timestamp-only runtime change while rejecting changed executable bytes',async()=>{
    const executable=join(await mkdtemp(join(tmpdir(),'ceiling-runtime-')),'runtime');await writeFile(executable,'first');
    const info=await stat(executable),runtime={executable,size:info.size,mtimeMs:info.mtimeMs,sha256:createHash('sha256').update('first').digest('hex')};
    await utimes(executable,new Date(),new Date(info.mtimeMs+60000));expect(await verifyClaudeRuntime(runtime)).toBe(true);
    await writeFile(executable,'other');expect(await verifyClaudeRuntime(runtime)).toBe(false);
  });
  it('requires the full D cohort to meet the operational gate even when its natural contrast is positive',()=>{
    const v={overallArms:{D:{successRate:.94}},natural:{comparisons:[{estimate:.06,low:.01,adjustedP:.02}]}};
    expect(modelDecision(v)).toContain('95%');
  });
  it('runs eight independent requests with route caps and stops queued work after a failure',async()=>{
    const active={},peak={},seen=new Set();let total=0,maxTotal=0;
    const groups=[['sol',2],['deepseek_via_claude',4],['terra',2]].map(([model,concurrency])=>({concurrency,jobs:Array.from({length:12},(_,i)=>({model,id:model+i}))}));
    await runModelJobs(groups,async j=>{expect(seen.has(j.id)).toBe(false);seen.add(j.id);active[j.model]=(active[j.model]??0)+1;peak[j.model]=Math.max(peak[j.model]??0,active[j.model]);total++;maxTotal=Math.max(maxTotal,total);await new Promise(r=>setTimeout(r,5));active[j.model]--;total--;});
    expect(peak).toEqual({sol:2,deepseek_via_claude:4,terra:2});expect(maxTotal).toBe(8);expect(seen.size).toBe(36);
    const dispatched=[];await expect(runModelJobs([{concurrency:8,jobs:Array.from({length:20},(_,id)=>({id}))}],async j=>{dispatched.push(j.id);await new Promise(r=>setTimeout(r,j.id===0?1:10));if(j.id===0)throw Error('provider_down');})).rejects.toThrow('provider_down');
    expect(dispatched).toEqual([0,1,2,3,4,5,6,7]);
  });
  it('counts Anthropic uncached, creation and read input once and preserves incomplete usage',()=>{
    expect(claudeUsage(event.usage)).toEqual({inputTokens:60,cachedInputTokens:20,outputTokens:4,totalTokens:64});
    expect(claudeUsage({input_tokens:30,output_tokens:4})).toEqual({outputTokens:4});
    expect(claudeUsage(null)).toBeUndefined();
  });
  it('accepts a single native turn and rejects retries, schema escape and non-JSON output',()=>{
    expect(parseClaudeResult(event,request)).toMatchObject({status:'ready',call:{name:'submit_decision',arguments:'{"actionRef":"x"}'},usage:{totalTokens:64}});
    expect(parseClaudeResult({...event,num_turns:2},request).status).toBe('provider_error');
    expect(parseClaudeResult({...event,result:'```json\n'+event.result+'\n```'},request).status).toBe('ready');
    expect(parseClaudeResult({...event,result:'commentary\n```json\n'+event.result+'\n```'},request).status).toBe('provider_error');
    expect(parseClaudeResult({...event,num_turns:2,structured_output:JSON.parse(event.result)},request).status).toBe('ready');
    expect(parseClaudeResult({...event,num_turns:3,structured_output:JSON.parse(event.result)},request).status).toBe('provider_error');
    expect(parseClaudeResult({...event,result:JSON.stringify({call:{name:'shell',arguments:{}},decisionSummary:'x'})},request).status).toBe('provider_error');
    expect(parseClaudeResult({...event,result:JSON.stringify({call:{name:'submit_decision',arguments:'{}'},decisionSummary:'x'})},request).status).toBe('provider_error');
  });
  it('archives the actual model identity, keeps public input identical, and refuses cross-model reuse',async()=>{
    const c=JSON.parse(await readFile(new URL('./ceiling-case.fixture.json',import.meta.url),'utf8')),index=indexTextbook({units:[]}),out=await mkdtemp(join(tmpdir(),'ceiling-model-override-')),ledger=new BudgetLedger(out,{evaluation:2});let calls=0;
    const submission={caseRef:c.observation.caseRef,actionRef:c.observation.candidates[0].actionRef,rationale:'依据公开事实。',evidenceRefs:[],sourceRefs:[],mainAlternative:null,uncertainty:''};
    const factory=model=>({getAuditProof:()=>({observedBackend:model.modelName==='opus'?DEEPSEEK_PREFIX:'gpt-6.1-terra',forwardedModelRequests:1}),request:async()=>{calls++;return {status:'ready',call:{name:'submit_decision',arguments:JSON.stringify(submission)},outputBytes:100};}});
    const job={out,ledger,c,arm:'D',version:'V0',index,key:'model-a',bucket:'evaluation',modelKind:'deepseek_via_claude',modelOverride:STUDY_MODELS.deepseek_via_claude,providerFactory:factory};
    expect((await runDecision(job)).status).toBe('submitted');await runDecision(job);expect(calls).toBe(1);
    expect((await read(join(out,'requests/model-a.json'))).model).toEqual(STUDY_MODELS.deepseek_via_claude);
    expect((await read(join(out,'calls/model-a.json'))).transportProof.observedBackend).toBe(DEEPSEEK_PREFIX);
    await expect(runDecision({...job,modelOverride:STUDY_MODELS.terra})).rejects.toThrow('decision_resume_binding_changed');expect(calls).toBe(1);
    await runDecision({...job,key:'model-b',modelKind:'terra',modelOverride:STUDY_MODELS.terra});
    expect((await read(join(out,'requests/model-a.json'))).request).toEqual((await read(join(out,'requests/model-b.json'))).request);
  });
  it('preserves four balanced quarters and all 345 paid slots without inspecting answers',()=>{
    const cases=[];for(const [split,random,challenge]of [['pilot',20,0],['development',120,40],['evaluation',600,200]])for(const [stratum,n]of [['random',random],['challenge',challenge]])for(let i=0;i<n;i++){const id=split+'_'+stratum+'_'+String(i).padStart(3,'0');cases.push({id,gameId:id,sourceHash:id,split,stratum,privateAnswer:'unread'});}
    const d={cases},keys=[];
    for(const [stratum,n,double]of [['random',213,40],['challenge',77,15]])for(let i=0;i<n;i++){const id='evaluation_'+stratum+'_'+String(i).padStart(3,'0');keys.push('evaluation-'+id+'-A');if(i<double)keys.push('evaluation-'+id+'-D');}
    const assignment=allocateModelCases(d,keys),primary=keys.filter(k=>assignment[k.split('-')[1]].model==='sol'),extra=keys.filter(k=>!primary.includes(k));
    expect([keys.length,primary.length,extra.length]).toEqual([345,255,90]);
    const ledger={rows:keys.map(key=>({type:'claim',bucket:'evaluation',key,digest:'prefix'})),snapshot:()=>({claimed:1292,unsettled:0})};
    const p={assignment,reuseLegacySolCallsInPrimary:primary,retainLegacySolCallsForCrossModelDiagnostics:extra,ledgerHeadAtProposal:'prefix',formalActualCallsIncludingLegacy:4090,proposedTotalLimit:6140},approval={approved:true,totalLimit:6140,formalLimitIncludingLegacy:4090,remainingEngineeringCalls:3};
    expect(()=>assertModelPlan(d,p,approval,ledger)).not.toThrow();expect(()=>assertModelPlan(d,p,{...approval,approved:false},ledger)).toThrow('not_authorized');
    expect(allocateModelCases({cases:cases.map(c=>({...c,privateAnswer:'different'})).reverse()},keys)).toEqual(assignment);
    expect(studyCells(d,assignment,'evaluation')).toHaveLength(4000);
    expect(Object.values(MODEL_BUDGETS).reduce((a,b)=>a+b,0)).toBe(6141);
    expect(MODEL_CONCURRENCY.sol+MODEL_CONCURRENCY.terra+MODEL_CONCURRENCY.deepseek_via_claude).toBe(8);
    const swapped=structuredClone(p),a=cases.find(c=>c.split==='evaluation'&&c.stratum==='random'&&assignment[c.id].model==='sol'),b=cases.find(c=>c.split==='evaluation'&&c.stratum==='random'&&assignment[c.id].model==='terra');[swapped.assignment[a.id],swapped.assignment[b.id]]=[swapped.assignment[b.id],swapped.assignment[a.id]];
    expect(()=>assertModelPlan(d,swapped,approval,ledger)).toThrow('not_blind_rule');
  });
  it('corrects the three primary and nine secondary comparisons as separate families',()=>{
    const byModel=Object.fromEntries(['sol','deep','terra'].map((id,i)=>[id,{natural:{comparisons:[{p:[.01,.04,.03][i]},{p:.01},{p:.02},{p:.03}]}}]));
    adjustModelComparisons(byModel);expect(Object.values(byModel).map(m=>m.natural.comparisons[0].adjustedP)).toEqual([.03,.06,.06]);
    expect(byModel.sol.natural.comparisons[1].adjustedP).toBe(.09);
  });
});
