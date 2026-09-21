# M7-A Whole-game fixed review UI 实现规格

日期：2026-09-21
状态：**已完成 grill 与审阅，决策冻结，可直接执行**
工单：COAC-5；后续实现：COAC-6

权威上游：

- [ADR-0003：Evidence-first 权威分层](../adr/0003-evidence-first-coaching-judgment-and-authority-layers.md)
- [ADR-0004：Typed Context Graph](../adr/0004-context-graph-as-auditable-llm-boundary.md)
- [ADR-0005：Workspace 依赖与 renderer 安全边界](../adr/0005-workspace-dependency-boundaries.md)
- [ROADMAP §3 / §5](../development/ROADMAP.md)
- [DeterministicReviewSelector 规格](./2026-08-19-deterministic-review-selector-design.md)
- [M6-D1 Context Graph substrate 规格](./2026-08-19-m6-d1-context-graph-substrate-design.md)
- [M6-D2 Graph-grounded Coach 规格](./2026-08-24-m6-d2-graph-grounded-coach-design.md)
- [2026-08-18 grill F1–F4、H5–H6](../handoffs/2026-08-18-next-phase-roadmap-grill-decisions.md)

术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 为准。本规格冻结 M7-A 的功能与
安全边界；若历史文档与上述 ADR、当前 contracts 或本规格冲突，以较窄的现行
contracts/ADR 与本规格为准。

## 已验收消费基线

M7-A 只能建立在 COAC-4 已验收并合入的代码上：

- GitHub merge commit：`404fc9c596ccb406fa9334bdcbab186ef933ee0c`
  （PR #10，合入 COAC-4 tip `d41dd6d34fa3354185aa145dc91a513bad22c04d`）。
- `@riichi-coach/contracts` 公共契约：
  `StructuredAnalysisPackageSchema`、`ReviewSelectionResultSchema`、
  `ReviewReportSchema`、`CoachReportRequestSchema`、`CoachReportResultSchema`、
  `CoachDesktopApi` 与 `COACH_IPC_CHANNELS`。
- `@riichi-coach/reasoning` 包根公共 seam：
  `selectReviewDecisions`、`projectContextGraph`、`getDecisionSubgraph`、
  `appendReasoningOverlay`、`validateReviewReport` 与唯一生产生成入口
  `generateReviewReport`。M7-A 不导入内部 assembler、prompt/provider mapper 或
  id helper。
- desktop 已有 IPC seam：`coach:report:generate` 只接收 `{packageId}`，主进程从
  `userData/analysis-packages/<sha256(packageId)>.json` 读取并验证 package，执行
  validate → project → select → generate，当前返回 schema-parsed `ReviewReport`。
  M7-A 实现必须把 renderer-facing 返回面收窄为本规格的安全 view DTO；不得增加
  renderer 对 package 文件、reasoning 或 provider 的直接访问。

基线并不包含 review UI、报告目录、取消协议或持久化；这些缺口不得被误写为已有能力。

## Problem Statement

生产链现在可以从一份 `StructuredAnalysisPackage` 确定性选择最多十个复盘决策，
并生成经过 grounding/read-back validation 的 `ReviewReport`。但当前 renderer 只有
登录与目录级原生 DOM 页面，没有产品级消费者把以下事实同时呈现给用户：

- 整盘分析是 `complete`、`degraded` 还是 `integrity_failed`；
- 七值 decision outcome 各有多少条，哪些条目因能力或来源完整性未进入分析；
- selector 选择了哪些决策、排序和机械原因是什么；
- 用户实际选择、Mortal 偏好与 CoachJudgment 分别来自哪个权威层；
- `partial` / `evidence_only` 时哪些解释缺失，以及确定性证据为何仍然可浏览；
- 当前判断沿哪些 hard evidence、advisory signal 与 CoachInference refs 得出。

若 renderer 直接接收 package/graph 并自行拼装，上述展示会迅速演变为第二套 selector、
grounding 与 graph resolver；若把分析完整性和生成状态折叠成一个“成功/失败”，则合法
降级报告会被错误隐藏；若报告切换只是覆盖局部 DOM，两个报告的 reasoning overlay
可能串用。

## Solution

M7-A 在现有 Electron 原生 DOM renderer 中交付一个固定三层复盘工作台：

```text
validated package + selector result + validated active ReviewReport
                         │ main process only
                         ▼
             FixedReviewSnapshotDto / FixedReviewDetailDto
                         │ strict IPC + preload parse
                         ▼
Overview ─────────────▶ List ─────────────▶ Detail
```

1. **Overview** 分开展示 analysis status、七值 outcome counts、selector 数量、报告
   generation status 与逐行 explanation status counts。
