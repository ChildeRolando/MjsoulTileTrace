# M6-D1：Typed Context Graph Substrate 实现规格

日期：2026-08-19
状态：M6-D1 implementation spec（ready-for-agent）
依据：[ADR-0004](../adr/0004-context-graph-as-auditable-llm-boundary.md)、
[Auditable Context Graph Design](./2026-08-18-auditable-context-graph-design.md)、
[ROADMAP §4 M6-D1](../development/ROADMAP.md)、
[M6-C StructuredAnalysisPackage 规格](./2026-08-18-m6-c-structured-analysis-package-design.md)、
[DeterministicReviewSelector 规格](./2026-08-19-deterministic-review-selector-design.md)。
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准。

## Problem Statement

用户最终要看到"这条判断基于哪些事实、哪些估算、哪些教练推断"。M6-C 已经把整盘
分析固化为 `StructuredAnalysisPackage`，DeterministicReviewSelector 已经选出
"值得评审"的决策，但两者之间仍缺一层 typed graph：provenance 查询仍要回到 flat
JSON 手工拼引用链，LLM 上下文没有稳定 allow-list 边界，审计 UI 无法沿统一 refs
展开"事实 → 差异 → 判断 → 解释"，未来 M4 追问的 context retrieval 会重复造图。

M6-D1 的定义是：

> **M6-D1 = 把已经固化的整盘 evidence 确定性投影为 ContextGraph，并只通过
> GraphContextSlice 作为 LLM 上下文边界；不新增任何分析能力，不接 LLM。**

## Solution

新增 `ContextGraph`：由 `StructuredAnalysisPackage` 确定性投影得到的 typed
property graph，加上 D2 才会追加的 reasoning overlay 分区。D1 交付：

1. `projectContextGraph(package)` —— 唯一的 evidence-subgraph 投影 seam，
   输入是 schema-valid 的 `StructuredAnalysisPackage`，输出确定性的
   `ContextGraph`。
2. `buildGraphContextSlice(graph, selection)` —— 唯一的 slice 构建 seam，
   输入 `ContextGraph` 与 `ReviewSelectionResult`，输出确定性的
   `GraphContextSlice`；它是 M6-D2 的 LLM 传输边界。
3. `validateContextGraph` —— graph 结构校验器，执行 design §11 的规则与投影
   不变量。
4. 支撑函数：`getDecisionSubgraph`、`appendReasoningOverlay`、
   `validateGraphContextSlice`。

D1 的 `ContextGraph` 是 projection，不是 source of truth；不替代、不倒写
`StructuredAnalysisPackage`。D1 不接 LLM：`projectContextGraph` 只产生
evidence subgraph；reasoning overlay 分区由 D2 通过 `appendReasoningOverlay`
追加，D1 只冻结其分区规则与校验。

## User Stories

