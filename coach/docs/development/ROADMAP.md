# 当前开发路线图

本页是当前路线图。旧的完整构想仍可在 [`2026-08-01-llm-riichi-coach-product-roadmap.md`](../plans/2026-08-01-llm-riichi-coach-product-roadmap.md) 查阅，但其状态数字和部分缺口已经过时。下一阶段（Playable Review MVP）的共识基线见 [`2026-08-18-next-phase-roadmap-grill-decisions.md`](../handoffs/2026-08-18-next-phase-roadmap-grill-decisions.md) 与 ADR-0003；ContextGraph 边界见 ADR-0004 与 [Auditable Context Graph Design](../specs/2026-08-18-auditable-context-graph-design.md)。

## 产品目标

用户在本机应用登录雀魂国区账号，从近期可分析的四人南风标准规则牌谱中选择一场，获得可回放、可审计、可追问的整盘教练会话。模型只提供候选动作与选择分；麻将事实与候选间因素差异必须来自可验证的本地确定性管线。LLM 在这些有据证据之上完成跨因素权衡与教练判断（CoachJudgment），不得发明或改写任何局面事实。

## 里程碑状态

| 里程碑 | 状态 | 当前交付物 | 主要剩余工作 |
|---|---|---|---|
| 静态牌效率课程 | 完成 | 18 课、训练器、掌握度与本地计算器 | 独立维护，不阻塞桌面教练 |
| M0 严格契约与候选 | 完成 | canonical 动作、比较、事实边界、模型评价与偏好契约 | 新功能继续复用，不另建宽松旁路 |
| M1 五轴 FactorPipeline | 完成 | 同构账本、差异、确定性偏好（ADR-0003 后为 optional signal）、受管 Go sidecar | 补充新分析维度时保持证据等级 |
| M2 局面事实 | 部分完成 | canonical event v2、决策快照、牌形/等待/振听、逐威胁防守矩阵 | **pull-based 能力池**（非线性 gate）：exact fu / choice rights / 顺位条件 = 硬证据，顺位 EV / 版本化上游 behavioral heuristic / river estimate = advisory（ADR-0003），按产品 scope 拉入 |
| M3 教学证据 | 未开始 | 仅有策略边界和占位契约 | 冻结资料、引用、版本化教学规则；与 decision fact 两源分离，fixed report 稳定后启动 |
| M4 受约束追问 | 未开始 | ——（原 M4"LLM 教练"已拆分为 M6-D 解释引擎 + M7-A 固定报告 UI + M4 追问对话） | fixed report 与教学证据层稳定后的 constrained follow-up/chat；context retrieval 将建立在 M6-D1 ContextGraph 上（embeddings/GraphRAG 不是前提） |
| M5 雀魂国区接入 | 接近完成 | Electron 登录、加密恢复、最近 30 场、取回、canonical mapper、重放、脱敏 replay audit、H1 诊断命令 | 真实牌谱 H1 对照验收；未覆盖流局/杠枚举的 fixture 反证 |
| M6 模型生产接入 | 进行中 | M6-A1：Mortal 单决策切片（安全获取、指纹/视角绑定、比较集 + ModelEvaluation + assembly）；M6-A2：全量自摸面覆盖账本（全局二部绑定、120/113 无丢失、99 个支持对 analysis_ready）；M6-A3：行动支持扩展已落地（declare_riichi 契约与 riichi_discard 实现语义、自摸/杠/九种九牌终局 actual、post_riichi/post_call 决策面、真实 hora 形态钉死、10 分支 fail-closed coverage gate + §16 evidence manifest lift 路径、双平台验收入口（雀魂首选 + Tenhou 补充，共享验收核心）、H2 连续性复跑 125/113 全绑定 0 歧义）；**真实语料验收矩阵 10/10 补满（2026-08-17，双平台 §16 manifest，handoff §15）**；**M6-A4 响应面已收口（2026-08-18，wave-1 六分支 6/6 真实 E2E，详见 [M6-A4.3 wave-1 矩阵](M6-A4.3-wave1-matrix-status.md)）**；**M6-C StructuredAnalysisPackage 固化（stable evidence substrate，Slice 1–4 + whole-game golden）**；**DeterministicReviewSelector（确定性选择策略，policy v1 冻结 + 三 slice + whole-game consumer golden，2026-08-19）** | **M6-D1 Typed Context Graph substrate**；**M6-D2 Graph-grounded Coach + Validator**；M6-B Akagi 后置 |
| M7 复盘工作台 | 未开始 | 安全 IPC 和最小目录 UI | **M7-A** fixed review UI（三层，原生 DOM；消费 `DeterministicReviewSelector` 输出）；**M7-B** ReviewSession 持久化/重开 + SQLite + 产品内 Mortal 缓存（privileged 边界，ADR-0003/决策 H6） |
| M8 打包发布 | 未开始 | Electron 与 sidecar 构建基础 | 跨平台安装、升级、日志、发布验收 |

