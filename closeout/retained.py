import json,subprocess
from pathlib import Path
exec((Path(__file__).parent/'inventory.py').read_text(encoding='utf-8').split('rows=[]')[0])
entries=[]
for path,reason in [
 ('E:/AgentData/Coach/knowledge/review','Formal active v43, complete assets and previous formal assets needed for rollback; serving8767/MCP/Arena.'),
 ('E:/AgentData/Coach/knowledge/human-annotations','Both user annotation batches, latest queue and complete event history; serving8765.'),
 ('E:/CoachLabel','Durable human annotation server code; running PID49724.'),
 ('E:/AgentData/Coach/textbook-source-inspection','Original textbooks; never a cleanup candidate.'),
 ('E:/AgentData/Coach/knowledge/processing/integration/accepted-content-preview-2026-10-28T16-50-25-203Z','Current v43 preview, serving8766; exact current evidence and assets.'),
 ('E:/AgentData/Coach/knowledge/processing/integration/coac250-formal-v43-20261029','Current release inputs/build code, former formal byte/presence baseline and all formal consumer proofs.'),
 ('E:/AgentData/Coach/knowledge/processing/integration/coac250-ascii-divider-layout-20261029','Current separator repair module required by exact release rebuild.'),
 ('E:/AgentWorkspaces/Coach/mortal-rag-ablation','Legacy code/dependency worktree used by formal MCP config/build modules; uncommitted changes and unique files retained.')]:
 p=Path(path);entries.append({'path':str(p),'reason':reason,**size(p)})
 print('measured',path,flush=True)
(Path(__file__).parent/'retained-inventory.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2),encoding='utf-8')
