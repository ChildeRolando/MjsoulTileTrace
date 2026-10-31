const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertScheduleShape, buildSchedule, claimAttempt, planAttempt, readAttempts, settleAttempt,
} from './schedule.mjs';

const caseIds = Array.from({ length: 10 }, (_, index) => `study-case-${String(index + 1).padStart(2, '0')}`);

test('the run order is pre-declared as 10 cases x 2 arms with a stable digest', () => {
  const schedule = buildSchedule(caseIds);
  assert.equal(schedule.rows.length, 20);
  assert.deepEqual(schedule.rows.map((row) => row.ordinal), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(schedule.rows.slice(0, 2), [
    { ordinal: 1, caseId: 'study-case-01', arm: 'baseline' },
    { ordinal: 2, caseId: 'study-case-01', arm: 'selfrag' },
  ]);
  assert.deepEqual(schedule.rows.slice(18), [
    { ordinal: 19, caseId: 'study-case-10', arm: 'baseline' },
    { ordinal: 20, caseId: 'study-case-10', arm: 'selfrag' },
  ]);
  assert.equal(buildSchedule(caseIds).digest, schedule.digest);
  assert.throws(() => buildSchedule([...caseIds, caseIds[0]]), /study_schedule_invalid/u);
  assert.throws(() => buildSchedule([]), /study_schedule_invalid/u);
});

test('a changed schedule is refused rather than adjusted', () => {
  const schedule = buildSchedule(caseIds);
  assert.deepEqual(assertScheduleShape(schedule, caseIds), schedule);
  assert.throws(() => assertScheduleShape({ ...schedule, rows: schedule.rows.slice(1) }, caseIds), /study_schedule_mismatch/u);
  assert.throws(() => assertScheduleShape({ ...schedule, digest: '0'.repeat(64) }, caseIds), /study_schedule_mismatch/u);
  assert.throws(() => assertScheduleShape(schedule, caseIds.slice(1)), /study_schedule_mismatch/u);
});

test('a second run of the same case and arm is refused unless it is an explicit pilot rerun', () => {
  assert.deepEqual(planAttempt({ existing: [], caseId: 'study-case-01', arm: 'baseline' }),
    { caseId: 'study-case-01', arm: 'baseline', attempt: 1, pilotRerun: false, key: 'study-case-01/baseline/1' });
  const existing = [{ caseId: 'study-case-01', arm: 'baseline' }];
  assert.throws(() => planAttempt({ existing, caseId: 'study-case-01', arm: 'baseline' }), /study_attempt_duplicate/u);
  assert.deepEqual(planAttempt({ existing, caseId: 'study-case-01', arm: 'baseline', pilotRerun: true }),
    { caseId: 'study-case-01', arm: 'baseline', attempt: 2, pilotRerun: true, key: 'study-case-01/baseline/2' });
  assert.equal(planAttempt({ existing, caseId: 'study-case-02', arm: 'baseline' }).attempt, 1);
  assert.throws(() => planAttempt({ existing: [], caseId: 'study-case-01', arm: 'other' }), /study_attempt_invalid/u);
});

test('the attempts ledger is append-only and keeps failed or interrupted claims', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'selfrag-study-ledger-'));
  const ledgerPath = join(directory, 'attempts.jsonl');
  try {
    const first = await claimAttempt({ ledgerPath, caseId: 'study-case-01', arm: 'baseline', phase: 'pilot', claimedAt: 'T0' });
    assert.equal(first.status, 'claimed');
    assert.equal(first.attempt, 1);
    await assert.rejects(() => claimAttempt({ ledgerPath, caseId: 'study-case-01', arm: 'baseline', phase: 'pilot' }), /study_attempt_duplicate/u);

    await settleAttempt({
      ledgerPath, caseId: first.caseId, arm: first.arm, attempt: first.attempt, key: first.key,
      phase: 'pilot', status: 'failed', failureCode: 'provider_error', claimedAt: 'T0', settledAt: 'T1',
    });
    const entries = await readAttempts(ledgerPath);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((entry) => entry.status), ['claimed', 'failed']);
    assert.equal(entries[1].failureCode, 'provider_error');
    assert.match(await readFile(ledgerPath, 'utf8'), /T0/u);

    await assert.rejects(() => settleAttempt({
      ledgerPath, caseId: 'study-case-01', arm: 'baseline', attempt: 1, key: 'k', phase: 'pilot', status: 'retried', claimedAt: 'T0',
    }), /study_attempt_invalid/u);

    await appendFile(ledgerPath, '{broken\n', 'utf8');
    await assert.rejects(() => readAttempts(ledgerPath), /study_attempt_ledger_corrupt/u);

    // A claimed attempt never disappears just because the run did not finish.
    assert.deepEqual((await readAttempts(ledgerPath.replace('attempts.jsonl', 'none.jsonl'))), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
