# M6-D2：Graph-grounded Coach + Grounding Validator 实现规格

日期：2026-08-24
状态：M6-D2 设计规格（implementation spec，ready-for-agent；本文件落盘架构决策与
实现边界，M6-D2 尚未实现）
依据：[ADR-0003](../adr/0003-evidence-first-coaching-judgment-and-authority-layers.md)、
[ADR-0004](../adr/0004-context-graph-as-auditable-llm-boundary.md)、
[ADR-0005](../adr/0005-workspace-dependency-boundaries.md)、
[ROADMAP §4 M6-D2](../development/ROADMAP.md)、
[Auditable Context Graph Design](./2026-08-18-auditable-context-graph-design.md)、
[M6-D1 Context Graph substrate 规格](./2026-08-19-m6-d1-context-graph-substrate-design.md)、
[M6-C StructuredAnalysisPackage 规格](./2026-08-18-m6-c-structured-analysis-package-design.md)、
[DeterministicReviewSelector 规格](./2026-08-19-deterministic-review-selector-design.md)、
[2026-08-18 grill 决策 E1–E9 / F1–F3](../handoffs/2026-08-18-next-phase-roadmap-grill-decisions.md)。
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准。

## Problem Statement

M6-D1 交付了 substrate：`StructuredAnalysisPackage` 可以确定性投影为
`ContextGraph`，`GraphContextSlice` 已经是 allow-list 过的 LLM 传输边界，reasoning
overlay 的 schema/partition 校验器（`validateReasoningOverlayPartition`）已经冻结。
但从 slice 到教练报告之间的一切仍然缺失：

- 没有 LLM 接入：无 provider、无 BYOK key 保管、无传输边界执行；
- 没有结构化 reasoning 生成：CoachInference / CoachJudgment / Explanation 只有
  node kind 枚举，没有 payload 契约与生成路径；
- 没有 grounding validator：LLM 输出的引用、推荐、数字、方向无从机械校验；
- 没有 ReviewReport：reasoning overlay 无处安放，失败状态没有归属；
- 没有降级语义：LLM 失败时产品行为未定义。

M6-D2 的定义是：

> **M6-D2 = 在 M6-D1 substrate 上接入 privileged-process LLM：以
> `GraphContextSlice` 为唯一传输边界生成结构化 CoachInference / CoachJudgment /
> Explanation，经 grounding validator 机械校验后以 append-only reasoning overlay
> 进入 ReviewReport；LLM 失败一律 evidence-only degrade，永不污染
> StructuredAnalysisPackage；raw chain-of-thought 永不进入产品 contract。**

## Solution

M6-D2 交付七个部件（前四个在 reasoning，契约在 contracts，provider 在 desktop）：

1. **`generateReviewReport(graph, selection, provider)`** —— 唯一的报告生成
   seam。输入已验证的 `ContextGraph`、同源 `ReviewSelectionResult` 与一个注入的
   `LlmCoachProvider` 端口实现；内部组合 M6-D1 既有 seam（`buildGraphContextSlice`），
   产出 `ReviewReport`。引擎不拥有"什么值得评审"的判定权（grill E3/F1）。
2. **`appendReasoningOverlay(graph, reasoningNodes, reasoningEdges)`** —— D1 预留
   的唯一 overlay 追加动作。先过 `validateReasoningOverlayPartition`，evidence
   分区 deep-equal 保持原样，返回通过 `validateContextGraph` 的新 graph。
3. **`validateCoachGrounding(graph, draft)`** —— hard/soft 两层 grounding
   validator（grill E5/E8）：hard 是发布门、纯机械、fail closed；soft 仅诊断。
4. **`validateReviewReport(report, graph)`** —— ReviewReport 校验器，接受
   untrusted 输入（M7-B 读回路径），fail closed。
5. **prompt builder + `coach-reasoning-draft/v1`** —— 冻结版本的提示词模板与
   模型侧结构化输出 schema；LLM 只产出 draft，永不铸造图身份。
6. **contracts 冻结 D2 数据契约** —— ReviewReport schema、三种 reasoning
   payload schema、`generationStatus` / `explanationStatus` 枚举、
   `LlmCoachProvider` 端口类型与请求/结果 DTO、schema/prompt 版本字面量。
7. **desktop 主进程 provider** —— v1 单实现（OpenAI 兼容、BYOK）、key 保管、
   安全 IPC 面与组合根编排（validate → project → select → generate）。

M6-D2 不新增任何分析能力，不修改 selector 策略，不修改 M6-C / M6-D1 的任何
契约，不引入新的 workspace 依赖。

## User Stories

