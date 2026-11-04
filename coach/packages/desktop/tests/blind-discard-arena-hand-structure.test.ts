import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { ARENA_RAW_BASELINE, ArenaExperimentConfigSchema, ArenaBlindObservationSchema, canonicalActionRef } from "@riichi-coach/contracts";
import { JsonlFactEngineClient, ManagedFactEngineTransport, projectCandidate, validateHandStructureResult } from "@riichi-coach/reasoning";
import { calculateArenaHandStructureFacts, mapArenaHandStructureResult, ArenaHandStructureFactsSchema } from "../src/blind-discard-arena-hand-structure.js";
import { assembleArenaExperiment } from "../src/blind-discard-arena-experiment.js";
import { runBlindCoachCase } from "../src/blind-discard-arena-runner.js";
import { makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";

const bag = (groups: unknown[]) => groups.map(g => JSON.stringify(g)).sort();
describe("Arena static hand structure", () => {
  it("rebuilds every returned decomposition and binds the complete candidate set", async () => {
    const { observation, authorizedCase } = makeArenaMcpCase({ includeRawVisibleHistory: true });
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resolve("resources")));
    try {
      const actionRefs = observation.candidates.map(c => c.actionRef);
      const packet = await calculateArenaHandStructureFacts({ ...authorizedCase, actionRefs, engine });
      expect(packet.rows.map(row => row.actionRef)).toEqual(actionRefs);
      const capped = ["ok", [["applicable", 1], ["applicable", 2], ["applicable", 4]], "calculated", 65, true, Array(64).fill("standard"), [["pair_candidate", [0,0]], ["pair_candidate", [0,0]]], [["floating", [1], [0]], ["floating", [1], [0,1]]]];
      const wrap = (facts: unknown, i: number) => ({ actionRef: actionRefs[i], facts });
      expect(ArenaHandStructureFactsSchema.safeParse({ ...packet, rows: [wrap(capped, 0), wrap(["error"], 1)] }).success).toBe(true);
      expect(ArenaHandStructureFactsSchema.safeParse({ ...packet, rows: [wrap([...capped.slice(0,4), false, ...capped.slice(5)], 0), wrap(["error"], 1)] }).success).toBe(false);
      expect(ArenaHandStructureFactsSchema.safeParse({ ...packet, rows: [wrap([...capped.slice(0,7), [["floating", [1], [64]]]], 0), wrap(["error"], 1)] }).success).toBe(false);
      for (let i = 0; i < actionRefs.length; i++) {
        const c = authorizedCase.binding.candidates[i]!, row = packet.rows[i]!.facts;
        expect(row[0]).toBe("ok"); if (row[0] !== "ok") throw new Error("unexpected failure");
        const p = projectCandidate({ actionRef: c.actionRef, action: c.action, origins: ["model"] }, authorizedCase.facts);
        if (p.status !== "ready" || !p.handStructureRequest) throw new Error("projection");
        const hand = validateHandStructureResult(p.handStructureRequest, await engine.analyzeHandStructure(p.handStructureRequest));
        const cappedHand = structuredClone(hand); cappedHand.decompositions.totalNonDominated++; cappedHand.decompositions.truncated = true;
        const cappedMapped = mapArenaHandStructureResult(cappedHand);
        expect(cappedMapped[3]).toBe(hand.decompositions.totalNonDominated + 1); expect(cappedMapped[4]).toBe(true);
        if (i === 0) {
          const ankan = structuredClone(p.handStructureRequest); let removed = 0;
          for (let t = 0; t < 34 && removed < 3; t++) while (ankan.handTiles34[t]! > 0 && removed < 3) { ankan.handTiles34[t]!--; removed++; }
          expect(ankan.handTiles34[26]).toBe(0);
          ankan.melds = [{ kind: "ankan", tiles34: [26, 26, 26, 26] }]; ankan.leftTiles34 = null; ankan.visibleCountsComplete = false;
          const rawAnkan = validateHandStructureResult(ankan, await engine.analyzeHandStructure(ankan));
          const ankanRow = mapArenaHandStructureResult(rawAnkan);
          expect(ankanRow[1][1]).toEqual(["not_applicable_open_hand", null]); expect(ankanRow[1][2]).toEqual(["not_applicable_open_hand", null]);
        }
        const [, families, status, total, truncated, returned, invariants, alternatives] = row;
        expect(families).toEqual(hand.families.map(f => [f.applicability, f.shanten]));
        expect([status, total, truncated, returned]).toEqual([hand.decompositions.status, hand.decompositions.totalNonDominated, hand.decompositions.truncated, hand.decompositions.items.map(x => x.family)]);
        for (let n = 0; n < returned.length; n++) expect(bag([...invariants, ...alternatives.filter(a => a[2].includes(n)).map(a => [a[0], a[1]])])).toEqual(bag(hand.decompositions.items[n]!.groups.map(g => [g.kind, g.tiles34])));
      }
      const config = { ...ARENA_RAW_BASELINE, legalCandidates: true };
      const base = assembleArenaExperiment({ observation, config });
      const full = assembleArenaExperiment({ observation, config: { ...config, handStructureFacts: true }, handStructureFacts: packet });
      expect(full.modules.raw).toEqual(base.modules.raw); expect(full.modules.legalCandidates).toEqual(base.modules.legalCandidates);
      expect(full.messages[0]).toEqual(base.messages[0]); expect(full.outputSchema).toEqual(base.outputSchema); expect(full.tools).toEqual([]);
      expect(() => assembleArenaExperiment({ observation, config: { ...config, handStructureFacts: true }, handStructureFacts: { ...packet, rows: [...packet.rows].reverse() } })).toThrow("arena_hand_structure_candidates_mismatch");
      const redCandidates = [false, true].map(red => { const action = { kind: "discard" as const, tile: { id: "5p" as const, red }, discardMode: "tedashi" as const }; return { actionRef: canonicalActionRef(action), tile: action.tile, discardMode: action.discardMode }; });
      const redObservation = ArenaBlindObservationSchema.parse({ ...observation, candidates: redCandidates });
      const redPacket = { ...packet, rows: packet.rows.map((row, i) => ({ ...row, actionRef: redCandidates[i]!.actionRef })) };
      expect(() => assembleArenaExperiment({ observation: redObservation, config: { ...config, handStructureFacts: true }, handStructureFacts: redPacket })).not.toThrow();
      expect(() => assembleArenaExperiment({ observation: redObservation, config: { ...config, handStructureFacts: true }, handStructureFacts: { ...redPacket, rows: [...redPacket.rows].reverse() } })).toThrow("arena_hand_structure_candidates_mismatch");
      expect(() => assembleArenaExperiment({ observation, config: { ...config, handStructureFacts: true }, handStructureFacts: { ...packet, rows: packet.rows.slice(1) } })).toThrow();
      expect(() => assembleArenaExperiment({ observation, config: { ...config, handStructureFacts: true }, handStructureFacts: { ...packet, rows: [...packet.rows, packet.rows[0]] } })).toThrow();
      expect(() => assembleArenaExperiment({ observation, config: { ...config, handStructureFacts: true }, handStructureFacts: { ...packet, caseRef: "arena-case:v1:00000000-0000-4000-8000-000000000999" } })).toThrow("arena_hand_structure_candidates_mismatch");
      expect(ArenaExperimentConfigSchema.safeParse({ ...config, handStructureFacts: true, helperFacts: true }).success).toBe(false);
      expect(JSON.stringify(packet)).not.toMatch(/CANARY|mortal|recommend|riskScale|qValue/i);
      const future = makeArenaMcpCase({ includeRawVisibleHistory: true, changeFuture: true });
      const changed = await calculateArenaHandStructureFacts({ ...future.authorizedCase, actionRefs: future.observation.candidates.map(c => c.actionRef), engine });
      expect(changed.rows).toEqual(packet.rows);
      const broken = await calculateArenaHandStructureFacts({ ...authorizedCase, actionRefs, engine: { ...engine, identity: async () => { throw new Error("failure"); } } as unknown as typeof engine });
      expect(broken.rows.every(r => r.facts[0] === "error")).toBe(true);
      const wrongResult = await calculateArenaHandStructureFacts({ ...authorizedCase, actionRefs, engine: { identity: () => engine.identity(), analyzeHandStructure: async (request: Parameters<typeof engine.analyzeHandStructure>[0]) => ({ ...await engine.analyzeHandStructure(request), stateHash: "incorrect" }) } as unknown as typeof engine });
      expect(wrongResult.rows.every(r => r.facts[0] === "error")).toBe(true);
      await expect(calculateArenaHandStructureFacts({ ...authorizedCase, facts: { ...authorizedCase.facts, opponentHiddenHand: ["CANARY"] } as typeof authorizedCase.facts, actionRefs, engine })).rejects.toThrow();
      await expect(calculateArenaHandStructureFacts({ ...authorizedCase, facts: { ...authorizedCase.facts, actor: (authorizedCase.facts.actor + 1) % 4 } as typeof authorizedCase.facts, actionRefs, engine })).rejects.toThrow();
      await expect(calculateArenaHandStructureFacts({ ...authorizedCase, actionRefs: actionRefs.slice(1), engine })).rejects.toThrow("arena_structure_candidate_binding_mismatch");
      let sent: unknown; const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, tools: [], experiment: { ...config, handStructureFacts: true }, prepareModules: async () => ({ handStructureFacts: packet }), provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async request => { sent = request; return { status: "final", content: '{"tile":"1m","red":false}', outputBytes: 25 }; } } });
      expect(run.status).toBe("completed"); expect(JSON.stringify(sent)).toContain("arena-hand-structure-facts/v1");
    } finally { await engine.close(); }
  });
});
