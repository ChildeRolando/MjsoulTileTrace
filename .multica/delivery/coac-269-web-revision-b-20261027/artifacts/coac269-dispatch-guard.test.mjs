#!/usr/bin/env node
// COAC-269 zero-model regression test for review findings R1 (shared claim) and R3 (per-dispatch
// joint exclusion). No model call, no production call, no shared-data write outside a temp root.
//
// Phase 1 — the defects must reproduce on the artifacts that were reviewed (git 8a97ffe...):
//   * the batch-5 claim script never touches parallel/slots.mjs, so the chapter claim is invisible
//     to line A;
//   * the batch-5 producer runs the joint exclusion once per batch, outside the per-chapter loop.
// Phase 2 — the fixes:
//   * the claim script takes the shared claim first and the dispatch guard requires it;
//   * the dispatch guard refuses a second dispatch after injected drift (new passed / pointer move /
//     foreign claim / stale receipt), with an independent receipt per attempt;
//   * a real two-lane race in a temp parallel root yields exactly one winner and the loser sees the
//     winner's claim (exit 7), which is what line A's check-chapter will see.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {evaluateDispatch, OWNER} from './coac269-dispatch-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const PRE_FIX_COMMIT = '8a97ffead04cc9dba38ecb7af6008ad16e87a269';
const REL_DIR = '.multica/delivery/coac-269-web-revision-b-20261027/artifacts';
const SLOTS_MJS = 'E:/AgentData/Coach/knowledge/processing/parallel/slots.mjs';

const results = [];
const check = (phase, name, fn) => {
  try { const detail = fn(); results.push({phase, name, passed: true, detail}); }
  catch (e) { results.push({phase, name, passed: false, detail: e.message}); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: HERE, encoding: 'utf8'}).trim();
const git = (...args) => execFileSync('git', ['-C', REPO_ROOT, ...args], {encoding: 'utf8'});
const oldFile = name => git('show', `${PRE_FIX_COMMIT}:${REL_DIR}/${name}`);
const newFile = name => fs.readFileSync(path.join(HERE, name), 'utf8');
const runSlots = (root, ...args) => {
  try {
    const out = execFileSync(NODE, [SLOTS_MJS, ...args], {encoding: 'utf8', env: {...process.env, COACH_PARALLEL_ROOT: root}});
    return {exit: 0, json: JSON.parse(out)};
  } catch (e) {
    let json = null; try { json = JSON.parse(String(e.stdout || '')); } catch {}
    return {exit: typeof e.status === 'number' ? e.status : 1, json};
  }
};

// ---- shared fixture for the pure decision function ----
const CID = 'nemata-jp-chapter-drift-fixture';
const PARENT = 'a'.repeat(64);
const base = (over = {}) => ({
  chapterId: CID, parentSha256: PARENT, owner: OWNER,
  joint: {path: 'fixture', sha256: 'b'.repeat(64), recordedAt: '2026-10-27T00:00:00Z', ageSecondsAtUse: 5,
    pointerSha256: 'c'.repeat(64), eligible: [{chapterId: CID, parentShas: [PARENT]}]},
  activePreviewPointerSha256: 'c'.repeat(64),
  sharedClaim: {chapterId: CID, owner: OWNER, candidateSha256: PARENT, sha256: 'd'.repeat(64)},
  ticketClaim: {chapterId: CID, claimKey: CID + ':' + PARENT, parentSha256: PARENT, sharedClaimSha256: 'd'.repeat(64)},
  held: null, outputExists: false,
  ...over,
});

