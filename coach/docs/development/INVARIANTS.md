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
- **Enforcement（当前已机械强制部分）**：`validateStrictAnalysisPackage` 拒绝未知
  字段、校验证据节点（`package-validator.ts`）；`CoachJudgment` 只携带受
  teaching-policy 支持的证据引用；模型评价只表示模型选择，不生成麻将事实。以上保证
  **当前确定性管线产物无法被任意 LLM 字段覆盖**——即便未来出现 LLM 输出，其字段
  结构也无法通过包级 schema 校验进入证据层。
- **Executable tests**：`strict-analysis-package.test.ts`、`package-validator` 相关
  测试、`public-pipeline.test.ts`（`coachJudgement === null`）、`mortal-report.test.ts`
  （导入边界脱敏）。
- **Enforcement（剩余缺口）**：生产 Coach/LLM 编排路径（M6-D：GraphContextSlice →
  LLM → ReviewReport）尚未实现，因此"LLM 输出在运行时不得发明/改写硬事实"尚未被
  任何运行时验证器或对抗测试证明。
- **Status**：partial。
- **Promotion condition**：仅在以下条件满足后升级为 machine-enforced——生产 Coach
  运行时与 validator 边界（M6-D2）已实现，且对抗测试证明：LLM 输出的无依据事实断言
  与证据改写均 fail closed（被 validator 拒绝、不进入证据层）。

## INV-002 模型偏好不得改写确定性事实账本

- **Statement**：Mortal/Akagi 的分数决定"模型偏好"；删除模型评分不能改变
  `CandidateFactorLedger` / `FactorDifference`，也不得改变教练判断的证据基础。
- **Why**：事实账本与模型评价是两个独立来源；混用会让"删除模型后结果仍稳定"这一
  可审计性质失效。
- **Owner / boundary**：`buildStrictAnalysisPackage` 内 factor 与
  `ModelEvaluation` 的组装边界；`FactorEvidenceSchema` 的 model/actual 分桶。
- **Enforcement**：validator 校验 factor 分桶与 primary axes 派生；`deterministic-
  resolver` 只消费已注册确定性差异。
- **Executable tests**：`package-validator` 相关测试（"Factor … is in the wrong
  model bucket"）、`factor-differences.test.ts`、`preference-agreement.test.ts`。
- **Status**：machine-enforced。

## INV-003 game-record 来源协议语义止于 canonical 重放/推理边界

来源分两类，规则不同（权威裁决见
[ADR-0005](../adr/0005-workspace-dependency-boundaries.md)）：

```text
Game-record providers（牌谱协议来源）
├── mahjong-soul-source   —— 雀魂协议/账号/牌谱
└── tenhou-source         —— 天凤 mjlog 牌谱格式

Model/report evidence provider（模型/报告证据来源）
└── mortal-source         —— Mortal 报告格式解析（reasoning 可消费其公开契约）
```

- **Statement**：**game-record provider 的协议语义必须止于 canonical
  重放/推理边界之前**——下游只消费 `CanonicalEventStreamV2` 契约。reasoning 不得
  依赖雀魂协议细节、天凤牌谱格式细节或任何 provider 专属局面表示。它**可以**按
  ADR-0005 消费 `mortal-source` 公开导出的模型/报告证据契约（`mortal-source` 只做
  报告格式解析，不含特权来源能力，不在此边界内）。
- **Why**：game-record 来源可替换性依赖"唯一 canonical 语义"；协议细节泄漏会让新
  来源接入变成全链改动。mortal-source 是证据格式适配器，其消费边界由 ADR-0005
  单独裁决，两者不混同。
- **Owner / boundary**：`@riichi-coach/{mahjong-soul-source,tenhou-source}` 的导出
  面（只导出 canonical 映射与错误码）；`@riichi-coach/mortal-source` 的导出面（只
  导出报告 schema/URL/指纹/tile 工具）；它们与 `@riichi-coach/reasoning` 的依赖
  方向（reasoning 只允许依赖 contracts 与 mortal-source）。
- **Enforcement**：canonical mapper fail-closed + `canonical-event-validator`；
  tenhou-source 的 index 文档明确"source-specific details stop at this package"；
  `scripts/check-architecture.mjs` 的依赖方向规则（game-record 来源包不得导入
  reasoning；reasoning 不得导入 mahjong-soul-source / tenhou-source；reasoning →
  mortal-source 是 ADR-0005 允许边）。
- **Executable tests**：`canonical-mapper.test.ts`、`canonical-event-validator.test.ts`、
  `tenhou-source/tests/real-logs-corpus.test.ts`、`malformed-inputs.test.ts`、
  `npm run check:architecture`。