1. 作为 M6-D2 解释引擎的调用方，我想从 `StructuredAnalysisPackage` 得到一份确定性的 `ContextGraph`，这样同一分析包每次投影结果一致，不随运行时间变化。
2. 作为 M6-D2 解释引擎的调用方，我想让 graph 中每个节点都有稳定、全局唯一的 node id，这样推理 overlay 可以可靠地引用 evidence 节点。
3. 作为 M6-D2 解释引擎的调用方，我想让每个节点都带 origin / authority / producer / producerVersion / provenance，这样 grounding validator 可以机械判断证据来源与权威层级。
4. 作为 M6-D2 解释引擎的调用方，我想只从 `GraphContextSlice` 读取上下文，这样 LLM 永远无法接触完整 graph、raw package、raw Mortal 报告或原始牌谱字节。
5. 作为解释引擎的调用方，我想让 `buildGraphContextSlice` 只接受与 graph 同源的 `ReviewSelectionResult`，这样不会把 A 包的选择结果错误地套到 B 包上。
6. 作为解释引擎的调用方，我想让 slice 只包含每个入选决策的子图节点与边，这样 LLM 上下文聚焦在评审对象上，不携带整盘噪音。
7. 作为解释引擎的调用方，我想让 slice 的节点载荷经过显式 allow-list 过滤，这样即使 graph 未来扩展本地审计字段，LLM 传输面也不会随之扩权。
8. 作为解释引擎的调用方，我想让 slice 对空选择返回空节点/边集合而不是报错，这样"没有值得评审的决策"可以干净降级为 evidence-only 报告。
9. 作为复盘用户，我想让 ContextGraph 包含 Decision / CandidateAction / KnownGameFact / FactorFact / FactorDifference / ModelEvaluation / DeterministicPreference / Evidence 节点，这样 audit UI 能沿节点展开证据链。
10. 作为复盘用户，我想让 FactorFact / FactorDifference 在 graph 中保留 hard 与 advisory 的权威分层，这样我看到估算时不会把它误当成可证明事实。
11. 作为复盘用户，我想让 ModelEvaluation 在 graph 中标记为 model 权威，这样我知道模型评分是模型证据，不是本地麻将事实。
12. 作为复盘用户，我想让每个 Evidence 节点来自 package 的 evidence registry，这样 `derived_from` 边能把任何 FactorFact / FactorDifference 追溯到 canonical 事件或 fact-engine 请求。
13. 作为复盘用户，我想让 `derived_from` 边只表达来源/论证关系，这样我不会把来源关系误读为因果关系。
14. 作为复盘用户，我想让 graph 校验拒绝任何 `causes` 边，这样 v1 不声称因果真理。
15. 作为复盘用户，我想让 graph 校验拒绝 evidence 节点携带 LLM 来源或 coach 权威，这样 LLM 无法在结构上污染证据分区。
16. 作为 M6-D2 解释引擎的调用方，我想让 reasoning overlay 只能通过 `appendReasoningOverlay` 追加，这样 CoachInference / CoachJudgment / Explanation 永远不能修改、删除或覆盖 evidence 节点和边。
17. 作为 M6-D2 解释引擎的调用方，我想让 `appendReasoningOverlay` 校验 reasoning 节点的 origin 必须是 LLM、authority 必须是 coach、边必须解析到存在的节点，这样不合法推理无法进入 graph。
18. 作为审计 UI（M7-A）的开发者，我想按 decisionId 取得该决策的 decision subgraph，这样 Detail 视图可以只展开当前决策的证据与比较。
19. 作为审计 UI 的开发者，我想让 decision subgraph 是确定性的有向可达子图，这样同一决策每次展开顺序一致。
20. 作为未来 M4 追问的开发者，我想让 ContextGraph 的 typed node/edge 与稳定 id 成为未来 chat retrieval 的基础，这样 M4 不必重新造一套图遍历。
21. 作为持久化（M7-B）的开发者，我想让 ContextGraph 只是运行时投影、不被持久化为第三 canonical artifact，这样 ReviewSession 仍然只引用 package 与 ReviewReport。
22. 作为 spec 实现者，我想让 graph 与 slice 的 schema 都在 contracts 包冻结，这样 reasoning / desktop / 未来 UI 都能消费同一契约。
23. 作为 spec 实现者，我想让 projector 与 slice builder 都是无副作用、无随机、无 wall-clock 的纯函数，这样它们可以被重复执行并得到相同结果。
24. 作为 spec 实现者，我想让 projector 对 schema-invalid package fail closed，而不是产出部分 graph，这样坏输入不会悄悄变成 LLM 上下文。

## Implementation Decisions

### 模块与依赖

- contracts 包新增 `ContextGraph` / `GraphContextSlice` 契约：node/edge schema、
  node kind / edge kind / origin / authority 枚举、allow-list 常量、schema
  版本字面量。contracts 不新增任何依赖。
- reasoning 包新增 context-graph 模块：projector、slice builder、graph
  validator、decision subgraph、overlay append、slice validator，并从包根导出。
- reasoning 仍只依赖 contracts（以及 ADR-0005 已允许的 mortal-source）；M6-D1
  不新增 workspace 依赖、不引入任何 graph library。
- `StructuredAnalysisPackage` 与其 validator 保持原样；M6-D1 只读消费，不修改
  M6-C 的任何契约或构建路径。

### Seam（按评审确认）

M6-D1 设置**两个平级新增 seam**：

1. **`projectContextGraph(package)`**：唯一 evidence-subgraph 构建入口。
2. **`buildGraphContextSlice(graph, selection)`**：唯一 LLM 上下文切片构建入口。

`validateContextGraph`、`getDecisionSubgraph`、`appendReasoningOverlay`、
`validateGraphContextSlice` 是两个 seam 的支撑函数，不新增第三条分析/构建路径。

### Graph 总体形状

`ContextGraph` 是内存中的 typed property graph。顶层概念字段：schema 版本
（`context-graph/v1`）、`graphId`、`packageId`、`nodes`、`edges`。D1 的
`graphId` 由 `packageId` 确定性派生（`context-graph:<packageId>`）；D2 追加
overlay 后再决定 overlay 如何进入 graph 身份，D1 不预埋。

