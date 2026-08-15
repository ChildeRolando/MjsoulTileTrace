# M6-A1：Mortal 生产接入单决策切片交接

日期：2026-08-15
分支：`codex/m6-a1-mortal-production-slice`（基线 `codex/m5-h2-paipu-url-import` @ `c43e550`）

## ✅ 当前权威结论（AUTHORITATIVE — 以下一切以此为准）

```text
用户粘贴的 Mortal 结果 URL（或结果页 URL 对应的 .json 端点）
  -> parseMortalReportResultUrl        // 仅 https://mjai.ekyu.moe/report/<16-hex>.json
  -> fetchMortalReport                 // 逐跳重验、大小/Content-Type/JSON/schema 全 fail closed
  -> 最小 DTO（仅 self-perspective entries；mjai_log/split_logs 不出包）
  -> computeCanonicalGameFingerprint == computeMortalGameFingerprint   // v2：最大公开事件序列（见下）
  -> player_id == stream.selfActor                                    // 视角绑定
  -> MortalDecisionAnchor 精确 1:1（手牌 14 枚 + 摸牌 + 立直状态，绝不 junme/index/draw-tile 单独定位）
  -> importStructuredMortalComparison -> buildMortalModelEvaluation
  -> runStructuredAnalysisAssembly（同一 snapshot 的 frame + facts + responseFuriten + fact engine）
```

- **P1–P2 `@riichi-coach/mortal-source`**：URL 边界（HTTPS-only、批准 host、无 userinfo/port、长度上限、逐跳重验、4 MiB 上限、`application/json`、`redirect:"manual"`）、**source-owned timeout**（内部 `AbortController` 默认 `MORTAL_REPORT_TIMEOUT_MS`，可组合 caller signal；无 caller signal 也必定有界）、固定诊断码（`MortalSourceError`）、钉死当前 schema（`Mortal 1.5.10 / model_tag 4.1b / player_id 0..3 / review.kyokus[].entries[]`；顶层与 `review` 允许已观测附加字段，其余仍严格）。
- **P3/P4 绑定**：`mortal-game-fingerprint/v2`，`player_id != selfActor` fail closed。
- **指纹支持子集（v2，两边可互相表示才纳入）**：`game_start`；`round_start`（局风/庄家/本场/供托/起始分数/宝牌指示牌）；每次公开舍牌（actor、tile、tsumogiri/tedashi）；chi/pon/daiminkan（actor、target、called tile、consumed tiles 规范序）；ankan（actor、四枚牌规范序）；kakan（actor、加杠牌）；立直声明/接受（actor）；和牌结算（winner、target、deltas，仅两边都有 deltas 时）；`round_end` / `game_end` 边界标记。**明确排除**：tsumo/tile_drawn（对手暗牌/暗摸）、Mortal `dora`（当前 canonical mapper 未发出对应 `dora_revealed`）、`start_kyoku.tehais`（对手配牌）、昵称/账号/URL/`split_logs`、win 的 `ura_markers`/`winningTile`/`winSourceEventRef`。
- **P5/P6 锚点**：Mortal entry 的 `tehai`（14 枚本人手牌）与 canonical `concealedTiles + currentDraw` 严格多重集相等，加上摸牌/剩余牌数（可表示时）/立直状态一致；匹配唯一才继续。本地实际舍牌为权威，Mortal `actual` 只做交叉核对，不等即 `mortal_decision_actual_mismatch`。
- **P7–P10 复用**：纯 `projectKnownActionFacts` 投影；复用 `importStructuredMortalComparison`；`buildMortalModelEvaluation`（probability×100、保留 q_value、`modelReason:"unknown"`、`freezeDetailPolicy`）；`runStructuredAnalysisAssembly` 跑同一 snapshot 的五轴 + 防守矩阵。
- **P0-1 立直实际权威**：M6-A1 不扩展立直支持；`actualDiscard === null` 或 `actualDiscard.riichiDeclarationEventRef !== null` 在 Mortal import 之前直接 `mortal_decision_unsupported_entry`，绝不降级为普通 `dahai`。
- **P11 服务**：`runMortalSingleDecisionReview`（`reasoning/src/analysis/mortal-review-service.ts`），结果联合 `ready | failed(code, diagnostics) | not_comparable`，固定诊断码；所有对外 ID（anchor、comparison/evaluation/frame）一律使用 `sha256(reportId)`，原始 reportId 不出服务结果。
- **P12 诊断**：`npm run desktop:diagnose-mortal-decision -- --mortal-result-url-file=<path> --record-id=<uuid>`。URL 只从文件读，stdout/stderr 不出现 URL/reportId；结果写 `userData/mortal-decision-results/mortal-decision-result-<timestamp>.json`（0600），JSON 只含脱敏字段（self seat、decision kind、candidate count、local actual action、preferred actions、top probability、errorGap、detail class、factor analysis mode、deterministicPreference）。

