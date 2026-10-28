// Read-only execution boundary check; never imports the recovered dispatch helper.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const r=await load(root+'/integration/coac249-311-native-fidelity-reviewed-20261028.json');
const raw=await load(r.raw.path),plan=await load(r.plan.path),contract=await load(r.requestContract.path);
const cli=await import(pathToFileURL(root+'/audit/runtimes/coac244-vision-production-schema-v2-20261028/textbook-production-cli.mjs'));
function validate(v,s,p='$'){
 if(s.enum)assert(s.enum.some(x=>JSON.stringify(x)===JSON.stringify(v)),p+' enum');
 if(s.type==='object'){
  assert(v&&typeof v==='object'&&!Array.isArray(v),p);
  for(const k of s.required??[])assert(Object.hasOwn(v,k),p+'.'+k);
  if(s.additionalProperties===false)for(const k of Object.keys(v))assert(Object.hasOwn(s.properties,k),p+'.'+k+' extra');
  for(const [k,x] of Object.entries(v))if(s.properties?.[k])validate(x,s.properties[k],p+'.'+k);
 }else if(s.type==='array'){
  assert(Array.isArray(v),p); if(s.minItems!==undefined)assert(v.length>=s.minItems);if(s.maxItems!==undefined)assert(v.length<=s.maxItems);
  v.forEach((x,i)=>validate(x,s.items,p+'['+i+']'));
 }else if(s.type)assert.equal(typeof v,s.type,p);
}
validate(raw.output,plan.schema);
assert.equal(raw.requestPrompt,cli.textbookClosedPrompt(plan.prompt));
assert.equal(sha(plan.prompt),contract.promptSha256);
assert.equal(sha(JSON.stringify(plan.schema)),contract.schemaSha256);
assert.equal(sha(await readFile(r.plan.path)),contract.planSha256);
assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));
assert.deepEqual(raw.output,r.modelReview);
assert(raw.success&&raw.exitCode===0&&!raw.timedOut&&!raw.outputOverflow);
const e=raw.requestExecution,a=e.args;
assert.equal(e.model,'gpt-6.1-terra');assert.equal(e.reasoningEffort,'max');
assert.equal(a[a.indexOf('--model')+1],e.model);assert(a.includes('model_reasoning_effort="max"'));
assert.deepEqual(a.flatMap((x,i)=>x==='-i'?[a[i+1]]:[]),plan.images);
assert.deepEqual(e.images,r.images);
await writeFile(new URL('execution.json',import.meta.url),JSON.stringify({
 schema:'coac250-311-native-execution-recheck/1',schemaValidated:true,closedPromptEqual:true,
 promptSha256:sha(plan.prompt),closedPromptSha256:sha(raw.requestPrompt),schemaSha256:contract.schemaSha256,
 argsAndImageOrderEqual:true,images:9,outputEqualsRawAndReceipt:true,
 callId:r.call.callId,usage:r.call.usage,durationMs:r.call.durationMs,
 newModelCalls:0,dispatchHelperExecuted:false,admissionGranted:false
},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({executionVerified:true,schemaValidated:true,images:9,newCalls:0}));