1. 作为 D2 引擎的调用方（desktop 编排层），我想传入已验证的 `ContextGraph` 与同源 `ReviewSelectionResult`，这样引擎不拥有"什么值得评审、按什么顺序评审"的判定权（grill E3/F1，判定权在 DeterministicReviewSelector）。
2. 作为引擎调用方，我想让 LLM 上下文只来自 `buildGraphContextSlice` 的产物，这样模型永远接触不到完整 graph、raw package、raw Mortal 报告或原始牌谱字节（ADR-0004 §9）。
3. 作为引擎调用方，我想注入一个 `LlmCoachProvider` 端口实现而不是让 reasoning 自己联网，这样 reasoning 包保持零网络依赖，desktop 仍是唯一组合根（ADR-0005）。
4. 作为复盘用户，我想让 LLM 输出结构化 `CoachJudgment`（推荐 + 置信度 + 前提引用），这样我能看到"教练为什么这么判"，并能沿 premiseRefs 展开前提。
5. 作为复盘用户，我想让 LLM 基于真实 KnownGameFacts 形成的高级读牌判断落为 `CoachInference` 而不是混进 advisory signal，这样读牌语义拆分（CONTEXT.md）在产品数据上可查。
6. 作为复盘用户，我想让每条解释条目（`Explanation`）携带 `EvidenceClaim` 与占位符数字，这样文本中的事实数字永远由证据渲染解出，而非模型书写（grill E7）。
7. 作为复盘用户，我想让教练判断以 `verbalizes` 边留痕；`opposes` / `qualifies` 仅保留 contract 与读回校验能力。当前 draft 没有结构化 stance marker，producer 不得猜测并生成这两类边；其生成能力延期到后续规格。
8. 作为复盘用户，我想在 LLM 失败时仍得到合法的 evidence-only 报告与可渲染的证据视图，这样教练功能失败不夺走复盘能力（grill E4/E9）。
9. 作为复盘用户，我想让报告明确区分"模型偏好"（ModelEvaluation 节点）与"教练判断"（CoachJudgment 节点），这样两个权威层不会在 UI 上混淆。
10. 作为复盘用户，我不想在任何产品面看到 raw chain-of-thought，这样我看到的是结构化论证路径，不是模型独白的节选（ADR-0004）。
11. 作为审计者，我想让 grounding hard 校验拦截一切越权输出（悬空引用、跨决策引用、候选外推荐、新结构化事实、不可解占位符），这样发布门是机械的、不依赖自然语言理解（grill E5/E8）。
12. 作为审计者，我想让被拒 judgment 连同其解释条目一起消失并留下 diagnostics 记录，这样报告内容与行级状态永远一致（grill E9 级联）。
13. 作为审计者，我想让 report 的 audit 块只存 hash / 元数据 / token 成本，这样默认不保留完整 prompt 与 response（grill E2 的 audit 语义，落到 graph 传输面）。
14. 作为 M7-A 开发者，我想按 `decisionId` + `explanationStatus` + overlay refs 渲染三层 UI，这样 UI 不重复做 grounding 或状态判断。
15. 作为 M7-B 开发者，我想让 ReviewReport 引用（不内嵌）package 且自带生成侧组件版本，这样同一分析包可换 LLM / prompt 重生成多个报告（组件版本所有权决策）。
16. 作为 M7-B 开发者，我想用 `validateReviewReport` 校验从磁盘读回的报告，这样持久化往返 fail closed（INV-006/007 纪律）。
17. 作为安全审查者，我想让 API key 只存在主进程内存与 OS credential store，这样 renderer、SQLite、日志、audit、ReviewReport 物理上拿不到 key（grill E1，INV-005）。
18. 作为安全审查者，我想让 renderer 只收到"已配置"布尔与非敏感设置 DTO，这样 IPC 面不因教练功能扩权。
19. 作为 spec 实现者，我想让三种 reasoning payload schema 冻结在 contracts，这样 reasoning / desktop / 未来 UI / 持久化消费同一契约，杜绝第二套 truth。
20. 作为 spec 实现者，我想让 nodeId / edgeId / reportId 全部由 engine 用 M6-C 共享 deterministic serializer 派生，这样 LLM 无法铸造、碰撞或预言图身份（D1 guard 1 纪律延续）。
21. 作为 spec 实现者，我想让 `appendReasoningOverlay` 先过 D1 partition validator 且保持 evidence deep-equal，这样 D1 冻结的分区 guard 被直接复用而不是绕开。
22. 作为 spec 实现者，我想让 prompt 模板与 draft schema 版本化冻结在 reasoning / contracts，这样提示词变更必须以新版本发布，旧报告可与其生成版本区分。
23. 作为 spec 实现者，我想让 prompt 渲染、draft 校验、grounding、report 组装都是确定性纯函数（给定 provider 返回内容），这样它们可以被 golden 测试锁定。
24. 作为未来 M4 开发者，我想让 draft / 占位符 / EvidenceClaim 机制成为受约束追问的既有先例，这样 M4 的 question → anchoring → traversal → slice 链路不重造 grounding 结构。

