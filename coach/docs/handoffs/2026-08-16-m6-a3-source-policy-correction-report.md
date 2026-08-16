# M6-A3 SOURCE-POLICY CORRECTION REPORT

日期：2026-08-16（source-policy correction round）
分支：`codex/m6-a3-completion`
本轮起始 HEAD：`99d4f4b`（上轮最终收口 docs 提交）
本轮 final code SHA：见下表代码提交（含本报告前的最后代码提交 `cad04b7` + 本轮收尾提交）
本轮 final docs SHA：本文档所在提交

完成线提交（99d4f4b 之上）：

| SHA | 内容 |
|---|---|
| `cad04b7` | 共享验收核心 + sourceKind 泛化 + §13 source-aware 断点身份（S5/S13/S14） |
| （本轮后续） | 雀魂验收入口 + §20 测试 A–F + §13 身份测试 + NTFS 文件名修复 + 文档修正 + 本报告 |

## 1. 修正内容（不变量重述）

**验收不变量 = 真实 + 独立本地权威 + 全 E2E——不是"仅天凤"。** 本地原始牌谱的平台身份
不是不变量；本地管线与 Mortal 管线之间的独立性才是。

- 合法样本 = 独立生产的本地 canonical 侧（绝不来自 Mortal mjai_log/split_logs/任何从
  被验报告重建的数据）+ 同一原始对局、同一视角的真实 Mortal 报告 + 绑定通过 +
  StructuredComparisonSet/ModelEvaluation/装配链走完 analysis_ready + 脱敏 artifact +
  确定性 evidenceHash + fail-closed 机械 manifest lift。
- 获批本地来源：**雀魂官方原始牌谱（首选，最终产品入口）**、**天凤权威原始牌谱
  （补充：discovery/稀有事件语料/第二验收来源）**。
- 同一原始对局 ≠ 同一数据出处：两侧各自独立获取与解析即合法（雀魂官方记录 +
  Mortal 独立复盘正是 H2 样本的形态）。
- 不要求跨平台复现；任一获批来源的 acceptedRealSampleCount ≥ 1 即可 lift 该分支。
- 永不要求"用户必须提供天凤牌谱"，除非某分支确实无其他来源（§16 工作流第 4 步）。

## 2. 共享验收核心 + sourceKind 泛化（S5/S13/S14，commit `cad04b7`）

- **`packages/reasoning/src/analysis/acceptance-core.ts`（新）**：`AcceptanceLocalSource
  {sourceKind, opaqueGameId, selfActor, canonicalStream, replayedDecisions}` +
  `runMortalAcceptanceEvidence()` = 唯一的验收 E2E 实现：绑定 → 全局复盘（验收模式
  覆盖注册表）→ 证据抽取 → 脱敏 artifact → sha256 → §16 manifest 样本。平台适配器
  不得复制其中任何一级（无第二意见、无第二实现）。
- **`acceptance-evidence.ts`**：`buildRedactedAcceptanceArtifact` 新增**必填**
  `localSourceType`，经 `assertMortalAcceptanceLocalSourceType` fail-closed 校验
  （缺失/未知 → `mortal_acceptance_artifact_source_type_invalid`）。artifact 字段
  allowlist 不变（S14：不含 raw record id / share URL / account id / log id / URL /
  report id / 昵称 / raw bytes / mjai_log）。
- **§13 source-aware 身份**：断点 pair 身份 = (sourceType, gameId, seat)；雀魂与天凤
  同 digest 不碰撞；`ACCEPTANCE_LOCAL_SOURCE_TYPES` 与 manifest schema 的
  `MORTAL_COVERAGE_LOCAL_SOURCE_TYPES` 由同步测试钉死；legacy（修正前）断点解析为
  tenhou（可恢复性保持）；未知 sourceType fail-closed。
- `scripts/tenhou-acceptance.mjs` Stage 4 改为消费共享核心（本地适配器只负责
  mapper→replay 与断点推进）；manifest 样本的 localSourceType 从断点记录读取。
- 修复潜在 NTFS 崩溃：cache/artifact/inbox 文件名 sanitize `:`（`tenhou-g:` 前缀在
  Windows 上非法——此前零 accepted/零 fetch，故未爆发）。

