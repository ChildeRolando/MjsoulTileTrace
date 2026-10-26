const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import {
  SELF_RAG_STUDY_LIMITATIONS,
  buildReasonReviewRequest,
  computeStudyReport,
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

function runRecord({ caseId, arm, attempt = 1, deliveredRefs, candidateRefs, submissionRefs, gate, usage, status = 'completed', failureCode = null }) {
  return {
    schemaVersion: 'selfrag-study-run/v1', caseId, arm, phase: 'evaluation', attempt,
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
  const entries = [
    { caseId: CASE_1, sourceRef: 'r1', verdict: 'irrelevant', reason: '该片段要求门清，但自手已有副露。', basis: 'declared-condition-not-met' },
    { caseId: CASE_2, sourceRef: 'r2', verdict: 'irrelevant', reason: '该片段针对终盘，但本手剩余牌数充足。', basis: 'context-mismatch' },
  ];
  const request = buildReasonReviewRequest({ entries });
  assert.equal(request.messages[0].role, 'system');
  assert.match(request.messages[0].content, /untrusted data/u);
  assert.equal(request.tools[0].function.name, 'submit_reason_audit');
  assert.equal(JSON.parse(request.messages[1].content).entries.length, 2);
  assert.throws(() => buildReasonReviewRequest({ entries: [] }), /reason_review_invalid/u);

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
