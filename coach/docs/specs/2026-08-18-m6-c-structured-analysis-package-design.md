# M6-C：StructuredAnalysisPackage 固化规格

日期：2026-08-18
决策来源：[2026-08-18 下一阶段 roadmap 盘问决策记录](../handoffs/2026-08-18-next-phase-roadmap-grill-decisions.md)（D1–D4，含 supersession notes；已定稿）；
路线图口径：[`ROADMAP.md`](../development/ROADMAP.md) §2；
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准；证据分层语义见
[ADR-0003](../adr/0003-evidence-first-coaching-judgment-and-authority-layers.md)；
graph 边界见 [ADR-0004](../adr/0004-context-graph-as-auditable-llm-boundary.md)
与 [Auditable Context Graph Design](./2026-08-18-auditable-context-graph-design.md)；
七值 outcome 契约见 [M6-A4 响应面规格](./2026-08-18-m6-a4-response-surface-design.md)。

## Problem Statement

用户最终要拿到一份"可回放、可审计、可追问"的整盘教练报告，而解释引擎（M6-D2）、
固定复盘 UI（M7-A）、持久化（M7-B）与未来追问（M4）都要求先有一个稳定的
**整盘确定性证据基座**。当前系统可以逐决策跑到 `analysis_ready`，但整盘结果只
以流水账（summary + ledger）形式存在：完整 factor ledgers、FactorDifference、
ModelEvaluation、advisory signals、确定性偏好与证据溯源在跑完后即被丢弃；也没有
版本化的整盘产物可供后续重放、投影、UI 渲染与 LLM 解释引用。

如果没有 M6-C：

- "整盘分析"只是内存中一次性的统计，无法成为 ReviewReport 的证据来源；
- ContextGraph 没有可投影的稳定 substrate（ADR-0004 的直接前置缺失）；
- 解释层只能拿到临时的、可能被后续实现改形的对象，无法建立
  `decisionId + evidenceId` 的引用契约；
- 同一分析结果无法换不同 LLM/prompt 重生成多个 ReviewReport；
- 现有 `StrictAnalysisPackage` 是**逐决策回归/原型产物**，语义与整盘产物不同，
  若被静默改名/扩产实现，会污染两条语义线。

## Solution

新增 `StructuredAnalysisPackage`：一个**整盘、确定性、可审计、可序列化**的分析
产物，是 evidence source of truth。它由整盘 review 的结果一次性固化，包含
record/decision identity、组件版本、七值 outcome、renderer/LLM-safe decision
context 与 KnownGameFacts、canonical event/evidence 引用、CandidateFactorLedger /
FactorFact、FactorDifference、带 evidence class + producer/version 的 advisory
signals、optional DeterministicPreference、ModelEvaluation 与 stable
EvidenceId/provenance。LLM 产物一律不进 package。

用户可见的变化是：整盘分析可以被保存、引用、重放与投影；同一份分析可被未来
UI 审计，也可被不同解释引擎反复消费；"这条判断基于哪些事实/差异/模型评分"在
M6-D 之前就已有稳定的机器可读答案。`StructuredAnalysisPackage` 自身不是 graph，
不替代未来的 ContextGraph，而是后者的确定性投影来源。

## User Stories

