# M6-C：StructuredAnalysisPackage 固化规格

日期：2026-08-18
决策来源：[2026-08-18 下一阶段 roadmap 盘问决策记录](../handoffs/2026-08-18-next-phase-roadmap-grill-decisions.md)（D1–D4，含 supersession notes；已定稿）；
路线图口径：[`ROADMAP.md`](../development/ROADMAP.md) §2；
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准；证据分层语义见
[ADR-0003](../adr/0003-evidence-first-coaching-judgment-and-authority-layers.md)；
graph 边界见 [ADR-0004](../adr/0004-context-graph-as-auditable-llm-boundary.md)
与 [Auditable Context Graph Design](./2026-08-18-auditable-context-graph-design.md)；
七值 outcome 契约见 [M6-A4 响应面规格](./2026-08-18-m6-a4-response-surface-design.md)。

## Problem Statement

用户最终要拿到一份"可回放、可审计、可追问"的整盘教练报告，而解释引擎（M6-D2）、
固定复盘 UI（M7-A）、持久化（M7-B）与未来追问（M4）都要求先有一个稳定的
**整盘确定性证据基座**。当前系统可以逐决策跑到 `analysis_ready`，且
`runBoundMortalDecisionReview()` 成功时实际上已经拥有
`comparisonSet + modelEvaluation + factorResult`，但 `runMortalFullGameReview()`
最终只留下 `MortalFullGameModelSummary`——完整分析在 whole-game boundary 被
压缩掉了。

如果没有 M6-C：

- "整盘分析"只是内存中一次性的统计，无法成为 ReviewReport 的证据来源；
- ContextGraph 没有可投影的稳定 substrate（ADR-0004 的直接前置缺失）；
- 解释层只能拿到临时的、可能被后续实现改形的对象，无法建立
  `decisionId + evidenceId` 的引用契约；
- 同一分析结果无法换不同 LLM/prompt 重生成多个 ReviewReport；
- 现有 `StrictAnalysisPackage` 是**逐决策回归/原型产物**，语义与整盘产物不同，
  若被静默改名/扩产实现，会污染两条语义线。

因此 M6-C 的定义是：

> **M6-C = 保留已经计算出来的完整 evidence，而不是新增分析能力。**

## Solution

新增 `StructuredAnalysisPackage`：一个**整盘、确定性构建、可审计、可序列化**的
分析产物，是 evidence source of truth。它由整盘 review 的结果一次性固化，包含
record/decision identity、组件版本、七值 outcome、renderer-safe / locally
auditable normalized decision context 与 KnownGameFacts、canonical
event/evidence 引用与 registry、CandidateFactorLedger / FactorFact、
FactorDifference、optional DeterministicPreference、ModelEvaluation 与
stable EvidenceId/provenance。advisory semantics 不再有独立载荷：由
FactorFact / FactorDifference 的 authority classification
（`versioned_upstream_estimate` / `heuristic_only`，ADR-0003）承担。
LLM 产物一律不进 package。

`StructuredAnalysisPackage` 自身不是 graph，不替代未来的 ContextGraph，而是后者
的确定性投影来源。它在权限上的位置是：

```text
StructuredAnalysisPackage
    locally safe / renderer-safe evidence artifact
              ↓
ContextGraph
              ↓
GraphContextSlice
    ONLY LLM transport-safe artifact
              ↓
LLM
```

用户可见的变化是：整盘分析可以被保存、引用、重放与投影；同一份分析可被未来
UI 审计，也可被不同解释引擎反复消费；"这条判断基于哪些事实/差异/模型评分"在
M6-D 之前就已有稳定的机器可读答案。

## User Stories

