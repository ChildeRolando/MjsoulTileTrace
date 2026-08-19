# DeterministicReviewSelector 实现规格

日期：2026-08-19
决策来源：[2026-08-18 下一阶段 roadmap 盘问决策记录](../handoffs/2026-08-18-next-phase-roadmap-grill-decisions.md)
（F1–F3，含 selector 排序/所有权 supersession note；已定稿，本规格不再重新 grill）；
路线图口径：[`ROADMAP.md`](../development/ROADMAP.md) §3；
上游契约：[M6-C StructuredAnalysisPackage 规格](./2026-08-18-m6-c-structured-analysis-package-design.md)
（Slice 1–4 已落地，当前 git HEAD 含 whole-game golden）；
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准；证据权威分层见
[ADR-0003](../adr/0003-evidence-first-coaching-judgment-and-authority-layers.md)；
ContextGraph 边界见 [ADR-0004](../adr/0004-context-graph-as-auditable-llm-boundary.md)；
依赖方向见 [ADR-0005](../adr/0005-workspace-dependency-boundaries.md)。

## Problem Statement

M6-C 已经把从真实牌谱、自摸/响应决策、Mortal、factor pipeline 到经过 validator 的
`StructuredAnalysisPackage` 钉成生产主链的稳定输出。下一个关键路径节点
（M6-D2 Coach）的入口已经是 `generateReport(analysisPackage, selectedDecisionIds)`：
引擎自身不拥有 review-worthy 定义权（grill 决策 E3/F1）。

当前缺口是：**没有任何组件回答“给定一个完整 `StructuredAnalysisPackage`，哪些
decision 值得进入一次 fixed review，以及按什么顺序”。**

如果没有 `DeterministicReviewSelector`：

- M7-A 会为了渲染不得不自行推理“为什么选中、为什么排序”，UI 成为事实上的产品
  策略所有者（违反 grill F1 / supersession note 的“非 UI 拥有”）；
- M6-D2 调用方只能收 `string[]`，未来每个消费者都要重新推导选择原因；
- 排序、阈值、上限分散在多处实现，无法保证同一分析包在不同时间、不同调用方得到
  同一份 review 清单；
- degraded / `integrity_failed` package 的处理方式悬空：要么整包拒绝，要么各消费
  方各写各的过滤规则；
- ContextGraph 或未来 graph ranking 有机会悄悄吞掉“什么值得评审”的权威。

因此本规格的定义是：

> **DeterministicReviewSelector = 一个纯函数式、确定性、版本化的产品策略，
> 把 `StructuredAnalysisPackage` 投影为可机器审计的 `ReviewSelectionResult`。
> 它只消费 M6-C 已有信息，不新增任何分析能力。**

## Solution

新增 `DeterministicReviewSelector`：位于 M6-C 之后、M6-D1/M6-D2 之前，输入是
schema-valid 的 `StructuredAnalysisPackage`，输出是带入选决策、稳定排序和机器可读
选择原因的 `ReviewSelectionResult`。数据流是：

```text
StructuredAnalysisPackage（M6-C 已冻结，evidence source of truth）
        ↓
DeterministicReviewSelector（纯函数；policy v1 冻结）
        ↓
ReviewSelectionResult
        ├── policyVersion
        ├── analysisPackageId
        ├── analysisPackageStatus
        └── selected: ReviewSelection[]
                ├── decisionId
                ├── rank
                └── selectionReason（固定两值词汇）
```

用户可见的变化是：fixed review 的清单从此可重算、可解释、可审计；M6-D2 拿到的
`selectedDecisionIds` 不是一串裸 id，而是每条都带“为什么值得进 review”的机械理由；
M7-A 只负责渲染，不定义选择策略；M7-B 不需要为 selector 结果新建 artifact 身份。

实现切成三个窄 slice：

1. **Slice 1 — Contract + policy freeze**：冻结 `SelectorPolicy`、
   `ReviewSelectionResult` / `ReviewSelection`、selection reason 词汇、输入有效性
   与 determinism 语义，并写 contract tests。
2. **Slice 2 — Pure selector implementation**：package → filter → disagreement →
   threshold → reason → rank → cap → result，纯函数，不调用 Mortal、fact engine、
   LLM、graph、database。