1. 作为复盘用户，我想让整盘复盘产出的是一个可保存的完整分析产物，而不是只打印一次的控制台统计，这样我可以事后重新打开同一份分析。
2. 作为复盘用户，我想让分析产物包含每一局、每一个决策窗口的稳定身份（哪一局、哪一巡、哪个决策事件），这样我可以定位到具体的那一手。
3. 作为复盘用户，我想让每个决策都携带七值 outcome，这样我能区分"已分析"、"合法无源行"、"动作不支持"与"完整性故障"，而不是看到含糊的"失败"。
4. 作为复盘用户，我想让分析产物包含每个候选的完整因素账本，这样我可以查看某个候选的牌效、打点、防守、顺位、副露价值分别是什么。
5. 作为复盘用户，我想让分析产物包含候选间的 FactorDifference，这样我可以看到"我的选择 vs Mortal"在哪个维度、差多少、方向支持谁。
6. 作为复盘用户，我想让分析产物包含 ModelEvaluation，这样我可以看到模型对每个候选的评分、偏好动作与 errorGap。
7. 作为复盘用户，我想让分析产物区分确定性事实与版本化估算，这样我不会把 helper 风险刻度误当成可证明事实。
8. 作为复盘用户，我想让分析产物在本地确定性偏好存在时明确记录它、在轴间冲突时为 null，这样我知道哪些结论是规则导出的、哪些要留给教练判断。
9. 作为复盘用户，我想让分析产物的每个证据都带稳定 EvidenceId 与 provenance，这样任何一条因素都能追溯到 canonical 事件或事实引擎。
10. 作为复盘用户，我想让同一份分析产物将来可以被不同 LLM/prompt 重新生成多份教练报告，这样我可以比较不同解释而不重新拉 Mortal 报告。
11. 作为解释引擎（M6-D2）的调用方，我想从 `generateReport(analysisPackage, selectedDecisionIds)` 只读消费整盘证据，这样我不需要重新跑事实管线。
12. 作为未来 ContextGraph 投影（M6-D1）的开发者，我想让 StructuredAnalysisPackage 提供稳定的 record/decision identity 与 provenance，这样 graph 投影是纯确定性转换。
13. 作为未来 Review UI 的开发者，我想让 package 提供 renderer-safe 的决策上下文与 KnownGameFacts，这样渲染层不接触 privileged 原始牌谱或下载 URL。
14. 作为未来 ReviewSession 持久化（M7-B）的开发者，我想让 Session 只引用 analysisPackage 而不内嵌它，这样同一分析包可被复用与重开。
15. 作为维护者，我想让 StructuredAnalysisPackage 只装确定性/来源/模型分析生产链版本，这样任何可复现性问题都能定位到具体组件版本。
16. 作为维护者，我想让 LLM provider/model、prompt version、输出 schema 版本等解释侧版本一律不进 analysis package，这样分析包与解释产物在版本所有权上不混淆。
17. 作为维护者，我想让 package 组件版本按 canonical/replay、mapper/source adapter、fact-engine、factor pipeline、Mortal model/source tag 展开，而不是一个模糊的 pipelineVersion，这样我可以独立升级与审计各组件。
18. 作为维护者，我想让七值 `MortalDecisionOutcome` 原样进入 package，这样 `source_row_not_expected` 与 `no_mortal_entry` 的语义差异在产物中依然可见。
19. 作为维护者，我想让 package 中 `no_mortal_entry` 在绿色验收 run 中计数必须为 0，这样完整性故障不会以"整盘产物已生成"被掩盖。
20. 作为维护者，我想让每个 decision 的 outcome 在 package 中与其 ledger/differences/modelEvaluation 的载荷存在明确的类型级绑定，这样不会出现 outcome 与载荷不一致的产物。
21. 作为维护者，我想让每决策携带全量 ledgers 与全量 differences（不按引用裁剪），这样审计与解释层不需要重新调用事实管线。
22. 作为维护者，我想让 analysis package 与 StrictAnalysisPackage 在 M6-C 期间保持语义可区分、不通过改名或扩展现有类型来假装实现，这样早期原型产物不会污染整盘证据契约。
23. 作为维护者，我想让 package 通过严格 schema 校验（fail-closed），这样非法产物在生成时即被拒绝，而不是等到 UI 或 LLM 消费时才崩溃。
24. 作为维护者，我想让 package 的构建是确定性的：同一 stream、report、engine 与版本输入生成字节等价的产物，这样证据基座可复现。
25. 作为维护者，我想让 package 是 JSON 可序列化且 round-trip 后仍通过校验的，这样它可以安全地保存到 SQLite 或跨进程边界传递。
26. 作为审计视角，我想让每个 evidence 引用在 package 中都有稳定的 provenance 与 producer/version，这样我可以判断一条事实来自 raw replay、确定性管线还是版本化估算。
27. 作为审计视角，我想让 LLM 产物（CoachJudgment/ExplanationBullet 等）被类型系统挡在 package 之外，这样"LLM 不得改写事实"不依赖开发者的自觉。
28. 作为审计视角，我想让解释层只能通过 decisionId + evidenceId 引用 package 内容、绝不内嵌，这样证据与解释物理分离。
29. 作为安全维护者，我想让 package 的 renderer/LLM-safe 上下文只含匿名座位/角色，不携带账号、令牌、下载 URL、原始字节，这样 UI 与未来 LLM 传输默认安全。
30. 作为安全维护者，我想让原始 Mortal 报告与 source cache 不进入 package，这样 privileged source 数据不会通过分析产物扩散到 renderer 或 LLM。
31. 作为实现者，我想让整盘 review 在生成 analysis package 时保留全部逐决策分析载荷（comparison set、model evaluation、factor result），而不是只保留 summary，这样 builder 不需要重复跑事实引擎。
32. 作为实现者，我想让 package builder 直接消费整盘 review 的既有 seam，这样 M6-C 不需要新增一套重复的逐决策分析入口。
33. 作为实现者，我想让 package 的 schema 与既有 contracts（CandidateFactorLedger、FactorDifference、ModelEvaluation、KnownGameFacts）复用同一套 schema，而不是另建宽松旁路。
34. 作为测试维护者，我想用既有真实 fixture + packaged sidecar 验证 package 构建，这样 M6-C 不需要新的外部语料依赖。
35. 作为测试维护者，我想在发布门中验证包不变量（确定性、版本所有权、无 LLM 产物、全量载荷、引用存在），这样 M6-C 完成后后续模块可以信赖这个基座。
36. 作为实现者，我想严格窄切实施 M6-C——第一片只冻结 contract（StructuredAnalysisPackage / RecordAnalysis / DecisionAnalysis / ComponentVersions / EvidenceId），这样不会一上来就做完整生产接线。
37. 作为实现者，我想第二片才接 production assembly（MortalFullGameReview → retain full ready result → DecisionAnalysis → StructuredAnalysisPackage），这样一次计算直接形成 authoritative artifact。
38. 作为实现者，我想避免"runBoundMortalDecisionReview 丢弃 full result、之后再 rerun analysis 拼包"的实现路径，这样不会重复计算、不会引入事实引擎二次调用与不一致窗口。
39. 作为实现者，我想第三片才做 serialization / validator / provenance（JSON roundtrip、stable IDs、version validation、cross-reference validation、no LLM fields），这样 package 在进入 golden 测试前就已有拒绝非法产物的能力。
40. 作为实现者，我想第四片才做 whole-game golden（real canonical fixture + self decisions + response decisions + Mortal + factor pipeline → StructuredAnalysisPackage），并让旧 golden test 继续保护旧 semantic spine 直到新 golden 足够成熟，这样窄切过程不会破坏现有语义基线。