1. 作为复盘用户，我想让整盘复盘产出的是一个可保存的完整分析产物，而不是只打印一次的控制台统计，这样我可以事后重新打开同一份分析。
2. 作为复盘用户，我想让分析产物包含每一局、每一个决策窗口的稳定身份（哪一局、哪一巡、哪个决策事件），这样我可以定位到具体的那一手。
3. 作为复盘用户，我想让每个决策都携带七值 outcome，这样我能区分"已分析"、"合法无源行"、"动作不支持"与"完整性故障"，而不是看到含糊的"失败"。
4. 作为复盘用户，我想让分析产物包含每个候选的完整因素账本，这样我可以查看某个候选的牌效、打点、防守、顺位、副露价值分别是什么。
5. 作为复盘用户，我想让分析产物包含候选间的 FactorDifference，这样我可以看到"我的选择 vs Mortal"在哪个维度、差多少、方向支持谁。
6. 作为复盘用户，我想让分析产物包含 ModelEvaluation，这样我可以看到模型对每个候选的评分、偏好动作与 errorGap。
7. 作为复盘用户，我想让分析产物区分确定性事实与版本化估算，这样我不会把 helper 风险刻度误当成可证明事实。
8. 作为复盘用户，我想让分析产物在本地确定性偏好存在时明确记录它、在轴间冲突时为 null，这样我知道哪些结论是规则导出的、哪些要留给教练判断。
9. 作为复盘用户，我想让分析产物的每个证据都带稳定 EvidenceId 与 provenance，这样任何一条因素都能追溯到 canonical 事件或事实引擎。
10. 作为复盘用户，我想让同一份分析产物将来可以被不同 LLM/prompt 重新生成多份教练报告，这样我可以比较不同解释而不重新拉 Mortal 报告。
11. 作为解释引擎（M6-D2）的调用方，我想从 `generateReport(analysisPackage, selectedDecisionIds)` 只读消费整盘证据，这样我不需要重新跑事实管线。
12. 作为未来 ContextGraph 投影（M6-D1）的开发者，我想让 StructuredAnalysisPackage 提供稳定的 record/decision identity 与 provenance，这样 graph 投影是纯确定性转换。
13. 作为未来 Review UI 的开发者，我想让 package 提供 renderer-safe 的决策上下文与 KnownGameFacts，这样渲染层不接触 privileged 原始牌谱或下载 URL。
14. 作为未来 ReviewSession 持久化（M7-B）的开发者，我想让 Session 只引用 analysisPackage 而不内嵌它，这样同一分析包可被复用与重开。

## Contract Requirements

### CR-1：package 永远不是 LLM transport boundary

- `StructuredAnalysisPackage` 是 **locally safe / renderer-safe evidence
  artifact**，不是 LLM-safe transport。spec 中不得再出现
  "renderer / LLM-safe decision context" 这类把 package 标成 LLM-safe 的措辞；
  统一称为 **renderer-safe / locally auditable normalized decision context**。
- `StructuredAnalysisPackage` is never an LLM transport boundary。M6-D2 不得
  把 package 或 `DecisionAnalysis` 直接发给 LLM。只有 `GraphContextSlice`
  可以跨过 LLM 边界。
- `generateReport(analysisPackage, selectedDecisionIds)` 可以作为**服务层 API**
  存在，但内部必须走：

  ```text
  package
  → ContextGraph
  → ContextSliceBuilder
  → GraphContextSlice
  → provider
  ```

### CR-2：contract ownership 可编译，不产生反向依赖

- `MortalDecisionOutcome`、`MortalDecisionReason`（binding/unsupported/
  model-incomplete/analysis-blocked 各 reason union）、`SingleCandidateProof`
  等 outcome/proof/reason 语义的 schema **属于 contracts 包**。reasoning 包
  反向 import contract，不再拥有重复 union。
- Slice 1 即可在 contracts 中定义
  `StructuredAnalysisPackage` / `RecordAnalysis` / `DecisionAnalysis` /
  `ComponentVersions` / `EvidenceId` 及其依赖的 outcome/proof/reason schema。
- `DecisionAnalysis` 不把 provider 特定 outcome 伪装成 provider-neutral
  真理。概念形状：

  ```text
  DecisionAnalysis
    analysisProvider:
      kind: "mortal"
      outcome: MortalDecisionOutcome
      reason: MortalDecisionReason | null
      singleCandidateProof?: SingleCandidateProof | null
  ```

  未来可扩 `kind: "akagi"`。既保留已冻结的七值 Mortal semantics，又不把
  `no_mortal_entry` 这类语义伪装成所有模型共有。

### CR-3：EvidenceId 有 identity/resolution contract，package 自包含可审计

- `EvidenceId = string` 不足以建立 provenance architecture。package 必须
  携带 **evidence registry**，每个被引用的 evidence 有概念上的
  `EvidenceRecord`：

  ```text
  EvidenceRecord
    evidenceId
    kind: canonical_event | fact_engine_request | ...
    producer
    producerVersion
    sourceRefs[]
    payload        # 脱敏后的可解析 descriptor/payload
  ```