## Implementation Decisions

### 模块与依赖

| 包 | M6-D2 新增 | 依赖变化 |
|---|---|---|
| `@riichi-coach/contracts` | `ReviewReport` 契约、CoachInference / CoachJudgment / Explanation payload schema、`GenerationStatus` / `ExplanationStatus` 枚举、`LlmCoachProvider` 端口类型与请求/结果 DTO、`REVIEW_REPORT_SCHEMA_VERSION` 等版本字面量 | 无（不新增任何依赖） |
| `@riichi-coach/reasoning` | `coach/` 模块：`generate-review-report`、`append-reasoning-overlay`、`validate-coach-grounding`、`validate-review-report`、`coach-prompt`、`coach-ids`，从包根导出 | 无（仍只依赖 contracts 与既有 mortal-source；LLM 网络调用只通过 contracts 定义的端口类型注入，不 import desktop、不直接 fetch） |
| `@riichi-coach/desktop` | 主进程 `llm-provider/`（v1 单实现）、key 保管、IPC/preload 安全 DTO、组合根编排 | 作为组合根新增内部接线；renderer 安全集合不变 |

- `LlmCoachProvider` 是**类型**（契约），不是实现：reasoning 消费该类型，desktop
  提供实现。这样 reasoning → contracts 单向依赖保持，`check:architecture` 的
  依赖方向表零改动。
- M6-C / D1 的契约、projector、slice builder、validators 一律原样消费，不修改。

### Seam（两个平级新增 seam）

1. **`generateReviewReport(graph, selection, provider, options?)`**：唯一的报告
   生成入口。`graph` 必须是已通过 `validateContextGraph` 的投影结果；`selection`
   必须与 graph 同源（同源判据复用 D1：slice builder 内部以 packageId fail
   closed，engine 不自建判据）；`provider` 满足 contracts 端口类型。
2. **`appendReasoningOverlay(graph, reasoningNodes, reasoningEdges)`**：唯一的
   overlay 追加动作（D1 显式留给 D2）。

`validateCoachGrounding`、`validateReviewReport`、prompt builder、id 派生是两个
seam 的支撑函数，不构成第三条生成/追加路径。desktop 的编排（validate →
project → select → generate）只是调用顺序，不是新 seam。

### GraphContextSlice：LLM allow-list transport boundary（guard 1）

- **prompt 输入 = 冻结模板 + slice 的 canonical JSON**，此外没有任何数据。graph
  的其他分区、`StructuredAnalysisPackage`、raw Mortal 报告、牌谱字节、账号 ID、
  昵称、令牌、下载 URL 一律不进 prompt（它们在 slice 中本就不存在，engine 也
  不得从别处拼接）。
- slice 的隐私与 allow-list 语义完全由 D1 契约承担（座位匿名、
  `GRAPH_SLICE_PAYLOAD_ALLOWLIST`、无 `frozenAt`）；D2 不放宽、不复算、不二次
  过滤。
- **模型输出不回流边界**：三种 reasoning kind 在
  `GRAPH_SLICE_PAYLOAD_ALLOWLIST` 中保持空列表——v1 是单轮生成，不把模型自己
  的 reasoning 再切片回传。为 M4 追问扩容 reasoning allow-list 是未来的显式
  契约变更，不在本 spec 内。
- **prompt 字节稳定**：同一 slice + 同一 `promptVersion` → 逐字节相同的
  prompt（模板是确定性纯函数；slice 已按 nodeId/edgeId 排序）。
- 空 selection（selector 判定无值得评审的决策）→ 空 slice → **不调用
  provider**，直接产出 evidence-only 报告（沿 D1 user story 8 的降级语义）。

### Privileged-process `LlmCoachProvider` 与 BYOK（guard 2）

- **端口类型在 contracts，实现只在 desktop 主进程**（grill E1：云端 API +
  BYOK + 单 provider，第一天定义接口、v1 单实现）：

```text
LlmCoachProvider {
  descriptor(): LlmProviderDescriptor        // { providerId, model } — 无 key 材料
  complete(request: LlmCoachRequest): Promise<LlmCoachResult>
}
```

- v1 单实现：**OpenAI 兼容 chat completions**。`baseUrl` / `modelName` / `apiKey`
  全部来自用户配置（BYOK）；网络请求只从 Electron 主进程发起，renderer 永不
  fetch。
- **key 边界清单**：