2. **List** 只列 `ReviewSelectionResult.selected`，严格按 `rank` 排序，原样携带
   `selectionReason`；tags 仅由该 decision 的确定性 `FactorDifference.axis` 集合
   机械映射。
3. **Detail** 明确分区展示“你的选择”“Mortal 偏好”“CoachJudgment”，并提供按
   authority 分组的 provenance 展开。Explanation 的事实值由主进程从已验证 graph
   refs/placeholder 解析成 typed segments，renderer 只安全地写入 text nodes。
4. 主进程持有 package、selection、graph、完整 ReviewReport 与报告切换状态；
   renderer 只收到 strict、renderer-safe、按当前 active report 投影的 DTO。
5. `complete`、`partial`、`evidence_only`（含空 selection）都是正常可浏览状态。
   provider/解释缺失永不抹掉 package 的确定性证据。

不引入 UI 框架，不把 ContextGraph 画成图，不新增第三份 truth。

## User Stories

1. 作为复盘用户，我想先看到整盘分析完整性与各 outcome 计数，而不是先看到一句
   “生成成功”，这样来源缺口不会被漂亮 UI 隐藏。
2. 作为复盘用户，我想让复盘条目顺序与 selector rank 完全一致，这样 UI 不会自行
   定义“最重要决策”。
3. 作为复盘用户，我想看到固定的 selector reason 文案与机械 tags，这样展示不会用
   “严重失误”等教练措辞冒充确定性事实。
4. 作为复盘用户，我想在一个 Detail 中并列区分我的实际行动、Mortal 偏好与教练推荐，
   这样模型偏好和 CoachJudgment 不会混成同一权威。
5. 作为复盘用户，我想展开 hard evidence、advisory signal 与 coach inference，
   这样可以判断结论建立在哪类依据上。
6. 作为复盘用户，我想在 `partial` 或 `evidence_only` 时仍查看实际行动、候选分、
   差异轴与证据，这样 LLM 不可用不会夺走复盘能力。
7. 作为复盘用户，我想让空 selection 明确显示“当前策略未选出复盘条目”，而不是
   报错或显示空白页面。
8. 作为复盘用户，我想重新生成得到一个新的不可变报告实例引用；即使连续两次
   生成得到同一内容派生 `reportId`，两次生成仍可在目录中分别寻址，且早先实例的
   展示/审计元数据不被覆盖。即使 provider 请求失败，只要生成链仍产出并读回验证通过的
   `partial` / `evidence_only` 报告，也应追加新引用并切换到该引用。只有 package
   读取、报告 read-back 或 identity 校验等操作级失败导致未取得
   合法报告时，才继续看到原 active report，这样降级结果不会被误判为操作失败，真正
   的失败也不会丢失当前结果。
9. 作为复盘用户，我想在报告 A/B 间切换时只看到当前报告的 judgment、explanation
   和 inference，这样相同 local id 也不会串内容。
10. 作为安全审查者，我想让 renderer 永远拿不到 raw package bytes、raw source/Mortal
    cache、key、完整 prompt/response、raw CoT 或文件路径。
11. 作为实现者，我想让 preload 和 main 两端解析同一个 strict DTO contract，这样
    IPC 扩展不会靠 TypeScript 类型声明自我证明。
12. 作为未来 M7-B 实现者，我想复用同一组生命周期状态、事件顺序与 ref 语义，
    这样持久化不会再创造第二套 active-report 规则。

## Information Architecture

### Overview

Overview 同时展示两组绝不互相折叠的状态：

- **分析完整性**：`complete | degraded | integrity_failed`，直接来自
  `package.record.status` / `selection.analysisPackageStatus`；
- **报告生成状态**：`complete | partial | evidence_only`，直接来自 active
  `ReviewReport.generationStatus`；没有 active report 时为 `not_generated`（仅 view
  DTO 状态，不加入 `GenerationStatus` contract）。

计数必须包含七个 outcome 的完整固定键：

```text
analysis_ready
unsupported_action
source_row_not_expected
no_mortal_entry
binding_mismatch
model_output_incomplete
analysis_blocked
```

所有键即使为 0 也必须存在。另显示 `selectedCount`、`readyCount`、
`providerUnavailableCount`、`requestFailedCount`、`invalidOutputCount`。不得把
`source_row_not_expected`（合法单候选无源行）渲染成错误；`no_mortal_entry` 等完整性
失败则保持原名/固定本地化文案，不做乐观改写。

### List

- 行集严格等于 `selection.selected`；不得把未选 decision、失败 outcome 或 report
  `decisionEntries` 自行追加进 List。
