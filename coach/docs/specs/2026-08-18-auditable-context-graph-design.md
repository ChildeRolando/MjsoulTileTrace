# Auditable Context Graph Design（typed ContextGraph：StructuredAnalysisPackage 的投影与 LLM 审计边界）

日期：2026-08-18
状态：architecture/design spec，不是 implementation ticket
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准；证据权威分层见
[ADR-0003](../adr/0003-evidence-first-coaching-judgment-and-authority-layers.md)；
ContextGraph 裁定见
[ADR-0004](../adr/0004-context-graph-as-auditable-llm-boundary.md)。
路线图见 [`ROADMAP.md`](../development/ROADMAP.md)，架构见
[`ARCHITECTURE.md`](../development/ARCHITECTURE.md)。

## 1. Problem / goals

整盘教练报告需要回答的不只是“Mortal 推荐什么”，而是“这条判断基于哪些事实、
哪些估算、哪些教练推断”。现有 `StructuredAnalysisPackage` 已经携带
evidenceRefs / premiseRefs / provenance / CoachInference / CoachJudgment 等
隐式图结构，但缺少统一的 typed graph 层，导致：

- provenance 查询要反复回到 flat JSON 里手工拼引用链；
- LLM 上下文选择没有稳定 allow-list 边界，容易把过宽或过窄的上下文交给模型；
- 审计 UI 无法沿统一 refs 展开“事实 → 差异 → 判断 → 解释”的路径；
- 未来 M4 constrained chat 的 context retrieval 会重复造一套图遍历。

目标：

- 把 `StructuredAnalysisPackage` 确定性投影为 typed ContextGraph；
- 用 evidence subgraph（immutable）承载硬证据、advisory signal 与模型评价；
- 用 reasoning overlay（append-only）承载 LLM 教练判断与解释；
- 用 `GraphContextSlice` 作为 LLM 输入的唯一 allow-list 边界；
- 保证 v1 实现成本足够低：ContextGraph must be cheap enough to implement as
  a typed in-memory structure in v1；
- 为 M7-A audit UI 与 M4 chat retrieval 提供同一套 graph refs。

## 2. Non-goals

v1 不实现：

- Neo4j 或任何 graph database；
- Microsoft GraphRAG 等完整框架接入；
- embeddings / vector DB；
- community detection；
- graph ranking / PageRank；
- general causal engine；
- raw chain-of-thought 存储或事后解析；
- 把 `supports` / `derived_from` 等论证边升级为 causal relation；
- 用 graph 替代 `StructuredAnalysisPackage` 作为证据事实来源。

## 3. Relationship to ADR-0003 / ADR-0004

- ADR-0003 冻结三层证据权威：hard evidence（约束）、advisory signal（参考、
  无否决权）、coach inference / CoachJudgment（可否决 advisory，不得抵触 hard）。
  本 spec 不改变该权威分层，只把它投影为 graph node/edge 上的 authority /
  evidenceClass / origin / provenance。
- ADR-0004 冻结：ContextGraph 是 projection，不是 source of truth；evidence
  subgraph immutable；LLM reasoning append-only。本 spec 是 ADR-0004 的设计展开。
- 与 ADR-0003 的“解释与分析物理分离”一致：LLM 产物只进入 ReviewReport 的
  reasoning overlay，不进入 StructuredAnalysisPackage。

## 4. Relationship to StructuredAnalysisPackage

- `StructuredAnalysisPackage` 仍然是确定性/可审计分析产物，是 evidence source
  of truth。
- ContextGraph 是它的 typed projection，不是替代品，也不得倒写 package。
- M6-C 必须为投影提供稳定 substrate：record/decision identity、component
  versions、decision outcome、renderer/LLM-safe decision context /
  KnownGameFacts、stable canonical event/evidence references、
  CandidateFactorLedger / FactorFact、FactorDifference、带 evidence class +
  producer/version 的 advisory signals、optional DeterministicPreference、
  ModelEvaluation、stable EvidenceId / provenance。
- LLM 产物不得放入 StructuredAnalysisPackage。
- StructuredAnalysisPackage 自身不得设计成 graph。

## 5. Base evidence graph model

Evidence subgraph 由 `StructuredAnalysisPackage` deterministic projection 生成。
初始 node kinds 至少概念上包含：

- Decision
- CandidateAction
- KnownGameFact
- FactorFact
- FactorDifference
- AdvisorySignal
- ModelEvaluation
- DeterministicPreference
- Constraint

投影规则必须 deterministic：同一个 package 输入产生同一个 evidence subgraph。
projection 不引入新的分析计算，不生成 package 中不存在的事实或差异。

## 6. Reasoning overlay model

LLM 只允许追加：

- CoachInference
- CoachJudgment
- Explanation-related representation

Reasoning overlay 可以引用 evidence nodes，但：