| 位置 | 允许 |
|---|---|
| 主进程内存 | ✔（唯一运行时持有者） |
| OS credential store（Electron `safeStorage`，沿既有 `electron-safe-storage.ts`） | ✔（唯一持久化形态，加密） |
| LLM 请求的鉴权头 | ✔（唯一外发去向） |
| renderer / preload / localStorage / IPC payload | ✖（renderer 只收 `configured: boolean` 与非敏感设置 DTO） |
| SQLite / ReviewSession / ReviewReport / audit / diagnostics | ✖ |
| 日志 / crash dump / 任何应用自有明文文件 | ✖ |

  "key 不落盘"的准确口径：不以明文进入任何应用自有的持久化产物；OS credential
  store 是唯一被认可的加密保管机制（沿历史规格"API Key 使用各平台系统安全存储、
  前端只接收已配置状态"的语义，见 Further Notes）。
- 传输失败码枚举（provider 结果的失败变体）：`timeout` / `rate_limited` /
  `server_error` / `network_reset` / `connection_failed`；
  `provider_unavailable`（未配置 / key 缺失）在发请求前判定，不消耗重试。
- IPC 面（窄通道，preload 重新解析 DTO，沿 INV-005 模式）：
  `coach:provider:configure`（写入设置与 key）、`coach:provider:status`
  （configured 布尔 + 非敏感设置）、`coach:report:generate`（输入 record/package
  引用，返回 renderer-safe 的 ReviewReport DTO）。

### CoachInference / CoachJudgment / Explanation 契约

三种 reasoning node 的 payload schema 在 contracts 冻结（strict zod；graph
contract 层 payload 保持 opaque，per-kind 形状由 D2 schema + grounding 校验
执行——与 D1 对 evidence payload 的处理方式一致）：

| nodeKind | payload 字段 | 语义 |
|---|---|---|
| CoachInference | `inferenceId`、`decisionId`、`statement`、`premiseRefs` | 综合层中间推断（如基于 KnownGameFacts 的高级读牌）；可被 CoachJudgment 引用为前提 |
| CoachJudgment | `judgmentId`、`decisionId`、`recommendation`（actionRef）、`confidence`、`premiseRefs` | 最终推荐 + 置信度；`premiseRefs` 非空 |
| Explanation | `explanationId`、`decisionId`、`text`、`claims` | 面向用户的解释条目；`text` 含占位符；`claims: { kind, evidenceRef }[]` |

- `confidence`：`high | medium | low`（grill C1：LLM 给推荐与置信度）。
- `premiseRefs` / `evidenceRef` 一律是 **graph nodeId**：CoachInference 的
  premiseRefs 指向 evidence 节点；CoachJudgment 的 premiseRefs 指向 evidence
  节点或同报告 CoachInference 节点；Explanation 的 `claims[].evidenceRef` 指向
  evidence 节点，`claims[].kind` 是冻结两值词汇 `factor_difference |
  factor_fact`（grill E6）。
- **轴 / 方向由证据查回，LLM 不得声明（guard）**：`claims[].kind` 是声明值，
  但 grounding validator 用目标节点的 `nodeKind` 复核——LLM 不能把 efficiency
  差异标成 defense，差异方向永远从 FactorDifference 节点查回。
- **overlay 边的 v1 用法**（不新增 edge kind）：当前 producer 只生成
  Explanation → CoachJudgment，以及 Explanation → `factor_difference` claim
  目标的 `verbalizes` 边。D1 contract 仍可表达 `opposes` / `qualifies`，读回
  validator 继续接受并校验显式合法数据，但本阶段 producer 不生成它们。
  后续启用生成时必须先引入最小结构化 stance marker、对应校验与映射。
- **LLM 永不铸造 nodeId / edgeId（guard）**：模型侧 draft 只使用 per-decision
  局部 id（`localId` / `judgmentLocalRef`）；nodeId / edgeId / reportId 由
  engine 以 M6-C 共享 deterministic serializer 派生（沿用 D1 的
  `ctxg:<nodeKind>:<digest>` / `ctxg:edge:<digest>` 格式与语义键纪律）。
  CoachJudgment / CoachInference 沿用 `packageId + decisionId + node kind +
  localId`；Explanation 沿用 `packageId + decisionId + text + claims` 的内容
  派生规则（不为统一公式新增 localId）。这些 identity 均先于 reportId 确定，
  无 wall-clock、无随机。draft 中
  出现的任何自造 nodeId 一律视为 `invalid_output`。
- reasoning node 的 `producer` / `producerVersion` = coach engine 名称与
  generator 版本；`partition = "reasoning"`、`origin = "llm_reasoning"`、
  `authority = "coach"`（D1 partition validator 冻结值）。

### `appendReasoningOverlay`（收口 D1 遗留决定）

