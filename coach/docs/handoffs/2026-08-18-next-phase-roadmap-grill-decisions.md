# 下一阶段 roadmap：盘问决策记录

日期：2026-08-18
性质：范围/架构盘问（grill）会话的决策沉淀。盘问对象为 sol 起草的下一阶段
roadmap（P0–P9：Playable Review MVP，evidence-first epistemology）。
证据基准：master=6244294（M6-A3 已闭合）、ADR-0001/0002、2026-08-16 A3 grill
决策、Mortal 报告实样调研（用户）、`report-fetcher.ts` / `mortal-review-service.ts`
代码核实。

## 状态：已定稿（2026-08-18 收口）

本盘问会话覆盖 sol 下一阶段 roadmap 的 P0–P9 全部议题，无遗留开放问题。

---

## 一、已决策（不再开放）

### A4 响应面（roadmap P0 / M6-A4）

| # | 决策点 | 结论 |
|---|---|---|
| A1 | 调研结论 | **Mortal entry 单位 = 合法候选 ≥2 的决策点**；pass 显式建模为 `none` 动作，不是决策缺失；单候选决策点（如立直后强制摸切）合法无行。H2 的 12 个 `no_mortal_entry` 全部来自 self 侧（125 = 120 self_turn + 4 post_riichi + 1 post_call，响应面为 0） |
| A2 | 架构错误定位 | **当前 pipeline 用 `last_actor == player_id` 判定归属，会整层丢弃响应 entry**（响应行 last_actor = 出牌者）。两处：`mortal-source/src/report-fetcher.ts:228`（投影层，注释误以为那些是"对手视角行"）+ `reasoning/src/analysis/mortal-review-service.ts:499`（二次过滤）。报告为单视角评审，所有 entry 的 `state.tehai` 均为受评者手牌；pinned schema 已有 `at_opponent_kakan` 等响应标记 |
| A3 | A4 的本质 | 不是"增加响应分析能力"，而是**把 decision identity 从"谁行动"升级为"谁拥有决策"**：source model 增加 decision owner / trigger actor / response target；绑定守恒不变量改为"每个本地窗口要么可绑定、要么有明确无行原因（源行门槛内跳过）"，不再是两侧计数相等 |
| A4 | 内部结构 | **A4.0** 修 source model（拆两处 last_actor 过滤、钉死"全部 entry 为受评者视角"事实、重跑 A3 H2 确认 self-turn 绑定不回归）→ **A4.1** response replay 开窗 → **A4.2** binding validation（响应窗口身份事实表）→ **A4.3** 真实语料验收 |
| A5 | 分支矩阵 | **response window × actual action 覆盖矩阵**，pass 与 actual 为不可互相覆盖的语义分支，每分支 ≥1 真实 E2E acceptance。wave-1（常见）：`resp_chi_actual` / `resp_pon_actual` / `resp_daiminkan_actual` / `resp_hora_actual` / `resp_pass_on_discard` / `resp_chankan_actual`；wave-2（稀有，fail-closed + 事前固定降级条款）：`resp_pass_on_kakan` / 国士抢暗杠（若雀魂规则存在）。chi actual 与 daiminkan actual 为先前清单笔误，已补 |
| A6 | 每分支例数 | 常见分支 3–5 例（ADR-0002 口径）：`resp_pass_on_discard` 3–5、四个 call actual 各 1–3、`resp_hora_actual` 1–3 |
| A7 | 枚举一致性 DoD | 本地候选枚举必须与 Mortal 候选空间同构（chi 按搭子组合展开、`none` 计一候选）。硬规则：**本地枚举 ≥2 的窗口无源行 → 验收失败；源行出现而本地未预期 → 守恒失败**。不允许"大概没记"搪塞 |
| A8 | A4 CLOSE 定义 | ① wave-1 矩阵无空格；② wave-2 分支带事前固定的降级条款（扫描 N 场阈值进 spec）；③ H2 重跑中现有 12 个 `no_mortal_entry` 逐个获得解释（本地枚举=单候选 → 归入门槛内跳过），不允许剩余无法解释的无行 |
| A9 | 设计单位 | A4 分支的设计单位不是动作类型清单，而是 **Response Window + Actual Outcome + Mortal Candidate Set + State Transition** 四元组 |

### 开放风险（显式记录）

1. **`resp_chankan_actual` 留在 wave-1 且无降级条款兜底**：#6（能抢且实际抢）与
   wave-2 的 #7（能抢而过）共享"加杠撞待牌"这个数百局一遇前提。缓解：discovery
   把 chankan（纯事件扫描、零 Mortal 成本）最早启动、优先于其他分支。
