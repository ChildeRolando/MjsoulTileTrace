from pathlib import Path
p=Path('_analysis/coac250-pdf217220/intake.mjs')
s=p.read_text(encoding='utf8')
old="assert.equal(raw.success,true);assert.equal(raw.requestExecution.model,'gpt-6.1-terra');assert.equal(raw.requestExecution.reasoningEffort,'max');assert.deepEqual(raw.requestExecution,p.production.call.requestExecution);assert.deepEqual(raw.usage,p.production.call.usage);for(const image of raw.requestExecution.images)await bound(image);"
new="const ledger=(await readFile(dirname(dirname(p.production.raw.path))+'/calls.jsonl','utf8')).split(/\\r?\\n/).filter(Boolean).map(JSON.parse).filter(c=>c.callId===raw.callId);assert.equal(ledger.length,1);const productionCall=ledger[0];assert.equal(productionCall.success,true);assert.equal(productionCall.rawArtifactSha256,p.production.raw.sha256);assert.equal(raw.events.at(-1).type,'turn.completed');assert.equal(productionCall.requestExecution.model,'gpt-6.1-terra');assert.equal(productionCall.requestExecution.reasoningEffort,'max');assert.deepEqual(productionCall.requestExecution,p.production.call.requestExecution);assert.deepEqual(raw.usage,p.production.call.usage);for(const image of productionCall.requestExecution.images)await bound(image);"
assert old in s
p.write_text(s.replace(old,new),encoding='utf8',newline='\n')