- 顺序按 `rank` 升序，rank 必须连续且与数组位置相符；异常由 main projection
  fail closed，不由 renderer 修复。
- 每行展示 round/decision-window 摘要、实际行动摘要、Mortal 首选摘要、error gap、
  固定 selection reason、tags 和 explanation status。
- `selectionReason` 只允许：
  `model_disagreement_above_threshold`、
  `no_distinguishable_factor_difference`。renderer 用 exhaustive mapping 映射固定
  zh-CN 文案，未知值拒绝整个 DTO。
- tags 去重后按固定顺序
  `efficiency → value → defense → placement → option_value` 输出；来源仅为
  `factorDifferences[].axis`，不得从 Explanation、CoachJudgment、自然语言或
  `deterministicPreference` 猜测。
- 没有确定性差异轴时 tags 为空；selection reason 已负责说明
  `no_distinguishable_factor_difference`，UI 不补造一个“综合”轴。

### Detail

Detail 使用固定章节，不因 LLM 状态改变权威顺序：

1. **你的选择**：来自 `normalizedDecisionContext.actualAction` 与 comparison
   correspondence；不存在时显示固定 unavailable 状态，不猜动作。
2. **Mortal 偏好**：来自 `modelEvaluation.preferredActions` 与对应 candidate scores；
   多个并列偏好全部展示，保留 score method/unit，不把其称为“教练建议”。
3. **CoachJudgment**：只从当前 active report、当前 decision 的
   `CoachJudgment` 节点投影 recommendation/confidence/premise refs。
4. **Explanation**：只显示当前 report 中当前 decision 的 Explanation；事实占位符
   由 main presenter 在已通过 `validateReviewReport(report, graph)` 的组合上解析，
   输出 `text | evidence_value | action_value` typed segments。renderer 不接收模板
   原文后自行解析，也不把 HTML 字符串写入 DOM。
5. **证据与 provenance**：按 `hard | advisory | coach_inference` 分组。每项只含
   renderer allow-list 字段、authority、producer/version、稳定 display ref 与
   到父项的 relation；不暴露完整 graph 或任意 payload。

`ready` 行显示 judgment 与 explanation；`provider_unavailable`、`request_failed`、
`invalid_output` 行显示固定状态说明并继续显示确定性 evidence；没有 active report 时
detail 同样可展示 package evidence。`not_selected` 只作为 contracts 预留词汇，M7-A
不为 List 外 decision 合成 report row。

## Contract 与 IPC 边界

### Contracts-owned renderer DTO

COAC-6 在 `@riichi-coach/contracts` 增加 strict、版本化的 view schemas；它们是
presentation projection，不是 canonical artifact，不持久化、不参与 package/report
identity：

```ts
type FixedReviewSnapshotDto = {
  schemaVersion: "fixed-review-view/v1";
  packageId: string;
  analysisStatus: "complete" | "degraded" | "integrity_failed";
  outcomeCounts: Record<MortalDecisionOutcome, number>;
  selection: {
    policyVersion: "deterministic-review-selector/v1";
    selectedCount: number;
    items: FixedReviewListItemDto[];
  };
  reportCatalog: Array<{
    reportRefId: string;
    reportId: string;
    generatedAt: string;
    providerId: string;
    model: string;
    generationStatus: "complete" | "partial" | "evidence_only";
  }>;
  activeReportRefId: string | null;
  activeReportStatus: "not_generated" | "complete" | "partial" | "evidence_only";
  explanationCounts: {
    ready: number;
    provider_unavailable: number;
    request_failed: number;
    invalid_output: number;
  };
};

type FixedReviewListItemDto = {
  decisionId: string;
  rank: number;
  selectionReason:
    | "model_disagreement_above_threshold"
    | "no_distinguishable_factor_difference";
  roundOrdinal: number;
  decisionWindowKind: string;
  actualAction: RendererActionDto | null;
  mortalPreferredActions: RendererScoredActionDto[];
  errorGap: number;
  tags: Array<"efficiency" | "value" | "defense" | "placement" | "option_value">;
  explanationStatus:
    | "not_generated"
    | "ready"
    | "provider_unavailable"
    | "request_failed"
    | "invalid_output";
};

type FixedReviewDetailDto = {
  schemaVersion: "fixed-review-detail/v1";
  packageId: string;
  activeReportRefId: string | null;
  decisionId: string;
  actual: RendererActionDto | null;
  mortal: RendererScoredActionDto[];
  coachJudgments: RendererCoachJudgmentDto[];
  explanations: RendererExplanationDto[];
  provenance: RendererProvenanceItemDto[];
  explanationStatus: FixedReviewListItemDto["explanationStatus"];
};
```

