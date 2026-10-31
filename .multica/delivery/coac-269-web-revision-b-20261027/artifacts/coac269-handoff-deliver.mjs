#!/usr/bin/env node
// COAC-269 line B handoff delivery + consumption proof — review fix R2.
//
// Defect this addresses: batch-5/batch-6 handoff files were written into the ticket namespace and
// reported as "handed to COAC-249", but no delivery to the reviewer's consumption surface was
// recorded, so the claim rested on a file that nobody had read.
//
// This script does not re-audit or re-produce anything (zero model calls). It:
//   1. re-verifies every candidate SHA against the b5/b6 handoff receipts and the candidate files,
//   2. finds the audit receipt actually bound to each candidate SHA (the consumption record),
//   3. verifies COAC-249's own incremental handoff to COAC-250 references our handoff files,
//   4. runs the real audit driver in `--select-only` mode against a combined explicit-targets
//      config (the same entry COAC-249 uses) and records that it now terminal-skips all three,
//   5. writes one delivery record binding candidate → audit → 250 handoff → driver selection.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join, relative} from 'node:path';

const P = 'E:/AgentData/Coach/knowledge/processing';
const NS = join(P, 'web-production/v1/coac269-20261027');
const AUDIT_DIR = join(P, 'audit/web/articles/modern-yabejp-ja');
const DRIVER = join(P, 'audit/audit-explicit-targets.mjs');
const SLOTS_250 = join(P, 'integration/coac249-incremental-269-b5b6-20261027.json');
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(P, p).replaceAll('\\', '/');
const read = p => JSON.parse(readFileSync(p, 'utf8'));

const handoffs = [
  {batch: 'b5', handoff: 'web-production/v1/coac269-20261027/handoff/handoff-b5-efc4945f29d89376.json',
   explicitTargets: 'web-production/v1/coac269-20261027/handoff/explicit-targets-b5-c6f8abb95f3a0e90.json'},
  {batch: 'b6', handoff: 'web-production/v1/coac269-20261027/handoff/handoff-b6-5455076a53c6565c.json',
   explicitTargets: 'web-production/v1/coac269-20261027/handoff/explicit-targets-b6-36667349329f7dfb.json'},
];

const chapters = [];
const errors = [];
for (const h of handoffs) {
  const hb = readFileSync(join(P, h.handoff));
  const handoff = JSON.parse(hb);
  for (const c of handoff.chapters) {
    const candPath = join(P, c.candidate);
    const candSha = sha(await readFile(candPath));
    if (candSha !== c.candidateSha256) { errors.push(c.chapterId + ':candidate_sha_drift'); continue; }
    // consumption record: the audit receipt bound to exactly this candidate sha
    const audits = [];
    for (const f of readdirSync(AUDIT_DIR)) {
      if (!f.endsWith('.json') || !f.startsWith(c.articleId + '.')) continue;
      const p = join(AUDIT_DIR, f);
      let j; try { j = read(p); } catch { continue; }
      if (j.production?.sha256 === candSha) audits.push({file: f, record: j, sha256: sha(readFileSync(p))});
    }
    if (audits.length !== 1) { errors.push(c.chapterId + ':expected_exactly_one_bound_audit_got_' + audits.length); continue; }
    const a = audits[0];
    const result = {
      chapterId: c.chapterId, articleId: c.articleId, batch: h.batch,
      candidate: {path: c.candidate, sha256: candSha},
      parentSha256: c.parentSha256, parentAuditSha256: c.parentAuditSha256, sourceSha256: c.sourceSha256,
      handoff: {path: h.handoff, sha256: sha(hb), explicitTargets: h.explicitTargets},
      consumption: {
        interface: 'audit/web/articles/modern-yabejp-ja bound audit receipt (same entry COAC-249 uses)',
        auditPath: rel(join(AUDIT_DIR, a.file)), auditSha256: a.sha256,
        status: a.record.audit?.status ?? a.record.status, recordedAt: a.record.recordedAt,
        calls: (a.record.calls || a.record.audit?.calls || []).length,
      },
    };
    if (!String(result.consumption.status).startsWith('passed')) errors.push(c.chapterId + ':not_passed:' + result.consumption.status);
    chapters.push(result);
  }
}

// COAC-249's own handoff to COAC-250 must reference our handoff files and candidate SHAs.
let to250 = null;
if (existsSync(SLOTS_250)) {
  const bytes = await readFile(SLOTS_250);
  const j = JSON.parse(bytes);
  const originHandoffs = j.origin?.handoffs || [];
  const missing = handoffs.map(h => h.handoff).filter(p => !originHandoffs.includes(p));
  const candShas = chapters.map(c => c.candidate.sha256);
  const text = bytes.toString('utf8');
  const missingShas = candShas.filter(s => !text.includes(s));
  to250 = {path: rel(SLOTS_250), sha256: sha(bytes), to: j.to, batchId: j.batchId, batchSize: j.batchSize,
    recordedAt: j.recordedAt, referencesOurHandoffs: missing.length === 0, referencesOurCandidateShas: missingShas.length === 0,
    missingHandoffs: missing, missingCandidateShas: missingShas};
  if (missing.length || missingShas.length) errors.push('coac249_to_coac250_handoff_does_not_reference_this_delivery');
} else {
  errors.push('coac249_to_coac250_handoff_missing');
}

