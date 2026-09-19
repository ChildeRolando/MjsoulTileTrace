import {
  COACH_REASONING_DRAFT_SCHEMA_VERSION, COACH_REVIEW_PROMPT_VERSION,
  type ContextGraph, type LlmCoachRequest, type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import { canonicalJson } from "./analysis/package-identity.js";
import { buildGraphContextSlice } from "./context-graph/build-graph-context-slice.js";

// Frozen coach-review-prompt/v1. Changes to these bytes require a new version.
const TEMPLATE = `你是日麻复盘教练。仅使用下面 GraphContextSlice 中的证据，用 zh-CN 输出 JSON。
只输出 coach-reasoning-draft/v1：{"decisions":[{"decisionId":"...","judgment":{"localId":"j","recommendation":"actionRef","confidence":"high|medium|low","premiseRefs":["nodeId"]},"inferences":[{"localId":"i","statement":"权衡表达","premiseRefs":["nodeId"]}],"explanations":[{"text":"教学表达","claims":[{"kind":"factor_difference|factor_fact","evidenceRef":"nodeId"}],"judgmentLocalRef":"j"}]}]}。
每个入选决策恰好一个 judgment；inferences 和 explanations 可省略。只复制 slice 中的 decisionId、nodeId 和 actionRef；judgment 前提也可引用同决策 inference 的 localId。不得生成 nodeId、edgeId 或 reportId。
不得发明、修改或补全局面事实、候选数值、差异方向。hard evidence 是不可抵触的约束；advisory 只供参考，可不认可但不得修改其值与来源。不得声称知道 Mortal/Akagi 内部原因，modelReason 恒为 unknown。
事实数字一律用 {diff:<differenceId>.<field>} 或 {candidate:<actionRef>.<field>} 占位符；自由文字仅用于权衡与教学组织。claims.kind 必须匹配证据类型。引用只限同一决策。不得输出 raw chain-of-thought、reasoning 字段或其他 schema 外字段。
GraphContextSlice:
`;

/** Builds its own D1 slice; callers cannot attach raw package/graph fields. */
export function buildCoachRequest(graph: ContextGraph, selection: ReviewSelectionResult): LlmCoachRequest | null {
  const slice = buildGraphContextSlice(graph, selection);
  if (slice.selectedDecisionIds.length === 0) return null;
  return {
    promptVersion: COACH_REVIEW_PROMPT_VERSION,
    draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
    prompt: TEMPLATE + canonicalJson(slice), temperature: 0, maxOutputTokens: 8192,
  };
}
