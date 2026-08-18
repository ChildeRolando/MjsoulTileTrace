# 系统架构

## 总览

```text
雀魂官方登录 / 牌谱
        │
        ▼
mahjong-soul-source ──► CanonicalEventStreamV2
        │                         │
        │                         ▼
        │                decision snapshots / KnownGameFacts
        │                         │
        └─────────────────────────┼──────────────┐
                                  ▼              ▼
                           reasoning pipeline   model adapter
                                  │              │
                                  └──── candidates + scores
                                             │
                                             ▼
                              structured comparison / ledgers
                                             │
                                             ▼
                                StructuredAnalysisPackage
                                             │
                                             ▼
                                  ContextGraph projection
                                             │
                                             ▼
                                     GraphContextSlice
                                             │
                                             ▼
                                         LLM Coach
                                             │
                                             ▼
                            Reasoning overlay / ReviewReport
                                             │
                                             ▼
                                      desktop renderer
```

系统刻意把“数据来源”“局面事实”“候选因素与差异”“模型选择”和“自然语言表达”分开；教练判断（CoachJudgment）位于证据之上、表达之下——可以综合与权衡证据，但不能倒写证据层事实。

## Workspace 边界

### `@riichi-coach/contracts`

所有跨模块数据结构的信任边界。主要包括：

- 牌、动作、决策窗口和候选；
- canonical 事件流、轮局状态和决策快照；
- 已知事实、牌形、振听、防守矩阵和因素账本；
- 模型评价、比较、偏好和严格分析包；
- renderer-safe 雀魂会话与目录 DTO。

规则：跨包数据进入下一层前必须经过这里的严格 schema；未知字段默认拒绝。

### `@riichi-coach/mahjong-soul-source`

雀魂国区 privileged source adapter。拥有协议、网络、令牌和原始牌谱边界：

- 固定协议 bundle、RPC map 与国区 endpoint policy；
- Liqi codec、网关发现、Lobby 会话；
- 登录结果投影、加密会话恢复、目录同步；
- 牌谱取回、SHA-256/大小验证、`GameDetailRecords` 解码；
- 雀魂动作到 `CanonicalEventStreamV2` 的映射。

它可以读取秘密和原始响应，但不得把这些对象直接交给 renderer。

### `@riichi-coach/tenhou-source`

天凤 game-record provider（第二 canonical 导入器）：mjlog 词法化、牌/副露编解码、
记录 → `CanonicalEventStreamV2` 严格映射与纯事件 census。来源专属细节止于本包：
调用方只消费 canonical 契约与错误码，reasoning 不得依赖天凤牌谱格式。

### `@riichi-coach/mortal-source`

Mortal model/report evidence provider：报告 schema、URL 校验、指纹与 mjai tile
工具，**不含任何雀魂/特权来源能力**。reasoning 按 ADR-0005 允许消费其公开导出的
报告证据契约（验收证据机制依赖它），但不得依赖 game-record provider 协议细节。
来源分类与依赖方向的权威裁决见
[ADR-0005](../adr/0005-workspace-dependency-boundaries.md)。

### `@riichi-coach/reasoning`

来源无关的麻将推理层：

- 重放 canonical stream，冻结决策快照并投影 `KnownGameFacts`；
- 归一化用户、MJAI、模型和实战动作；
- 调用固定版本 fact-engine sidecar；
- 生成五轴账本、防守矩阵、差异和确定性偏好；
- 构建并验证严格分析包；
- 渲染当前 fixture-only 命令行报告。

它不应知道账号令牌、雀魂下载 URL 或浏览器会话。

### `@riichi-coach/desktop`

Electron 组合根与本地产品边界：

- 隔离官方登录窗口和 OS-backed 加密存储；
- 生产 Lobby、目录、牌谱摄取的依赖接线；
- 安全 IPC/preload、窗口权限和本地 renderer；
- 当前在主进程内缓存 mapped/replayed record。

renderer 只能收到安全会话状态、可分析目录摘要和固定操作结果。

### `coach/tools/mahjong-facts`

固定版本 Go JSONL sidecar。它把 mahjong-helper 的计算投影为结构化事实，不输出教练推荐。应用验证二进制清单、请求身份和响应语义。

## 数据流

### 登录与恢复