// Combined driver-compatible config + a real zero-call selection run through the shared entry.
const targets = chapters.map(c => {
  const et = read(join(P, handoffs.find(h => h.batch === c.batch).explicitTargets));
  const t = (et.targets || []).find(x => x.chapterId === c.chapterId);
  if (!t) throw new Error('explicit target missing for ' + c.chapterId);
  return t;
});
const config = {
  schema: 'coach-explicit-audit-targets/1',
  createdAt: new Date().toISOString(),
  source: 'COAC-269 review fix R2: combined b5+b6 delivery already consumed by COAC-249; used here for a zero-call select-only proof through the same audit driver entry. No audit dispatched.',
  totalTargets: targets.length,
  targets,
};
const configName = `explicit-targets-b5b6-combined-${sha(JSON.stringify(targets)).slice(0, 16)}.json`;
const configPath = join(NS, 'handoff', configName);
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });

let selectOnly = null, selectOnlyExit = 0;
try {
  const out = execFileSync(process.execPath, [DRIVER, '--config', configPath, '--max-targets', String(targets.length), '--select-only'],
    {encoding: 'utf8', timeout: 120000});
  selectOnly = JSON.parse(out);
} catch (e) {
  selectOnlyExit = typeof e.status === 'number' ? e.status : 1;
  try { selectOnly = JSON.parse(String(e.stdout || '')); } catch { selectOnly = {raw: String(e.stdout || ''), stderr: String(e.stderr || '')}; }
}
if (selectOnlyExit !== 0) errors.push('select_only_failed_exit_' + selectOnlyExit);
if ((selectOnly?.pendingBefore ?? -1) !== 0) errors.push('driver_still_sees_pending_targets:' + selectOnly?.pendingBefore);
const skips = Array.isArray(selectOnly?.terminalSkips) ? selectOnly.terminalSkips : [];
if (skips.length !== targets.length || !skips.every(t => String(t.status).startsWith('passed'))) {
  errors.push('driver_terminal_skips_' + skips.length + '_expected_' + targets.length);
}
if ((selectOnly?.modelCalls ?? -1) !== 0) errors.push('select_only_reported_model_calls');

const delivery = {
  schema: 'coac269-to-coac249-delivery/1',
  ticket: 'COAC-269', to: 'COAC-249', cc: 'COAC-250',
  recordedAt: new Date().toISOString(),
  modelCalls: 0, productionCalls: 0, auditCalls: 0,
  purpose: 'bind every delivered candidate to its independent audit and to the single-writer handoff; prove the shared consumption entry now terminal-skips them',
  chapters,
  coac249ToCoac250: to250,
  driverConsumption: {
    driver: rel(DRIVER), config: rel(configPath), configSha256: sha(await readFile(configPath)),
    mode: '--select-only', exitCode: selectOnlyExit,
    selected: (selectOnly?.selected ?? []).length, pendingBefore: selectOnly?.pendingBefore ?? null,
    terminalSkips: skips, terminalSkipCount: skips.length, modelCalls: selectOnly?.modelCalls ?? null,
  },
  excluded: {
    'nemata-jp-chapter-183-1': 'pending adjudication — do not audit the b3 candidate (notice-249-do-not-audit-183-1)',
    'nemata-jp-chapter-246-1': 'withdrawn duplicate',
    'nemata-jp-chapter-237-1': 'withdrawn duplicate',
    'nemata-jp-chapter-131-1': 'withdrawn duplicate',
  },
  errors,
  ok: errors.length === 0,
};
const receiptName = `coac249-delivery-${sha(JSON.stringify({chapters, errors, selectOnly: delivery.driverConsumption})).slice(0, 16)}.json`;
const receiptPath = join(NS, 'handoff', receiptName);
await writeFile(receiptPath, JSON.stringify(delivery, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({ok: delivery.ok, errors, receipt: rel(receiptPath), config: rel(configPath),
  selectOnly: delivery.driverConsumption,
  chapters: chapters.map(c => ({chapterId: c.chapterId, candidate: c.candidate.sha256,
    audit: c.consumption.auditSha256, status: c.consumption.status, auditRecordedAt: c.consumption.recordedAt})),
  coac249ToCoac250: to250 && {path: to250.path, batchId: to250.batchId, batchSize: to250.batchSize,
    referencesOurHandoffs: to250.referencesOurHandoffs, referencesOurCandidateShas: to250.referencesOurCandidateShas}}, null, 2));
process.exit(delivery.ok ? 0 : 1);