3. **Slice 3 — Whole-game consumer golden**：直接消费 M6-C whole-game package：
   真实整盘 package → selector → 入选决策，验证每个 selected id 都能解析回 package、
   reason/ranking 可复现。这是 M6-C 的第一个真实 downstream product policy 消费方
   （consumer pressure）。

## User Stories

1. 作为复盘用户，我想让 fixed review 使用一个版本化、冻结的选择策略，这样同一份
   分析包在任何时间、任何调用方都得到同一张 review 清单。
2. 作为复盘用户，我只想看到 `analysis_ready` 的决策进入候选池，这样
   `unsupported_action` / `no_mortal_entry` 等状态永远不会被伪装成“值得 review”。
3. 作为复盘用户，我想在“我的实际动作不是模型偏好动作”时看到分歧决策，这样我
   知道模型在我打牌的位置会选择不同的一手。
4. 作为复盘用户，我想让多个 `preferredActions`（模型并列最高分）时只要实际动作
   等价于其中任意一个就判定为不分歧，这样并列偏好不会误报成错误。
5. 作为复盘用户，我想让立直这类既有 actual↔model realization 对应
   （`riichi_discard` realizes `declare_riichi`）按包内既有语义判定等价，这样
   selector 不会因为动作粒度不同把“我立直、模型也立直”误判为分歧。
6. 作为复盘用户，我只想看到分歧且 `errorGap >= T` 的决策进入 review，这样小分差
   不占用有限的 fixed review 位置。
7. 作为复盘用户，我想让“已计算确定性维度上无可区分差异”的入选决策明确携带
   `no_distinguishable_factor_difference` 这一机器可读原因，这样 UI 不会沉默地
   暗示“因素都支持你”，Coach 也有合法前提去生成 judgment 向 bullet。
8. 作为复盘用户，我想让 review 清单按 `errorGap` 降序排列，这样模型最反对的一手
   最先被看到。
9. 作为复盘用户，我想让 preference 冲突只作为排序 tiebreaker，绝不把某个决策
   额外塞进 review，这样选择权威始终只有“分歧 + 阈值”一条门。
10. 作为复盘用户，我想让 fixed review 最多只展示 N 个决策，这样 coach 生成量有
    明确上限，不被整盘所有分歧淹没。
11. 作为复盘用户，我想让 `degraded` / `integrity_failed` package 中已经完整分析
    的 `analysis_ready` 决策仍然可被选中，这样一个无关 decision 的
    `no_mortal_entry` 不会废掉其它已经完整分析的决策。
12. 作为复盘用户，我想让 `ReviewSelectionResult` 保留 package 的 aggregate
    status，这样 UI 可以同时诚实展示“哪些入选了”与“整盘分析是否完整”。
13. 作为 M6-D2 的调用方，我想从 `ReviewSelectionResult.selected` 机械导出
    `selectedDecisionIds`，这样 `generateReport(analysisPackage,
    selectedDecisionIds)` 不需要重新推理选择原因。
14. 作为 M7-A UI 的开发者，我想消费带 `rank` 与 `selectionReason` 的结果，这样
    Overview/List 层的 tags 与排序是机械派生，不含字符串猜测。
15. 作为 M7-B 持久化的开发者，我想只保存 `analysisPackageId + policyVersion` 即可
    重算同一份 `ReviewSelectionResult`，这样 selector 结果不需要自己的 artifact
    身份、哈希或时间戳。
16. 作为 M6-D1 ContextGraph 的开发者，我想让 selector 直接消费
    `StructuredAnalysisPackage`，并且明确 graph 不拥有 review-worthiness 判定权，
    这样未来 graph ranking 不会反向吞掉确定性选择策略。
17. 作为审计者，我想验证“相同 package semantic content + 相同 selector policy
    → 相同 selections、相同 ordering、相同 reasons”，这样固定 review 是可重算的。
18. 作为审计者，我想确认 selector 结果不包含 runtime random / timestamp，这样
    审计产物不会被墙钟或随机数污染。
19. 作为维护者，我想让 T 与 N 冻结在 selector policy version 里，这样改阈值或
    上限必须显式发布新 policy 版本，而不是悄悄改代码。
20. 作为维护者，我想让 selector 对 schema-invalid package fail closed，这样坏输入
    不会产生“看似合理”的部分选择结果。