- 输入：graph + 待追加的 reasoning nodes / edges（id 已由 engine 派生）。
- 执行顺序：`validateReasoningOverlayPartition`（D1）→ 构造新 graph（evidence
  节点/边 deep-equal 原样复制；reasoning 追加后与 evidence 一起按 nodeId /
  edgeId 排序）→ `validateContextGraph`（D1）通过才返回；任一步失败抛错，不返回
  部分 graph。
- 输入 graph 不可变（返回新对象；append 是纯函数）。
- **graphId 不变**（收口 D1 留下的"overlay 如何进入 graph 身份"开放点）：
  `graphId` 是投影槽位身份（`context-graph:<packageId>`），不因 overlay 变化；
  overlay 的内容身份由 `reportId` 承载。持久化仍然只有 package + ReviewReport
  两个 artifact，runtime composition 公式
  `ContextGraph = project(package) + ReviewReport.reasoningOverlay` 不变。

### ReviewReport 契约

schema 版本字面量 `review-report/v1`。概念字段：

- `schemaVersion`、`reportId`、`packageId`（**引用不内嵌** package）、
  `selectorPolicyVersion`、`selectedDecisionIds`（rank 升序；engine 以
  `selection.selected.map(s => s.decisionId)` 机械派生，不重新排序）。
- `generation`：生成侧组件版本（组件版本所有权决策：LLM 侧版本只在这里，永不
  进 package）——`providerId`、`model`、`promptVersion`、`draftSchemaVersion`、
  `generatorVersion`（reasoning engine 版本）、`validatorVersion`、
  `reportSchemaVersion`。
- `generationStatus`：`complete | partial | evidence_only`（报告级）。
- `decisionEntries`：`[{ decisionId, explanationStatus }]`，每个 selected
  decisionId 恰好一行。
- `reasoningOverlay`：`{ nodes, edges }`（append-only 的 reasoning 分区，与 graph
  节点/边同 schema）。
- `audit`：`{ inputSliceHash, outputHash, usage?, transportRetries }` ——
  inputSliceHash = 所发 slice canonical JSON 的 SHA-256；outputHash = 模型原始
  输出的 SHA-256；usage = provider 上报的 token 成本（可选）；
  transportRetries = 实际传输重试次数。**默认不保存完整 prompt 与 response。**
- `diagnostics`：`[{ decisionId?, kind: "grounding_rejected" | "soft_finding",
  code, detail? }]`（soft finding 只进这里，永不拦截）。
- `generatedAt`：wall-clock，仅展示元数据，**不进入 reportId**（沿 M6-C 的
  artifact metadata 纪律；纯函数路径通过注入的时钟获取）。

状态语义（grill E4/E9 的冻结语义）：

| 状态 | 触发条件 |
|---|---|
| `complete` | 全部 selected 行 `ready` |
| `partial` | ≥1 行 `ready` 且 ≥1 行失败 |
| `evidence_only` | 0 行 `ready`（含空 selection：无值得评审的决策，不发请求） |

行级 `explanationStatus`（冻结五值词汇）：

| 值 | 语义 |
|---|---|
| `ready` | 该决策有通过 grounding 的 CoachJudgment（及 Explanation），已进 overlay |
| `not_selected` | schema 预留：决策不在本报告 selection 内。D2 生成路径永不发射（行集 = selectedDecisionIds）；供 M7-A 整盘消费方补行 |
| `provider_unavailable` | provider 未配置 / key 缺失，请求未发出 |
| `request_failed` | 传输失败且重试一次仍败（timeout / 429 / 5xx / reset / 网络不可达） |
| `invalid_output` | 输出不可解析为 draft，或 grounding 拒绝（**不重试**——重试会把幻觉洗白，grill E9） |

- **LLM 失败永不污染分析包**：任何失败路径不写回
  `StructuredAnalysisPackage`，不改任何 `DecisionAnalysis` 分析状态；status 只
  属 ReviewReport（grill E4 的物理分离由"engine 根本拿不到 package 写入口"
  保证——engine 入参是 graph，graph 是投影）。
- `reportId = review-report:<sha256(canonicalJson({packageId,
  selectorPolicyVersion, generation, decisionEntries, reasoningOverlay}))>`，
  用共享 serializer 派生。同一 package 换 LLM / prompt 重生成 → 不同 reportId，
  这是组件版本所有权决策的机械后果。必须先完整派生 overlay 的 node/edge
  identity，再计算 reportId；禁止 `reportId → nodeId → reasoningOverlay →
  reportId` 循环。
- reasoning identity 的唯一性作用域是一份 ReviewReport；不同报告可按上述既有
  规则得到相同 nodeId。读回与组合只使用当前所选报告的 overlay，禁止跨报告
  查找、合并或引入全局 reasoning-node registry；切换报告时先移除旧 overlay，
  再把新 overlay 追加到 D1 base graph。

