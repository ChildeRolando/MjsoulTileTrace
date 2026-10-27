#!/usr/bin/env node
import { resolve,join } from 'node:path';
import { prepareCeiling,freezeCeiling,labelCeiling } from '../scripts/mortal-ablation/ceiling-prepare.mjs';
import { runPhase,recoverCeiling } from '../scripts/mortal-ablation/ceiling-run.mjs';
import { selectCeilingVersion,reportCeiling } from '../scripts/mortal-ablation/ceiling-report.mjs';
import { DEFAULT_OUT,DEFAULT_DATABASE,DEFAULT_SNAPSHOT,read,save,exists } from '../scripts/mortal-ablation/ceiling-protocol.mjs';
const [command='status',...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||args[i+1]===undefined)throw Error('expected_named_argument');options[args[i].slice(2)]=args[i+1];}
const out=resolve(options.out??DEFAULT_OUT);
async function execute(){
  const prepare=()=>prepareCeiling({out,database:options.database??DEFAULT_DATABASE,snapshot:options.snapshot??DEFAULT_SNAPSHOT});
  if(command==='prepare')return prepare();
  if(command==='freeze')return freezeCeiling(out,{repair:options.repair==='true'});
  if(command==='label')return labelCeiling(out,options.database??DEFAULT_DATABASE);
  if(command==='run')return runPhase(out,options.phase??'smoke1');
  if(command==='select')return selectCeilingVersion(out);
  if(command==='recover')return recoverCeiling(out);
  if(command==='report')return reportCeiling(out);
  if(command==='status')return reportCeiling(out,{progressOnly:true});
  if(command==='all'){
    if(options['wait-prepare-pid']){
      while(!await exists(join(out,'dataset.json'))){try{process.kill(Number(options['wait-prepare-pid']),0);}catch{throw Error('source_preparation_exited_without_complete_dataset');}await new Promise(r=>setTimeout(r,5000));}
    }
    await prepare();await freezeCeiling(out);await labelCeiling(out,options.database??DEFAULT_DATABASE);
    if(!await exists(join(out,'smoke-ready.json')))await runPhase(out,options.smoke??'smoke1');
    for(const phase of ['dev-A','dev-V0','dev-r1','dev-r2','dev-r3'])await runPhase(out,phase);
    await selectCeilingVersion(out);
    for(const phase of ['evaluation','oracle','practical','stability'])await runPhase(out,phase);
    return reportCeiling(out);
  }
  throw Error('unknown_command');
}
try{const result=await execute();console.log(JSON.stringify({command,out,result:command==='prepare'?{prepared:result.cases.length}:command==='report'||command==='all'?{complete:result.complete,conclusion:result.conclusion}:result}));}
catch(e){await save(join(out,'last-error.json'),{command,message:String(e.message),at:new Date().toISOString(),pid:process.pid});console.error(e.stack);process.exitCode=1;}
