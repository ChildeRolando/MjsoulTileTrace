#!/usr/bin/env node
// coach-textbook-parallel-slots/1 — minimal maker-slot + chapter-claim gate.
// Slot and claim records are created with O_EXCL ("wx"), so a record is either
// absent or complete. Nothing here deletes another owner's record: release is
// owner-only and recovery requires dead-owner evidence. No framework, one file.
import { readFile, writeFile, unlink, readdir, mkdir, appendFile, rm, stat } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.COACH_PARALLEL_ROOT ?? 'E:/AgentData/Coach/knowledge/processing/parallel';
const SLOTS = join(ROOT, 'slots'), CLAIMS = join(ROOT, 'claims'), RECOVERIES = join(ROOT, 'recoveries');
const EVENTS = join(ROOT, 'events.jsonl');
const MAX_MAKER_SLOTS = 2;
const DEFAULT_TTL_MIN = 20;

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes(k);
const now = () => new Date().toISOString();

const EXIT = { ok: 0, laneBusy: 2, overLimit: 3, staleNeedsRecovery: 4, ownerMismatch: 5, ownerLive: 6, claimHeld: 7, notClaimOwner: 8, badEvidence: 9, badArgs: 10, mutexBusy: 11 };

function stop(code, error, extra = {}) {
  console.log(JSON.stringify({ ok: false, error, ...extra }));
  process.exit(code);
}
async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function slotLive(record, ttlMinutes) {
  // A recorded pid is conclusive either way: alive means the holder still runs,
  // dead means the holder is gone. Only run-based owners (no pid) use the heartbeat.
  if (record.pid) return pidAlive(record.pid) ? { live: true, why: 'pid_alive' } : { live: false, why: 'pid_dead' };
  const beat = Date.parse(record.heartbeatAt ?? record.claimedAt ?? 0);
  const age = (Date.now() - beat) / 60000;
  if (!Number.isFinite(age)) return { live: false, why: 'no_heartbeat' };
  return age <= (record.ttlMinutes ?? ttlMinutes) ? { live: true, why: 'heartbeat_fresh' } : { live: false, why: 'heartbeat_stale', ageMinutes: Number(age.toFixed(2)) };
}
async function listSlots(ttlMinutes = DEFAULT_TTL_MIN) {
  let names = [];
  try { names = await readdir(SLOTS); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const name of names.filter(n => n.endsWith('.json')).sort()) {
    const path = join(SLOTS, name);
    const record = await readJson(path);
    if (!record) continue;
    out.push({ path, name, record, ...slotLive(record, ttlMinutes) });
  }
  return out;
}
async function event(entry) {
  await mkdir(ROOT, { recursive: true });
  await appendFile(EVENTS, JSON.stringify({ at: now(), ...entry }) + '\n', 'utf8');
}
const safeName = s => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Short critical section around count-and-create. mkdir is atomic and exclusive
// on this platform, so two acquirers can never both see "one slot free".
const MUTEX = join(ROOT, '.slots-mutex');
async function lockMutex({ waitMs = 5000, staleMs = 30000 } = {}) {
  const started = Date.now();
  for (;;) {
    try {
      await mkdir(MUTEX);
      await writeFile(join(MUTEX, 'owner.json'), JSON.stringify({ pid: process.pid, at: now() }) + '\n', { flag: 'wx' });
      return { tookOverFrom: null };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const owner = await readJson(join(MUTEX, 'owner.json'));
    const held = await stat(MUTEX).catch(() => null);
    const ageMs = held ? Date.now() - held.mtimeMs : Infinity;
    if (ageMs > staleMs && owner && !pidAlive(owner.pid)) {
      // Dead-owner takeover only: the old holder cannot be mid-write, and the
      // takeover is recorded instead of silently deleted.
      await rm(MUTEX, { recursive: true, force: true });
      await event({ type: 'mutex_takeover', deadOwner: owner, ageMs: Math.round(ageMs) });
      continue;
    }
    if (Date.now() - started > waitMs) return { busy: true, owner, ageMs: Math.round(ageMs) };
    await sleep(10 + Math.random() * 25);
  }
}
async function unlockMutex() { try { await rm(MUTEX, { recursive: true, force: true }); } catch {} }

async function acquire() {
  const lane = arg('--lane'), owner = arg('--owner');
  const pid = Number(arg('--pid', 0)) || null, ttlMinutes = Number(arg('--ttl-min', DEFAULT_TTL_MIN));
  if (!lane || !owner) stop(EXIT.badArgs, 'lane_and_owner_required');
  await mkdir(SLOTS, { recursive: true });
  const path = join(SLOTS, 'maker-' + safeName(lane) + '.json');
  const mutex = await lockMutex();
  if (mutex.busy) stop(EXIT.mutexBusy, 'slot_mutex_busy', { holder: mutex.owner ?? null });
  let failure = null;
  try {
    const held = await readJson(path);
    if (held) {
      const state = slotLive(held, ttlMinutes);
      if (state.live) failure = { code: EXIT.laneBusy, error: 'lane_slot_busy', extra: { holder: held, why: state.why } };
      else failure = { code: EXIT.staleNeedsRecovery, error: 'slot_stale_requires_recover', extra: { slot: held, why: state.why, ageMinutes: state.ageMinutes ?? null } };
    } else {
      const live = (await listSlots(ttlMinutes)).filter(s => s.live);
      if (live.length >= MAX_MAKER_SLOTS) failure = { code: EXIT.overLimit, error: 'maker_slot_limit_reached', extra: { limit: MAX_MAKER_SLOTS, live: live.map(s => ({ slot: s.name, owner: s.record.owner })) } };
      else {
        const record = { schema: 'coach-textbook-maker-slot/1', slot: 'maker-' + lane, lane, owner, pid, claimedAt: now(), heartbeatAt: now(), ttlMinutes };
        try { await writeFile(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); }
        catch (e) { if (e.code === 'EEXIST') failure = { code: EXIT.laneBusy, error: 'lane_slot_busy', extra: {} }; else throw e; }
        if (!failure) {
          await event({ type: 'acquire', slot: record.slot, owner, pid, lane });
          return { ok: true, action: 'acquire', slot: path, record };
        }
      }
    }
  } finally { await unlockMutex(); }
  stop(failure.code, failure.error, failure.extra);
}
async function heartbeat() {
  const slot = arg('--slot'), owner = arg('--owner');
  if (!slot || !owner) stop(EXIT.badArgs, 'slot_and_owner_required');
  const record = await readJson(slot);
  if (!record) stop(EXIT.ownerMismatch, 'slot_missing');
  if (record.owner !== owner) stop(EXIT.ownerMismatch, 'owner_mismatch', { holder: record.owner });
  record.heartbeatAt = now();
  await writeFile(slot, JSON.stringify(record, null, 2) + '\n');
  await event({ type: 'heartbeat', slot: record.slot, owner });
  return { ok: true, action: 'heartbeat', slot, record };
}
async function release() {
  const slot = arg('--slot'), owner = arg('--owner');
  if (!slot || !owner) stop(EXIT.badArgs, 'slot_and_owner_required');
  const record = await readJson(slot);
  if (!record) stop(EXIT.ownerMismatch, 'slot_missing');
  if (record.owner !== owner) stop(EXIT.ownerMismatch, 'owner_mismatch', { holder: record.owner });
  await unlink(slot);
  await event({ type: 'release', slot: record.slot, owner });
  return { ok: true, action: 'release', slot, released: record.slot };
}
async function recover() {
  const slot = arg('--slot'), evidence = arg('--evidence'), note = arg('--note', '');
  if (!slot || !evidence) stop(EXIT.badArgs, 'slot_and_evidence_required');
  const record = await readJson(slot);
  if (!record) stop(EXIT.ownerMismatch, 'slot_missing');
  const state = slotLive(record, DEFAULT_TTL_MIN);
  if (state.live) stop(EXIT.ownerLive, 'owner_still_live', { holder: record, why: state.why });
  let proof;
  try { proof = JSON.parse(await readFile(evidence, 'utf8')); }
  catch { stop(EXIT.badEvidence, 'evidence_unreadable', { evidence }); }
  if (!proof || proof.deadOwnerProof !== true || proof.subject !== record.owner) stop(EXIT.badEvidence, 'evidence_does_not_prove_dead_owner', { evidence, expectedSubject: record.owner });
  await mkdir(RECOVERIES, { recursive: true });
  const recordPath = join(RECOVERIES, record.slot + '.' + safeName(record.owner) + '.' + Date.now() + '.json');
  await writeFile(recordPath, JSON.stringify({ schema: 'coach-textbook-slot-recovery/1', recoveredAt: now(), note, evidence: { path: evidence, ...proof }, slotRecord: record, observed: state }, null, 2) + '\n', { flag: 'wx' });
  await unlink(slot);
  await event({ type: 'recover', slot: record.slot, owner: record.owner, evidence, recoveryRecord: recordPath });
  return { ok: true, action: 'recover', slot, recoveryRecord: recordPath, recoveredOwner: record.owner };
}
async function status() {
  const slots = (await listSlots()).map(s => ({ slot: s.name, owner: s.record.owner, lane: s.record.lane, pid: s.record.pid, live: s.live, why: s.why, claimedAt: s.record.claimedAt, heartbeatAt: s.record.heartbeatAt, ageMinutes: s.ageMinutes ?? null }));
  let names = [];
  try { names = (await readdir(CLAIMS)).filter(n => n.endsWith('.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const claims = [];
  for (const name of names.sort()) { const c = await readJson(join(CLAIMS, name)); if (c) claims.push(c); }
  return { ok: true, action: 'status', root: ROOT, maxMakerSlots: MAX_MAKER_SLOTS, liveMakers: slots.filter(s => s.live).length, slots, claims };
}
async function claim() {
  const chapter = arg('--chapter'), sha = arg('--candidate-sha'), lane = arg('--lane'), owner = arg('--owner'), slot = arg('--slot', null);
  if (!chapter || !sha || !owner) stop(EXIT.badArgs, 'chapter_candidate_sha_and_owner_required');
  await mkdir(CLAIMS, { recursive: true });
  const path = join(CLAIMS, safeName(chapter) + '.json');
  const existing = await readJson(path);
  if (existing) stop(EXIT.claimHeld, 'claim_held', { chapter, holder: existing });
  const record = { schema: 'coach-textbook-chapter-claim/1', chapterId: chapter, candidateSha256: sha, lane: lane ?? null, owner, slot, claimedAt: now() };
  try { await writeFile(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); }
  catch (e) { if (e.code === 'EEXIST') stop(EXIT.claimHeld, 'claim_held', { chapter }); throw e; }
  await event({ type: 'claim', chapter, candidateSha256: sha, lane, owner });
  return { ok: true, action: 'claim', claim: path, record };
}
async function unclaim() {
  const chapter = arg('--chapter'), owner = arg('--owner');
  if (!chapter || !owner) stop(EXIT.badArgs, 'chapter_and_owner_required');
  const path = join(CLAIMS, safeName(chapter) + '.json');
  const record = await readJson(path);
  if (!record) stop(EXIT.notClaimOwner, 'claim_missing', { chapter });
  if (record.owner !== owner) stop(EXIT.notClaimOwner, 'claim_owner_mismatch', { chapter, holder: record.owner });
  await unlink(path);
  await event({ type: 'unclaim', chapter, owner });
  return { ok: true, action: 'unclaim', chapter, released: record };
}
async function checkChapter() {
  const chapter = arg('--chapter'), owner = arg('--owner', null);
  if (!chapter) stop(EXIT.badArgs, 'chapter_required');
  const record = await readJson(join(CLAIMS, safeName(chapter) + '.json'));
  if (!record) return { ok: true, action: 'check-chapter', chapter, held: false };
  if (owner && record.owner === owner) return { ok: true, action: 'check-chapter', chapter, held: true, bySelf: true, record };
  stop(EXIT.claimHeld, 'chapter_claimed_by_other_lane_skip', { chapter, holder: record });
}

const actions = { acquire, heartbeat, release, recover, status, claim, unclaim, 'check-chapter': checkChapter };
const action = actions[cmd];
if (!action) { console.log(JSON.stringify({ ok: false, error: 'unknown_command', commands: Object.keys(actions) })); process.exit(EXIT.badArgs); }

const result = await action();
if (flag('--hold')) {
  // Normal-exit release: any shutdown path except a hard kill returns the slot.
  let done = false;
  const shutdown = async code => { if (done) return; done = true; try { await unlink(result.slot); await event({ type: 'release', slot: result.record?.slot, owner: result.record?.owner, reason: 'exit' }); } catch {} process.exit(code); };
  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGINT', () => shutdown(0));
  process.on('exit', () => { if (!done) { done = true; try { unlinkSync(result.slot); } catch {} } });
  console.log(JSON.stringify({ ...result, holding: true }));
  const holdMs = Number(arg('--hold-seconds', 60)) * 1000;
  setTimeout(() => shutdown(0), holdMs);
} else {
  console.log(JSON.stringify(result));
}