以上是字段语义冻结，不要求照抄 TypeScript 排版。所有嵌套 object `.strict()`；数组有
确定顺序；`Renderer*Dto` 只含渲染需要的 typed action/label/value/ref 字段。严禁加入
以下字段：package/graph/report 整体、任意文件路径/URL、原始牌谱或 source/Mortal
payload、账号标识、credential、prompt/response、raw CoT、上游异常 prose。

### Main presenter

在 desktop 主进程新增窄 presenter/controller，输入为已验证的 package、selector
result、base evidence graph 与可选 active ReviewReport。它负责：

- 复核 `packageId` / selector `analysisPackageId` / report `packageId` 同源；
- active report 存在时，先对 base graph 调用 `validateReviewReport`，再只装配该
  report overlay；
- 计算固定 counts、axis tags、action display DTO、placeholder segments 与 provenance；
- detail 只允许 selector 已选的 `decisionId`，且 refs 只能落在该 decision subgraph
  或当前 report overlay；
- 返回 contracts schema parse 后的 immutable DTO。

presenter 不拥有 selection、grounding、coach authority 或报告 identity。它只做
已验证 truth 的 presentation projection。若 ref 无法解析、跨 decision、跨 report、
DTO 超出 allow-list 或 identity 不一致，整个请求 fail closed 为固定错误码，不返回
“尽量可用”的半 DTO。

### IPC / preload

在现有 `riichiCoachProvider` 安全面上增加或收敛以下窄操作（最终 channel 常量仍归
contracts）：

| 操作 | 请求 | 返回 | 约束 |
|---|---|---|---|
| `openReview` | `{packageId}` | `FixedReviewSnapshotDto` | 只读；不生成 |
| `generateReport` | `{packageId, operationId}` | generation result + snapshot | 复用唯一 COAC-4 生成链；不返回完整 report |
| `cancelGeneration` | `{operationId}` | fixed acknowledgement | 取消或使迟到结果失效 |
| `getReviewDetail` | `{packageId, decisionId, activeReportRefId}` | `FixedReviewDetailDto` | active ref 必须与 main 当前状态一致 |
| `activateReport` | `{packageId, reportRefId}` | `FixedReviewSnapshotDto` | 按唯一生成实例引用执行完整 overlay 切换序列 |
| `leaveReview` | `{packageId}` | fixed acknowledgement | 使在途 operation epoch 失效并释放 view state |

`operationId` 由 main/renderer 协议使用的 opaque id，不进入 ReviewReport。每个请求均
校验 trusted sender、参数个数与 strict schema；preload 对返回值再次 parse。错误只暴露
冻结项目错误码，不透传 filesystem/provider/parser prose。

现有 `coach:report:generate` 可以演进为上述 `generateReport`，但不得与新 channel 并存
两条生成路径；architecture check 必须继续证明只有 `llm-provider/service.ts` 静态 named
import 并调用 `generateReviewReport`。

## 共享会话生命周期（COAC-5 / COAC-7）

本节是两份规格共用的冻结协议。COAC-7 的 M7-B 规格必须按路径引用本节，并使用相同
状态名、事件名、顺序与 `packageRef/reportRef/activeReportRef` 语义；不得重新 grill。
本规格预留其互引路径：
`./2026-09-21-m7-b-review-session-persistence-design.md#与-m7-a-共享的会话生命周期`。
在 COAC-7 文件合入前该链接是显式 forward reference，不表示 M7-B 已实现或已验收。

### Canonical refs

- `packageRef`：指向 immutable `StructuredAnalysisPackage` 的稳定引用；
- `reportRef`：指向 immutable `ReviewReport` 的稳定生成实例引用，至少包含唯一不变的
  `reportRefId`、`packageId`、ReviewReport 内容身份 `reportId` 及该实例的 `generatedAt`；
- `reportRefs`：同一 package 下按追加顺序保存的报告引用集合；
- `activeReportRef`：当前唯一允许装配 reasoning overlay 的 `reportRef`，可为 null。

其中 `reportId` 仍严格遵守 M6-D2 的内容派生公式，`generatedAt` 不进入该公式。
`reportRefId` 是生命周期 controller 在每次合法报告读回通过后分配的 opaque 唯一实例键；
它不得仅从 `reportId` 或 `reportId + generatedAt` 派生，也不改写 ReviewReport identity。
M7-A 在内存中保持该引用及其精确的 immutable report 实例，M7-B 将按同一
形状持久化引用并保证它解析到该次读回验证的精确 artifact；两者都不得仅按
`reportId` 回查报告。

