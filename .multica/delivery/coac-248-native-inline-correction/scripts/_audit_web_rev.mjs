// Run the web audit runtime on one revision candidate (target-text review scope when
// the candidate declares provenance.revision.textBlockIds). Foreground, one call.
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RT = join(ROOT, 'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49');
const {auditWebCandidate, verifyAuditForWebCandidate} = await import(pathToFileURL(join(RT, 'textbook-audit-web.mjs')).href);
const candidatePath = process.argv[2];
const startedAt = new Date().toISOString();
let out;
try {
  out = await auditWebCandidate({processingRoot: ROOT, candidatePath});
} catch (error) {
  console.log(JSON.stringify({ok: false, startedAt, error: String(error?.stack ?? error).slice(0, 4000)}, null, 1));
  process.exit(1);
}
const receipt = {status: out.status, method: out.method, auditPath: out.auditPath, calls: out.calls?.map(c => ({callId: c.callId, scope: c.scope, success: c.success, usage: c.usage})), modelChecks: out.modelChecks, effectiveModelChecks: out.effectiveModelChecks};
let verify = null;
try { verify = await verifyAuditForWebCandidate(ROOT, candidatePath); verify = {status: verify.status ?? verify.status}; } catch (e) { verify = {error: String(e?.message ?? e)}; }
console.log(JSON.stringify({ok: true, startedAt, finishedAt: new Date().toISOString(), receipt, verify}, null, 1));
