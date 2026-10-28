import json,hashlib,shutil
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');H=Path(__file__).resolve().parent;P=R/'integration/coac248-193213-20261028';T=R/'audit/runtimes/coac248-193213-mixed-v1-20261028';B=R/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
assert not (P/'release.json').exists(),'Already frozen; do not rebuild after dispatch.'
P.mkdir(exist_ok=True);T.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_text(encoding='utf8'))
objsha=lambda x:sha(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode())
def save(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
pins=[('193','chapter03-section009','abaeede080b3d413e2ead7708a8278ba39dfb2cd21bfebeac5c61726873887c3','0eb1e386149771dad7604fd1e13bcf06a81afbe07e2846cdc5cbfc24a9ee9743','8ce0cde5d4eb0d8a8538b6751cd8a3b35b3fa8d3a20d7929fea6d7548bb09ce0','b0081','b0080'),('213','chapter03-section026','4be53c73b7042cf060892d650a0d7b17c644b6537e80b39c8c58fc8d00fab9f4','224ab80edc484ba26f112cb27a150486d2adaba30d1291fdf3c451baaae7631a','a62d14aee33507486cff8ba945d3174fad43fa2423245fe56acef5f16b45eedc','b0017','b0032')]
jobs=[];ledger=[json.loads(l) for l in (R/'web-production/v1/calls.jsonl').read_text(encoding='utf8').splitlines() if l]
for key,a,ph,sh,nh,tid,fid in pins:
 pp=f'web-production/v1/candidates/modern-yabejp-ja/{a}.display.json';np=f'audit/web/articles/modern-yabejp-ja/{a}.{ph}.json';c=read(R/pp);n=read(R/np);sp=c['source']['sourcePath'];s=read(R/sp)
 assert sha((R/pp).read_bytes())==ph and sha((R/np).read_bytes())==nh and sha((R/sp).read_bytes())==sh
 textid=f'modern-yabejp-ja:{a}:{tid}';figid=f'modern-yabejp-ja:{a}:{fid}:figure';block=next(b for b in c['body']['blocks'] if b['sourceBlockIds']==[textid]);f=next(f for f in c['figures'] if f['figureId']==figid)
 old='只要相关牌不是使其进张听牌的那一张' if key=='193' else '也不是因为进张而打出的';assert block['text'].count(old)==1
 sample='若立直宣言牌并非从此次进张完成的面子一侧切出' if key=='193' else '其周边也不属于进张完成面子的一侧'
 if key=='193':
  before='下方手牌，从左至右：5m 6m 7m 8m 6s 7s 8s 3p 4p 5p 8p 8p 8p';after=before.replace('5p 8p 8p 8p','5p 6p 6p 6p');assert f['transcription'].count(before)==1
  replacements=[{'before':before,'after':after}];unknowns=f['unknowns']
 else:
  replacements=[{'before':'1p [点数不清的筒子牌] 4s','after':'1p 7p 4s'},{'before':'左列第1张1p、第2张筒子牌、第4张9s','after':'左列第1张1p、第2张7p、第4张9s'}]
  for v in replacements:assert f['transcription'].count(v['before'])==1
  assert f['unknowns'][1]=='左家牌河外侧左列自上而下第2张筒子牌的具体点数无法可靠辨认。'
  unknowns=f['unknowns'][:1]+f['unknowns'][2:]
 expected=f['transcription']
 for v in replacements:expected=expected.replace(v['before'],v['after'])
 call=c['provenance']['attempts'][0];raw=read(R/'web-production/v1'/call['rawArtifactPath']);prior=[x for x in ledger if x.get('articleId')==a]
 jobs.append({'key':key,'chapterId':f'nemata-jp-chapter-{key}-1','articleId':a,'sourceId':'modern-yabejp-ja','authorizationCommentId':'01a181be-9dce-7647-abb5-1d0f3c67509d','parentPath':pp,'parentSha256':ph,'sourcePath':sp,'sourceSha256':sh,'notesPath':np,'notesSha256':nh,'parentObjectSha256':objsha(c),'notesObjectSha256':objsha(n),'targetTextId':textid,'targetFigureId':figid,'textBefore':block['text'],'textSpanBefore':old,'sampleReplacement':sample,'textPrefix':block['text'].split(old)[0],'textSuffix':block['text'].split(old)[1],'figureReplacements':replacements,'expectedTranscription':expected,'expectedUnknowns':unknowns,'allOriginalUnknowns':f['unknowns'],'fixedFigure':{k:f[k] for k in ['kind','caption','sourceNotes']},'visualInputs':raw['visualInputs'],'priorCallIds':[x['callId'] for x in prior],'history':[{'callId':x['callId'],'success':x['success'],'usage':x.get('usage')} for x in prior],'reviewRawPath':'audit/calls/'+n['calls'][0]['callId']+'.json','reviewRawSha256':sha((R/('audit/calls/'+n['calls'][0]['callId']+'.json')).read_bytes()),'bodyCount':len(c['body']['blocks']),'figureCount':len(c['figures'])})
for f in B.iterdir():
 if f.is_file() and f.name!='runtime-manifest.json':shutil.copyfile(f,T/f.name)
save(T/'mixed-contract.json',jobs);shutil.copyfile(H/'mixed.mjs',T/'mixed.mjs')
f=T/'textbook-audit-web.mjs';text=f.read_text(encoding='utf8');text="import {verifyMixedContent} from './mixed.mjs';\n"+text
needle='export function verifyWebRevisionContent(candidate,parent,notes){';assert text.count(needle)==1
text=text.replace(needle,needle+"\n if(candidate.provenance.revision?.exact193213)return verifyMixedContent(candidate,parent,notes);")
needle="if(!validateWebReview(coverageProbe,source,parent).passed)throw Error('web_revision_parent_other_scope_or_coverage_missing');";assert text.count(needle)==1
text=text.replace(needle,"if(!validateWebReview(coverageProbe,source,parent).passed&&!r.exact193213)throw Error('web_revision_parent_other_scope_or_coverage_missing');")
needle='inheritedAssetIds,...(sourceContext?{sourceContext}:{})};';assert text.count(needle)==2
text="inheritedAssetIds,...(r.exact193213?{productionOnlyAuthorization:true,wholeChapterPassed:false,unresolvedParentIssuesPreserved:notes.modelReview.issues.filter(i=>i.severity==='uncertain')}:{}),...(sourceContext?{sourceContext}:{})};".join(text.rsplit(needle,1))
f.write_text(text,encoding='utf8',newline='\n')
manifest={'schema':'coac248-exact-mixed-193213-runtime/1','authorizationCommentId':jobs[0]['authorizationCommentId'],'baseRuntime':str(B),'baseManifestSha256':sha((B/'runtime-manifest.json').read_bytes()),'files':[{'name':f.name,'sha256':sha(f.read_bytes())} for f in sorted(T.iterdir()) if f.name!='runtime-manifest.json'],'scope':'Only these two exact mixed productions; original unresolved unknown severity retained; no chapter admission.'}
save(T/'runtime-manifest.json',manifest);release={'runtimePath':str(T).replace('\\','/'),'runtimeManifestSha256':sha((T/'runtime-manifest.json').read_bytes()),'jobs':jobs};save(P/'release.json',release);save(H/'release.json',release)
for name in ['run.mjs','review.mjs']:shutil.copyfile(H/name,P/name)
print(json.dumps({'runtimeFiles':len(manifest['files']),'manifest':release['runtimeManifestSha256'],'newCalls':0}))
