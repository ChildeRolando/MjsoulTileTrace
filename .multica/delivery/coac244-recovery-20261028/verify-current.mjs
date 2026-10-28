// Read-only receipt validation, never invokes a model or writes an audit.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing';
const r=JSON.parse(await readFile(P+'/integration/coac249-283-1017-r2-reviewed-20261028.json'));
const rt=P+'/audit/runtimes/coac269-283-1017-v2-20261028';
const {verifyGroupRevisionAudit,verifyAuditForWebCandidate}=await import(pathToFileURL(rt+'/textbook-audit-web.mjs'));
const scoped=await verifyGroupRevisionAudit(P,r.candidate.path);
let ordinaryError;
try {await verifyAuditForWebCandidate(P,r.candidate.path);throw Error('unexpected whole chapter acceptance');}
catch(e){ordinaryError=e.message;if(!ordinaryError.includes('web_audit_not_passed_or_inputs_changed'))throw e;}
await writeFile(import.meta.dirname+'/current-gate-verification.json',JSON.stringify({candidate:r.candidate,scopedAuditSha256:scoped.auditSha256,aggregateStatus:scoped.receipt.status,ordinaryError,newModelCalls:0},null,2)+'\n');
console.log(JSON.stringify({scopedGate:'verified',aggregateStatus:scoped.receipt.status,ordinaryError,newModelCalls:0}));
