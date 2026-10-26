const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import {
  SELF_RAG_STUDY_LIMITATIONS,
  buildReasonAuditRequests,
  buildReasonEntries,
  buildReasonReviewRequest,
  computeStudyReport,
  deriveStudyPhases,
  renderStudyReportMarkdown,
  validateReasonReview,
} from './report.mjs';
import { fixtureObservation, opaqueRef } from './fixtures/study.mjs';

const CASE_1 = 'study-case-01';
const CASE_2 = 'study-case-02';

function fixtureCase(caseId, verdicts) {
  const observation = fixtureObservation(caseId, 'SL1');
  const passages = verdicts.map((verdict, index) => ({
    sourceRef: opaqueRef('arena-ref:v1:', `${caseId}:passage:${index}`),
    sourceTitle: `来源 ${index}`,
    documentLocation: '',
    content: `片段 ${index}`,
    applicableWhen: ['general-discard-choice'],
    corpusVersion: 'v1',
    retrieverVersion: 'arena-local-terms/v1',
  }));
  const sourceRefs = passages.map((passage) => passage.sourceRef);
  return {
    observation,
    candidateResult: {
      caseRef: observation.caseRef, mode: 'local', status: 'hits', passages, sourceRefs,
      retrieval: { query: 'q', context: null, filter: null, limit: 5, resultRefs: sourceRefs },
      corpusVersion: 'v1', retrieverVersion: 'arena-local-terms/v1',
    },
    prejudge: { verdicts: verdicts.map((verdict, index) => ({ sourceRef: sourceRefs[index], verdict, reason: `理由 ${index}` })) },
    refs: sourceRefs,
  };
}

function runRecord({ caseId, arm, attempt = 1, deliveredRefs, candidateRefs, submissionRefs, gate, usage, status = 'completed', failureCode = null, phase = 'evaluation' }) {
  return {
    schemaVersion: 'selfrag-study-run/v1', caseId, arm, phase, attempt,
    status, failureCode,
    elapsedMs: 100,
    delivered: { sourceRefs: deliveredRefs, passages: [], droppedSourceRefs: candidateRefs.filter((ref) => !deliveredRefs.includes(ref)) },
    candidateSourceRefs: candidateRefs,
    gate: gate ?? null,
    usage: usage ?? { generator: { status: 'reported', tokens: { inputTokens: 100, outputTokens: 20 } }, selector: null, combined: { status: 'reported', tokens: { inputTokens: 100, outputTokens: 20 } } },
    submission: submissionRefs === null ? null : { sourceRefs: submissionRefs, actionRef: 'a', rationale: 'r', uncertainty: 'u', caseRef: 'c' },
  };
}

function fixtureInput() {
  const one = fixtureCase(CASE_1, ['irrelevant', 'useful']);
  const two = fixtureCase(CASE_2, ['irrelevant', 'uncertain']);
  const candidatesByCase = { [CASE_1]: { result: one.candidateResult }, [CASE_2]: { result: two.candidateResult } };
  const prejudgeByCase = { [CASE_1]: one.prejudge, [CASE_2]: two.prejudge };
  const runs = [
    runRecord({ caseId: CASE_1, arm: 'baseline', deliveredRefs: one.refs, candidateRefs: one.refs,
      submissionRefs: [one.refs[0], 'arena-ref:v1:00000000-0000-4000-8000-000000000000'] }),
    runRecord({ caseId: CASE_1, arm: 'selfrag', deliveredRefs: [one.refs[1]], candidateRefs: one.refs, submissionRefs: [one.refs[1]],
      gate: {
        status: 'applied', failureCode: null, elapsedMs: 5, usage: { inputTokens: 50, outputTokens: 10 },
        retention: { candidateCount: 2, retainedCount: 1, droppedCount: 1 },
        receipt: { verdicts: [
          { sourceRef: one.refs[0], verdict: 'irrelevant', effectiveVerdict: 'irrelevant', basis: 'declared-condition-not-met', downgradeReason: null },
          { sourceRef: one.refs[1], verdict: 'relevant', effectiveVerdict: 'relevant', basis: undefined, downgradeReason: null },
        ] },
      },
      usage: { generator: { status: 'reported', tokens: { inputTokens: 100, outputTokens: 20 } }, selector: { status: 'reported', tokens: { inputTokens: 50, outputTokens: 10 } }, combined: { status: 'reported', tokens: { inputTokens: 150, outputTokens: 30 } } } }),
    runRecord({ caseId: CASE_2, arm: 'baseline', deliveredRefs: two.refs, candidateRefs: two.refs, submissionRefs: [] }),
    runRecord({ caseId: CASE_2, arm: 'selfrag', deliveredRefs: two.refs, candidateRefs: two.refs, submissionRefs: [two.refs[1]],
      gate: {
        status: 'degraded', failureCode: 'invalid_response', elapsedMs: 5, usage: null,
        retention: { candidateCount: 2, retainedCount: 2, droppedCount: 0 },
        receipt: { verdicts: [
          { sourceRef: two.refs[0], verdict: 'irrelevant', effectiveVerdict: 'uncertain', basis: 'declared-condition-not-met', downgradeReason: 'complete-visibility-condition-satisfied' },
        ] },
      },
      usage: { generator: { status: 'reported', tokens: { inputTokens: 100, outputTokens: 20 } }, selector: { status: 'unknown' }, combined: { status: 'unknown', reportedPartial: { inputTokens: 100, outputTokens: 20 } } } }),
  ];
  const attempts = runs.flatMap((run) => [
    { caseId: run.caseId, arm: run.arm, attempt: run.attempt, status: 'claimed' },
    { caseId: run.caseId, arm: run.arm, attempt: run.attempt, status: run.status },
  ]);
  return { caseIds: [CASE_1, CASE_2], candidatesByCase, prejudgeByCase, runs, attempts, createdAt: 'T' };
}