### Grounding validator（hard / soft 分层）

原则（grill E5）：**citation existence ≠ entailment**。机械保证为真的事实内容
必须结构化（EvidenceClaim / premiseRefs / 占位符）或由证据占位符渲染；LLM 的
自由自然语言只留给 trade-off 表达、教学组织与 CoachJudgment 论证。不是
"validator 事后抓幻觉"，而是"contract 不给事实幻觉留产生空间"。

**Hard 层（发布门，纯机械，fail closed）**——`validateCoachGrounding` 至少执行：

1. 每个 `premiseRefs` / `evidenceRef` / `verbalizes` 目标都解析到存在的节点，
   且属于**同一决策**的 decision subgraph（跨决策引用拒绝）；
2. `recommendation` 解析到该决策 CandidateAction 集合内的 actionRef；
3. 每个 CoachJudgment 的 `premiseRefs` 非空且全部合法（evidence 节点或同报告
   CoachInference 节点）；
4. `claims[].kind` 与目标节点 nodeKind 一致（factor_difference →
   FactorDifference；factor_fact → FactorFact）；
5. `text` 中的占位符全部可解（`{diff:<differenceId>.<field>}` /
   `{candidate:<actionRef>.<field>}`，渲染值只能来自对应节点 payload）；
6. payload 无 schema 外字段（strict 解析）——LLM 不得携带新结构化事实；
7. overlay 通过 `validateReasoningOverlayPartition` 且追加后 graph 通过
   `validateContextGraph`——"不得改差异 / 数值 / 方向"的机械保证 = evidence
   分区 deep-equal（LLM 在结构上无改写入口）；
8. 每个 `ready` 行恰好 ≥1 个 CoachJudgment（v1 prompt 冻结为每决策 1 个）。

**Soft 层（仅诊断，永不拦截）**：自由文本数字扫描、方向词检查、重复 / 长度 /
风格。中文数字扫描的已知误报（两面 / 三色 / 东一 / 第三巡……）正是它降级为
soft 的原因（grill E7）。

**拒绝语义（grill E9）**：传输失败自动重试一次；语义 / grounding 失败**不
重试**——reject、`diagnostics++`、omit、continue。被拒 judgment 级联丢弃其全部
`verbalizes` Explanation。行级隔离：一个决策被拒不影响其他决策的行。

### 失败处理与 evidence-only degrade

- provider 未配置 → 全行 `provider_unavailable` → `evidence_only`；
- 传输失败重试一次仍败 → `request_failed`（若全部行如此 → `evidence_only`）；
- parse / grounding 失败 → `invalid_output`（该行 omit + 级联，其余行照常）；
  ≥1 行 ready 且 ≥1 行失败 → `partial`；
- 空 selection → 不发请求，`evidence_only`、`decisionEntries` 为空；
- **evidence-only 报告仍是合法 ReviewReport**：引用 package、overlay 为空、
  状态如实记录；证据视图由 M7-A 直接从 package 渲染（既有
  `renderDeterministicExplanation` 确定性渲染保持可用，但不在 LLM 报告路径
  内——D2 不把确定性模板写进 ReviewReport）；
- 任何失败路径都不得把未过 grounding 的内容送进 `appendReasoningOverlay`。

### Raw CoT 排除（guard 3）

- 模型返回中除结构化 draft 外的任何自由推理文本（包括 reasoning / CoT 类
  字段）在 parse 时**丢弃**；
- 默认不持久化完整 prompt 与 response：audit 只留 `inputSliceHash` /
  `outputHash` / usage / 状态（grill E2 的 audit 语义）；
- ReviewReport / reasoningOverlay / diagnostics / 日志中不出现 raw CoT；产品
  保存的是 structured rationale / argument trace（CONTEXT.md：reasoning trace
  != raw chain-of-thought）；
- 不做 CoT 事后解析（ADR-0004 rejected alternative C，永久 out）。

### LLM 请求 / 响应契约与 prompt 版本

- `LlmCoachRequest`：`{ promptVersion, draftSchemaVersion, prompt, temperature,
  maxOutputTokens }`；v1 `temperature` 固定 0（降低采样抖动；不承诺确定性，
  见"Determinism"）。
- `LlmCoachResult`：成功变体 `{ content, usage? }` / 失败变体 `{ errorCode }`。
- prompt 模板 `coach-review-prompt/v1` 冻结在 reasoning（版本字面量在
  contracts）：slice canonical JSON + 规则指令（zh-CN；只输出符合 draft schema
  的 JSON；引用只准复制 slice 内出现的 nodeId / actionRef；事实数字一律用
  占位符；不得声称知道 Mortal / Akagi 内部原因（`modelReason` 恒 unknown）；
  不得发明 / 补全局面事实与候选数值；advisory 可不认可但不得篡改其值与来源；
  hard evidence 不可抵触）。