2. 国士抢暗杠的雀魂规则存在性未确认；确认前按"规则不存在即出 scope"处理。

> **Current-state note（A4.3 落地，2026-08-18）**：两项开放风险均已按预案收口——
> ① chankan 经最早启动的纯事件 discovery 命中并取证 `resp_chankan_actual`（天凤
> 28b283816b231418#1），wave-1 六分支 6/6 真实 E2E；② 雀魂允许国士無双抢暗杠
> （wiki 实证），规则存在性确认；wave-2（`resp_pass_on_kakan` / 国士抢暗杠）按
> 冻结降级条款（N = 10,000 场，两来源合计）保持 fail-closed 顺延，不阻塞 A4 CLOSE。

### 教练语义冻结（roadmap P1/P3/P4 地基，2026-08-18 Q3 裁定）

| # | 决策点 | 结论 |
|---|---|---|
| C1 | 核心裁定 | **evidence-first ≠ reasoning-deterministic**。局面事实与候选因素必须本地确定性产生（硬边界）；候选间差异由 FactorDifference 固定；**跨因素取舍与最终教练判断（CoachJudgment）由 LLM 在已有证据内完成**——权衡冲突轴、给推荐、给置信度，这是 Coach 相对纯分析器的核心价值 |
| C2 | DeterministicPreference 地位 | 降格为 **optional deterministic preference signal**：本地显式规则一致时给出，轴间冲突时为 null。null 不是"禁止综合"而是"交给教练判断"；它不是最终推荐或跨轴结论的唯一合法来源 |
| C3 | 核心不变量 | No game-state fact or candidate-level analytical fact may originate from the LLM. Coaching judgments may originate from the LLM, but must be grounded exclusively in available deterministic evidence. 事实必须确定；判断可以经验；无出处的局面事实一律禁止 |
| C4 | 六层术语冻结 | KnownGameFacts（局面事实）→ CandidateFactorLedger/FactorFact（候选因素账本）→ FactorDifference（候选差异）→ DeterministicPreference（确定性偏好信号，optional）→ CoachJudgment（教练判断）→ ExplanationBullet（解释条目）。sol 文档中的泛称 "Fact" 一律按语义改为 FactorFact / CandidateFactorLedger；ExplanationBullet ≠ CoachJudgment（一个判断可展开为多条条目；条目分证据向/判断向两种来源） |
| C5 | 主链路冻结 | KnownGameFacts → CandidateFactorLedger/FactorFact → FactorDifference →（旁路：optional DeterministicPreference）→ LLM CoachJudgment → ExplanationBullet → Review UI。**禁止**再把主链描述为 "FactorDifference → DeterministicPreference → LLM paraphrase"（把 LLM 降格为语言包装层） |
| C6 | validator 范围 | 解释验证器做 **grounding validation**：factual 可追溯、candidate 一致、数值与 ledger 一致、比较方向与 FactorDifference 一致、无捏造局面事实。**不**负责确定性证明 CoachJudgment"正确"——判断允许经验性权衡 |
| C7 | 仍然禁止 | LLM 不得声称知道 Mortal/Akagi 内部原因（modelReason 恒 unknown）；不得发明 threat/placement/hand value/safety/ukeire 等不存在于证据中的事实；不得修改差异方向或数值 |
| C8 | 文档落点 | ROADMAP 产品目标句改写（事实与差异本地确定性；判断 LLM 有据综合）；ARCHITECTURE 新增"证据先行，判断分层"设计决策 + 比较与解释第 5/6 条改写 + "模型和教练分离"改写；CONTEXT.md 新增六层术语与核心不变量；DEVELOPMENT_WORKFLOW 证据清单补 CoachJudgment 边界；coach/README LLM 权限句更新。**历史 handoff/plans/specs 一律不改**（时间语义保留；其中"启发式不能产生 DeterministicPreference"等管线内部规则在 C 裁定下依然为真） |

> **Supersession note（Q3 架构裁定）**：本文档 C1–C8 取代任何早期把
> DeterministicPreference 解释为"跨因素/最终教练结论唯一来源"的说法，也取代
> 把 LLM 定位为"纯表达/复述层"的说法。历史文档原文不动，以本条为准。

