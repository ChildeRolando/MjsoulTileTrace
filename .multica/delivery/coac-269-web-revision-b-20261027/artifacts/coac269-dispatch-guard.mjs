#!/usr/bin/env node
// COAC-269 line B per-dispatch gate — review fixes R1 + R3.
//
// R1: a dispatch may only happen while the SHARED claim (parallel/claims/<chapterId>.json, the
//     record line A reads through slots.mjs check-chapter) is held by this line for exactly the
//     parent candidate sha being used. The ticket-local claim alone is not ownership.
// R3: the three-source joint exclusion is re-run for every single model dispatch, immediately
//     before it, and the dispatch is refused with zero calls on any drift (new passed receipt,
//     pointer move, foreign claim, stale receipt, changed parent/notes/source sha).
//
// The decision function is pure and dependency-free so the regression test can inject synthetic
// drift without touching the real data root or making a model call. The CLI adds the I/O.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join, relative, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const OWNER = 'COAC-269 Ticket executor';
export const MAX_JOINT_AGE_SECONDS = 900;
export const selfName = s => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const sha = b => createHash('sha256').update(b).digest('hex');

// ---- pure decision -------------------------------------------------------------
// input = {
//   chapterId, parentSha256, owner,
//   joint: {path, sha256, recordedAt, ageSecondsAtUse, pointerSha256, eligible: [{chapterId, parentShas}]},
//   activePreviewPointerSha256,
//   sharedClaim: {chapterId, owner, candidateSha256} | null,
//   ticketClaim: {chapterId, claimKey, parentSha256, sharedClaimSha256} | null,
//   held: {kind} | null,
//   outputExists: boolean,
// }
export function evaluateDispatch(input, opts = {}) {
  const owner = opts.owner ?? input.owner ?? OWNER;
  const maxAge = opts.maxAgeSeconds ?? MAX_JOINT_AGE_SECONDS;
  const checks = [];
  const reasons = [];
  const ok = (name, detail) => checks.push({name, ok: true, detail});
  const bad = (name, detail) => { checks.push({name, ok: false, detail}); reasons.push(name + ': ' + detail); };

  const j = input.joint;
  if (!j) bad('joint_receipt', 'missing');
  else {
    if (!(j.ageSecondsAtUse <= maxAge)) bad('joint_receipt_fresh', `age ${j.ageSecondsAtUse}s exceeds ${maxAge}s at dispatch`);
    else ok('joint_receipt_fresh', `${j.ageSecondsAtUse}s <= ${maxAge}s, receipt ${j.sha256?.slice(0, 16) ?? '?'}`);
    if (j.pointerSha256 !== input.activePreviewPointerSha256) bad('pointer_stable', 'active preview pointer changed since the joint exclusion');
    else ok('pointer_stable', j.pointerSha256);
    const target = (j.eligible || []).find(e => e.chapterId === input.chapterId);
    if (!target) bad('joint_eligible', input.chapterId + ' is not an eligible repair target in the fresh joint exclusion');
    else if (!(target.parentShas || []).includes(input.parentSha256)) bad('joint_parent_binding', 'parent candidate sha is not one the fresh joint exclusion saw');
    else ok('joint_eligible', input.chapterId + ' with parent ' + input.parentSha256.slice(0, 16));
  }

  const s = input.sharedClaim;
  if (!s) bad('shared_claim_present', 'no parallel/claims record for ' + input.chapterId);
  else {
    if (s.chapterId !== input.chapterId) bad('shared_claim_chapter', `claim is for ${s.chapterId}`);
    else if (s.owner !== owner) bad('shared_claim_owner', `held by ${s.owner}`);
    else if (s.candidateSha256 !== input.parentSha256) bad('shared_claim_sha', 'claim is for another parent candidate sha');
    else ok('shared_claim', `${s.owner} @ ${s.candidateSha256.slice(0, 16)}`);
  }

  const t = input.ticketClaim;
  if (!t) bad('ticket_claim_present', 'no ticket-local claim binding for ' + input.chapterId);
  else {
    if (t.chapterId !== input.chapterId) bad('ticket_claim_chapter', `detail claim is for ${t.chapterId}`);
    else if (t.claimKey !== input.chapterId + ':' + input.parentSha256) bad('ticket_claim_key', 'claim key is not chapterId + current parent sha');
    else if (t.parentSha256 !== input.parentSha256) bad('ticket_claim_parent', 'detail claim parent sha differs');
    else if (s && t.sharedClaimSha256 !== s.sha256) bad('ticket_claim_shared_binding', 'detail claim does not bind the current shared claim record');
    else ok('ticket_claim', t.claimKey);
  }

  if (input.held) bad('ticket_hold', `${input.held.kind} — chapter is not dispatchable`);
  else ok('ticket_hold', 'none');

  if (input.outputExists) bad('output_absent', 'a candidate for this variant already exists');
  else ok('output_absent', 'no variant output yet');

  return {ok: reasons.length === 0, reasons, checks};
}