test('the paired report computes every required metric without hiding unknown usage', () => {
  const report = computeStudyReport(fixtureInput());
  assert.equal(report.cases.length, 2);
  assert.equal(report.arms.selfrag.droppedPassageCount, 1);
  assert.equal(report.arms.selfrag.irrelevantDroppedCount, 1);
  assert.equal(report.arms.selfrag.dropPrecision, 1);
  assert.equal(report.arms.baseline.dropPrecision, null);
  assert.equal(report.arms.baseline.dropPrecisionNotApplicable, 'no_filtering_in_baseline');
  assert.equal(report.arms.selfrag.usefulCandidateCount, 1);
  assert.equal(report.arms.selfrag.usefulDropRate, 0);
  assert.deepEqual(report.arms.selfrag.uncertainRetention, { retained: 1, total: 1, rate: 1 });
  assert.deepEqual(report.arms.baseline.citation, { references: 2, outOfDelivery: 1, toIrrelevant: 1 });
  assert.deepEqual(report.arms.selfrag.citation, { references: 2, outOfDelivery: 0, toIrrelevant: 0 });

  assert.equal(report.arms.selfrag.deliveredPassageCount, 3);
  // The degraded case-2 batch still delivers its prejudged-irrelevant passage.
  assert.equal(report.arms.selfrag.irrelevantDeliveredCount, 1);
  assert.deepEqual(report.cases[0].delta.irrelevantDelivered, -1);
  assert.equal(report.cases[0].delta.deliveredPassages, -1);
  assert.equal(report.cases[1].delta.deliveredPassages, 0);

  // Generator and selector usage stay separate and are never zero-filled.
  assert.deepEqual(report.arms.selfrag.usage.generator, { reportedRuns: 2, unknownRuns: 0, partialRuns: 0, tokens: { inputTokens: 200, outputTokens: 40 } });
  assert.deepEqual(report.arms.selfrag.usage.selector, { reportedRuns: 1, unknownRuns: 1, partialRuns: 0, tokens: { inputTokens: 50, outputTokens: 10 } });
  assert.deepEqual(report.arms.selfrag.usage.combined, { reportedRuns: 1, unknownRuns: 0, partialRuns: 1, tokens: { inputTokens: 250, outputTokens: 50 } });
  assert.deepEqual(report.arms.baseline.usage.selector, { reportedRuns: 0, unknownRuns: 0, partialRuns: 0, tokens: { inputTokens: 0, outputTokens: 0 } });

  assert.deepEqual(report.channels.semanticDrops, { 'declared-condition-not-met': 1, 'visible-fact-mismatch': 0, 'context-mismatch': 0 });
  assert.equal(report.channels.degradedBatchCount, 1);
  assert.equal(report.channels.downgradedVerdictCount, 1);
  assert.equal(report.channels.mechanicalSpecialCaseRetentions, 1);
  assert.equal(report.channels.mechanicalSpecialCaseDrops, 0);
  // Prejudge usage is its own scope, and an unreported judge is unknown, not zero.
  assert.deepEqual(report.preparation.prejudge, { reportedRuns: 0, unknownRuns: 2, partialRuns: 0, tokens: { inputTokens: 0, outputTokens: 0 } });
  assert.equal(report.preparation.caseCount, 2);
  assert.equal(report.reasonReview.status, 'not_run');
  assert.equal(report.prejudgedIrrelevantTotal, 2);
  assert.equal(report.conclusion.some((line) => line.includes('不能') || line.includes('未能检验')), false);

  const markdown = renderStudyReportMarkdown(report);
  assert.match(markdown, /未运行理由判读/u);
  for (const limitation of SELF_RAG_STUDY_LIMITATIONS) assert.equal(markdown.includes(limitation), true);
  assert.match(markdown, /drop precision/u);
  assert.match(markdown, /准备阶段用量/u);
  assert.match(markdown, /selector/u);
});

