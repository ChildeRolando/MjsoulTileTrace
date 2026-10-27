#!/usr/bin/env node
// COAC-269 regression test for the batch-8 joint-exclusion extension (v3).
//
// v2 only mapped the Japanese modern scope, so a 79-cn figure chapter could not be excluded by its
// canonical original chapter id at all. v3 adds the 79-cn body correspondence as a second canonical
// map and a figure-direction entry check, using the same three sources.
//
// This test asserts against the IMMUTABLE receipt recorded for batch 8 (not a live re-run, whose
// facts legitimately change as chapters pass and are integrated):
//   1. the incident negative controls still hold (246/237/131 covered, 183 uncovered),
//   2. a 79-cn chapter already covered by a current-source PASSED audit is not offered as eligible
//      (081-8 — the exact defect class of the duplication incident, reached here through the
//      passed-receipt source of the union),
//   3. a 79-cn chapter the unified register marks covered-effective is not offered either (054-4),
//   4. a chapter another lane has claimed is visible as `claimed` (217-4, line A),
//   5. both dispatched batch-8 chapters are eligible, in the FIGURE direction, with exactly the
//      expected single target figure bound to the expected parent candidate sha,
//   6. the receipt records zero model calls and both canonical maps.
// Exit 0 only when every assertion passes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RECEIPT = path.join(HERE, 'b8-joint-exclusion-v3-12-42-09-pre-slot.json');
const joint = JSON.parse(fs.readFileSync(RECEIPT, 'utf8'));

const results = [];
const check = (name, fn) => {
  try { results.push({name, passed: true, detail: String(fn())}); }
  catch (e) { results.push({name, passed: false, detail: e.message}); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const eligible = new Map(joint.eligibleRepairTargets.map(e => [e.chapterId, e]));
const skipped = new Map(joint.skipped.map(s => [s.chapterId, s]));

check('receipt is the v3 exclusion with zero model calls', () => {
  assert(joint.schema === 'coac269-joint-exclusion-precheck/3', 'not a v3 receipt: ' + joint.schema);
  assert(joint.scriptVersion === 3, 'scriptVersion ' + joint.scriptVersion);
  assert(joint.modelCalls === 0 && joint.productionCalls === 0, 'receipt records model calls');
  return `${joint.schema} / ${joint.recordedAt}`;
});

check('both canonical maps are wired (modern scope + 79-cn correspondence)', () => {
  const names = (joint.sources || []).map(s => s.name);
  assert(names.includes('modern-yabejp-ja'), 'modern source missing');
  assert(names.includes('79-bilibili-cn'), '79-cn source missing');
  const cn = joint.sources.find(s => s.name === '79-bilibili-cn');
  assert(cn.direction === 'figure', '79-cn direction is ' + cn.direction);
  assert(cn.map.chapters >= 80, '79-cn map has only ' + cn.map.chapters + ' chapters');
  return names.join(' + ');
});

check('incident negative controls still hold', () => {
  assert(joint.incidentControlsOk === true, 'incident controls failed');
  for (const cid of ['nemata-jp-chapter-246-1', 'nemata-jp-chapter-237-1', 'nemata-jp-chapter-131-1']) {
    assert(joint.incidentControls[cid].covered === true, cid + ' should be covered');
    assert(!eligible.has(cid), cid + ' must not be eligible');
  }
  assert(joint.incidentControls['nemata-jp-chapter-183-1'].covered === false, '183-1 should be uncovered');
  return '246/237/131 covered, 183 uncovered';
});

check('a 79-cn chapter with a current-source passed audit is not eligible (081-8)', () => {
  assert(!eligible.has('79-cn-chapter-081-8'), '081-8 is offered as an eligible repair target');
  return 'excluded through latest-passed-audit-current-source';
});

check('a register covered-effective 79-cn chapter is not eligible (054-4)', () => {
  assert(!eligible.has('79-cn-chapter-054-4'), '054-4 is offered as an eligible repair target');
  return 'excluded through unified-register-covered-effective';
});

check('another lane\'s claim is visible as claimed (217-4, line A)', () => {
  const s = skipped.get('79-cn-chapter-217-4');
  assert(s && s.reason === 'claimed', '217-4 is not recorded as claimed: ' + JSON.stringify(s ?? null));
  assert(!eligible.has('79-cn-chapter-217-4'), 'a claimed chapter is also eligible');
  return 'skipped: ' + s.reason;
});

const EXPECTED = [
  {chapterId: '79-cn-chapter-128-14', parent: '2aec7345fda18914b17cab6d01703d1a5e0fb5bee27eb056e62453f4f24887ec', figure: '79-bilibili-cn:cv1734739:b0013:figure', articleId: 'cv1734739'},
  {chapterId: '79-cn-chapter-145-4', parent: '7557da593c6cdee11ca01853639150f50e39cbc9dc94bd51f0461d65d18ad92a', figure: '79-bilibili-cn:cv1744266:b0005:figure', articleId: 'cv1744266'},
];
for (const e of EXPECTED) {
  check(`${e.chapterId} is an eligible FIGURE target with exactly ${e.figure}`, () => {
    const x = eligible.get(e.chapterId);
    assert(x, 'not eligible');
    assert(x.direction === 'figure', 'direction ' + x.direction);
    assert(x.articleId === e.articleId, 'articleId ' + x.articleId);
    assert(x.parents.length === 1, x.parents.length + ' needs-repair parents');
    const p = x.parents[0];
    assert(p.sha256 === e.parent, 'parent sha ' + p.sha256);
    assert(JSON.stringify(p.guard.targetFigureIds) === JSON.stringify([e.figure]), 'targets ' + JSON.stringify(p.guard.targetFigureIds));
    assert(p.guard.revisableByCurrentEntry === true, 'guard says not revisable');
    assert(p.guard.nonTargetFiguresWithoutFaithfulCheck === 0, 'a non-target figure lacks a faithful check');
    return `${p.file} -> ${e.figure}`;
  });
}

check('owner-reserved 090-6 has no shared claim, so only the dispatch layer can exclude it', () => {
  // v3 has no way to know an owner-side reservation that was never written as a claim. The recorded
  // receipt shows it eligible; the batch-8 dispatch never touched it (see README + handoff scope).
  const s = skipped.get('79-cn-chapter-090-6');
  assert(eligible.has('79-cn-chapter-090-6') || (s && s.reason === 'claimed'),
    '090-6 is neither eligible nor claim-skipped — unexpected third state');
  return eligible.has('79-cn-chapter-090-6') ? 'eligible at 12:42 (no claim existed yet): documented boundary' : 'claimed';
});

check('no chapter is both eligible and skipped', () => {
  const both = [...eligible.keys()].filter(id => skipped.has(id));
  assert(both.length === 0, 'overlap: ' + both.join(','));
  return 'disjoint';
});

const failed = results.filter(r => !r.passed);
console.log(JSON.stringify({
  schema: 'coac269-regression/1', receipt: path.basename(RECEIPT), modelCalls: 0,
  total: results.length, failed: failed.length, results,
}, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
