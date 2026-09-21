# M7-A Whole-game fixed review UI 实现规格

日期：2026-09-21
状态：**SPEC FREEZE（产品/UI）：P1–P6 已裁决，2026-09-22 冻结；R3-P2-1 技术候选已落盘，须经最终候选 HEAD 的独立评审后才可判定技术执行门 PASS**
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
  `validateReviewReport`、获准的只读组合入口 `composeReviewReadBackContext` 与唯一生产
  生成入口 `generateReviewReport`。`appendReasoningOverlay` 虽为既有包根导出，仍是
  generation internal，desktop production 不得直接导入；M7-A 也不导入内部 assembler、
  prompt/provider mapper 或 id helper。
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

1. **Overview** 首屏突出 selector 入选数量与进入 List 的入口；analysis status、报告
   generation status 与解说可用数量保持可见。七值 outcome counts 与逐行 explanation
   status counts 放入默认折叠、可展开的详情，两组状态仍分开表达。
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
6. MVP 只提供首次生成解说；重新生成和历史报告切换不提供用户入口。待解说基模与
   知识库均可由用户自定义，并能展示报告生成时的教练配置快照后，再启用这些入口。
   下文共享生命周期的冻结语义保持不变，能力预留不等于本期用户功能。

不引入 UI 框架，不把 ContextGraph 画成图，不新增第三份 truth。

## User Stories

1. 作为复盘用户，我想先看到本盘有多少处入选复盘并进入条目列表，同时看清分析
   完整性和教练解说可用情况；需要时展开完整计数，来源完整性异常始终显著可见。
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
8. **后续启用场景，MVP 无用户入口**：作为复盘用户，我想重新生成得到一个新的不可变报告实例引用；即使连续两次
   生成得到同一内容派生 `reportId`，两次生成仍可在目录中分别寻址，且早先实例的
   展示/审计元数据不被覆盖。即使 provider 请求失败，只要生成链仍产出并读回验证通过的
   `partial` / `evidence_only` 报告，也应追加新引用并切换到该引用。只有 package
   读取、报告 read-back 或 identity 校验等操作级失败导致未取得
   合法报告时，才继续看到原 active report，这样降级结果不会被误判为操作失败，真正
   的失败也不会丢失当前结果。
9. **后续启用场景，MVP 无用户入口**：作为复盘用户，我想在报告 A/B 间切换时只看到当前报告的 judgment、explanation
   和 inference，这样相同 local id 也不会串内容。
10. 作为安全审查者，我想让 renderer 永远拿不到 raw package bytes、raw source/Mortal
    cache、key、完整 prompt/response、raw CoT 或文件路径。
11. 作为实现者，我想让 preload 和 main 两端解析同一个 strict DTO contract，这样
    IPC 扩展不会靠 TypeScript 类型声明自我证明。
12. 作为未来 M7-B 实现者，我想复用同一组生命周期状态、事件顺序与 ref 语义，
    这样持久化不会再创造第二套 active-report 规则。

## Information Architecture

### MVP 报告操作范围（P6，2026-09-22 产品 owner 裁决：暂不提供重新生成/切换）

- 在用户不能自定义解说基模与知识库时，重复生成和比较多份报告不是本期核心流程。
  MVP 不展示“重新生成解说”、历史报告选择器、A/B 切换，也不放入“更多”菜单或
  以禁用按钮占位；不设置快捷键或自动重新生成来绕开此范围。
- 无 active report 时保留“生成教练解说”；生成中防止重复提交，退出/取消仍遵守
  已冻结生命周期。操作级失败且未取得合法报告时，允许再次尝试首次生成。
  一旦取得合法 `complete` / `partial` / `evidence_only` 报告，均视为已有报告，
  MVP 不以“补全解说”或“重试失败条目”名义再次生成；证据继续可读。
- 后续入口启用的产品前提是**解说基模和知识库都支持用户自定义**，并能随每份报告
  展示**生成时的教练配置快照**。快照须帮助用户辨认当时使用的基模和知识库版本/选择，
  不可用当前配置冒充历史配置；具体安全投影与版本契约在相关功能规格中闭合。
  不为本期新增设置页、知识库管理、配置快照 schema 或持久化实现。
