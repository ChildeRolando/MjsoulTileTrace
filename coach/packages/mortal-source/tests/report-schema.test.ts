import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MortalReportSchema } from "../src/report-schema.js";
import { fetchMortalReport } from "../src/report-fetcher.js";

const fixtureUrl = new URL(
  "../fixtures/current-mortal-report.synthetic.json",
  import.meta.url,
);

describe("current pinned Mortal report schema", () => {
  it("parses the synthetic current-shape fixture", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
    const parsed = MortalReportSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.engine).toBe("Mortal");
    expect(parsed.data.version).toBe("1.5.10");
    expect(parsed.data.review.model_tag).toBe("4.1b");
    expect(parsed.data.review.kyokus[0]!.entries[0]!.details).toHaveLength(2);
  });

  it("projects the synthetic fixture through the production fetch boundary", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
    const report = await fetchMortalReport({
      url: "https://mjai.ekyu.moe/report/0123456789abcdef.json",
      fetchImpl: (async () => new Response(JSON.stringify(raw), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    });
    expect(report.reportId).toBe("0123456789abcdef");
    expect(report.kyokus).toHaveLength(1);
    expect(report.kyokus[0]!.roundOrdinal).toBe(0);
    expect(report.kyokus[0]!.roundWind).toBe("E");
    expect(report.kyokus[0]!.dealer).toBe(0);
    expect(report.kyokus[0]!.entries).toHaveLength(1);
    expect(report.kyokus[0]!.entries[0]!.tehai).toHaveLength(14);
  });
});