- `FactorFact.evidenceIds`、`FactorDifference.evidenceIds`、
  `KnownGameFacts.evidenceIds` 全部必须解析进 evidence registry。
- canonical event evidence 必须在 package 内保存**脱敏后的 canonical
  evidence descriptor/payload**，使 package 是 self-contained audit
  artifact：只有 package 本身时，evidence ref 仍必须有意义、可解析。
  不需要整份 raw paipu，但**不能**只留一个裸 eventRef 然后依赖 raw cache。
- raw Mortal/source cache 仍属 privileged-process data，不进 package；
  其未来独立 eviction 不得破坏 package 的审计自包含性。

### CR-4：stable identity 在 Slice 1 冻结

- `decisionId` 的 identity semantics 由以下字段共同决定（概念上）：

  ```text
  game identity
  + self actor
  + surface（self / response）
  + decision window kind
  + triggerEventRef
  ```

  具体字符串格式由实现设计，但必须满足：
  - 同一 canonical stream + 同一 decision window → 同一 `decisionId`；
  - 跨 rerun 稳定（只要语义输入一致，不随 wall-clock 变化）；
  - 跨 mapper version **不保证**稳定；mapper 版本变化导致的 canonical
    event ref 变化由 `componentVersions` 显式记录。
- `packageId` 不再是"record identity + self actor + provider + schema
  版本"的单一 semantic identity（Slice 1 评审 Blocker 3A 收口），改为
  **identity split**：
  - **`analysisKey` = logical slot**：由 record identity + self actor +
    analysis provider 派生，跨 rerun **且跨 model/fact-pipeline 版本稳定**；
    它回答"哪个分析槽位"，不回答"哪个产物"。
  - **`packageId` = artifact identity**：由 `analysisKey` +
    `componentVersions` + **显式冻结的 policy snapshot** 派生；同一 slot
    在不同 model/fact-pipeline 版本下产出**不同** packageId，ReviewSession
    引用无语义碰撞。跨 rerun 稳定；wall-clock 与 artifact creation metadata
    不进入 packageId。
  - `packageId ≠ semanticContentHash`：hash（CR-5）是内容级去重/比对，
    packageId 是产物引用。
- EvidenceId namespace（Slice 1 评审 Blocker 2 收口）：**保留现有 production
  identity，不做强制改名**。canonical event evidence 沿用既有 canonical
  事件 ref 命名空间（production canonical events 已满足，零改名成本）；
  fact-engine request 等派生 evidence 直接保留 production request id
  （如 `<factSetId>:hand-structure:<stateHash>`），**不再要求显式 kind
  前缀，不设 ID 翻译层**；registry key 全局唯一（key === record.evidenceId）。
  仅在观察到真实 collision 时才引入按 kind/producer 的命名空间前缀。

### CR-5：determinism / time semantics 精确化

- package 是 **deterministic-to-construct / non-LLM authoritative
  artifact**：给定全部语义输入（stream、report、engine results、component
  versions）与**显式冻结的 policy snapshot / frozenAt**，构建出相同 package。
- 当前 `frozenAt` 来自 wall-clock 并进入
  `ModelEvaluation.detailPolicy.frozenAt`。因此不能承诺"byte-equivalent"。
  区分：
  - **semanticContentHash**：对确定性语义内容计算，**不包含** artifact
    creation metadata（createdAt、frozenAt 不作为内容参与哈希，但
    frozenAt 的**语义版本值**在构造输入中显式给出）；
  - **createdAt / artifact metadata**：可以不同，只作 provenance，不影响
    语义相等。
- `ModelEvaluation` 是**可审计的模型证据**，不是 hard deterministic
  Mahjong fact。package 里"确定性内容"的准确含义是
  **deterministic-to-construct + non-LLM authoritative**，而不是把模型
  评分冒充局面真相；评分由 ModelEvaluation 的 engine/version/score 字段
  自证来源。

### CR-6：package validity ≠ analysis completeness

- `coverage_ready` 不等于整盘完全健康。`runMortalFullGameReview()` 可以
  在 ledger 中存在 `no_mortal_entry` / `binding_mismatch` /
  `unsupported_action` / `analysis_blocked` 时仍返回 `coverage_ready`，
  这是合理的：M7-A 需要展示这些状态。