21. 作为维护者，我想让 selection reason 词汇只包含机械、可验证的 policy reason
    （如“分歧且超过阈值”“无可区分差异”），不含 `bad_push` / `dangerous_decision`
    / `important_learning_point` 这类 CoachJudgment / pedagogy 措辞。
22. 作为维护者，我想让 selector 实现不调用 Mortal、fact engine、LLM、graph 或
    database，这样选择策略可以离线、纯内存、确定性重算。

## Contract Requirements

### CR-1：输出类型是结构化结果，不是裸 `string[]`

`contracts` 包拥有以下 contract（概念形状，Slice 1 冻结；`selected` 的 `rank` 是
1-based 正整数）：

```text
ReviewSelectionReason =
    "model_disagreement_above_threshold"
  | "no_distinguishable_factor_difference"

ReviewSelection =
    decisionId: DecisionId
    rank: int >= 1
    selectionReason: ReviewSelectionReason

ReviewSelectionResult =
    policyVersion: string                 # 恒等于 SELECTOR_POLICY_VERSION_V1
    analysisPackageId: string             # 等于 package.packageId
    analysisPackageStatus: complete | degraded | integrity_failed
                                           # 等于 package.record.status
    selected: ReviewSelection[]           # 允许为空
```

- `selected` 只引用 `decisionId`，不复制 errorGap、preferredActions、factor
  differences 等 package 内容；需要这些数据的消费者按 `decisionId` 解析回 package，
  避免第二套 truth。
- 不提供单独的 `selectedDecisionIds: string[]` 字段：M6-D2 由
  `selected.map(s => s.decisionId)` 机械导出，防止两份数组漂移。
- `ReviewSelectionResult` 没有 `selectionId` / `semanticHash` / `createdAt`。它是
  package + policy 的确定性投影，不是新 artifact。

### CR-2：selection reason 只保留机械、可验证的 policy reason

- 词汇恰好两值，语义如下：
  - `model_disagreement_above_threshold`：分歧成立且 `errorGap >= T`，并且该
    decision 在 actual↔任一 preferred 的**确定性** `FactorDifference` 中存在可区分
    差异（见 CR-4 与“实现决策”的精确谓词）。
  - `no_distinguishable_factor_difference`：分歧成立且 `errorGap >= T`，但该
    decision 在 actual↔任一 preferred 的确定性 `FactorDifference` 中不存在可区分
    差异（含“没有任何已计算确定性差异”的情况）。
- 该词汇是 selector authority 的终点：它只描述“为什么按 policy 入选”。任何
  pedagogy / CoachJudgment 措辞（`bad_push`、`dangerous_decision`、
  `important_learning_point`、`learning_opportunity` 等）一律不得进入
  `ReviewSelectionResult` 或 selector contract。
- `no_distinguishable_factor_difference` 分支**不新增独立的入选 authority**：它
  只在已经通过“分歧 AND `errorGap >= T`”的决策中替换 selection reason，不绕过 T、
  不绕过分歧、不改变 N。这同时钉死 F2 的原文口径“模型明显偏好但 actual-vs-preferred
  无任何已计算确定性差异”——“明显偏好”由 T 门槛表达。
- heuristic / advisory 差异不参与该判定：`no_distinguishable_factor_difference`
  只谈论已计算的**确定性**差异维度；advisory signal 无否决权（ADR-0003），也不能
  反向决定 selector 的 reason。

### CR-3：degraded / integrity_failed package 不整包拒绝

- schema-valid 的 `StructuredAnalysisPackage` 无论 `record.status` 是 `complete` /
  `degraded` / `integrity_failed`，selector 都执行选择；候选池只按每个 decision
  自身的 `outcome === "analysis_ready"` 过滤。
- `ReviewSelectionResult.analysisPackageStatus` 原样保留 `package.record.status`，
  selector 不重算、不修正、不美化它（status 真实性由 M6-C validator 保证，见
  CR-5 输入契约）。
- schema-invalid package（未知字段、outcome/payload 形状非法、重复 decisionId 等）
  fail closed 抛错；valid package 的选择过程没有部分失败状态。
- v1 的候选池只作用于当前可表达的 Mortal provider 分支（package contract 目前
  只有 `analysisProvider.kind: "mortal"`）。未来新增 provider 时，selector 必须
  发布新 policy 版本显式扩展，不得把 Mortal 的 `analysis_ready` 语义静默伪装成
  provider-neutral。

