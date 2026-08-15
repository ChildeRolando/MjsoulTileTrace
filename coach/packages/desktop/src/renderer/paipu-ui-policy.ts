// Pure presentation policy for the "通过牌谱链接分析" section. The renderer
// page is a sandboxed file:// document with no package imports, so the share
// URL shape is mirrored here for a client-side pre-check ONLY — the main
// process strict-parses the URL again before any BrowserWindow exists, and
// that parse is the authority. The analysis seat is never chosen here: the
// main process resolves it from the URL's perspective identity.

// Keep in lockstep with parseMahjongSoulCnShareUrl in @riichi-coach/contracts.
const PAIPU_SHARE_URL_PATTERN =
  /^https:\/\/game\.maj-soul\.com\/1\/\?paipu=(\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_a([1-9]\d{0,9})$/u;

export function paipuShareUrlLooksValid(value: string): boolean {
  if (typeof value !== "string" || value.length > 512) return false;
  const match = PAIPU_SHARE_URL_PATTERN.exec(value);
  return match !== null && Number(match[2]) <= 4_294_967_295;
}

export type PaipuImportUiState =
  | { readonly state: "idle" }
  | { readonly state: "invalid_url" }
  | { readonly state: "pending" }
  | { readonly state: "analysis_ready"; readonly decisionCount: number }
  | { readonly state: "identity_mismatch" }
  | { readonly state: "unsupported_semantics" }
  | { readonly state: "no_capture" }
  | { readonly state: "failed" };

// Fixed, human-readable labels only — raw internal error codes and account
// identities are never shown to the user.
export function paipuImportStatusLabel(view: PaipuImportUiState): string {
  switch (view.state) {
    case "idle": return "粘贴雀魂牌谱分享链接。";
    case "invalid_url": return "牌谱链接格式无效";
    case "pending": return "正在通过雀魂客户端读取牌谱…";
    case "analysis_ready": return `牌谱已导入，可分析 ${view.decisionCount} 个决策点`;
    case "identity_mismatch": return "无法确定这份牌谱的分析视角";
    case "unsupported_semantics": return "这场牌谱包含当前尚未支持的记录类型";
    case "no_capture": return "未能从雀魂客户端取得牌谱";
    case "failed": return "牌谱解析未完成，请稍后重试。";
  }
}

// Maps the fixed safe IPC result to the UI state. Anything unexpected is the
// generic failure — never a raw code or identity passthrough.
export function paipuImportUiStateFromResult(result: {
  readonly status: string;
  readonly replayDecisionCount?: number;
}): PaipuImportUiState {
  switch (result.status) {
    case "analysis_ready":
      return {
        state: "analysis_ready",
        decisionCount: typeof result.replayDecisionCount === "number"
          ? result.replayDecisionCount
          : 0,
      };
    case "invalid_url": return { state: "invalid_url" };
    case "identity_mismatch": return { state: "identity_mismatch" };
    case "no_capture": return { state: "no_capture" };
    case "unsupported_semantics": return { state: "unsupported_semantics" };
    default: return { state: "failed" };
  }
}