- 不保存 createdAt / wall-clock / 随机值；graph 是可重复投影的纯结果。
- node 与 edge 在图中分别按 nodeId / edgeId 确定性排序。
- graph 自身不是持久化 artifact：ReviewSession 仍只引用
  `StructuredAnalysisPackage` 与 `ReviewReport`（ADR-0004）。

### Node 模型

v1 node kind（8 种）：

- `Decision`
- `CandidateAction`
- `KnownGameFact`
- `FactorFact`
- `FactorDifference`
- `ModelEvaluation`
- `DeterministicPreference`
- `Evidence`

两个来自 design §5 的概念不设独立 node kind，避免投影生成 package 中不存在的事实：

- `AdvisorySignal` 由 `FactorFact` / `FactorDifference` 的 authority=advisory
  与 evidenceClass=`versioned_upstream_estimate` 承担；
- `Constraint` 由 KnownGameFact / 确定性 FactorFact / 确定性 FactorDifference
  的 authority=hard 语义承担，不制造额外的 constraint 节点。

每个 node 概念上携带：

- `nodeId`：稳定、全局唯一；
- `nodeKind`：上述 8 值；
- `partition`：`evidence` | `reasoning`；
- `origin`：`canonical_replay` | `factor_pipeline` | `model_evaluation` |
  `package_projection` | `user_assertion` | `legacy_regression_bridge` |
  `llm_reasoning`；
- `authority`：`hard` | `advisory` | `model` | `coach` | `structural`；
- `producer` / `producerVersion`：生产该 node payload 的确定性生产者与版本；
- `payload`：按 nodeKind 区分的投影载荷；
- `provenance`：evidence id 列表（evidence-bearing 节点）或空列表（结构节点）。

`structural` 只用于 Decision / CandidateAction / DeterministicPreference 这类
非证据声明节点；它不进入 ADR-0003 的证据权威分层。证据分区整体不可被 reasoning
overlay 改写，无论其 authority 值。

### Node 身份派生

- 每个 node 的 `nodeId` 由 `nodeKind` 加该 kind 的稳定语义键，经确定性 JSON
  canonicalization + SHA-256 派生，格式为 `ctxg:<nodeKind>:<digest>`。
- 语义键必须是 package 内已经稳定存在的字段（decisionId、actionRef、factorKey、
  differenceId、evidenceId、factSetId 等），不得含 wall-clock、数组下标、遍历
  顺序。
- 每个 edge 的 `edgeId` 由 `(fromNodeId, toNodeId, edgeKind, edge payload)`
  派生，格式为 `ctxg:edge:<digest>`。
- `validateContextGraph` 从 node/edge 自身载荷重算 nodeId/edgeId 并断言相等；
  篡改 payload 而不更新 id 即校验失败。

### Origin / authority 投影规则

| nodeKind | origin | authority | producer / producerVersion 来源 |
|---|---|---|---|
| Decision | canonical_replay | structural | canonical replay 生产者与 `componentVersions.canonicalReplay` |
| CandidateAction | package_projection | structural | package schema 生产者与 `componentVersions.packageSchema` |
| KnownGameFact | 按 `knownGameFacts.provenance` 映射（raw_replay/mixed → canonical_replay；user_asserted → user_assertion；legacy_regression_bridge_only → legacy_regression_bridge） | hard | canonical replay / user assertion / legacy bridge 对应版本 |
| FactorFact | factor_pipeline | evidenceClass 为 versioned_upstream_estimate 时 advisory，否则 hard | 有 engineIdentity 时用 fact-engine；否则 canonical replay |
| FactorDifference | factor_pipeline | heuristic_difference 时 advisory，deterministic_difference 时 hard | 同上 |
| ModelEvaluation | model_evaluation | model | `componentVersions.mortalSourceModel.identity` 与 `.version` |
| DeterministicPreference | factor_pipeline | structural | factor pipeline 版本 `componentVersions.factorPipeline` |
| Evidence | 按 registry kind 映射（canonical_event → canonical_replay；fact_engine_request → factor_pipeline） | hard（canonical_event）或 advisory/按来源（fact_engine_request 保留其 registry producer 语义） | 直接复制 M6-C evidence registry 的 producer / producerVersion |

上述映射必须 deterministic；projector 不引入新的分析计算，不生成 package 中
不存在的事实或差异。

### Edge 模型

v1 edge kind 枚举：