### CR-4：disagreement 的 equality authority 复用包内既有语义

- selector **不创建自己的 action matching、tile equality 或等价类**。它只做
  actionRef 集合成员判断，等价语义全部来自 M6-C 已冻结的 package 内容：
  - action identity = `StructuredComparisonCandidate.actionRef`（已由 contracts
    `canonicalActionRef` 校验：`actionRef === canonicalActionRef(action)`）；
  - actual 的模型侧身份 = `modelEvaluation.scoredActualModelActionRef`
    （无 correspondence 时等于 `actualActionRef`；有 correspondence 时是
    `ActualModelCorrespondence.scoredModelActionRef`，即 riichi_discard →
    declare_riichi 或 kakan → ankan 这类既有的 actual↔model realization）。
- disagreement 判定：
  `scoredActualModelActionRef ∉ modelEvaluation.preferredActions`。
  - 多 `preferredActions` 时，只要 actual 等价于**任意一个** preferred action，
    即 `scoredActualModelActionRef` 命中其中任一项，就判定**不分歧**。
  - selector 永不比较 `RiichiAction` 对象、永不重算 `canonicalActionRef`、永不
    发明新的“类型+tile 等价”规则。
- 该判定的正确性依赖 package 的以下 M6-C validator 不变量：
  `scoredActualModelActionRef` 必须属于 model 候选宇宙，且 correspondence 必须
  把 actual 候选绑定到 scored model 候选。selector 不重复实现这些校验。

### CR-5：Determinism / identity 语义

- 输入相同语义（同一 `semanticContentHash` 的 package）+ 同一 selector policy
  version，必须得到**逐字段相同**的 `ReviewSelectionResult`：相同
  `analysisPackageId`、相同 `analysisPackageStatus`、相同 selected 数组长度、
  相同 decisionId 顺序、相同 rank、相同 selectionReason。
- selector 不读取、不依赖 `createdAt`、`detailPolicy.frozenAt` 等 artifact
  creation metadata；这些字段只作 provenance，不得影响选择结果。
- 排序必须是全序（见“实现决策”），不得有 runtime random、`Date.now()`、
  wall-clock、locale-dependent sort 或未定义的并列顺序。
- `ReviewSelectionResult` 的 identity = `(analysisPackageId, policyVersion)`：
  M7-B 只保存这两个值即可重算；**不新增 selection artifact identity**。这是
  abstraction admission 的明确否决：结果没有独立生命周期，不需要
  `selectionId` / `semanticHash` / `createdAt`。

### CR-6：Selector 与 ContextGraph 的边界

- `DeterministicReviewSelector` 只消费 `StructuredAnalysisPackage`，不消费
  `ContextGraph`、`GraphContextSlice` 或任何 graph 中间产物。
- ContextGraph（M6-D1）**不拥有 review-worthiness 判定权**。它可以消费
  `selectedDecisionIds` 来构建有界 graph/context slice，但这是“选择之后的下游
  使用”，不是选择权威的输入。
- 禁止形成 `ContextGraph → graph ranking → relevance scoring → selector` 的反向
  依赖。v1 没有任何 graph ranking / PageRank / community detection 参与选择。
- selection authority 保持在 graph 之外；未来若产品确实需要 graph 信号参与选择，
  必须显式发布新的 selector policy version 并重开决策记录，不得在 M6-D1 中顺手
  实现。

## Implementation Decisions

### 模块与依赖

- `contracts` 包新增：`SelectorPolicyV1`（含
  `SELECTOR_POLICY_VERSION_V1 = "deterministic-review-selector/v1"`）、
  `ReviewSelectionReason`、`ReviewSelection`、`ReviewSelectionResult` 的 schema
  与类型；contracts 不新增任何依赖。
- `reasoning` 包新增唯一纯函数入口 `selectReviewDecisions(package)`，从包根导出。
  实现只依赖 `contracts`；不新增 workspace dependency（符合 ADR-0005）。
- 不新增包、不新增服务类、不引入 DI、不引入 graph/database。
- 输入契约：调用方传入 schema-valid 的 `StructuredAnalysisPackage`（生产路径上
  必须已通过 M6-C `validateStructuredAnalysisPackage`）。selector 自身做一次
  schema parse 作为 fail-fast，**不重跑 package validator**；package 完整性校验
  的所有权仍在 M6-C validator。Slice 3 golden 里的输入永远是“已验证”的真实
  package。