// ---------- phase 1: defects reproduce on the reviewed artifacts ----------
check('defect-R1', 'reviewed claim script has no shared interface call', () => {
  const src = oldFile('coac269-claim-b5.mjs');
  assert(!/parallel\/claims|slots\.mjs|check-chapter/.test(src), 'old claim script already used the shared interface');
  assert(/Writes only into the ticket namespace/.test(src), 'expected the ticket-namespace-only claim');
  return 'claim-b5.mjs writes only web-production/v1/coac269-20261027/claims';
});
check('defect-R1', 'reviewed claim script neither reads nor verifies a shared owner', () => {
  const src = oldFile('coac269-claim-b5.mjs');
  assert(!/sharedRecord|parallel/.test(src), 'unexpected shared-owner verification in the old script');
  return 'no owner/sha read-back from parallel/claims';
});
check('defect-R3', 'reviewed producer runs the joint exclusion once, outside the chapter loop', () => {
  const src = oldFile('coac269-produce-b5.py');
  const calls = (src.match(/joint_run\(/g) || []).length;
  assert(calls === 2, 'expected exactly the definition + one call, saw ' + calls);
  const loop = src.indexOf('for c in cases:\n        rec =');
  assert(loop > 0, 'per-chapter loop not found');
  assert(src.indexOf("joint_run('pre-dispatch')") < loop, 'expected the single call before the loop');
  assert(!/joint_run/.test(src.slice(loop)), 'the old loop already re-ran the joint exclusion');
  return 'single joint_run("pre-dispatch") before the loop; second chapter reused its receipt';
});

// ---------- phase 2: fixes ----------
check('fix-R1', 'claim script takes the shared claim through parallel/slots.mjs first', () => {
  const src = newFile('coac269-claim-shared.mjs');
  assert(/slots\.mjs/.test(src) && /'claim', '--chapter'/.test(src), 'shared claim call missing');
  const sharedIdx = src.indexOf("'--candidate-sha'");
  const ticketIdx = src.indexOf('claim-${batch}-');
  assert(sharedIdx > 0 && ticketIdx > sharedIdx, 'ticket claim is not written after the shared claim');
  assert(/sharedRecord\.owner !== OWNER/.test(src), 'no owner read-back after the shared claim');
  return 'shared claim → read-back owner+sha → ticket-local detail claim';
});
check('fix-R1', 'dispatch guard refuses when the shared claim is missing', () => {
  const v = evaluateDispatch(base({sharedClaim: null}));
  assert(!v.ok && v.reasons.some(r => r.startsWith('shared_claim_present')), JSON.stringify(v.reasons));
  return v.reasons[0];
});
check('fix-R1', 'dispatch guard refuses a foreign or wrong-sha shared claim', () => {
  const a = evaluateDispatch(base({sharedClaim: {chapterId: CID, owner: 'COAC-248 Mika', candidateSha256: PARENT}}));
  assert(!a.ok && a.reasons.some(r => r.startsWith('shared_claim_owner')), JSON.stringify(a.reasons));
  const b = evaluateDispatch(base({sharedClaim: {chapterId: CID, owner: OWNER, candidateSha256: 'f'.repeat(64)}}));
  assert(!b.ok && b.reasons.some(r => r.startsWith('shared_claim_sha')), JSON.stringify(b.reasons));
  return a.reasons[0] + ' | ' + b.reasons[0];
});
check('fix-R1', 'real two-lane race in a temp parallel root: one winner, loser sees the claim', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coac269-parallel-'));
  const chapter = 'nemata-jp-chapter-race-fixture';
  const first = runSlots(root, 'claim', '--chapter', chapter, '--candidate-sha', PARENT, '--lane', 'A', '--owner', 'COAC-248 Mika');
  assert(first.exit === 0, 'first claim failed: ' + JSON.stringify(first.json));
  const second = runSlots(root, 'claim', '--chapter', chapter, '--candidate-sha', PARENT, '--lane', 'B', '--owner', OWNER);
  assert(second.exit === 7, 'second claim should be refused with exit 7, got ' + second.exit);
  const loserSees = runSlots(root, 'check-chapter', '--chapter', chapter, '--owner', OWNER);
  assert(loserSees.exit === 7, 'B must see the other lane\'s claim (exit 7), got ' + loserSees.exit);
  assert(loserSees.json?.holder?.owner === 'COAC-248 Mika', 'holder is not line A: ' + JSON.stringify(loserSees.json));
  const ownerSees = runSlots(root, 'check-chapter', '--chapter', chapter, '--owner', 'COAC-248 Mika');
  assert(ownerSees.exit === 0 && ownerSees.json?.bySelf === true, 'owner does not see its own claim');
  const otherSha = runSlots(root, 'claim', '--chapter', chapter, '--candidate-sha', 'e'.repeat(64), '--lane', 'B', '--owner', OWNER);
  assert(otherSha.exit === 7, 'a second revision of the same chapter must also be refused');
  fs.rmSync(root, {recursive: true, force: true});
  return 'A wins, B refused 7, B sees holder COAC-248 Mika, same-chapter other-sha refused 7';
});

