# M6-A2：Mortal 全量覆盖账本交接

日期：2026-08-15
分支：`codex/m6-a2-mortal-full-game-coverage`
base SHA：`5afabe29c4a1960e9f3243bb23a69692cd1acf44`
final implementation SHA：`af8981a`（本文档提交于其上）

## 1. “full-game”在本里程碑的精确定义

M6-A2 的全量覆盖指：**当前 `replayCanonicalStream()` 已暴露的 self_turn ReplayedDecision 表面**（仅自风可见 `tile_drawn` 生成的决策窗口）。**不**包括 discard_response / kan_response / post_call_discard / 全合法行动重放——那是未来的 replay-surface 工作。

## 2. 真实样本 live 本地普查（A0）

- `replayDecisionCount = 120`
- `actualDiscard === null = 1`
- `actualDiscard !== null = 119`
- `riichiDeclarationEventRef !== null = 4`
- ordinary discard = 115

## 3. 真实样本 Mortal 源普查（A0）

- self-perspective entries = 113
- `at_self_chi_pon = true`：1
- `at_self_riichi = true`：2
- `at_opponent_kakan = true`：0
- actual action types：`dahai` 108 / `reach` 4 / `hora` 1
- candidate action-type signatures：`dahai-only` 102 / `reach+dahai` 9 / `ankan-containing` 1 / `hora-containing` 1

120 local 与 113 Mortal 的差异已解释：7 个 local self-turn 决策在 Mortal 自视角 entry 中无对应（Mortal 只在自视角决策点产出 entry）；其中 10 个 local 在全局绑定中 `no_mortal_entry`，另 3 个 Mortal entry 与 local 不构成唯一绑定。

## 4. 全局绑定算法

1. 预检：canonical stream + 全部 decisions 输入合法；`computeCanonicalGameFingerprint == report.gameFingerprint`；`report.playerId == stream.selfActor`。任一失败为 whole-run failure，绝不产生部分账本。
2. 把 Mortal self entries 摊平为稳定内部源行（`ref = sha256(reportId):sourceOrdinal`）。`sourceOrdinal` 仅作为源行引用，绝不作语义匹配。
3. 对每个 local decision 计算其 identity-compatible 源行集合；对每个源行计算其 compatible local 集合。
4. **唯一匹配规则**：local degree == 1 且 source degree == 1 才 bound。无贪心、无最大匹配、无 tie-break。
5. **顺序单调性**：bound 对按 local canonical order 与 source order 必须严格递增；一旦 crossing，第二个及之后 crossing 对 fail closed 为 `source_order_violation`，源行 disposition 为 ambiguous。

## 5. 身份匹配字段（identity matching facts）

- reviewed actor（report.playerId == snapshot.selfActor）
- canonical round identity：`entry.roundOrdinal == publicState.roundOrdinal`
- `entry.roundWind == publicState.roundWind`
- `entry.dealer == publicState.dealer`
- `entry.honba == publicState.honba`
- 当前摸牌：`entry.tile`（MJAI）与 `privateState.currentDraw.tile` 精确相等（含赤五）
- 14 枚本人手牌 multiset：`entry.tehai` 与 `concealedTiles + currentDraw` 规范序完全相等
- 立直状态：`entry.atSelfRiichi == (riichiStates[self].status != "none")`
- `tiles_left == remainingDraws`（仅当 canonical 该字段 complete 时启用）

**明确不作为身份字段**：junme、source ordinal、local decision ordinal、draw tile alone、actual action。

## 6. Round identity 策略

`MortalFetchedReport` 投影时从 `mjai_log` 的 `start_kyoku` 序列生成 public round context（`roundOrdinal` 出现序、`roundWind`、`dealer`），并写入每个 kyoku/entry。指纹 v2 已证明该序列与 canonical `round_started` 序列一致，因此该出现序不是“数组位置猜测”。

## 7. 全局唯一性规则

- 一个 local 最多绑定一个 Mortal entry。
- 一个 Mortal entry 最多绑定一个 local。
- 唯一 bound 对进入 A1 原语；任何 degree>1 或顺序违例均 fail closed，不猜。

## 8. Monotonic-order 规则

bound 对按 local canonical decision order 与 source entry order 必须严格递增；crossing 对 `binding_mismatch / source_order_violation`，源行 `ambiguous`。实测 live：order violations = 0。

## 9. local conservation counts（live）

- `analysis_ready = 99`
- `unsupported_action = 11`
- `no_mortal_entry = 10`
- `binding_mismatch = 0`
- `model_output_incomplete = 0`
- `analysis_blocked = 0`
- 合计 = 120 = `replayDecisionCount` ✅

## 10. source conservation counts（live）

- `boundMortalEntryCount = 110`
- `unboundMortalEntryCount = 3`
- `ambiguousMortalEntryCount = 0`
- 合计 = 113 = `mortalSelfEntryCount` ✅

