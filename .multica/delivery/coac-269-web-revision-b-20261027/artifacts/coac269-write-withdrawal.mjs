#!/usr/bin/env node
// COAC-269: writes the withdrawal record for the three duplicated productions.
// Keeps every artifact and receipt; adds a superseding record only.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const P = 'E:/AgentData/Coach/knowledge/processing';
const sha = b => createHash('sha256').update(b).digest('hex');
const rd = p => JSON.parse(fs.readFileSync(path.join(P, p), 'utf8'));
const rel = p => path.relative(P, p).replaceAll('\\', '/');

const previews = {};
for (const d of fs.readdirSync(path.join(P, 'integration')).filter(x => x.startsWith('accepted-content-preview-2026-10-27'))) {
  const receiptPath = path.join(P, 'integration', d, 'accepted-preview-receipt.json');
  const unitMapPath = path.join(P, 'integration', d, 'textbook-unit-map.json');
  if (!fs.existsSync(receiptPath) || !fs.existsSync(unitMapPath)) continue; // preview still being built
  const r = rd('integration/' + d + '/accepted-preview-receipt.json');
  const um = rd('integration/' + d + '/textbook-unit-map.json');
  previews[d] = {createdAt: r.createdAt, displayChapters: new Set(um.map(u => u.chapterId)).size};
}
const covOf = art => {
  const out = [];
  for (const [d, v] of Object.entries(previews)) {
    const um = rd('integration/' + d + '/textbook-unit-map.json');
    if (um.some(u => u.chapterId === 'modern-yabejp-ja-' + art + '-chapter')) out.push({preview: 'integration/' + d, createdAt: v.createdAt, displayChapters: v.displayChapters});
  }
  return out;
};

const byChapter = {};
for (const [batch, f] of [['b2', 'web-production/v1/coac269-20261027/handoff/handoff-b2-c73112180eb7acde.json'], ['b3', 'web-production/v1/coac269-20261027/handoff/handoff-b3-4ca082ce03ad8f22.json']]) {
  const j = rd(f);
  for (const c of j.chapters) byChapter[c.chapterId] = {batch, h: c};
}

const defs = [
  {cid: 'nemata-jp-chapter-246-1', art: 'chapter06-section002', passed: 'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.rev1.json', audit: 'audit/web/articles/modern-yabejp-ja/chapter06-section002.bbf15bbd1390a0b7ce729d5205a65dad72e0f24cb6c2fe1f9789aaaea26e1904.json'},
  {cid: 'nemata-jp-chapter-237-1', art: 'chapter04-section016', passed: 'web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.rev1.json', audit: 'audit/web/articles/modern-yabejp-ja/chapter04-section016.d14aac65a3d02d8a44bf633bb969f1c057660d875a9aeb792cc022826293bc97.json'},
  {cid: 'nemata-jp-chapter-131-1', art: 'chapter01-section049', passed: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.rev1.json', audit: 'audit/web/articles/modern-yabejp-ja/chapter01-section049.20e84a64d9ea6526ceea7395131bf96825133244b84d41c9ef0bd0f94799be33.json'},
];

const diffPaths = (a, b) => {
  const out = [];
  (function walk(x, y, p) {
    if (Array.isArray(x) && Array.isArray(y)) { for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], p + '[' + i + ']'); return; }
    if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); return; }
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(p);
  })(a, b, '');
  return out;
};

