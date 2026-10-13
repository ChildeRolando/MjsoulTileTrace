import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const spec = readFileSync(
  new URL("../../../docs/specs/2026-10-09-blind-discard-arena.md", import.meta.url),
  "utf8",
);

describe("Blind Discard Arena MCP identity contract", () => {
  it("requires MCP evidence and source references to be aliases", () => {
    expect(spec).toContain("每次 run 的 opaque evidence/source ref");
    expect(spec).toContain("canonical/source identity 必须先经私有 alias map 映射，不能直接透传");
    expect(spec).toContain("MCP/RAG 输出");
  });

  it("keeps the alias map behind the runner, helper, and grader boundary", () => {
    expect(spec).toContain("不得发给 provider");
    expect(spec).toContain("不得出现在 Coach-visible DTO、MCP/RAG 输出或工具错误信息中");
    expect(spec).toContain("实际 MCP stdio 协议");
  });
});