## 11. per-outcome counts

见第 9 项。

## 12. unsupported reason counts（live）

- `riichi_discard_not_supported = 4`
- `mortal_candidate_action_not_supported = 6`
- `local_actual_not_represented = 1`

## 13. supported subset size

`supportedPairCount = 99`（bound + ordinary local discard + Mortal dahai-only candidate set）。

## 14. analysis-ready count

99 / 120 local；99 / 99 supported subset。✅

## 15. model-output-incomplete count

0（live supported subset）。✅

## 16. analysis-blocked count

0（live supported subset）。✅

## 17. manual spot-check evidence

- A1 已对同一样本第一决策做过可见 Mortal UI 人工核对：实际=4z 手切、模型首选=4z 手切、首选概率=99.91%。
- A2 对同一真实 report JSON 做多点核对（与 Mortal UI 同源数据）：
  - early analysis_ready（decisionOrdinal 0）：actual `discard 4z tedashi`，top `99.91077`，Mortal entry `junme=1` 完全一致。
  - mid analysis_ready（decisionOrdinal 54）：actual `discard 3z tsumogiri`，top `99.99883`，Mortal entry `junme=5`（kyoku 4, honba 0）一致。
  - late analysis_ready（decisionOrdinal 116）：actual `discard 4s tsumogiri`，top `99.331915`，Mortal entry `junme=10`（kyoku 7）一致。
- 未发现 model-error 行；unsupported 行均带固定 subtype。

## 18. privacy audit

- full-game diagnostic 结果文件：`userData/mortal-full-game-results/mortal-full-game-result-<timestamp>.json`（0600）。
- 序列化结果只含：selfSeat、summary、sourceCoverage aggregates、decisions（decisionOrdinal/roundOrdinal/binding/support/outcome/reason/modelSummary）。
- **不含**：raw reportId、result URL、paipu URL、record UUID、account ID、nickname、raw `mjai_log`/`split_logs`、decisionEventRef、comparisonSetId、evaluationId。
- console 只输出 aggregate：`replay=120 mortal=113 bound=110 ready=99 unsupported=11 missing=10 bindingMismatch=0 modelIncomplete=0 blocked=0`。

## 19. full verification counts

- `npm run build` ✅
- `npx vitest run` ✅ **126 files / 1239 tests**
- node suites ✅ **26 + 4 + 4 = 34 tests**
- `npm run typecheck` ✅

## 20. remaining unsupported action classes

- 立直舍牌（riichi discard）4 个 local：A1/A2 不扩展，固定 `riichi_discard_not_supported`。
- `actualDiscard === null` 1 个 local：当前 replay 不暴露自摸/暗杠等 terminal 行动，固定 `local_actual_not_represented`。
- Mortal 候选集含非 `dahai` 行动 6 个（reach+dahai / ankan / hora 候选）：固定 `mortal_candidate_action_not_supported`。
- 3 个 Mortal entry 未与任何 local 唯一绑定：需在下一轮结合源普查逐条核对语义（不视为无害，已如实计入 `unbound`）。

## 21. next recommended milestone

基于普查，最大可回收 coverage 是 **Mortal 候选集/实际行动扩展**（6 个候选集非 dahai + 4 个立直 + 1 个 terminal 行动）。建议：

**M6-A3 = self-turn 非普通舍牌支持**：先扩展立直舍牌与 Mortal `reach+dahai` 候选集（A1 路径已具备 `riichi_discard` 适配器雏形），再处理 `actualDiscard === null` 的 terminal（需 replay surface 暴露自摸/杠动作）。

## 22. 变更文件

- 新增 `coach/packages/reasoning/src/analysis/mortal-full-game-review.ts`
- 新增 `coach/packages/reasoning/tests/mortal-full-game-review.test.ts`
- 新增 `coach/packages/desktop/src/mortal-full-game-diagnostic-runner.ts`
- 新增 `coach/packages/desktop/tests/mortal-full-game-diagnostic-runner.test.ts`
- 新增 `coach/packages/mortal-source/fixtures/current-mortal-report.synthetic.json`
- 新增 `coach/packages/mortal-source/tests/report-schema.test.ts`
- 修改 `coach/packages/reasoning/src/analysis/mortal-review-service.ts`（提取/导出 binding primitives、`runBoundMortalDecisionReview`、round identity）
- 修改 `coach/packages/mortal-source/src/report-fetcher.ts`（投影 roundOrdinal/roundWind/dealer）
- 修改 `coach/packages/reasoning/src/index.ts`、`coach/packages/desktop/src/electron-entry.ts`、`coach/package.json`
- 修改 `coach/docs/development/ROADMAP.md`

## 23. A2 close

M6-A2 可标记 **CLOSED / PASS**：全量覆盖账本守恒、全局二部绑定确定、live supported subset 99/99 分析成功、无 model/analysis 失败、隐私输出达标。
