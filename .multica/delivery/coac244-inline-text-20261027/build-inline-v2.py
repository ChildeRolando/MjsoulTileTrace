import hashlib,json,shutil
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');OUT=Path('.multica/delivery/coac244-inline-text-20261027')
old=ROOT/'audit/runtimes/coac244-inline-japanese-20261027';new=ROOT/'audit/runtimes/coac244-inline-japanese-v2-20261027'
assert not new.exists();shutil.copytree(old,new)
def patch(name,a,b):
    p=new/name;s=p.read_text(encoding='utf-8');assert s.count(a)==1,(name,a[:70],s.count(a));p.write_text(s.replace(a,b),encoding='utf-8',newline='\n')
p=new/'inline-japanese-revision.mjs'
p.write_text(p.read_text(encoding='utf-8')+r'''
export function normalizeKnownInline155(text,parent,plan,callId,rawSha256){
 if(plan.chapterId!=='79-cn-chapter-155-4'||callId!=='676d346d-772e-4662-8fa9-02b236073167'||rawSha256!=='58e786828e31e3acc28fdef753733861a14e1b5331241f515a552d760c557519'||plan.edits.length!==1||plan.edits[0].operation!=='replace')fail('normalization_not_exact_completed_155_call');
 const id=plan.edits[0].sourceBlockId,b=parent.body.blocks.find(b=>eq(b.sourceBlockIds,[id]));
 if(!b.sourceSegments.some(s=>s.text.includes(plan.edits[0].quotedText)&&s.marks.some(m=>m.startsWith('strong:')))||text.split('**').length!==3)fail('normalization_not_duplicate_source_strong');
 const normalized=text.replaceAll('**','');
 if(!inlineTextAllowed(plan,id,b.text,normalized)||normalized===text)fail('normalization_outside_original_quote_whitelist');
 return {text:normalized,proof:{method:'exact-completed-155-duplicate-strong-markup-removal/1',callId,rawArtifactSha256:rawSha256,rawTextSha256:sha(text),normalizedTextSha256:sha(normalized),sourceSegmentsSha256:sha(JSON.stringify(b.sourceSegments)),removedMarkers:['**','**'],modelCalls:0}};
}
''',encoding='utf-8',newline='\n')
patch('textbook-production-web.mjs',"import {assertInlinePlan,inlineTextAllowed}","import {assertInlinePlan,inlineTextAllowed,normalizeKnownInline155}")
patch('textbook-production-web.mjs',"import {verifyAuditForCandidate} from './textbook-audit.mjs';","import {verifyAuditForCandidate,auditTransportCompleted} from './textbook-audit.mjs';")
patch('textbook-production-web.mjs',"inlinePlan=null,inlineBinding=null;","inlinePlan=null,inlineBinding=null,inlineNormalization=null;")
patch('textbook-production-web.mjs',"const callId=randomUUID();let visualInputs=[];","const callId=option('--recover-completed-call')??randomUUID();let visualInputs=[];")
patch('textbook-production-web.mjs',"(japanese||inlinePlan)?'Return exactly one translation", "inlinePlan?'Return complete target source text with ONLY the planned quote replacements or Chinese gloss insertions. Do not add Markdown markers: original emphasis and links are inherited in sourceSegments. Preserve every other character exactly.':japanese?'Return exactly one translation")
patch('textbook-production-web.mjs',"let call=resumed?.result,record=resumed?.call;\n if(!resumed){", """let call=resumed?.result,record=resumed?.call;
 const recoveredId=option('--recover-completed-call');
 if(recoveredId){
  if(!inlinePlan||batch||resumed||ids.length!==1||figureIds.length)throw Error('inline_recovery_scope');
  const ledger=(await readFile(join(processing,'web-production/v1/calls.jsonl'),'utf8')).split(/\\r?\\n/).filter(Boolean).map(JSON.parse),found=ledger.filter(c=>c.callId===recoveredId);
  if(found.length!==1)throw Error('inline_recovery_call_not_unique');record=found[0];
  const rb=await readFile(dataPath('web-production/v1/'+record.rawArtifactPath)),raw=JSON.parse(rb);
  if(!record.success||record.sourceSha256!==sha(sourceBytes)||JSON.stringify(record.revision)!==JSON.stringify(revision)||JSON.stringify(record.targets)!==JSON.stringify({textIds:ids,figureIds})||sha(rb)!==record.rawArtifactSha256||sha(raw.rawLastMessage)!==record.outputSha256||JSON.stringify(JSON.parse(raw.rawLastMessage))!==JSON.stringify(raw.parsedOutput)||!auditTransportCompleted({...raw,output:raw.parsedOutput}))throw Error('inline_recovery_real_call_binding');
  call={...raw,output:raw.parsedOutput,success:true};
 }
 if(!resumed&&!recoveredId){""")
patch('textbook-production-web.mjs',"const text=byId.get(b.sourceBlockIds[0]);if(inlinePlan&&!inlineTextAllowed", "let text=byId.get(b.sourceBlockIds[0]);if(recoveredId){const n=normalizeKnownInline155(text,parentCandidate,inlinePlan,recoveredId,record.rawArtifactSha256);text=n.text;inlineNormalization=n.proof;}if(inlinePlan&&!inlineTextAllowed")
patch('textbook-production-web.mjs',"if(revision)candidate.provenance.revision=revision;","if(revision)candidate.provenance.revision=revision;if(inlineNormalization)candidate.provenance.outputNormalization=inlineNormalization;")
patch('textbook-audit-web.mjs',"import {loadInlinePlan,inlineTextAllowed}","import {loadInlinePlan,inlineTextAllowed,normalizeKnownInline155}")
patch('textbook-audit-web.mjs',"const translated=(candidate.body.mode==='translated'||revision?.inlineJapanese)?", "const normalized=p.outputNormalization?normalizeKnownInline155(raw.parsedOutput.translations[0].text,JSON.parse(await readFile(bound(root,p.revision.parentPath))),revision.inlineJapanese.plan,call.callId,sha(bytes)):null;if(normalized&&!same(normalized.proof,p.outputNormalization))throw Error('web_output_normalization_binding');\n const translated=(candidate.body.mode==='translated'||revision?.inlineJapanese)?")
patch('textbook-audit-web.mjs',"t.sourceBlockId===b.sourceBlockIds[0]&&t.text===b.text", "t.sourceBlockId===b.sourceBlockIds[0]&&(normalized?normalized.text:t.text)===b.text")
patch('textbook-audit-web.mjs',"const result={callId:call.callId,rawArtifactPath:call.rawArtifactPath,rawArtifactSha256:sha(bytes)};", "const result={callId:call.callId,rawArtifactPath:call.rawArtifactPath,rawArtifactSha256:sha(bytes),...(normalized?{outputNormalization:normalized.proof}:{})};")
v2=OUT/'runtime-v2';v2.mkdir()
for name in ['textbook-production-web.mjs','textbook-audit-web.mjs','inline-japanese-revision.mjs']:shutil.copyfile(new/name,v2/name)
manifest={'runtime':str(new),'files':[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(new.iterdir()) if p.is_file()]}
(v2/'runtime-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
stage=ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027';shutil.copyfile(v2/'runtime-manifest.json',stage/'runtime-manifest.json')
jobs=json.loads((stage/'jobs.json').read_text(encoding='utf-8'))
for j in jobs:
    if 'args' in j:j['args'][1]=str(new/'textbook-production-web.mjs')
(stage/'jobs.json').write_text(json.dumps(jobs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'runtime':str(new),'files':len(manifest['files'])}))
