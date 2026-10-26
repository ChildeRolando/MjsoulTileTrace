COAC-265 设计交付：为现有 Arena 检索链冻结 Self-RAG 风格资料适用性过滤的接口、所有权与真实对照实验协议。本 PR 不包含实现或真实模型实验。

## 本 PR 包含

- `coach/docs/specs/2026-10-27-self-rag-applicability.md`：窄规格。范围只限 Arena `search_knowledge` 链；冻结事实投影、selector 输入/输出、模型可见结果、审计回执、runner 门控端口、独立预算、失败码与归档字段。
- `coach/docs/plans/2026-10-27-self-rag-applicability.md`：逐文件实施计划，冻结**工单 A**（selector + runtime 接线）与**工单 B**（独立 paired 实验 harness + 报告）的排他文件所有权与共享接口；两个工单都交同一个现有 Ticket 编码执行器，在各自独立工作树并行执行。
- `coach/docs/development/REVIEW_LOOP.md`：按 2026-10-26 生产读回更新当前接入（multi/priority reviewer 池、同一现有执行器 + 独立工作树、GPT-Web 共享容量 1、GPT-Web 上下文预取边界、结果文件事实源与 CodexPro.write、独立授权结果目录、保留的回滚点）；2026-10-15 记录作为历史说明保留原含义。

## 本轮修订（解决评审 P2 与草案反馈）

- **R1 语义判定不再被单一机械条件架空**：明确三层职责——selector 按可见事实与片段声明的条件/例外做语义判断；程序只校验结构、候选身份/覆盖、引用与事实绑定、预算，不证明语义理由；语义理由成立性由与 selector 输出隔离、跑前冻结的独立判读检查。`irrelevant` 必须给出具体可见前提（`premises`：可见证据引用或 `fact` 路径 + 观察值）。`complete-visibility-only` 保留为**一个**确定性特例，不再是唯一剔除通道；程序不因“语义无法机械证明”而降级。
- **R3 两个引用域拆开**：片段身份 `sourceRef` 只对候选片段集合校验，`premises` 的 `evidence-ref` 只对盲观察 DTO 的可见证据引用域校验；不取并集、不求交集。新增冻结的 `ARENA_RAG_VISIBLE_FACT_PATHS` 路径表，让没有 opaque 引用的可见事实用 `fact` 前提绑定。
- **R2 实验改用真实研究语料**：删除“以版权/快照评审为由排除 40-card v2”的无依据门槛。正式 paired 研究改读 `E:/AgentData/Coach/scene-pattern-study-20261023-kb-v2/knowledge.json`（`coach-scene-knowledge-web/v2`，40 张卡；文件 SHA-256 `73375324682d30e3dbc43a921b340e6af330cae3587bd5c9ba0801ae1be19dab`），冻结 20 张代表性子集与转换规则表，保留原出处/适用条件/例外/完整摘要与内容哈希；只读、不入仓、不发布，产品 seed 语料仍是默认。新增场景层抽样（避免全部落在早巡）与“预判没有任何 irrelevant 就停止”的闸门。
- **R4 Review Loop 接入说明**：`工作树小队` 改为“同一现有编码执行器 + 独立工作树”，明确不新增队长/成员/小队抽象；补充 GPT-Web 上下文由可信本机适配器预取并绑定 agent/run、网页只读源码并用 `CodexPro.write` 提交结论、预取失败 fail closed。
- 草案反馈的两处接口小问题：统一 gate 端口字段名为 `output`（不再 result/result 两套）；selector 输出预算改为 pilot 阶段一次性从预声明 ladder 冻结，并明确 `maxOutputBytes` 与 `maxOutputTokens` 的度量边界。

## 关键设计点

- 反思不在 `ArenaRagRetriever.query` 内、也不在 `withToolTimeout` 的 10s 里：检索仍 ≤10s，反思有独立预算，可取消、耗时与用量进入本轮总账。
- `relevant`/`uncertain` 一律保留；整批结构失败保留全部原始片段并标 degraded；失败不得声称 selfrag 已生效。
- 默认行为不变：不加 `--rag-applicability` 不多一次模型调用，历史归档继续可读。
- 实验冻结为 2 pilot + 8 未使用 evaluation 局、每局一个可见决策（在预声明场景层内选取）、预声明 20 次运行、baseline/selfrag 仅差过滤步骤、不重试、不在评估集调参；指标区分机械特例与语义剔除通道，并单独报告语义理由成立性。

## 未做

无实现、无真实对照实验、不合并 `arena-context-rag`、不启动实现子票；不改变任何生产默认流程。§2.2 的超时与失败路径仍未实测，由工单 A 的真实 smoke 补齐。

## 验证

仅文档变更，未运行产品测试门禁（无代码变更）。实际执行：

- 重算研究语料身份：`knowledge.json` 87 933 字节、SHA-256 `73375324682d30e3dbc43a921b340e6af330cae3587bd5c9ba0801ae1be19dab`；同目录 `freeze.json` SHA-256 `5d7271bc9b1869802e5669db5d8a8bf174e26dc57a4bd944597e71365fa49ace`。
- 读取 `knowledge.json` 核对 40 张卡、`concept/conditions/exceptions/content/source` 字段齐全；20 张子集卡均存在，`sourceTitle` ≤160、`documentLocation` ≤160、`content` ≤1000（最长 287 字）。
- 核对规格引用的代码符号在 main 上存在：`createArenaRagRetriever`、`createArenaRagRunnerTool`、`withToolTimeout`、`createArenaToolCallProvider`、`createArenaBlindObservation`、`createArenaBlindRuleRequest`、`screenArenaDecisions`、`queryRules`、`replayCanonicalStream`、`ArenaRunAliasVault`、`createLibriichiRuleProjector`、`libriichiRuleCanonicalJson`、`ARENA_RUN_LIMITS_V1`、`maxCorpusPassages`。
- 三份文档的代码围栏成对、无 NUL 字节；`git diff 735d5af..c8ed50b` 只含上述三个文档。
- 0.162.1 兼容探测（沿用上一 head，本 head 未重跑）：两次完成的短回合（简单 schema、Arena 组合 schema）与一次中途取消，结果与限制见规格 §2.2；超时/失败路径仍标未实测。