## Implementation Decisions

- **实施切片（严格窄切，不一口气实现整个 M6-C）**：
  1. **Slice 1 — 冻结 contract**：只落地类型与 schema：
     `StructuredAnalysisPackage`、`RecordAnalysis`、`DecisionAnalysis`、
     `ComponentVersions`、`EvidenceId`。不接 production assembly，不写
     builder。
  2. **Slice 2 — 接 production assembly**：`MortalFullGameReview` →
     retain full ready result → `DecisionAnalysis` →
     `StructuredAnalysisPackage`。**禁止**现在的
     `runBoundMortalDecisionReview` 把 full result 丢掉、之后再 rerun
     analysis 来拼包。一次计算，一次形成 authoritative artifact；能避免
     就绝不重新计算。
  3. **Slice 3 — serialization / validator / provenance**：JSON roundtrip、
     stable IDs、version validation、cross-reference validation、no LLM
     fields。校验器在此切片落地，拒绝不合法的包。
  4. **Slice 4 — whole-game golden**：real canonical fixture + self
     decisions + response decisions + Mortal + factor pipeline →
     `StructuredAnalysisPackage`。现有 golden test 继续保护旧 semantic
     spine，直到新的 production golden 足够成熟再讨论迁移；不为"统一漂亮"
     马上删除旧测试。
- **产物定位**：`StructuredAnalysisPackage` 是整盘确定性/可审计分析产物，是
  evidence source of truth。它是 ContextGraph 的投影来源（ADR-0004），但自身
  **不是 graph**，也不得设计成 graph；v1 不新增第三个持久化 canonical artifact，
  ReviewSession 仍只引用 StructuredAnalysisPackage 与 ReviewReport。