test('stored usage is validated field by field instead of summed into NaN', () => {
  const input = fixtureInput();
  // A run that reports only one field keeps that amount and no complete total.
  input.runs[0].usage = {
    generator: { status: 'unknown', reportedPartial: { inputTokens: 12 }, missing: ['outputTokens'] },
    selector: null,
    combined: { status: 'unknown', reportedPartial: { inputTokens: 12 }, missing: ['outputTokens'] },
  };
  // A label alone cannot make an incomplete or illegal total count as reported.
  input.runs[2].usage = {
    generator: { status: 'reported', tokens: { inputTokens: 7 } },
    selector: null,
    combined: { status: 'reported', tokens: { inputTokens: 7, outputTokens: '20' } },
  };
  const report = computeStudyReport(input);
  assert.deepEqual(report.arms.baseline.usage.generator,
    { reportedRuns: 0, unknownRuns: 0, partialRuns: 2, tokens: { inputTokens: 19, outputTokens: 0 } });
  assert.deepEqual(report.arms.baseline.usage.combined,
    { reportedRuns: 0, unknownRuns: 0, partialRuns: 2, tokens: { inputTokens: 19, outputTokens: 0 } });
  // A paired token delta needs both arms complete; otherwise it stays unstated.
  assert.equal(report.cases[0].delta.generatorTokens, null);

  const serialized = JSON.parse(JSON.stringify(report));
  for (const arm of ['baseline', 'selfrag']) {
    for (const scope of ['generator', 'selector', 'combined']) {
      for (const value of Object.values(serialized.arms[arm].usage[scope].tokens)) {
        assert.equal(Number.isInteger(value), true, `${arm}/${scope}`);
      }
    }
  }
  assert.match(report.digest, /^[0-9a-f]{64}$/u);
  assert.equal(renderStudyReportMarkdown(report).includes('NaN'), false);
});

test('prejudge usage with missing or illegal fields counts as partial, never zero-filled', () => {
  const input = fixtureInput();
  input.prejudgeByCase[CASE_1].usage = { inputTokens: 5 };
  input.prejudgeByCase[CASE_2].usage = { inputTokens: -1, outputTokens: 2 };
  const partial = computeStudyReport(input);
  assert.deepEqual(partial.preparation.prejudge,
    { reportedRuns: 0, unknownRuns: 0, partialRuns: 2, tokens: { inputTokens: 5, outputTokens: 2 } });

  input.prejudgeByCase[CASE_1].usage = { inputTokens: 5, outputTokens: 3 };
  input.prejudgeByCase[CASE_2].usage = { inputTokens: 7, outputTokens: 1 };
  const reported = computeStudyReport(input);
  assert.deepEqual(reported.preparation.prejudge,
    { reportedRuns: 2, unknownRuns: 0, partialRuns: 0, tokens: { inputTokens: 12, outputTokens: 4 } });
});

test('a batch whose drops are all mechanical is declared unable to test semantic filtering', () => {
  const input = fixtureInput();
  const selfrag = input.runs.find((run) => run.caseId === CASE_1 && run.arm === 'selfrag');
  selfrag.gate.receipt.verdicts[0].basis = 'complete-visibility-only';
  const report = computeStudyReport(input);
  assert.equal(report.channels.mechanicalSpecialCaseDrops, 1);
  assert.equal(report.channels.semanticDropTotal, 0);
  assert.equal(report.conclusion.some((line) => line.includes('未能检验语义过滤效果')), true);
  assert.match(renderStudyReportMarkdown(report), /未能检验语义过滤效果/u);
});