- 不得修改、删除、覆盖 hard-evidence / advisory / model nodes；
- 不保存或依赖模型 raw/private chain-of-thought；
- 产品需要的是 structured rationale / argument trace，不是 raw CoT。

## 7. Node authority/origin/provenance model

每个 node 至少概念上携带：

- stable id
- kind
- origin（例如 canonical replay / factor pipeline / model evaluation /
  advisory producer / LLM reasoning）
- authority / evidenceClass（hard / advisory / model / coach）
- producer/version
- payload
- provenance

Evidence subgraph 节点的 origin 必须是非 LLM。Reasoning overlay 节点的 origin
标为 LLM，authority 为 coach 层，只允许 append。

## 8. Edge semantics

v1 只使用明确的 argument/semantic relation，例如：

- derived_from
- supports
- opposes
- qualifies
- compares
- applies_to
- recommends
- verbalizes

不要引入未经证明的 `causes` relation。`supports` / `derived_from` 表达论证与
语义关系，不声称建立因果真理。每个 edge 概念上同样携带 provenance/version。

## 9. ContextSliceBuilder / LLM boundary

- `ContextSliceBuilder` 从 ContextGraph 通过确定性 allow-list / traversal 选出
  单次 LLM 输入 `GraphContextSlice`。
- `GraphContextSlice` 是 LLM 的 transport boundary：LLM 只能读取 slice 内的
  nodes/edges，不能读取完整 ContextGraph，更不能读取 raw package / raw
  Mortal 报告 / 原始牌谱字节。
- Slice 选择必须是确定性可复现的；不根据模型输出动态扩权。
- v1 不引入向量相似度检索或 graph ranking 来决定 slice。

## 10. Privacy boundary

- 座位匿名化沿用既有决策：LLM 只拿匿名座位/角色，不拿账号 ID、昵称、令牌、
  牌谱下载 URL、原始字节。
- `GraphContextSlice` 只携带 LLM-safe 投影字段；audit 只留 hash/元数据。
- ContextGraph 中的 provenance 用于本地审计，不意味着把 privileged source
  原始数据跨边界暴露给 renderer 或 LLM。

## 11. Validation rules

ContextGraph 至少需要以下结构性校验：

- evidence subgraph 节点 origin 不得为 LLM；
- reasoning overlay 节点 origin 必须为 LLM 且 authority = coach；
- reasoning overlay 只能 append，不得改写 evidence nodes/edges；
- 所有 reasoning edge 必须解析到存在的节点；
- hard-evidence / advisory / model nodes 不可被 reasoning overlay 删除；
- stable id 全局唯一；
- graph 中不出现 `causes` relation；
- slice 只能来自 allow-list 投影字段，不得包含 privileged raw payload。

## 12. ReviewReport integration

- ReviewReport 保存 reasoning overlay（CoachInference / CoachJudgment /
  Explanation-related nodes/edges）。
- ReviewReport 经 decisionId / evidenceId 引用 evidence subgraph，不内嵌
  StructuredAnalysisPackage。
- ContextGraph 由 projection + overlay 组合：
  `ContextGraph = project(StructuredAnalysisPackage) + ReviewReport.reasoningOverlay`。
- v1 不要求新增第三个持久化 canonical artifact；ReviewSession 仍可只引用
  StructuredAnalysisPackage 与 ReviewReport。

## 13. M7-A audit UI integration

- M7-A 保持 fixed review UI，不要求 graph visualization。
- decision detail 可以沿 graph refs 展开 evidence / rationale provenance。
- 用户可以查看“这条判断基于哪些事实/估算/教练推断”。
- UI 展示的是 audit trail，不是开发者图数据库界面。

## 14. M4 future context-aware chat integration

M4 未来 constrained follow-up/chat 的 context retrieval 将建立在 ContextGraph
上：

```text
question
→ decision/concept anchoring
→ typed graph traversal
→ relevant ContextSlice
→ LLM
```

embeddings / GraphRAG retrieval 不作为当前 prerequisite。

## 15. Evolution path toward graph retrieval

未来若规模需要，才评估：

- 是否引入外部 graph database / graph retrieval；
- 是否引入 embeddings / vector DB；
- 是否引入 GraphRAG 类算法；
- 是否引入 graph ranking / PageRank；
- 是否引入 causal inference framework。

这些全部属于 future evolution，不在 v1 scope。v1 先验证 typed in-memory
property graph + deterministic traversal 是否满足审计与上下文选择需求。

## 16. Explicit non-requirement for GraphRAG/graph DB in v1

v1 明确不要求：

- Neo4j；
- external graph framework；
- embedding model；
- vector DB；
- graph-RAG algorithm；
- causal inference framework。

ContextGraph must be cheap enough to implement as a typed in-memory structure
in v1。