- `contains`
- `applies_to`
- `compares`
- `supports`
- `recommends`
- `derived_from`
- `opposes`
- `qualifies`
- `verbalizes`

前六种由 projection 使用；`opposes` / `qualifies` / `verbalizes` 保留给
reasoning overlay（D2），D1 projector 不产生。`causes` 不在枚举中，graph 校验
拒绝任何未知 edge kind 与 `causes` 字符串。

D1 projection 边规则：

- Decision `contains` 该决策的 KnownGameFact、CandidateAction（analysis_ready）、
  FactorFact、FactorDifference、ModelEvaluation（analysis_ready）、
  DeterministicPreference（非 null 时）。
- FactorFact `applies_to` 其 ledger 对应的 CandidateAction。
- FactorDifference `compares` 左右两个 CandidateAction，edge payload 携带
  `side: left | right`。
- FactorDifference `supports` 被方向支持的一方（supports_left → left；
  supports_right → right；neutral 不产生 supports 边）。
- ModelEvaluation `recommends` 每个 preferred CandidateAction。
- DeterministicPreference `recommends` 其 actionRefs 对应的每个 CandidateAction。
- 每个 evidence-bearing 节点（KnownGameFact / FactorFact / FactorDifference）
  `derived_from` 其每个 evidenceId 对应的 Evidence 节点。
- fact_engine_request 类型的 Evidence 节点 `derived_from` 其每个 sourceRef
  对应的 canonical_event Evidence 节点。

每个 edge 概念上携带 `edgeId`、`edgeKind`、`from`、`to`、`origin`、
`provenance`（D1 projection 边为空）、`payload`（kind-specific；D1 只有
compares/supports 有 payload）。所有 projection 边的 origin 为
`package_projection`。

### 投影算法（`projectContextGraph`）

- 输入：`StructuredAnalysisPackage`。projector 先用
  `StructuredAnalysisPackageSchema` re-parse 做 fail-fast；**不**重跑 M6-C
  package validator（校验所有权仍在 M6-C），生产路径必须先
  `validateStructuredAnalysisPackage` 再投影。
- 对每个 package decision 投影 Decision 节点与其 KnownGameFact 节点；仅
  `analysis_ready` 决策投影候选、账本、差异、模型评价与偏好节点。
- 从 `package.evidenceRegistry` 投影全部 Evidence 节点；registry key 必须与
  `evidenceId` 一致。
- 按上述边规则创建边；所有 node/edge 经排序后组装。
- 同一 package（JSON roundtrip 后内容一致）必须产生 deep-equal 的 graph。

### Per-decision subgraph（`getDecisionSubgraph`）

- 输入：graph + decisionId。
- 从该 Decision 节点出发，按 projection 边的有向方向做可达遍历；返回只包含
  该决策及其可达节点的子图。
- 不在 Decision → ... 有向可达集中的共享 Evidence 节点不会被反向拉入其他
  决策；decision subgraph 是"从 Decision 出发可达"，不是无向连通分量。
- decisionId 不存在时 fail closed，不返回空图。

### Reasoning overlay 追加（`appendReasoningOverlay`）

- D1 只冻结追加契约，不生成 LLM 内容。调用方传入 reasoning nodes 与 edges。
- 返回新 graph；原 evidence 节点与边必须 deep-equal 保持原样（append-only）。
- 追加前校验：
  - reasoning node 的 `partition === "reasoning"`、`origin === "llm_reasoning"`、
    `authority === "coach"`；
  - reasoning node 的 nodeKind 属于 CoachInference / CoachJudgment /
    Explanation 三种之一；
  - reasoning edge 的 from/to 必须解析到图中已有节点；
  - reasoning edge 不得以 evidence 节点为 from 去改 evidence 语义；evidence
    edge 不得因 overlay 增删而变化。
- 校验失败即拒绝追加并抛错，不返回部分修改的 graph。

### `ContextSliceBuilder`（`buildGraphContextSlice`）

- 输入：`ContextGraph` + `ReviewSelectionResult`。
- 前置校验：
  - `selection.analysisPackageId === graph.packageId`，否则 fail closed；
  - 每个 `selected.decisionId` 必须解析到 graph 中的 Decision 节点。
- 选择范围：对每个 selected decision，取该 Decision 的 decision subgraph；
  多个入选决策的节点/边按 id 去重后按 nodeId/edgeId 排序。selected 的顺序
  进入 slice 的 `selectedDecisionIds`（按 rank 升序）。
- 空 selection 返回合法空 slice：`selectedDecisionIds` 为空、nodes/edges 为空。