- **Status**：machine-enforced（schema/validator + 机械导入规则）。

## INV-004 候选身份必须绑定其 canonical 决策窗口

- **Statement**：候选通过 `actionRef` 绑定到产生它的决策窗口
  （`DecisionSnapshotV2.decisionEventRef === privateState.decisionWindow.triggerEventRef`）；
  身份不得脱离窗口漂移，响应窗口按决策归属配对，绝不按 last_actor 猜。
- **Why**：候选与窗口的绑定是"可追溯比较"的最小单位；脱绑后任何差异、解释、
  验收证据都无法定位。
- **Owner / boundary**：`contracts` 的 decision snapshot / decision window /
  comparison set 契约；`freezeDecisionSnapshot` 与 `comparison-set-builder`。
- **Enforcement**：`DecisionSnapshotV2Schema` 的窗口一致性 superRefine
  （decision/trigger 相等、actor 相等）；`validateStrictAnalysisPackage` 校验
  "Decision and scene event IDs do not match"。
- **Executable tests**：`decision-snapshot.test.ts`、`round-state.test.ts`、
  `candidate-contracts.test.ts`、`comparison-set-builder.test.ts`。
- **Status**：machine-enforced。

## INV-005 renderer/UI 不得接收特权原始协议与秘密

- **Statement**：账号 ID、令牌、协议 payload、下载 URL、原始牌谱字节只能存在于
  主进程或 source 包；renderer/preload 只接收安全 DTO 与固定错误码。
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
- **Status**：machine-enforced（行为测试 + 机械导入规则；注意机械规则只查直接导入，
  传递泄漏仍靠行为测试）。

## INV-006 畸形/语义不支持的记录 fail closed，不静默降级

- **Statement**：输入不完整、协议漂移、证据不一致或能力未实现时返回固定
  blocked/unsupported 状态；不猜字段、不降级到宽松解析、不让上游 prose 穿透。
- **Why**：宽松解析会悄悄把错误当成分析结果；fail closed 是可复现失败的前提。
- **Owner / boundary**：所有严格 schema（contracts）与所有来源适配器的错误路径。
- **Enforcement**：zod strict schema 拒绝未知字段；canonical mapper / 报告解析 /
  协议 bundle 返回固定错误码；`managed-sidecar` 校验打包清单逐字段相等。
- **Executable tests**：`malformed-inputs.test.ts`（tenhou）、
  `canonical-mapper.test.ts`、`report-schema.test.ts`、`fact-engine.test.ts`
  （拒绝任意 sidecar prose）、`mahjong-soul-protocol-compatibility.test.mjs`。
- **Status**：machine-enforced。

## INV-007 持久化/可复现分析产物保留版本与来源信息

- **Statement**：任何可复现/可持久化的分析产物（事件流、证据 manifest、验收状态、
  discovery 报告）必须携带 schema 版本、来源/身份与（适用时）内容哈希。
- **Why**：版本与来源是追溯与"旧产物可否重放"的判据；缺失则审计无法定位到产生它的
  代码版本。
- **Owner / boundary**：各产物 schema 的 `schemaVersion` / `sourceKind` / `gameId` /
  `sha256` 字段约定；M6-C 的 `StructuredAnalysisPackage` 尚未实现，届时沿用。
- **Enforcement**：schema 字面量版本（如 `canonical-riichi-events/v2`、
  `decision-snapshot/v2`）与 manifest 校验（evidence manifest 含 sha256 与
  schemaVersion）；协议 bundle manifest 逐字段校验。
- **Executable tests**：`mortal-coverage-evidence-manifest.test.ts`、
  `mortal-coverage-registry.test.ts`、`protocol-bundle.test.ts`、
  `update-packaged-fact-engine-manifest.test.mjs`。
- **Status**：machine-enforced（现有产物）；`StructuredAnalysisPackage` 为
  partial（契约未实现，见 M6-C）。

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

---

## 维护规则

1. 新增不变量必须给出 Statement / Why / Owner / Enforcement / Executable tests /
   Status，且至少一条可执行检查或明确说明为何当前只能 docs-only。
2. 不变量被某次改动影响时，在变更控制报告（见
   [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) 的"AI 变更控制协议"）中列出
   受影响 INV-\* 与保护它们的检查。
3. 把 docs-only / partial 升级为 machine-enforced 时，同提交补齐检查与测试。
4. 本表只收架构级不变量；功能级规则进各自模块文档，不收进本表。