### StructuredAnalysisPackage（roadmap P2 / M6-C）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | analysisStatus 枚举 | **沿用现有 `MortalDecisionOutcome` 六值**（`analysis_ready/unsupported_action/no_mortal_entry/binding_mismatch/model_output_incomplete/analysis_blocked`），A4 后按需增加"源行门槛内跳过"细分；**不采用** sol 的四值缩水枚举（丢 binding_mismatch/no_mortal_entry 会破坏 A3 §21 优先级纪律；且 no_mortal_entry 是合法常态、model_unavailable 是工程失败，语义不同不得合并）。sol 禁令（missingReason/likelyMissingFactor/explanationBlockedBy）作用于**解释层**；`FactorStatus.blocked_missing_facts` 等轴级工程状态保留 |

> **Supersession note（A4.0，现行权威）**：D1 的"六值 + 按需增加"已被 M6-A4.0 落地为
> **七值契约**——新增第七值 `source_row_not_expected`（合法状态：本地候选枚举 = 1 →
> Mortal 按定义不产出行，在任何源行查找前判定；`no_mortal_entry` 保持完整性故障语义，
> 绿色验收 run 中必须为 0），"按需增加"删除。七值清单与语义见 M6-A4 规格
> （outcome 契约冻结节）与当前 ROADMAP §2 M6-C。
| D2 | 包与解释物理分离 | `StructuredAnalysisPackage` 只装确定性内容（identity、组件版本、每决策 outcome/ledgers/differences/preference/modelEvaluation）；`ExplanationBullet`/`CoachJudgment` 放独立 `ReviewReport`，经 `decisionId + evidenceId` **引用**包内容、绝不内嵌——C 裁定不变量获得类型级结构保证，LLM 产物无法改写分析包 |
| D3 | 载荷粒度 | 每决策带全量 ledgers（不按引用裁剪）；本地分析本地存储，SQLite 时代 MB 级可接受 |
| D4 | 版本字段 | 按组件展开（replay/mapper 版本、fact-engine 版本、adapter 版本、model tag、explanationPrompt 版本），不用单一 `pipelineVersion` 模糊串；与 P6 ReviewSession 字段一致 |

> **Supersession note（M6-C 版本所有权，现行权威）**：D4 列举的组件版本中，
> **`explanationPrompt` 版本属 `ReviewReport` / 解释生成侧**，不进入
> `StructuredAnalysisPackage`。`StructuredAnalysisPackage` 只装确定性/来源/模型
> 分析生产链版本（package schema、canonical/replay、mapper/source adapter、
> fact-engine、factor pipeline、Mortal model/source tag 等）；LLM provider/model、
> prompt version、输出 schema 版本、validator/generation 版本归 ReviewReport。
> 同一分析包可被不同 LLM/prompt 重生成多个 ReviewReport。现行权威见 ROADMAP §2 M6-C。

### Explanation Engine 与 Validator（roadmap P3/P4 / M6-D）

| # | 决策点 | 结论 |
|---|---|---|
| E1 | LLM 传输 | 云端 API + BYOK + 单 provider，但第一天就定义 `LlmProvider` 接口、v1 单实现；key 只存主进程（优先 OS credential store），永不进 renderer/localStorage/audit/log |
| E2 | 上传边界 | **显式白名单投影 DTO `LlmDecisionContext`**（绝不直接 serialize `DecisionAnalysis`，防未来新字段意外上传）；排除账号身份/昵称/report ID/URL/原始字节/cookie/本地路径/敏感诊断；座位匿名为 self/seat_N；audit 只留 provider/model/promptSchemaVersion/inputHash/outputHash/status/token 成本元数据，默认不存完整 prompt/response |
| E3 | 引擎 API | `generateReport(analysisPackage, selectedDecisionIds)`——引擎不拥有 review-worthy 定义权；P5 的 DeterministicReviewSelector 喂 selectedDecisionIds；"~10" 是 v1 批量策略不是永久上限，on-demand generation 后续开放 |
| E4 | 失败隔离 | **LLM failure never mutates or invalidates StructuredAnalysisPackage**；ReviewReport 自持 `generationStatus: complete/partial/evidence_only`，行级 `explanationStatus: ready/not_selected/provider_unavailable/request_failed/invalid_output`；绝不写回 `DecisionAnalysis.analysisStatus` |
| E5 | grounding 原则 | **citation existence ≠ entailment**——机械 grounding 靠 contract 结构而非事后 NL 理解：凡要求机械保证为真的事实内容必须结构化或由证据占位符渲染；LLM 自由自然语言只留给 trade-off/教学组织/CoachJudgment。不是"validator 抓幻觉"，是"contract 不给事实幻觉留产生空间" |
| E6 | bullet 契约 | `ExplanationBullet{claims: EvidenceClaim[], judgmentRef?}`；`EvidenceClaim{kind: factor_difference|factor_fact, evidenceRef}`——轴/方向由 evidence 查回，LLM 不得声明（不能把 efficiency 差异标成 defense）；`CoachJudgment{id, decisionId, recommendation: CandidateId, confidence, premiseRefs[]}`；溯源链 FactorDifference → CoachJudgment → bullet |
| E7 | 数字占位符 | 文本数字一律 `{diff:*.delta}` / `{candidate:*}` 占位符、渲染器从证据解出——LLM 物理上写不出 10/12/13 这类错误数字；自然语言数字扫描与方向词表因中文误报（两面/三色/东一/第三巡…）降级为 soft 检查 |
| E8 | validator 分层 | **Hard**（发布门、纯机械）：refs 存在且属本决策、recommendation 在候选空间内、premiseRefs 非空有效、claim 类型合法、占位符可解、不得携带新结构化事实、不得改差异、跨决策引用禁止。**Soft**（仅诊断）：数字扫描、方向词、重复/长度/风格 |
| E9 | 拒绝策略 | 传输失败（timeout/429/502/reset）自动重试一次；语义/grounding 失败**不重试**——reject、diagnostics++、omit、continue（重试会把幻觉洗白并掩盖质量信号）；被拒 judgment 级联丢弃其全部 bullets；8/10 有效 → partial，全败 → evidence_only，证据视图始终可用 |