### Policy v1 冻结

```text
SELECTOR_POLICY_VERSION_V1 = "deterministic-review-selector/v1"
errorGapThreshold = 10    # T，单位继承 ModelEvaluation.errorGap：model_selection_score_points
maxSelections = 10        # N（grill F1 已冻结 N=10）
```

- T=10 与现役 detail-policy 默认阈值数值一致，但两者是**独立 policy**：selector
  的 T 只属于 selector policy version；改变 detail-policy 阈值不得隐式改变 selector
  T，反之亦然。
- 修改 T 或 N 必须发布新 policy version（新增 discriminated variant），不得原地
  修改 v1 常量。selector 对未知 policy version fail closed。
- 边界比较使用 `errorGap >= T`（T 包含）；cap 使用 `selected.length <= N`
  （N 包含）。

### 选择算法（外部行为契约，非实现细节）

给定 validated package 与 policy v1，按以下顺序：

1. **候选池**：`package.decisions` 中 `outcome === "analysis_ready"` 的决策。
   非 `analysis_ready` 决策永不入选、永不参与排序。
2. **分歧**：对每个候选，
   `disagreement = !preferredActions.includes(scoredActualModelActionRef)`。
3. **入选门**：`selected = disagreement AND errorGap >= T`。不满足者直接丢弃，
   不进入排序、不占 N。
4. **reason**：对每个入选决策：
   - 相关差异集合 = 该决策 `factorDifferences` 中满足以下全部条件的条目：
     `kind === "deterministic_difference"`，且
     `{leftActionRef, rightActionRef}` 是
     `{actualActionRef, p}`（无序对）对某个 `p ∈ preferredActions`。
   - 若其中存在 `valueRelation !== "equal"` 的条目，则该决策有“可区分差异”，
     reason = `model_disagreement_above_threshold`。
   - 否则（相关差异集合为空，或全部 `valueRelation === "equal"`），
     reason = `no_distinguishable_factor_difference`。
   - 定义使用 `actualActionRef` 做差异配对（而不是 scored ref），这样
     riichi_discard 实际候选与 declare_riichi 模型候选之间的既有
     `FactorDifference` 不被误跳过；heuristic difference 不参与。
5. **排序**（三级确定性全序）：
   1. `errorGap` 降序（相等即相等，不做 epsilon 合并）；
   2. preference conflict 优先。conflict 定义复用既有 preference-set 语义：
      `deterministicPreference !== null` 且
      `deterministicPreference.actionRefs ∩ preferredActions === ∅`
      （等价于既有 agree/partial_agreement/conflict 判定中的 `conflict`；
      null / partial 不获得 tiebreak 优先级）。conflict 只影响同 errorGap 组内
      顺序，**不作为入选条件**（grill F3）。
   3. `decisionId` 升序（locale-independent lexicographic），保证全序。
6. **cap 与 rank**：取排序结果前 N 条；`rank` 为该条在最终 `selected` 中的
   1-based 位置。入选不足 N 时全部返回；`selected` 可为空。

### 输出组装

- `policyVersion = SELECTOR_POLICY_VERSION_V1`；
- `analysisPackageId = package.packageId`；
- `analysisPackageStatus = package.record.status`；
- `selected = [ { decisionId, rank, selectionReason }, ... ]`。
- 组装过程不复制 package 其它字段，不产生新事实、不写 package、不引入随机或
  时间。

### Slice 划分

- **Slice 1 — Contract + policy freeze**：contracts 落地上述 schema / 类型 /
  v1 policy 常量；只写 contract tests，不实现 selector、不接 production。
- **Slice 2 — Pure selector implementation**：reasoning 落地
  `selectReviewDecisions(package)`（纯函数）并从包根导出；配套 focused/package
  测试。实现不得 import Mortal 调用、fact-engine transport、LLM、graph、database
  （`mortal-source` 报告解析也不需要）。
- **Slice 3 — Whole-game consumer golden**：在既有 M6-C whole-game golden 链上
  追加 selector 消费：真实 fixture → `runMortalFullGameReview` →
  `buildStructuredAnalysisPackage` → `validateStructuredAnalysisPackage` →
  `selectReviewDecisions`。这是本 spec 的发布判断 seam，也完成“M6-C 第一次被
  downstream product policy 消费”的 consumer pressure。

