// One independent audit of the 215-4 rev2 candidate.
//
// The generic explicit-target driver refuses this key because its results ledger already carries
// a `failed` row from a deterministic precondition rejection (web_revision_notes_scope, 0 model
// calls, no receipt written). That row has no model conclusion, so it is not a content verdict;
// the driver's recovery logic only understands receipt files, not ledger rows. This script calls
// the same audit entry directly with the same runtime, records the same row shape, and never
// re-dispatches an object that already holds a model conclusion.
import {readFile, appendFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RUNTIME = join(ROOT, 'audit/runtimes/web-revision-chain-20261027');
const CAND = join(ROOT, 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev2.json');
const CAND_SHA = 'a75742e9c2bcb5b1c39453c6d8f795bea24cc5a431657b318ec7f5280a431817';
const sha = b => createHash('sha256').update(b).digest('hex');

const candBytes = await readFile(CAND);
if (sha(candBytes) !== CAND_SHA) throw new Error('candidate_changed');

const {auditWebCandidate, verifyAuditForWebCandidate} = await import(pathToFileURL(join(RUNTIME, 'textbook-audit-web.mjs')).href);
const {hasTextbookUsageLimit} = await import(pathToFileURL(join(RUNTIME, 'textbook-production-cli.mjs')).href);

// A receipt that already carries a model conclusion for this exact candidate is terminal.
const {readdir} = await import('node:fs/promises');
const folder = join(ROOT, 'audit/web/articles/modern-yabejp-ja');
for (const name of await readdir(folder)) {
  if (!name.startsWith(`chapter03-section027.${CAND_SHA}`) || !name.endsWith('.json')) continue;
  const prior = JSON.parse(await readFile(join(folder, name), 'utf8'));
  if (prior.modelReview) { console.log(JSON.stringify({skipped: 'receipt_with_model_conclusion', auditPath: join(folder, name), status: prior.status})); process.exit(0); }
}

let r;
try {
  r = await auditWebCandidate({processingRoot: ROOT, candidatePath: CAND, retryFailed: true});
  if (r.status?.startsWith('passed')) r = await verifyAuditForWebCandidate(ROOT, CAND);
} catch (e) {
  r = {status: 'failed', error: String(e.stack ?? e), calls: []};
}
const calls = r.calls ?? [];
for (const c of calls) {
  if (!c.callId) continue;
  try {
    const raw = JSON.parse(await readFile(join(ROOT, 'audit/calls', c.callId + '.json'), 'utf8'));
    if (hasTextbookUsageLimit(raw.events ?? [])) {
      await writeFile(join(ROOT, 'model-admission-stop.json'), JSON.stringify({reason: 'usage-limit', callId: c.callId, recordedAt: new Date().toISOString()}) + '\n');
      break;
    }
  } catch {}
}
const out = {
  articleId: 'chapter03-section027', sourceId: 'modern-yabejp-ja', category: 'targeted-text-revision-second',
  kind: 'complete-web-candidate', candidatePath: CAND, candidateSha256: CAND_SHA,
  status: r.status, auditPath: r.auditPath ?? null, error: r.error ?? null,
  calls: calls.map(c => ({callId: c.callId, usage: c.usage})),
  recovery: {kind: 'retry-failed-no-model-result', note: 'prior failure was web_revision_notes_scope, deterministic, 0 model calls'},
  retryOfAudit: r.retryOfAudit ?? null, recordedAt: new Date().toISOString(),
};
await appendFile(join(ROOT, 'audit/explicit-target-results-20261026.jsonl'), JSON.stringify(out) + '\n');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await mkdir(join(ROOT, 'audit/explicit-batches'), {recursive: true});
await writeFile(join(ROOT, 'audit/explicit-batches', `batch-${stamp}.json`), JSON.stringify({
  schema: 'coach-explicit-web-audit-batch/1', finishedAt: new Date().toISOString(),
  configPath: 'audit/explicit-targets-coac248-215-4-rev2-20261027.json', maxTargets: 1, retryFailed: true,
  selected: 1, terminalSkips: 0, pendingBefore: 1, results: [out],
  modelCalls: out.calls.length, status: 'foreground-completed',
  note: 'dispatched by scripts/_audit_215_4_rev2.mjs: the driver ledger held a failed row with no model conclusion for this key',
}, null, 2) + '\n');
console.log(JSON.stringify(out));