const withdrawn = [];
let tin = 0, tout = 0;
for (const d of defs) {
  const {batch, h} = byChapter[d.cid];
  const call = h.productionCall[0];
  const passed = rd(d.passed), mine = rd(h.candidate);
  const bodyEqual = sha(JSON.stringify(passed.body)) === sha(JSON.stringify(mine.body));
  const semantic = diffPaths(passed, mine).filter(p => !p.startsWith('.provenance') && p !== '.candidateSha256');
  tin += call.usage.inputTokens; tout += call.usage.outputTokens;
  withdrawn.push({
    chapterId: d.cid,
    articleId: d.art,
    batch,
    duplicateCandidate: {path: 'web-production/v1/candidates/modern-yabejp-ja/' + path.basename(h.candidate), sha256: h.candidateSha256},
    coveringPassedCandidate: {path: d.passed, sha256: sha(fs.readFileSync(path.join(P, d.passed))), auditPath: d.audit, auditStatus: 'passed', auditRecordedAt: rd(d.audit).recordedAt},
    coveredInActivePreviews: covOf(d.art),
    registerVerdict: 'covered-effective',
    productionCall: {callId: call.callId, success: call.success, usage: call.usage, durationMs: call.durationMs, rawArtifactPath: call.rawArtifactPath, rawArtifactSha256: call.rawArtifactSha256},
    surplusTokens: call.usage.inputTokens + call.usage.outputTokens,
    contentDelta: {
      bodyIdenticalToPassedCandidate: bodyEqual,
      semanticDiffPaths: semantic,
      note: bodyEqual ? 'no semantic change at all: only provenance fields differ' : 'cosmetic rewording of text already fixed in the passed candidate',
    },
    disposition: 'withdrawn-superseded-keep-artifacts',
    doNotAudit: true,
    doNotIngestTo250: true,
  });
}

const legit = byChapter['nemata-jp-chapter-183-1'];
const rec = {
  schema: 'coac269-withdrawal/1',
  ticket: 'COAC-269',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  reason: 'batch-2/batch-3 selected from the old needs-repair parent candidates without excluding chapters already covered by the active preview unit-map/selection, the unified register and the per-chapter latest passed receipts. The atomic claim was keyed on the parent SHA and the only existence test was the ticket variant file, so a different revision of the same original chapter (article.rev1.json) was invisible.',
  accounting: 'no artifact deleted, rewritten or overwritten; the four production calls and their raw artifacts stay exactly as recorded',
  withdrawn,
  surplus: {inputTokens: tin, outputTokens: tout, totalTokens: tin + tout, calls: withdrawn.length},
  notWithdrawn: [{
    chapterId: 'nemata-jp-chapter-183-1',
    articleId: 'chapter03-section003',
    batch: 'b3',
    reason: 'not covered: no passed candidate, parent audit needs-repair, register verdict produced-needs-repair, no audit receipt for the produced candidate SHA',
    candidate: legit.h.candidate,
    candidateSha256: legit.h.candidateSha256,
    productionCall: {callId: legit.h.productionCall[0].callId, usage: legit.h.productionCall[0].usage, durationMs: legit.h.productionCall[0].durationMs},
    handoffStillValid: true,
  }],
  auditSpendOnDuplicates: 0,
  evidence: {
    b2Handoff: 'web-production/v1/coac269-20261027/handoff/handoff-b2-c73112180eb7acde.json',
    b3Handoff: 'web-production/v1/coac269-20261027/handoff/handoff-b3-4ca082ce03ad8f22.json',
    jointExclusion: 'web-production/v1/coac269-20261027/preflight/joint-exclusion-6df4fae82fdfa6f3.json',
    regressionTest: 'web-production/v1/coac269-20261027/preflight/joint-exclusion-test-abad57d007eb1609.json',
  },
};
const out = path.join(P, 'web-production/v1/coac269-20261027/handoff/withdrawal-b2-b3-duplicates-20261027.json');
fs.writeFileSync(out, JSON.stringify(rec, null, 2) + '\n');
console.log(JSON.stringify({path: rel(out), sha256: sha(fs.readFileSync(out)), surplus: rec.surplus, withdrawn: withdrawn.map(w => ({id: w.chapterId, call: w.productionCall.callId, usage: w.productionCall.usage, bodyIdentical: w.contentDelta.bodyIdenticalToPassedCandidate, diffs: w.contentDelta.semanticDiffPaths, previews: w.coveredInActivePreviews.map(p => p.preview.split('/').pop() + '(' + p.displayChapters + ')')}))}, null, 2));
