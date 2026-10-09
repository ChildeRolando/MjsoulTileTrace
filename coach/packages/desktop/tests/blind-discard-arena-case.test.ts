import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const spec = readFileSync(
  new URL("../../../docs/specs/2026-10-09-blind-discard-arena.md", import.meta.url),
  "utf8",
);

describe("Blind Discard Arena case identity contract", () => {
  it("requires per-run aliases for Coach-visible case and source references", () => {
    expect(spec).toContain("所有 Coach/provider 可见的来源身份引用均使用每次 run 独立生成的 opaque alias");
    expect(spec).toContain("`canonicalEventId` 与 `sourceRecordRef`");
    expect(spec).toContain("原始 gameId/recordId canaries");
    expect(spec).toContain("该 map 只供受信 runner/helper/grader 解析引用和校验");
  });

  it("requires label and actual mutations to preserve blind output bytes", () => {
    expect(spec).toContain("仅改动 actual、label、Q 值、后续事件");
    expect(spec).toContain("必须 byte-for-byte 保持相同");
    expect(spec).toContain("候选顺序也不得改变");
  });
});