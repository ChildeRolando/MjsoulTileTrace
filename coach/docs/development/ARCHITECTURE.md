# 系统架构

## 总览

**2026-09-28 实现状态**：PR #28 规划基线 `67e1dd9` 曾包含本地合法动作推导。
[ADR-0006](../adr/0006-libriichi-single-legal-action-authority.md) 已采纳唯一 libriichi
来源；[规格](../specs/2026-09-28-libriichi-legal-action-authority-design.md) 和
[计划](../plans/2026-09-28-libriichi-legal-action-authority-migration.md) 定义目标与退出清单。
规则查询、评分、整局/单决策、新包、remote/discovery 已接入；旧枚举与资格预筛
已退出，封存位置见实施计划。真实完整档案持久化已通过实现侧回归；全语料运行与独立验收
必须绑定具体候选提交，历史结果不证明后续版本通过。

当前消费链：canonical 事件/可见状态 → 完整性与规则配置核验 → libriichi 无权重规则查询
→ 单一合法动作结果 → 模型请求或单候选证明 → full-game/package。
helper 从候选计算教学事实，不参与集合增删；模型只给分数。旧枚举封存于 Git 历史，
不保留第二来源校验、影子执行或自动回退。原始牌谱来源独立性继续保留。

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
                           reasoning pipeline   model evidence adapter
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
                               CoachContext + 本地引用查找表
                                             │
                                 仅教学 DTO 外发，审计链留本地
                                             ▼
                                         LLM Coach
                                             │
                                             ▼
                                引用还原 + 原图 grounding
                                             │
                                             ▼
                            Reasoning overlay / ReviewReport
                                             │
                                             ▼
                                      desktop renderer
