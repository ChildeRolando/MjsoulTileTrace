import { describe, it, expect } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LabConstructRequestSchema, PairStudyConfigSchema, QuestionLabConfigSchema } from "@riichi-coach/contracts";
import { createLabWorker } from "../src/runtime.js";
import { digest } from "../src/config.js";
import { constructPairSample } from "../src/pair-native.js";
import { pairObservations, pairTargets } from "../src/pair-features.js";
import { scoreLabSample, readLabels, readSamples } from "../src/batch.js";
import { projectResearchMortalRuleScoring, bindLocalMortalRuleScores } from "@riichi-coach/reasoning";
import { scanCoordinates, scanRequest, verifyScan, threatCoordinates, repairThreatDraw, type Witness } from "../src/pair-scans.js";
import { previousIndicator } from "../src/pair-scans.js";
import { pendingDecision } from "../src/projection.js";
import { formatMjaiTile } from "@riichi-coach/mortal-source";
import { TILES, tile34 } from "../src/construct.js";
import { Archive } from "../src/archive.js";
import { renderReport } from "../src/report.js";
import { pairCaseDecoration } from "../src/pair-report.js";

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
      const reportRoot = await mkdtemp(join(tmpdir(), "pair-report-"));
      const reportConfig = QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", seed: 1 });
      const reportArchive = await Archive.open(reportRoot, { config: reportConfig,
        producers: { model: worker.mortal.identity, facts: base.sample.factIdentity } });
      try {
        await reportArchive.write(`samples/${base.sample.sampleId}.json`, base.sample);
        await reportArchive.write(`labels/${base.sample.sampleId}.json`, label);
        let decorated = 0;
        await renderReport(reportArchive, reportConfig, { afterHeader: '<section id="pair-test">配对扩展</section>',
          experimentMetadata: { schemaVersion: "question-lab-pairs-config/v2", initialCount: 1000, budget: { timeLimitSeconds: 3600 } },
          decorateCase: (sample, value) => { decorated++; return pairCaseDecoration(sample, value, .01); } });
        const html = await readFile(reportArchive.path("report.html"), "utf8");
        expect(decorated).toBe(1);
        expect(html).toContain('id="pair-test"');
        expect(html).toContain("保宝侧胜出");
        expect(html).toContain("-3.38410");
        expect(html).toContain('&quot;initialCount&quot;: 1000');
        expect(html).not.toContain('&quot;targetCount&quot;');
        const identity = { ...worker.mortal.identity, runtimeModelSha256: "0".repeat(64) };
        const foreignRequest = projectResearchMortalRuleScoring({ stream: base.sample.stream, decision: pendingDecision(base.sample.stream),
          identity, ruleRequest: base.sample.ruleRequest, ruleResult: base.sample.ruleResult });
        const foreignResponse = { ...label.response, identity, requestId: foreignRequest.requestId };
        expect(bindLocalMortalRuleScores({ request: foreignRequest, response: foreignResponse,
          decision: pendingDecision(base.sample.stream) }).preferred.actionRef).toBe(label.preferredActionRef);
        await reportArchive.write(`labels/${base.sample.sampleId}.json`, { ...label, request: foreignRequest, response: foreignResponse });
        await expect(readLabels(reportArchive, [base.sample])).rejects.toThrow("label_model_producer_mismatch");
        await reportArchive.write(`labels/${base.sample.sampleId}.json`, label);
        const manifest = await reportArchive.read("manifest.json") as { identity: { producers: { facts: unknown } } };
        manifest.identity.producers.facts = { changedProducer: true };
        await reportArchive.write("manifest.json", manifest);
        await expect(readSamples(reportArchive)).rejects.toThrow("sample_fact_producer_mismatch");
      } finally { await reportArchive.close(); await rm(reportRoot, { recursive: true, force: true }); }
      const witness: Witness = { request, result: base.result };
      const coordinates = scanCoordinates(base.sample);
      const facts = pendingDecision(base.sample.stream).facts;
      const held = [...facts.concealedTiles, ...(facts.currentDraw ? [facts.currentDraw.tile] : [])].map(t => tile34(formatMjaiTile(t)));
      const neutralIndicators = TILES.filter((_, i) => !held.includes(i)).map(previousIndicator);
      expect(coordinates.filter(c => c.axis === "dora").some(c => neutralIndicators.includes(String(c.values.indicator)))).toBe(true);
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
