import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { ARENA_RAW_BASELINE, ArenaExperimentConfigSchema, ArenaBlindObservationSchema, canonicalActionRef } from "@riichi-coach/contracts";
import { JsonlFactEngineClient, ManagedFactEngineTransport, validateHand13Result } from "@riichi-coach/reasoning";
import { calculateArenaImprovementFacts, ArenaImprovementFactsSchema } from "../src/blind-discard-arena-improvement.js";
import { prepareArenaMcpHand13Request } from "../src/blind-discard-arena-mcp.js";
import { assembleArenaExperiment } from "../src/blind-discard-arena-experiment.js";
import { runBlindCoachCase } from "../src/blind-discard-arena-runner.js";
import { makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";

describe("Arena static improvement facts", () => {
  it("round-trips the standard result and binds every candidate, preserving boundaries", async () => {
    const { observation, authorizedCase } = makeArenaMcpCase({ includeRawVisibleHistory: true });
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resolve("resources")));
    try {
      const refs = observation.candidates.map(c => c.actionRef);
      const packet = await calculateArenaImprovementFacts({ ...authorizedCase, actionRefs: refs, engine });
      expect(packet.rows.map(r => r.actionRef)).toEqual(refs);
      for (const row of packet.rows) {
        expect(row.status).toBe("available"); if (row.status !== "available") throw new Error("unexpected");
        const projected = prepareArenaMcpHand13Request({ authorizedCase, actionRef: row.actionRef })!;
        const { calculationMode: _mode, ...request } = projected;
        const result = validateHand13Result(request, await engine.analyzeHand13(request));
        expect(row.improves.map(([drawTile34, drawUnseen, index]) => ({ drawTile34, drawUnseen, bestWaits: packet.waitSets[index]!.map(([tile34, count]) => ({ tile34, count })) })))
          .toEqual(result.improves.map(v => ({ drawTile34: v.drawTile34, drawUnseen: request.leftTiles34![v.drawTile34], bestWaits: v.bestWaits })));
      }
      const config = { ...ARENA_RAW_BASELINE, legalCandidates: true };
      const before = assembleArenaExperiment({ observation, config });
      const after = assembleArenaExperiment({ observation, config: { ...config, improvementFacts: true }, improvementFacts: packet });
      expect(after.modules.raw).toEqual(before.modules.raw); expect(after.modules.legalCandidates).toEqual(before.modules.legalCandidates);
      expect(after.messages[0]).toEqual(before.messages[0]); expect(after.outputSchema).toEqual(before.outputSchema); expect(after.tools).toEqual([]);
      expect(() => assembleArenaExperiment({ observation, config: { ...config, improvementFacts: true }, improvementFacts: { ...packet, rows: [...packet.rows].reverse() } })).toThrow();
      expect(() => assembleArenaExperiment({ observation, config: { ...config, improvementFacts: true }, improvementFacts: { ...packet, rows: packet.rows.slice(1) } })).toThrow();
      expect(() => assembleArenaExperiment({ observation, config: { ...config, improvementFacts: true }, improvementFacts: { ...packet, rows: [...packet.rows, packet.rows[0]] } })).toThrow();
      expect(() => assembleArenaExperiment({ observation, config: { ...config, improvementFacts: true }, improvementFacts: { ...packet, caseRef: "arena-case:v1:00000000-0000-4000-8000-000000000999" } })).toThrow("arena_improvement_candidates_mismatch");
      expect(ArenaExperimentConfigSchema.safeParse({ ...config, improvementFacts: true, helperFacts: true }).success).toBe(false);
      const red = [false, true].map(red => { const action = { kind: "discard" as const, tile: { id: "5p" as const, red }, discardMode: "tedashi" as const }; return { actionRef: canonicalActionRef(action), tile: action.tile, discardMode: action.discardMode }; });
      const redObservation = ArenaBlindObservationSchema.parse({ ...observation, candidates: red });
      const redPacket = { ...packet, rows: packet.rows.map((row, i) => ({ ...row, actionRef: red[i]!.actionRef })) };
      expect(() => assembleArenaExperiment({ observation: redObservation, config: { ...config, improvementFacts: true }, improvementFacts: redPacket })).not.toThrow();
      expect(() => assembleArenaExperiment({ observation: redObservation, config: { ...config, improvementFacts: true }, improvementFacts: { ...redPacket, rows: [...redPacket.rows].reverse() } })).toThrow();
      const future = makeArenaMcpCase({ includeRawVisibleHistory: true, changeFuture: true });
      const changed = await calculateArenaImprovementFacts({ ...future.authorizedCase, actionRefs: future.observation.candidates.map(c => c.actionRef), engine });
      expect(changed.rows).toEqual(packet.rows); expect(changed.waitSets).toEqual(packet.waitSets);
      const incomplete = structuredClone(authorizedCase.facts); incomplete.completeness.doraIndicators = false;
      const missing = await calculateArenaImprovementFacts({ binding: authorizedCase.binding, facts: incomplete, actionRefs: refs, engine });
      expect(missing.rows.every(r => r.status === "unavailable" && r.reason === "missing_visibility")).toBe(true); expect(missing.waitSets).toEqual({});
      const unknown = structuredClone(authorizedCase.facts); unknown.handStructureYakuContext!.riichiStatus = "unknown";
      const riichiUnknown = await calculateArenaImprovementFacts({ binding: authorizedCase.binding, facts: unknown, actionRefs: refs, engine });
      expect(riichiUnknown.rows.every(r => r.status === "unavailable" && r.reason === "unknown_riichi")).toBe(true);
      const riichi = structuredClone(authorizedCase.facts); riichi.selfRiichi = true; riichi.handStructureYakuContext!.riichiStatus = "accepted";
      const locked = await calculateArenaImprovementFacts({ binding: authorizedCase.binding, facts: riichi, actionRefs: refs, engine });
      expect(locked.rows.every(r => r.status === "unavailable" && r.reason === "self_riichi")).toBe(true);
      const bad = await calculateArenaImprovementFacts({ ...authorizedCase, actionRefs: refs, engine: { identity: async () => { throw Error("failed"); } } as unknown as typeof engine });
      expect(bad.rows.every(r => r.status === "error")).toBe(true);
      let engineCalls = 0;
      const oneBad = await calculateArenaImprovementFacts({ ...authorizedCase, actionRefs: refs, engine: { identity: () => engine.identity(), analyzeHand13: async (request: Parameters<typeof engine.analyzeHand13>[0]) => { const value = await engine.analyzeHand13(request); return ++engineCalls === 1 ? { ...value, stateHash: "incorrect" } : value; } } as unknown as typeof engine });
      expect(oneBad.rows[0]!.status).toBe("error"); expect(oneBad.rows[1]!.status).toBe("available"); expect(ArenaImprovementFactsSchema.safeParse(oneBad).success).toBe(true);
      await expect(calculateArenaImprovementFacts({ ...authorizedCase, actionRefs: refs.slice(1), engine })).rejects.toThrow("arena_improvement_candidate_binding_mismatch");
      await expect(calculateArenaImprovementFacts({ ...authorizedCase, facts: { ...authorizedCase.facts, hidden: "CANARY" } as typeof authorizedCase.facts, actionRefs: refs, engine })).rejects.toThrow();
      const first = packet.rows[0]!; if (first.status === "available" && first.improves.length) {
        const badIndex = structuredClone(packet); const br = badIndex.rows[0]!; if (br.status !== "available") throw Error("test"); br.improves[0]![2] = String(Object.keys(badIndex.waitSets).length);
        expect(ArenaImprovementFactsSchema.safeParse(badIndex).success).toBe(false);
      }
      const synthetic = { ...packet, waitSets: { "0": [[0, 0], [1, 2], [0, 0]] }, rows: [{ actionRef: refs[0]!, status: "available", improves: [[2, 3, "0"], [3, 2, "0"]] }, { actionRef: refs[1]!, status: "error" }] };
      expect(ArenaImprovementFactsSchema.safeParse(synthetic).success).toBe(true);
      expect(ArenaImprovementFactsSchema.safeParse({ ...synthetic, waitSets: { "0": Array(35).fill([0, 0]) } }).success).toBe(true);
      expect(ArenaImprovementFactsSchema.safeParse({ ...synthetic, waitSets: { ...synthetic.waitSets, "1": synthetic.waitSets["0"] } }).success).toBe(false);
      expect(ArenaImprovementFactsSchema.safeParse({ ...synthetic, rows: [{ actionRef: refs[0], status: "available", improves: [[2, 3, "01"]] }, { actionRef: refs[1], status: "error" }] }).success).toBe(false);
      expect(ArenaImprovementFactsSchema.safeParse({ ...synthetic, waitSets: { "0": [[0, 0]], "1": [[1, 1]] }, rows: [{ actionRef: refs[0], status: "available", improves: [[2, 3, "1"], [3, 2, "0"]] }, { actionRef: refs[1], status: "error" }] }).success).toBe(false);
      expect(JSON.stringify(packet)).not.toMatch(/CANARY|mortal|recommendationScore|qValue|mixed_waits_score/i);
      let sent: unknown; const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, tools: [], experiment: { ...config, improvementFacts: true }, prepareModules: async () => ({ improvementFacts: packet }), provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async request => { sent = request; return { status: "final", content: '{"tile":"1m","red":false}', outputBytes: 25 }; } } });
      expect(run.status).toBe("completed"); expect(JSON.stringify(sent)).toContain("arena-improvement-facts/v1");
    } finally { await engine.close(); }
  });
});
