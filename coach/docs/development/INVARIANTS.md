# 架构不变量登记表

本页是 coach 的**唯一权威不变量登记表**。它不重复 [ARCHITECTURE.md](ARCHITECTURE.md)
的完整描述，只抽取**已由代码/测试/机械检查支撑**的架构级不变量，并给出每条不变量的
机器化程度。任何改动（尤其 AI 生成的改动）都必须回答：是否触及下列 INV-\*，由哪条
可执行检查保护。

分级：

- **机器强制（machine-enforced）**：有可执行检查（schema/validator/测试/脚本）在
  违反时确定性失败；
- **部分强制（partial）**：有检查但只覆盖该不变量的一部分边界，或依赖约定+抽查；
- **文档约定（docs-only）**：目前只有文档与代码结构约束，无独立可执行检查。

状态列表示**本文撰写时**的强制程度；把某条从 partial/docs-only 升为 machine-enforced
时，必须同时补上对应的可执行检查与测试。

---

## INV-001 硬牌局事实不得来自 LLM

- **Statement**：任何局面事实或候选级分析事实只能来自本地可验证的确定性管线；
  LLM 只能追加教练判断（CoachJudgment / CoachInference），不得发明、修改或补全
  局面事实。
- **Why**：可审计性是产品核心价值；LLM 一旦能倒写事实层，解释验证器便失去机械
  grounding 的基础。
- **Owner / boundary**：`StructuredAnalysisPackage`（确定性产物）与 `ReviewReport`
  （LLM reasoning overlay）之间的边界；LLM 产物经 `decisionId/evidenceId` 引用证据层，
  类型上无法改写。
- **Enforcement**：`validateStrictAnalysisPackage` 拒绝未知
  字段、校验证据节点（`package-validator.ts`）；`CoachJudgment` 只携带受
  teaching-policy 支持的证据引用；模型评价只表示模型选择，不生成麻将事实。以上保证
  **当前确定性管线产物无法被任意 LLM 字段覆盖**——即便未来出现 LLM 输出，其字段
  结构也无法通过包级 schema 校验进入证据层。
- **Executable tests**：上述 package/pipeline 测试，加上
  `review-report.test.ts`、`grounding-validator.test.ts`、`coach-provider.test.ts` 与
  `review_report_generation_seam` 架构规则；无依据事实、跨 decision 引用、证据改写与
  绕过唯一生成 seam 的静态/literal reasoning 模块引用均 fail closed。
  `scripts/check-architecture.test.mjs` 永久覆盖 reasoning 与 concrete provider 的
  re-export、dynamic import、require、import-equals、default/namespace 旁路，以及合法
  service/read-back named import；
  运行时计算的模块路径不在静态检查范围内。
- **Status**：machine-enforced（M6-D2 运行时、grounding/read-back validator 与架构
  边界已于 COAC-4 收口）。

## INV-002 模型偏好不得改写确定性事实账本

- **Statement**：remote report 或 managed local runtime 的 Mortal 分数只决定“模型偏好”；
  删除模型评分不能改变 `KnownGameFacts`、`CandidateFactorLedger` /
  `FactorDifference`，也不得改变教练判断的事实证据基础；`modelReason` 恒为 `unknown`。
- **Why**：事实账本与模型评价是两个独立来源；混用会让"删除模型后结果仍稳定"这一
  可审计性质失效。
- **Owner / boundary**：`buildStrictAnalysisPackage` 内 factor 与
  `ModelEvaluation` 的组装边界；`FactorEvidenceSchema` 的 model/actual 分桶。
- **Enforcement**：validator 校验 factor 分桶与 primary axes 派生；`deterministic-
  resolver` 只消费已注册确定性差异。
- **Executable tests**：`package-validator` 相关测试（"Factor … is in the wrong
  model bucket"）、`factor-differences.test.ts`、`preference-agreement.test.ts`。
  COAC-111 必须把相同输入在有/无 local Mortal scores 下的 facts/ledgers/differences
  byte-equivalence 加入 `local-mortal-adapter.test.ts`。
- **Status**：machine-enforced（现役 report-based path）。本规格没有降低等级；COAC-111
  只有在同提交加入 local-runtime 等价性门并保持 machine-enforced 后才能宣称实现。

## INV-003 game-record 来源协议语义止于 canonical 重放/推理边界

来源分两类，规则不同（权威裁决见
[ADR-0005](../adr/0005-workspace-dependency-boundaries.md)）：