### `GraphContextSlice` allow-list

`GraphContextSlice` 概念字段：schema 版本（`graph-context-slice/v1`）、
`sliceId`（由 `packageId + selector policyVersion + selectedDecisionIds` 确定性
派生）、`packageId`、`selectedDecisionIds`、`nodes`、`edges`。不携带
`createdAt`、raw package、raw Mortal 报告、原始牌谱字节、账号 ID、昵称、令牌、
下载 URL。

slice 中每个 node 保留 node 元数据（nodeId / nodeKind / partition / origin /
authority / producer / producerVersion / provenance），但其 payload 必须按以下
allow-list 过滤：

| nodeKind | LLM-safe 载荷字段 |
|---|---|
| Decision | decisionId、surface、roundOrdinal、normalizedDecisionContext |
| CandidateAction | actionRef、action、origins |
| KnownGameFact | 除 evidenceIds 外的 KnownGameFacts 字段（evidenceIds 由 node.provenance 承载） |
| FactorFact | factorKey、dimension、status、evidenceClass、preferenceEligibility、value、limitations |
| FactorDifference | differenceId、axis、dimension、leftActionRef、rightActionRef、direction、valueRelation、leftValue、rightValue、preferenceEligibility、evidenceClass、limitations |
| ModelEvaluation | evaluationId、comparisonSetId、decisionLayerRef、engineId、engineVersion、adapterVersion、scoreMethod、detailPolicy（不含 frozenAt）、candidates、preferredActions、actualActionRef、scoredActualModelActionRef、errorGap、modelReason |
| DeterministicPreference | actionRefs、scope、decisiveDifferenceIds、coverage |
| Evidence | evidenceId、kind、producer、producerVersion、sourceRefs、payload |

slice 校验器拒绝 allow-list 之外的键、任何 URL、任何 privileged 载荷；reasoning
节点在 D1 不会被 slice 选中（projection 无 reasoning 节点）。

### Graph / slice 校验（`validateContextGraph` / `validateGraphContextSlice`）

`validateContextGraph` 至少执行：

- strict schema 解析与 JSON roundtrip 不变；
- nodeId / edgeId 全局唯一且可重算一致；
- edge 端点解析到存在节点；
- 无 `causes` 或未知 edge kind；
- evidence 分区节点 origin 不得为 `llm_reasoning`、authority 不得为 `coach`；
- reasoning 分区节点 origin 必须为 `llm_reasoning`、authority 必须为 `coach`、
  nodeKind 必须是三种 reasoning kind；
- 所有 reasoning edge 必须解析到存在节点；overlay 不得改动 evidence 节点/边
  （append-only 校验在 `appendReasoningOverlay` 中机械强制）。

`validateGraphContextSlice` 至少执行：

- strict schema 解析与 JSON roundtrip 不变；
- slice 只包含 allow-list 字段；
- 无 URL、无 privileged 载荷；
- 所有 slice node/edge 能匹配源 graph 中同 id 节点/边；
- selectedDecisionIds 按 rank 升序且每个都能解析到 Decision 节点。

两个校验器都接受 untrusted 输入（例如从磁盘读回的 graph/slice），fail closed。

### 错误约定

M6-D1 所有失败抛 `m6d1_<模块>_<错误>:<detail>` 风格错误；命名与 M6-C
`m6c_validator_*` 保持一致风格，测试按错误名断言，不按消息文案断言。

## Testing Decisions

### 好测试只测外部行为

- 给定同一个 schema-valid package → `projectContextGraph` 两次产出 deep-equal
  graph；JSON roundtrip 后仍通过 `validateContextGraph`。
- 给定 graph + 同源 `ReviewSelectionResult` → `buildGraphContextSlice` 产出
  schema-valid slice，且每个 node payload 都在 allow-list 内。
- 给定被篡改的 graph / slice / overlay → 对应 validator 拒绝。
- 不测内部遍历顺序函数、不测未导出的 helper。

### Seam

按评审确认，两个平级 seam：

1. **`projectContextGraph`**：所有 evidence-subgraph 测试都从它构建正例；
   发布判断只依赖这个投影 seam。
2. **`buildGraphContextSlice`**：所有 slice 测试都从它构建正例；M6-D2 的
   LLM 上下文只能来自这个 seam。

### 按模块测试

- contracts：node/edge/slice schema 接受最小合法样例，拒绝未知 node/edge
  kind、`causes`、未知 authority/origin、allow-list 外字段；contracts 不依赖
  reasoning 可编译。