### Review UI 与选择策略（roadmap P5 / M7-A）

| # | 决策点 | 结论 |
|---|---|---|
| F1 | 选择策略 | **DeterministicReviewSelector**（确定性、版本化）：候选池 = analysis_ready；分歧 = actual（类型+tile 等价匹配）∉ preferredActions；入选 = 分歧 AND errorGap ≥ T；排序 errorGap 降序、批量上限 N=10；T/N 冻结进 policy 版本 |
| F2 | 无差异分支 | **进 v1**：模型明显偏好但 actual-vs-preferred 无任何已计算确定性差异的决策入选，渲染"已计算维度上无可区分差异"这一确定性事实——防 UI 沉默暗示"因素都支持你"，且为 judgment 向 bullet 提供合法前提 |
| F3 | preference 冲突 | v1 **不**作独立硬入选条件；作为排序 tiebreaker 记录在 policy，待真实语料评估是否升级 |
| F4 | UI | 保持原生 DOM、不引框架；三层：Overview（计数含 unsupported/no_mortal_entry）→ List（摘要 tags 由渲染器从差异轴集合机械派生）→ Detail（你的选择 vs Mortal、候选分、bullets、证据展开= EvidenceClaim + 占位符解析）；on-demand generation 入口后置 |

> **Supersession note（selector 排序/所有权，现行权威）**：`DeterministicReviewSelector`
> 的**排序位置**定为 M6-C 之后、M6-D2 之前（M6-D2 的
> `generateReport(analysisPackage, selectedDecisionIds)` 依赖它，见 E3），且**非 UI
> 拥有**——它是确定性、版本化的产品策略（独立于 M7-A 渲染层）；M7-A 消费其输出而不
> 定义 review-worthy 判定。不新增顶级里程碑。策略语义（F1–F3）不变。现行权威见
> ROADMAP §3。

### 证据三层模型与 M2-next 分层（roadmap P7）

| # | 决策点 | 结论 |
|---|---|---|
| G1 | 三层模型 | **Hard evidence**（KnownGameFacts + 确定性因素 → factual constraints，LLM 不可有意见）/ **Advisory signals**（heuristic/versioned estimates → 仅上下文、无否决权）/ **Coach inference**（LLM 综合 → 可否决 advisory、不得抵触 hard facts） |
| G2 | 防守教学定位 | 现物是不是现物，LLM 不能有意见；helper 说危险多少，LLM 可以不认；依据真实牌河判断 helper 低估/高估，正是 Coach 价值所在 |
| G3 | placement 拆分 | **顺位条件**（点数/番数/点位算术）= 确定性 FactorFact、可入 DeterministicPreference；**顺位 EV**（模拟期望）= advisory 档、永不入 preference、渲染带版本化估算标签。"讲清楚南四顺位决策"由顺位条件层满足 |
| G4 | C 不变量精确化 | "grounded exclusively in deterministic evidence" 的 grounding = 不得抵触硬证据 + 参考信号仅作无否决权上下文；不变量的对立面是"LLM 起源"与"抵触硬事实"，不是"启发式分级" |
| G5 | M2-next 分层表 | exact fu（确定性）/ choice rights（枚举确定性）/ 顺位条件（确定性）/ placement EV、读牌行为推断（advisory 档）；backlog 排序按产品 scope/场景覆盖率/教学价值/工程成本，**不从"解释缺口"反推**；新增维度后可对比 explanations_old vs explanations_new 研究新增观点，但不得声称以前"被阻塞" |