## 当前关键路径

```text
M5 manual acceptance (parallel)
→ M6-C
→ DeterministicReviewSelector
→ M6-D1
→ M6-D2
→ M7-A
→ M7-B
→ pull-based M2-next / M3 / M4
→ M6-B
→ M8
```

纵向主线：**真实一场牌 → 完整分析 → StructuredAnalysisPackage → ContextGraph projection → GraphContextSlice → CoachJudgment / ExplanationBullet → 用户可见可审计 → 保存并重开。**

> Any next development item should be evaluated by whether it makes the end-to-end review vertical slice more complete, reliable, or useful. Exceptions are explicit product-scope prerequisites, integrity fixes, privacy/security fixes, and release blockers.

### 1. M5 人工验收（并行线程）

- 运行 `npm run desktop:diagnose-mahjong-soul-replay`，对照审计文件逐项核对雀魂回放（self seat、局数/庄家/本场、初始手牌、摸切、鸣牌、立直、和牌/流局）。
- 未覆盖的流局/杠枚举（`ActionLiuJu`、`ActionAnGangAddGang`）继续保持 fail closed；真实牌谱命中时先补脱敏 fixture + RED/GREEN，再放宽。
- 发现协议差异时先补 fixture 和映射测试，再改实现。
- 真实语料验收政策沿用 ADR-0002 与 2026-08-16 source-policy 修正（雀魂首选 + 天凤补充，Mortal 报告内嵌数据永不充当本地侧）；A3 矩阵已于 2026-08-17 收口 10/10。

### 2. M6-C 固化 StructuredAnalysisPackage

M6-C 不只是“整盘把现有结果装起来”。它必须为未来的 graph projection 提供稳定
evidence substrate，至少包含：

- record / decision identity；
- component versions（确定性/来源/模型分析生产者版本，见下）；
- decision outcome（沿用七值 `MortalDecisionOutcome`：`analysis_ready` /
  `unsupported_action` / `source_row_not_expected` / `no_mortal_entry` /
  `binding_mismatch` / `model_output_incomplete` / `analysis_blocked`，不缩水）；
- renderer / LLM-safe decision context 与 `KnownGameFacts`；
- stable canonical event / evidence references；
- `CandidateFactorLedger` / `FactorFact`；
- `FactorDifference`；
- advisory signals，带 evidence class + producer/version；
- optional `DeterministicPreference`；
- `ModelEvaluation`；
- stable `EvidenceId` / provenance。

**组件版本所有权**：`StructuredAnalysisPackage` 只装**确定性/来源/模型分析生产
链**的版本——package schema 版本、canonical/replay 版本、mapper/source adapter
版本（适用时）、fact-engine identity/version、factor pipeline 版本、Mortal
source/model identity/tag，以及其他可复现性实际需要的确定性生产者版本。
**LLM prompt/解释版本一律不进 `StructuredAnalysisPackage`**：LLM
provider/model、prompt version、输出 schema 版本、validator/generation 版本属
`ReviewReport` / 解释生成侧。架构性质：**同一个 `StructuredAnalysisPackage` 可被
不同 LLM provider/model/prompt 重生成多个 `ReviewReport`**（与 M7-B ReviewSession
"引用不内嵌"一致）。