## 3. 雀魂第一类验收入口（S6/S12）

`scripts/majsoul-acceptance.mjs`：

- **本地侧**：INNER GameDetailRecords bytes + selfActor → **既有**生产 mapper
  `mapMahjongSoulRecord` → `validateCanonicalEventStream` → `replayCanonicalStream`。
  **无新解析器**。
- **gameId = record bytes 的内容哈希**（`majsoul-g:<sha256 前 16>`）——raw record id
  不出现在断点/artifact/manifest/控制台（仅存于进程内存，供 mapper 的
  sourceRecordRef 审计保真）。
- **报告侧**：`--result-url-file`（真实 result URL；URL 本身经
  `parseMortalReportResultUrl` 主机白名单校验）+ 可选 `--report-body`（本地保存的
  真实 raw body，经注入 fetch 喂给 `fetchMortalReport` —— **零网络、完整生产解析
  路径**，H2 形态）；无 body 时对 URL 做真实抓取（保守延迟 + 种子抖动 + 硬预算）。
  **脚本永不向 mjai.ekyu.moe 提交**——提交是操作者浏览器动作（过 Turnstile），
  脚本只下载公开结果 URL。绝不绕过 Turnstile。
- **状态机/隐私**：与 Tenhou runner 相同的 `mortal-acceptance-checkpoint/v1`
  （sourceType "mahjong_soul"）、0600 原子写、断点续跑、缓存成功永不重取、终态不
  重执行（幂等复跑实证：`PAIR terminal accepted — nothing to do`）。

## 4. H2 正式 A3 验收（S7/S8/S17）——首个被接受的真实 E2E 样本

运行：`node scripts/majsoul-acceptance.mjs --record <record.pb> --seat 1
--result-url-file <url.txt> --report-body <fresh.json> --state-dir <私有目录>`。

| 量 | 值 | §17 要求 |
|---|---|---|
| 本地决策数 replayDecisionCount | **125** | =125 ✓ |
| 源行 mortalSelfEntryCount | **113** | =113 ✓ |
| bound | **113** | =113 ✓ |
| unbound（源侧守恒推导） | **0** | =0 ✓ |
| ambiguous | **0** | =0 ✓ |
| binding_mismatch | **0** | =0 ✓ |
| analysis_ready 行 | **113**（生产模式复跑为 99 + 14 个 coverage_gate 拦截行；验收模式开栅后全部走完装配链） | 只计 analysis_ready ✓ |
| no_mortal_entry | 12 | 允许保留 |
| 守恒 | 本地 125=125 ✓；源 113=113 ✓ | ✓ |
| artifact.localSourceType | **"mahjong_soul"** | ✓ |
| evidenceHash | `sha256:b649785d975ff0be26791411ec270566c6e1f96b6b7663bfa14e9fa34ab4839a` | 确定性（复算一致；artifact 无时间戳）✓ |

- 同一 artifact → 6 个分支的 manifest 样本，**同一 evidenceHash**（§8 不重复计数：
  每分支计 1，同哈希去重）。
- registry 派生**只经** `createMortalCoverageRegistryFromManifest` → lift 6 分支：
  riichi_window / dama_with_riichi_candidate / post_call_pon / post_riichi /
  self_turn_tsumo_actual / self_turn_ankan。
- 复跑幂等：终态 pair 不重执行、manifest 逐字节稳定、0 新请求。

## 5. 度量矩阵与来源分布（S18，实测非假设）

| 分支 | accepted 总数 | 雀魂 | 天凤 |
|---|---|---|---|
| riichi_window | 1 | 1 | 0 |
| dama_with_riichi_candidate | 1 | 1 | 0 |
| post_call_pon | 1 | 1 | 0 |
| post_riichi | 1 | 1 | 0 |
| self_turn_tsumo_actual | 1 | 1 | 0 |
| self_turn_ankan | 1 | 1 | 0 |
| post_call_chi | 0 | 0 | 0 |
| dama_with_tsumo_candidate | 0 | 0 | 0 |
| self_turn_kakan | 0 | 0 | 0 |
| self_turn_kyuushu | 0 | 0 | 0 |