- **七值 outcome 契约（D1 已被 A4.0 取代后的现行口径）**：package 中的
  decision outcome 沿用七值 `MortalDecisionOutcome`：
  `analysis_ready` / `unsupported_action` / `source_row_not_expected` /
  `no_mortal_entry` / `binding_mismatch` / `model_output_incomplete` /
  `analysis_blocked`，不缩水。`source_row_not_expected` 是合法状态（本地候选
  数 = 1，源行查找前判定）；`no_mortal_entry` 保持完整性故障语义，绿色验收
  run 中必须为 0。
- **解释与分析物理分离（D2）**：`StructuredAnalysisPackage` 只装确定性内容
  （identity、组件版本、outcome、ledgers、differences、preference、
  modelEvaluation）。`CoachJudgment` / `ExplanationBullet` / `CoachInference`
  等 LLM 产物放独立 `ReviewReport`，经 `decisionId + evidenceId` **引用**包
  内容、绝不内嵌。类型结构上保证 LLM 产物无法改写分析包。
- **载荷粒度（D3）**：每决策携带**全量** ledgers 与 differences，不按引用
  裁剪。本地分析本地存储，SQLite 时代 MB 级整盘载荷可接受。
- **组件版本所有权（D4 及其 supersession）**：版本字段按组件展开，不用单一
  `pipelineVersion`。package 只装**确定性/来源/模型分析生产链**版本：package
  schema 版本、canonical/replay 版本、mapper/source adapter 版本（适用时）、
  fact-engine identity/version、factor pipeline 版本、Mortal source/model
  identity/tag，以及其他可复现性实际需要的确定性生产者版本。**LLM
  provider/model、prompt version、输出 schema 版本、validator/generation
  版本归 ReviewReport**。架构性质：同一 `StructuredAnalysisPackage` 可被不同
  LLM/prompt 重生成多个 `ReviewReport`。
- **包内容清单**（来自 ROADMAP §2 M6-C）：
  - record / decision identity；
  - component versions；
  - 七值 decision outcome；
  - renderer / LLM-safe decision context 与 `KnownGameFacts`；
  - stable canonical event / evidence references；
  - `CandidateFactorLedger` / `FactorFact`；
  - `FactorDifference`；
  - advisory signals，带 evidence class + producer/version；
  - optional `DeterministicPreference`；
  - `ModelEvaluation`；
  - stable `EvidenceId` / provenance。
- **决策载荷一致性**：package 中每个 decision entry 的 outcome 与其载荷按类型
  级约束绑定：只有 `analysis_ready` 决策携带完整 ledgers / differences /
  modelEvaluation；失败/跳过决策携带其 reason/proof 与空载荷，不得伪造
  "有分析"的形态。
- **确定性**：`buildStructuredAnalysisPackage` 必须是纯投影式构建——同一个
  stream、report、engine 与版本输入生成相同产物；不引入时间戳（版本冻结时间
  除外，使用显式 `frozenAt`）、随机数、Map/Set 迭代顺序等非确定来源；排序
  规则沿用既有 canonical 排序约定。
- **严格校验**：package 用严格 schema（fail-closed）校验；引用完整性
  （evidenceIds 必须能在包内 evidence registry/canonical refs 中解析）、
  版本字段非空、无 LLM 产物字段、无 privileged 原始载荷。校验失败即拒绝
  产物，不降级。
- **renderer / LLM-safe 上下文**：package 的 renderer-safe 上下文只含匿名
  座位/角色与渲染需要的归一化字段；不含账号 ID、昵称、令牌、牌谱下载 URL、
  原始字节、cookie。`KnownGameFacts` 以归一化事实形式存在，与 privileged
  source 数据分离。
- **与 `StrictAnalysisPackage` 的边界**：现役 `StrictAnalysisPackage` 是早期
  逐决策回归/原型产物（`NormalizedDecision` + scene + factor buckets +
  evidence registry + teaching rules）。M6-C **不得**通过静默改名/扩展现有
  类型来假装实现 `StructuredAnalysisPackage`；两个概念在 M6-C 实现期间必须
  保持语义可区分（词汇表见 CONTEXT.md）。`StrictAnalysisPackage` 及其
  validator 保持原样继续服务现有 pipeline/测试。