每次 validated generation 都追加新 `reportRef`，即使新旧 ReviewReport 的 `reportId`
相同也不去重、不覆盖、不合并元数据；目录与激活请求都以 `reportRefId`
唯一寻址。报告的 `generatedAt`、provider/model、`reportId` 或数组最后一项都不能
隐式决定 active report。

### View state

状态词汇冻结为：

```text
opening | ready | generating | switching_report | unavailable | closed
```

`generationStatus` 仍只使用 ReviewReport 的
`complete | partial | evidence_only`，不得把 view state 混入 report contract。

### 事件与成功顺序

新生成或重新生成统一使用：

```text
GENERATE_REQUESTED(operationId, packageRef)
→ REPORT_GENERATED(report)
→ REPORT_READ_BACK_VALIDATED(report)
→ REPORT_REF_APPENDED(reportRef)
→ OLD_OVERLAY_UNLOADED
→ TARGET_OVERLAY_ASSEMBLED(packageRef, reportRef)
→ TARGET_OVERLAY_VALIDATED
→ ACTIVE_REPORT_SWITCHED(reportRef)
→ VIEW_READY
```

- 只有通过 read-back validation 的完整 immutable ReviewReport 才能产生 `reportRef`。
- `REPORT_REF_APPENDED(reportRef)` 每次分配并追加一个新 `reportRefId`。若
  catalog 已有相同 `reportId`，新引用仍必须追加；旧引用的 `generatedAt`、provider/model、
  generation status 与审计关联保持原值。
- `partial` 与 `evidence_only` 都是“完整合法报告”，可走同一成功序列；这里的完整是
  artifact 完整，不等于每行 explanation ready。
- 第一次生成时 old overlay 为空，仍记录/执行同一逻辑分支，不另造 fast path。
- M7-A 在内存 report catalog 追加；M7-B 实现后，artifact + ref append 的 durability
  事务归 M7-B，但对 UI 暴露的事件顺序不变。

### 失败、退出与切换

- provider 未配置、请求最终失败或单行输出无效，是 `ReviewReport` 内的行级降级原因，
  不是天然的操作级失败。只要唯一生成链最终返回通过 read-back validation 的合法
  `complete` / `partial` / `evidence_only` 报告，就必须执行完整成功顺序：追加
  `reportRef`、卸载旧 overlay、装配并验证目标 overlay、切换 `activeReportRef`。例如
  两次 HTTP 503 会生成全行 `request_failed` 的合法 `evidence_only` 报告，并切换到
  该新报告。
- 生成失败专指**未取得合法报告**的操作级失败，例如 package 读取/validation 失败、
  生成入口抛错而未返回报告、report read-back validation 失败或 package/report
  identity 不一致：`GENERATE_FAILED(code) → VIEW_READY`。此时不追加 reportRef，
  不改变 `activeReportRef`，不卸载当前 overlay。固定错误码不得泄漏 package、provider
  或 validator prose。
- 生成中退出：`LEAVE_REQUESTED → GENERATION_CANCELLED_OR_DETACHED → VIEW_CLOSED`。
  尝试取消传输；若底层不能及时中止，则 operation epoch 使迟到结果只能丢弃。迟到
  报告不得追加引用或切换 active report。已有已保存报告保持不变。
- 显式 A/B 切换：
  `REPORT_SWITCH_REQUESTED(B) → OLD_OVERLAY_UNLOADED →
  TARGET_OVERLAY_ASSEMBLED(packageRef,B) → TARGET_OVERLAY_VALIDATED →
  ACTIVE_REPORT_SWITCHED(B) → VIEW_READY`。
- target report 缺失、package 不同源或 validator 拒绝：
  `REPORT_SWITCH_FAILED(code)`；恢复原 active ref 与原 overlay 的一致快照。不得把
  old overlay 与 target report 部分拼接。
- reasoning ref 只在 `activeReportRef` 指向的单份 overlay 内解析；package evidence
  ref 只在同一 package 投影内解析。禁止全局 reasoning-node registry。
- 显式切换的 A/B 均是 `reportRefId`，不是 `reportId`。相同 `reportId` 的两个
  生成实例也必须能分别激活；`activeReportRef` 与 snapshot/detail 中的
  `activeReportRefId` 必须始终指向同一 catalog 项。

### 生命周期状态矩阵