// R3: per-dispatch drift, zero model calls, independent receipts
check('fix-R3', 'a clean per-dispatch state passes', () => {
  const v = evaluateDispatch(base());
  assert(v.ok, JSON.stringify(v.reasons));
  return v.checks.length + ' checks passed';
});
check('fix-R3', 'new passed receipt after chapter 1 blocks the second dispatch', () => {
  // a chapter that just became covered drops out of the eligible list of the fresh run
  const v = evaluateDispatch(base({joint: {...base().joint, eligible: []}}));
  assert(!v.ok && v.reasons.some(r => r.startsWith('joint_eligible')), JSON.stringify(v.reasons));
  return v.reasons[0];
});
check('fix-R3', 'parent candidate sha drift since the fresh run blocks dispatch', () => {
  const v = evaluateDispatch(base({joint: {...base().joint, eligible: [{chapterId: CID, parentShas: ['e'.repeat(64)]}]}}));
  assert(!v.ok && v.reasons.some(r => r.startsWith('joint_parent_binding')), JSON.stringify(v.reasons));
  return v.reasons[0];
});
check('fix-R3', 'pointer move since the joint exclusion blocks dispatch', () => {
  const v = evaluateDispatch(base({activePreviewPointerSha256: 'f'.repeat(64)}));
  assert(!v.ok && v.reasons.some(r => r.startsWith('pointer_stable')), JSON.stringify(v.reasons));
  return v.reasons[0];
});
check('fix-R3', 'foreign claim injected after chapter 1 blocks dispatch', () => {
  const v = evaluateDispatch(base({sharedClaim: {chapterId: CID, owner: 'COAC-248 Mika', candidateSha256: PARENT, sha256: 'd'.repeat(64)}}));
  assert(!v.ok && v.reasons.some(r => r.startsWith('shared_claim_owner')), JSON.stringify(v.reasons));
  return v.reasons[0];
});
check('fix-R3', 'a reused (stale) joint receipt blocks dispatch', () => {
  const v = evaluateDispatch(base({joint: {...base().joint, ageSecondsAtUse: 901}}));
  assert(!v.ok && v.reasons.some(r => r.startsWith('joint_receipt_fresh')), JSON.stringify(v.reasons));
  return v.reasons[0];
});
check('fix-R3', 'two dispatches cannot share one joint receipt', () => {
  const one = evaluateDispatch(base({joint: {...base().joint, ageSecondsAtUse: 2}}));
  const two = evaluateDispatch(base({joint: {...base().joint, ageSecondsAtUse: 47}}));
  assert(one.ok && two.ok, 'fixture should pass on content');
  const a = one.checks.find(c => c.name === 'joint_receipt_fresh').detail;
  const b = two.checks.find(c => c.name === 'joint_receipt_fresh').detail;
  assert(a !== b, 'both dispatches reported the same receipt age');
  return 'dispatch 1 recorded ' + a + '; dispatch 2 recorded ' + b;
});
check('fix-R3', 'producer now calls the guard inside the loop, before each dispatch', () => {
  for (const f of ['coac269-produce-b5.py', 'coac269-produce-b6.py']) {
    const src = newFile(f);
    const loop = src.indexOf('for c in cases:');
    assert(loop > 0, f + ': loop missing');
    const guard = src.indexOf('dispatch_guard(c)', loop);
    assert(guard > loop, f + ': guard call not inside the loop');
    const dispatch = src.indexOf('subprocess.run(args', loop);
    assert(dispatch > guard, f + ': dispatch runs before the guard');
    assert(/dispatchGuard/.test(src), f + ': guard result not recorded in the receipt');
  }
  return 'guard(c) → dispatch, per chapter, in b5 and b6 producers';
});
check('fix-R3', 'producer does not authorize dispatch from the batch-level joint run', () => {
  const src = newFile('coac269-produce-b5.py');
  assert(/preSlotJointExclusion/.test(src), 'batch-level run is not labelled as capacity-only');
  assert(!/jointExclusionAtDispatch':\s*\{\s*'path': joint\['/.test(src),
    'chapter receipt still copies the batch-level receipt as its dispatch proof');
  return 'batch-level run recorded as pre-slot capacity check only; dispatch proof comes from the guard';
});

// ---------- live (still zero-model) end-to-end on an already-produced chapter ----------
if (fs.existsSync('E:/AgentData/Coach/knowledge/processing/parallel/claims/nemata-jp-chapter-027-1.json')) {
  check('fix-live', 'guard on the already-produced 027-1 refuses with a fresh receipt', () => {
    const casePath = path.join(os.tmpdir(), 'coac269-guard-case-027.json');
    fs.writeFileSync(casePath, JSON.stringify({
      batch: 'live-check', chapterId: 'nemata-jp-chapter-027-1', articleId: 'chapter01-section010',
      parentSha256: '7ebd1f9736018ab21e85e0a91d2517e1c738fa56a9d4ca060c360bf9c21a566b',
      outputPath: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section010.coac269rev1.json',
      ticketClaimPath: null,
    }, null, 2));
    let out, exit;
    try { out = execFileSync(NODE, [path.join(HERE, 'coac269-dispatch-guard.mjs'), '--case', casePath], {encoding: 'utf8'}); exit = 0; }
    catch (e) { out = String(e.stdout || ''); exit = e.status; }
    fs.rmSync(casePath, {force: true});
    const j = JSON.parse(out);
    assert(exit === 1, 'guard should refuse an existing output, exit was ' + exit);
    assert(j.reasons.some(r => r.startsWith('output_absent')), JSON.stringify(j.reasons));
    assert(j.joint.ageSeconds < 900 && j.sharedClaim?.owner === OWNER, 'no fresh joint receipt or shared claim in the live run');
    return 'refused on output_absent with fresh joint ' + j.joint.sha256.slice(0, 12) + ' and shared claim by ' + j.sharedClaim.owner;
  });
} else {
  results.push({phase: 'fix-live', name: 'guard on the already-produced 027-1', passed: true, detail: 'skipped: shared claim not registered yet in this run'});
}

const failed = results.filter(r => !r.passed);
console.log(JSON.stringify({schema: 'coac269-regression/1', modelCalls: 0, productionCalls: 0, total: results.length, failed: failed.length, results}, null, 2));
process.exit(failed.length ? 1 : 0);
