import { it, expect } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PairStudyConfigSchema } from "@riichi-coach/contracts";
import { Archive } from "../src/archive.js";
import { renderPairReport, renderPairBudgetStop } from "../src/pair-report.js";
import type { PairStudy } from "../src/pair-study.js";

it("stops reporting at the budget and leaves science records intact for offline reconstruction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pair-report-budget-"));
  const archive = await Archive.open(directory, { test: true });
  const study = { archive, samples: [], labels: new Map(),
    config: PairStudyConfigSchema.parse({ schemaVersion: "question-lab-pairs-config/v2", name: "<实验>" }) } as unknown as PairStudy;
  try {
    await archive.write("fit-final.json", { sealed: "unchanged" });
    await expect(renderPairReport(study, { deadlineAt: Date.now() - 1 })).rejects.toThrow("report_budget_exhausted");
    const stopped = await renderPairBudgetStop(study);
    expect(stopped).toMatchObject({ status: "partial", reportIncomplete: true, reason: "report_budget_exhausted" });
    expect(await archive.read("fit-final.json")).toEqual({ sealed: "unchanged" });
    const html = await readFile(archive.path("report.html"), "utf8");
    expect(html).toContain("&lt;实验&gt;");
    expect(html).toContain("完整报告尚未生成");
  } finally { await archive.close(); await rm(directory, { recursive: true, force: true }); }
});
