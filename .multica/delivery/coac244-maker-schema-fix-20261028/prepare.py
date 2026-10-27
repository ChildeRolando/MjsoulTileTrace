import json,hashlib,shutil,subprocess
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).parent
B=R/'audit/runtimes/coac244-vision-terra-max-v1-20261027';S=R/'audit/runtimes/coac244-vision-production-schema-v2-20261028';S.mkdir(exist_ok=True)
def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def sha(b):return hashlib.sha256(b).hexdigest()
def bind(p):return dict(path=str(Path(p).resolve()),sha256=sha(Path(p).read_bytes()))
base=load(B/'runtime-manifest.json')
for p in B.iterdir():
 if p.is_file():shutil.copy2(p,S/p.name)
for f in base['files']:assert sha((B/f['path']).read_bytes())==f['sha256']
shutil.copy2(O/'production-schema.mjs',S/'production-schema.mjs')
# The live invoke and offline request test use the same construction, hashes, stdin and output.schema.json.
p=S/'textbook-production-cli.mjs';s=(B/p.name).read_text(encoding='utf8')
start=s.index("    const schemaPath = join(work, 'output.schema.json')")
end=s.index('    const result = await collect',start)
old=s[start:end]
new="""    const request=await prepareTextbookCliRequest({prompt,schema,model:callerRequested.model,reasoningEffort:callerRequested.reasoningEffort,images,work});
    const {args,closedPrompt,requestExecution,outputPath}=request;
    const startedAt = new Date().toISOString(), start = Date.now();
    await assertTextbookModelAdmission({usageLimitCanary,stopFiles});
"""
helper="""
/** Construct actual CLI argv/stdin/schema/images without spawning a model. */
export async function prepareTextbookCliRequest({prompt,schema,model='gpt-6.1-sol',reasoningEffort='high',images=[],work}) {
  const callerRequested={model,reasoningEffort};
  ({model,reasoningEffort}=textbookRequestConfig(images,model,reasoningEffort));
  const schemaPath=join(work,'output.schema.json'),outputPath=join(work,'final.json');
  await writeFile(schemaPath,JSON.stringify(schema),{flag:'wx'});
  const args=['exec','--model',model,'--config',`model_reasoning_effort="${reasoningEffort}"`,'--config','web_search="disabled"','--ephemeral','--ignore-user-config','--ignore-rules','--sandbox','read-only','--strict-config','--skip-git-repo-check','--json','--output-schema',schemaPath,'--output-last-message',outputPath,'--cd',work];
  for(const image of images)args.push('-i',image);
  for(const feature of TEXTBOOK_DISABLED_FEATURES)args.push('--disable',feature);
  args.push('-');
  const closedPrompt=textbookClosedPrompt(prompt);
  const requestExecution={schema:'coach-textbook-cli-request/1',policy:'coac244-vision-production-schema-v2-20261028',model,reasoningEffort,callerRequested,args:[...args],images:await Promise.all(images.map(async path=>{const b=await readFile(path);return {path,sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};})),remoteBackend:'unverified; request arguments and returned events only'};
  return {args,closedPrompt,requestExecution,outputPath,schemaPath};
}
"""
s=s[:start]+new+s[end:];s=s.replace('/** Run a capability-restricted structured Codex turn with explicit model and effort. */',helper+'\n/** Run a capability-restricted structured Codex turn with explicit model and effort. */');p.write_text(s,encoding='utf8')
# Standard web producer uses the same conservative builder and output validator as the exact222 caller.
p=S/'textbook-production-web.mjs';s=(B/p.name).read_text(encoding='utf8');s=s.replace('#!/usr/bin/env node\n',"#!/usr/bin/env node\nimport {webProductionSchema,validateWebProductionOutput} from './production-schema.mjs';\n",1)
s=s.replace("import {invokeTextbookCodex} from './textbook-production-cli.mjs';","import {invokeTextbookCodex,prepareTextbookCliRequest} from './textbook-production-cli.mjs';")
old=" const schema={type:'object',additionalProperties:false,properties:{translations:{type:'array',minItems:ids.length,maxItems:ids.length,items:textItem},figures:{type:'array',minItems:figureIds.length,maxItems:figureIds.length,items:figureItem}},required:['translations','figures']};"
assert old in s;s=s.replace(old,' const schema=webProductionSchema({textIds:ids,figureIds});')
old=" if(!call.success)throw Error('web_translation_call_failed_raw_preserved');";assert old in s
s=s.replace(old,old+'\n validateWebProductionOutput(call.output,{textIds:ids,figureIds});')
needle=" await ensureDispatchAllowed();\n const cliBytes="
assert s.count(needle)==1
s=s.replace(needle," if(option('--request-only')){const work=dataPath(option('--request-only'));await mkdir(work,{recursive:false});const request=await prepareTextbookCliRequest({prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:visualInputs.map(a=>dataPath(a.path)),work});console.log(JSON.stringify({request,modelCalls:0,offlineConstructionOnly:true}));process.exit(0);}\n"+needle)
p.write_text(s,encoding='utf8')
manifest={**base,'schema':'coac244-vision-production-runtime/2','runtime':str(S),'parentManifest':bind(B/'runtime-manifest.json'),'changes':['portable web maker schema and strict local cardinality/fixed-field validation','same prepareTextbookCliRequest used by invoke and offline captures'],'files':[dict(path=f['path'],sha256=sha((S/f['path']).read_bytes())) for f in base['files']]+[dict(path='production-schema.mjs',sha256=sha((S/'production-schema.mjs').read_bytes()))]}
save(S/'runtime-manifest.json',manifest)
# Preserve exact failed caller and evidence from the delivered248 commit, never amend old run/raw.
original=subprocess.check_output(['git','show','2606f3e:.multica/delivery/coac248-222-point-r2-20261028/run.mjs'])
(O/'original-run222.mjs').write_bytes(original)
s=original.decode('utf8').replace("coac244-vision-terra-max-v1-20261027","coac244-vision-production-schema-v2-20261028").replace("coac248-web-222-5-r2-20261028","coac248-web-222-5-r3-20261028")
s=s.replace("const {invokeTextbookCodex}=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));","const {invokeTextbookCodex}=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));\nconst {webProductionSchema,validateWebProductionOutput}=await import(pathToFileURL(join(runtime,'production-schema.mjs')));")
s=s.replace("const manifestSha='12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6';",f"const manifestSha='{sha((S/'runtime-manifest.json').read_bytes())}';")
s=s.replace('manifest.files.length,27','manifest.files.length,28').replace('runtimeFiles:27','runtimeFiles:28')
s=s.replace("'20d7f5e0-2640-4b87-bde1-e6505d839822'];","'20d7f5e0-2640-4b87-bde1-e6505d839822','b702fbf7-dbe4-4533-9a55-aa0912a334f3'];")
a=s.index('const properties=Object.fromEntries');b=s.index('const prompt=',a)
s=s[:a]+"const schema=webProductionSchema({textIds:[],figureIds:[old.sourceBlockIds[0]],fixedFigure:fields});\n"+s[b:]
s=s.replace(" assert.equal(result.output.translations.length,0);", " validateWebProductionOutput(result.output,{textIds:[],figureIds:[old.sourceBlockIds[0]],fixedFigure:fields,expectedTranscription:expected});\n assert.equal(result.output.translations.length,0);")
(O/'run222-fixed.mjs').write_text(s,encoding='utf8')
raw=R/'web-production/v1/raw-calls/b702fbf7-dbe4-4533-9a55-aa0912a334f3.json';shutil.copy2(raw,O/'failed-production-raw.json')
receipt=json.loads(subprocess.check_output(['git','show','2606f3e:.multica/delivery/coac248-222-point-r2-20261028/receipt-failed-production.json']).decode('utf8'));save(O/'failed-production-receipt.json',receipt)
save(O/'paths.json',dict(root=str(R),base=str(B),runtime=str(S),oldRaw=bind(raw),newManifest=bind(S/'runtime-manifest.json')))
print(json.dumps(dict(runtime=str(S),manifestSha256=sha((S/'runtime-manifest.json').read_bytes()),files=len(manifest['files']))))
