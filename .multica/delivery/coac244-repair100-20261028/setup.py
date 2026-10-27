from pathlib import Path
import shutil
p=Path(__file__).parent
r=p/'runtime'
shutil.copytree(p.parent/'coac244-text-contract-fix-20261028/runtime',r,dirs_exist_ok=True)
# Reuse actual current CLI policy for pure-text requests. Old snapshots are unchanged.
shutil.copyfile(p.parent/'coac244-next3-zero-20261028/verification-runtime/textbook-production-cli.mjs',r/'textbook-production-cli.mjs')
w=r/'textbook-production-web.mjs'
t=w.read_text(encoding='utf-8')
t="import {verifyComposite100} from './parent100.mjs';\n"+t
t=t.replace('let figureIds,textBlockIds;','await verifyComposite100(processing,parent,notes);\n let figureIds,textBlockIds;')
t=t.replace('notes.modelReview.issues','(notes.effectiveModelReview??notes.modelReview).issues').replace('notes.modelReview.blockChecks','(notes.effectiveModelReview??notes.modelReview).blockChecks').replace('notes.modelReview.figureChecks','(notes.effectiveModelReview??notes.modelReview).figureChecks')
t=t.replace('callId,rawLastMessage:call.rawLastMessage','callId,requestExecution:call.requestExecution,rawLastMessage:call.rawLastMessage')
w.write_text(t,encoding='utf-8')
w=r/'textbook-audit-web.mjs';t=w.read_text(encoding='utf-8')
t="import {verifyComposite100,projection100,isRepair100} from './parent100.mjs';\n"+t
t=t.replace("if(batchParent){\n", "if(notes.method==='independent-exact100-composite-error-evidence'){\n  parentCall=await verifyComposite100(root,parent,notes);\n }else if(batchParent){\n",1)
t=t.replace("const paragraphs=new Set(source.blocks.filter", "if(isRepair100(candidate))return projection100(source,candidate,ids);\n const paragraphs=new Set(source.blocks.filter",1)
# Include the exact new helper and contract bytes in the auditor's immutable snapshot.
t=t.replace("const names=['textbook-audit-web.mjs'", "const names=['parent100.mjs','exact-text-contract.mjs','text100.mjs','textbook-audit-web.mjs'",1)
w.write_text(t,encoding='utf-8')
shutil.copyfile(p.parent/'coac244-next3-admit-20261028/text100.mjs',r/'text100.mjs')