- 本期没有用户报告比较界面。将来启用时，优先以教练配置快照解释报告差异，而不是
  仅靠 A/B、生成次序或内部 ID；不声称更换基模/知识库后结果必然不同或更优。
- 共享生命周期、immutable refs、合法降级与 overlay isolation 已冻结，完整保留为
  内部契约及回归边界。相关场景不再作为 MVP 用户入口的交付要求；首次生成仍使用
  同一条获准的 `composeReviewReadBackContext` 已验证报告装配路径。

### Overview

#### 首屏优先级（P1，2026-09-21 产品 owner 裁决：A）

- 视觉主区突出 `selectedCount` 和“查看复盘条目”入口；入口进入既有 List，不跳过
  List 自动打开某条 Detail，也不改变 selector 的行集、排序或入选含义。
- 首屏常显分析完整性、报告生成状态及解说可用数量（`readyCount` / `selectedCount`）；
  分析状态与解说状态分别标明。无 active report 时按 `not_generated` 表达，不把
  零 ready 说成生成失败；空 selection 保留既有明确 empty-state，不暗示没有失误。
- 七值 outcome 明细和逐行 explanation status 计数分别置于默认折叠的详情区域；
  展开后所有固定键与零值均可见。折叠只改变展示密度，不删减 DTO 或计数。
- 分析降级/完整性缺口提示不藏在折叠区；`integrity_failed` 的显著警示位于复盘入口
  之前。入选数量不称为错误数，不用“生成成功”代替两组状态。
- 本裁决只冻结 Overview 信息主次与上述默认折叠行为。示意中的模拟数值、颜色、
  “值得回看”等措辞不是新增真值；状态本地化遵循下方 P5 裁决。

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
失败则使用准确的固定本地化文案，不做乐观改写，也不展示技术原名。

#### 用户状态表达（P5，2026-09-22 产品 owner 裁决：技术状态不展示给用户）

技术枚举与错误码留给开发者。Overview、List、Detail、通知及用户可展开的详情
均只展示用户能理解的文案、原因与当前可执行操作；不得把代码藏入折叠区、悬浮提示
或辅助技术标签继续暴露。DTO/验证/开发诊断仍保留原技术值，状态语义与合法性不变。
这比示意 A 的“折叠后显示代码”更严格；不新增面向用户的开发者状态面板。

以下为落实本裁决的固定本地化映射（左列仅供实现者读取）：

| 范围 | 内部状态 | 用户文案 |
|---|---|---|
| 分析 | `complete` | 决策比较齐全 |
| 分析 | `degraded` | 部分决策未作完整比较 |
| 分析 | `integrity_failed` | 分析来源完整性未通过校验 |
| 解说报告 | `complete` | 入选条目的解说齐全 |
| 解说报告 | `partial` | 部分解说可用 |
| 解说报告 | `evidence_only` | 仅证据可用 |
| 解说报告/条目 | `not_generated` | 尚未生成教练解说 |
| 条目 | `ready` | 解说可用 |
| 条目 | `provider_unavailable` | 解说服务未就绪 |
| 条目 | `request_failed` | 解说请求未成功 |
| 条目 | `invalid_output` | 解说未通过校验 |

- 两组状态始终分开；分析齐全不保证解说齐全，解说缺失也不抹掉证据。报告文案配合
  解说可用数量；空 selection 仍显示“当前策略未选出复盘条目”，不暗示发生服务故障。
- 分析详情中的七组计数分别使用“可作决策比较”“暂不支持的行动”“单一候选，无需
  模型比较”“缺少对应的模型分析”“模型分析与决策对应关系未通过校验”“模型分析
  不完整”“分析条件未满足”。全部固定键/零值仍保留，不显示原 enum 名。
- `degraded` 必须结合实际 outcome 解释原因：合法单候选也会导致该状态，应明确
  说明“只有一种候选，无需模型比较”；不得一律翻译为“数据缺失”或“分析出错”。
- 完整性警示明确说明分析来源缺口/对应校验问题；仅呈现实际仍可浏览的条目与证据，
  不提示未经证实的修复手段，不把安全校验未通过写成普通无解说。
- 生成未取得合法新报告时，提示“未能生成新解说，仍显示原报告”；无原报告时提示
  “未能生成解说，仍可查看已有证据”。报告切换失败提示“未能打开所选报告，仍显示
  原报告”。详细原因由固定错误码映射为安全的用户文案，禁止原码或上游错误原文回显。
  以上操作失败文案不得用于已取得合法 `partial` / `evidence_only` 报告的成功分支。

