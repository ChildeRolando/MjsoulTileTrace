import {readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {createArenaToolCallProvider} from '@riichi-coach/desktop/llm-provider/service';
import {BudgetLedger,MODELS,ARMS,ROOT,SEED,GENERATION_TIMEOUT_MS,hash,read,save,writeOnce,exists,ordered,assertDataset,executionFiles,supplementBinding} from './ceiling-protocol.mjs';
import {runDecision,oracleMaterials,exclusive,serviceFailureStreak} from './ceiling-run.mjs';
import {COMMAND_CODE_ID,DEEPSEEK_PREFIX,createClaudeCeilingProvider} from './ceiling-claude.mjs';
import {createCompatibleDeepSeekProvider} from './ceiling-deepseek-debug.mjs';
const exec=promisify(execFile);
export const MODEL_BUDGETS=Object.freeze({development:800,evaluation:4090,oracle:600,practical:400,stability:100,smoke:154});
export const STUDY_MODELS=Object.freeze({sol:MODELS.strong,terra:{modelName:'gpt-6.1-terra',reasoningEffort:'high'},deepseek_via_claude:{modelName:'opus',reasoningEffort:'high',transport:'claude-code-command-code',providerId:COMMAND_CODE_ID,expectedBackendPrefix:DEEPSEEK_PREFIX,outputMode:'single-response-metadata-v5'},practical:MODELS.practical});
export const MODEL_CONCURRENCY=Object.freeze({sol:2,deepseek_via_claude:4,terra:2,oracle:2,practical:4,smoke:1});
const newFiles=['scripts/mortal-ablation/ceiling-model-study.mjs','scripts/mortal-ablation/ceiling-claude.mjs','bin/scene-pattern-models.mjs','scripts/mortal-ablation/ceiling-deepseek-debug.mjs','bin/scene-pattern-deepseek-debug.mjs'];
async function currentExecution(){return [...await executionFiles(),...await Promise.all(newFiles.map(async p=>[p,hash(await readFile(join(ROOT,p)))]))].sort((a,b)=>a[0].localeCompare(b[0]));}
export function modelRunKey(phase,c,arm,model){return phase==='evaluation'&&model!=='sol'?`${phase}-${model}-${c.id}-${arm}`:`${phase}-${c.id}-${arm}`;}
export function studyCells(d,assignment,phase){
  const selected=phase==='evaluation'?d.cases.filter(c=>c.split==='evaluation'):d.cases.filter(c=>(phase==='oracle'?d.oracle:phase==='practical'?d.practical:d.stability).includes(c.id));
  return selected.flatMap(c=>(phase==='evaluation'?ARMS:phase==='oracle'?['O']:phase==='practical'?['A','V0','D','O']:['A','D']).map(arm=>{const model=phase==='practical'?'practical':assignment[c.id].model;return {c,arm,model,key:modelRunKey(phase,c,arm,model)};}));
}
export function allocateModelCases(d,legacyKeys){
  const paid=new Map();for(const key of legacyKeys){const id=key.split('-')[1];paid.set(id,(paid.get(id)??0)+1);}
  const tie=(prefix,id)=>createHash('sha256').update(prefix+id).digest('hex'),assignment={};
  for(const [stratum,n]of [['random',150],['challenge',50]]){
    const cases=d.cases.filter(c=>c.split==='evaluation'&&c.stratum===stratum).sort((a,b)=>(paid.get(b.id)??0)-(paid.get(a.id)??0)||tie('model-amendment-v1',a.id).localeCompare(tie('model-amendment-v1',b.id)));
    for(const c of cases.slice(0,n))assignment[c.id]={quarter:1,model:'sol'};
    const rest=cases.slice(n).sort((a,b)=>tie('model-amendment-v2-remaining',a.id).localeCompare(tie('model-amendment-v2-remaining',b.id)));
    for(const q of [2,3,4])for(const c of rest.slice((q-2)*n,(q-1)*n))assignment[c.id]={quarter:q,model:q===4?'terra':'deepseek_via_claude'};
  }
  return assignment;
}
export function assertModelPlan(d,p,approval,ledger){
  if(approval.approved!==true||approval.totalLimit!==6140||approval.formalLimitIncludingLegacy!==4090||approval.remainingEngineeringCalls!==3)throw Error('model_amendment_not_authorized');
  assertDataset(d);const formal=d.cases.filter(c=>c.split==='evaluation'),ids=new Set(formal.map(c=>c.id));
  if(Object.keys(p.assignment).length!==800||Object.keys(p.assignment).some(id=>!ids.has(id)))throw Error('model_assignment_coverage');
  for(const q of [1,2,3,4])for(const [stratum,n]of [['random',150],['challenge',50]])if(formal.filter(c=>p.assignment[c.id].quarter===q&&c.stratum===stratum).length!==n)throw Error('model_assignment_quota');
  for(const c of formal){const a=p.assignment[c.id];if(a.model!==(a.quarter===1?'sol':a.quarter===4?'terra':'deepseek_via_claude'))throw Error('model_assignment_route');}
  const old=ledger.rows.filter(r=>r.type==='claim'&&r.bucket==='evaluation').map(r=>r.key),primary=p.reuseLegacySolCallsInPrimary,extra=p.retainLegacySolCallsForCrossModelDiagnostics;
  const expected=allocateModelCases(d,old);for(const c of formal)if(Object.keys(p.assignment[c.id]).sort().join(',')!=='model,quarter'||p.assignment[c.id].model!==expected[c.id].model||p.assignment[c.id].quarter!==expected[c.id].quarter)throw Error('model_assignment_not_blind_rule');
  if(ledger.snapshot().claimed!==1292||ledger.snapshot().unsettled!==0||old.length!==345||primary.length!==255||extra.length!==90||new Set([...primary,...extra]).size!==345||[...primary,...extra].some(k=>!old.includes(k)))throw Error('model_legacy_accounting');
  for(const key of old){const [,id,arm]=key.split('-');if(!ARMS.includes(arm)||primary.includes(key)!==(p.assignment[id].model==='sol'))throw Error('model_legacy_assignment');}
  if(p.ledgerHeadAtProposal!==ledger.rows.at(-1)?.digest||p.formalActualCallsIncludingLegacy!==4090||p.proposedTotalLimit!==6140)throw Error('model_proposal_binding');
}
async function validateFrozenInputs(out,original){
  if((await read(join(out,'freeze-binding.json'))).freezeHash!==hash(original))throw Error('original_freeze_changed');
  const d=await read(join(out,'dataset.json')),index=await read(join(out,'textbook/index.json')),manifest=await read(join(out,'textbook/manifest.json'));assertDataset(d);
  if(hash(d)!==original.datasetHash||hash(index)!==original.textbookDigest||hash(manifest)!==original.textbookManifestHash)throw Error('model_inputs_changed');
  const prior=await read(join(out,'prior-sources.json'));if(d.priorSourcesDigest!==hash(prior)||hash(d.excludedGames)!==hash(prior.games)||hash(d.excludedHashes)!==hash(prior.hashes))throw Error('model_prior_sources_changed');
  for(const [path,digest]of Object.entries(manifest.files))if(hash(await readFile(join(out,'textbook',path)))!==digest)throw Error('model_textbook_file_changed');
  const receipt=await read(join(out,'labels-receipt.json')),ready=await read(join(out,'labels-ready.json'));
  if(ready.count!==980||ready.datasetHash!==original.datasetHash||ready.receiptHash!==hash(receipt)||receipt.rows.length!==980)throw Error('model_labels_not_ready');
  for(const c of d.cases){const r=receipt.rows.find(r=>r.caseId===c.id),label=await read(join(out,'private-labels',c.id+'.json'));if(!r||r.hash!==hash(label)||r.status!=='available'||label.datasetHash!==original.datasetHash)throw Error('model_label_changed');}
  const oldApproval=await read(join(out,'engineering-amendment-approved.json'));
  if(hash(await supplementBinding(original.engineeringSupplement.directory,d,hash(oldApproval)))!==hash(original.engineeringSupplement))throw Error('model_pilot_changed');
  return {d,index};
}
export async function freezeModelStudy(out){
  if(await exists(join(out,'model-freeze.json')))return verifyModelStudy(out);
  throw Error('existing_approved_model_freeze_required');

}
export async function verifyModelStudy(out){
  const f=await read(join(out,'model-freeze.json')),original=await read(join(out,'freeze.json')),approval=await read(join(out,'model-amendment-approved.json'));
  if(f.version!=='ceiling-model-amendment/v1'||f.nodeVersion!==process.version||(await read(join(out,'model-freeze-binding.json'))).freezeHash!==hash(f)||f.originalFreezeHash!==hash(original)||f.approvalHash!==hash(approval)||approval.approved!==true||approval.totalLimit!==6140||hash(await read(join(out,approval.proposal)))!==f.proposalHash)throw Error('model_freeze_binding_changed');
  const topup=await read(join(out,'engineering-runtime-amendment-approved.json'));
  if(topup.approved!==true||topup.totalLimit!==6141||topup.additionalEngineeringCalls!==1||topup.engineeringLimit!==151||f.engineeringTopupHash!==hash(topup))throw Error('runtime_engineering_topup_not_authorized');
  const single=await read(join(out,'engineering-single-response-amendment-approved.json'));
  if(single.approved!==true||single.totalLimit!==6144||single.additionalEngineeringCalls!==3||single.engineeringLimit!==154||f.singleResponseTopupHash!==hash(single)||![4,5,6].includes(f.engineeringRevision))throw Error('single_response_engineering_topup_not_authorized');
  if(f.codeDigest!==hash(await currentExecution())||hash(f.models)!==hash(STUDY_MODELS)||hash(f.budgets)!==hash(MODEL_BUDGETS)||hash(f.concurrency)!==hash(MODEL_CONCURRENCY))throw Error('model_execution_changed');
  if(hash(await read(join(out,'selected-version.json')))!==f.selectedHash)throw Error('model_selection_changed');
  const ledger=new BudgetLedger(out,f.budgets);if(ledger.rows[f.ledgerBaseline.rows-1]?.digest!==f.ledgerBaseline.head)throw Error('model_legacy_ledger_changed');
  if(hash(await readFile(f.claudeRuntime.executable))!==f.claudeRuntime.sha256)throw Error('model_claude_runtime_changed');
  if([5,6].includes(f.engineeringRevision)){
    const stop=await read(join(out,'model-route-stop.json')),sol=await read(join(out,'smoke-ready.json')),terra=await read(join(out,'calls',stop.terraKey+'.json'));
    if(f.routeStopHash!==hash(stop)||stop.stoppedModel!=='deepseek_via_claude'||stop.noFurtherDeepSeekRequests!==true||hash(sol)!==stop.solGateHash||sol.freezeHash!==f.originalFreezeHash||sol.submitted/sol.planned<.95||hash(terra)!==stop.terraCallHash||terra.response.status!=='ready'||hash(await read(join(out,'calls',stop.failedKey+'.json')))!==stop.failedCallHash)throw Error('ready_route_gate_changed');
  }
  if(f.engineeringRevision===6){
    const resume=await read(join(out,'model-route-resume.json')),approval=await read(join(out,'deepseek-debug-resume-approved.json')),debug=await read(join(out,'deepseek-debug-freeze.json')),receipt=await read(join(out,'deepseek-debug-result.json'));
    if(f.routeResumeHash!==hash(resume)||resume.approvalHash!==hash(approval)||approval.approved!==true||approval.revokesPreviousDeepSeekStop!==true||approval.totalLimit!==6144||resume.debugFreezeHash!==hash(debug)||resume.debugReceiptHash!==hash(receipt)||receipt.submitted!==2||receipt.planned!==2||receipt.freezeHash!==hash(debug)||hash(debug.model)!==hash(f.models.deepseek_via_claude))throw Error('deepseek_resume_gate_changed');
    for(const [p,h]of debug.sourceFiles)if(hash(await readFile(join(ROOT,p)))!==h)throw Error('deepseek_debug_source_changed');
  }
  await validateFrozenInputs(out,original);return f;
}
export async function repairModelEngineeringFreeze(out){
  throw Error('initial_engineering_repair_already_archived');

}
export async function repairRuntimeEngineeringFreeze(out){
  throw Error('runtime_engineering_repair_already_archived');
}
export async function repairSingleResponseFreeze(out){
  const previous=await read(join(out,'model-freeze.json')),binding=await read(join(out,'model-freeze-binding.json')),topup=await read(join(out,'engineering-single-response-amendment-approved.json')),original=await read(join(out,'freeze.json')),ledger=new BudgetLedger(out,MODEL_BUDGETS);
  if(binding.freezeHash!==hash(previous)||previous.engineeringRevision!==3||await exists(join(out,'model-smoke-ready.json'))||topup.approved!==true||topup.totalLimit!==6144||topup.additionalEngineeringCalls!==3||topup.engineeringLimit!==154||topup.previousModelFreezeHash!==hash(previous)||topup.ledgerHead!==ledger.rows.at(-1)?.digest)throw Error('single_response_repair_not_authorized');
  const added=ledger.rows.slice(previous.ledgerBaseline.rows).filter(r=>r.type==='claim'),pilot=(await read(join(original.engineeringSupplement.directory,'dataset.json'))).cases,key=`model-smoke-deepseek_via_claude-${pilot[3].id}-D`;
  if(added.length!==4||added.some(r=>r.bucket!=='smoke')||ledger.snapshot().claimed!==1296||ledger.snapshot().unsettled||ledger.snapshot().buckets.smoke!==151||ledger.snapshot().buckets.evaluation!==345)throw Error('single_response_repair_after_extra_calls');
  const failed=await read(join(out,'calls',key+'.json')),terra=await read(join(out,'runs',`model-smoke-terra-${pilot[1].id}-D.json`));
  if(failed.response.failureCode!=='claude_cli_failed'||failed.transportProof?.forwardedModelRequests!==1||!failed.transportProof?.visibleResultText?.includes('409 single Arena turn only')||terra.status!=='submitted'||hash(await readFile(previous.claudeRuntime.executable))!==previous.claudeRuntime.sha256)throw Error('single_response_repair_wrong_failure');
  await validateFrozenInputs(out,original);
  const files=await currentExecution(),generationCommit=(await exec('git',['rev-parse','HEAD'],{cwd:ROOT,windowsHide:true})).stdout.trim();
  const historicalRequestModels={...previous.historicalRequestModels};
  for(const claim of added){const request=await read(join(out,'requests',claim.key+'.json'));if(request.model.modelName==='opus')historicalRequestModels[claim.key]=request.model;}
  const f={...previous,models:STUDY_MODELS,budgets:MODEL_BUDGETS,generationCommit,engineeringRevision:4,requiredSmoke:4,singleResponseTopupHash:hash(topup),previousModelFreezeHash:hash(previous),failedEngineeringKeys:[...previous.failedEngineeringKeys,key],historicalRequestModels,executionFiles:files,codeDigest:hash(files)};
  await writeOnce(join(out,'model-revisions','engineering-single-response-before-'+hash(previous)+'.json'),previous);
  await writeOnce(join(out,'model-revisions','engineering-single-response-failure.json'),{freezeHash:hash(previous),key,forwardedModelRequests:1,allFailuresRetained:true,authorizedAdditionalCalls:3,independentNewPilotIds:pilot.slice(4,7).map(c=>c.id),stopOnFirstFailure:true});
  await save(join(out,'model-freeze.json'),f);await save(join(out,'model-freeze-binding.json'),{freezeHash:hash(f)});return f;
}
export async function stopDeepSeekRoute(out){
  const previous=await read(join(out,'model-freeze.json')),binding=await read(join(out,'model-freeze-binding.json')),approval=await read(join(out,'engineering-single-response-amendment-approved.json')),ledger=new BudgetLedger(out,MODEL_BUDGETS),original=await read(join(out,'freeze.json'));
  if(previous.engineeringRevision!==4||binding.freezeHash!==hash(previous)||previous.singleResponseTopupHash!==hash(approval)||approval.stopOnFirstFailure!==true||approval.noFurtherAutomaticTopups!==true||await exists(join(out,'model-smoke-ready.json'))||ledger.snapshot().claimed!==1297||ledger.snapshot().unsettled||ledger.snapshot().buckets.evaluation!==345||ledger.snapshot().buckets.smoke!==152)throw Error('route_stop_not_applicable');
  const pilot=(await read(join(original.engineeringSupplement.directory,'dataset.json'))).cases,failedKey=`model-smoke-deepseek_via_claude-${pilot[4].id}-A`,terraKey=`model-smoke-terra-${pilot[1].id}-D`,failed=await read(join(out,'calls',failedKey+'.json')),terra=await read(join(out,'calls',terraKey+'.json')),sol=await read(join(out,'smoke-ready.json'));
  if(failed.response.failureCode!=='claude_invalid_model_response'||failed.transportProof?.forwardedModelRequests!==1||!failed.transportProof?.firstResponseComplete||terra.response.status!=='ready'||sol.freezeHash!==hash(original)||sol.submitted/sol.planned<.95)throw Error('route_stop_evidence_changed');
  await validateFrozenInputs(out,original);
  const stop={version:'ceiling-route-stop/v1',at:new Date().toISOString(),previousFreezeHash:hash(previous),approvalHash:hash(approval),stoppedModel:'deepseek_via_claude',noFurtherDeepSeekRequests:true,reason:'Strict response schema failed on first final-batch request; honor approved stop condition',failedKey,failedCallHash:hash(failed),terraKey,terraCallHash:hash(terra),solGateHash:hash(sol),readyModels:['sol','terra'],ledgerRowsAtStop:ledger.rows.length,ledgerHeadAtStop:ledger.rows.at(-1).digest,unusedEngineeringCalls:2,formalSamplesUnchanged:true};
  const files=await currentExecution(),generationCommit=(await exec('git',['rev-parse','HEAD'],{cwd:ROOT,windowsHide:true})).stdout.trim(),f={...previous,engineeringRevision:5,generationCommit,previousModelFreezeHash:hash(previous),routeStopHash:hash(stop),executionFiles:files,codeDigest:hash(files)};
  await writeOnce(join(out,'model-revisions','before-deepseek-stop-'+hash(previous)+'.json'),previous);await writeOnce(join(out,'model-route-stop.json'),stop);
  await save(join(out,'model-freeze.json'),f);await save(join(out,'model-freeze-binding.json'),{freezeHash:hash(f)});return f;
}
export async function resumeDeepSeekRoute(out){
  const previous=await read(join(out,'model-freeze.json')),binding=await read(join(out,'model-freeze-binding.json')),approval=await read(join(out,'deepseek-debug-resume-approved.json')),debug=await read(join(out,'deepseek-debug-freeze.json')),receipt=await read(join(out,'deepseek-debug-result.json')),ledger=new BudgetLedger(out,MODEL_BUDGETS),original=await read(join(out,'freeze.json'));
  if(previous.engineeringRevision!==5||binding.freezeHash!==hash(previous)||approval.approved!==true||approval.revokesPreviousDeepSeekStop!==true||approval.totalLimit!==6144||approval.maxAdditionalCalls!==2||approval.modelFreezeHash!==hash(previous)||debug.modelFreezeHash!==hash(previous)||debug.approvalHash!==hash(approval)||receipt.freezeHash!==hash(debug)||receipt.planned!==2||receipt.submitted!==2||hash(debug.model)!==hash(STUDY_MODELS.deepseek_via_claude)||ledger.snapshot().unsettled||ledger.snapshot().buckets.smoke!==154||await exists(join(out,'model-smoke-ready.json')))throw Error('deepseek_resume_not_authorized');
  const files=await currentExecution(),allowed=new Set(['scripts/mortal-ablation/ceiling-model-study.mjs','bin/scene-pattern-models.mjs']);
  for(const [p,h]of previous.executionFiles)if(!allowed.has(p)&&files.find(x=>x[0]===p)?.[1]!==h)throw Error('resume_changed_non_transport_generation');
  for(const [p,h]of debug.sourceFiles)if(hash(await readFile(join(ROOT,p)))!==h)throw Error('debug_source_changed_before_resume');
  for(const key of receipt.keys){const call=await read(join(out,'calls',key+'.json')),run=await read(join(out,'runs',key+'.json'));if(call.response.status!=='ready'||run.status!=='submitted'||call.transportProof?.forwardedModelRequests!==1||!call.transportProof?.observedBackend?.startsWith(DEEPSEEK_PREFIX)||call.transportProof?.requestedApiEffort!=='high')throw Error('debug_submission_not_ready');}
  await validateFrozenInputs(out,original);
  const historicalRequestModels={...previous.historicalRequestModels};
  for(const claim of ledger.claims.values())if(claim.bucket==='smoke'){const request=await read(join(out,'requests',claim.key+'.json'));if(request.model.modelName==='opus'&&hash(request.model)!==hash(STUDY_MODELS.deepseek_via_claude))historicalRequestModels[claim.key]=request.model;}
  const resume={version:'ceiling-route-resume/v1',at:new Date().toISOString(),previousFreezeHash:hash(previous),approvalHash:hash(approval),debugFreezeHash:hash(debug),debugReceiptHash:hash(receipt),resumedModel:'deepseek_via_claude',remainingEngineeringCalls:0,allHistoricalFailuresRetained:true,formalInputsUnchanged:true,ledgerHead:ledger.rows.at(-1).digest};
  const generationCommit=(await exec('git',['rev-parse','HEAD'],{cwd:ROOT,windowsHide:true})).stdout.trim(),f={...previous,engineeringRevision:6,models:STUDY_MODELS,generationCommit,previousModelFreezeHash:hash(previous),routeResumeHash:hash(resume),engineeringDebugKeys:receipt.keys,historicalRequestModels,requiredSmoke:3,executionFiles:files,codeDigest:hash(files)};
  await writeOnce(join(out,'model-revisions','before-deepseek-resume-'+hash(previous)+'.json'),previous);await writeOnce(join(out,'model-route-resume.json'),resume);
  await save(join(out,'model-freeze.json'),f);await save(join(out,'model-freeze-binding.json'),{freezeHash:hash(f)});
  await writeOnce(join(out,'model-smoke-ready.json'),{freezeHash:hash(f),planned:3,submitted:3,keys:[(await read(join(out,'model-route-stop.json'))).terraKey,...receipt.keys],priorFailuresRetained:true});return f;
}
function factory(f,model){
  if(model==='deepseek_via_claude')return createCompatibleDeepSeekProvider({runtime:f.claudeRuntime});
  return createArenaToolCallProvider({settings:null,arenaCodex:{...f.models[model],timeoutMs:GENERATION_TIMEOUT_MS},credentials:{readKey:async()=>null},fetchImpl:fetch});
}
export async function runModelJobs(groups,perform){
  let stop=false;
  const workers=await Promise.allSettled(groups.flatMap(group=>{let next=0;return Array.from({length:group.concurrency},async()=>{try{while(!stop&&next<group.jobs.length)await perform(group.jobs[next++]);}catch(e){stop=true;throw e;}});}));
  const failure=workers.find(w=>w.status==='rejected');if(failure)throw failure.reason;
}
export async function runModelPhase(out,phase){
  return exclusive(out,async()=>{
    const readyOnly=phase==='evaluation-ready';if(readyOnly)phase='evaluation';
    const f=await verifyModelStudy(out),d=await read(join(out,'dataset.json')),index=await read(join(out,'textbook/index.json')),ledger=new BudgetLedger(out,f.budgets);let jobs,bucket;
    if(phase==='smoke'){
      if(f.engineeringRevision>=5)throw Error('engineering_budget_closed');
      const original=await read(join(out,'freeze.json')),pilot=(await read(join(original.engineeringSupplement.directory,'dataset.json'))).cases;
      jobs=[{c:pilot[1],model:'terra',arm:'D'},...['A','C','D'].map((arm,i)=>({c:pilot[i+4],model:'deepseek_via_claude',arm}))].map(j=>({...j,key:`model-smoke-${j.model}-${j.c.id}-${j.arm}`}));bucket='smoke';
    }else{
      if(readyOnly){if(f.engineeringRevision!==5)throw Error('ready_route_subset_not_bound');}
      else{if(f.engineeringRevision===5)throw Error('deepseek_route_stopped_use_only_evaluation_ready');const gate=await read(join(out,'model-smoke-ready.json')),required=f.requiredSmoke??3;if(gate.freezeHash!==hash(f)||gate.submitted!==required||gate.planned!==required)throw Error('model_smoke_gate_not_passed');}
      if(!['evaluation','oracle','practical','stability'].includes(phase))throw Error('unknown_model_phase');jobs=studyCells(d,f.assignment,phase);bucket=phase;
      if(readyOnly)jobs=jobs.filter(j=>j.model==='sol'||j.model==='terra');
    }
    jobs=phase==='smoke'?jobs:ordered(jobs,j=>j.c.id+j.arm,SEED+phase);const rows=[],streaks={};
    const groups=phase==='smoke'||phase==='oracle'||phase==='practical'?[{jobs,concurrency:f.concurrency[phase]}]:['sol','deepseek_via_claude','terra'].map(model=>({jobs:jobs.filter(j=>j.model===model),concurrency:f.concurrency[model]}));
    await runModelJobs(groups,async j=>{
      const fresh=!ledger.claims.has(j.key);let override;
      if(j.arm==='O'){
        override=phase==='oracle'?await oracleMaterials({out,ledger,c:j.c,index}):await read(join(out,'oracle',j.c.id+'.json'));
        if(override.status!=='selected'){
          const row={key:j.key,caseId:j.c.id,arm:j.arm,version:'V0',bucket,modelKind:j.model,status:'material_selection_failed',attempt:{status:'provider_error'},usage:null,elapsedMs:0,retrieval:override,patterns:[]};await writeOnce(join(out,'runs',j.key+'.json'),row);rows.push(row);return;
        }
      }
      const row=await runDecision({out,ledger,...j,version:'V0',index,bucket,modelKind:j.model,modelOverride:f.models[j.model],override,providerFactory:()=>factory(f,j.model)});rows.push(row);
      streaks[j.model]=serviceFailureStreak(streaks[j.model]??0,row,fresh);
      if(phase==='smoke'&&row.status!=='submitted')throw Error('model_engineering_gate_failed');
      if(row.failureCode==='claude_backend_not_verified'||row.failureCode==='claude_proxy_route_changed'||row.failureCode==='claude_runtime_changed')throw Error('model_route_identity_changed');
      if(streaks[j.model]>=3)throw Error('model_service_unavailable_resume_unstarted_after_recovery');
    });
    const receipt={phase:readyOnly?'evaluation-ready':phase,freezeHash:hash(f),planned:jobs.length,submitted:rows.filter(r=>r.status==='submitted').length,rowsDigest:hash([...rows].sort((a,b)=>a.key.localeCompare(b.key)))};
    await writeOnce(join(out,'phases','models-'+receipt.phase+'.json'),receipt);
    if(phase==='smoke')await writeOnce(join(out,'model-smoke-ready.json'),{freezeHash:hash(f),planned:jobs.length,submitted:receipt.submitted,priorFailedKeys:f.failedEngineeringKeys??[]});return receipt;
  });
}
export async function modelStudyStatus(out){const ledger=new BudgetLedger(out,MODEL_BUDGETS);return {version:'ceiling-model-progress/v1',calls:ledger.snapshot(),modelFreeze:await exists(join(out,'model-freeze.json')),modelSmokeReady:await exists(join(out,'model-smoke-ready.json'))};}
export async function recoverModelStudy(out){
  const lock=join(out,'run.lock');if(await exists(lock)){const value=await read(lock);try{process.kill(value.pid,0);throw Error('run_process_still_alive');}catch(e){if(e.code!=='ESRCH')throw e;}await unlink(lock);}
  const ledger=new BudgetLedger(out,MODEL_BUDGETS);
  for(const [key,claim]of ledger.claims)if(!ledger.settled.has(key)){
    const path=join(out,'calls',key+'.json');let saved;
    if(await exists(path))saved=await read(path);else{saved={key,status:'interrupted',requestDigest:claim.requestDigest,response:{status:'provider_error',failureCode:'cli_incomplete_turn'},elapsedMs:null};await writeOnce(path,saved);}
    ledger.settle(key,{status:saved.status,callDigest:hash(saved),usage:saved.response?.usage??null});
  }
  return ledger.snapshot();
}
