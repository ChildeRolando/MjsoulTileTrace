import { describe, expect, it } from 'vitest';
// @ts-expect-error Offline CLI module intentionally remains JavaScript.
import { measure, submission } from './report.mjs';
// @ts-expect-error Offline CLI module intentionally remains JavaScript.
import { unrequestedReference } from './experiment.mjs';
import { ArenaLabelUnavailableReasonSchema } from '@riichi-coach/contracts';

describe('context RAG experiment accounting', () => {
  it('uses the existing unavailable-reference contract before any paid run', () => {
    expect(ArenaLabelUnavailableReasonSchema.parse(unrequestedReference.reason)).toBe('not_requested_in_scene_study');
    expect(ArenaLabelUnavailableReasonSchema.safeParse('not_requested_in_context_rag').success).toBe(false);
  });
  it('does not erase a timeout, invent zero usage, or call skipped retrieval a no-hit query', () => {
    const r = measure({ caseId: 'one', gameId: 'game', arm: 'combined', status: 'timeout', retrieval: [], result: { elapsedMs: 120000, providerUsage: { status: 'unknown', unreportedTurnCount: 1 }, events: [] } }, { required: [{ topic: 'efficiency', chapters: ['b01'] }], inapplicable: [] });
    expect(r).toMatchObject({ status: 'timeout', recall: 0, queries: 0, noHits: 0, tokens: null, usageStatus: 'unknown', unreportedTurns: 1 });
    const partial = measure({ retrieval: [], result: { events: [], providerUsage: { status: 'reported', tokens: { outputTokens: 12 } } } }, { required: [{ topic: 'efficiency', chapters: ['b01'] }], inapplicable: [] });
    expect(partial.usageStatus).toBe('unknown');
    expect(partial.tokens.totalTokens).toBeUndefined();
  });
  it('counts deduplicated parents, not sibling chunks, and checks cited refs were actually returned', () => {
    const run = { caseId: 'one', gameId: 'game', arm: 'baseline', status: 'completed', sourceMap: { returned: 'b01' },
      retrieval: [1, 2].map(() => ({ cardIds: ['b01'], result: { sourceRefs: ['returned'], passages: [{ content: '全文条件和例外' }] } })),
      result: { events: [{ type: 'submission_locked', submission: { rationale: '讲解', sourceRefs: ['returned', 'unread'] } }], providerUsage: { status: 'reported', tokens: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, totalTokens: 110 } }, elapsedMs: 10 } };
    const m = measure(run, { required: [{ topic: 'efficiency', chapters: ['b01'] }, { topic: 'placement', chapters: ['a19'] }], inapplicable: ['b01'] });
    expect(m).toMatchObject({ covered: 1, required: 2, recall: 0.5, invalidSourceRefs: ['unread'], cardIds: ['b01'], inapplicable: ['b01'] });
    expect(m.tokens.totalTokens).toBe(110);
    expect(submission(run).rationale).toBe('讲解');
  });
});
