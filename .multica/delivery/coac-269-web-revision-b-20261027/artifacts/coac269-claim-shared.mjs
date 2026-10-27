#!/usr/bin/env node
// COAC-269 line B shared-claim registration — review fix R1.
//
// Defect this replaces: batch-5 and batch-6 wrote their claim only into the ticket namespace
// (web-production/v1/coac269-20261027/claims/), so line A (COAC-248) could not see it through the
// COAC-244 interface `parallel/slots.mjs check-chapter` and could claim (and pay for) the same
// chapter again. A file-exclusive create in our own namespace only excludes ourselves.
//
// Order enforced here, per chapter:
//   1. a FRESH three-source joint exclusion is run immediately before claiming (zero model calls),
//   2. the chapter must still be an eligible repair target there and the parent sha must match,
//   3. the atomic SHARED claim is taken through the existing interface
//      `parallel/slots.mjs claim --chapter <id> --candidate-sha <parentSha> --lane B --owner <owner>`
//      (parallel/claims/<chapterId>.json, O_EXCL — the only record line A reads),
//   4. the shared record is read back and its owner + candidate sha verified,
//   5. only then is the ticket-local detailed claim (bindings/proof) written, carrying the shared
//      claim path and sha.
//
// `--register-produced` covers chapters whose production happened before the shared interface was
// used. Their claim is created NOW with its real timestamp; the record says explicitly that the
// production precedes the claim and references the production call ids. No historical time is
// invented and nothing is backdated.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join, relative, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const P = 'E:/AgentData/Coach/knowledge/processing';
const NS = join(P, 'web-production/v1/coac269-20261027');
const SLOTS = join(P, 'parallel/slots.mjs');
const HERE = dirname(fileURLToPath(import.meta.url));
// the gate scripts live in this ticket bundle, not in the data namespace
// v3 covers both entries this line uses (modern text scope + 79-cn figure correspondence); it is
// the same three-source exclusion, not a second mechanism. Batch 5/6/7 receipts were produced by v2
// and keep their recorded sha — the receipt used for a claim is always the one named in it.
const JOINT = join(HERE, 'coac269-joint-exclusion-precheck-v3.mjs');
const OWNER = 'COAC-269 Ticket executor';
const NODE = process.execPath;
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(P, p).replaceAll('\\', '/');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes(k);

const batch = arg('--batch');
const preflightRel = arg('--preflight');
const productionRel = arg('--production', null);
const registerProduced = flag('--register-produced');
if (!batch || !preflightRel) {
  console.error('usage: coac269-claim-shared.mjs --batch <bN> --preflight <rel> [--production <rel>] [--register-produced]');
  process.exit(2);
}

const pre = read(join(P, preflightRel));
if (!pre.ok) { console.error('preflight not ok'); process.exit(1); }
if (pre.batch !== batch) { console.error('preflight batch mismatch: ' + pre.batch); process.exit(1); }
const production = productionRel ? read(join(P, productionRel)) : null;

// ---- 1. fresh joint exclusion immediately before claiming (never a stored receipt) ----
const jointOut = JSON.parse(execFileSync(NODE, [JOINT], {encoding: 'utf8', timeout: 180000}));
const jointPath = join(P, jointOut.receipt);
const jointBytes = await readFile(jointPath);
const joint = JSON.parse(jointBytes);
if (!jointOut.controlsOk) { console.error('joint exclusion negative controls failed'); process.exit(1); }
const jointAgeSeconds = Math.round((Date.now() - new Date(joint.recordedAt).getTime()) / 1000);
if (jointAgeSeconds > 900) { console.error('fresh joint receipt already stale: ' + jointAgeSeconds + 's'); process.exit(1); }
const ptrBytes = await readFile(join(P, 'integration/accepted-preview-current.json'));
if (sha(ptrBytes) !== joint.inputs.activePreviewPointer.sha256) {
  console.error('active preview pointer moved between joint exclusion and claim');
  process.exit(1);
}
const eligibleById = new Map(joint.eligibleRepairTargets.map(e => [e.chapterId, e]));