```text
Game-record providers（牌谱协议来源）
├── mahjong-soul-source   —— 雀魂协议/账号/牌谱
└── tenhou-source         —— 天凤 mjlog 牌谱格式

Model/report evidence provider（模型/报告证据来源）
├── mortal-source         —— remote Mortal 报告格式解析（reasoning 可消费其公开契约）
└── mortal-runtime        —— privileged local subprocess/checkpoint（尚未实现；reasoning 不依赖）
```

- **Statement**：**game-record provider 的协议语义必须止于 canonical
  重放/推理边界之前**——下游只消费 `CanonicalEventStreamV2` 契约。reasoning 不得
  依赖雀魂协议细节、天凤牌谱格式细节或任何 provider 专属局面表示。它**可以**按
  ADR-0005 消费 `mortal-source` 公开导出的模型/报告证据契约（`mortal-source` 只做
  报告格式解析，不含特权来源能力，不在此边界内）。计划中的 `mortal-runtime` 只能消费
  contracts-owned canonical/replay request，不得读取任何雀魂/天凤协议或账号 payload；
  reasoning 只消费 contracts-owned runtime result，不依赖 privileged runtime 包。
- **Why**：game-record 来源可替换性依赖"唯一 canonical 语义"；协议细节泄漏会让新
  来源接入变成全链改动。mortal-source 是证据格式适配器，其消费边界由 ADR-0005
  单独裁决，两者不混同。
- **Owner / boundary**：`@riichi-coach/{mahjong-soul-source,tenhou-source}` 的导出
  面（只导出 canonical 映射与错误码）；`@riichi-coach/mortal-source` 的导出面（只
  导出报告 schema/URL/指纹/tile 工具）；计划中的 `@riichi-coach/mortal-runtime` 只导出
  main-owned lifecycle 能力；它们与 `@riichi-coach/reasoning` 的依赖方向（reasoning 只
  允许依赖 contracts 与 mortal-source，不允许依赖 mortal-runtime）。
- **Enforcement**：canonical mapper fail-closed + `canonical-event-validator`；
  tenhou-source 的 index 文档明确"source-specific details stop at this package"；
  `scripts/check-architecture.mjs` 的依赖方向规则（game-record 来源包不得导入
  reasoning；reasoning 不得导入 mahjong-soul-source / tenhou-source；reasoning →
  mortal-source 是 ADR-0005 允许边）。
- **Executable tests**：`canonical-mapper.test.ts`、`canonical-event-validator.test.ts`、
  `tenhou-source/tests/real-logs-corpus.test.ts`、`malformed-inputs.test.ts`、
  `npm run check:architecture`。COAC-111 必须扩展 checker 与其自测，拒绝 runtime 导入
  game-record providers、reasoning 导入 runtime、renderer/preload 导入 runtime。
- **Status**：machine-enforced（现役来源边界）。local runtime 尚不存在；COAC-111 必须让
  新边先进入同一机械门，禁止以“暂时 partial”接入生产路径。

## INV-004 候选身份必须绑定其 canonical 决策窗口

- **Statement**：候选通过 `actionRef` 绑定到产生它的决策窗口
  （`DecisionSnapshotV2.decisionEventRef === privateState.decisionWindow.triggerEventRef`）；
  身份不得脱离窗口漂移，响应窗口按决策归属配对，绝不按 last_actor 猜。任何 local
  model evaluation 还必须证明本地 canonical legal candidates ↔ runtime legal actions
  一一双射及 actual action 唯一 correspondence；不得取交集或静默丢 action。
- **Why**：候选与窗口的绑定是"可追溯比较"的最小单位；脱绑后任何差异、解释、
  验收证据都无法定位。
- **Owner / boundary**：`contracts` 的 decision snapshot / decision window /
  comparison set 契约；`freezeDecisionSnapshot` 与 `comparison-set-builder`。
- **Enforcement**：`DecisionSnapshotV2Schema` 的窗口一致性 superRefine
  （decision/trigger 相等、actor 相等）；`validateStrictAnalysisPackage` 校验
  "Decision and scene event IDs do not match"。
- **Executable tests**：`decision-snapshot.test.ts`、`round-state.test.ts`、
  `candidate-contracts.test.ts`、`comparison-set-builder.test.ts`、M6-A4 binding/conservation
  与 structured package candidate-universe tests。COAC-111 追加 local runtime 的
  duplicate/missing/extra/unknown/ambiguous 及 self/response actual-correspondence 负例。
- **Status**：machine-enforced（现役 canonical/report/package 路径）。local runtime 尚未
  实现；其双射负例是 production seam 的先决门，不能先接入后补测试。

## INV-005 renderer/UI 不得接收特权原始协议与秘密

