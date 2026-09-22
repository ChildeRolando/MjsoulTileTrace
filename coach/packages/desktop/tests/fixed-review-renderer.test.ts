import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/renderer/fixed-review-ui.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");

describe("fixed review native DOM surface", () => {
  it("ships semantic three-level landmarks and safe text-only rendering", () => {
    expect(html).toContain('id="fixed-review"');
    expect(source).toContain("review-overview");
    expect(source).toContain("review-list");
    expect(source).toContain("review-detail");
    expect(source).toContain('aria-live');
    expect(source).toContain('role", "alert"');
    expect(source).toContain("textContent");
    expect(source).not.toContain("innerHTML");
  });

  it("contains only first-generation user controls", () => {
    expect(source).toContain("生成教练解说");
    for (const forbidden of ["重新生成", "历史报告", "A/B", "activateReport", "切换报告"]) expect(source).not.toContain(forbidden);
  });

  it("localizes user-facing state instead of printing internal error codes", () => {
    for (const phrase of ["分析资料完整", "无需来源行", "教练服务暂时不可用", "证据校验未通过"]) expect(source).toContain(phrase);
    for (const code of ["integrity_failed", "source_row_not_expected", "request_failed", "invalid_output"]) {
      const visibleLiteral = new RegExp(`[>\"']${code}[<\"']`, "g");
      expect(source.match(visibleLiteral) ?? []).toHaveLength(0);
    }
  });
});