- draft schema `coach-reasoning-draft/v1`（模型侧输出契约，contracts 冻结）：

```text
{ decisions: [{
    decisionId,
    judgment:    { localId, recommendation, confidence, premiseRefs },
    inferences?: [{ localId, statement, premiseRefs }],
    explanations?: [{ text, claims: [{ kind, evidenceRef }], judgmentLocalRef? }]
}]}
```

- 一次报告 = **一次请求**（整 slice 批量；批量规模 = selector 的 N，grill E3
  的 "~10" 即 policy v1 的 maxSelections）。行级状态在响应解析后按决策独立
  判定。

### Determinism 与身份派生

- 所有 id / hash（nodeId / edgeId / reportId / inputSliceHash / outputHash）
  复用 M6-C 共享 deterministic serializer（排序键 canonical JSON + SHA-256）；
  **禁止 D2 模块自行 stringify、自行排序键**（D1 guard 1 纪律延续）。
- prompt 渲染、draft strict 解析、grounding、overlay 构造、report 组装都是
  确定性纯函数（给定 provider 返回内容与时钟注入）。
- **LLM 本身非确定**：同一 slice 重生成可产生不同 overlay 与 reportId——这是
  产品语义（同一 package 可挂多个报告），不是缺陷；ReviewReport 不承诺重放
  确定性，可重放确定性属于 package / graph / slice / selection（M6-C / D1 已
  冻结）。

### 错误约定

M6-D2 所有失败抛 `m6d2_<模块>_<错误>:<detail>` 风格错误（`m6d2_engine_*` /
`m6d2_prompt_*` / `m6d2_draft_*` / `m6d2_grounding_*` / `m6d2_overlay_*` /
`m6d2_report_*`；desktop 侧 `m6d2_provider_*`）。命名与 M6-C / D1 的
`m6c_*` / `m6d1_*` 风格一致，测试按错误名断言，不按消息文案断言。

## Testing Decisions

### 好测试只测外部行为

- 给定 golden package → graph → selection 与一个**确定性 fake provider** →
  `generateReviewReport` 产出 schema-valid 报告；同一 fake 输出两次 → deep-equal
  报告。
- 给定越权 draft / 被篡改 report → 对应 validator 拒绝。
- 不测内部 helper、不测未导出函数、不测 soft 检查的"拦截"行为（soft 不拦截）。

### Seam

两个平级 seam 的测试入口：

1. **`generateReviewReport`**：所有报告正例 / 降级路径都从它构建；
2. **`appendReasoningOverlay`**：所有 overlay 追加正例 / 负例都从它构建。

### 按模块测试

- **contracts**：ReviewReport / reasoning payload / draft / provider DTO 接受
  最小合法样例；拒绝未知 status 值、payload 外字段、audit 外字段；provider
  DTO 与 descriptor 类型上不存在 key 材料字段。contracts 测试不依赖 reasoning /
  desktop 可编译。
- **engine（fake provider）**：M6-C whole-game golden package 投影出的 graph +
  selector 输出 → 完整链路正例（complete 报告）；`selectedDecisionIds` 与
  selection rank 一致；prompt 对同一 slice 字节稳定；空 selection 不调用
  provider 且产出 evidence_only。
- **draft → overlay → report 映射**：local id 正确映射为 engine 派生的
  nodeId；draft 不含 nodeId 也能成功；draft 携带自造 nodeId → `invalid_output`；
  producer 只生成 `verbalizes`；显式合法的 `opposes` / `qualifies` 读回数据由
  validator 接受，不把 contract 可表达误写成 producer 会生成。
- **grounding 负例**（全部拒绝且不进 overlay）：悬空 premiseRef / evidenceRef、
  跨决策引用、recommendation 不在该决策候选集、claim kind 与节点不符、占位符
  不可解、payload 带新字段、CoachJudgment premiseRefs 为空。
- **append**：evidence 节点/边 deep-equal 保持；追加后 `validateContextGraph`
  通过；nodeId 与既有图冲突拒绝（D1 partition validator 的 fail-closed 行为）；
  graphId 不变；输入 graph 不被修改。
- **degrade**：未配置 provider → 全行 `provider_unavailable` +
  `evidence_only`；传输失败恰好重试一次（fake 计数），重试成功 → `ready`；
  重试仍败 → `request_failed`；grounding 失败**不**触发第二次请求；被拒
  judgment 的 Explanation 级联消失；部分行失败 → `partial` 且 diagnostics 有
  记录。
- **review report validator**：从磁盘读回的合法报告通过；篡改（改 status、      
  注入 overlay 外节点、悬空 ref、audit 带完整 prompt）拒绝。
