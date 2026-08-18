# ADR-0004: Typed Context Graph as the Auditable LLM and Reasoning Boundary

日期：2026-08-18
状态：已冻结（docs-only architecture/roadmap update）
术语与上下文：以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准；证据权威分层沿用
[ADR-0003](./0003-evidence-first-coaching-judgment-and-authority-layers.md)。

## Decision

采用 typed ContextGraph 作为 `StructuredAnalysisPackage` 与 LLM Coach 之间的
上下文/审计层。

Graph 是 projection，不是 source of truth。`StructuredAnalysisPackage` 仍然是
确定性/可审计分析产物，是 evidence source of truth；ContextGraph 不替代它，
也不得倒写 package。

Evidence subgraph 由 StructuredAnalysisPackage 确定性投影而来，immutable。
LLM reasoning 是 append-only 的 reasoning overlay：

- LLM 只能追加 CoachInference / CoachJudgment / Explanation-related
  nodes/edges；
- LLM 不得修改、删除、覆盖 hard-evidence / advisory / model nodes；
- 不保存或依赖模型 raw/private chain-of-thought；
- 产品需要的是 structured rationale / argument trace，不是 raw CoT。

v1 graph relation 表达论证与语义关系，不声称建立因果真理。GraphRAG /
Neo4j / graph database / embeddings / community detection / PageRank /
causal engine 均不进入 v1 scope。v1 使用内存中的 typed property graph +
deterministic traversal 即可，未来规模需要时再引入高级 graph retrieval。

## Why

现有实现 + 已冻结的待实现契约正在形成/指向隐式 graph：

- evidenceRefs
- premiseRefs
- evidence authority
- provenance
- CoachInference
- CoachJudgment

显式化以后可以统一支持：

- context-aware reasoning
- multi-hop provenance
- explanation audit
- future chat retrieval
- reasoning governance

## Rejected alternatives

A. 继续只使用 flat JSON + premiseRefs
优点简单；缺点 provenance 和多跳关系会越来越隐式，未来 chat/audit 重复造图。

B. 当前直接接完整 GraphRAG / Neo4j / graph DB
过重；当前数据本身已经高度结构化，不需要先做非结构化实体抽取、community
detection 等。

C. 保存 LLM raw CoT 后事后解析
不可稳定验证，不适合作为产品 audit contract。

D. 把 graph relation 默认当 causal relation
语义过强；当前只能声称 argument/support/derivation。

## Consequences

- M6-C 必须提供 stable evidence identity/provenance。
- M6-D1 先构建 graph substrate。
- M6-D2 才接 LLM。
- M4 future chat 可复用 graph retrieval。
- v1 不引入 graph infrastructure dependency。