test('a selector that degrades on the majority of runs is declared unable to test filtering', () => {
  const input = fixtureInput();
  for (const run of input.runs.filter((entry) => entry.arm === 'selfrag')) run.gate.status = 'degraded';
  const report = computeStudyReport(input);
  assert.equal(report.channels.degradedBatchCount, 2);
  assert.equal(report.conclusion.some((line) => line.includes('多数反思批次降级')), true);
});

test('missing attempts are counted as interrupted and not silently dropped', () => {
  const input = fixtureInput();
  input.attempts = input.attempts.filter((entry) => !(entry.caseId === CASE_2 && entry.arm === 'selfrag'));
  input.runs = input.runs.filter((run) => !(run.caseId === CASE_2 && run.arm === 'selfrag'));
  input.attempts.push({ caseId: CASE_2, arm: 'selfrag', attempt: 1, status: 'claimed' });
  const report = computeStudyReport(input);
  assert.equal(report.arms.selfrag.interrupted, 1);
  assert.equal(report.cases[1].arms.selfrag.status, 'claimed');
  assert.equal(report.cases[1].arms.selfrag.deliveredCount, null);
});

test('the reason audit is a separate frozen prompt with full coverage validation', () => {
  const entries = [CASE_1, CASE_2].map((caseId, index) => ({
    caseId,
    sourceRef: `r${index + 1}`,
    claim: {
      verdict: 'irrelevant',
      reason: index === 0 ? '该片段要求门清，但自手已有副露。' : '该片段针对终盘，但本手剩余牌数充足。',
      basis: index === 0 ? 'declared-condition-not-met' : 'context-mismatch',
      premises: [{ kind: 'fact', path: 'visibleState.remainingDraws', observedValue: 60 }],
    },
    source: {
      sourceTitle: `来源 ${index}`,
      documentLocation: '',
      content: `片段 ${index}`,
      applicableWhen: ['general-discard-choice'],
    },
    visibleContext: { decision: { selfActor: 0, windowKind: 'self_turn' }, visibleState: { remainingDraws: 60 }, candidates: [] },
  }));
  const request = buildReasonReviewRequest({ entries });
  assert.equal(request.messages[0].role, 'system');
  assert.match(request.messages[0].content, /untrusted claim/u);
  assert.match(request.messages[0].content, /hidden labels/u);
  assert.equal(request.tools[0].function.name, 'submit_reason_audit');
  assert.equal(JSON.parse(request.messages[1].content).entries.length, 2);
  assert.throws(() => buildReasonReviewRequest({ entries: [] }), /reason_review_invalid/u);
  // A claim without its frozen source and blind context cannot be audited.
  assert.throws(() => buildReasonReviewRequest({ entries: [{ ...entries[0], source: undefined }] }), /study_report_invalid/u);
  assert.throws(() => buildReasonReviewRequest({ entries: [{ ...entries[0], visibleContext: undefined }] }), /study_report_invalid/u);

  assert.deepEqual(validateReasonReview({
    entries,
    verdicts: [
      { index: 0, verdict: 'supported', reason: '条件冲突可核对。' },
      { index: 1, verdict: 'undetermined', reason: '语境描述不充分。' },
    ],
  }), { supported: 1, unsupported: 0, undetermined: 1 });
  assert.throws(() => validateReasonReview({ entries, verdicts: [{ index: 0, verdict: 'supported', reason: '条件冲突可核对。' }] }), /reason_review_invalid/u);
  assert.throws(() => validateReasonReview({ entries, verdicts: [
    { index: 0, verdict: 'supported', reason: '条件冲突可核对。' },
    { index: 0, verdict: 'supported', reason: '条件冲突可核对。' },
  ] }), /reason_review_invalid/u);
  assert.throws(() => validateReasonReview({ entries, verdicts: [
    { index: 0, verdict: 'maybe', reason: '条件冲突可核对。' },
    { index: 1, verdict: 'supported', reason: '条件冲突可核对。' },
  ] }), /reason_review_invalid/u);

  const report = computeStudyReport({ ...fixtureInput(), reasonReview: { counts: { supported: 1, unsupported: 0, undetermined: 1 } } });
  assert.equal(report.reasonReview.status, 'run');
  assert.match(renderStudyReportMarkdown(report), /成立.*不成立.*无法判断/u);
});

const PILOT_1 = 'study-case-pilot-01';