- **报告隔离**：同 package / decision、相同 judgment/inference localId、不同
  判断内容生成报告 A/B（Explanation 按既有内容规则派生），分别读回并覆盖
  A→B→A 切换；evidence/reasoning ref 始终只解析到当前报告内容。
- **desktop provider**：对 stubbed HTTP 层断言请求形状（鉴权头、temperature、
  payload 只含 prompt）；错误码映射；**key 不出现在任何 IPC payload / 日志 /
  状态 DTO**（行为测试，沿 `security-boundary` / `preload-entry` 既有模式）。

### Prior art

- M6-D1 的 golden package → graph → slice 链直接复用为 engine 测试输入；不在
  D2 重跑 M6-C 构建链。
- INV-005 的安全行为测试模式复用于 provider / IPC 面。
- `deterministic-explanation` 既有测试保持原样（不在 D2 路径内，防回归即可）。
- selector 测试已证明的 `selected` 消费方式（只引用 decisionId）被 engine 沿用。

### 验收门

- `npm run typecheck`、`npm run build`、`npx vitest run`、
  `npm run check:architecture`、`npm run test:package-import` 全绿；
- 不新增 workspace 依赖；依赖方向表与 renderer 安全集合零改动；
- 全部 grounding / 安全负例被拒绝；三条 degrade 路径
  （provider_unavailable / request_failed / invalid_output）状态与级联正确；
- raw CoT / 完整 prompt / response / key 材料在任何持久化产物中不可出现
  （schema 层无字段 + 行为测试双保险）。

## Out of Scope

- M7-A 固定 review UI 的任何渲染工作（消费 ReviewReport 是下一里程碑）。
- M7-B ReviewSession / SQLite 持久化、报告目录、跨会话重开。
- on-demand 单决策重生成入口（grill E3 后置；v1 只有整 slice 批量）。
- 流式输出、多轮对话、M4 受约束追问及其 context retrieval；reasoning kind 的
  slice allow-list 扩容（M4 时的显式契约变更）。
- 第二个 provider、本地模型、非 OpenAI 兼容协议、provider 自动选择 / 路由。
- prompt A/B 与效果评估基建、成本面板、token 预算控制。
- soft validator 的拦截化（永远仅诊断）。
- M3 教学证据层与教学规则引用进 Explanation。
- selector 策略、M6-C / M6-D1 任何契约或构建路径的变更。
- raw chain-of-thought 的保存、传输或事后解析（永久 out，ADR-0004）。
- embeddings / GraphRAG / vector DB / graph database / causal relation（沿
  ADR-0004，v1 之后另议）。
- 把确定性模板解释写入 ReviewReport（证据视图由 M7-A 从 package 渲染）。

## Further Notes

- **supersession 说明（grill E 组决策的 D2 落地口径）**：
  - E2 的显式白名单 DTO `LlmDecisionContext` 被 `GraphContextSlice` 取代——
    grill 时 M6-D1 尚未落地，D1 之后 slice 就是那个白名单投影 DTO，且带机械
    allow-list 执罚；E2 的 audit 元数据清单（provider/model/promptSchemaVersion/
    inputHash/outputHash/status/token 成本）原样落在 ReviewReport.audit。
  - E3 的字面签名 `generateReport(analysisPackage, selectedDecisionIds)` 适配为
    `generateReviewReport(graph, selection, provider)`：引擎不拥有 review-worthy
    定义权的**原则**不变，输入从 package 升级为 D1 投影 graph + selector 结果
    （projection 仍是 D1 seam，engine 不重投影、不重选）。
  - E6 的 `CandidateId` 落地为 CandidateAction 的 `actionRef`（slice payload 的
    稳定业务键）；`judgmentRef` 落地为 `verbalizes` 边。
- **D1 遗留开放点收口**：overlay 不进入 graph 身份——`graphId` 不变，overlay
  内容身份 = `reportId`；不产生第三个持久化 canonical artifact。
- 历史
  [mortal-llm-coach 设计](./2026-07-30-mortal-llm-coach-design.md)中仍有效的
  BYOK / key 存储语义（OS 安全存储、前端只见已配置状态、SQLite 与日志无 key）
  被本 spec 继承；其中已被 ADR-0003 / ADR-0004 supersede 的 LLM 边界表述不
  恢复。
- 本 spec 的三项评审 guard：**slice 唯一传输边界**（prompt 只含模板 + slice，
  输出不回流）、**key 主进程封闭**（端口类型在 contracts、实现与 key 只在
  desktop 主进程 + OS credential store）、**raw CoT 不进 contract**（结构化
  draft 之外全部丢弃，audit 只留 hash）。
- 术语一律以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准；与既有 ADR
  矛盾处显式指出，不静默覆盖。