### List

#### 信息密度（P2，2026-09-21 产品 owner 裁决：有条件选择 B）

- 采用紧凑表格；产品 owner 认为当前字段规模下，列对齐比摘要行更清晰、有组织，
  重点更易辨认。该选择以 List 信息量不大幅增加为前提。
- 保持六组展示列：局况/决策窗口（含 rank）、我的行动、Mortal 偏好、
  模型分差/固定入选原因、差异维度 tags、解说状态/详情入口。沿用全部现行字段，
  不因紧凑布局省略入选原因或失败状态；模型分差不称为胜率或预期损失。
- List 负责定位与比较条目；完整候选评分、Coach 判断/解说正文与 evidence/provenance
  留在 Detail，不持续追加成新列或行内长文。若未来确需显著增加 List 信息量，
  须重新裁决密度，不能把本次选择视为允许表格无限扩展。
- 数值列对齐，行动使用可辨识牌面及动作文字，tags/长原因允许换行；Mortal 并列
  偏好不得为压缩行高而静默丢弃。窄窗可转为带字段标签的堆叠布局，保留相同字段
  与顺序，不以缩小文字到难读或裁切内容实现紧凑。

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

#### 视觉与信息层级（P3，2026-09-22 产品 owner 裁决：B）

- 上方紧凑并列对照“我的选择 / Mortal 偏好”，随后以更高视觉权重呈现
  Coach 建议及紧随其后的解说。阅读顺序保持实际行动 → 模型偏好 → 教练判断 →
  解说 → 证据，不因视觉强调改换权威来源或章节顺序。
- 实际行动明确标为牌谱记录，Mortal 明确标为模型评估，Coach 明确标为教练综合判断。
  Coach 更醒目是教学阅读优先级，不表示其可覆盖硬证据，也不把 Mortal 叫作教练建议。
- Coach 推荐、confidence 与依据入口可辨；Mortal 并列偏好及 score method/unit
  保留，不能为紧凑而删减，也不得把策略概率称为胜率。
- Coach 与 Mortal 不同时，各自展示真实结果及 Coach 的有据解说，不自动改为一致、
  不用颜色将模型分歧直接判为用户错误。窄窗按相同顺序堆叠。
- 解说不可用或尚未生成时，Coach 区显示固定状态说明，不用 Mortal 内容冒充 Coach，
  不保留其他报告的 Coach 内容；实际行动、模型评估及合法证据继续可读。
  Evidence 默认展开层级按下述 P4 裁决执行。

#### Evidence 展开与可追溯明细（P4，2026-09-22 产品 owner 裁决：B + 明细可达）

- 硬证据、参考信号、教练推断分组的证据摘要默认展开；各项生产者/版本、显示引用、
  父项关系等来源信息默认折叠，可按项展开。缺少解说不关闭已有证据；无当前报告
  推断时显示明确空状态，不沿用旧报告内容。
- 对已有可信细项支撑的汇总值，尽可能提供到构成明细、计算口径和来源的可读路径。
  “摘要展开”不能止步于一个无法检查的总数；既有安全 allow-list 仍适用于全部层级，
  不展示 raw graph、任意 payload 或原始 provider/source 数据。
- **有效进张**在当前宽松布局中默认直接列出牌面及每种剩余张数，并保留种数与总张数，
  让用户直接对照两种行动的进张组成。空间不足时允许换行或显式点击展开；鼠标悬浮
  可以补充说明，但不能成为获取明细的唯一方式，键盘与触屏均须可达。
- 每组明细必须标明对应候选行动和同一统计范围/口径，例如 overall 与某个手牌族
  不得混用，牌种数不得冒充张数；剩余数量按上游已验证的可见牌/剩余计数假设表达，
  不声称为实际牌山中必然可摸到的张数。
- 当前账本已有 `efficiency.ukeire_remaining` 与 `overall_effective_tiles_remaining`
  的 `tile_counts`（`tile34`、`count`）；hand-structure 也有按 family 的牌种与
  remaining status。主进程从同一候选、同一 decision 的已验证证据投影明细，
  由 strict renderer DTO 承载牌面、逐牌张数/可用状态、范围/口径与安全 display refs。
  renderer 只呈现，不从总数反推、不重跑牌理计算、不混合不同 family 重复计数。
