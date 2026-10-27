// Zero model calls: verify the prepared entry refuses dispatch before acquiring a slot.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing';
const path=fileURLToPath(new URL('./',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const ledger=root+'/web-production/v1/calls.jsonl';
const previous=readFileSync(ledger,'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.articleId==='cv1785770');
const result=spawnSync(process.execPath,[path+'run.mjs'],{encoding:'utf8',windowsHide:true});
assert.equal(result.status,1);
assert(result.stderr.includes('No dispatch until existing owner verifies'));
assert(!existsSync(root+'/web-production/v1/runs/coac248-web-256-18-r2-20261028'));
const current=readFileSync(ledger,'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.articleId==='cv1785770');
assert.deepEqual(current,previous);
const pre=JSON.parse(readFileSync(path+'preflight.json'));
for(const x of pre.protectedFiles)assert.equal(sha(readFileSync(x.path)),x.sha256,x.path);
assert.equal(pre.negativeChecks.length,9);
assert(pre.negativeChecks.every(x=>x.rejected));
const check={recordedAt:new Date().toISOString(),newModelCalls:0,dispatchRefusedBeforeRunOrClaim:true,
 parentAndSourceAndRuntimeAndRawUnchanged:true,protectedFiles:pre.protectedFiles.length,
 articleLedgerUnchanged:true,priorArticleCallIds:current.map(x=>x.callId),negativeChecks:pre.negativeChecks,
 stdout:result.stdout,stderr:result.stderr,exitCode:result.status};
writeFileSync(path+'verification.json',JSON.stringify(check,null,2)+'\n');
console.log(JSON.stringify({zeroModelCalls:true,dispatchBlockedBeforeClaim:true,protectedFiles:pre.protectedFiles.length,negativeChecks:9}));
