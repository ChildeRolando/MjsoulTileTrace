import hashlib,json,shutil
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
OUT=Path('.multica/delivery/coac244-inline-text-20261027')
RUNTIME=ROOT/'audit/runtimes/coac244-inline-japanese-20261027'
OUT.mkdir(parents=True,exist_ok=True)
assert not RUNTIME.exists(), 'frozen stage already exists; no overwrite'
shutil.copytree(ROOT/'audit/runtimes/web-b8-transport-diag-20261027',RUNTIME)
base=ROOT/'web-production/v1/coac269-20261027/frozen-runtime'
for name in ['textbook-production-web.mjs','textbook-production-web-visual.py','textbook-production-web-present.py']:
    shutil.copyfile(base/name,RUNTIME/name)
shutil.copyfile('inline-japanese-revision.mjs',RUNTIME/'inline-japanese-revision.mjs')
def modify(name, edits):
    p=RUNTIME/name;s=p.read_text(encoding='utf-8')
    for old,new in edits:
        assert s.count(old)==1,(name,old[:110],s.count(old))
        s=s.replace(old,new)
    p.write_text(s,encoding='utf-8',newline='\n')
modify('textbook-production-web.mjs',[
 ("import {invokeTextbookCodex} from './textbook-production-cli.mjs';", "import {invokeTextbookCodex} from './textbook-production-cli.mjs';\nimport {assertInlinePlan,inlineTextAllowed} from './inline-japanese-revision.mjs';"),
 ("let revision=null,parentCandidate=null,supportingSourceContext=[],groupRevision=null,targetsBinding=null;", "let revision=null,parentCandidate=null,supportingSourceContext=[],groupRevision=null,targetsBinding=null,inlinePlan=null,inlineBinding=null;"),
 (" let figureIds,textBlockIds;", " let figureIds,textBlockIds;\n if(option('--revision-inline-japanese')){const p=dataPath(option('--revision-inline-japanese')),b=await readFile(p);inlinePlan=JSON.parse(b);assertInlinePlan(inlinePlan,parent,notes,source,{parentSha256:sha(bytes),notesSha256:sha(notesBytes),sourceSha256:sha(sourceBytes)});inlineBinding={path:relative(processing,p).replaceAll('\\\\','/'),sha256:sha(b),plan:inlinePlan};}"),
 ("figureIds=source.language==='zh-CN'?targetIds:[];", "figureIds=source.language==='zh-CN'&&!inlinePlan?targetIds:[];"),
 ("textBlockIds=source.language==='ja'?targetIds:[];", "textBlockIds=source.language==='ja'||inlinePlan?targetIds:[];"),
 ("if(source.language==='zh-CN'){\n  if(!figureIds.length", "if(source.language==='zh-CN'&&!inlinePlan){\n  if(!figureIds.length"),
 ("...(groupRevision?{groupRevision,targets:targetsBinding}:{})};parentCandidate=parent;", "...(groupRevision?{groupRevision,targets:targetsBinding}:{}),...(inlineBinding?{inlineJapanese:inlineBinding}:{})};parentCandidate=parent;"),
 ("if((japanese&&(!batch||batch.sourceBlockIds.some(id=>source.blocks.find(b=>b.id===id)?.type==='text')))||pendingFigures.length)", "if(((japanese||inlinePlan)&&(!batch||batch.sourceBlockIds.some(id=>source.blocks.find(b=>b.id===id)?.type==='text')))||pendingFigures.length)"),
 ("const textBlocks=japanese?flow.filter", "const textBlocks=(japanese||inlinePlan)?flow.filter"),
 ("const prompt=[japanese?", "const prompt=[inlinePlan?'Translate only the explicitly bounded Japanese quotes inside the Chinese source. Return one complete target block text for each requested ID. Preserve EVERY other character including whitespace, punctuation, Chinese text, numbers, links, emphasis provenance and existing parenthetical comments. For replace: replace only quotedText with Chinese. For gloss: keep quotedText and insert exactly （Chinese meaning） immediately after it. No other edits, no figure output. Bound edit plan: '+JSON.stringify(inlinePlan):japanese?"),
 ("japanese?'Return exactly one translation", "(japanese||inlinePlan)?'Return exactly one translation"),
 ("const byId=new Map(translated.map(t=>[t.sourceBlockId,t.text]));for(const b of textBlocks)b.text=byId.get(b.sourceBlockIds[0]);", "const byId=new Map(translated.map(t=>[t.sourceBlockId,t.text]));for(const b of textBlocks){const text=byId.get(b.sourceBlockIds[0]);if(inlinePlan&&!inlineTextAllowed(inlinePlan,b.sourceBlockIds[0],b.text,text))throw Error('web_inline_output_outside_whitelist_raw_preserved');b.text=text;}"),
])
modify('textbook-audit-web.mjs',[
 ("const model='gpt-6.1-sol'", "import {loadInlinePlan,inlineTextAllowed} from './inline-japanese-revision.mjs';\nconst model='gpt-6.1-sol'"),
 ("'textbook-audit-web-batches.mjs'],buffers", "'textbook-audit-web-batches.mjs','inline-japanese-revision.mjs'],buffers"),
 ("check(block.text===original.text,'web_chinese_rewritten:'+original.id)", "check(block.text===original.text||inlineTextAllowed(candidate.provenance.revision?.inlineJapanese?.plan,original.id,original.text,block.text),'web_chinese_rewritten:'+original.id)"),
 ("candidate.body.mode!==(textMode?'translated':'verbatim')", "candidate.body.mode!==(textMode&&!r.inlineJapanese?'translated':'verbatim')"),
 ("verifyWebRevisionContent(candidate,parent,notes);", "verifyWebRevisionContent(candidate,parent,notes);const inlineJapanese=r.inlineJapanese?await loadInlinePlan(root,r.inlineJapanese,candidate,parent,notes,source):null;"),
 ("const sourceContext=await verifyWebRevisionContext(root,candidate);return {revision:r", "const sourceContext=await verifyWebRevisionContext(root,candidate);return {...(inlineJapanese?{inlineJapanese}:{}),revision:r"),
 ("const translated=candidate.body.mode==='translated'?candidate.body.blocks.filter", "const translated=(candidate.body.mode==='translated'||revision?.inlineJapanese)?candidate.body.blocks.filter"),
 (" if(revision?.sourceContext){", " if(revision?.inlineJapanese){const payload=JSON.parse(raw.semanticPrompt.split('\\n\\n').at(-1));if(!eqInline(call.revision,p.revision)||!eqInline(payload.targets.textIds,p.revision.textBlockIds)||sha(raw.semanticPrompt)!==call.semanticPromptSha256||sha(raw.requestPrompt)!==call.promptSha256||raw.requestPromptSha256!==call.promptSha256||!raw.semanticPrompt.includes(JSON.stringify(revision.inlineJapanese.plan)))throw Error('web_inline_plan_not_in_bound_request');}\n if(revision?.sourceContext){"),
])
# Deep equality is shared with the original verifier; this alias adds no new rule.
p=RUNTIME/'textbook-audit-web.mjs';s=p.read_text(encoding='utf-8').replace('eqInline(', 'same(');p.write_text(s,encoding='utf-8',newline='\n')
for p in RUNTIME.iterdir():
    if p.name in ['textbook-production-web.mjs','textbook-audit-web.mjs','inline-japanese-revision.mjs']:
        shutil.copyfile(p,OUT/p.name)
manifest={'runtime':str(RUNTIME),'files':[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(RUNTIME.iterdir()) if p.is_file()]}
(OUT/'runtime-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'runtime':str(RUNTIME),'files':len(manifest['files'])}))
