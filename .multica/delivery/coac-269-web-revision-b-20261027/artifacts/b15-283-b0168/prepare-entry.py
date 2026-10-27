"""Prepare a single exact b0168 production contract; retain all original review findings."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
STAGE = ROOT / 'web-production/v1/runs/coac269-283-b0168-20261028'
BASE = ROOT / 'audit/runtimes/coac244-vision-terra-max-v1-20261027'
RUNTIME = ROOT / 'audit/runtimes/coac269-283-b0168-exact-v1-20261028'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
load = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))

base_manifest = BASE / 'runtime-manifest.json'
assert sha(base_manifest) == '12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6'
for item in load(base_manifest)['files']:
    assert sha(BASE / item['path']) == item['sha256']
packet = load(OUT / 'semantic-target-packets.json')
for field in ['candidate', 'source', 'oldAudit']:
    assert sha(packet[field]['path']) == packet[field]['sha256']
parent = load(packet['candidate']['path'])
target_id = 'modern-yabejp-ja:chapter06-exercise003:b0168'
before = next(b['text'] for b in parent['body']['blocks'] if b['sourceBlockIds'] == [target_id])
assert before == '摸到后再改为③即可，（由于摸入宝牌'
q12 = next(t for t in packet['targets'] if t['name'] == 'Q12-b0168-condition')
contract = {'schema': 'coac269-exact-b0168-contract/1', 'authorizationComment': '01a17f08-ea29-7998-9b93-505223235e4e',
            'chapterId': 'nemata-jp-chapter-283-1', 'targetId': target_id, 'parent': packet['candidate'],
            'source': packet['source'], 'notes': packet['oldAudit'], 'before': before, 'expected': before + '或',
            'question': q12, 'maximumProductionCalls': 1, 'maximumIndependentFirstReviewCalls': 1, 'automaticRetry': 0}
assert not (STAGE / 'dispatch-started.json').exists(), 'never rebuild after dispatch'
if RUNTIME.exists() and (RUNTIME / 'b0168-runtime-manifest.json').exists():
    (OUT / 'initial-entry-manifest.json').write_bytes((RUNTIME / 'b0168-runtime-manifest.json').read_bytes())
RUNTIME.mkdir(exist_ok=True)
for p in BASE.iterdir():
    if p.is_file():
        shutil.copyfile(p, RUNTIME / p.name)
(RUNTIME / 'b0168-contract.json').write_text(json.dumps(contract, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
helper = r'''import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(new URL('./b0168-contract.json',import.meta.url));
const c=JSON.parse(bytes);
export function exactRequest({source,revision,parent,ids,figureIds,images}){
 if(source.sourceId!=='modern-yabejp-ja'||source.articleId!=='chapter06-exercise003'||revision?.parentSha256!==c.parent.sha256||revision?.notesSha256!==c.notes.sha256||source.blocks.length!==1195||JSON.stringify(ids)!==JSON.stringify([c.targetId])||figureIds.length||images.length||parent.body.blocks.find(b=>b.sourceBlockIds[0]===c.targetId)?.text!==c.before)throw Error('b0168_exact_request_binding');
 const prompt='执行唯一已批准的单字插入，不重译、不润色。只在b0168末尾“摸入宝牌”后加“或”，其它每个字符原样。所有图片和其它1194块原样继承，不输出任何figure，不声称清除其它旧问题。完整Q12原文、父译文及原图SHA只是绑定上下文；本请求无图片payload，不承担新的图片读牌裁决。必须逐字符返回唯一expected，禁止增加标点、校注、文字、段落或figure。\n'+JSON.stringify({targetId:c.targetId,before:c.before,expected:c.expected,source:c.source,parent:c.parent,oldAudit:c.notes,completeQ12:c.question})+'\nReturn JSON only.';
 const schema={type:'object',additionalProperties:false,required:['translations','figures'],properties:{translations:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,required:['sourceBlockId','text'],properties:{sourceBlockId:{type:'string',enum:[c.targetId]},text:{type:'string',enum:[c.expected]}}}},figures:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}}};
 return {prompt,schema,proof:{contractSha256:sha(bytes),targetId:c.targetId,expectedSha256:sha(c.expected)}};
}
export function validateExact(output){
 if(JSON.stringify(output)!==JSON.stringify({translations:[{sourceBlockId:c.targetId,text:c.expected}],figures:[]})){
  if(!output||Object.keys(output).sort().join(',')!=='figures,translations'||!Array.isArray(output.translations)||output.translations.length!==1||!Array.isArray(output.figures)||output.figures.length)throw Error('b0168_exact_output_scope_raw_preserved');
  const t=output.translations[0];if(Object.keys(t).sort().join(',')!=='sourceBlockId,text'||t.sourceBlockId!==c.targetId||t.text!==c.expected)throw Error('b0168_exact_output_outside_whitelist_raw_preserved');
 }
 return true;
}
'''
(RUNTIME / 'b0168-exact-request.mjs').write_bytes(helper.encode('utf-8'))
p = RUNTIME / 'textbook-production-web.mjs'
s = p.read_text(encoding='utf-8')
first, rest = s.split('\n', 1)
assert first.startswith('#!')
s = first + "\nimport {exactRequest,validateExact} from './b0168-exact-request.mjs';\n" + rest
s = s.replace("const prompt=[", "let prompt=[", 1)
needle = " const currentBatchBinding=batch?"
assert s.count(needle) == 1
insert = " const exact=exactRequest({source,revision,parent:parentCandidate,ids,figureIds,images:visualInputs});prompt=exact.prompt;Object.keys(schema).forEach(k=>delete schema[k]);Object.assign(schema,exact.schema);\n const modelRequest={prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:visualInputs.map(a=>dataPath(a.path)),timeoutMs:modelTimeoutMs,stopFiles:option('--stop-file')?[dataPath(option('--stop-file'))]:[]};\n if(option('--request-only')){console.log(JSON.stringify({request:modelRequest,exact:exact.proof,modelCalls:0}));process.exit(0);}\n"
s = s.replace(needle, insert + needle, 1)
call = "call=await invokeTextbookCodex({prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:visualInputs.map(a=>dataPath(a.path)),timeoutMs:modelTimeoutMs,stopFiles:option('--stop-file')?[dataPath(option('--stop-file'))]:[]});"
assert call in s
s = s.replace(call, 'call=await invokeTextbookCodex(modelRequest);', 1)
needle = " const translated=call.output.translations;"
assert needle in s
s = s.replace(needle, ' validateExact(call.output);\n' + needle, 1)
p.write_bytes(s.encode('utf-8'))

# A deferred finding is an individual original issue, not just target+severity.
# Include its exact SHA in the key so two errors for one figure cannot collide.
p = RUNTIME / 'textbook-audit-web.mjs'
s = p.read_text(encoding='utf-8')
old = "[d.batchId+'|'+d.targetId+'|'+d.severity,d]"
new = "[d.batchId+'|'+d.targetId+'|'+d.severity+'|'+d.issueSha256,d]"
assert old in s
s = s.replace(old, new, 1)
old = "deferred.get(row.batchId+'|'+row.targetId+'|'+row.severity)"
new = "deferred.get(row.batchId+'|'+row.targetId+'|'+row.severity+'|'+row.issueSha256)"
assert old in s
s = s.replace(old, new, 1)
p.write_bytes(s.encode('utf-8'))
manifest = {'schema': 'coac269-exact-b0168-runtime/1', 'base': {'path': str(base_manifest), 'sha256': sha(base_manifest)},
            'authorizationComment': contract['authorizationComment'], 'modelRoutingUnchanged': True,
            'changes': ['exact single-text request/schema and fail-closed output guard', 'deferred finding identity includes original issue SHA; no findings removed or reclassified'],
            'files': [{'name': p.name, 'path': str(p), 'sha256': sha(p)} for p in sorted(RUNTIME.iterdir()) if p.is_file() and p.name != 'b0168-runtime-manifest.json']}
text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
(RUNTIME / 'b0168-runtime-manifest.json').write_text(text, encoding='utf-8')
(OUT / 'runtime-manifest.json').write_text(text, encoding='utf-8')
for name in ['textbook-production-web.mjs', 'textbook-audit-web.mjs', 'b0168-exact-request.mjs', 'b0168-contract.json']:
    if name == 'textbook-audit-web.mjs':
        continue
    (OUT / name).write_bytes((RUNTIME / name).read_bytes())
print(json.dumps({'runtime': str(RUNTIME), 'manifestSha256': sha(RUNTIME / 'b0168-runtime-manifest.json'), 'modelCalls': 0}))