- 因此：
  - **schema validity invariant**：一个结构上合法的
    `StructuredAnalysisPackage` 可以忠实记录一次不完全/失败的分析；
    validator 不得因为 `no_mortal_entry != 0` 拒绝 package。
  - **release/golden acceptance invariant**：绿色验收 run 中
    `no_mortal_entry == 0`。这是发布门断言，不是 schema 校验断言。
  - `RecordAnalysis` 携带 aggregate status（概念值：
    `complete` / `degraded` / `integrity_failed`，具体命名实现可定），
    忠实标记这次分析的整体状态；**不能把失败伪装成成功**。

## Implementation Decisions

- **实施切片（严格窄切，不一口气实现整个 M6-C）**：
  1. **Slice 1 — 冻结 contract**：在 contracts 包落地
     `StructuredAnalysisPackage`、`RecordAnalysis`、`DecisionAnalysis`、
     `ComponentVersions`、`EvidenceId` 及 CR-2 所述
     outcome/reason/proof schema。不接 production assembly，不写 builder。
     identity semantics（CR-4）与 evidence registry 形状（CR-3）在此切片
     冻结。
  2. **Slice 2 — 接 production assembly**：`MortalFullGameReview` →
     retain full ready result → `DecisionAnalysis` →
     `StructuredAnalysisPackage`。**禁止**现在的
     `runBoundMortalDecisionReview` 把 full result 丢掉、之后再 rerun
     analysis 来拼包。一次计算，一次形成 authoritative artifact；能避免
     就绝不重新计算。
  3. **Slice 3 — serialization / validator / provenance**：JSON roundtrip、
     stable IDs、version validation、cross-reference validation（所有
     evidenceIds 解析进 registry）、no LLM fields。validator 按 CR-6 区分
     schema validity 与 analysis completeness。
  4. **Slice 4 — whole-game golden**：real canonical fixture + self
     decisions + response decisions + Mortal + factor pipeline →
     `StructuredAnalysisPackage`。现有 golden test 继续保护旧 semantic
     spine，直到新的 production golden 足够成熟再讨论迁移；不为"统一漂亮"
     马上删除旧测试。
- **产物定位**：`StructuredAnalysisPackage` 是整盘确定性构建/可审计分析产物，
  是 evidence source of truth；是 ContextGraph 的投影来源（ADR-0004），但
  自身不是 graph，也不得设计成 graph；v1 不新增第三个持久化 canonical
  artifact，ReviewSession 仍只引用 StructuredAnalysisPackage 与 ReviewReport。
- **七值 outcome 契约（D1 已被 A4.0 取代后的现行口径）**：沿用七值
  `MortalDecisionOutcome`：`analysis_ready` / `unsupported_action` /
  `source_row_not_expected` / `no_mortal_entry` / `binding_mismatch` /
  `model_output_incomplete` / `analysis_blocked`，不缩水。
  `source_row_not_expected` 是合法状态（本地候选数 = 1，源行查找前判定）；
  `no_mortal_entry` 保持完整性故障语义，绿色验收 run 中必须为 0。
- **解释与分析物理分离（D2）**：package 只装确定性/来源/模型分析内容。
  `CoachJudgment` / `ExplanationBullet` / `CoachInference` 等 LLM 产物放
  独立 `ReviewReport`，经 `decisionId + evidenceId` **引用**包内容、绝不
  内嵌；类型结构上保证 LLM 产物无法改写分析包。
- **载荷粒度（D3）**：每决策携带**全量** ledgers 与 differences，不按引用
  裁剪。本地分析本地存储，SQLite 时代 MB 级整盘载荷可接受。
- **组件版本所有权（D4 及其 supersession）**：版本字段按组件展开，不用单一
  `pipelineVersion`。package 只装**确定性/来源/模型分析生产链**版本：package
  schema 版本、canonical/replay 版本、mapper/source adapter 版本（适用时）、
  fact-engine identity/version、factor pipeline 版本、Mortal source/model
  identity/tag，以及其他可复现性实际需要的确定性生产者版本。**LLM
  provider/model、prompt version、输出 schema 版本、validator/generation
  版本归 ReviewReport**。同一 `StructuredAnalysisPackage` 可被不同 LLM/prompt
  重生成多个 `ReviewReport`。