function reasonGate(refs, { droppedIndex, basis = 'declared-condition-not-met', reason = '该片段要求门清，但自手已有副露。' }) {
  return {
    status: 'applied', failureCode: null, elapsedMs: 5, usage: { inputTokens: 50, outputTokens: 10 },
    retention: {
      candidateCount: refs.length,
      retainedCount: refs.length - 1,
      droppedCount: 1,
    },
    receipt: { verdicts: refs.map((ref, index) => (index === droppedIndex
      ? { sourceRef: ref, verdict: 'irrelevant', effectiveVerdict: 'irrelevant', reason, basis, premises: [{ kind: 'fact', path: 'visibleState.self.meldRefs', observedValue: [] }], downgradeReason: null }
      : { sourceRef: ref, verdict: 'relevant', effectiveVerdict: 'relevant', reason: '材料适用。', premises: [], downgradeReason: null })) },
  };
}

function keepEverythingGate(refs) {
  return {
    status: 'applied', failureCode: null, elapsedMs: 4, usage: { inputTokens: 40, outputTokens: 8 },
    retention: { candidateCount: refs.length, retainedCount: refs.length, droppedCount: 0 },
    receipt: { verdicts: refs.map((ref) => ({ sourceRef: ref, verdict: 'relevant', effectiveVerdict: 'relevant', reason: '材料适用。', premises: [], downgradeReason: null })) },
  };
}

function evaluationAndPilotInput() {
  const pilot = fixtureCase(PILOT_1, ['irrelevant', 'useful']);
  const evalOne = fixtureCase(CASE_1, ['irrelevant', 'useful']);
  const evalTwo = fixtureCase(CASE_2, ['irrelevant', 'uncertain']);
  const candidatesByCase = {
    [PILOT_1]: { result: pilot.candidateResult },
    [CASE_1]: { result: evalOne.candidateResult },
    [CASE_2]: { result: evalTwo.candidateResult },
  };
  const prejudgeByCase = {
    [PILOT_1]: pilot.prejudge,
    [CASE_1]: evalOne.prejudge,
    [CASE_2]: evalTwo.prejudge,
  };
  const runs = [
    runRecord({ caseId: PILOT_1, arm: 'baseline', phase: 'pilot', deliveredRefs: pilot.refs, candidateRefs: pilot.refs, submissionRefs: [] }),
    runRecord({
      caseId: PILOT_1, arm: 'selfrag', phase: 'pilot', deliveredRefs: [pilot.refs[1]], candidateRefs: pilot.refs, submissionRefs: [pilot.refs[1]],
      gate: reasonGate(pilot.refs, { droppedIndex: 0 }),
    }),
    runRecord({ caseId: CASE_1, arm: 'baseline', deliveredRefs: evalOne.refs, candidateRefs: evalOne.refs, submissionRefs: [] }),
    runRecord({ caseId: CASE_1, arm: 'selfrag', deliveredRefs: evalOne.refs, candidateRefs: evalOne.refs, submissionRefs: [evalOne.refs[1]], gate: keepEverythingGate(evalOne.refs) }),
    runRecord({ caseId: CASE_2, arm: 'baseline', deliveredRefs: evalTwo.refs, candidateRefs: evalTwo.refs, submissionRefs: [] }),
    runRecord({ caseId: CASE_2, arm: 'selfrag', deliveredRefs: evalTwo.refs, candidateRefs: evalTwo.refs, submissionRefs: [], gate: keepEverythingGate(evalTwo.refs) }),
  ];
  const attempts = runs.flatMap((run) => [
    { caseId: run.caseId, arm: run.arm, attempt: run.attempt, status: 'claimed', phase: run.phase },
    { caseId: run.caseId, arm: run.arm, attempt: run.attempt, status: run.status, phase: run.phase },
  ]);
  return {
    caseIds: [CASE_1, CASE_2], pilotCaseIds: [PILOT_1], allCaseIds: [PILOT_1, CASE_1, CASE_2],
    candidatesByCase, prejudgeByCase, runs, attempts, createdAt: 'T',
    observationsByCase: {
      [PILOT_1]: { observation: pilot.observation },
      [CASE_1]: { observation: evalOne.observation },
      [CASE_2]: { observation: evalTwo.observation },
    },
  };
}

