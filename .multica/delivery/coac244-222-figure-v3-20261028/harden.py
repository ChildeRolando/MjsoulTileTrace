from pathlib import Path
p=Path(__file__).resolve().parent/'runtime/textbook-audit-web.mjs'
s=p.read_text(encoding='utf-8')
def change(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a));s=s.replace(a,b)
change("import {invokeTextbookCodex,hasUnexpectedTextbookTool} from './textbook-production-cli.mjs';", "import {invokeTextbookCodex,hasUnexpectedTextbookTool,textbookClosedPrompt} from './textbook-production-cli.mjs';")
change("  const modelRequest=figurePlan?", """  if(figurePlan){let ledger='';try{ledger=await readFile(join(processingRoot,'audit/calls.jsonl'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if(ledger.split(/\\r?\\n/).filter(Boolean).map(l=>JSON.parse(l)).some(c=>c.binding?.productionSha256===sha(bytes)))throw Error('web_target_figure_already_recorded_review');}
  const modelRequest=figurePlan?""")
change("c.scope!=='textbook-web-target-figure-audit'||!verifyTargetFigureExecution", "c.scope!=='textbook-web-target-figure-audit'||c.binding.semanticProjectionVersion!==3||!same(c.binding.originalImageAssetIds,[candidate.figures.find(f=>f.figureId===plan.proof.targetFigureIds[0]).sourceAssetBindings[0].assetId])||!same(c.binding.supplementalInputs,plan.proof.views.filter(v=>v.role==='nearest-neighbor-enlargement'))||!verifyTargetFigureExecution")
change("if(!same(rb.requestExecution,c.requestExecution)||!same(rb.schema,plan.schema)||rb.prompt!==plan.prompt||lines.length!==1", "if(!same(rb.requestExecution,c.requestExecution)||!same(rb.schema,plan.schema)||rb.prompt!==plan.prompt||rb.requestPrompt!==textbookClosedPrompt(plan.prompt)||lines.length!==1")
p.write_bytes(s.replace('\n','\r\n').encode('utf-8'))
