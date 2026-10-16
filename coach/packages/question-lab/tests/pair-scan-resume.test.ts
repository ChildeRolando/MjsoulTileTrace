import { describe, it, expect } from "vitest";
import { mkdtemp, cp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PairStudyConfigSchema, LabConstructRequestSchema } from "@riichi-coach/contracts";
import { PairStudy } from "../src/pair-study.js";
import { digest } from "../src/config.js";
import { renderReport } from "../src/report.js";
import { QuestionLabConfigSchema } from "@riichi-coach/contracts";

describe.skipIf(process.env.COACH_QUESTION_LAB_NATIVE !== "1")("anchored scan recovery", () => {
  it("preserves fixed coordinates and complete Q labels after an interrupted anchored scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "pair-scan-"));
    const config = PairStudyConfigSchema.parse({ schemaVersion: "question-lab-pairs-config/v2", initialCount: 2,
      budget: { maxAttempts: 200, timeLimitSeconds: 300, reserveSeconds: 5, refinementRounds: 0 },
      scans: { anchorCount: 2, variantsPerAnchor: 48, threats: false } });
    const baseDir = join(root, "base"), wholeDir = join(root, "whole"), partialDir = join(root, "partial");
    try {
      const base = await PairStudy.open(config, baseDir);
      try {
        const fixture = JSON.parse(await readFile(new URL("./fixtures/efficiency-dora-anchor.json", import.meta.url), "utf8"));
        const content = { ...fixture, protocolVersion: "riichi-lab-construct/v1", identity: base.workers[0]!.constructor.identity };
        const request = LabConstructRequestSchema.parse({ ...content, requestId: digest(content) });
        const result = await base.evaluate(request, base.workers[0]!, 0);
        if (!result.sample || result.result?.status !== "ok") throw new Error("anchor_unreachable");
        await base.store(result.sample, request, result.result, { phase: "development" });
        await base.label(); await base.selectAnchors();
        // Hide independent labels/cases in pre-final reports.
        const s = base.samples[0]!;
        s.split = "test";
        await base.archive.write(`samples/${s.sampleId}.json`, s);
        await renderReport(base.archive, QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", seed: 1 }), { maskHoldout: true });
        expect(await readFile(base.archive.path("report.html"), "utf8")).not.toContain(`id="case-${s.sampleId}"`);
        s.split = "train"; await base.archive.write(`samples/${s.sampleId}.json`, s);
      } finally { await base.close(); }
      await cp(baseDir, wholeDir, { recursive: true }); await cp(baseDir, partialDir, { recursive: true });
      const whole = await PairStudy.open(config, wholeDir);
      let expected: unknown, expectedPlans: unknown;
      try { await whole.scan(); expected = whole.learningRows(); expectedPlans = await whole.archive.list("scan-plans"); }
      finally { await whole.close(); }
      const first = await PairStudy.open(config, partialDir);
      const ensure = first.ensureLabel.bind(first); let completed = 0;
      first.ensureLabel = async (...args) => {
        if (!first.labels.has(args[0].sampleId) && ++completed === 3) throw new Error("simulated_scan_interrupt");
        return ensure(...args);
      };
      try { await expect(first.scan()).rejects.toThrow("simulated_scan_interrupt"); }
      finally { await first.close(); }
      const resumed = await PairStudy.open(config, partialDir); const prior = resumed.labels.size;
      let calls = 0;
      for (const w of resumed.workers) { const score = w.mortal.scoreRules.bind(w.mortal); w.mortal.scoreRules = async r => { calls++; return score(r); }; }
      try {
        await resumed.scan();
        expect(resumed.learningRows()).toEqual(expected);
        expect(resumed.labels.size - prior).toBe(calls);
        expect(await resumed.archive.list("scan-plans")).toEqual(expectedPlans);
        const plan = (await resumed.archive.list("scan-plans"))[0]!;
        const saved = await resumed.archive.read(`scan-plans/${plan}`) as { hash: string };
        await resumed.archive.write(`scan-plans/${plan}`, { ...saved, hash: "0".repeat(64) });
        await expect(resumed.scan()).rejects.toThrow("scan_plan_identity_mismatch");
      } finally { await resumed.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 180000);
});
