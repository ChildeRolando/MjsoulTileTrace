import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { ARENA_RAW_BASELINE } from "@riichi-coach/contracts";
import { JsonlFactEngineClient, ManagedFactEngineTransport } from "@riichi-coach/reasoning";
import { calculateArenaBasicFacts } from "../src/blind-discard-arena-basic-calculations.js";
import { prepareArenaMcpHand13Request } from "../src/blind-discard-arena-mcp.js";
import { assembleArenaExperiment } from "../src/blind-discard-arena-experiment.js";
import { runBlindCoachCase } from "../src/blind-discard-arena-runner.js";
import { makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";

describe("Arena static basic calculations", () => {
  it("covers every candidate without changing raw or candidates and rejects leakage or rebinding", async () => {
    const { authorizedCase, observation } = makeArenaMcpCase({ includeRawVisibleHistory: true });
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resolve("resources")));
    try {
      const actionRefs = observation.candidates.map(c => c.actionRef);
      const packet = await calculateArenaBasicFacts({ ...authorizedCase, actionRefs, engine });
      expect(packet.candidates.map(c => c.actionRef)).toEqual(actionRefs);
      expect(packet.candidates.every(c => c.status === "available")).toBe(true);
      const firstRequest = prepareArenaMcpHand13Request({ authorizedCase, actionRef: actionRefs[0]! })!;
      const { calculationMode: _mode, ...fullRequest } = firstRequest;
      const fullResult = await engine.analyzeHand13(fullRequest);
      expect(packet.candidates[0]).toMatchObject({ status: "available", doraCount: fullResult.doraCount });
      const config = { ...ARENA_RAW_BASELINE, legalCandidates: true };
      const candidates = assembleArenaExperiment({ observation, config });
      const withFacts = assembleArenaExperiment({ observation, config: { ...config, basicCalculations: true }, basicCalculations: packet });
      expect(withFacts.modules.raw).toEqual(candidates.modules.raw);
      expect(withFacts.modules.legalCandidates).toEqual(candidates.modules.legalCandidates);
      expect(withFacts.messages[0]).toEqual(candidates.messages[0]);
      expect(withFacts.outputSchema).toEqual(candidates.outputSchema);
      expect(withFacts.tools).toEqual([]);
      expect(() => assembleArenaExperiment({ observation, config: { ...config, basicCalculations: true }, basicCalculations: { ...packet, candidates: packet.candidates.slice(0, 1) } })).toThrow("arena_basic_calculations_candidates_mismatch");
      expect(() => assembleArenaExperiment({ observation, config: { ...config, basicCalculations: true }, basicCalculations: { ...packet, recommendation: "1m" } })).toThrow();
      expect(() => assembleArenaExperiment({ observation, config: { ...config, basicCalculations: true }, basicCalculations: { ...packet, caseRef: "arena-case:v1:00000000-0000-4000-8000-000000000999" } })).toThrow("arena_basic_calculations_candidates_mismatch");
      expect(JSON.stringify(packet)).not.toMatch(/CANARY|recommend|estimate|score|mortal/i);
      let sent: unknown;
      const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, tools: [], experiment: { ...config, basicCalculations: true },
        prepareModules: async () => ({ basicCalculations: packet }),
        provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async request => { sent = request; return { status: "final", content: '{"tile":"1m","red":false}', outputBytes: 25 }; } } });
      expect(run.status).toBe("completed");
      expect(JSON.stringify(sent)).toContain("arena-basic-calculations/v1");
      expect((sent as { tools: unknown[] }).tools).toEqual([]);
      const incomplete = structuredClone(authorizedCase.facts); incomplete.completeness.doraIndicators = false;
      const missingRequest = prepareArenaMcpHand13Request({ authorizedCase: { binding: authorizedCase.binding, facts: incomplete }, actionRef: actionRefs[0]! })!;
      const { calculationMode: _missingMode, ...missingFull } = missingRequest;
      await engine.analyzeHand13(missingFull);
      const unknown = await calculateArenaBasicFacts({ binding: authorizedCase.binding, facts: incomplete, actionRefs, engine });
      expect(unknown.candidates.every(row => row.status === "available")).toBe(true);
      for (const row of unknown.candidates) if (row.status === "available") expect(row.unseenTotal).toBeNull();
      const broken = await calculateArenaBasicFacts({ ...authorizedCase, actionRefs, engine: { ...engine, identity: async () => { throw Error("broken"); } } as unknown as typeof engine });
      expect(broken.candidates.every(c => c.status === "error")).toBe(true);
    } finally { await engine.close(); }
  });
});