**`MortalDecisionOutcome` 语义**：`source_row_not_expected` 是合法状态——纯由本地
候选枚举决定（候选数 = 1 → Mortal 按定义不产出行），在任何源行查找前判定；
`no_mortal_entry` 保持完整性故障语义（本地枚举 ≥2 → 源行必须存在），绿色验收 run
中计数必须为 0。

边界：

- LLM 产物（CoachInference / CoachJudgment / Explanation 等）不得放入
  `StructuredAnalysisPackage`；它们属于 `ReviewReport` 的 reasoning overlay。
- `StructuredAnalysisPackage` 自身不是 graph，也不得设计成 graph；它是
  确定性/可审计分析产物，是 evidence source of truth。
- 与解释物理分离：`ReviewReport` 经 `decisionId + evidenceId` 引用，绝不内嵌。
- **与现役 `StrictAnalysisPackage` 区分**：现存的 `StrictAnalysisPackage` 是
  **早期逐决策的回归/原型产物**（`NormalizedDecision` + scene + factor buckets +
  evidence registry，由 `buildStrictAnalysisPackage` 构建、供现有 pipeline 与
  测试使用）；它**不是** M6-C 的整盘 `StructuredAnalysisPackage`。M6-C 不得通过
  静默改名/扩展现有类型来假装实现，除非未来有显式设计决策证明该迁移正确；两个概念
  在 M6-C 实现期间必须保持语义可区分（词汇表见 `CONTEXT.md`）。

### 3. DeterministicReviewSelector（确定性选择策略）

**状态：已落地（2026-08-19）**。实现规格
[`2026-08-19-deterministic-review-selector-design.md`](../specs/2026-08-19-deterministic-review-selector-design.md)
三 slice 全部完成：Slice 1 contract + policy v1 冻结（contracts）、Slice 2 纯函数
`selectReviewDecisions`（reasoning 包根导出、无 Mortal/fact-engine/LLM/graph/database
调用）、Slice 3 whole-game consumer golden（真实整盘 package 消费，M6-C 的第一个
downstream product policy 消费方）。contract 名称与 selection reason 词汇已登记
`CONTEXT.md` 词汇表。

- M6-C 之后、M6-D2 之前实现：M6-D2 的 `generateReport(analysisPackage,
  selectedDecisionIds)` 依赖一个**确定性、版本化**的 review-worthy 判定，引擎
  自身不拥有该判定权（2026-08-18 grill 决策 E3/F1）。
- 策略语义保持已冻结版本（grill F1–F3）：候选池 = analysis_ready；分歧 = actual
  （类型+tile 等价匹配）∉ preferredActions；入选 = 分歧 AND errorGap ≥ T；无差异
  分支入选渲染"已计算维度上无可区分差异"；preference 冲突仅作排序 tiebreaker；
  排序 errorGap 降序、批量上限 N；T/N 冻结进 policy 版本。
- **不是 UI 拥有**：selector 是确定性产品策略（独立于 M7-A 渲染层）；M7-A 消费
  selector 输出（入选决策 + 排序），不定义"什么值得上评审"。不新增顶级里程碑。

### 4. M6-D 解释引擎 + Validator（拆为两个内部 slice，不新增顶级 milestone）

#### M6-D1 — Typed Context Graph substrate

- 从 `StructuredAnalysisPackage` 确定性投影 `ContextGraph`；
- typed nodes / typed edges；
- stable node identity；
- origin / authority / evidenceClass / version / provenance；
- graph structural validation；
- per-decision graph/subgraph；
- deterministic `ContextSliceBuilder`。

#### M6-D2 — Graph-grounded Coach + Validator

- privileged-process `LlmProvider`（v1 单实现、BYOK、key 只在主进程）；
- `GraphContextSlice` 作为 LLM allow-list transport boundary（座位匿名，audit 只留 hash/元数据）；
- LLM 生成结构化 `CoachInference` / `CoachJudgment`；
- `ReviewReport` 保存 reasoning overlay；
- grounding validator；
- evidence-only degrade（LLM 失败永不污染分析包，`generationStatus`/`explanationStatus` 属 ReviewReport）；
- 不允许 raw CoT 进入产品 contract。

### 5. M7-A Whole-game fixed review UI

