import { describe, expect, it } from "vitest";
import {
  paipuImportStatusLabel,
  paipuImportUiStateFromResult,
  paipuShareUrlLooksValid,
} from "../src/renderer/paipu-ui-policy.js";

// The renderer-side URL pre-check mirrors the main-process strict parser:
// same origin, same path, same paipu shape, same view-suffix bound.
const id = "260811-00000000-0000-0000-0000-000000000001";

describe("paipu UI policy", () => {
  it("pre-checks the exact CN share URL shape", () => {
    expect(paipuShareUrlLooksValid(`https://game.maj-soul.com/1/?paipu=${id}_a1`)).toBe(true);
    expect(paipuShareUrlLooksValid(`https://game.maj-soul.com/1/?paipu=${id}_a123456`)).toBe(true);
    const invalid = [
      "",
      "share me",
      `http://game.maj-soul.com/1/?paipu=${id}_a1`,
      `https://evil.com/1/?paipu=${id}_a1`,
      `https://game.maj-soul.com/1/?paipu=${id}_a1&x=1`,
      `https://game.maj-soul.com/1/?paipu=${id}_a1#h`,
      `https://game.maj-soul.com/1/?paipu=${id}`,
      `https://game.maj-soul.com/1/?paipu=${id}_a0`,
      `https://game.maj-soul.com/1/?paipu=${id}_a99999999999`,
      42 as unknown as string,
    ];
    for (const url of invalid) {
      expect(paipuShareUrlLooksValid(url)).toBe(false);
    }
  });

  it("labels every UI state with fixed user-facing prose", () => {
    expect(paipuImportStatusLabel({ state: "idle" }))
      .toBe("粘贴雀魂牌谱分享链接。");
    expect(paipuImportStatusLabel({ state: "invalid_url" })).toBe("牌谱链接格式无效");
    expect(paipuImportStatusLabel({ state: "pending" })).toBe("正在通过雀魂客户端读取牌谱…");
    expect(paipuImportStatusLabel({ state: "analysis_ready", decisionCount: 116 }))
      .toBe("牌谱已导入，可分析 116 个决策点");
    expect(paipuImportStatusLabel({ state: "identity_mismatch" }))
      .toBe("无法确定这份牌谱的分析视角");
    expect(paipuImportStatusLabel({ state: "unsupported_semantics" }))
      .toBe("这场牌谱包含当前尚未支持的记录类型");
    expect(paipuImportStatusLabel({ state: "no_capture" })).toBe("未能从雀魂客户端取得牌谱");
    expect(paipuImportStatusLabel({ state: "failed" })).toBe("牌谱解析未完成，请稍后重试。");
  });

  it("maps the fixed safe IPC result to UI states, unknown statuses to failure", () => {
    expect(paipuImportUiStateFromResult({
      status: "analysis_ready",
      replayDecisionCount: 8,
    })).toEqual({ state: "analysis_ready", decisionCount: 8 });
    expect(paipuImportUiStateFromResult({ status: "invalid_url" }))
      .toEqual({ state: "invalid_url" });
    expect(paipuImportUiStateFromResult({ status: "identity_mismatch" }))
      .toEqual({ state: "identity_mismatch" });
    expect(paipuImportUiStateFromResult({ status: "no_capture" }))
      .toEqual({ state: "no_capture" });
    expect(paipuImportUiStateFromResult({ status: "unsupported_semantics" }))
      .toEqual({ state: "unsupported_semantics" });
    // analysis_failed and anything unexpected collapse to the generic
    // failure — raw internal codes never reach the user.
    expect(paipuImportUiStateFromResult({ status: "analysis_failed" }))
      .toEqual({ state: "failed" });
    expect(paipuImportUiStateFromResult({ status: "something_new" }))
      .toEqual({ state: "failed" });
  });
});