- projector：M6-C 的 whole-game golden package 投影出 graph；失败/跳过决策
  只投影 Decision + KnownGameFact + Evidence，不投影 analysis payload；同一
  package 两次投影 deep-equal；schema-invalid package fail closed。
- projector 边规则：analysis_ready 决策存在 Decision contains 六类节点、
  FactorDifference compares/supports 正确方向、ModelEvaluation recommends
  preferred、derived_from 覆盖全部 evidenceIds、fact-engine Evidence
  derived_from 其 canonical sourceRefs。
- graph validator：篡改 nodeId 留旧 payload、edge 端点悬空、插入 `causes`、
  evidence 节点 origin=llm_reasoning / authority=coach、reasoning 节点
  origin≠llm_reasoning、reasoning edge 悬空，均拒绝。
- decision subgraph：按 decisionId 返回确定性子图；不存在的 decisionId fail
  closed；两个决策共享 Evidence 时不会互相拉入对方的 Decision/Factor 节点。
- overlay append：合法 reasoning nodes/edges 追加成功；追加前后 evidence
  nodes/edges deep-equal；改写 evidence 节点/边、删除 evidence 节点/边、
  reasoning 节点 authority 错误、reasoning edge 悬空，均拒绝。
- slice builder：空 selection 返回空 slice；selection 与 graph packageId
  不一致 fail closed；selected decisionId 不存在 fail closed；入选顺序与
  selector rank 一致；共享节点去重且排序确定。
- slice validator：allow-list 外字段、URL、privileged 载荷、slice node 与
  graph 同 id 节点不一致，均拒绝。

### Prior art

- M6-C 的 builder/validator 测试（`structured-analysis-package-builder` /
  `structured-package-validator` / `structured-analysis-package-golden`）：
  以真实 whole-game package 为正例、以 tampered clone 为负例；M6-D1 沿用同一
  golden package 作为投影正例。
- DeterministicReviewSelector 测试：消费 schema-valid package、对坏输入
  fail closed；M6-D1 的 slice builder 沿用其"选择结果只引用 decisionId"的
  消费方式。
- contracts 层 schema 测试：node/edge/slice schema 作为新的跨模块契约测试。
- 不在 M6-D1 重跑 M6-C 的 golden 构建链；投影测试直接消费 M6-C 测试已证明
  有效的 package 构造路径。

### 验收门

- `npm run typecheck`、`npm test`、`npm run test:package-import` 全绿；
- 同一 M6-C golden package → 同一 graph deep-equal；同 graph + 同 selection
  → 同 slice deep-equal；
- graph/slice 校验器拒绝全部负例；
- 不新增 workspace 依赖；`npm run check:architecture` 不回归。

## Out of Scope

- LLM provider / BYOK / key 管理、GraphContextSlice 实际发给模型、结构化
  CoachInference / CoachJudgment 生成、grounding validator、evidence-only
  degrade（M6-D2）。
- `ReviewReport` 及其 reasoning overlay 的持久化 schema（M6-D2）。
- M7-A 固定 review UI 与任何 graph visualization；UI 消费 decision subgraph
  是后续里程碑。
- M7-B ReviewSession / SQLite / 产品内 Mortal 缓存。
- M4 受约束追问的 question → anchoring → traversal 完整链路。
- Neo4j / GraphRAG / embeddings / vector DB / community detection /
  PageRank / causal engine / causal inference framework。
- 保存 raw chain-of-thought 或任何事后解析。
- 把 `supports` / `derived_from` 升级为 causal relation。
- 用 ContextGraph 替代 `StructuredAnalysisPackage` 作为证据事实来源。
- `StructuredAnalysisPackage` 的任何变更；`StrictAnalysisPackage` 迁移。
- 新外部语料或新的 Mortal 提交。

## Further Notes

- 本 spec 是 ADR-0004 与 Auditable Context Graph Design 的 M6-D1 执行收敛；
  与 design spec 冲突时，以本 spec 的窄切口径为准（例如 AdvisorySignal /
  Constraint 不设独立 node kind，Evidence 显式成为 node kind）。
- ContextGraph 是运行时投影，不是第三个持久化 canonical artifact。
- D1 只冻结 reasoning overlay 的分区规则与 append-only 校验；LLM 内容与
  ReviewReport 归 D2。
- 术语一律以 `coach/CONTEXT.md` 词汇表为准；与既有 ADR 矛盾处显式指出，不
  静默覆盖。