| 当前状态 | 事件 | 允许结果 | active report |
|---|---|---|---|
| `opening` | package/selection projection 成功 | `ready` | null 或显式 ref |
| `opening` | package/DTO validation 失败 | `unavailable` | 不暴露 |
| `ready` | generate/regenerate | `generating` | 保持原值 |
| `generating` | read-back validated complete/partial/evidence_only（含 provider 失败降级出的合法报告） | 完成成功顺序后 `ready` | 切到新 ref |
| `generating` | 未取得合法报告：package/read-back/identity 等操作级失败 | `ready` + fixed error | 原值不变 |
| `generating` | leave | `closed` | 不追加、不切换 |
| `ready` | switch A→B | `switching_report` → `ready` | validation 后才变 B |
| `switching_report` | B validation 失败 | `ready` + fixed error | 恢复 A |
| 任意非 closed | leave | `closed` | M7-A 释放 view；M7-B 已保存 refs 不变 |

## UI 状态矩阵

| analysis / report 情形 | Overview | List | Detail |
|---|---|---|---|
| analysis `complete` + report `complete` | 两组状态均如实显示 | 全部 selected 行为 `ready` | 完整 judgment/explanation + evidence |
| analysis `degraded` + report `partial` | outcome 缺口与 partial 分开展示 | ready 与失败行并存 | 失败行无 coach 内容，evidence 仍可展开 |
| 任意合法 analysis + `evidence_only` | 显示 evidence-only，不称生成失败 | selected 行显示冻结 failure status | 只显示实际/Mortal/确定性证据 |
| 空 selection + `evidence_only` | selected=0、ready=0 | 固定 empty-state | 无选择提示，不自动挑一条 |
| analysis `integrity_failed` | 显著完整性警示与真实 counts | 仍只显示 selector 给出的行（通常为空） | 不猜缺失数据；已有合法 evidence 可读 |
| 尚未生成 | report=`not_generated` | explanation=`not_generated` | package evidence 可读，可触发整批生成 |
| generating | 保留当前 snapshot + busy 状态 | 不清空旧列表 | 旧 active detail 保留且标记生成中 |
| regenerate 操作级失败（未取得合法报告） | 固定错误提示 | 不改变 | active report 与 overlay 不变 |
| switching_report | 禁用重复切换 | 保留旧 snapshot 至原子提交 | 不呈现半装配 target |

## Accessibility 与 DOM 纪律

- 继续使用语义化原生 DOM：Overview 用 landmark/definition list，List 用可键盘导航的
  list/button，Detail 用 headings/sections；报告状态用 `aria-live="polite"`，错误用
  `role="alert"`。
- List selection、展开/收起与报告切换全部可用键盘完成；focus 在重渲染后落到可预测
  元素，切换报告不得把 focus 丢到 document body。
- 颜色不是状态唯一载体；所有 status/tag 均有文本。
- 所有模型/证据文本用 `textContent` 或 text node；禁止 `innerHTML`、inline handler、
  markdown HTML passthrough。
- renderer 不使用 Node、filesystem、network、dynamic import 或 privileged package。

## Fixtures 与自动测试策略

### Canonical fixture envelope

在 desktop tests 下新增通过生产 schemas 的固定 envelope，每个都包含同源
`StructuredAnalysisPackage`、实际 `ReviewSelectionResult` 与可选 `ReviewReport`；测试
先 parse/validate，再经 production presenter 生成 DTO，禁止手写绕过 schema 的宽松
view object。

至少冻结以下 fixture：

1. **complete**：analysis complete；至少两条 selected；所有 report rows ready；含
   hard/advisory/CoachInference/CoachJudgment/Explanation refs 与至少一个数字占位符。
2. **partial**：analysis degraded；至少一行 ready、一行 `invalid_output` 或
   `request_failed`；包含 `unsupported_action` 与 `source_row_not_expected` counts。
3. **evidence_only**：selected 非空；零 ready；至少一行 `provider_unavailable`；
   deterministic evidence 可展开，overlay 为空。
4. **empty-selection**：selection.selected=[]；report `evidence_only`、entries=[]；
   provider 调用计数为 0，List empty-state，Detail 无自动选择。
5. **report-a / report-b**：同 package、同 decision、相同 judgment/inference localId、
   不同 recommendation/explanation 内容；用于 A→B→A 隔离。
6. **duplicate-report-id**：同 package、selection 与 provider 连续生成相同内容，
   注入两个不同 `generatedAt`；两份报告经 read-back validation 后 `reportId`
   相同，但必须获得不同 `reportRefId` 并同时留在 catalog。先前引用的元数据不得
   被覆盖，两项均可被明确激活，每次激活后 `activeReportRef`、snapshot 与 detail
   必须一致。

另冻结两组生成生命周期 fixture；它们必须调用唯一生产生成入口并对返回报告执行
read-back validation，不得以 HTTP 结果或异常类别直接猜测是否成功：

