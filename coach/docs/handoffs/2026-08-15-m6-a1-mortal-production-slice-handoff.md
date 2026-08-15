# M6-A1：Mortal 生产接入单决策切片交接

日期：2026-08-15
分支：`codex/m6-a1-mortal-production-slice`（基线 `codex/m5-h2-paipu-url-import` @ `c43e550`）

## ✅ 当前权威结论（AUTHORITATIVE — 以下一切以此为准）

```text
用户粘贴的 Mortal 结果 URL（或结果页 URL 对应的 .json 端点）
  -> parseMortalReportResultUrl        // 仅 https://mjai.ekyu.moe/report/<16-hex>.json
  -> fetchMortalReport                 // 逐跳重验、大小/Content-Type/JSON/schema 全 fail closed
  -> 最小 DTO（仅 self-perspective entries；mjai_log/split_logs 不出包）
  -> computeCanonicalGameFingerprint == computeMortalGameFingerprint   // 公开局骨架：局风/庄/本场/分数/宝牌
  -> player_id == stream.selfActor                                    // 视角绑定
  -> MortalDecisionAnchor 精确 1:1（手牌 14 枚 + 摸牌 + 实际舍牌，绝不 junme/index/draw-tile 单独定位）
  -> importStructuredMortalComparison -> buildMortalModelEvaluation
  -> runStructuredAnalysisAssembly（同一 snapshot 的 frame + facts + responseFuriten + fact engine）
```

- **P1–P2 `@riichi-coach/mortal-source`**：URL 边界（HTTPS-only、批准 host、无 userinfo/port、长度上限、逐跳重验、4 MiB 上限、`application/json`、`redirect:"manual"`、`AbortSignal.timeout`）、固定诊断码（`MortalSourceError`）、钉死当前 schema（`Mortal 1.5.10 / model_tag 4.1b / player_id 0..3 / review.kyokus[].entries[]`；顶层与 `review` 允许已观测附加字段，其余仍严格）。
- **P3/P4 绑定**：`mortal-game-fingerprint/v1` 只取公开局骨架（局风/庄家/本场/分数/宝牌），Mortal `mjai_log` 与 canonical `round_started` 同一哈希；`player_id != selfActor` fail closed。
- **P5/P6 锚点**：Mortal entry 的 `tehai`（14 枚本人手牌）与 canonical `concealedTiles + currentDraw` 严格多重集相等，加上摸牌/实际舍牌/立直状态一致；匹配唯一才继续。本地实际舍牌为权威，Mortal `actual` 只做交叉核对，不等即 `mortal_decision_actual_mismatch`。
- **P7–P10 复用**：纯 `projectKnownActionFacts` 投影；复用 `importStructuredMortalComparison`；`buildMortalModelEvaluation`（probability×100、保留 q_value、`modelReason:"unknown"`、`freezeDetailPolicy`）；`runStructuredAnalysisAssembly` 跑同一 snapshot 的五轴 + 防守矩阵。
- **P11 服务**：`runMortalSingleDecisionReview`（`reasoning/src/analysis/mortal-review-service.ts`），结果联合 `ready | failed(code, diagnostics) | not_comparable`，固定诊断码。
- **P12 诊断**：`npm run desktop:diagnose-mortal-decision -- --mortal-result-url-file=<path> --record-id=<uuid>`。URL 只从文件读，stdout/stderr 不出现 URL；结果写 `userData/mortal-decision-results/<recordId>.json`（0600）。

## 真人验收证据（2026-08-15，H2 样本）

- 雀魂官方客户端捕获诊断：`--paipu-url=<用户 H2 分享链接> --self-actor=1` → `replay_audit_written`，`storedActionCount=978`，`canonicalEventCount=1024`，`replayDecisionCount=120`，`recordBytesPath=%TEMP%\mahjong-soul-captured-record.pb`。
- 随后用捕获到的 INNER `GameDetailRecords` 字节 + `mapMahjongSoulRecord` + `replayCanonicalStream`，配合同一份真实 Mortal 报告（当日人工提交）跑 `runMortalSingleDecisionReview`：
  - `decisionEventRef = majsoul:<recordId>/0/13/0`
  - `anchor = { reportId, kyoku: 0, honba: 0, junme: 1 }`
  - `candidates = 12`（比较集与模型评价均 12）
  - `actualActionRef = action:v1:["discard",["4z",false],"tedashi"]`
  - `errorGap = 0`（实战为模型首选）
  - `factorResult.analysisMode = v2`
- 脱敏证据已写 `%TEMP%\mortal-m6a1\mortal-decision-<recordId>.json`（不包含结果 URL、`mjai_log`、`split_logs`、昵称；只含 decision/actionRef/origins/rawValues/modelSelectionScore/factor diagnostics）。

## 门禁

- `npm run build` 全过。
- `npm test` 全过：vitest 122 files / 1200 tests，node --test 三个脚本 34 tests。
- 新增测试：`packages/mortal-source/tests/*`（URL 边界、schema/fetch 失败矩阵、指纹）、`packages/reasoning/tests/mortal-review-service.test.ts`（legacy East-1 turn 6 全链 ready）。

## 已知限制与下一步

1. **账户会话恢复当日被拒**（`session_restore_rejected`，与 H2 交接第 3 条一致），所以 live review 走的是官方客户端捕获记录字节 + Node 脚本，而不是 `--diagnose-mortal-decision` 的 catalog 路线。用户重登后 `--diagnose-mortal-decision --record-id=...` 应直接可跑。
2. 当前切片只处理 `self_turn + actualDiscard != null` 且 details 全为 `dahai` 的 entry；reach/hora/ankan detail 明确 `mortal_decision_unsupported_entry`，不猜测。
3. 尚未循环全部 `ReplayedDecision`（M6-A2）：把 113 个 Mortal 自视角 entry 与 120 个 canonical 决策逐个锚定，生成整盘比较集与错误列表。
4. `awaiting_mortal_verification` 持久化状态、结果导入 UI、M6-A 完整工作包（打开官方页面、复制牌谱 URL 等）仍属 M6-A 后续切片。
5. Akagi 仍未开始（M6-B），须先取得真实、版本固定的输出样本与分发授权证据。

## 变更文件

- 新增 `coach/packages/mortal-source/`（package + src + tests）
- 新增 `coach/packages/reasoning/src/analysis/mortal-review-service.ts` + test
- 新增 `coach/packages/desktop/src/mortal-decision-diagnostic-runner.ts`
- 修改 root `package.json`（build/typecheck/desktop 诊断脚本）、`packages/reasoning/package.json`、`packages/desktop/package.json`、`packages/desktop/src/electron-entry.ts`、`packages/desktop/src/replay-diagnostic-runner.ts`、`packages/reasoning/src/index.ts`、`coach/docs/development/ROADMAP.md`