- **新增/修改模块（按切片）**：
  - Slice 1：contracts 侧新增 `StructuredAnalysisPackage` /
    `RecordAnalysis` / `DecisionAnalysis` / `ComponentVersions` /
    `EvidenceId` 的 schema（严格 zod，JSON round-trip 稳定）与相关类型；
    只冻结 contract，不接 production assembly。
  - Slice 2：整盘 review 结果扩展——`runMortalFullGameReview` 在
    `coverage_ready` 时保留每个走到 review 阶段的决策的完整逐决策载荷
    （comparison set、model evaluation、factor result），供 builder 固化；
    reasoning 侧新增 package builder（确定性构建，直接消费该结果）。
    失败/跳过决策仍只保留 ledger 行。**不得**保留"先丢 full result、
    之后再 rerun analysis 拼包"的实现路径。
  - Slice 3：reasoning 侧新增 package validator（JSON roundtrip、
    stable IDs、version validation、cross-reference validation、no LLM
    fields）；导出面新增 package 构建/校验入口。
  - Slice 4：whole-game golden 测试与回归门；旧 golden test 继续保留，
    保护旧 semantic spine。
- **接口形状（概念，不写文件路径与代码）**：
  - 构建入口接受整盘 review 的 `coverage_ready` 结果、canonical stream、
    report 身份信息与组件版本注入；返回校验后的
    `StructuredAnalysisPackage` 或 fail-closed 错误。
  - `StructuredAnalysisPackage` 至少含：`packageId`、`schemaVersion`、
    `record`（game identity、self seat 匿名化）、`componentVersions`、
    `decisions`（每决策：identity、surface、outcome、facts、context、
    ledgers、differences、advisorySignals、preference、modelEvaluation、
    evidence refs/provenance）。
  - `ReviewReport` 侧类型只定义引用字段（decisionId/evidenceId），不在本
    里程碑实现。
- **版本注入原则**：组件版本从既有常量/元数据注入（canonical schema、
  decision snapshot、replay、mapper、Mortal adapter、fact-engine identity、
  factor pipeline version），不从调用方随意传字符串；builder 负责收集与
  校验一致性（如 report 的 adapter/engine 版本与 package 记录一致）。
- **隐私边界**：raw Mortal/source cache 仍属 privileged-process data，不进
  package（决策 H6 延续）；package 的 provenance 用于本地审计，不携带 raw
  payload。

## Testing Decisions

- **好测试只测外部行为**：给定 pinned 报告 fixture + 真实 sidecar →
  `runMortalFullGameReview` 产出 `coverage_ready` → builder 产出通过校验的
  `StructuredAnalysisPackage`；给定被篡改的 review 结果（缺失引用、版本
  为空、含 LLM 字段、载荷与 outcome 不一致）→ validator 拒绝。不测内部
  函数、不测实现细节。
- **Seam（优先现有，只新增一个）**：
  - 最高 seam = **整盘 review E2E**（`runMortalFullGameReview`，M6-A 已建立
    的发布级 seam）：M6-C 扩展该 seam 的返回载荷，使完整逐决策分析可被
    package builder 固化。发布判断只依赖这个 seam。
  - 新增 seam = **`buildStructuredAnalysisPackage`**：直接消费整盘 review
    结果，是 M6-C 唯一的构建入口；不新增第二套逐决策分析路径。
- **按切片测试**：
  - Slice 1 只测 contract：schema 可解析/拒绝最小合法与非法样例；类型与
    既有 contracts 复用同一 schema，不另建宽松旁路。
  - Slice 2 测 production assembly：整盘 review 的 `coverage_ready` 结果
    携带完整逐决策载荷；builder 直接消费该结果，**断言不存在 rerun
    analysis 的路径**（测试构造"已经算好的 review 结果"即可拼包，且拼包
    过程不调用事实引擎、不访问 Mortal）。
  - Slice 3 测 serialization / validator：JSON roundtrip 后仍通过校验；
    stable IDs 确定；version validation 拒绝空版本/解释侧版本；cross-
    reference validation 拒绝悬空 evidenceId；no LLM fields 拒绝含
    CoachJudgment/ExplanationBullet 的包。
  - Slice 4 测 whole-game golden：real canonical fixture + self
    decisions + response decisions + Mortal + factor pipeline → 校验通过
    的 `StructuredAnalysisPackage`；此测试成熟前，旧 golden test 继续作为
    旧 semantic spine 的保护门，不提前删除。