7. **provider-503-evidence-only**：已有 active report A；provider 初始请求与唯一重试
   均返回 HTTP 503；生产生成链返回 read-back validated `evidence_only` report B，
   其 selected 行均为 `request_failed`。断言 B 被追加、A overlay 先卸载、B overlay
   装配/验证后 `activeReportRef` 切到 B，最终 `VIEW_READY`。该边界由现有
   `packages/desktop/tests/coach-provider.test.ts` 的双 503 → `status: "ready"` +
   `generationStatus: "evidence_only"` 回归提供上游保护。
8. **operation-failure-preserves-a**：已有 active report A；分别注入 package 读取或
   validation 失败、report read-back validation 失败、package/report identity 不一致。
   每种情况都断言没有合法 report B、没有追加 ref、没有卸载 A overlay，
   `activeReportRef` 与 Detail snapshot 保持 A 且返回固定错误码。

### Contract / presenter tests

- DTO strict schema 接受上述投影，拒绝未知字段、完整 package/report/graph、路径/URL、
  prompt/response/key-like 字段与未知状态。
- catalog 允许两项拥有相同 `reportId` 但必须拥有不同 `reportRefId`；重复
  `reportRefId`、无法解析到唯一 catalog 项的 `activeReportRefId` 或以 `reportId`
  代替实例引用均 fail closed。
- Overview counts 精确等于 package decisions；0 值键不缺失；analysis 与 generation
  status 不互相推导。
- List 行集/顺序/reason 精确等于 selector；打乱输入 selected 或重复 rank fail closed；
  tags 只由五值 axis 集合按固定序产生。
- Detail action/model/judgment 分层正确；placeholder segments 的值可追到当前 decision
  evidence；悬空、跨 decision、跨 report refs 拒绝整个 detail。
- `partial`/`evidence_only` 即使没有 explanation 也返回 evidence detail。

### IPC / security tests

- trusted sender、参数个数、request/response 双端 schema parse；任一非法输入返回固定
  code，不泄漏上游 prose。
