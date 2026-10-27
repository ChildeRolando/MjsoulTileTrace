// Verification for parallel/slots.mjs. Runs against a throwaway root in tmp;
// every case drives the real CLI through real child processes, so the mutual
// exclusion and cap cases exercise actual concurrent file creation.
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const SCRIPT = new URL('./slots.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const NODE = process.execPath;
const root = await mkdtemp(join(tmpdir(), 'coach-parallel-slots-'));
const env = { ...process.env, COACH_PARALLEL_ROOT: root };
const cases = [];
const check = (name, ok, detail = {}) => { cases.push({ name, passed: !!ok, ...detail }); if (!ok) { console.error(JSON.stringify({ failed: name, ...detail })); process.exit(1); } };
const run = args => spawnSync(NODE, [SCRIPT, ...args], { encoding: 'utf8', env });
const status = () => JSON.parse(run(['status']).stdout);
const parse = text => { try { return JSON.parse(String(text).trim().split(String.fromCharCode(10)).at(-1)); } catch { return null; } };
const json = r => parse(r.stdout);

const liveMaker = () => status().slots.filter(s => s.live).map(s => s.slot).sort();

// 1. Concurrent acquisition across six lanes: exactly two survive, the rest are refused.
const race = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map(lane => new Promise(resolve => {
  const child = spawn(NODE, [SCRIPT, 'acquire', '--lane', lane, '--owner', 'race-' + lane], { env });
  let out = ''; child.stdout.on('data', d => { out += d; });
  child.on('close', code => resolve({ lane, code, out }));
})));
const winners = race.filter(r => r.code === 0).map(r => r.lane).sort();
const refused = race.filter(r => r.code === 3);
check('race-two-live-slots-only', winners.length === 2 && liveMaker().length === 2 && status().liveMakers === 2, { winners, live: liveMaker() });
check('race-over-limit-refused-with-limit-error', refused.length === 4 && refused.every(r => parse(r.out)?.error === 'maker_slot_limit_reached'), { refused: refused.map(r => ({ lane: r.lane, code: r.code, error: parse(r.out)?.error })) });

// 2. A third acquisition while two are live is refused on capacity.
const third = run(['acquire', '--lane', 'G', '--owner', 'third']);
check('third-acquire-refused', third.status === 3 && json(third)?.error === 'maker_slot_limit_reached', { exit: third.status, out: json(third) });

// 3. Same-lane re-entry is refused even below the cap.
for (const slot of status().slots.filter(s => s.live)) run(['release', '--slot', join(root, 'slots', slot.slot), '--owner', slot.owner]);
const laneA = run(['acquire', '--lane', 'A', '--owner', 'owner-a']);
const laneAPath = json(laneA).slot;
const dup = run(['acquire', '--lane', 'A', '--owner', 'owner-a2']);
check('lane-reentry-refused', laneA.status === 0 && dup.status === 2 && json(dup)?.error === 'lane_slot_busy', { first: laneA.status, second: dup.status });

// 4. Release is owner-only; a foreign owner cannot drop the record.
const foreign = run(['release', '--slot', laneAPath, '--owner', 'someone-else']);
const afterForeign = status().slots.filter(s => s.live).length;
check('foreign-release-refused', foreign.status === 5 && json(foreign)?.error === 'owner_mismatch' && afterForeign === 1, { exit: foreign.status, live: afterForeign });
const ownRelease = run(['release', '--slot', laneAPath, '--owner', 'owner-a']);
check('owner-release-frees-slot', ownRelease.status === 0 && liveMaker().length === 0, { exit: ownRelease.status });

