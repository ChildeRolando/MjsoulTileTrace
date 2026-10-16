import { describe, it, expect } from "vitest";
import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PairStudyConfigSchema } from "@riichi-coach/contracts";
import { PairStudy } from "../src/pair-study.js";

describe.skipIf(process.env.COACH_QUESTION_LAB_NATIVE !== "1")("pair acquisition recovery", () => {
  it("keeps frozen groups, pair features and acquisition after partial native refinement without rescoring labels", async () => {
    const root = await mkdtemp(join(tmpdir(), "pair-resume-"));
    const config = PairStudyConfigSchema.parse({ schemaVersion: "question-lab-pairs-config/v2", initialCount: 12,
      budget: { maxAttempts: 800, timeLimitSeconds: 600, reserveSeconds: 5, refinementRounds: 1, refinementCount: 8 },
      learning: { boundaryGap: 10 },
      scans: { anchorCount: 0, variantsPerAnchor: 0, threats: false } });
    const baseline = join(root, "base"), continuous = join(root, "whole"), interrupted = join(root, "interrupted");
    try {
      const preparing = await PairStudy.open(config, baseline);
      try {
        await preparing.generate();
        const write = preparing.archive.write.bind(preparing.archive);
        preparing.archive.write = async (path, value) => {
          if (path.startsWith("pairs/")) throw new Error("simulated_split_interrupt");
          return write(path, value);
        };
        await expect(preparing.freezeSplit()).rejects.toThrow("simulated_split_interrupt");
        preparing.archive.write = write;
        expect(await preparing.archive.read("split.json")).toBeNull();
        expect(await preparing.archive.read("split-plan.json")).not.toBeNull();
      } finally { await preparing.close(); }
      const initial = await PairStudy.open(config, baseline);
      try {
        expect(await initial.archive.read("split.json")).toEqual(initial.split);
        expect(initial.labels.size).toBe(0);
        for (const s of initial.samples) {
          expect(s.split).toBe(initial.split!.testGroups.includes(s.groupId) ? "test" : "train");
          const pairs = await initial.archive.read(`pairs/${s.sampleId}.json`) as { split: string }[];
          expect(pairs.every(p => p.split === s.split)).toBe(true);
        }
        await initial.label();
        expect(initial.samples).toHaveLength(12);
        expect(initial.split!.testGroups.length).toBeGreaterThan(0);
        const fitted = await initial.fit(false);
        expect(fitted!.models.full!.status).toBe("fitted");
      } finally { await initial.close(); }
      await cp(baseline, continuous, { recursive: true }); await cp(baseline, interrupted, { recursive: true });
      const whole = await PairStudy.open(config, continuous);
      let expected: unknown;
      try { await whole.refine(); expected = whole.learningRows(); }
      finally { await whole.close(); }
      const first = await PairStudy.open(config, interrupted);
      let accepted = 0;
      const store = first.store.bind(first);
      first.store = async (...args) => {
        if (args[3].phase === "refinement" && ++accepted === 3) throw new Error("simulated_interrupt");
        return store(...args);
      };
      let snapshot: unknown;
      try {
        await expect(first.refine()).rejects.toThrow("simulated_interrupt");
        await first.label(); snapshot = await first.archive.read("acquisition/round-1.json");
        expect(first.samples.filter(s => s.round === 1)).toHaveLength(2);
      } finally { await first.close(); }
      const resumed = await PairStudy.open(config, interrupted);
      const existing = resumed.labels.size;
      let calls = 0;
      for (const w of resumed.workers) {
        const score = w.mortal.scoreRules.bind(w.mortal);
        w.mortal.scoreRules = async r => { calls++; return score(r); };
      }
      try {
        await resumed.refine();
        expect(resumed.learningRows()).toEqual(expected);
        expect(resumed.labels.size - existing).toBe(calls);
        expect(calls).toBe(6);
        expect(await resumed.archive.read("acquisition/round-1.json")).toEqual(snapshot);
        for (const s of resumed.samples.filter(s => s.round === 1)) expect(s.split).toBe("train");
        expect(resumed.samples.filter(s => s.split === "train").some(s => resumed.split!.testGroups.includes(s.groupId))).toBe(false);
      } finally { await resumed.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 180000);
});