// ---- 2-5. shared claim first, ticket-local proof second ----
const claimsOut = [];
const errors = [];
for (const c of pre.chapters) {
  const rec = {chapterId: c.chapterId, articleId: c.articleId, state: 'pending'};
  const jointEligible = eligibleById.get(c.chapterId);
  if (!jointEligible) {
    rec.state = 'refused-not-eligible';
    errors.push(c.chapterId + ':not_eligible_in_fresh_joint_exclusion');
    claimsOut.push(rec);
    continue;
  }
  const jointParentShas = (jointEligible.parents || []).map(p => p.sha256);
  if (!jointParentShas.includes(c.parent.sha256)) {
    rec.state = 'refused-parent-drift';
    errors.push(c.chapterId + ':parent_sha_drift');
    claimsOut.push(rec);
    continue;
  }

  // 3. atomic shared claim through the existing COAC-244 interface
  let sharedResult = null, sharedExit = 0, sharedStdout = '';
  try {
    sharedStdout = execFileSync(NODE, [SLOTS, 'claim', '--chapter', c.chapterId,
      '--candidate-sha', c.parent.sha256, '--lane', 'B', '--owner', OWNER],
      {encoding: 'utf8', timeout: 120000});
  } catch (e) {
    sharedExit = typeof e.status === 'number' ? e.status : 1;
    sharedStdout = String(e.stdout || '');
  }
  try { sharedResult = JSON.parse(sharedStdout); } catch { sharedResult = null; }
  const sharedPath = join(P, 'parallel/claims', c.chapterId.replace(/[^A-Za-z0-9._-]+/g, '_') + '.json');
  let sharedRecord = null;
  try { sharedRecord = read(sharedPath); } catch {}
  if (sharedExit !== 0) {
    // claim_held (7) is only acceptable when the holder is this line with the same parent sha:
    // that is our own reservation from an earlier run, not a competing claim.
    const ownReservation = sharedExit === 7 && sharedRecord
      && sharedRecord.owner === OWNER && sharedRecord.candidateSha256 === c.parent.sha256
      && sharedRecord.chapterId === c.chapterId;
    if (!ownReservation) {
      rec.state = 'refused-shared-claim';
      rec.sharedClaimError = {exit: sharedExit, error: sharedResult?.error ?? null, holder: sharedResult?.holder ?? sharedRecord ?? null};
      errors.push(c.chapterId + ':shared_claim_unavailable');
      claimsOut.push(rec);
      continue;
    }
    rec.sharedClaimCreated = false;
  } else {
    rec.sharedClaimCreated = true;
  }
  if (!sharedRecord) {
    rec.state = 'refused-shared-claim-readback';
    errors.push(c.chapterId + ':shared_claim_record_missing_after_claim');
    claimsOut.push(rec);
    continue;
  }
  const sharedBytes = await readFile(sharedPath);
  if (sharedRecord.owner !== OWNER || sharedRecord.candidateSha256 !== c.parent.sha256 || sharedRecord.chapterId !== c.chapterId) {
    rec.state = 'refused-shared-claim-mismatch';
    rec.sharedClaimError = {record: sharedRecord};
    errors.push(c.chapterId + ':shared_claim_owner_or_sha_mismatch');
    claimsOut.push(rec);
    continue;
  }
  rec.sharedClaim = {path: rel(sharedPath), sha256: sha(sharedBytes), owner: sharedRecord.owner,
    candidateSha256: sharedRecord.candidateSha256, claimedAt: sharedRecord.claimedAt, created: rec.sharedClaimCreated};

  // 5. ticket-local detailed claim, carrying the shared binding
  const outPath = join(P, c.outputPath);
  const prodChapter = production ? (production.chapters || []).find(x => x.chapterId === c.chapterId) : null;
  if (registerProduced) {
    if (!existsSync(outPath)) {
      rec.state = 'refused-no-produced-candidate';
      errors.push(c.chapterId + ':produced_candidate_missing');
      claimsOut.push(rec);
      continue;
    }
    const candSha = sha(await readFile(outPath));
    if (prodChapter?.candidate?.sha256 !== candSha) {
      rec.state = 'refused-candidate-sha-drift';
      errors.push(c.chapterId + ':candidate_sha_not_the_one_in_the_production_receipt');
      claimsOut.push(rec);
      continue;
    }
    rec.producedCandidate = {path: rel(outPath), sha256: candSha,
      productionCallIds: (prodChapter.actualCalls || []).map(a => a.callId),
      productionReceipt: productionRel};
  }
  const claim = {
    schema: 'coac269-candidate-claim/3',
    ticket: 'COAC-269',
    line: 'B',
    batch,
    claimedAt: new Date().toISOString(),
    owner: OWNER,
    claimKey: c.chapterId + ':' + c.parent.sha256,
    chapterId: c.chapterId,
    articleId: c.articleId,
    parentCandidate: {path: c.parent.path, sha256: c.parent.sha256},
    parentAudit: {path: c.notes.path, sha256: c.notes.sha256},
    source: {path: c.source.path, sha256: c.source.sha256},
    targets: c.targets.map(t => t.sourceBlockId),
    plannedOutput: c.outputPath,
    variant: pre.variant,
    sharedClaim: {interface: 'parallel/slots.mjs claim', ...rec.sharedClaim,
      verifiedAt: new Date().toISOString(),
      registrationKind: registerProduced ? 'post-production-registration' : 'pre-dispatch'},
    productionPrecedesSharedClaim: registerProduced || undefined,
    production: registerProduced ? rec.producedCandidate : undefined,
    selectionProof: {
      rule: 'canonical chapter id absent from the union of active preview selection/unit-map, latest unified register, and every passed receipt bound to the current source sha',
      jointExclusion: {path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSecondsAtClaim: jointAgeSeconds, pointerSha256: sha(ptrBytes)},
      preflight: {path: preflightRel, sha256: sha(await readFile(join(P, preflightRel)))},
    },
    writes: 'shared ownership in parallel/claims (the only surface line A reads); detail record in the ticket namespace; no shared list, selection, pointer or formal library write',
  };
  const path = join(NS, 'claims', `claim-${batch}-${c.chapterId}-${c.parent.sha256}.json`);
  try {
    await writeFile(path, JSON.stringify(claim, null, 2) + '\n', {flag: 'wx'});
    rec.ticketClaim = {path: rel(path), data: claim};
    rec.state = 'claimed';
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const old = read(path);
    if (old.chapterId !== c.chapterId || old.parentCandidate?.sha256 !== c.parent.sha256) {
      rec.state = 'refused-claim-key-conflict';
      errors.push(c.chapterId + ':ticket_claim_key_conflict');
      claimsOut.push(rec);
      continue;
    }
    rec.ticketClaim = {path: rel(path), preserved: true, sha256: sha(await readFile(path))};
    rec.state = 'claimed-existing';
  }
  rec.claimKey = claim.claimKey;
  claimsOut.push(rec);
}

const ok = errors.length === 0;
const batchReceipt = {
  schema: 'coac269-shared-claim-batch/1',
  ticket: 'COAC-269', line: 'B', batch,
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  interface: {script: 'parallel/slots.mjs', sharedDir: 'parallel/claims', verification: 'owner + candidateSha256 read back after claim'},
  jointExclusion: {path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSecondsAtClaim: jointAgeSeconds},
  registrationKind: registerProduced ? 'post-production-registration' : 'pre-dispatch',
  claims: claimsOut,
  errors,
  ok,
};
await mkdir(join(NS, 'claims'), {recursive: true});
const receiptPath = join(NS, 'claims', `shared-claims-${batch}-${sha(JSON.stringify({claimsOut, errors})).slice(0, 16)}.json`);
await writeFile(receiptPath, JSON.stringify(batchReceipt, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({
  ok, errors, batch,
  receipt: rel(receiptPath),
  joint: {path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSeconds: jointAgeSeconds},
  claims: claimsOut.map(c => ({chapterId: c.chapterId, state: c.state, sharedClaim: c.sharedClaim ?? null,
    ticketClaim: c.ticketClaim?.path ?? null, error: c.sharedClaimError ?? null})),
}, null, 2));
process.exit(ok ? 0 : 1);