### 里程碑结构与收口（roadmap 定稿）

| # | 决策点 | 结论 |
|---|---|---|
| H1 | 里程碑结构 | 采纳 sol 结构 + 老编号映射：老 M4"LLM 教练"拆为 **M6-D 解释引擎 + M7-A 固定报告 UI + M4 追问对话**；老 M7 拆为 **M7-A / M7-B**；新增 **M6-C / M6-D**。关键路径：M5 人工验收（并行）→ M6-A4 → M6-C → M6-D → M7-A → M7-B → M2-next / M3 / M4 → M6-B → M8 |

> **Supersession note（A4 收口，现行权威）**：H1 关键路径中的 M6-A4 已于 2026-08-18
> 收口。当前关键路径 = M5 人工验收（并行）→ **M6-C → DeterministicReviewSelector →
> M6-D1 → M6-D2** → M7-A → M7-B → pull-based M2-next / M3 / M4 → M6-B → M8
> （见 ROADMAP.md）。
| H2 | 纵向判据 | Any next development item should be evaluated by whether it makes the end-to-end review vertical slice more complete, reliable, or useful. **Exceptions**: explicit product-scope prerequisites, integrity fixes, privacy/security fixes, and release blockers |
| H3 | M2-next 定位 | **pull-based deterministic capability pool**，不是 M7-B 后才允许开始的线性 gate——产品 scope 或 vertical-slice 明确需要的硬能力（如顺位条件）可提前插入；不做"补完知识库再做产品"，也不人为禁止合理的 M2 工作 |
| H4 | ADR-0003 | 《Evidence-First Coaching Judgment and Evidence Authority Layers》：冻结三层权威（hard/advisory/coach inference）+ DeterministicPreference 非最终裁判 + 三个 rejected alternatives（A 复述层 / B 启发式否决权 / C 自由推断局面事实） |
| H5 | ReviewSession 形状 | **引用不内嵌**（analysisPackageRef / reviewReportRef）——同一分析包可换 LLM/换 prompt 重生成报告；componentVersions 概念清单预留：canonical/replay、Mortal model/source、factor pipeline、selector policy、analysis package schema、LLM provider/model、prompt/schema、review report schema |
| H6 | Mortal cache 边界 | **Raw Mortal/source cache remains privileged-process data and is not part of ReviewSession or ReviewReport**——用于 restart recovery / deterministic re-analysis / 避免重复下载；遵守既有隐私纪律（main process only、无 renderer 暴露、无 raw audit payload）；eviction/磁盘期限 M7-B 实现时定 |
| H7 | 收口声明 | 本次 roadmap 重构**就此收口**，不再继续抽象架构讨论；回到实现主线 **M6-A4 → M6-C → M6-D** |

---

## 二、收口

P0–P9 全部走完。开放风险仅 A4 两项（chankan 留 wave-1 无降级兜底——缓解为
discovery 最早启动纯事件扫描；国士抢暗杠雀魂规则存在性待确认）。后续不再继续
抽象架构讨论，回到实现主线：**M6-A4 → M6-C → M6-D**。

> **Current-state note（2026-08-18 收口后）**：两项 A4 开放风险已按预案落地（见上文
> 开放风险 current-state note）；M6-A4 已 CLOSE，当前实现主线起点为 **M6-C**（含
> DeterministicReviewSelector 于 M6-D2 之前），见 ROADMAP.md。

## 三、产物清单（本会话）

- `coach/CONTEXT.md`（新增响应面术语 + 证据先行教练语义六层术语与三层证据模型）
- `coach/docs/adr/0003-evidence-first-coaching-judgment-and-authority-layers.md`（新增）
- `coach/docs/development/ROADMAP.md`（产品目标句改写；里程碑表按 H1 重构；
  关键路径按纵向主线重写，含 H2 判据与例外、H3 pull-based、H6 缓存边界）
- `coach/docs/development/ARCHITECTURE.md`（新增"证据先行，判断分层"设计决策
  与三层证据模型；比较与解释第 4–6 条改写；"模型和教练分离"改写；缺口清单修正）
- `coach/docs/development/DEVELOPMENT_WORKFLOW.md`、`coach/README.md`
  （LLM 权限语义对齐 CoachJudgment）
- 本文档（A/C/D/E/F/G/H 七组决策 + Q3 supersession note）