- **Statement**：账号 ID、令牌、协议 payload、下载 URL、原始牌谱字节只能存在于
  主进程或 source 包；renderer/preload 只接收安全 DTO 与固定错误码。local Mortal
  subprocess、checkpoint 路径/文件与 raw stdout/stderr 也只属于 Electron main 的独立
  privileged runtime owner，renderer/preload 不得启动进程或获得通用执行能力。
- **Why**：特权数据进入 renderer 即扩大攻击面；隔离边界是本机信任模型的核心。
- **Owner / boundary**：`desktop` 的 preload / `renderer/` 与主进程
  `mahjong-soul-session-service` / `catalog-service` / IPC 之间的表面；
  `SecretString` 包装。
- **Enforcement**：preload 只暴露窄 API 并重新解析 DTO；renderer 目录只允许导入
  contracts 与桌面安全 API 模块（`scripts/check-architecture.mjs` 的
  `renderer_safe_boundary` 规则，直接导入级）。
- **Executable tests**：`preload-entry.test.ts`（拒绝携带凭据的状态/摘要）、
  `security-boundary.integration.test.ts`、`main-security.test.ts`、
  `secret-string.test.ts`、`npm run check:architecture`。
- **COAC-3 增量**：`provider-credentials.test.ts`、`coach-provider.test.ts`、
  `coach-ipc.test.ts`、`coach-preload-bundle.test.ts` 约束独立密文记录、无 key IPC、
  固定错误、反射秘密拦截与沙箱 bundle 的实际依赖。首次执行的 Vitest/build
  `spawn EPERM` 保留为环境失败；恢复会话并修复三个 P2 后五门实际通过，见 COAC-3
  回执；不修改既有不变量等级。
- **Status**：machine-enforced（行为测试 + 机械导入规则；注意机械规则只查直接导入，
  传递泄漏仍靠行为测试）。local runtime 增量在 COAC-111 落地前为 docs-only，完成时必须
  同提交增加 checker/preload/security 行为负例，不能降低本条等级后宣称完成。

## INV-006 畸形/语义不支持的记录 fail closed，不静默降级

- **Statement**：输入不完整、协议漂移、证据不一致或能力未实现时返回固定
  blocked/unsupported 状态；不猜字段、不降级到宽松解析、不让上游 prose 穿透。
  local Mortal 的 identity/hash、crash、timeout、protocol、candidate/actual mismatch 只能
  映射到冻结的安全 code 与既有 outcome，不得透传 traceback、路径或 stdout/stderr。
- **Why**：宽松解析会悄悄把错误当成分析结果；fail closed 是可复现失败的前提。
- **Owner / boundary**：所有严格 schema（contracts）与所有来源适配器的错误路径。
- **Enforcement**：zod strict schema 拒绝未知字段；canonical mapper / 报告解析 /
  协议 bundle 返回固定错误码；`managed-sidecar` 校验打包清单逐字段相等。
- **Executable tests**：`malformed-inputs.test.ts`（tenhou）、
  `canonical-mapper.test.ts`、`report-schema.test.ts`、`fact-engine.test.ts`
  （拒绝任意 sidecar prose）、`mahjong-soul-protocol-compatibility.test.mjs`；COAC-111
  追加每个 `mortal_*` 固定错误与 oversize/extra-prose 负例。
- **Status**：machine-enforced（现役路径）。COAC-111 必须在接入 local runtime 的同一提交
  机械覆盖新增错误面并保持等级。

## INV-007 持久化/可复现分析产物保留版本与来源信息

- **Statement**：任何可复现/可持久化的分析产物（事件流、证据 manifest、验收状态、
  discovery 报告）必须携带 schema 版本、来源/身份与（适用时）内容哈希。local Mortal
  package 必须可恢复 runtime revision/version/artifact SHA-256、checkpoint repository
  revision/model tag/file SHA-256、protocol 与 adapter version；不得只写 `Mortal`。
- **Why**：版本与来源是追溯与"旧产物可否重放"的判据；缺失则审计无法定位到产生它的
  代码版本。
- **Owner / boundary**：各产物 schema 的 `schemaVersion` / `sourceKind` / `gameId` /
  `sha256` 字段约定；已实现的 `StructuredAnalysisPackage` 以 package identity、
  component versions 与 evidence provenance 延续该约束。
- **Enforcement**：schema 字面量版本（如 `canonical-riichi-events/v2`、
  `decision-snapshot/v2`）与 manifest 校验（evidence manifest 含 sha256 与
  schemaVersion）；协议 bundle manifest 逐字段校验。