- **Prior art**：
  - `golden-vertical-slice`：真实 fixture + packaged sidecar 走通
    "fixture → canonical → snapshot → KnownGameFacts → comparison →
    factor pipeline → 产物校验"的黄金链路；M6-C 测试沿用同一 fixture 与
    sidecar 口径。
  - `public-pipeline` / `strict-analysis-package`：JSON round-trip 后
    validator 仍通过的产物契约测试。
  - `mortal-full-game-review`：整盘 review 的 binding/守恒/outcome 纪律测试；
    M6-C 只扩展其输出，不改变其守恒语义。
  - contracts 中 `CandidateFactorLedger` / `FactorDifference` /
    `ModelEvaluation` / `KnownGameFacts` 的 schema 测试作为 package schema
    组合的既有基础。
- **必测不变量**：
  - 每决策载荷与 outcome 一致（`analysis_ready` 有完整载荷，非 ready 无伪造
    载荷）；
  - 版本字段非空且不含 LLM 解释侧版本；
  - package 内无 CoachJudgment/ExplanationBullet/LLM 产物字段；
  - evidenceIds 全量可解析；
  - `no_mortal_entry` 计数在绿色 run 为 0，`source_row_not_expected` 携带
    单候选 proof；
  - 同一输入两次构建产物确定一致（深度相等/哈希稳定）；
  - JSON round-trip 后仍通过 validator。
- **回归门**：现有 `mortal-full-game-review` 全部测试继续通过；扩展返回
  载荷不得改变 summary/ledger/sourceCoverage 的既有形状与数值；H2 连续性
  复跑（125 自摸决策 / 113 analysis_ready / 12 source_row_not_expected /
  0 no_mortal_entry）不回归。
- **真实 sidecar 依赖**：与 golden vertical slice 相同，使用仓库内 packaged
  sidecar；不要求新的外部语料或 Mortal 提交。

## Out of Scope

- M6-D1 Typed Context Graph substrate（projection）、M6-D2 Graph-grounded
  Coach + Validator、`GraphContextSlice` 与 LLM 传输。
- `DeterministicReviewSelector`（在 M6-C 之后、M6-D2 之前实现，非本规格）。
- `ReviewReport` / `CoachJudgment` / `ExplanationBullet` 的具体 schema 与
  生成逻辑（本规格只冻结"引用不内嵌"的边界）。
- M7-A 固定 review UI、M7-B ReviewSession 持久化与 SQLite、产品内 Mortal
  缓存策略。
- M6-B Akagi。
- `StrictAnalysisPackage` 的迁移、改名或扩展（本规格明确禁止静默合并）。
- 旧 golden test 的删除或迁移：在新的 production whole-game golden 足够
  成熟并完成显式评审之前，旧 golden test 继续作为旧 semantic spine 的
  保护门。
- raw Mortal 报告缓存、eviction/磁盘期限（M7-B）。
- ContextGraph 的 graph validation 规则（M6-D1）。
- 任何 Neo4j / GraphRAG / embeddings / vector DB / PageRank / community
  detection / causal engine。
- M2-next 教学能力扩充。

## Further Notes

- D1 原文的"六值 + 按需增加"已被 M6-A4.0 supersede 为七值契约；本 spec 只
  承认七值口径，不再使用"按需增加"。
- D4 原文列举的 `explanationPrompt` 版本已被 supersession note 移出 package；
  版本所有权以 ROADMAP §2 M6-C 为准。
- 本规格不改变 M6-A4 已冻结的 outcome 语义、守恒不变量与 coverage gate；
  M6-C 是这些产物的固化层，不是新的分析层。
- 历史 handoff/plans/specs 原文不动；如有冲突以本 spec 与 ROADMAP §2 为准。
- 术语一律以 `coach/CONTEXT.md` 词汇表为准；与既有 ADR 矛盾处显式指出，不
  静默覆盖。
