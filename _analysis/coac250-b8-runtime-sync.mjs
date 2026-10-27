// Sync only the operator-accepted exact diagnostic from COAC-249's frozen snapshot.
// No audit/model dispatch. Keep the active parent bytes and record the exact diff.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach',dir='_analysis/coac250-b8';
const p=repo+'/scripts/scene-study/textbook-production-cli.mjs';
const frozen='E:/AgentData/Coach/knowledge/processing/audit/runtimes/web-b8-transport-diag-20261027/textbook-production-cli.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const before=await readFile(p),approved=await readFile(frozen);
assert.equal(sha(approved),'ff04388dc5bca14a290ec1e4e1868907063c5bc349d9c1a058f7bfec75e1486a');
const old="item.message==='Falling back from WebSockets to HTTPS transport. stream disconnected before completion: tls handshake eof'";
const next="['Falling back from WebSockets to HTTPS transport. stream disconnected before completion: tls handshake eof','Falling back from WebSockets to HTTPS transport. workspace routing discovery timed out'].includes(item.message)";
assert.equal(before.toString().split(old).length,2,'exact old literal occurs once');
await writeFile(dir+'/textbook-production-cli.before.mjs',before);
const after=before.toString().replace(old,next);await writeFile(p,after);
await writeFile(dir+'/textbook-production-cli.after.mjs',after);
const test=spawnSync('git',['show','438bdd8:.multica/delivery/coac-249-batch8-269-20261027/artifacts/transport-diag-test.mjs'],{encoding:'utf8'});
assert.equal(test.status,0);await writeFile(dir+'/transport-diag-test.mjs',test.stdout);
const record={path:p,beforeSha256:sha(before),afterSha256:sha(after),approvedFrozenSha256:sha(approved),change:{old,next},modelCalls:0};
await writeFile(dir+'/runtime-sync.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