- **包内容清单**（来自 ROADMAP §2 M6-C，结合 CR-1/CR-3 修订）：
  - record / decision identity（CR-4）；
  - component versions；
  - 七值 decision outcome（CR-2，provider-scoped）；
  - renderer-safe / locally auditable normalized decision context 与
    `KnownGameFacts`；
  - stable canonical event / evidence references 与 **evidence registry**
    （CR-3，自包含可解析）；
  - `CandidateFactorLedger` / `FactorFact`；
  - `FactorDifference`；
  - `StructuredComparisonSet`（action-bound：保存 actionRef → RiichiAction
    与 actual ↔ model realization 对应关系；`analysis_ready` 决策携带）；
  - 无独立 advisory signal 载荷：advisory semantics 由 FactorFact /
    FactorDifference 的 authority classification（`versioned_upstream_estimate` /
    `heuristic_only`）承担；
  - optional `DeterministicPreference`；
  - `ModelEvaluation`；
  - stable `EvidenceId` / provenance。
- **决策载荷一致性**：每个 decision entry 的 outcome 与其载荷按类型级约束
  绑定：只有 `analysis_ready` 决策携带完整的 `StructuredComparisonSet` +
  ledgers / differences / modelEvaluation；失败/跳过决策携带其 reason/proof
  与空载荷，不得伪造"有分析"的形态。
- **构建路径（不重算）**：`runMortalFullGameReview` 在 `coverage_ready`
  时保留每个走到 review 阶段的决策的完整逐决策载荷（StructuredComparisonSet、
  model evaluation、factor result），供 builder 固化；失败/跳过决策仍只
  保留 ledger 行。builder 是纯投影式组装：拼包过程不调用事实引擎、不访问
  Mortal、不重跑 `runBoundMortalDecisionReview`。
- **严格校验（按 CR-5/CR-6）**：validator 做 schema 校验、引用完整性、
  版本字段非空、无 LLM 产物字段、无 privileged 原始载荷、evidence registry
  可解析；不因分析不完整拒绝 package。语义相等用 semanticContentHash
  表达，不含 artifact creation metadata。
- **renderer-safe 上下文**：package 的 renderer-safe 上下文只含匿名座位/
  角色与渲染需要的归一化字段；不含账号 ID、昵称、令牌、牌谱下载 URL、
  原始字节、cookie。`KnownGameFacts` 以归一化事实形式存在，与 privileged
  source 数据分离。
- **与 `StrictAnalysisPackage` 的边界**：现役 `StrictAnalysisPackage` 是早期
  逐决策回归/原型产物。M6-C **不得**通过静默改名/扩展现有类型来假装实现
  `StructuredAnalysisPackage`；两个概念在 M6-C 实现期间必须保持语义可区分
  （词汇表见 CONTEXT.md）。`StrictAnalysisPackage` 及其 validator 保持原样
  继续服务现有 pipeline/测试。
- **新增/修改模块（按切片）**：
  - Slice 1：contracts 包新增上述 schema 与类型；reasoning 包的 outcome/
    reason/proof 定义改为 import contract，不保留重复 union。
  - Slice 2：整盘 review 结果扩展（retain full ready result）；reasoning
    包新增 package builder（确定性组装，直接消费该结果）。
  - Slice 3：reasoning 包新增 package validator；导出 package 构建/校验
    入口。
  - Slice 4：whole-game golden 测试与回归门；旧 golden test 继续保留。

## Testing Decisions

- **好测试只测外部行为**：给定 pinned 报告 fixture + 真实 sidecar →
  `runMortalFullGameReview` 产出 `coverage_ready` → builder 产出通过校验的
  `StructuredAnalysisPackage`；给定被篡改的 review 结果（悬空 evidenceId、
  版本为空、含 LLM 字段、载荷与 outcome 不一致）→ validator 拒绝。不测
  内部函数、不测实现细节。
- **Seam（优先现有，只新增一个）**：
  - 最高 seam = **整盘 review E2E**（`runMortalFullGameReview`，M6-A 已建立
    的发布级 seam）：M6-C 扩展该 seam 的返回载荷，使完整逐决策分析可被
    package builder 固化。发布判断只依赖这个 seam。
  - 新增 seam = **`buildStructuredAnalysisPackage`**：直接消费整盘 review
    结果，是 M6-C 唯一的构建入口；不新增第二套逐决策分析路径。
