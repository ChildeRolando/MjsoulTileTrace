import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArenaArchiveEvents, summarizeArenaArchive } from '@riichi-coach/desktop/blind-discard-arena-archive';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const arenaQuestionId = (manifest, selected) => digest([manifest.dataset.source.sourceRecordHash, selected.canonicalDecisionOrder, selected.candidateSetDigest, manifest.mortal]);
export const mistakeType = id => id === 'blind-discard-generated-v1' ? 'generated' : id === 'blind-discard-holdout-v1' ? 'holdout' : id === 'blind-discard-flat-v1' ? 'flat' : id === 'blind-discard-spatial-v1' ? 'spatial' : 'legacy';

// Derived from immutable archive records; never use run-local opaque caseRefs as question IDs.
export function collectArenaMistakes(archives, { type = 'all', model = 'all', rag = 'all', includeFaults = false } = {}) {
  const questions = new Map();
  const models = new Set();
  let runCount = 0, excludedFaultRuns = 0;
  for (const { manifest: m, events } of archives) {
    models.add(m.coach.model);
    if (!includeFaults && m.controlledFault !== 'none') { excludedFaultRuns++; continue; }
    const experimentType = mistakeType(m.dataset.id);
    if (type !== 'all' && type !== experimentType || model !== 'all' && model !== m.coach.model || rag !== 'all' && rag !== m.rag.mode) continue;
    runCount++;
    for (const event of events.filter(e => e.type === 'case_run')) {
      const selected = m.dataset.selected[event.caseOrdinal];
      const result = event.result;
      if (!selected) continue;
      const id = arenaQuestionId(m, selected);
      let question = questions.get(id);
      if (!question) {
        question = { id, sourceRecordHash: m.dataset.source.sourceRecordHash, canonicalDecisionOrder: selected.canonicalDecisionOrder,
          candidateSetDigest: selected.candidateSetDigest, types: [], attempts: 0, scored: 0, matched: 0, errors: 0,
          executionFailures: 0, missingLabels: 0, snapshots: [], history: [], preview: null, latestErrorAt: null };
        questions.set(id, question);
      }
      if (!question.types.includes(experimentType)) question.types.push(experimentType);
      question.attempts++;
      const score = result.score.cases[0];
      const observation = result.events.find(e => e.type === 'run_started')?.observation;
      const at = result.endedAt ?? event.recordedAt;
      const snapshot = { runId: m.runId, caseOrdinal: event.caseOrdinal, at, datasetId: m.dataset.id,
        model: m.coach.model, reasoningEffort: m.coach.reasoningEffort ?? null, providerId: m.coach.providerId,
        ragMode: m.rag.mode, promptVersion: m.coach.promptVersion, codeSha: m.codeSha,
        controlledFault: m.controlledFault, experimentType, actionRef: result.attempt.submission?.actionRef ?? null,
        toolFailureCount: result.toolFailureCount, hasObservation: Boolean(observation), status: result.status, scoreStatus: score?.status ?? 'unscorable' };
      question.history.push(snapshot);
      if (result.status !== 'completed') { question.executionFailures++; continue; }
      if (!['matched', 'not_matched'].includes(score?.status)) { question.missingLabels++; continue; }
      question.scored++;
      if (score.status === 'matched') { question.matched++; continue; }
      question.errors++;
      if (!question.preview && observation) {
        const s = observation.visibleState;
        question.preview = { roundWind: s.roundWind, hand: s.hand, honba: s.honba,
          concealedTiles: s.self.concealedTiles, currentDraw: s.self.currentDraw?.tile ?? null };
      }
      if (!question.latestErrorAt || at > question.latestErrorAt) question.latestErrorAt = at;
      question.snapshots.push(snapshot);
    }
  }
  const rows = [...questions.values()].filter(q => q.errors > 0);
  for (const q of rows) {
    q.errorRate = q.scored ? q.errors / q.scored : null;
    q.snapshots.sort((a, b) => b.at.localeCompare(a.at) || a.runId.localeCompare(b.runId) || a.caseOrdinal - b.caseOrdinal);
    q.history.sort((a, b) => b.at.localeCompare(a.at) || a.runId.localeCompare(b.runId) || a.caseOrdinal - b.caseOrdinal);
  }
  rows.sort((a, b) => b.errors - a.errors || b.errorRate - a.errorRate || b.latestErrorAt.localeCompare(a.latestErrorAt) || a.id.localeCompare(b.id));
  return { questions: rows, models: [...models].sort(), runCount, excludedFaultRuns,
    totals: rows.reduce((s, q) => { for (const k of ['errors', 'scored', 'attempts', 'executionFailures', 'missingLabels']) s[k] += q[k]; return s; },
      { questions: rows.length, errors: 0, scored: 0, attempts: 0, executionFailures: 0, missingLabels: 0 }) };
}

export async function readArenaMistakes(archiveRoot, runs, filters) {
  const archives = [], unreadableRuns = [];
  for (const run of runs) {
    try {
      const text = await readFile(join(archiveRoot, run.id, 'events.jsonl'), 'utf8');
      if (Buffer.byteLength(text) > 64 * 1024 * 1024) throw new Error('archive_too_large');
      const events = parseArenaArchiveEvents(text);
      // Includes finalized cases in an interrupted batch, while validating existing archive bindings.
      summarizeArenaArchive({ manifest: run.manifest, events });
      const scan = events[0];
      if (scan.selected.some(row => {
        const expected = run.manifest.dataset.selected[row.caseOrdinal];
        return !expected || row.canonicalDecisionOrder !== expected.canonicalDecisionOrder || row.candidateSetDigest !== expected.candidateSetDigest;
      })) throw new Error('case_identity_mismatch');
      archives.push({ manifest: run.manifest, events });
    } catch { unreadableRuns.push(run.id); }
  }
  return { ...collectArenaMistakes(archives, filters), unreadableRuns };
}
