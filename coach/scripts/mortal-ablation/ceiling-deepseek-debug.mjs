// Bounded metadata compatibility repair. Existing running generation files stay unchanged.
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {BudgetLedger,ROOT,hash,read,writeOnce} from './ceiling-protocol.mjs';
import {decisionRequest,validateDecision,runDecision,exclusive} from './ceiling-run.mjs';
import {createClaudeCeilingProvider,parseClaudeResult} from './ceiling-claude.mjs';
import {MODEL_BUDGETS,verifyModelStudy} from './ceiling-model-study.mjs';
const exec=promisify(execFile);
const ownFiles=['scripts/mortal-ablation/ceiling-deepseek-debug.mjs','bin/scene-pattern-deepseek-debug.mjs'];
async function sourceFiles(){return Promise.all(ownFiles.map(async p=>[p,hash(await readFile(join(ROOT,p)))]));}

export function normalizeDeepSeekMetadata(response,proof,request){
  if(response.status!=='provider_error'||response.failureCode!=='claude_invalid_model_response'||proof.acceptedResponseSource!=='first_model_response'||!proof.firstResponseComplete||proof.forwardedModelRequests!==1)return null;
  try{
    const original=proof.visibleResultText.trim(),fence=/^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(original),p=JSON.parse(fence?fence[1]:original);
    if(Object.keys(p).sort().join(',')!=='call,decisionSummary'||Object.keys(p.call).sort().join(',')!=='arguments,decisionSummary,name'||typeof p.call.decisionSummary!=='string'||p.call.decisionSummary.length>600||Buffer.byteLength(original)>request.maxOutputBytes)return null;
    const before=JSON.stringify(p.call.arguments);delete p.call.decisionSummary;
    const normalized=JSON.stringify(p),result=parseClaudeResult({type:'result',subtype:'success',num_turns:1,result:normalized,usage:proof.nativeUsage},request);
    if(result.status!=='ready'||JSON.stringify(p.call.arguments)!==before)return null;
    return {result,proof:{protocolCompatibility:'metadata-v5',normalization:{removedField:'call.decisionSummary',argumentsUnchanged:true,summarySource:'outer decisionSummary'},normalizedVisibleResultText:normalized}};
  }catch{return null;}
}

export function createCompatibleDeepSeekProvider(options){
  const inner=createClaudeCeilingProvider(options);let proof={};
  return {descriptor:inner.descriptor,getAuditProof:()=>structuredClone(proof),async request(request,signal){
    const result=await inner.request(request,signal);proof=inner.getAuditProof();
    const normalized=normalizeDeepSeekMetadata(result,proof,request);
    if(normalized){Object.assign(proof,normalized.proof);return normalized.result;}
    proof.protocolCompatibility='metadata-v5';return result;
  }};
}

export async function replayDeepSeekFailure(out){
  const stop=await read(join(out,'model-route-stop.json')),call=await read(join(out,'calls',stop.failedKey+'.json')),request=await read(join(out,'requests',stop.failedKey+'.json')),original=await read(join(out,'freeze.json')),pilot=(await read(join(original.engineeringSupplement.directory,'dataset.json'))).cases;
  const c=pilot.find(c=>stop.failedKey.includes(c.id)),index=await read(join(out,'textbook/index.json')),context=decisionRequest(c,'A','V0',index),normalized=normalizeDeepSeekMetadata(call.response,call.transportProof,request.request);
  const verdict=normalized?validateDecision(normalized.result,context):null;
  const result={version:'ceiling-deepseek-offline-replay/v1',newModelRequests:0,originalCallHash:hash(call),originalKey:stop.failedKey,originalFailurePreserved:true,normalization:normalized?.proof??null,verdict:verdict?.status??'not_normalized',candidateAndCitationValidationUnchanged:true,sourceFiles:await sourceFiles()};
  if(result.verdict!=='submitted')throw Error('offline_replay_did_not_pass_full_submission_validation');
  await writeOnce(join(out,'qa/deepseek-metadata-v5-offline-replay.json'),result);return result;
}

export async function runDeepSeekDebug(out){
  return exclusive(out,async()=>{
    const f=await verifyModelStudy(out),approval=await read(join(out,'deepseek-debug-resume-approved.json')),ledger=new BudgetLedger(out,MODEL_BUDGETS);
    if(approval.approved!==true||approval.totalLimit!==6144||approval.maxAdditionalCalls!==2||approval.revokesPreviousDeepSeekStop!==true||approval.modelFreezeHash!==hash(f))throw Error('deepseek_debug_not_authorized');
    if(ledger.snapshot().unsettled)throw Error('other_requests_still_unsettled');
    await replayDeepSeekFailure(out);
    const original=await read(join(out,'freeze.json')),pilot=(await read(join(original.engineeringSupplement.directory,'dataset.json'))).cases,index=await read(join(out,'textbook/index.json'));
    const jobs=['C','D'].map((arm,i)=>({c:pilot[i+5],arm,key:`model-debug-v5-deepseek-${pilot[i+5].id}-${arm}`})),profile={...f.models.deepseek_via_claude,outputMode:'single-response-metadata-v5'};
    const sources=await sourceFiles(),debugFreeze={version:'ceiling-deepseek-debug-freeze/v1',modelFreezeHash:hash(f),approvalHash:hash(approval),sourceFiles:sources,model:profile,keys:jobs.map(j=>j.key),budgetLimit:6144,engineeringLimit:154,modelBudget:2,originalFailuresRetained:true};
    await writeOnce(join(out,'deepseek-debug-freeze.json'),debugFreeze);
    const results=[];
    for(const j of jobs)results.push(await runDecision({out,ledger,...j,version:'V0',index,bucket:'smoke',modelKind:'deepseek_via_claude',modelOverride:profile,providerFactory:()=>createCompatibleDeepSeekProvider({runtime:f.claudeRuntime})}));
    const receipt={version:'ceiling-deepseek-debug-result/v1',freezeHash:hash(debugFreeze),planned:2,submitted:results.filter(r=>r.status==='submitted').length,keys:jobs.map(j=>j.key),budget:ledger.snapshot(),previousFailuresRetained:true};
    await writeOnce(join(out,'deepseek-debug-result.json'),receipt);
    if(receipt.submitted!==2)throw Error('deepseek_debug_validation_failed');
    return receipt;
  });
}

export async function waitForOwners(pids){
  const code="import importlib.util,sys; s=importlib.util.spec_from_file_location('ceiling_wait',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);[m.wait_process(int(p)) for p in sys.argv[2:]]";
  await exec('python',['-B','-c',code,join(ROOT,'scripts/mortal-ablation/ceiling-validate.py'),...pids.map(String)],{windowsHide:true,maxBuffer:65536});
}