1. Electron 打开隔离的雀魂国区官方页面。
2. 只捕获恢复所需的受限登录结果和上下文。
3. OS 安全后端包裹密钥；会话以 account-bound envelope 跨重启保存。
4. 重启时使用全新 Lobby 执行 OAuth2 恢复并再次核对账号。
5. 注销会先停止目录同步，再清浏览器状态、目录和凭据。

### 目录与牌谱

1. 目录服务按时间窗完整分页，权威选择最近 30 场。
2. 只保留已证明为支持规则的四人南风条目。
3. 用户点击条目后，摄取服务确认 recordId 属于当前账号目录。
4. 新 Lobby 恢复身份后取回 inline 或 allowlisted `data_url` 数据。
5. 取回层验证大小、哈希、容器和非空动作；原始字节不跨 renderer 边界。

### Canonical 重放

1. mapper 将支持的雀魂动作显式转换为 canonical 事件。
2. 未知动作、非法牌、缺失引用或最终 schema 失败均 fail closed。
3. replayer 在本人可见摸牌处冻结 `DecisionSnapshotV2`。
4. 每个快照投影 `KnownGameFacts`，并记录之后的实际舍牌。
5. 目前此处停止：没有生产模型候选时不能构造合法的自动比较。

### 比较与解释

1. 候选必须先归一化为 canonical action 与稳定 `actionRef`。
2. 模型评价只表示模型选择；事实管线独立计算麻将因素。
3. 每候选生成同构五轴账本，再生成 pairwise differences。
4. 只有 registered deterministic difference 可进入确定性偏好；确定性偏好是 optional deterministic signal，轴间冲突时为 null——冲突场景交给教练判断层，而非禁止综合。
5. LLM 教练判断（CoachJudgment）在已有证据之内做跨因素权衡（hard evidence 是约束，advisory signal 是带来源/版本的参考上下文且无否决权）、给出推荐与置信度；不得发明、修改或补全局面事实与候选因素，不得改写差异方向，也不得声称知道模型内部原因。
6. 解释（ExplanationBullet）是表达单元：证据向条目引用候选差异，判断向条目引用教练判断；解释验证器只做 grounding 校验（可追溯、数值/方向一致、无捏造事实），不试图确定性证明判断本身“正确”。

## Context Graph 架构

ContextGraph 不是 GraphRAG 产品依赖，也不是新的事实来源。它是
`StructuredAnalysisPackage` 的 typed projection，加上 LLM 追加的 reasoning
overlay。权威裁定见
[ADR-0004](../adr/0004-context-graph-as-auditable-llm-boundary.md)，设计细节见
[Context Graph design spec](../specs/2026-08-18-auditable-context-graph-design.md)。

### Evidence subgraph

由 `StructuredAnalysisPackage` deterministic projection 生成。允许的初始 node
kinds 至少概念上包含：

- Decision
- CandidateAction
- KnownGameFact
- FactorFact
- FactorDifference
- AdvisorySignal
- ModelEvaluation
- DeterministicPreference
- Constraint

每个 node 至少概念上携带：

- stable id
- kind
- origin
- authority / evidenceClass
- producer/version
- payload
- provenance

Evidence subgraph 是 immutable，LLM 不得修改、删除、覆盖其中任何
hard-evidence / advisory / model node。

### Reasoning overlay

LLM 只允许追加：

- CoachInference
- CoachJudgment
- Explanation-related representation

reasoning overlay 可以引用 evidence nodes，但不得修改 evidence nodes。

### Edge semantics

v1 只使用明确的 argument/semantic relation，例如：

- derived_from
- supports
- opposes
- qualifies
- compares
- applies_to
- recommends
- verbalizes

不要在 v1 引入未经证明的 `causes` relation。`supports` / `derived_from` 表达
论证与语义关系，不声称建立因果真理。

### Runtime composition

```text
ContextGraph =
project(StructuredAnalysisPackage)
+
ReviewReport.reasoningOverlay
```

v1 不要求新增第三个持久化 canonical artifact。ReviewSession 仍可只引用：

- StructuredAnalysisPackage
- ReviewReport

因此不要推翻已冻结的 M7-B persistence 设计。

## 核心设计决策

> 架构级不变量及其可执行检查见 [INVARIANTS.md](INVARIANTS.md)；Workspace 依赖
> 方向与 renderer 安全边界的权威裁决见 [ADR-0005](../adr/0005-workspace-dependency-boundaries.md)。