- renderer/preload 不导入 reasoning/source/provider/fs/network；BrowserWindow 保持
  `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- IPC 响应递归扫描禁止 credential、raw cache/source bytes、account identity、完整
  prompt/response、raw CoT 与本地路径。
- architecture checker 阻止第二生成入口、renderer privileged import 与 deep import。

### Lifecycle / renderer tests

- 生成中 `leaveReview`：abort-capable fake 收到 cancel；non-abortable fake 迟到成功也不
  追加 ref、不触发 view 更新。
- provider 两次 503 后返回的 read-back validated `evidence_only` 报告走完整成功序列，
  追加新 ref 并切换 active report；不得因传输失败原因保留 A。
- 连续两次生成相同的合法报告：保留 `review-report.test.ts` 已有的“不同
  `generatedAt` 不改变 `reportId`”回归；controller tests 额外断言两个唯一
  `reportRefId`、两条未覆盖 catalog metadata、按 ref 的 A→B→A 可寻址性与 active/DTO 一致。
- regenerate 操作级失败（package/read-back/identity，未取得合法报告）：active
  `reportRefId`、Detail DOM 与 overlay snapshot deep-equal 不变。
- A→B→A：每次先清空 reasoning state，再装配 target；B 中不存在 A 的 judgment、
  explanation、inference 或 ref resolution cache，反向亦然。
- renderer fixture tests 覆盖三层导航、empty-state、固定本地化文案、keyboard/focus、
  aria-live 与不使用 `innerHTML`。

## 实施切片

1. **Contracts**：新增 view DTO / IPC request-result schemas 与 exhaustive enum tests。
2. **Main presenter**：package + selection + active report → snapshot/detail；先做四 fixture
   的 RED/GREEN，再做 ref/identity 负例。
3. **Lifecycle controller**：operation epoch、每次 validated generation 分配的唯一
   `reportRefId`、内存 report catalog、active ref 与原子 overlay switch；不实现 disk persistence。
4. **IPC/preload**：收窄现有 generate 返回并增加 open/detail/cancel/switch/leave；保持
   唯一生成 seam。
5. **Renderer policy + DOM**：纯 view reducer/render functions 后接事件；完成 Overview
   → List → Detail 与 accessibility tests。
6. **Integration**：四状态 fixture E2E、生成中退出、失败 regenerate、A→B→A；运行全部
   architecture/security/build gates。

## 验收门

- complete、partial、evidence_only、empty-selection 四个 fixture 均从生产 schema 经
  main presenter、IPC/preload parse 到 DOM 自动验证，无崩溃、无第二套状态推导。
- Overview 的七值 counts、analysis status、generation status 精确匹配输入 truth；
  List 行集/顺序/reason 精确匹配 selector；tags 精确匹配确定性 axis 集合。
- Detail 的实际/Mortal/Coach 权威层可辨；Explanation placeholder 值来自当前 decision
  refs；hard/advisory/coach provenance 可展开。
- `partial` / `evidence_only` 可浏览 evidence；空 selection 不调用 provider、不自动
  选 decision。
- 生成中退出无半成品引用；双 503 产生的合法 `evidence_only` 报告追加并切换；未取得
  合法报告的失败 regenerate 不改变 active report；A→B→A 不残留另一 report 的
  reasoning state。
- 不同 `generatedAt` 的连续同内容生成保持相同 `reportId`，但每次追加唯一
  `reportRefId`；旧元数据不覆盖、目录无歧义、两个实例均可按 ref 激活且
  active ref / snapshot / detail 一致。
- renderer 不获得 prohibited data/capability，现有 main-security、preload、IPC 与
  architecture tests 不回归。
- `npm run typecheck`、`npm run build`、`npx vitest run`、
  `npm run check:architecture`、`npm run test:package-import` 全绿；不新增 UI framework
  或 workspace dependency。
- 人工桌面 smoke（若环境允许）确认三层导航、键盘/focus、长文本/窄窗与状态可辨；
  自动测试通过不能替代该视觉/交互检查，无法运行时必须明确记录未执行。

## Out of Scope

- ContextGraph visualization、GraphRAG、GraphDB、vector search 或开发者图调试器；
- 在 UI/presenter 重算 selection、rank、reason、threshold、cap 或 preference conflict；
- 在 renderer 重跑 grounding、`validateReviewReport` 或报告 identity 校验；
- on-demand 单 decision generation、流式生成、多轮追问/M4 chat；
- M7-B SQLite、ReviewSession 持久化、跨重启重开、migration、artifact store、raw
  Mortal/source cache policy；
- 修改 selector policy、M6-C/D1/D2 contracts、prompt、provider retry 或 grounding
  语义；
- 保存完整 prompt/response/raw CoT，或把 raw package/source/cache 暴露给 renderer；
- UI framework、CSS component library、第二 provider、真实 provider 默认测试。

## Grill 与审阅关闭记录

| 压力点 | 冻结结论 | 依据/验证 |
|---|---|---|
| “complete”是否歧义 | analysis status 与 generation status 分栏，永不合并 | M6-C + D2 contracts |
| integrity_failed 是否隐藏 List | 不隐藏/重选；如实展示 counts，只消费 selector 行集 | selector CR-3 |
| tags 的 authority | 只取 `FactorDifference.axis` 五值集合 | F4 / contracts AxisSchema |
| 无差异 reason 是否造 tag | 不造；reason 自身解释该分支 | selector F2 |
| explanation 数字谁解析 | main 在 validated graph/report 上解析为 typed segments | ADR-0003/0005 |
| renderer 是否拿完整 package/report | 不拿；只拿 strict view DTO | ADR-0005 / INV-005 |
| evidence_only 是否失败 | 否，是合法一等 report；证据 UI 完整可用 | D2 E4/E9 |
| provider 失败是否保留旧报告 | 不按原因判断；read-back validated `partial` / `evidence_only` 走成功追加与切换，只有未取得合法报告的操作级失败保留旧报告 | D2 degrade contract / `coach-provider.test.ts` |
| report A/B ref scope | reasoning 只解析当前 overlay；先卸载再装配 | INV-011 / D2 report isolation |
| regenerate 是否覆盖旧报告 | 永不覆盖；验证后追加并显式切 active | COAC-5/7 shared lifecycle |
| 重复 `reportId` 如何寻址 | 不改内容派生 `reportId`；每次合法生成分配唯一 `reportRefId`，允许同 ID 多项且不覆盖元数据 | D2 report identity / COAC-5/7 shared lifecycle |
| 退出时迟到结果 | operation epoch 丢弃，不追加、不切换 | lifecycle matrix |
| M7-A 是否持久化 | 否；仅内存 catalog，durability 归 M7-B | ROADMAP §6 |
| 是否需要新 ADR | 不需要；本规格在 ADR-0003/0004/0005 内实现可逆 feature architecture | governance review |

审阅结论：没有未决产品、契约、安全或生命周期问题；本规格不是 `ready-for-agent`
标签占位，而是 COAC-6 的完整执行契约。COAC-7 仍需把共享生命周期互引落入其独立
持久化规格；在 COAC-5 与 COAC-7 两份规格均冻结合入前，不得启动 COAC-6。
