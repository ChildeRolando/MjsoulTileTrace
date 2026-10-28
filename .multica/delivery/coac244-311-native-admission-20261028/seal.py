"""Seal local stage metadata; source book bytes stay only in the shared directory."""
from pathlib import Path
import hashlib,json,shutil,os,copy,zipfile
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-311-native-admission-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(n,x):
 b=(json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode();(D/n).write_bytes(b);(O/n).write_bytes(b)
for n in ['README.md','seal.py','check.mjs','.gitattributes']:
 shutil.copyfile(O/n,D/n)
files=[{'path':str(f.relative_to(D/'stage')).replace('\\','/'),'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in sorted((D/'stage').rglob('*')) if f.is_file()]
save('stage-files.sha256.json',{'schema':'coac244-exact311-stage-seal/1','canonical':'79-cn-chapter-311-18','proposalSha256':'ca5792a85433de54d0bfa82649a3707707ef64747d3beb5f8944a5bec372ad97','files':files})
h=load(D/'handoff.json');h['stageSeal']={'path':str(D/'stage-files.sha256.json'),'sha256':sha((D/'stage-files.sha256.json').read_bytes())}
h['reproduction']='node check.mjs (reuses already-created stage; never invokes a model)'
h['implementationGapResolved']='exact311 native conditional admission, actual18-note stage and stage verifier now provided; 250 owns persistent route and real global readback'
save('handoff.json',h)
reg=P/'integration/coac244-remaining26-closure-register-20261028.json';before=reg.read_bytes();a=load(reg);b=copy.deepcopy(a);row=next(x for x in b['rows'] if x['chapterId']=='79-cn-chapter-311-18')
row['nativeStageInterface']={'path':str(D/'handoff.json'),'sha256':sha((D/'handoff.json').read_bytes()),'isolatedDisplayVerified':True,'mandatoryConditions':10,'existingNotes':8,'actualGlobalMcpArenaReadbackCompleted':False,'covered':False,'newModelCalls':0}
row['nextAction']='311 exact native conditional interface/stage now implemented in integration/coac244-311-native-admission-20261028. Existing250 sole writer must use verifyLimited/stageLimited/verifyStage + sealed stage, register persistent exact-proposal route, actual MCP/Arena read225 source positions/204texts/21images/18notes, verify rebuild, then judge chapter coverage. No new model/maker; old strict false and original/raw/source preserved.'
for x,y in zip(a['rows'],b['rows']):
 if x['chapterId']!='79-cn-chapter-311-18':assert x==y
assert reg.read_bytes()==before
tmp=D/'register.tmp';tmp.write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');os.replace(tmp,reg)
save('register-update.json',{'beforeSha256':sha(before),'afterSha256':sha(reg.read_bytes()),'onlyChangedCanonical':'79-cn-chapter-311-18','global250CoverageWritten':False})
pub=[f for f in O.iterdir() if f.is_file() and f.name!='files.sha256.json']
save('files.sha256.json',{'files':[{'path':f.name,'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in sorted(pub)]})
z=O.parents[2]/'coac244-311-native-admission-20261028.zip'
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as a:
 for f in sorted(O.iterdir()):
  if f.is_file():a.write(f,f.name)
shutil.copyfile(z,D/z.name)
print(json.dumps({'stageFiles':len(files),'stageSeal':h['stageSeal'],'handoffSha256':sha((D/'handoff.json').read_bytes()),'zip':str(z),'zipSha256':sha(z.read_bytes()),'newModels':0}))
