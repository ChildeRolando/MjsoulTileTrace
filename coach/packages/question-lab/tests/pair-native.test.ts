import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { LabConstructRequestSchema, PairStudyConfigSchema } from "@riichi-coach/contracts";
import { createLabWorker } from "../src/runtime.js";
import { digest } from "../src/config.js";
import { constructPairSample } from "../src/pair-native.js";
import { pairObservations, pairTargets } from "../src/pair-features.js";
import { scoreLabSample } from "../src/batch.js";
import { scanCoordinates, scanRequest, verifyScan, threatCoordinates, repairThreatDraw, type Witness } from "../src/pair-scans.js";

describe.skipIf(process.env.COACH_QUESTION_LAB_NATIVE !== "1")("native pair experiment", () => {
  it("replays the real counterexample and scores all choices, then performs all four legal scan axes", async () => {
    const worker = await createLabWorker();
    try {
      const source = JSON.parse(await readFile(new URL("./fixtures/efficiency-dora-anchor.json", import.meta.url), "utf8"));
      const content = { protocolVersion: "riichi-lab-construct/v1", ...source, identity: worker.constructor.identity };
      const request = LabConstructRequestSchema.parse({ ...content, requestId: digest(content) });
      const base = await constructPairSample({ worker, request, configHash: digest("test"), attempt: 0, round: 0 });
      if (!base.sample || base.result.status !== "ok") throw new Error("fixture_not_reachable");
      const pairs = pairObservations(base.sample);
      expect(pairs.reason).toBe("strict_conflict");
      expect(pairs.pairs[0]!.features).toMatchObject({ deltaS: 0, deltaU: 7, deltaD: 1 });
      const label = await scoreLabSample(base.sample, worker, .01);
      const result = pairTargets(base.sample, label, .01);
      expect(result.summary.side).toBe("dora");
      expect(result.summary.setGap).toBeCloseTo(-3.3841013, 3);
      expect(label.scores).toHaveLength(base.sample.candidates.length);
      const witness: Witness = { request, result: base.result };
      const coordinates = scanCoordinates(base.sample);
      for (const axis of ["availability", "dora", "scores", "turn"]) {
        let reached = false;
        const errors: string[] = [];
        for (const coordinate of coordinates.filter(c => c.axis === axis)) {
          try {
            const next = scanRequest(witness, base.sample, coordinate);
            const variant = await constructPairSample({ worker, request: next, configHash: digest("test"), attempt: 1, round: 10 });
            if (!variant.sample) { errors.push(variant.reason!); continue; }
            const changes = verifyScan(base.sample, variant.sample, coordinate, witness, next);
            if (axis === "availability" && !changes.includes("rivers")) continue;
            const scored = await scoreLabSample(variant.sample, worker, .01);
            expect(scored.scores).toHaveLength(variant.sample.candidates.length);
            reached = true; break;
          } catch (e) { errors.push((e as Error).message); }
        }
        expect(reached, `${axis}: ${errors.join(",")}`).toBe(true);
      }
      const threats: string[] = [];
      for (const coordinate of threatCoordinates(base.sample)) {
        try {
          let next = scanRequest(witness, base.sample, coordinate);
          let variant = await constructPairSample({ worker, request: next, configHash: digest("test"), attempt: 2, round: 100 });
          if (variant.result.status === "ok") {
            const repair = repairThreatDraw(witness, next, variant.result);
            if (repair) { next = repair; variant = await constructPairSample({ worker, request: next, configHash: digest("test"), attempt: 2, round: 100 }); }
          }
          if (!variant.sample) { threats.push(`${coordinate.values.kind}:${variant.reason}`); continue; }
          verifyScan(base.sample, variant.sample, coordinate, witness, next);
        } catch (e) { threats.push(`${coordinate.values.kind}:${(e as Error).message}`); }
      }
      expect(threats).toEqual([]);
      expect(PairStudyConfigSchema.parse({ schemaVersion: "question-lab-pairs-config/v2" }).initialCount).toBe(1000);
    } finally { await worker.close(); }
  }, 120000);
});
