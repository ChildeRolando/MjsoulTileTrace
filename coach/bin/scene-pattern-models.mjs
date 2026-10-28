#!/usr/bin/env node
import {resolve,join} from 'node:path';
import {freezeModelStudy,repairModelEngineeringFreeze,repairRuntimeEngineeringFreeze,repairSingleResponseFreeze,stopDeepSeekRoute,resumeDeepSeekRoute,repairProtocolMetadata,runModelPhase,modelStudyStatus,recoverModelStudy} from '../scripts/mortal-ablation/ceiling-model-study.mjs';
import {reportModelStudy} from '../scripts/mortal-ablation/ceiling-model-report.mjs';
import {save,exists,hash} from '../scripts/mortal-ablation/ceiling-protocol.mjs';
const [command='status',...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||args[i+1]===undefined)throw Error('expected_named_argument');options[args[i].slice(2)]=args[i+1];}
const out=resolve(options.out??'E:/AgentData/Coach/scene-pattern-ceiling-restart2-20261028');
try{
  let result;
  if(command==='freeze')result=await freezeModelStudy(out);
  else if(command==='repair-engineering')result=await repairModelEngineeringFreeze(out);
  else if(command==='repair-runtime')result=await repairRuntimeEngineeringFreeze(out);
  else if(command==='repair-single-response')result=await repairSingleResponseFreeze(out);
  else if(command==='stop-deepseek')result=await stopDeepSeekRoute(out);
  else if(command==='resume-deepseek')result=await resumeDeepSeekRoute(out);
  else if(command==='repair-protocol')result=await repairProtocolMetadata(out);
  else if(command==='status')result=await modelStudyStatus(out);
  else if(command==='recover')result=await recoverModelStudy(out);
  else if(command==='run')result=await runModelPhase(out,options.phase??'smoke');
  else if(command==='report')result=await reportModelStudy(out);
  else if(command==='all'){
    await freezeModelStudy(out);if(!await exists(join(out,'model-smoke-ready.json')))await runModelPhase(out,'smoke');
    for(const phase of ['evaluation','oracle','practical','stability'])await runModelPhase(out,phase);
    result=await reportModelStudy(out);
  }else throw Error('unknown_command');
  console.log(JSON.stringify({command,out,result:command==='all'||command==='report'?{complete:result.complete,conclusion:result.conclusion}:['freeze','repair-engineering','repair-runtime','repair-single-response','stop-deepseek','resume-deepseek','repair-protocol'].includes(command)?{freezeHash:hash(result),models:result.models,budgets:result.budgets}:result}));
}catch(e){await save(join(out,'last-error.json'),{command,message:String(e.message),at:new Date().toISOString(),pid:process.pid});console.error(e.stack);process.exitCode=1;}