// 5. Normal process exit releases the slot it holds.
const holder = spawn(NODE, [SCRIPT, 'acquire', '--lane', 'B', '--owner', 'exit-holder', '--hold', '--hold-seconds', '1'], { env });
await new Promise(resolve => holder.on('close', resolve));
const afterExit = liveMaker();
const events = (await readFile(join(root, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
check('exit-releases-slot', afterExit.length === 0 && events.some(e => e.type === 'release' && e.reason === 'exit' && e.owner === 'exit-holder'), { live: afterExit });

// 6. A slot whose owner process is gone is recoverable only with dead-owner evidence.
const dead = spawnSync(NODE, ['-e', 'process.exit(0)']);
const stale = run(['acquire', '--lane', 'C', '--owner', 'crashed-run', '--pid', String(dead.pid)]);
const stalePath = json(stale).slot;
const blocked = run(['acquire', '--lane', 'C', '--owner', 'new-run']);
check('stale-slot-blocks-until-recovered', stale.status === 0 && blocked.status === 4 && json(blocked)?.error === 'slot_stale_requires_recover', { stale: stale.status, retry: blocked.status });
const noEvidence = run(['recover', '--slot', stalePath, '--evidence', join(root, 'missing.json')]);
check('recover-without-evidence-refused', noEvidence.status === 9, { exit: noEvidence.status });
const wrongEvidence = join(root, 'wrong-evidence.json');
await writeFile(wrongEvidence, JSON.stringify({ deadOwnerProof: true, subject: 'another-owner' }));
const wrong = run(['recover', '--slot', stalePath, '--evidence', wrongEvidence]);
check('recover-with-wrong-subject-refused', wrong.status === 9 && json(wrong)?.error === 'evidence_does_not_prove_dead_owner', { exit: wrong.status });
const evidence = join(root, 'evidence.json');
await writeFile(evidence, JSON.stringify({ deadOwnerProof: true, subject: 'crashed-run', note: 'owner process exited; pid gone', pid: dead.pid }));
const recovered = run(['recover', '--slot', stalePath, '--evidence', evidence, '--note', 'verification']);
const recoveryFiles = await readdir(join(root, 'recoveries'));
const reacquired = run(['acquire', '--lane', 'C', '--owner', 'new-run']);
check('recover-with-evidence-frees-slot', recovered.status === 0 && recoveryFiles.length === 1 && reacquired.status === 0, { exit: recovered.status, recoveryFiles });
const liveRecover = run(['recover', '--slot', json(reacquired).slot, '--evidence', evidence]);
check('live-owner-recover-refused', liveRecover.status === 6 && json(liveRecover)?.error === 'owner_still_live', { exit: liveRecover.status });
run(['release', '--slot', json(reacquired).slot, '--owner', 'new-run']);

// 7. Chapter claims are exclusive and visible to the other lane.
const claim = run(['claim', '--chapter', 'chapter01-section001', '--candidate-sha', 'sha-line-b', '--lane', 'B', '--owner', 'line-b']);
const stolen = run(['claim', '--chapter', 'chapter01-section001', '--candidate-sha', 'sha-line-b', '--lane', 'A', '--owner', 'line-a']);
const skip = run(['check-chapter', '--chapter', 'chapter01-section001', '--owner', 'line-a']);
const selfCheck = run(['check-chapter', '--chapter', 'chapter01-section001', '--owner', 'line-b']);
const foreignUnclaim = run(['unclaim', '--chapter', 'chapter01-section001', '--owner', 'line-a']);
const unclaim = run(['unclaim', '--chapter', 'chapter01-section001', '--owner', 'line-b']);
check('claim-single-owner', claim.status === 0 && stolen.status === 7 && json(stolen)?.error === 'claim_held', { claim: claim.status, stolen: stolen.status });
check('a-skips-b-claim', skip.status === 7 && json(skip)?.error === 'chapter_claimed_by_other_lane_skip' && selfCheck.status === 0 && json(selfCheck)?.bySelf === true, { skip: skip.status, self: selfCheck.status });
check('claim-release-owner-only', foreignUnclaim.status === 8 && unclaim.status === 0 && status().claims.length === 0, { foreign: foreignUnclaim.status, own: unclaim.status });

const receipt = { schema: 'coach-textbook-parallel-slots-verification/1', verifiedAt: new Date().toISOString(), script: SCRIPT, root, cases, passed: cases.every(c => c.passed), caseCount: cases.length };
console.log(JSON.stringify(receipt, null, 2));
