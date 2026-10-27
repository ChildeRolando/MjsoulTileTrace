// Continue the COAC-248 283-1 (chapter06-exercise003 rev1) complete-unit batch audit.
// Resumable: existing checkpoints under audit/web/batches/<candidate>/<plan>/ are
// verified and reused, so a restart makes no repeated model call. Foreground wrapper.
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const ROOT = 'E:/AgentData/Coach/knowledge/processing';
// Frozen runtime whose four-file content is the auditor snapshot bound by the
// existing batch-001/batch-002 checkpoints (combined 453ba938...).
const RT = join(ROOT, 'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49');
const {auditWebCandidate, verifyAuditForWebCandidate} = await import(pathToFileURL(join(RT, 'textbook-audit-web.mjs')).href);
const candidatePath = join(ROOT, 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json');
const startedAt = new Date().toISOString();
let out;
try {
  out = await auditWebCandidate({processingRoot: ROOT, candidatePath});
} catch (error) {
  console.log(JSON.stringify({ok: false, startedAt, error: String(error?.stack ?? error).slice(0, 4000)}, null, 1));
  process.exit(1);
}
const receipt = {
  status: out.status, method: out.method, auditPath: out.auditPath,
  calls: out.calls?.map(c => ({callId: c.callId, scope: c.scope, success: c.success, usage: c.usage})),
  batchReviews: out.batchReviews?.map(r => ({batchId: r.group.batchId, status: r.status, passed: r.modelChecks?.passed, errors: r.modelChecks?.errors})),
  modelChecks: out.modelChecks,
};
let verify = null;
try { const v = await verifyAuditForWebCandidate(ROOT, candidatePath); verify = {status: v.status}; } catch (e) { verify = {error: String(e?.message ?? e)}; }
console.log(JSON.stringify({ok: true, startedAt, finishedAt: new Date().toISOString(), receipt, verify}, null, 1));