- 消费 `DeterministicReviewSelector` 输出（入选决策 + 排序；策略语义见 §3 与
  2026-08-18 grill F1–F3）；UI 不定义"什么值得上评审"。
- 三层 UI：Overview（计数含 unsupported/no_mortal_entry）→ List（tags 机械派生）→ Detail（你的选择 vs Mortal、候选分、bullets、证据展开）；原生 DOM，不引框架。
- 保持 fixed review UI，不要求 graph visualization。
- decision detail 可以沿 graph refs 展开 evidence / rationale provenance。
- 用户可以查看“这条判断基于哪些事实/估算/教练推断”。
- UI 展示的是 audit trail，不是开发者图数据库界面。

### 6. M7-B ReviewSession 持久化

- SQLite；ReviewSession 只引用（不内嵌）analysisPackage / ReviewReport；componentVersions 概念清单预留（canonical/replay、Mortal model/source、factor pipeline、selector policy、analysis package schema、LLM provider/model、prompt/schema、review report schema；其中 LLM provider/model、prompt/schema、review report schema 属 ReviewReport 侧，analysis package 只记确定性生产者版本，见 §2 M6-C）。
- 产品内 Mortal 报告缓存进入：**raw cache 属 privileged source infrastructure，不进 ReviewSession/ReviewReport**（main process only、无 renderer 暴露、无 raw audit payload；eviction 策略实现时定）。

### 7. M2-next：pull-based deterministic capability pool

- M2-next is not an independent horizontal completion gate. New fact capabilities are pulled into the critical path only when required by an explicit product scope or vertical-slice requirement.
- 分层按 ADR-0003：exact fu / choice rights / 顺位条件 = 硬证据；顺位 EV / 版本化上游 behavioral heuristic / river estimate = advisory（版本化估算，永不入 DeterministicPreference）。

### 8. 其后

- M3 教学证据层（与 decision fact 两源分离）→ M4 受约束追问对话 → M6-B Akagi（产品链稳定后）→ M8 打包发布。
- M4 未来 constrained follow-up/chat 的 context retrieval 将建立在 ContextGraph 上：

```text
question
→ decision/concept anchoring
→ typed graph traversal
→ relevant ContextSlice
→ LLM
```

- embeddings / GraphRAG retrieval 不作为当前 prerequisite。

### 9. 已收口：M6-A4 响应面（决策归属架构升级，2026-08-18 CLOSED）

M6-A4 已收口，不再位于关键路径；本条目为完成记录（详见
[M6-A4.3 wave-1 矩阵](M6-A4.3-wave1-matrix-status.md) 与
[M6-A4 响应面规格](../specs/2026-08-18-m6-a4-response-surface-design.md)）。