**6/10 分支已有真实独立证据（全部雀魂来源）。** 缺口与计划（§16 序）：
1. post_call_chi / self_turn_kakan / dama_with_tsumo_candidate → 优先扫描更多
   雀魂牌谱（产品主入口，天凤 discovery 层候选已有：chi 122 / kakan 3 /
   dama_tsumo 0——后者需雀魂或另寻样本）。
2. self_turn_kyuushu → 最廉价来源优先（§11）：天凤唯一候选在西局游戏、本地 replay
   fail-closed——需要 (a) 东/南局雀魂或天凤样本，或 (b) 西局重放支持（独立前置，
   不在收口内擅自发明）。语义不降级。

## 6. 测试与验证（S20/S21）

- **§20 测试 A–F**（`packages/reasoning/tests/acceptance-core.test.ts`，6 测试）：
  A 雀魂证据→manifest 校验→lift；B 天凤同样路径；C 混合 manifest→并集 lift；
  D 同分支双来源→计数=不同哈希数（同哈希去重）；E Mortal-mjai 伪本地来源→结构上
  不可能（allowlist 无该来源类型，artifact 与 manifest 双侧拒绝）；F localSourceType
  缺失→artifact 抛错 + manifest schema 拒绝。
- **§13 身份测试**（`packages/tenhou-source/tests/acceptance-source-policy.test.ts`，
  5 测试）：来源联合同步钉死；同 digest 双平台=两个 pair；未知 sourceType fail-closed；
  legacy 断点解析为 tenhou；plan/checkpoint 更新按来源分离。
- **门禁（本轮最终 HEAD 实测）**：build OK（6 包）；vitest **1422/1422（136 文件，
  单次干净全量）**；node --test 34/34（26+4+4）；typecheck OK（6 包）；
  GitHub CI：**No remote CI evidence.**（无 gh CLI；仓库无 .github/workflows）。

## 7. 文档修正与产品表述（S15/S16/S23）

- **ROADMAP §2** 重写为 4 步工作流：固化 H2 雀魂证据 → 扫描更多雀魂牌谱 → 仅对
  仍缺分支用 Tenhou → 只在某分支确实无其他来源时才要用户天凤数据。里程碑表剩余
  工作改为"真实独立证据验收（雀魂优先、Tenhou 补充）"。
- **A3 spec**：验收判据改为"任一获批独立本地来源入口全链命中"；新增来源政策修正
  节（独立本地权威定义、禁止 Mortal mjai_log 派生、localSourceType 必填 fail-closed）。
- **ADR-0002**：加 superseding note——核心决策（独立本地侧）不变且强化，"天凤入口"
  只是当时载体；雀魂首选、天凤补充。
- **上轮收口 handoff**：加历史标记——"用户须提供天凤 log URL"的收口路径已被本
  修正取代；其结构性事实（Turnstile、钉死语料无归档 id、西局 kyuushu）仍成立。
- **产品表述（§23）**：剩余工作 = "补齐真实独立证据；雀魂优先；Tenhou 补充"，
  绝不表述为"用户必须提供天凤牌谱"（除非某分支确实唯一出路）。

## 8. STOP 规则与最终判定（S24）

**未开始 M6-A4。** 本轮只做：固化 H2 雀魂正式证据（完成）+ 度量缺口（完成，
4 分支缺证据）。M6-A4 只能从未来的 A3 CLOSED/PASS SHA 启动。

### FINAL VERDICT

**M6-A3 NOT CLOSED（矩阵 6/10）——但来源政策修正已落地并被真实证据验证。**
首个（且目前唯一）被接受的真实独立 E2E 样本 = H2 雀魂牌谱（125/113 全绑定、
0 歧义、0 mismatch、113 analysis_ready、确定性哈希、manifest-only lift），一次
lift 6 个语义分支。剩余 4 分支（post_call_chi / dama_with_tsumo_candidate /
self_turn_kakan / self_turn_kyuushu）按 §16 序补证：雀魂扫描优先，Tenhou 补充，
kyuushu 需东/南局样本或西局重放前置。fail-closed 语义零降级；无任何来源被伪造、
无 Turnstile 绕过、无预算超支（本轮网络请求 0——H2 报告走本地缓存真实 raw body
+ 注入 fetch 的零网络生产解析路径）。