- **Executable tests**：`mortal-coverage-evidence-manifest.test.ts`、
  `mortal-coverage-registry.test.ts`、`protocol-bundle.test.ts`、
  `update-packaged-fact-engine-manifest.test.mjs`、
  `structured-analysis-package.test.ts`、`structured-analysis-package-golden.test.ts`；
  COAC-111 必须增加声明/payload/hash 任一侧篡改的 local-runtime provenance 负例。
- **Status**：machine-enforced（现役 `StructuredAnalysisPackage` identity）。local runtime
  provenance schema/validator 是 COAC-111 的前置交付，不能以 declaration-only 进入 package。

## INV-008 启发式/估算永不进入确定性偏好

- **Statement**：现物等可证明事实可进入确定性比较；筋、壁、one-chance、helper
  风险刻度等保持版本化启发式，`DeterministicPreference` 只能由已注册的确定性差异
  驱动，轴间冲突时为 null。
- **Why**：启发式升格为结论会绑架教练判断并破坏"确定性可审计"承诺。
- **Owner / boundary**：`deterministic-resolver` 与 `difference-builder`；
  `FactorDifference.evidenceClass` / `preferenceEligibility` 字段。
- **Enforcement**：resolver 只消费 registered deterministic difference；
  `preferenceEligibility === "heuristic_only"` 的条目被排除。
- **Executable tests**：`deterministic-resolver.test.ts`、
  `canonical-replay-invariance.test.ts`（`expectPreferenceUsesOnlyDeterministic-
  Differences`）、`structured-factor-regression.test.ts`。
- **Status**：machine-enforced。

## INV-009 canonical 事件流是唯一真相，来源适配器只映射不计算

- **Statement**：canonical 事件流是所有新重放工作的唯一真相；**game-record 来源
  适配器**只能把来源记录映射为事件，不得顺便计算教练因素或改写冻结决策；
  fixture-only legacy bridge 仅用于回归，不是生产 fallback。
- **Why**：计算与映射分离才能保证"同一 canonical 流 → 同一分析"的来源无关性。
- **Owner / boundary**：game-record 来源包（mahjong-soul-source / tenhou-source，
  只做映射）与 reasoning（做重放/因素）之间的依赖方向；
  `legacy_regression_bridge_only` 的 source kind 限制。
- **Enforcement**：game-record 来源包 `package.json` 不含 reasoning 依赖
  （`scripts/check-architecture.mjs`）；bridge 拒绝非 fixture source kind；
  `known-game-facts-v2` 对 fixture 来源标记 `legacy_regression_bridge_only`。
- **Executable tests**：`legacy-event-stream-bridge.test.ts`、
  `canonical-replay-invariance.test.ts`、`npm run check:architecture`。
- **Status**：machine-enforced（依赖方向机械规则 + bridge/schema 校验）。

## INV-010 生产覆盖率 registry 只从 evidence manifest 提升

- **Statement**：生产覆盖率 registry 只能由 `createMortalCoverageRegistryFromManifest`
  从经审核的 evidence manifest 提升；验收模式使用宽口径 registry，但宽口径结果
  永不直接成为生产覆盖率。
- **Why**：覆盖率是"该语义分支已被真实 E2E 命中"的声明；只有来自 manifest 的提升
  才能保证每条覆盖率背后有可审计证据。
- **Owner / boundary**：`mortal-coverage-registry` / `mortal-coverage-evidence-
  manifest` / `acceptance-core` 之间的提升路径。
- **Enforcement**：`createMortalCoverageRegistryFromManifest` 解析并校验 manifest
  schema（失败即抛错）；manifest schema strict，含 schemaVersion 与证据哈希。
- **Executable tests**：`acceptance-core.test.ts`（提升路径 + 非法 manifest 抛错）、
  `mortal-coverage-evidence-manifest.test.ts`。
- **Status**：machine-enforced。

## INV-011 reasoning overlay read-back 必须重建身份与决策归属

- **Statement**：持久化或反序列化的 reasoning overlay 不能信任自报身份。
  `CoachJudgment` / `CoachInference` 必须通过引擎重新推导 `nodeId`，且与 payload
  self-id 一致；`Explanation` 保持 content-derived identity（不增加 localId），其
  payload self-id 也必须匹配。`verbalizes` / `opposes` / `qualifies` 必须同时满足
  endpoint-kind 与 same-decision ownership。
- **Why**：只校验 schema、edge hash 或 payload 内部自洽，会允许攻击者同步伪造
  nodeId、自报 self-id、edgeId 与 reportId，或用类型合法的跨 decision 边拼接不属于
  当前判断的证据。