- **按切片测试**：
  - Slice 1 只测 contract：schema 可解析/拒绝最小合法与非法样例；contract
    ownership 可编译（contracts 不依赖 reasoning）；provider-scoped outcome
    形状可表达 Mortal 七值且未来可扩。
  - Slice 2 测 production assembly：整盘 review 的 `coverage_ready` 结果
    携带完整逐决策载荷；builder 直接消费该结果，**断言不存在 rerun
    analysis 的路径**（拼包过程不调用事实引擎、不访问 Mortal、不重跑
    `runBoundMortalDecisionReview`）。
  - Slice 3 测 serialization / validator / provenance：JSON roundtrip 后
    仍通过校验；stable IDs 确定；version validation 拒绝空版本/解释侧
    版本；cross-reference validation 拒绝悬空 evidenceId；no LLM fields
    拒绝含 CoachJudgment/ExplanationBullet 的包；**有 `no_mortal_entry`
    的 package 仍通过 schema 校验**（CR-6）。
  - Slice 4 测 whole-game golden：real canonical fixture + self
    decisions + response decisions + Mortal + factor pipeline → 校验通过
    的 `StructuredAnalysisPackage`；此测试成熟前，旧 golden test 继续作为
    旧 semantic spine 的保护门，不提前删除。
- **Prior art**：
  - `golden-vertical-slice`：真实 fixture + packaged sidecar 走通黄金链路；
    M6-C 测试沿用同一 fixture 与 sidecar 口径。
  - `public-pipeline` / `strict-analysis-package`：JSON round-trip 后
    validator 仍通过的产物契约测试。
  - `mortal-full-game-review`：整盘 review 的 binding/守恒/outcome 纪律测试；
    M6-C 只扩展其输出，不改变其守恒语义。
  - contracts 中 `CandidateFactorLedger` / `FactorDifference` /
    `ModelEvaluation` / `KnownGameFacts` 的 schema 测试作为 package schema
    组合的既有基础。
- **验收门（golden acceptance，区别于 schema validity）**：绿色 run 中
  `no_mortal_entry == 0`；H2 连续性复跑不回归；同一语义输入 + 显式 frozen
  policy snapshot → semanticContentHash 一致。
- **真实 sidecar 依赖**：与 golden vertical slice 相同，使用仓库内 packaged
  sidecar；不要求新的外部语料或 Mortal 提交。

## Out of Scope

- M6-D1 Typed Context Graph substrate（projection）、M6-D2 Graph-grounded
  Coach + Validator、`GraphContextSlice` 与 LLM 传输。
- `DeterministicReviewSelector`（在 M6-C 之后、M6-D2 之前实现，非本规格）。
- `ReviewReport` / `CoachJudgment` / `ExplanationBullet` 的具体 schema 与
  生成逻辑（本规格只冻结"引用不内嵌"与"package 不是 LLM boundary"）。
- M7-A 固定 review UI、M7-B ReviewSession 持久化与 SQLite、产品内 Mortal
  缓存策略。
- M6-B Akagi（但 CR-2 的 provider-scoped outcome 已为 Akagi 预留扩展点）。
- `StrictAnalysisPackage` 的迁移、改名或扩展（本规格明确禁止静默合并）。
- 旧 golden test 的删除或迁移：在新的 production whole-game golden 足够
  成熟并完成显式评审之前，旧 golden test 继续作为旧 semantic spine 的
  保护门。
- raw Mortal 报告缓存、eviction/磁盘期限（M7-B）。
- 任何 Neo4j / GraphRAG / embeddings / vector DB / PageRank / community
  detection / causal engine。
- M2-next 教学能力扩充。

## Further Notes

- D1 原文的"六值 + 按需增加"已被 M6-A4.0 supersede 为七值契约；本 spec 只
  承认七值口径，不再使用"按需增加"。
- D4 原文列举的 `explanationPrompt` 版本已被 supersession note 移出 package；
  版本所有权以 ROADMAP §2 M6-C 为准。
- 本规格不改变 M6-A4 已冻结的 outcome 语义、守恒不变量与 coverage gate；
  M6-C 是这些产物的固化层，不是新的分析层。
- 历史 handoff/plans/specs 原文不动；如有冲突以本 spec 与 ROADMAP §2 为准。
- 术语一律以 `coach/CONTEXT.md` 词汇表为准；与既有 ADR 矛盾处显式指出，不
  静默覆盖。
