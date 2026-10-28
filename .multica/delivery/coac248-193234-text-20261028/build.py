import json, pathlib, shutil, hashlib
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
D=pathlib.Path('.multica/delivery/coac248-193234-text-20261028');D.mkdir(parents=True,exist_ok=True)
P=R/'integration/coac248-193234-text-20261028';P.mkdir(exist_ok=True)
T=R/'audit/runtimes/coac248-193234-text-v1-20261028'
if not T.exists():
 shutil.copytree(R/'audit/runtimes/coac248-182201-inline-v1-20261028',T)
 (T/'runtime-manifest.json').unlink()
assert not (T/'runtime-manifest.json').exists(), 'Do not replace frozen runtime'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads((R/p).read_bytes())
write=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
auth='01a181e7-d3dc-76f2-adb8-00cbb4f4e332'
prior=load('integration/coac248-193213-20261028/release.json')['jobs'][0]
j={k:prior[k] for k in ['sourceId','articleId','chapterId','sourcePath','sourceSha256']}
j.update(key='193',targetId=prior['targetTextId'],parentPath='web-production/v1/candidates/modern-yabejp-ja/chapter03-section009.r1.display.json',parentSha256='af8071cfdbaabf8f469f84fa4daa6fd2d7d377c3dc2b277ef766e34a22324ba1',notesPath='integration/coac249-jp193-target-impact-reviewed-20261028.json',notesSha256='a70006b0e912a7089bf2ae7cebd3d9e366275ca3e25cc8a3ea1356335b410b6c',baseParentSha256=prior['parentSha256'],variant='r2',textPrefix=prior['textPrefix'],textSuffix=prior['textSuffix'],authorizationCommentId=auth)
c=load(j['parentPath']);n=load(j['notesPath']);j['parentObjectSha256']=sha(json.dumps(c,ensure_ascii=False,separators=(',',':')).encode());j['notesObjectSha256']=sha(json.dumps(n,ensure_ascii=False,separators=(',',':')).encode())
calls=[json.loads(x) for x in (R/'web-production/v1/calls.jsonl').read_text().splitlines() if x]
calls=[x for x in calls if 'articleId' in x]
j['priorCallIds']=[x['callId'] for x in calls if x['articleId']==j['articleId']]
j['priorCandidateNames']=sorted(p.name for p in (R/('web-production/v1/candidates/'+j['sourceId'])).glob(j['articleId']+'.*'))
j['history']=[{k:x.get(k) for k in ['callId','success','usage','transportStatus']} for x in calls if x['articleId']==j['articleId']]
b=next(x for x in c['body']['blocks'] if x['sourceBlockIds']==[j['targetId']]);j['textBefore']=b['text']
oldRaw='audit/calls/45129550-169e-4015-a297-8726ee5cd9c5.json';j['reviewRawPath']=oldRaw;j['reviewRawSha256']=sha((R/oldRaw).read_bytes())
oldPlan='integration/coac248-193213-20261028/193-review-plan.json';j['priorReviewPlanPath']=oldPlan;j['priorReviewPlanSha256']=sha((R/oldPlan).read_bytes())
other={**j,'key':'234','sourceId':'79-bilibili-cn','articleId':'cv1780400','chapterId':'79-cn-chapter-234-12','targetId':'79-bilibili-cn:cv1780400:b0003','parentPath':'web-production/v1/candidates/79-bilibili-cn/cv1780400.display.json','parentSha256':'e6424e8c99c01ac0d344af26374e0fc57ee656c5c72f19902010bb1c2618d110','notesPath':'audit/web/articles/79-bilibili-cn/cv1780400.e6424e8c99c01ac0d344af26374e0fc57ee656c5c72f19902010bb1c2618d110.json','notesSha256':'87d822baddef33cd01535f7b5b0fd000c8a23d2adc5382170f85af3945f7ac60','sourcePath':'web-sources/v1/79-bilibili-cn/articles/cv1780400/source.json','sourceSha256':'7c68b1e68b499637d7ebf6178beb31840f0925cf670a34f21dfd112454c49c57','variant':'r1'}
for k in ['textPrefix','textSuffix','textBefore','reviewRawPath','reviewRawSha256','priorReviewPlanPath','priorReviewPlanSha256']:other.pop(k,None)
c=load(other['parentPath']);n=load(other['notesPath']);other['baseParentSha256']=other['parentSha256'];other['parentObjectSha256']=sha(json.dumps(c,ensure_ascii=False,separators=(',',':')).encode());other['notesObjectSha256']=sha(json.dumps(n,ensure_ascii=False,separators=(',',':')).encode())
timeout=next(x for x in calls if x['callId']=='ba432ee3-0d28-42b9-ad34-cde09c97313e');other['planPath']=timeout['revision']['inlineJapanese']['path'];other['planSha256']=timeout['revision']['inlineJapanese']['sha256'];other['plan']=timeout['revision']['inlineJapanese']['plan']
other['priorCallIds']=[x['callId'] for x in calls if x['articleId']==other['articleId']];other['history']=[{k:x.get(k) for k in ['callId','success','usage','transportStatus','durationMs']} for x in calls if x['articleId']==other['articleId']];other['priorCandidateNames']=sorted(p.name for p in (R/('web-production/v1/candidates/'+other['sourceId'])).glob(other['articleId']+'.*'))
other['oldTimeout']={'callId':timeout['callId'],'rawPath':'web-production/v1/'+timeout['rawArtifactPath'],'rawSha256':timeout['rawArtifactSha256'],'localInvocations':1,'reconnectionNotices':2,'upstreamExecutions':'unknown','usage':None,'fee':'unknown','recoverableOutput':False,'newAttemptIsNewCall':True}
write(T/'text193-job.json',j)
f=T/'textbook-audit-web.mjs';s=f.read_text(encoding='utf-8');s="import {verify193TextContent,verify193TextInheritance} from './text193-recovery.mjs';\n"+s
s=s.replace('export function verifyWebRevisionContent(candidate,parent,notes){','export function verifyWebRevisionContent(candidate,parent,notes){\n if(candidate.provenance.revision?.textRecovery193)return verify193TextContent(candidate,parent,notes);',1)
s=s.replace('export async function verifyWebRevisionInheritance(root,candidate){','export async function verifyWebRevisionInheritance(root,candidate){\n if(candidate.provenance.revision?.textRecovery193)return verify193TextInheritance(root,candidate);',1)
f.write_text(s,encoding='utf-8',newline='\n')
write(P/'release-unfrozen.json',{'runtimePath':str(T).replace('\\','/'),'packagePath':str(P).replace('\\','/'),'authorizationCommentId':auth,'jobs':[j,other]})
print(json.dumps({'prepared':True,'jobs':[(x['key'],x['priorCallIds']) for x in [j,other]]}))