- 上游只有牌种、没有可信数量时，展示牌种并注明“剩余张数未知”；只有总量时明确
  “明细未提供”；已知为零与未知必须区分。理论未见枚数不得标成已扣除公开可见牌的
  live count。缺失使用合法 unavailable 状态；不一致/越权的 DTO 仍按既有规则拒绝。
- 本裁决增加的是现有证据的展示深度，不扩展 deterministic 分析能力，不向 List
  增加明细列。示意牌组/数值不构成生产证据或新增权威规格。

Detail 使用固定章节，不因 LLM 状态改变权威顺序：

1. **你的选择**：来自 `normalizedDecisionContext.actualAction` 与 comparison
   correspondence；不存在时显示固定 unavailable 状态，不猜动作。
2. **Mortal 偏好**：来自 `modelEvaluation.preferredActions` 与对应 candidate scores；
   多个并列偏好全部展示，保留 score method/unit，不把其称为“教练建议”。
3. **CoachJudgment**：只从当前 active report、当前 decision 的
   `CoachJudgment` 节点投影 recommendation/confidence/premise refs。
4. **Explanation**：只显示当前 report 中当前 decision 的 Explanation；事实占位符
   由 main presenter 从 `composeReviewReadBackContext(package, report)` 返回的已验证
   current-report context 解析，
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

以上是字段语义冻结，不要求照抄 TypeScript 排版。MVP snapshot 明确不含完整
`reportCatalog` / `reportRefs` 历史；provider/model/generatedAt 当前页面不呈现，因此也不
进入 DTO。完整 immutable report refs 只留在 main lifecycle controller。所有嵌套 object `.strict()`；数组有
确定顺序；`Renderer*Dto` 只含渲染需要的 typed action/label/value/ref 字段。严禁加入
以下字段：package/graph/report 整体、任意文件路径/URL、原始牌谱或 source/Mortal
payload、账号标识、credential、prompt/response、raw CoT、上游异常 prose。

### Main presenter

在 desktop 主进程新增窄 presenter/controller，输入为 package、selector result 与可选
active ReviewReport。它只能通过 reasoning 包根的获准
`composeReviewReadBackContext(package, report)` 取得 base/current graph 与 ref resolver；
不得直接导入 `appendReasoningOverlay`。它负责：

- 复核 `packageId` / selector `analysisPackageId` / report `packageId` 同源；
- active report 存在时，只消费 read-back seam 返回的 validated current-report context；
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
| `activateReport`（后续用户能力预留） | `{packageId, reportRefId}` | `FixedReviewSnapshotDto` | 按唯一生成实例引用执行完整 overlay 切换序列；P6 启用前不接用户入口 |
| `leaveReview` | `{packageId}` | fixed acknowledgement | 使在途 operation epoch 失效并释放 view state |

`operationId` 由 main/renderer 协议使用的 opaque id，不进入 ReviewReport。每个请求均
校验 trusted sender、参数个数与 strict schema；preload 对返回值再次 parse。错误只暴露
冻结项目错误码，不透传 filesystem/provider/parser prose。

按 P6，本期 preload/renderer 的用户操作面仅接入首次生成；`activateReport` 的
用户 IPC 暴露/接线延期，不为预留功能扩张本期 renderer API。内部 controller 的
报告引用、装配/切换语义和回归继续保留。IPC 中的错误码由用户界面按 P5 映射为文案。

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
- reasoning ref 只通过 read-back seam 在 `activeReportRef` 指向的单份 overlay 内解析；package evidence
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

本表使用实现者状态名，用户文案以 P5 为准。涉及已有报告后的 regenerate 与
用户主动 switching_report 的行是后续启用行为，P6 冻结期间不从 MVP 用户入口触发。

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
- List selection、展开/收起与后续启用的报告切换全部可用键盘完成；focus 在重渲染后落到可预测
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

- DTO strict schema 接受上述投影，拒绝未知字段、完整 package/report/graph、完整
  `reportCatalog` / `reportRefs` 历史、路径/URL、
  prompt/response/key-like 字段与未知状态。