### 明确不做的实现

- 不实现 ContextGraph / graph projection / graph ranking；
- 不实现 LLM / CoachJudgment / ReviewReport；
- 不实现 UI tags / layout / Overview 计数（M7-A 消费 result 时自己做渲染派生）；
- 不新增麻将分析、fact、advisory signal 或 factor 维度；
- 不实现 persistence / SQLite / artifact identity；
- 不做“智能选择器”、不调模型重评、不按质量/重要性打分。

## Testing Decisions

### Seam（最高现有 seam + 只新增一个）

- 最高现有 seam = **M6-C whole-game E2E**（`runMortalFullGameReview` →
  `buildStructuredAnalysisPackage` → `validateStructuredAnalysisPackage`，
  已在 M6-C Slice 4 落地）。Slice 3 直接站在这个 seam 上，不新建第二条整盘分析
  路径。
- 唯一新增 seam = **`selectReviewDecisions(package)`**（reasoning 包根导出的纯
  函数）。contract 类型只是该 seam 的输入输出契约，不算额外 seam。
- M6-D1 / M7-A 未来只能消费这个 seam 的输出，不得实现第二套选择逻辑。

### 好测试的标准

- 只测外部行为：给定 package → 观察 `ReviewSelectionResult` 的字段、顺序与可重算
  性；不测内部排序函数、不测中间谓词实现。
- 测试 fixture 必须通过同一个生产 schema / validator，避免测试自造宽松协议
  （沿用 M6-C 的纪律）。
- 负例覆盖信任边界：schema-invalid package、未知 policy version（若 API 暴露
  policy 参数则必测）、空 `analysis_ready`、非 `analysis_ready` 永不入选。

### Slice 1 — contract tests

- `ReviewSelectionResult` / `ReviewSelection` schema 接受最小合法样例；拒绝未知
  字段、非法 reason、rank 0 / 负 rank、非法 `analysisPackageStatus`。
- `selected: []` 合法；`policyVersion` 必须等于 v1 literal。
- `SelectorPolicyV1` 的 T=10 / N=10 以 schema literal 冻结：改常量字符串或数字
  即编译/测试失败；reason 词汇恰好两值，不含 pedagogy 词。
- contract ownership：contracts 不反向依赖 reasoning（`npm run check:architecture`
  继续通过）。

### Slice 2 — selector behavior tests

使用最小但通过 package validator 的 `StructuredAnalysisPackage` 样例（沿用
`structured-analysis-package.test.ts` 的既有构造口径），覆盖：

- **候选池**：只选 `analysis_ready`；`no_mortal_entry` /
  `unsupported_action` / `source_row_not_expected` 永不出现在 `selected`。
- **degraded / integrity_failed**：package status 非 complete 时，
  `analysis_ready` 决策仍可入选；`analysisPackageStatus` 原样透传。
- **多 preferred**：actual 等价命中任一 preferred → 不分歧、不入选。
- **realization 等价**：`riichi_discard` actual 对应 `declare_riichi` scored ref，
  `preferredActions` 含 `declare_riichi` → 不分歧（证明 selector 没有自建
  tile/action equality）。
- **阈值边界**：errorGap = T-ε、T、T+ε（按现有 `ModelEvaluation` 数值纪律构造）
  → 只有 `>= T` 入选。
- **reason 分支**：actual↔preferred 存在 `valueRelation !== "equal"` 的确定性
  difference → `model_disagreement_above_threshold`；只有 neutral/equal 或零相关
  确定性 difference → `no_distinguishable_factor_difference`；heuristic difference
  的差异不改变 reason 判定。
- **排序与 cap**：errorGap 降序；同 errorGap 时 preference conflict 在前；仍并列
  时 decisionId 升序；入选超过 N 时取前 N，rank 连续 1..N；不足 N 全部返回；
  零入选返回 `selected: []`。
- **determinism**：两次调用结果逐字段相等；对两个仅在 `package.decisions` 数组
  顺序上不同（并各自合法地重算 identity/hash）的 package，输出相同的 selected 集合
  与顺序；修改 `createdAt` / `detailPolicy.frozenAt` 不改变输出。
- **fail closed**：schema-invalid package 抛错，不返回部分结果。

### Slice 3 — whole-game consumer golden

