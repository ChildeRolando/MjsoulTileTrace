from pathlib import Path
import re,json,hashlib,shutil
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
SRC=Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study')
OUT=ROOT/'audit/runtimes/coac244-vision-terra-max-v1-20261027'
OUT.mkdir(exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
names=[p.name for p in SRC.glob('textbook-*') if p.suffix in ('.mjs','.py','.json') and not '.test.' in p.name and not p.name.startswith(('textbook-review','textbook-library','textbook-units','textbook-nemata','textbook-figure'))]
# Preserve current corrections/dependency graph; the dedicated inline text snapshots stay untouched.
for n in names: shutil.copyfile(SRC/n,OUT/n)
cli=OUT/'textbook-production-cli.mjs'
s=(ROOT/'audit/runtimes/web-b8-transport-diag-20261027/textbook-production-cli.mjs').read_text(encoding='utf-8')
helper='''
export function textbookRequestConfig(images, model='gpt-6.1-sol', reasoningEffort='high') {
  if(!Array.isArray(images))throw Error('textbook_images_must_be_array');
  if(images.length)return {model:'gpt-6.1-terra',reasoningEffort:'max'};
  if(model!=='gpt-6.1-sol'||reasoningEffort!=='high')throw Error('textbook_text_model_not_authorized');
  return {model,reasoningEffort};
}
export function isRecordedTextbookModel(c) {
  if(!c)return false;
  if(c.model==='gpt-6.1-sol'&&c.reasoningEffort==='high')return true;
  const r=c.requestExecution;
  return c.model==='gpt-6.1-terra'&&c.reasoningEffort==='max'&&r?.model===c.model&&r.reasoningEffort===c.reasoningEffort&&r.schema==='coach-textbook-cli-request/1'&&r.images?.length>0&&r.images.every(i=>/^[a-f0-9]{64}$/.test(i.sha256)&&i.bytes>0)&&r.args[r.args.indexOf('--model')+1]===c.model&&r.args.includes('model_reasoning_effort="max"')&&r.args.filter(x=>x==='-i').length===r.images.length;
}
'''
pos=s.index('/** Run a capability-restricted')
s=s[:pos]+helper+s[pos:]
s=s.replace("  if (model !== 'gpt-6-luna' && model !== 'gpt-6.1-sol') throw new Error('textbook_model_not_allowlisted');\n  if (reasoningEffort !== 'high') throw new Error('textbook_reasoning_effort_must_be_high');", "  const callerRequested={model,reasoningEffort};\n  ({model,reasoningEffort}=textbookRequestConfig(images,model,reasoningEffort));")
s=s.replace("'model_reasoning_effort=\"high\"'", "`model_reasoning_effort=\"${reasoningEffort}\"`")
s=s.replace("    const result = await collect", "    const requestExecution={schema:'coach-textbook-cli-request/1',policy:'coac244-vision-terra-max-v1-20261027',model,reasoningEffort,callerRequested,args:[...args],images:await Promise.all(images.map(async path=>{const b=await readFile(path);return {path,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};})),remoteBackend:'unverified; request arguments and returned events only'};\n    const result = await collect")
s=s.replace('const parsed={ ...parseTextbookCliResult(result, rawLastMessage),','const parsed={ ...parseTextbookCliResult(result, rawLastMessage), requestExecution,')
cli.write_text(s,encoding='utf-8')
# Caller records use the actual CLI request, including failures. History is accepted only under its original model/effort pair.
for p in OUT.glob('*.mjs'):
 if p.name=='textbook-production-cli.mjs':continue
 s=p.read_text(encoding='utf-8')
 if 'invokeTextbookCodex' in s or re.search(r"(?:model|reasoningEffort).*gpt-6.1-sol",s):
  s="import {isRecordedTextbookModel} from './textbook-production-cli.mjs';\n"+s
 # Replace only fixed model-pair gates, retaining all original source/raw/parent/coverage gates.
 for obj in ['call','c','p']:
  s=re.sub(rf"{obj}\.model\s*!==\s*(?:model|auditModel|'gpt-6.1-sol')\s*\|\|\s*{obj}\.reasoningEffort\s*!==\s*(?:reasoningEffort|auditReasoningEffort|'high')",f'!isRecordedTextbookModel({obj})',s)
 # All explicit result-based call records. The effective request remains independently archived in the raw result.
 for result in ['call','result']:
  if result=='call' and p.name!='textbook-production-web.mjs':continue
  if result=='result' and p.name=='textbook-production-web.mjs':continue
  # production-web and dictionary fixed literal records; audit-web/legacy/dictionary shorthand records
  if p.name=='textbook-production-web.mjs':
   s=s.replace("model:'gpt-6.1-sol',reasoningEffort:'high',timeoutMs:modelTimeoutMs,startedAt:call.startedAt", "model:call.requestExecution.model,reasoningEffort:call.requestExecution.reasoningEffort,requestExecution:call.requestExecution,timeoutMs:modelTimeoutMs,startedAt:call.startedAt")
   s=s.replace('callId,rawLastMessage:call.rawLastMessage','callId,requestExecution:call.requestExecution,rawLastMessage:call.rawLastMessage')
   s=s.replace("candidate.provenance.model=attempts.length?'gpt-6.1-sol':null;candidate.provenance.reasoningEffort=attempts.length?'high':null;", "candidate.provenance.model=attempts.length?attempts[0].model:null;candidate.provenance.reasoningEffort=attempts.length?attempts[0].reasoningEffort:null;candidate.provenance.requestExecution=attempts.length?attempts[0].requestExecution:null;")
  elif p.name in ('textbook-audit-web.mjs','textbook-audit-tile-dictionary.mjs'):
   s=s.replace('model,reasoningEffort,success:', 'model:result.requestExecution?.model??model,reasoningEffort:result.requestExecution?.reasoningEffort??reasoningEffort,requestExecution:result.requestExecution,success:')
  elif p.name=='textbook-audit-legacy.mjs':
   s=s.replace("model:'gpt-6.1-sol',reasoningEffort:'high',success:", "model:result.requestExecution?.model??'gpt-6.1-sol',reasoningEffort:result.requestExecution?.reasoningEffort??'high',requestExecution:result.requestExecution,success:")
  elif p.name=='textbook-audit.mjs':
   s=s.replace('model: auditModel, reasoningEffort: auditReasoningEffort, parameters:', 'model: result.requestExecution?.model??auditModel, reasoningEffort: result.requestExecution?.reasoningEffort??auditReasoningEffort, requestExecution:result.requestExecution, parameters:')
  elif p.name=='textbook-production-web-dictionary.mjs':
   s=s.replace("model:'gpt-6.1-sol',reasoningEffort:'high',startedAt:result.startedAt",'model:result.requestExecution.model,reasoningEffort:result.requestExecution.reasoningEffort,requestExecution:result.requestExecution,startedAt:result.startedAt')
   s=s.replace("provenance:{model:'gpt-6.1-sol',reasoningEffort:'high',",'provenance:{model:result.requestExecution.model,reasoningEffort:result.requestExecution.reasoningEffort,requestExecution:result.requestExecution,')
 if p.name=='textbook-production.mjs':
  s=s.replace("const model = option('--model', 'gpt-6.1-sol');","const model = option('--model', 'gpt-6.1-terra');")
  s=s.replace("if (!['gpt-6-luna','gpt-6.1-sol'].includes(model))", "if (model!=='gpt-6.1-terra')")
  s=s.replace("const effort = 'high';", "const effort = 'max';")
  s=s.replace("'--config model_reasoning_effort=high'", "'--config model_reasoning_effort=max'")
  s=s.replace('record.rawArtifactSha256=rawArtifactSha256;', 'record.requestExecution=call.requestExecution;record.rawArtifactSha256=rawArtifactSha256;')
 p.write_text(s,encoding='utf-8')
# Explicit inventory: no frozen prior snapshot, owner or provider config was mutated.
files=[{'path':p.name,'sha256':sha(p.read_bytes())} for p in sorted(OUT.iterdir()) if p.is_file()]
manifest={'schema':'coac244-vision-runtime/1','authorization':'01a17e76-a0e3-7cdc-a555-5f856576e671','runtime':str(OUT),'imageRequest':{'model':'gpt-6.1-terra','reasoningEffort':'max','retry':0},'textRequest':{'model':'gpt-6.1-sol','reasoningEffort':'high','existingFrozenTextRuntimeUnchanged':True},'files':files,'historicalModelPairs':['gpt-6.1-sol/high','gpt-6.1-terra/max with requestExecution'],'source':str(SRC),'firstAuthorizedImageCall':None}
(OUT/'runtime-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'runtime':str(OUT),'files':len(files),'manifestSha256':sha((OUT/'runtime-manifest.json').read_bytes())}))