### Fail closed

输入不完整、协议漂移、证据不一致或能力未实现时，系统返回固定 blocked/unsupported 状态。它不猜字段、不降级到宽松解析，也不让上游 prose 穿透。

### Canonical event stream 是新重放工作的唯一真相

来源适配器只能映射事件，不能顺便计算教练因素。fixture-only legacy bridge 仅用于回归，不是生产 fallback。

### 确定性与启发式分离

现物等可证明事实可以进入确定性比较；筋、壁、one-chance 和 helper 风险刻度保留为版本化启发式，不得升级为确定性结论或精确概率。

### 证据先行，判断分层

局面事实与候选因素只能来自本地可验证的确定性管线，候选间差异由 FactorDifference 固定；跨因素取舍与最终教练判断（CoachJudgment）允许由 LLM 在证据之内完成——权衡冲突轴、给出推荐与置信度是 Coach 相对纯分析器的核心价值。

> No game-state fact or candidate-level analytical fact may originate from the LLM.
> Coaching judgments may originate from the LLM, but their factual premises must come from auditable non-LLM sources.

- factual premises 必须来自 auditable non-LLM sources；
- hard evidence 是约束；
- advisory signal 是带来源/版本的参考上下文，无 veto power；
- CoachInference 可以根据 KnownGameFacts 做高级综合与读牌；
- LLM 可以不接受 advisory signal，但不能篡改它的原始值或来源；
- LLM 不得抵触 hard evidence；
- LLM 不得发明、修改或补全局面事实来支持其建议。

事实必须确定；判断可以经验；无出处的局面事实一律禁止。DeterministicPreference 是 optional deterministic signal，不是教练推荐的唯一合法来源。

证据在此分三层：**硬证据**（KnownGameFacts + 确定性因素 → 事实约束，LLM 不可有意见）；**参考信号**（版本化启发式/估算 → 仅作上下文、无否决权）；**教练推断**（CoachJudgment → 可否决参考信号，不得抵触硬证据）。现物是不是现物，LLM 不能有意见；helper 说这张牌危险多少，LLM 可以不认；依据真实牌河判断 helper 在当前局面低估/高估了危险，正是教练发挥价值的地方。

缺失的分析能力不构成缺失的解释——系统没有可据以识别"解释缺口"的独立真相来源（missing analytical capabilities do not constitute missing explanations, because the system has no independent ground-truth explanation against which such a gap could be identified）。

### 模型和教练分离

Mortal/Akagi 的分数决定“模型偏好”；教练判断（CoachJudgment）由 LLM 在可审计的证据上做出（hard evidence 为约束，advisory signal 为带来源/版本的参考上下文）。删除模型评分不能改变事实账本与差异，也不得改变教练判断的证据基础。

### Privileged / renderer 分离

账号 ID、令牌、协议 payload、下载 URL 和牌谱字节只能存在于主进程或 source 包。IPC 使用窄方法和固定安全结果。

## 当前已知架构缺口

- canonical mapper 的部分流局/杠语义尚需真实牌谱反证（M5 人工验收并行线程）；
- 响应面已接入（M6-A4.0/A4.1/A4.2：归属过滤拆除、discard_response/kan_response 开窗、响应窗口身份事实表与本地候选枚举同构、守恒不变量升级、响应分支覆盖率矩阵 fail-closed）；A4.3 纯事件 discovery 扫描已落地（`scripts/response-surface-discovery.mjs`，chankan 最早启动、合格局计数按 source 记入 manifest），wave-1 六分支已全部真实 E2E 取证（resp_chi/pon/daiminkan/hora_actual + resp_pass_on_discard 四候选族子覆盖 + resp_chankan_actual，8 份真实报告），wave-2 保持 fail-closed + 降级条款；
- mapped/replayed record 与 Mortal 报告仍仅在主进程内存/验收缓存中，没有产品级持久化（M7-B）；
- 整盘 StructuredAnalysisPackage、Typed Context Graph substrate、Graph-grounded Coach 与 validator、review UI、LLM 客户端、SQLite 会话与跨平台发布尚未实现（M6-C / M6-D1 / M6-D2 / M7-A / M7-B / M8）。