- main controller 内部 catalog 允许两项拥有相同 `reportId` 但必须拥有不同
  `reportRefId`；重复 `reportRefId`、无法解析到唯一内部项的 `activeReportRefId` 或以
  `reportId` 代替实例引用均 fail closed。renderer snapshot 只得到当前 active ref/status。
- Overview counts 精确等于 package decisions；0 值键不缺失；analysis 与 generation
  status 不互相推导。
- 用户状态文案按 P5 映射；可见文本、展开区、悬浮与辅助技术标签均不出现技术状态码。
  覆盖合法单候选导致 degraded、完整性失败、部分解说、仅证据、未生成、空 selection
  及无合法新报告的操作失败；原因与可执行操作准确，禁止原始错误文案回显。
- Overview 首屏主区呈现入选数量和 List 入口；两组状态与解说可用数量默认可见，
  两组明细默认折叠且展开后保留全部键/零值；完整性异常提示始终可见，
  `integrity_failed` 警示先于入口。覆盖 `not_generated` 与空 selection 的准确表达。
- List 行集/顺序/reason 精确等于 selector；打乱输入 selected 或重复 rank fail closed；
  tags 只由五值 axis 集合按固定序产生。
- List 默认使用上述六组列的紧凑表格；长原因、多 tags、Mortal 并列偏好和失败状态
  均完整可读，窄窗重排不丢字段。List 不增加 Coach 正文、完整候选评分或证据展开。
- Detail action/model/judgment 分层正确；placeholder segments 的值可追到当前 decision
  evidence；悬空、跨 decision、跨 report refs 拒绝整个 detail。
- Detail 呈现上方实际/模型紧凑对照、下方突出的 Coach 建议与解说；来源文本可辨。
  覆盖 Coach/Mortal 推荐不同、Mortal 并列偏好及无可用解说，窄窗保持阅读顺序，
  不混用推荐、不丢评分单位、不用 Mortal 填充缺失 Coach。
- `partial`/`evidence_only` 即使没有 explanation 也返回 evidence detail。
- Evidence 默认展示摘要、折叠来源；有效进张的牌面/逐牌张数与上游同候选、同口径
  `tile_counts` 逐项一致，去重后的明细总和与展示总量一致。覆盖未知张数、零张、
  只有总量无明细、family/overall 范围、窄窗及无鼠标操作；不得制造缺失数据。

### IPC / security tests

- trusted sender、参数个数、request/response 双端 schema parse；任一非法输入返回固定
  code，不泄漏上游 prose。
