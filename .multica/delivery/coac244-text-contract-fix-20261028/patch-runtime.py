import json,hashlib,shutil
from pathlib import Path
O=Path(__file__).parent;paths=json.loads((O/'paths.json').read_text(encoding='utf8'));S=Path(paths['runtime']);B=Path(paths['base'])
shutil.copy2(O/'exact-text-contract.mjs',S/'exact-text-contract.mjs')
p=S/'textbook-production-web.mjs';s=(B/'textbook-production-web.mjs').read_text(encoding='utf8')
s=s.replace("import {invokeTextbookCodex} from './textbook-production-cli.mjs';","import {invokeTextbookCodex,textbookClosedPrompt} from './textbook-production-cli.mjs';\nimport {buildExactTextRequest,validateExactTextOutput} from './exact-text-contract.mjs';")
s=s.replace(' const prompt=[inlinePlan?', ' let prompt=[inlinePlan?')
# This sits after the actual generic construction but before hashes, raw/ledger or invocation.
needle=' const currentBatchBinding=batch?'
assert s.count(needle)==1
block=""" const exactRequest=buildExactTextRequest({source,sourceSha256:sha(sourceBytes),parent:parentCandidate,revision,ids,figureIds});
 prompt=exactRequest.prompt;Object.keys(schema).forEach(k=>delete schema[k]);Object.assign(schema,exactRequest.schema);
 const modelRequest={prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:visualInputs.map(a=>dataPath(a.path)),timeoutMs:modelTimeoutMs,stopFiles:option('--stop-file')?[dataPath(option('--stop-file'))]:[]};
 if(option('--request-only')){console.log(JSON.stringify({request:modelRequest,closedPrompt:textbookClosedPrompt(modelRequest.prompt),contract:exactRequest.proof,modelCalls:0}));process.exit(0);}
 if(option('--validate-existing-raw')){const raw=JSON.parse(await readFile(dataPath(option('--validate-existing-raw'))));validateExactTextOutput(exactRequest.job,raw.parsedOutput);console.log(JSON.stringify({validationOnly:true,modelCalls:0}));process.exit(0);}
"""
s=s.replace(needle,block+needle)
old="call=await invokeTextbookCodex({prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:visualInputs.map(a=>dataPath(a.path)),timeoutMs:modelTimeoutMs,stopFiles:option('--stop-file')?[dataPath(option('--stop-file'))]:[]});"
assert s.count(old)==1
s=s.replace(old,'call=await invokeTextbookCodex(modelRequest);')
s=s.replace(' record.visualInputs=visualInputs;', ' record.exactTextContract=exactRequest.proof;record.visualInputs=visualInputs;')
needle=" if(!call.success)throw Error('web_translation_call_failed_raw_preserved');"
assert s.count(needle)==1
s=s.replace(needle,needle+"\n validateExactTextOutput(exactRequest.job,call.output);")
needle=" console.log(JSON.stringify({state:'resumed-existing',candidatePath:output,modelCalls:0}));process.exit(0);"
assert s.count(needle)==1
s=s.replace(needle," const ex=buildExactTextRequest({source,sourceSha256:sha(sourceBytes),parent:parentCandidate,revision,ids:revision.textBlockIds,figureIds:revision.figureIds});validateExactTextOutput(ex.job,{translations:existing.body.blocks.filter(b=>b.type==='text'&&revision.textBlockIds.includes(b.sourceBlockIds[0])).map(b=>({sourceBlockId:b.sourceBlockIds[0],text:b.text})),figures:[]});\n"+needle)
p.write_text(s,encoding='utf8')
def bind(p):return dict(path=str(p.resolve()),sha256=hashlib.sha256(p.read_bytes()).hexdigest())
deps=[dict(name=p.name,**bind(p)) for p in S.iterdir() if p.is_file() and p.name!='exact-runtime-manifest.json']
manifest=dict(schema='coac244-exact-text-runtime/2',parent=bind(B/'bounded-runtime-manifest.json'),files=deps,modelCalls=0,changes=['producer request construction/strict output check/resume rejection','exact-source-parent-notes bound two-target helper and contracts'],oldFrozenFilesChanged=False)
(S/'exact-runtime-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(bind(S/'exact-runtime-manifest.json')))