- **A4.0** 修正 Mortal source model：拆除 `report-fetcher.ts` 与 `mortal-review-service.ts` 两处 `last_actor == player` 归属过滤，钉死"全部 entry 为受评者视角决策"；H2 重跑确认 self-turn 绑定不回归、现有 12 个 `no_mortal_entry` 逐个获得解释。**已落地（2026-08-18）**。
- **A4.1** response replay 开窗（他家舍牌/他家杠响应窗口）。**已落地（2026-08-18）**：`replayCanonicalResponseWindows` 经共享 streamContext 打开 discard_response/kan_response 窗口，开窗权威 = canonical 事件 + 本地规则（开窗权威分离），Mortal 标记仅作源侧绑定锚点。
- **A4.2** binding validation（响应身份事实表 + 本地候选枚举与 Mortal 候选空间同构）。**已落地（2026-08-18）**：响应窗口身份事实表（owner/triggerActor/triggerEvent/offeredTile/responseKind）进入 `entryMatchesDecisionIdentity`；本地候选枚举镜像 Mortal 候选空间（chi 按搭子组合展开、none 计一候选），候选数 = 1 在源行查找前判定 `source_row_not_expected`；`runMortalFullGameReview` 接受 responseDecisions 第二分区，守恒不变量升级为"每个本地窗口要么可绑定、要么有明确无行原因"，response 源行全部入账（无本地窗口 = 守恒失败）；响应分支（resp_chi_actual / resp_pon_actual / resp_daiminkan_actual / resp_hora_actual / resp_pass_on_discard / resp_chankan_actual / resp_pass_on_kakan）加入覆盖率矩阵并 fail-closed；真实序列化钉（actor-less `none`、response daiminkan-as-ankan、response hora 无 pai 回落 offeredTile）落地。H2 复跑：self 125 决策 / 113 analysis_ready / 12 source_row_not_expected / 0 no_mortal_entry 不回归；response 37 窗口全绑定且 analysis_ready，0 unbound。
- **A4.3** wave-1 真实语料验收（`response window × actual action` 6 分支矩阵；wave-2 `resp_pass_on_kakan`/国士抢暗杠 fail-closed + 事前固定降级条款）。**已收口（2026-08-18）**：纯事件 discovery 扫描落地（`scripts/response-surface-discovery.mjs` + reasoning `response-surface-discovery.ts`，chankan 最早启动、合格局计数按 source 记入 manifest）；wave-1 六分支全部真实 E2E 取证——`resp_chi_actual`（6 例）、`resp_pon_actual`（7 例，雀魂 1 + 天凤 6）、`resp_daiminkan_actual`（1 例，天凤 d4710aa5e1eefcd7#1）、`resp_hora_actual`（5 例）、`resp_pass_on_discard`（8 例，候选族 chi/pon/daiminkan/hora 四族全部取证——hora 族「能荣而过」由天凤 chankan 局 pass 窗口取证，降级条款不再适用）、`resp_chankan_actual`（1 例，天凤 28b283816b231418#1）；`resp_pass_on_discard` 候选族子覆盖随 manifest record 携带（`responsePassFamilies` 字段）；8 份真实报告（雀魂 H2 + 天凤 7）证据落账；国士抢暗杠雀魂规则存在性已确认（雀魂允许国士無双抢暗杠，wiki 实证）——wave-2 保持 fail-closed + 降级条款。
- discovery 最早启动 chankan 纯事件扫描（wave-1 唯一无降级兜底的稀有分支）。**已落地（2026-08-18）**：`response-surface-discovery.mjs` 的纯事件走查直接分类 chi/pon/daiminkan 响应与 kakan-source ron（chankan），零 Mortal 成本；天凤语料首 200 局即命中 1 例 chankan 候选（`tenhou-g:28b283816b231418#1`）与 5 例 daiminkan 候选。
- 详见 2026-08-18 grill 决策 A1–A9。

**wave-2 顺延（fail-closed，不阻塞 A4 CLOSE）**：`resp_pass_on_kakan` 与国士抢暗杠
按冻结降级条款（N = 10,000 场，两来源合计、按 source 记入 discovery manifest；
降级条款见 M6-A4 规格）保持 fail-closed 顺延至未来真实语料命中；A4 收口不依赖
wave-2 命中。

## 明确不应提前做的事

- 不把单个实际动作伪装成候选比较；比较契约要求至少两个候选。
- 不从模型分数推断模型“为什么”选择某动作。
- 不让 LLM 发明证据层不存在的局面事实；教练判断（CoachJudgment）只能权衡已有证据——hard evidence 是约束，advisory signal 无否决权。
- 不把 helper 风险刻度称为放铳概率。
- 不在 renderer 暴露令牌、账号 ID、牌谱下载 URL 或原始字节。
- 不在缺少生产模型候选时宣称真实牌谱教学分析已经完成。
- 不提前做 Neo4j / graph database。
- 不提前接入 Microsoft GraphRAG 等完整框架。
- 不提前做 embeddings / vector DB。
- 不提前做 community detection。
- 不提前做 graph ranking / PageRank。
- 不提前做 general causal engine。
- 不保存 raw chain-of-thought。
- 不把 `supports` / `derived_from` 等论证边误称为 causal relation。

## 完成定义

每个里程碑只有同时满足以下条件才可标为完成：

1. 生产入口已接线，而不只是 fixture/helper 存在；
2. 正向、失败和信任边界测试均存在；
3. 对应全量门禁通过；
4. 真实外部能力若无法自动证明，已完成明确的人类验收；
5. 本页、架构页和相关 handoff 与代码一致。