- renderer/preload 不导入 reasoning/source/provider/fs/network；BrowserWindow 保持
  `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- IPC 响应递归扫描禁止 credential、raw cache/source bytes、account identity、完整
  prompt/response、raw CoT 与本地路径。
- architecture checker 允许 presenter 静态 named import
  `composeReviewReadBackContext`，阻止其直接导入 `appendReasoningOverlay`、第二生成入口、
  provider/assembler/generation internals、renderer privileged import 与 deep import。

### Lifecycle / renderer tests

以下 regenerate、重复生成实例与 A→B→A 场景继续在内部 controller/presenter 层
验证冻结契约，不要求本期用户能触发。renderer 须验证首次生成入口、无合法报告时
可重试，以及存在任何合法报告后不出现重新生成/切换入口（含菜单、快捷键与占位）。

- 生成中 `leaveReview`：abort-capable fake 收到 cancel；non-abortable fake 迟到成功也不
  追加 ref、不触发 view 更新。
- provider 两次 503 后返回的 read-back validated `evidence_only` 报告走完整成功序列，
  追加新 ref 并切换 active report；不得因传输失败原因保留 A。
- 连续两次生成相同的合法报告：保留 `review-report.test.ts` 已有的“不同
  `generatedAt` 不改变 `reportId`”回归；controller tests 额外断言两个唯一
  `reportRefId`、两条未覆盖的 main-owned metadata、按 ref 的 A→B→A 可寻址性与
  active DTO 一致；DTO 不含完整历史。
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
4. **IPC/preload**：收窄现有 generate 返回并增加 open/detail/cancel/leave；保持
   唯一生成 seam。用户主动 switch 的 IPC/preload 接线按 P6 延期。
5. **Renderer policy + DOM**：纯 view reducer/render functions 后接事件；完成 Overview
   → List → Detail 与 accessibility tests。
6. **Integration**：四状态 fixture E2E、首次生成/无报告重试、生成中退出、延期入口
   不可见；内部 controller/presenter 继续覆盖失败 regenerate、A→B→A。运行全部
   architecture/security/build gates。

## 验收门

- MVP 首次生成可达；无合法报告时允许重试；已有合法报告后无重新生成或报告切换
  的用户入口。基模/知识库自定义与教练配置快照只作为后续启用条件，不进入本期实现。
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

- MVP 的重新生成/历史报告切换用户入口、解说基模和知识库自定义界面、教练配置
  快照的新 schema/存储；共享生命周期和内部隔离回归仍按冻结契约保留；
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

### 产品收口记录（2026-09-21 起，继续现有 candidate）

本轮基于 PR #14 candidate `5c43f399977c54dcc04b2620e16f4ce1980896dc` 收口，
不重新讨论 F1–F4 / H5–H6、原生 DOM、三层导航、selector/tags authority、安全 DTO、
合法降级报告或 A/B overlay isolation。只裁决 repository 无法推导的产品/UI 选择；
每题由产品 owner 回答后立即更新本规格对应条款，不创建第二份规格。
产品 owner 要求后续每题在提问时同时提供简单、可比较的网页示意；示意采用明确标注的
模拟数据，辅助裁决，不替代本规格。预览切换不算产品裁决，收到明确回答后才冻结。

| 编号 | 产品问题 | 状态/裁决 |
|---|---|---|
| P1 | Overview 首屏优先级 | **已冻结：A，复盘入口优先**；首屏常显两组状态，完整计数默认折叠，异常提示保持显著 |
| P2 | List 信息密度 | **已冻结：B，紧凑表格**；条件是当前字段规模不大幅增加，新增详细信息优先放 Detail |
| P3 | Detail 的实际选择 / Mortal / Coach 视觉与信息层级 | **已冻结：B（2026-09-22）**；实际/Mortal 紧凑对照，随后突出 Coach 建议与解说；来源与权威边界保持可辨 |
| P4 | Evidence 默认展开层级 | **已冻结：B + 明细可达（2026-09-22）**；摘要展开、来源折叠；进张优先直接列牌及各自张数，窄窗可显式展开，悬浮不作唯一入口 |
| P5 | 技术状态的用户可理解文案 | **已冻结（2026-09-22）**：技术状态留给开发者，用户界面包括折叠详情均不展示代码；只显示本地化状态、原因与可执行操作，按上方 P5 映射落实 |
| P6 | MVP 是否显式暴露 Regenerate / A-B report switching | **已冻结（2026-09-22）**：暂不提供用户入口，仅保留首次生成；待基模与知识库均可自定义、可展示生成时教练配置快照后再启用；既有生命周期与隔离契约保持冻结 |

### 独立技术阻塞与执行门槛

PR #14 Review Loop round 1 的失败/合法降级分支与 round 2 的重复报告身份问题，
已分别在 `cd7c633`、`5c43f39` 修订。Round 3 的 **R3-P2-1** 以 reasoning-owned
`composeReviewReadBackContext` 收口：它验证已有 package/report、重新投影 base graph、
只装配所选报告 overlay，并提供 current-report、same-decision ref resolution；它没有
provider、prompt、selection、retry、generation、publication 或 mutation capability。
architecture checker 允许 desktop presenter 消费该 seam，同时继续拒绝其直接导入
`appendReasoningOverlay`、provider/assembler/generation internals；
`generateReviewReport` 仍是唯一 generation authority。

当前状态：**SPEC FREEZE：产品/UI 已冻结（P1–P6，2026-09-22）；
REMAINING PRODUCT DECISIONS：无（COAC-5 本期范围）；
TECHNICAL CANDIDATE：R3-P2-1 实现与机械回归已落盘，仍须 final candidate HEAD 的
fresh independent review 无 P1/P2 后才可记为 PASS。** 产品冻结不等于技术审阅通过、
PR 合入或 COAC-6 可执行。将来重新生成/报告比较的配置快照细节属于后续功能规格，不阻塞本期
产品冻结。本记录取代此前“没有未决产品问题、可直接执行”的关闭声明。
COAC-7 仍需把共享生命周期互引落入其独立持久化规格；在 COAC-5 与
COAC-7 两份规格均冻结合入前，不得启动 COAC-6。
