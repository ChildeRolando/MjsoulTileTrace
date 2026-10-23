import { describe, it, expect } from 'vitest';
import { makeArenaMcpCase } from './fixtures/arena-mcp-case.js';
import { modelContext, assemblies } from '../../../scripts/mortal-ablation/experiment.mjs';
import { chooseChallenge } from '../../../scripts/mortal-ablation/prepare.mjs';
import { runBlindCoachCase, createArenaRagRunnerTool } from '../src/blind-discard-arena-runner.js';
import { createArenaRagRetriever } from '../src/blind-discard-arena-rag.js';
import { unrequestedReference } from '../../../scripts/context-rag/experiment.mjs';

function fixture() {
  const { observation, authorizedCase } = makeArenaMcpCase();
  const refs = observation.visibleState.self.evidenceRefs;
  const facts = { version: 'scene-pattern-facts/v1', caseRef: observation.caseRef, selfActor: 0, noMeldOrKan: true, selfDora: 0, selfYakuhaiPairKinds: [31], selfSuitCounts: [4,4,4], acceptedRiichiActors: [], opponents: [1,2,3].map(actor => ({ actor, openMeldCount: 0, exposedYakuhai: false, exposedDora: 0, openNumericSuits: [], evidenceRefs: refs })), recentNonGenbutsu: [], remainingDraws: 40, southFourHanchan: false, scoresKnown: true, candidates: observation.candidates.map((c,i) => ({ actionRef: c.actionRef, tile34: i, exactPairKinds: [], yakuhaiPairKinds: [], suitCounts: [4,4,4], shanten: 2, standardShanten: 2, chiitoitsuShanten: 4, ukeire: 10, dora: 0, waits: [], furiten: false, safety: [], evidenceRefs: refs })), evidenceRefs: refs };
  return { id: 'fixture', observation, facts, binding: authorizedCase.binding };
}
async function capture(c, arm) {
  const context = modelContext(c, arm), requests = [];
  const provider = { descriptor: () => ({ providerId: 'test', model: 'fixture', protocolVersion: 'arena-function-call/v1' }), async request(r) {
    requests.push(r);
    return { status: 'ready', call: { name: 'submit_decision', arguments: JSON.stringify({ caseRef: c.observation.caseRef, actionRef: c.observation.candidates[0].actionRef, rationale: '仅使用可见事实。', evidenceRefs: [], sourceRefs: [], mainAlternative: null, uncertainty: '' }) }, outputBytes: 300, decisionSummary: 'fixture' };
  } };
  const tools = assemblies[arm].rag === 'none' ? [] : [createArenaRagRunnerTool({ caseRef: c.observation.caseRef, retriever: createArenaRagRetriever({ mode: 'off', caseRef: c.observation.caseRef }), maxPassagesPerQuery: 3 })];
  const result = await runBlindCoachCase({ ...context, provider, tools, grading: { binding: c.binding, reference: unrequestedReference } });
  expect(result.status).toBe('completed'); return requests[0];
}
describe('isolated six-arm ablation', () => {
  it('changes only patterns/tool availability and preserves original/enhanced initial requests', async () => {
    const c = fixture(), rs = {};
    for (const arm of Object.keys(assemblies)) rs[arm] = await capture(c, arm);
    expect(rs.C).toEqual(rs.E); expect(rs.D).toEqual(rs.F);
    for (const [off,on] of [['A','B'],['C','D'],['E','F']]) {
      expect(rs[on].messages.slice(0,-1)).toEqual(rs[off].messages);
      expect(rs[on].messages.at(-1).content).toContain('P03');
      expect(rs[on].tools).toEqual(rs[off].tools);
    }
    expect(rs.A.tools.map(t=>t.function.name)).toEqual(['submit_decision']);
    expect(rs.C.tools.map(t=>t.function.name)).toContain('search_knowledge');
  });
  it('never projects private labels, actual choices, hidden hands, future events or game ids', async () => {
    const c = fixture(), dirty = { ...c, mortalScores: 'PRIVATE-CANARY', actualAction: 'PRIVATE-CANARY', opponentHands: 'PRIVATE-CANARY', futureEvents: 'PRIVATE-CANARY', gameId: 'PRIVATE-CANARY' };
    expect(await capture(dirty, 'F')).toEqual(await capture(c, 'F'));
    expect(JSON.stringify(await capture(dirty, 'F'))).not.toContain('PRIVATE-CANARY');
    expect(()=>modelContext({ ...c, facts: { ...c.facts, mortalScores: 1 } }, 'A')).toThrow();
  });
  it('selects challenges only from deterministic pattern coverage', () => {
    const c = fixture(), more = { ...c, id: 'more', facts: { ...c.facts, selfSuitCounts: [8,1,1] } };
    expect(chooseChallenge([c,more], new Set()).id).toBe('more');
    expect(chooseChallenge([{ ...c, mortalScores: 100 }, { ...more, mortalScores: -100 }], new Set()).id).toBe('more');
  });
});
