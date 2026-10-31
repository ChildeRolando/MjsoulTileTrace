#!/usr/bin/env node
// COAC-269 regression test for the batch-2/batch-3 duplication defect.
// Phase 1 (defect): the old receipts (preflight-b2 / preflight-b3) accepted chapters that were
//   already covered. The assertions below MUST fail against those artifacts; that is the
//   mechanical proof the defect existed.
// Phase 2 (fix): the joint-exclusion gate + batch-4 preflight MUST reject the three covered
//   chapters and accept the two genuinely repairable ones. These assertions MUST pass.
// Exit code 0 only when phase 1 fails as expected and phase 2 passes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const P = 'E:/AgentData/Coach/knowledge/processing';
const NS = path.join(P, 'web-production/v1/coac269-20261027');
const sha = b => createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = p => fs.existsSync(p);

const results = [];
const check = (phase, name, fn) => {
  try { const detail = fn(); results.push({phase, name, passed: true, detail}); }
  catch (e) { results.push({phase, name, passed: false, detail: e.message}); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const COVERED = ['nemata-jp-chapter-246-1', 'nemata-jp-chapter-237-1', 'nemata-jp-chapter-131-1'];
const NEW_ELIGIBLE = ['nemata-jp-chapter-142-1', 'nemata-jp-chapter-127-1'];

// ---------- phase 1: the defect must reproduce on the old artifacts ----------
const oldB2 = read(path.join(NS, 'preflight/preflight-b2-7818f51dc4b3718c.json'));
const oldB3 = read(path.join(NS, 'preflight/preflight-b3-f58c2db60d9293da.json'));
const oldAccepted = new Set([...oldB2.chapters, ...oldB3.chapters].map(c => c.chapterId));
for (const cid of COVERED) {
  check('defect-old-protocol', `${cid} accepted by old preflight (expected: yes)`, () => {
    assert(oldAccepted.has(cid), 'old preflight already refused it; defect not reproduced');
    return 'old preflight accepted a chapter that the active preview/register already covers';
  });
}
check('defect-old-protocol', 'old no_existing_variant only tested the ticket variant file', () => {
  const b2src = fs.readFileSync(path.join(NS, 'coac269-preflight-b2.mjs'), 'utf8');
  assert(/variant_output_exists/.test(b2src) && !/active-preview|unified-chapter-register|selectedWeb/.test(b2src),
    'b2 preflight already contains a preview/register check');
  return 'preflight-b2 checks only <article>.coac269rev1.json existence';
});

// ---------- phase 2: the joint-exclusion gate must refuse them ----------
const jointPath = path.join(NS, 'preflight/joint-exclusion-6df4fae82fdfa6f3.json');
const joint = read(jointPath);
for (const cid of COVERED) {
  check('fix-joint-exclusion', `${cid} covered by the canonical union`, () => {
    const c = joint.incidentControls[cid];
    assert(c && c.covered === true, 'joint exclusion did not mark it covered');
    for (const reason of ['active-preview-selectedWeb', 'unified-register-covered-effective', 'latest-passed-audit-current-source']) {
      assert(c.reasons.includes(reason), 'missing coverage reason ' + reason);
    }
    return c.reasons.join(' + ');
  });
}
check('fix-joint-exclusion', 'no covered chapter is offered as an eligible repair target', () => {
  const ids = new Set(joint.eligibleRepairTargets.map(e => e.chapterId));
  for (const cid of COVERED) assert(!ids.has(cid), cid + ' is still eligible');
  return `eligible targets: ${joint.eligibleRepairTargets.length}`;
});
check('fix-joint-exclusion', 'incident controls pass inside the receipt', () => {
  assert(joint.incidentControlsOk === true, 'incidentControlsOk is not true');
  assert(joint.modelCalls === 0 && joint.productionCalls === 0, 'precheck was not zero-call');
  return 'zero-call';
});

// ---------- phase 2: batch-4 preflight binds the next batch ----------
const b4 = read(path.join(NS, 'preflight/preflight-b4-' + fs.readdirSync(path.join(NS, 'preflight')).filter(f => f.startsWith('preflight-b4-')).sort().at(-1).replace('preflight-b4-', '')));
check('fix-next-batch', 'batch-4 preflight ok with zero model calls', () => {
  assert(b4.ok === true, 'errors: ' + b4.errors.join(','));
  assert(b4.modelCalls === 0 && b4.productionCalls === 0, 'preflight made a model call');
  return b4.chapters.map(c => c.chapterId).join(', ');
});
check('fix-next-batch', 'batch-4 chapters are exactly the two eligible targets', () => {
  const ids = b4.chapters.map(c => c.chapterId);
  assert(ids.length === NEW_ELIGIBLE.length, 'unexpected chapter count');
  for (const cid of NEW_ELIGIBLE) assert(ids.includes(cid), cid + ' missing');
  return ids.join(', ');
});
check('fix-next-batch', 'each batch-4 claim is keyed by chapterId + current candidateSHA', () => {
  for (const c of b4.chapters) {
    assert(c.claim.key === c.chapterId + ':' + c.parent.sha256, 'claim key not chapterId+candidateSHA for ' + c.chapterId);
    assert(c.checks.includes('joint_exclusion'), 'joint_exclusion check missing');
  }
  return b4.chapters.map(c => c.claim.key.split(':')[0]).join(', ');
});
check('fix-next-batch', 'batch-4 regression block refuses the three incident chapters', () => {
  for (const cid of COVERED) assert(b4.incidentRegression[cid].covered === true, cid + ' not refused');
  return 'refused: ' + COVERED.join(', ');
});

// ---------- phase 2: 183-1 status ----------
check('status-183-1', '183-1 is not covered and has no passed candidate', () => {
  const c = (joint.incidentControls || {})['nemata-jp-chapter-183-1'];
  assert(c && c.covered === false, '183-1 is unexpectedly covered');
  const auditDir = path.join(P, 'audit/web/articles/modern-yabejp-ja');
  const candSha = '5083143622906fd318dfd9847c1a446f59deb78ff613a31adb44dd81df299ccd';
  const hits = fs.readdirSync(auditDir).filter(f => f.includes(candSha));
  assert(hits.length === 0, 'audit already exists for the produced candidate: ' + hits.join(','));
  assert(exists(path.join(P, 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section003.coac269rev1.json')), 'produced candidate missing');
  return 'not covered, not passed, no audit receipt for the new candidate sha';
});

const phase1 = results.filter(r => r.phase === 'defect-old-protocol');
const phase2 = results.filter(r => r.phase !== 'defect-old-protocol');
const phase1Ok = phase1.every(r => r.passed);
const phase2Ok = phase2.every(r => r.passed);
const report = {
  schema: 'coac269-joint-exclusion-test/1',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  inputs: {
    jointExclusion: {path: path.relative(P, jointPath).replaceAll('\\', '/'), sha256: sha(fs.readFileSync(jointPath))},
    oldB2: {path: path.relative(P, path.join(NS, 'preflight/preflight-b2-7818f51dc4b3718c.json')).replaceAll('\\', '/'), accepted: oldB2.chapters.map(c => c.chapterId)},
    oldB3: {path: path.relative(P, path.join(NS, 'preflight/preflight-b3-3b846f9db751ee3e.json')).replaceAll('\\', '/'), accepted: oldB3.chapters.map(c => c.chapterId)},
  },
  defectReproduced: phase1Ok,
  fixVerified: phase2Ok,
  results,
  ok: phase1Ok && phase2Ok,
};
const outPath = path.join(NS, 'preflight', 'joint-exclusion-test-' + sha(JSON.stringify(results)).slice(0, 16) + '.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({receipt: path.relative(P, outPath).replaceAll('\\', '/'), ok: report.ok, defectReproduced: phase1Ok, fixVerified: phase2Ok, results}, null, 2));
process.exit(report.ok ? 0 : 1);