```

系统刻意把“数据来源”“局面事实”“候选因素与差异”“模型选择”和“自然语言表达”分开；教练判断（CoachJudgment）位于证据之上、表达之下——可以综合与权衡证据，但不能倒写证据层事实。

2026-10-04 用户批准将审计与模型消费分离，见 M6-D2 规格同日修订。
`GraphContextSlice` 保留全部可追溯来源，`CoachContext/v1` 是其显式教学投影，
使用短引用而不携带完整 Evidence、provenance、生成方/版本/哈希或查找表。
硬证据/建议的权威级别、未知/限制、候选与评分、已选比较事实/差异及必要教学关系
仍须保留；raw_replay/user_asserted 等事实来源类别与立直前后/鸣牌的教学时序
不能误归为审计字段删除。材料性事件关系使用短引用或已有座位/河牌序号表示。
不改变 selector 和自动比较范围。编码、解码、请求计量在通用 reasoning
接口中，各 provider 只负责传输与回报 Token。输出还原后由原图 grounding 验证；
未知、错类型、跨决策引用失败封闭。报告保存 canonical 引用及实际请求元数据，
旧 v1/v2 报告继续离线校验，不重新生成。

## Workspace 边界

### `@riichi-coach/contracts`

所有跨模块数据结构的信任边界。主要包括：

- 牌、动作、决策窗口和候选；
- canonical 事件流、轮局状态和决策快照；
- 已知事实、牌形、振听、防守矩阵和因素账本；
- 模型评价、比较、偏好和严格分析包；
- renderer-safe 雀魂会话与目录 DTO。
- local Mortal runtime strict request/result/error/identity DTO。
- 独立于模型评分的规则查询结果、规则来源身份及其 proof/package 契约（ADR-0006）。

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

### `@riichi-coach/mortal-runtime`

独立 privileged native-model owner：由 Electron main 托管固定 Mortal V4 subprocess 与
`Yuchen1457/mortal-582500` checkpoint，只接收 contracts-owned canonical/replay request，
通过严格协议返回 model evidence。它不解析雀魂/天凤格式，
同一 owner 已提供独立于权重的 libriichi 规则操作与版本化结果，
模型操作仍只产评分；不与 `mortal-source` 或
`mahjong-facts` 合并。reasoning 不依赖该包；只
消费 contracts-owned result 并复用现有 Mortal comparison / `ModelEvaluation` builder。
renderer/preload 不得启动进程、读取模型、知道 checkpoint 路径或接收 raw stdout/stderr。
完整 owner、identity、候选双射和 spike 门见
[Local Mortal Runtime 生产规格](../specs/2026-09-24-local-mortal-runtime-production-design.md)。

### `@riichi-coach/reasoning`

来源无关的麻将推理层：

- 重放 canonical stream，冻结决策快照并投影 `KnownGameFacts`；
- 归一化用户、MJAI、模型和实战动作；
- 调用固定版本 fact-engine sidecar；
- 消费唯一规则结果，负责动作身份/格式转换、请求与单候选证明派生，
  不自行推导另一合法集合；canonical 回放扫描待判定边界，不按本地牌形排窗；
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
- 独占 local Mortal subprocess/checkpoint 生命周期与 manifest 校验。

renderer 只能收到安全会话状态、可分析目录摘要和固定操作结果。

### `coach/tools/mahjong-facts`

固定版本 Go JSONL sidecar。它把 mahjong-helper 的计算投影为结构化事实，不输出教练推荐。应用验证二进制清单、请求身份和响应语义。

ADR-0006 保留向听、进张、打点、结构与防守事实；退出的是它被用于生产候选资格
的调用以及失去事实消费者的专用适配，不是整个 helper。事实与模型偏好继续分离。

## 数据流

### 登录与恢复

1. Electron 打开隔离的雀魂国区官方页面。
2. 只捕获恢复所需的受限登录结果和上下文。
3. OS 安全后端包裹密钥；会话以 account-bound envelope 跨重启保存。
4. 重启时从同一 allowlisted route 候选取得 `wss` URL 与 route ID；新 Lobby 首先
   完成 `.lq.Route.requestConnection` 握手，再执行 OAuth2 恢复并核对账号。
5. 注销会先停止目录同步，再清浏览器状态、目录和凭据。

### 目录与牌谱

账号目录分析的运行进度由 Electron main 的既有目录 IPC 注册拥有：一次只允许一个
分析任务，可信窗口可以轮询完整七阶段、每阶段的完成数/总数、状态与耗时。任务状态只存在内存；注销、
浏览器会话、原始牌谱、账号标识、模型输出与路径均不进入进度 DTO。规则查询和
full-game 的计数回调只报告实际处理的边界，模型阶段只统计需评分的多候选决策。
renderer 从启动时展示全部阶段并保留终态，展示本次已用时间；没有完整耗时参考时显示
“首次分析，正在建立估时参考”。main 在 userData 独立保存最多五次完整任务的阶段耗时和计数，
不含牌谱或账号身份，按当前工作量与实际处理速率估计总耗时/剩余时间，并标明估算来源。
计时参考不影响分析契约、报告 identity 或任务是否完成，不将未知阶段换算为整体百分比；
至多一条轮询请求在途，任务结束时停止轮询，防止迟到回复覆盖下一次任务。
运行日志仅记录阶段耗时及计数，供定位慢点；这些信息不是分析结果或验收证明。

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
5. report-based 路径继续消费既有 Mortal 报告；managed local 路径从 canonical/replay
   投影到独立 local Mortal runtime，并在同一 comparison / package contract 合流。
   Electron 产品工作流接线仍属于 Integration Closeout，不因 spike 通过而视为 MVP 已接通。

### 比较与解释

1. 候选必须先归一化为 canonical action 与稳定 `actionRef`。
2. remote report 或 managed local Mortal 的模型评价只表示模型选择；事实管线独立计算
   麻将因素，两种 Mortal 来源在同一 comparison / `ModelEvaluation` contract 合流。
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

当前 contracts/reasoning baseline 已实现 append-only 组装与 read-back validator。
`CoachJudgment` / `CoachInference` 的 `nodeId` 由引擎按 decision 与 local id 重新推导，
并必须与 payload self-id 一致；`Explanation` 保持由内容推导 identity，不新增 localId，
其 payload `explanationId` 同样必须匹配。即使同时伪造 nodeId、payload self-id、关联
edgeId 和 reportId，也不能绕过重新推导校验。

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

read-back 对 `verbalizes` / `opposes` / `qualifies` 同时校验允许的 endpoint kind 与
same-decision ownership，阻止类型正确但跨 decision 的 reasoning edge。相关约束由
`grounding-validator.test.ts` 的 adversarial tamper cases 机械执行。

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

Mortal 的分数决定“模型偏好”；教练判断（CoachJudgment）由 LLM 在可审计的证据上做出
（hard evidence 为约束，advisory signal 为带来源/版本的参考上下文）。删除模型评分不能
改变事实账本与差异，也不得改变教练判断的证据基础。历史 Akagi 契约不代表当前实现范围。

### Local Mortal privileged runtime

Electron main 是唯一 runtime lifecycle owner。启动前必须校验 strict runtime manifest、
runtime artifact 与 checkpoint SHA-256；request 只含 canonical/replay identity、窗口、合法
候选与 actual correspondence。每个 self-turn/response window 的本地候选集必须与 runtime
候选集一一双射；duplicate/missing/extra/unknown/ambiguous 全部 fail closed，不取交集。

local runtime 的 package provenance 必须恢复 runtime source revision/version/artifact hash、
checkpoint repository revision/model tag/file hash、protocol 与 adapter version，且参与 package
identity/content hash。crash、timeout、协议或候选不一致只产生固定安全错误；raw prose、路径、
tensor 与 debug output 不进入 package、ReviewReport、renderer、LLM 或日志。

### Privileged / renderer 分离

账号 ID、令牌、协议 payload、下载 URL 和牌谱字节只能存在于主进程或 source 包。IPC 使用窄方法和固定安全结果。

COAC-3 的 `desktop/src/llm-provider/` 消费 contracts 的 `LlmCoachProvider`；HTTP、
凭据和 package reader 只在 main 组合。生产入口启动时消费一次显式
`RIICHI_COACH_API_KEY` 环境槽并删除该环境值，直接调用 Electron safeStorage，原子
写入 `userData/coach-provider-credential.json`（仅版本、providerId、密文）。凭据
不经过 session-key protector，后者仍要求 `canonicalBase64(keyBase64, 32)`。
Linux 弱后端、损坏/解密失败、加密/写入失败均不可用；失败替换保留旧密文，当前服务
停止使用凭据，成功重新导入或经校验的重启才能恢复。删除/替换操作等待在途生成结束。

`riichiCoachProvider` 只暴露 configure/status/importCredential/clearCredential/generate。
configure 接收严格 `{baseUrl, modelName}` 或 `{providerId:"codex-cli", modelName:"gpt-6-luna", reasoningEffort:"max"}`；
baseUrl 只允许无认证信息、query、fragment 的 HTTPS URL。非敏感设置由 main 独立原子保存到
`coach-provider-settings-v1.json`；凭据仍由原安全存储拥有。Codex 分支使用已有登录，
不读取 BYOK key。导入/删除不接收参数。generate 只接收 `{packageId}`，主进程从
`userData/analysis-packages/<sha256(packageId)>.json` 读取已有包，并校验内容与 identity；
缺失/损坏引用返回 `package_unavailable`。此只读接点不提供新的分析包写入或目录 UI。

唯一生产生成链是 validate package → project → select → `generateReviewReport` →
slice → CoachContext/短引用绑定 → 冻结 prompt → provider 内一次初始调用与至多一次自动重试 → 引用还原/grounding →
append overlay → read-back validator。desktop main 是组合根；service/IPC 不得直接调用
provider、slice/prompt builder 或 assembler 产生报告。该边界由
`review_report_generation_seam` 架构规则机械保护。已有 package/report 的 presentation
读回只能通过 reasoning-owned `composeReviewReadBackContext`：它复用 package/report
validators、base projection 与 overlay assembly，并验证 selector-owned scope。无 active
report 时返回 selector-scoped base evidence context；有 active report 时验证 report 与
selector 的 policy/decision 顺序一致后返回单一 current-report graph。两条路径都提供
same-decision ref resolution，且不拥有 provider/prompt/selection/retry/generation/publication。
desktop production 对 reasoning 的静态/literal 模块引用只允许静态 named
import（允许别名，禁止 default/namespace）；re-export、literal dynamic import、
`require()` 与 import-equals 均 fail closed，包括 service 自身。
`generateReviewReport` 绑定与 concrete provider 的加载均仅归
`llm-provider/service.ts`；两者只允许 static named import，re-export、literal dynamic
import、`require()`、import-equals、default/namespace import 均 fail closed。generation
internals（含 `appendReasoningOverlay`）禁止 desktop 获取；presenter 可 named import
`composeReviewReadBackContext`，持久化校验仍可 named import `validateReviewReport` /
package validators。
检查器不解析运行时计算的模块路径，不提供任意 JavaScript 的数据流证明。
流程不保存完整 prompt、response 或 raw CoT。
Codex 是第二个 main-only adapter：固定模型/max、临时空工作目录、read-only、忽略用户配置，
原生子进程只继承必要系统路径和既有网络代理变量，API key、MCP/控制命令环境不继承。
CLI 必需的 code_mode_host 基础设施保持默认；独立 code_mode 保持关闭，工具能力仍禁用。
严格结构化输出要求所有 object properties 列入 required，空数组仍可表达无额外推断，
原始最终 JSON 不经 provider 特例改写，以保留 wire 输出哈希。
单次禁用 CLI 工具和外部上下文功能，提示词经 stdin 输入。JSONL 只在内存解析；只接受
完成的最终 assistant 内容、数值用量和固定错误语义，工具调用事件立即拒绝，且等子进程
退出后才允许外层重试。临时目录清理，原始流、认证参数、stderr/CoT 不进入报告或 renderer。
CLI 自身的 HTTP 重试不受 adapter 的外层一次重试计数覆盖；`transportRetries` 对此分支表示
额外 CLI 启动次数，不能用它推算云端实际发送次数。CLI 不提供本适配器可控的 temperature/
输出 Token 上限；generation 显式记录 `samplingMode:provider_default` 与 `reasoningEffort:max`，
不声称等同 HTTP 的 temperature=0/max_tokens。输出字节与运行时间仍受本地上限约束。
桌面在请求前检查就绪状态，main 再检查；未就绪时不发布报告，不消费首次生成资格。
一旦生成报告，仍遵守既有首次生成/不可原地重生成契约。
optional usage 先校验形状，畸形 metadata 不会把合法 draft 变成传输失败。被拦截的
key/prompt 反射只在 main 内保留与本次结果绑定的原文 hash，正文丢弃，audit.outputHash
继续指向原始模型输出。冻结 v1 prompt 明确要求 zh-CN，且任何 Mortal（以及历史 Akagi）内部原因
（modelReason）恒 unknown；预期全文 golden 锁定字节。
模型返回的未知字段不成为产品字段，错误正文不读取，diagnostics 只保留冻结 code 与
已选 decisionId。IPC 与 preload 两端重解析同一 contracts DTO；contracts 的基础
identity/status schema 仅做内部提取，公共形状和导出保持不变，`sideEffects: false`
使沙箱 bundle 不引入未使用的 Node crypto 模块。依赖方向与 renderer allow-list 未扩张。

M7-B 将上述只读边界落到 `desktop/src/review-session-repository.ts`：Electron main 是
`review-library/library.sqlite` 的唯一写入者，SQLite v1 逻辑 schema（storage v2 为删除
receipt 追加 package binding，storage v3 为完整 package JSON 增加有序分块；迁移/兼容见 M7-B §7）只保存 immutable package/report
bytes、冻结 selection、append-only report ref、显式 active ref 与两阶段 activation
intent/receipt。打开或恢复时逐层校验 hash/schema/domain identity，并且只调用
`composeReviewReadBackContext` 从 fresh package projection 装配当前报告；ContextGraph
仍不落盘。同一次磁盘读回产生的 context 深度冻结后由主进程概览/详情复用，
不经 IPC 暴露；重新读库或切换报告仍构建新 context，不缓存自报身份对应的校验结论。
完整图投影仅合并可由同节点所引请求的 sourceRefs 证明冗余的 canonical-event 直连：
保留全部节点、完整 provenance 与请求 → 事件路径，逐节点可达证据集合不变。
不截断分析包/图或按实际动作过滤；具体规则与回归由 M6-D1 spec/projector owner 持有。
repository 在完整 package validator 已证明 schema 无归一化之后直接使用本次读回对象，
不再复制整包；保存调用方仍不被修改/冻结，返回值来自独立磁盘读回。
`package-artifact-storage.ts` 是该 repository 内的字节存储实现：64 KiB 块、完整字节哈希、
事务内写入和旧 inline JSON 读取。固定 `@streamparser/json@0.0.26` 仅用于 main 侧分块解析，
不进入 renderer 或领域契约；不改变校验与图构建 owner，不新增架构级抽象。
`desktop/src/privileged-raw-cache.ts` 与资料库共用 main-only 索引，但 raw bytes
只进入受控 `source-cache/`，命中重新验证路径、长度和 hash；renderer DTO、日志与会话
artifact 均不携带 raw material。缓存没有 TTL/LRU，只有显式清理。

## 当前已知架构缺口

- ADR-0006 生产入口已切换，旧 self/response 枚举、资格预筛与单候选反证已退出；
  最终提交真实全语料、大包持久化与来源缺失证据仍需收口。以下 M6-A4 历史覆盖
  不证明迁移后已完成新验收。

- canonical mapper 的部分流局/杠语义尚需真实牌谱反证（M5 人工验收并行线程）；
- 响应面已接入（M6-A4.0/A4.1/A4.2：归属过滤拆除、discard_response/kan_response 开窗、响应窗口身份事实表与本地候选枚举同构、守恒不变量升级、响应分支覆盖率矩阵 fail-closed）；A4.3 纯事件 discovery 扫描已落地（`scripts/response-surface-discovery.mjs`，chankan 最早启动、合格局计数按 source 记入 manifest），wave-1 六分支已全部真实 E2E 取证（resp_chi/pon/daiminkan/hora_actual + resp_pass_on_discard 四候选族子覆盖 + resp_chankan_actual，8 份真实报告），wave-2 保持 fail-closed + 降级条款；
- mapped/replayed record 的 share-import 产品接线当前候选已汇入同一 main-only 组合；账号牌谱下载已消费 main-only、
  内容去重的 source raw cache，命中仍经 source/canonical 验证，并提供只返回安全计数结果的
  显式清理入口；raw bytes 仍不构成 renderer 或会话 artifact；
- 整盘 StructuredAnalysisPackage（M6-C）、Typed Context Graph substrate（M6-D1）、M6-D2 唯一端到端生成链、M7-A fixed review UI 与 M7-B SQLite 会话/离线重开 substrate 已实现；真实账号/真实收费 LLM 自动验收未授权，跨平台发布仍未实现（M8）。
- Playable Review MVP 的 share-import composition root 当前候选已闭合
  validated `StructuredAnalysisPackage` → ReviewSession create/reuse → `openReview`；分享导入只把
  verified `sessionId/packageId` 交给 renderer，不能以 replay 决策数 prose 结束。account
  `startRecordAnalysis` 仍需后续接入同一 package/session handoff。固定五门、
  Golden Slice、独立评审与真人 smoke 仍是发布门。冻结接线与顶层 Electron 验收见
  [Integration Closeout spec](../specs/2026-09-24-playable-review-mvp-integration-closeout.md)。
