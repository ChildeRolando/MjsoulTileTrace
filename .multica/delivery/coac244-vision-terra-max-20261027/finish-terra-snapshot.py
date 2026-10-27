from pathlib import Path
import json,hashlib,re
r=Path('E:/AgentData/Coach/knowledge/processing/audit/runtimes/coac244-vision-terra-max-v1-20261027')
for p in r.glob('*.mjs'):
 s=p.read_text(encoding='utf-8')
 if '\n#!/usr/bin/env node\n' in s:
  s=s.replace('\n#!/usr/bin/env node\n','\n')
  s='#!/usr/bin/env node\n'+s
 p.write_text(s,encoding='utf-8')
for name in ['textbook-audit-web.mjs','textbook-audit-tile-dictionary.mjs']:
 p=r/name;s=p.read_text(encoding='utf-8')
 s=s.replace('model,reasoningEffort,success,usage,', 'model:result.requestExecution?.model??model,reasoningEffort:result.requestExecution?.reasoningEffort??reasoningEffort,requestExecution:result.requestExecution,success,usage,')
 s=s.replace('attempt.model!==model||attempt.reasoningEffort!==reasoningEffort','!isRecordedTextbookModel(attempt)')
 p.write_text(s,encoding='utf-8')
p=r/'textbook-production-cli.mjs';s=p.read_text(encoding='utf-8')
s=s.replace("  if(images.length)return", "  if(!((model==='gpt-6.1-sol'&&reasoningEffort==='high')||(model==='gpt-6.1-terra'&&reasoningEffort==='max')))throw Error('textbook_model_effort_not_authorized');\n  if(images.length)return")
s=s.replace("if(c.model==='gpt-6.1-sol'&&c.reasoningEffort==='high')return true;", "if(c.model==='gpt-6.1-sol'&&c.reasoningEffort==='high')return !c.requestExecution||(c.requestExecution.model===c.model&&c.requestExecution.reasoningEffort===c.reasoningEffort&&c.requestExecution.images?.length===0);")
s=s.replace("r.args.filter(x=>x==='-i').length===r.images.length", "r.args.filter(x=>x==='-i').length===r.images.length&&r.args.filter(x=>x==='--model').length===1&&r.images.every((image,i)=>r.args[r.args.map((x,j)=>x==='-i'?j:-1).filter(j=>j>=0)[i]+1]===image.path)")
p.write_text(s,encoding='utf-8')