test('phase membership comes from the frozen sampling, never from the run label alone', () => {
  const phases = deriveStudyPhases({
    sampling: { selected: [{ caseId: PILOT_1, phase: 'pilot' }, { caseId: CASE_1, phase: 'evaluation' }, { caseId: CASE_2, phase: 'evaluation' }] },
    caseIds: [CASE_1, CASE_2],
  });
  assert.deepEqual(phases, { pilotCaseIds: [PILOT_1], evaluationCaseIds: [CASE_1, CASE_2] });
  assert.throws(() => deriveStudyPhases({ sampling: { selected: [] } }), /study_report_invalid/u);
  assert.throws(() => deriveStudyPhases({ sampling: { selected: [{ caseId: PILOT_1, phase: 'warmup' }] } }), /study_report_invalid/u);
  assert.throws(() => deriveStudyPhases({
    sampling: { selected: [{ caseId: CASE_1, phase: 'evaluation' }] }, caseIds: [CASE_2],
  }), /study_report_invalid/u);
  // A batch with no evaluation case cannot produce a quality conclusion.
  assert.throws(() => deriveStudyPhases({ sampling: { selected: [{ caseId: PILOT_1, phase: 'pilot' }] } }), /study_report_invalid/u);
});

test('pilot drops never enter evaluation quality, channels or the conclusion', () => {
  const input = evaluationAndPilotInput();
  const report = computeStudyReport(input);

  assert.deepEqual(report.caseIds, [CASE_1, CASE_2]);
  assert.equal(report.cases.length, 2);
  // The only semantic drop in the run set belongs to the pilot.
  assert.equal(report.channels.semanticDropTotal, 0);
  assert.equal(report.channels.totalDropVerification, 0);
  assert.match(report.conclusion.join('\n'), /未能检验语义过滤效果/u);
  assert.equal(report.conclusion.join('\n').includes('已产生语义剔除'), false);

  // The pilot is reported separately, as a lane status and its real cost.
  assert.deepEqual(report.pilot.caseIds, [PILOT_1]);
  assert.equal(report.pilot.channels.semanticDropTotal, 1);
  assert.equal(report.pilot.arms.selfrag.completed, 1);
  assert.deepEqual(report.pilot.arms.selfrag.usage.generator.tokens, { inputTokens: 100, outputTokens: 20 });
  assert.equal(report.pilot.qualityComparable, false);

  // Evaluation totals stay evaluation-only; operational totals keep the pilot.
  assert.deepEqual(report.arms.selfrag.usage.generator.tokens, { inputTokens: 200, outputTokens: 40 });
  assert.deepEqual(report.operational.arms.selfrag.usage.generator.tokens, { inputTokens: 300, outputTokens: 60 });
  assert.equal(report.operational.arms.selfrag.completed, 3);
  assert.equal(report.operational.qualityComparable, false);
  assert.deepEqual(report.operational.caseIds, [PILOT_1, CASE_1, CASE_2]);
  assert.equal(report.operational.unattributedRunCount, 0);

  const markdown = renderStudyReportMarkdown(report);
  assert.match(markdown, /Pilot/u);
  assert.match(markdown, /全部尝试成本/u);
  assert.match(markdown, /未能检验语义过滤效果/u);
});

test('a rerun pilot attempt is kept in the operational totals and never moves evaluation', () => {
  const input = evaluationAndPilotInput();
  const pilot = fixtureCase(PILOT_1, ['irrelevant', 'useful']);
  input.runs.push(runRecord({
    caseId: PILOT_1, arm: 'selfrag', phase: 'pilot', attempt: 2, status: 'failed', failureCode: 'selector_timeout',
    deliveredRefs: [], candidateRefs: pilot.refs, submissionRefs: null,
    usage: { generator: { status: 'unknown' }, selector: { status: 'unknown' }, combined: { status: 'unknown' } },
  }));
  input.attempts.push(
    { caseId: PILOT_1, arm: 'selfrag', attempt: 1, status: 'completed', phase: 'pilot' },
    { caseId: PILOT_1, arm: 'selfrag', attempt: 2, status: 'claimed', phase: 'pilot' },
    { caseId: PILOT_1, arm: 'selfrag', attempt: 2, status: 'failed', phase: 'pilot' },
  );
  const report = computeStudyReport(input);
  assert.equal(report.pilot.arms.selfrag.attempts, 2);
  assert.equal(report.operational.arms.selfrag.attempts, 4);
  assert.equal(report.operational.arms.selfrag.failureCodes.selector_timeout, 1);
  assert.deepEqual(report.arms.selfrag.failureCodes, {});
  assert.equal(report.arms.selfrag.attempts, 2);
});