- 直接复用 M6-C Slice 4 真实链与 fixture
  （`c1924cad66f66dd9-east1-turn6-7`，packaged sidecar，不要求新外部语料）：
  真实 whole-game package → `validateStructuredAnalysisPackage` →
  `selectReviewDecisions`。
- 钉住真实外部行为：package 中 2 个 `analysis_ready` 决策均为分歧且 errorGap
  （≈99.27 / ≈97.42）大于 T → 全部入选；`selected.length <= N`；rank 连续；
  reason 属于冻结词汇；每个 `selected.decisionId` 都能在 `package.decisions`
  中解析回原决策。
- 钉住 `analysisPackageStatus === "integrity_failed"` 的真实透传（真实 fixture 的
  其余窗口如实读 `no_mortal_entry`；selector 仍正常选择其中 2 个 ready 决策）。
- 钉住可重算：同一语义输入重跑整条链（含 selector）两次 → 两份
  `ReviewSelectionResult` 逐字段相同。
- 旧 golden test（`golden-vertical-slice`）继续保留，不迁移、不删除。

### Prior art

- `structured-analysis-package-golden.test.ts`：M6-C Slice 4 真实整盘链，Slice 3
  在其 seam 上追加消费。
- `contracts/tests/structured-analysis-package.test.ts`：最小合法 package 的构造
  口径，Slice 2 测试复用。
- `reasoning/tests/detail-policy.test.ts`、`model-evaluation.test.ts`：阈值边界与
  模型评价数值纪律。
- `reasoning/tests/preference-agreement.test.ts`：preference-set 的
  agree/partial/conflict 语义，conflict tiebreaker 复用的既有权威。
- `public-pipeline` / `strict-analysis-package`：产物 JSON round-trip 与 schema
  纪律的先例。

## Out of Scope

- M6-D1 Typed Context Graph substrate、graph projection、graph structural
  validation、`ContextSliceBuilder`。
- M6-D2 Graph-grounded Coach + Validator、`LlmProvider`、`CoachJudgment`、
  `CoachInference`、`ExplanationBullet`、`ReviewReport`、grounding validator。
- M7-A fixed review UI 的任何 tags / layout / 三层渲染细节；UI 只消费本规格输出。
- M7-B ReviewSession / SQLite / 产品内 Mortal 缓存 / persistence。
- selector 结果自身的 artifact identity、selectionId、semanticHash、createdAt。
- 新麻将分析、新 fact、新 factor 维度、新 advisory signal。
- “智能选择器”：模型重评、质量打分、重要度排序、graph ranking / PageRank /
  relevance scoring、embeddings / vector DB / GraphRAG。
- Akagi provider 的 selector 语义（policy v1 只支持当前 Mortal provider 分支）。
- M6-C `StructuredAnalysisPackage` / validator 的改动；`StrictAnalysisPackage`
  迁移、改名或扩展。
- on-demand explanation generation 入口（grill E3 已后置）。
- raw Mortal/source cache 及任何 privileged 数据边界。

## Further Notes

- F1–F3 语义为已冻结决策，本规格只把它们变成可编译、可测试的 contract；任何条款
  若与 F1–F3 冲突，以 grill 决策记录与 ROADMAP §3 为准。本规格的细化点：
  - “actual 等价于任一 preferredAction”的等价权威 = package 内
    `scoredActualModelActionRef` + correspondence（CR-4），不是新 matcher；
  - `no_distinguishable_factor_difference` 不是新的入选 authority，只替换已入选
    决策的 reason（CR-2）；
  - preference conflict tiebreak 复用既有 preference-set 的 `conflict` 语义，
    只在 errorGap 同值时生效（grill F3）。
- `ReviewSelectionResult` 是确定性投影，不是新的 evidence source of truth；
  `StructuredAnalysisPackage` 仍是唯一确定性证据产物。若 M7-B 需要跨会话重开，
  保存 `analysisPackageId + policyVersion` 并重算即可。
- 本规格的 contract 名称与 reason 词汇应在 Slice 1 落地时登记进
  `coach/CONTEXT.md` 词汇表（`DeterministicReviewSelector` /
  `ReviewSelectionResult` / selection reason），并同步 ROADMAP §3 的完成状态；
  历史 handoff/plans/specs 原文不动。
- 本规格不改变 M6-A4 的 outcome 语义、M6-C 的 package/validator 语义与
  ADR-0003/0004/0005 的任何裁决。
