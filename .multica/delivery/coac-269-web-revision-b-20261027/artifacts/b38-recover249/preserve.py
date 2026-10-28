"""Preserve a completed independent call after daemon worktree cleanup failure. No invocation."""
import json,hashlib,shutil
from pathlib import Path
H=Path(__file__).resolve().parent;R=Path('E:/AgentData/Coach/knowledge/processing')
D=R/'integration/coac269-p257-review-recovery-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bind(p):return {'path':str(p),'sha256':sha(p),'bytes':Path(p).stat().st_size}
def save(p,x):
 b=(json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode()
 if Path(p).exists():assert Path(p).read_bytes()==b
 else:Path(p).write_bytes(b)
D.mkdir(exist_ok=True);(D/'original-script-recovery').mkdir(exist_ok=True)
messages=load(Path.cwd()/'failed249-messages.json')
shutil.copyfile(Path.cwd()/'failed249-messages.json',D/'failed-run-messages.json')
restored=load(Path.cwd()/'restored249-files.json');save(D/'restored-files.json',restored)
for f in restored['files']:
 assert sha(f['path'])==f['sha256'];shutil.copyfile(f['path'],D/'original-script-recovery'/Path(f['path']).name)
base=R/'audit/supplements/coac249-p257-human20-20261028'
attempt=load(base/'attempt.json');callId=attempt['callId'];raw=load(R/'audit/calls'/f'{callId}.json')
assert raw['success'] and raw['exitCode']==0 and not raw['timedOut']
assert raw['output']==json.loads(raw['rawLastMessage'])
ledger=[json.loads(s) for s in (R/'audit/calls.jsonl').read_text(encoding='utf8').splitlines() if callId in s]
assert len(ledger)==1
o=raw['output'];assert len(o['applications'])==20 and all(a['faithful'] for a in o['applications'])
facts={k:o[k] for k in ['firstNinePreserved','authorArgumentFaithful','completeOrderedScopeCompared','countConflictImpact','requiredDisplayLimitations','issues','summary']}
pins=[bind(p) for p in base.iterdir() if p.is_file()]+[bind(R/'audit/calls'/f'{callId}.json'),bind(D/'failed-run-messages.json')]
report={'schema':'coac269-recover-completed249-independent-call/1','originalTaskId':'01a182d6-e5fb-78d2-a797-6c869ff3839f',
 'platformFailure':'local_directory_error; partial finalized-worktree cleanup while run-owned node/codex was still active',
 'callId':callId,'candidateSha256':raw['binding']['productionSha256'],'raw':bind(R/'audit/calls'/f'{callId}.json'),
 'originalCliResult':bind(base/'cli-result.json'),'originalAttempt':bind(base/'attempt.json'),
 'transport':{k:raw.get(k) for k in ['success','exitCode','timedOut','durationMs','model','reasoningEffort','usage']},
 'ledgerRows':1,'modelOutput':facts,'twentyApplicationsFaithful':True,
 'originalPreflightLost':True,'originalAdmissionSnapshotsLost':True,
 'originalPreflightReconstructedOrForged':False,'originalScriptsRecoveredFromPlatformPatchRecords':restored['files'],
 'newModelCalls':0,'newProductionCalls':0,'retry':0,'originalBudget':{'maximum':1,'used':1,'remaining':0},
 'modelOutputNotPromotedToChapterPassed':True,'wholeChapterPassed':False,'admissionGranted':False,
 'guardCleanupByOriginalOwnerRequired':True,'originalGuardPid':12704,'originalChildPid':64880,
 'frozenBindings':pins}
save(D/'preservation.json',report)
meta={k:v for k,v in report.items() if k not in ['frozenBindings','originalScriptsRecoveredFromPlatformPatchRecords']}
save(H/'preservation.json',meta)
save(H/'packet.json',{'path':str(D),'preservation':bind(D/'preservation.json'),'raw':report['raw'],'newModelCalls':0})
print(json.dumps({'callId':callId,'newModelCalls':0,'preservation':bind(D/'preservation.json'),'limits':len(o['requiredDisplayLimitations'])}))