test('preparation keeps every prejudge call, its failure and its unknown usage', () => {
  const input = fixtureInput();
  input.prejudgeAttempts = [
    { schemaVersion: 'selfrag-study-prejudge-attempt/v1', callId: 'study-case-01#1', caseId: CASE_1, status: 'claimed' },
    { schemaVersion: 'selfrag-study-prejudge-attempt/v1', callId: 'study-case-01#1', caseId: CASE_1, status: 'completed', usage: { inputTokens: 10, outputTokens: 5 }, elapsedMs: 7 },
    { schemaVersion: 'selfrag-study-prejudge-attempt/v1', callId: 'study-case-02#1', caseId: CASE_2, status: 'claimed' },
    { schemaVersion: 'selfrag-study-prejudge-attempt/v1', callId: 'study-case-02#1', caseId: CASE_2, status: 'failed', usage: null, elapsedMs: 3, failureCode: 'prejudge_provider_failed' },
  ];
  const report = computeStudyReport(input);
  assert.equal(report.preparation.calls.claimed, 2);
  assert.equal(report.preparation.calls.settled, 2);
  assert.equal(report.preparation.calls.completed, 1);
  assert.equal(report.preparation.calls.failed, 1);
  assert.equal(report.preparation.calls.unsettled, 0);
  assert.deepEqual(report.preparation.calls.usage, {
    reportedCalls: 1, partialCalls: 0, unknownCalls: 1, tokens: { inputTokens: 10, outputTokens: 5 },
  });
  assert.equal(report.preparation.calls.failureCodes.prejudge_provider_failed, 1);
  assert.match(renderStudyReportMarkdown(report), /prejudge 调用/u);
});