## M6-A1 Mortal production single-decision slice: CLOSED / PASS

## 真人验收证据（2026-08-15，H2 样本，修复后重跑）

- 雀魂官方客户端捕获诊断：`--paipu-url=<用户 H2 分享链接> --self-actor=1` → `replay_audit_written`，`storedActionCount=978`，`canonicalEventCount=1024`，`replayDecisionCount=120`。
- 用捕获到的 INNER `GameDetailRecords` 字节 + `mapMahjongSoulRecord` + `replayCanonicalStream`，配合同一份真实 Mortal 报告（当日人工提交）重跑 `runMortalSingleDecisionReview`，脱敏结果：
  - `selfSeat = 1`
  - `decisionKind = self_turn`
  - `candidateCount = 12`
  - `localActualAction = discard 4z tedashi`
  - `modelPreferredActions = [discard 4z tedashi]`
  - `topModelProbability = 99.91077`
  - `errorGap = 0`
  - `detailClass = not_error`
  - `factorAnalysisMode = v2`
  - `deterministicPreference = null`
- 已人工逐项核对可见 Mortal 结果页：**实战动作 = 4z 手切**、**模型首选 = 4z 手切**、**首选概率 = 99.91%**，与上述结果一致。
- 脱敏证据写 `%TEMP%\mortal-m6a1\mortal-decision-sanitized.json`；不含 record ID、paipu URL、Mortal report ID、result URL、账号身份。

## 门禁

- `npm run build` 全过。
- `npx vitest run` 全过：**123 files / 1221 tests**。
- node --test 三个脚本全过：**26 + 4 + 4 = 34 tests**。
- `npm run typecheck` 全过。
- 新增/加强测试：
  - `packages/mortal-source/tests/report-url.test.ts`（URL 边界，含显式默认端口拒绝）
  - `packages/mortal-source/tests/report-fingerprint.test.ts`（v2 同一局相等；舍牌/副露/立直序列变化必变；对手暗摸差异不影响）
  - `packages/mortal-source/tests/report-fetcher.test.ts`（schema/fetch 失败矩阵、source-owned timeout、caller abort、超时不泄漏 URL/远端文本）
  - `packages/reasoning/tests/mortal-review-service.test.ts`（普通舍牌 ready；错指纹/错视角/零匹配/重复匹配/同巡不同手牌/仅同摸牌/actual 不符/模型不评实际/重复模型动作/非法候选/立直实际/actualDiscard=null 全部 fail closed）
  - `packages/desktop/tests/mortal-decision-diagnostic-runner.test.ts`（序列化 JSON、console 行、结果路径均不含 synthetic reportId）

## 已知限制与下一步

1. **账户会话恢复当日被拒**（`session_restore_rejected`，与 H2 交接第 3 条一致），所以 live review 走的是官方客户端捕获记录字节 + Node 脚本，而不是 `--diagnose-mortal-decision` 的 catalog 路线。用户重登后 `--diagnose-mortal-decision --record-id=...` 应直接可跑。
2. 当前切片只处理 `self_turn + actualDiscard != null && riichiDeclarationEventRef === null` 且 details 全为 `dahai` 的 entry；立直舍牌/实际为空/reach/hora/ankan detail 明确 `mortal_decision_unsupported_entry`，不猜测。
3. 尚未循环全部 `ReplayedDecision`（M6-A2）：把 113 个 Mortal 自视角 entry 与 120 个 canonical 决策逐个锚定，生成整盘比较集与错误列表。
4. `awaiting_mortal_verification` 持久化状态、结果导入 UI、M6-A 完整工作包（打开官方页面、复制牌谱 URL 等）仍属 M6-A 后续切片。
5. Akagi 仍未开始（M6-B），须先取得真实、版本固定的输出样本与分发授权证据。

## 变更文件

- 新增 `coach/packages/mortal-source/`（package + src + tests）
- 新增 `coach/packages/reasoning/src/analysis/mortal-review-service.ts` + test
- 新增 `coach/packages/desktop/src/mortal-decision-diagnostic-runner.ts` + test
- 修改 root `package.json`（build/typecheck/desktop 诊断脚本）、`packages/reasoning/package.json`、`packages/desktop/package.json`、`packages/desktop/src/electron-entry.ts`、`packages/desktop/src/replay-diagnostic-runner.ts`、`packages/reasoning/src/index.ts`、`coach/docs/development/ROADMAP.md`
- 本 closing fix 额外修改：`packages/mortal-source/src/report-fingerprint.ts`（v2）、`packages/mortal-source/src/report-fetcher.ts`（timeout ownership）、`packages/reasoning/src/analysis/mortal-review-service.ts`（riichi authority + reportId hash）、`packages/desktop/src/mortal-decision-diagnostic-runner.ts`（脱敏输出）
