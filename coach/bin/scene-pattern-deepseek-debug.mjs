#!/usr/bin/env node
import {resolve,join} from 'node:path';
import {replayDeepSeekFailure,runDeepSeekDebug,waitForOwners} from '../scripts/mortal-ablation/ceiling-deepseek-debug.mjs';
import {save} from '../scripts/mortal-ablation/ceiling-protocol.mjs';
const [command='offline',...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||args[i+1]===undefined)throw Error('expected_named_argument');options[args[i].slice(2)]=args[i+1];}
const out=resolve(options.out??'E:/AgentData/Coach/scene-pattern-ceiling-restart2-20261028');
try{
  if(command==='wait-and-run'){await waitForOwners(options.pids.split(',').map(Number));console.log(JSON.stringify(await runDeepSeekDebug(out)));}
  else if(command==='offline')console.log(JSON.stringify(await replayDeepSeekFailure(out)));
  else if(command==='run')console.log(JSON.stringify(await runDeepSeekDebug(out)));
  else throw Error('unknown_command');
}catch(e){await save(join(out,'deepseek-debug-error.json'),{command,error:String(e.message),at:new Date().toISOString(),pid:process.pid});console.error(e.stack);process.exitCode=1;}