test('reason audit entries bind the frozen passage and blind observation, not selector internals', () => {
  const input = evaluationAndPilotInput();
  const emptyAudit = buildReasonEntries({
    runs: input.runs,
    candidatesByCase: input.candidatesByCase,
    observationsByCase: input.observationsByCase,
    evaluationCaseIds: [CASE_1, CASE_2],
  });
  // Only the pilot has a drop, so an evaluation-only audit has nothing to judge.
  assert.deepEqual(emptyAudit, []);

  const withEvaluationDrop = evaluationAndPilotInput();
  const evalRefs = input.candidatesByCase[CASE_1].result.sourceRefs;
  withEvaluationDrop.runs = withEvaluationDrop.runs.map((run) => (run.caseId === CASE_1 && run.arm === 'selfrag'
    ? runRecord({
      caseId: CASE_1, arm: 'selfrag', deliveredRefs: [evalRefs[1]], candidateRefs: evalRefs,
      submissionRefs: [evalRefs[1]], gate: reasonGate(evalRefs, { droppedIndex: 0 }),
    })
    : run));
  const bound = buildReasonEntries({
    runs: withEvaluationDrop.runs,
    candidatesByCase: input.candidatesByCase,
    observationsByCase: input.observationsByCase,
    evaluationCaseIds: [CASE_1, CASE_2],
  });
  assert.equal(bound.length, 1);
  const entry = bound[0];
  assert.equal(entry.caseId, CASE_1);
  assert.equal(entry.sourceRef, evalRefs[0]);
  assert.equal(entry.source.content, input.candidatesByCase[CASE_1].result.passages[0].content);
  assert.deepEqual(entry.source.applicableWhen, ['general-discard-choice']);
  assert.equal(entry.source.sourceTitle, '来源 0');
  assert.equal(entry.visibleContext.decision.windowKind, 'self_turn');
  assert.equal(entry.visibleContext.visibleState.remainingDraws,
    input.observationsByCase[CASE_1].observation.visibleState.remainingDraws);
  assert.equal(entry.claim.reason, '该片段要求门清，但自手已有副露。');
  assert.equal(entry.claim.basis, 'declared-condition-not-met');
  assert.deepEqual(entry.claim.premises, [{ kind: 'fact', path: 'visibleState.self.meldRefs', observedValue: [] }]);
  // Selector process, retention bookkeeping and tool instructions stay out.
  const serialized = JSON.stringify(entry);
  for (const forbidden of ['downgradeReason', 'receipt', 'retention', 'supportedCapabilities']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }

  // Each entry gets its own fresh context carrying exactly one entry.
  const requests = buildReasonAuditRequests({ entries: [entry] });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].index, 0);
  const payload = JSON.parse(requests[0].request.messages[1].content);
  assert.equal(payload.entries.length, 1);
  assert.equal(payload.entries[0].sourceRef, entry.sourceRef);
  assert.match(requests[0].request.messages[0].content, /untrusted claim/u);

  // Opposite declared conditions with the same selector wording must not
  // produce the same judge payload.
  const otherEntries = buildReasonEntries({
    runs: [runRecord({
      caseId: CASE_2, arm: 'selfrag', deliveredRefs: [], candidateRefs: input.candidatesByCase[CASE_2].result.sourceRefs,
      submissionRefs: [], gate: reasonGate(input.candidatesByCase[CASE_2].result.sourceRefs, { droppedIndex: 0 }),
    })],
    candidatesByCase: input.candidatesByCase,
    observationsByCase: input.observationsByCase,
    evaluationCaseIds: [CASE_1, CASE_2],
  });
  assert.equal(otherEntries.length, 1);
  const firstPayload = JSON.stringify(buildReasonAuditRequests({ entries: [entry] })[0].request.messages[1]);
  const otherPayload = JSON.stringify(buildReasonAuditRequests({ entries: otherEntries })[0].request.messages[1]);
  assert.notEqual(firstPayload, otherPayload);

  // Missing and cross-case bindings are refused instead of guessed.
  assert.throws(() => buildReasonEntries({
    runs: [runRecord({
      caseId: CASE_1, arm: 'selfrag', deliveredRefs: [], candidateRefs: evalRefs,
      submissionRefs: [], gate: reasonGate(['arena-ref:v1:missing'], { droppedIndex: 0 }),
    })],
    candidatesByCase: input.candidatesByCase,
    observationsByCase: input.observationsByCase,
    evaluationCaseIds: [CASE_1, CASE_2],
  }), /reason_review_binding_missing/u);
  assert.throws(() => buildReasonEntries({
    runs: [runRecord({
      caseId: CASE_1, arm: 'selfrag', deliveredRefs: [], candidateRefs: evalRefs,
      submissionRefs: [], gate: reasonGate([input.candidatesByCase[CASE_2].result.sourceRefs[0]], { droppedIndex: 0 }),
    })],
    candidatesByCase: input.candidatesByCase,
    observationsByCase: input.observationsByCase,
    evaluationCaseIds: [CASE_1, CASE_2],
  }), /reason_review_cross_case/u);
  assert.throws(() => buildReasonEntries({
    runs: [runRecord({
      caseId: CASE_1, arm: 'selfrag', deliveredRefs: [], candidateRefs: evalRefs,
      submissionRefs: [], gate: reasonGate(evalRefs, { droppedIndex: 0 }),
    })],
    candidatesByCase: input.candidatesByCase,
    observationsByCase: { [CASE_2]: input.observationsByCase[CASE_2] },
    evaluationCaseIds: [CASE_1, CASE_2],
  }), /reason_review_binding_missing/u);
});

test('the reason audit counts its own cost and says not_applicable when evaluation dropped nothing', () => {
  const input = fixtureInput();
  input.reasonReview = {
    status: 'run',
    counts: { supported: 1, unsupported: 0, undetermined: 1 },
    calls: [
      { status: 'completed', usage: { inputTokens: 30, outputTokens: 9 }, elapsedMs: 5 },
      { status: 'failed', usage: null, elapsedMs: 2 },
    ],
  };
  const report = computeStudyReport(input);
  assert.equal(report.reasonReview.status, 'run');
  assert.equal(report.reasonReview.callCount, 2);
  assert.deepEqual(report.reasonReview.usage, {
    reportedCalls: 1, partialCalls: 0, unknownCalls: 1, tokens: { inputTokens: 30, outputTokens: 9 },
  });
  assert.match(renderStudyReportMarkdown(report), /成立.*不成立.*无法判断/u);
  assert.match(renderStudyReportMarkdown(report), /AI 判读，非专家真值/u);

  const none = computeStudyReport({ ...fixtureInput(), reasonReview: { status: 'not_applicable', calls: [] } });
  assert.equal(none.reasonReview.status, 'not_applicable');
  assert.equal(none.reasonReview.counts, null);
  assert.match(renderStudyReportMarkdown(none), /不适用/u);
  assert.equal(renderStudyReportMarkdown(none).includes('成立 | 不成立'), false);
});