// ---- CLI: real I/O, still zero model calls -------------------------------------
const isCli = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (isCli) {
  const P = 'E:/AgentData/Coach/knowledge/processing';
  const NS = join(P, 'web-production/v1/coac269-20261027');
  const HERE = dirname(fileURLToPath(import.meta.url));
  const JOINT = join(HERE, 'coac269-joint-exclusion-precheck-v2.mjs');
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const casePath = arg('--case');
  if (!casePath) { console.error('usage: coac269-dispatch-guard.mjs --case <case.json>'); process.exit(2); }
  const c = JSON.parse(readFileSync(casePath, 'utf8'));
  const rel = p => relative(P, p).replaceAll('\\', '/');
  const read = p => JSON.parse(readFileSync(p, 'utf8'));

  // 1. fresh joint exclusion for THIS dispatch
  const jointOut = JSON.parse(execFileSync(process.execPath, [JOINT], {encoding: 'utf8', timeout: 180000}));
  const jointPath = join(P, jointOut.receipt);
  const jointBytes = readFileSync(jointPath);
  const joint = JSON.parse(jointBytes);
  if (!jointOut.controlsOk) {
    console.log(JSON.stringify({ok: false, reasons: ['joint_controls_failed'], receipt: null}, null, 2));
    process.exit(1);
  }
  const ageSeconds = Math.round((Date.now() - new Date(joint.recordedAt).getTime()) / 1000);
  const pointerBytes = readFileSync(join(P, 'integration/accepted-preview-current.json'));

  // 2. shared claim (the surface line A sees) + ticket-local detail claim
  const sharedPath = join(P, 'parallel/claims', selfName(c.chapterId) + '.json');
  let sharedClaim = null;
  if (existsSync(sharedPath)) {
    const sb = readFileSync(sharedPath);
    const r = JSON.parse(sb);
    sharedClaim = {path: rel(sharedPath), sha256: sha(sb), chapterId: r.chapterId, owner: r.owner, candidateSha256: r.candidateSha256, claimedAt: r.claimedAt};
  }
  let ticketClaim = null;
  const ticketPath = c.ticketClaimPath ? join(P, c.ticketClaimPath) : null;
  if (ticketPath && existsSync(ticketPath)) {
    const r = read(ticketPath);
    ticketClaim = {path: rel(ticketPath), sha256: sha(readFileSync(ticketPath)), chapterId: r.chapterId,
      claimKey: r.claimKey, parentSha256: r.parentCandidate?.sha256 ?? null, sharedClaimSha256: r.sharedClaim?.sha256 ?? null};
  }

  // 3. ticket-level holds (pending adjudication / withdrawn duplicate)
  let held = null;
  for (const dir of ['web-production/v1/coac269-20261027/adjudication', 'web-production/v1/coac269-20261027/handoff']) {
    const abs = join(P, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (!f.endsWith('.json')) continue;
      let r; try { r = read(join(abs, f)); } catch { continue; }
      if (r.schema === 'coac269-pending-adjudication/1' && r.chapterId === c.chapterId) held = {kind: 'pending-adjudication', record: rel(join(abs, f))};
      if (r.schema === 'coac269-withdrawal/1' && (r.withdrawn || []).some(w => w.chapterId === c.chapterId)) held = {kind: 'withdrawn-duplicate', record: rel(join(abs, f))};
    }
  }

  const outputPath = join(P, c.outputPath);
  const input = {
    chapterId: c.chapterId, parentSha256: c.parentSha256, owner: OWNER,
    joint: {
      path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSecondsAtUse: ageSeconds,
      pointerSha256: joint.inputs.activePreviewPointer.sha256,
      eligible: joint.eligibleRepairTargets.map(e => ({chapterId: e.chapterId, parentShas: (e.parents || []).map(p => p.sha256)})),
    },
    activePreviewPointerSha256: sha(pointerBytes),
    sharedClaim, ticketClaim, held, outputExists: existsSync(outputPath),
  };
  const verdict = evaluateDispatch(input);

  const receipt = {
    schema: 'coac269-dispatch-guard/1',
    ticket: 'COAC-269', line: 'B', batch: c.batch ?? null,
    recordedAt: new Date().toISOString(),
    purpose: 'per-dispatch gate: fresh three-source joint exclusion + shared-claim ownership + binding checks, zero model calls',
    chapterId: c.chapterId, articleId: c.articleId ?? null,
    parentSha256: c.parentSha256, plannedOutput: c.outputPath,
    joint: {path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSecondsAtUse: ageSeconds,
      pointerSha256: joint.inputs.activePreviewPointer.sha256, eligibleRepairTargets: joint.eligibleRepairTargets.map(e => e.chapterId)},
    activePreviewPointerSha256: sha(pointerBytes),
    sharedClaim, ticketClaim, held, outputExists: input.outputExists,
    modelCalls: 0, productionCalls: 0,
    verdict,
  };
  await mkdir(join(NS, 'preflight'), {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const receiptPath = join(NS, 'preflight', `dispatch-guard-${stamp}-${sha(JSON.stringify(verdict)).slice(0, 8)}.json`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({ok: verdict.ok, reasons: verdict.reasons, receipt: rel(receiptPath),
    joint: {path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSeconds},
    sharedClaim: sharedClaim ? {owner: sharedClaim.owner, sha: sharedClaim.candidateSha256, record: sharedClaim.path} : null}, null, 2));
  process.exit(verdict.ok ? 0 : 1);
}