- **Owner / boundary**：`contracts` 的 reasoning node payload / edge 契约，以及
  `reasoning` 的 `validateReviewReport` 与 `composeReviewReadBackContext` read-back 边界；
  Explanation identity 仍由内容派生，不引入第二套 local identity。
- **Enforcement**：read-back 从受信输入重新推导三类 reasoning node identity，重新
  校验 overlay edge identity、endpoint kind、decision ownership、grounding 与最终
  report identity；获准组合 seam 先验证 package/report，再从新投影的 base graph 只装配
  当前 report overlay，并把 ref resolution 限于 selector-owned、same-decision context；
  无 active report 时只暴露 selector-scoped base evidence，不伪造报告或重算 selection；
  任一不匹配均 fail closed。
- **Executable tests**：`grounding-validator.test.ts` 覆盖同步伪造
  CoachJudgment/CoachInference nodeId + payload self-id、Explanation 内容与 payload
  self-id 篡改、`verbalizes` / `opposes` / `qualifies` endpoint-kind 篡改，以及合法
  endpoint kind 的跨 decision 边；`review-read-back.test.ts` 覆盖 package/report fail-closed、
  无报告 evidence read-back、current-report ref resolution 与 A→B→A 隔离；
  `check-architecture.test.mjs` 覆盖 presenter
  只允许 read-back seam、拒绝 overlay/generation internals。
- **Status**：machine-enforced（contracts/reasoning、COAC-3 provider/IPC 与 COAC-4
  唯一生成链均已落盘；真实账号/真实 LLM 人工验收不属于本不变量门禁）。

## INV-012 ReviewSession 持久化不复制 truth，raw cache 不越过 main

- **Statement**：session 只引用 immutable package/report artifact、冻结 selection 与显式
  active report ref；ContextGraph 不落盘。报告追加和激活用 durable intent/receipt 两阶段
  提交，重启只做本地 read-back 恢复。raw source/Mortal bytes 仅在 main 的受控 cache，
  不进入 session/report/renderer/audit/log/error prose。
- **Why**：复制 graph、按时间猜 active 或让 raw bytes 进入 renderer，会分别制造第三套
  truth、崩溃后错误报告和秘密/来源材料泄漏。
- **Owner / boundary**：M7-B spec；`review-session-repository.ts`、
  `privileged-raw-cache.ts` 与 M7-A strict DTO/IPC/preload 边界。
- **Enforcement**：SQLite v1 逻辑 schema（storage v2 追加 receipt package binding）的唯一/复合 FK、immutable triggers、hash/schema/domain
  validators、索引列与正文领域 identity 一致性、生成开始时的 durable session/revision CAS、
  intent/receipt；cache 命中重新验证受控路径/非链接/长度/hash，
  无 TTL/LRU，显式清理以 `deleting` 状态幂等恢复；renderer 只解析 strict DTO。
- **Executable tests**：`review-session-persistence.test.ts` 覆盖离线重开、duplicate
  reportId/ref 寻址、A→B→A、提交一后零 provider 恢复、激活前完整校验、operation 幂等、
  新版本拒绝及 cache dedup/hit/tamper/no-auto-eviction/clear/junction 越界；
  `electron-persistence-smoke.cjs` 在发行 Electron runtime 覆盖 binding/PRAGMA、子进程异常
  终止与 WAL/intent 恢复、complete/evidence-only、不同内容 A→B→A、migration rollback
  及同一真实脱敏 fixture 的生产分析→stub 生成→Overview/List/Detail→独立进程零请求重开；
  repository suite 另覆盖索引/正文 identity 错配、删除重建迟到生成、跨 package/重建 session
  复用删除 operationId 的拒绝，以及 v1 receipt migration/rollback；生产 Electron 启动
  在 cache 路径损坏或 junction 越界时保留材料、固定无路径错误且仍可离线重开；
  `record-ingestion-service.test.ts`、`catalog-api.test.ts` 与
  preload tests 保护生产 cache hit/clear 接线和安全结果；既有 `fixed-review*.test.ts` 与
  security/architecture suites 保护 P6/DTO 边界。
- **Status**：machine-enforced；真实收费 provider 未授权且不属于默认 suite。

---

## 维护规则

1. 新增不变量必须给出 Statement / Why / Owner / Enforcement / Executable tests /
   Status，且至少一条可执行检查或明确说明为何当前只能 docs-only。
2. 不变量被某次改动影响时，在变更控制报告（见
   [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) 的"AI 变更控制协议"）中列出
   受影响 INV-\* 与保护它们的检查。
3. 把 docs-only / partial 升级为 machine-enforced 时，同提交补齐检查与测试。
4. 本表只收架构级不变量；功能级规则进各自模块文档，不收进本表。
