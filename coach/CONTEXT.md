# Coach（日麻教练）

本机日麻教练应用：登录雀魂国区账号取回牌谱，用可验证的本地事实管线加上生产模型
（Mortal/Akagi）候选评分，产出可回放、可审计、可追问的整盘教学分析。

## Language

### 覆盖账本（full-game coverage ledger）

**本地决策（local decision）**：
canonical 重放暴露的一个自视角决策窗口（当前为自摸回合），是账本的本地一侧。
_Avoid_: 决策点、ReplayedDecision（实现名）

**Mortal 源行（Mortal source row）**：
Mortal 报告中摊平后的自视角 entry，是账本的源一侧；只按身份事实与顺序绑定，绝不按序号猜。
_Avoid_: Mortal entry（与原始报告条目混淆）

**绑定对（bound pair）**：
一个本地决策与一个源行经身份事实双向唯一匹配后的组合；任一侧不唯一即 fail closed，不猜。
_Avoid_: 锚定对、匹配对

**analysis_ready**：
绑定对进入比较分析并被成功装配的状态；未绑定或动作不被支持的行绝不进入此状态。

### 真实语料验收（real-corpus acceptance）

**语义覆盖矩阵（semantic coverage matrix)**：
按"窗口种类 × 行动分支"列出的验收清单（立直/黙听、chi 后弃牌、pon 后弃牌、
立直后、自摸、暗杠、加杠、九种九牌……）。某分支的 production fail-closed 只有
在其取得**真实 E2E 命中**后解除；矩阵无空格才是验收完成，corpus 场数不是。

**Discovery corpus**：
本地批量扫描的原始牌谱集合，只跑 mapper/canonical/census，**绝不调用 Mortal**；
用途是寻找稀有语义分支，不是评审。

**Acceptance corpus**：
从 discovery corpus 中选出的最小完备真实样本集；只对目标 game+seat 提交 Mortal
获取报告。Mortal 不是稀有事件搜索工具。

_Avoid_: "测试牌谱集"（掩盖两层职责差异）、"语料库"（不区分 discovery/acceptance）

### 决策窗口

**自摸回合窗口（self-turn window）**：
自己摸牌形成的决策窗口。

**副露后窗口（post-call window）**：
自己 chi/pon 之后、舍牌之前的决策窗口；无摸牌，手牌为副露后的暗牌。

**立直后窗口（post-riichi window）**：
立直受领后的舍牌决策窗口；选择被"保持听牌形"约束，通常唯一。

**终局决策窗口（terminal decision window）**：
实际行动为 tsumo / ankan / kakan / 九种九牌的自摸回合窗口。荒牌流局等
**纯终局不是决策**——无行动可选，不开窗、不入账本。

**立直决策窗口（riichi decision window）**：
实际动作为立直舍牌的自摸回合窗口。其中被比较的抉择是**立直 vs 黙听**，
不是"弃哪张牌"。
_Avoid_: 立直舍牌窗口（弱化了抉择语义）

**立直候选（declare-riichi candidate）**：
模型侧的立直动作，**永不携带舍牌 tile**——Mortal 的动作空间中立直是单一索引，
"立直后弃哪张"是受领后另一个决策行的事。actual 侧的立直舍牌 tile 一律来自
本地 canonical 事件（权威），两侧规则不混用。
_Avoid_: riichi_discard 候选（候选侧禁止使用带 tile 的立直动作）

### 响应面（response surface）

**他家舍牌响应窗口（discard response window）**：
他家舍牌后、自己对 chi/pon/大明杠/荣和拥有合法选项时开窗的决策窗口。

**他家杠响应窗口（kan response window）**：
他家加杠（及规则允许抢暗杠时的暗杠）后、自己可抢杠荣和时开窗的决策窗口。

**决策归属（decision owner）**：
在多个合法动作中做选择的人。响应窗口的归属是自己、触发者是他家；
窗口与源行的配对一律按决策归属，绝不按"谁是最后行动者"判断。
_Avoid_: 用 last_actor/最后行动者判定归属（自摸回合恰好重合，响应面必错）

**触发者（trigger actor）**：
决策点前最后一次行动的行动者；自摸回合窗口触发者是自己，响应窗口触发者是他家。

**过（pass）**：
"不响应"是候选动作空间的一等候选（模型侧动作类型为 none），不是决策缺失。

**源行门槛（source entry threshold）**：
源报告只对合法候选 ≥2 的决策点产生行；单候选决策点（如立直后强制摸切）
合法无行。绑定守恒因此是"每个本地窗口要么可绑定、要么有明确无行原因"，
不是两侧计数相等。

### 分析产物（analysis artifacts）

**StructuredAnalysisPackage（M6-C 整盘确定性证据产物）**：
M6-C 将要固化的**整盘**确定性/可审计分析产物，是 evidence source of truth；
只装确定性/来源/模型分析内容（record/decision identity、确定性生产者版本、
七值 decision outcome、ledgers/differences/advisory signals/preference/
modelEvaluation、evidence provenance）。**不是 graph、不是 LLM 产物**。
_Avoid_: 把它与现役逐决策原型 `StrictAnalysisPackage` 混同
（见 ROADMAP §2 M6-C）。

**StrictAnalysisPackage（现役逐决策原型产物）**：
**早期**、**逐决策**的回归/原型分析包（`NormalizedDecision` + scene + factor
buckets + evidence registry + teaching rules），由 `buildStrictAnalysisPackage`
构建、`validateStrictAnalysisPackage` 校验，供现有 pipeline/测试（fixture
分析、coach-report 原型）使用。**不是** M6-C 的整盘 `StructuredAnalysisPackage`；
M6-C 不得静默改名/扩展现有类型来假装实现。
_Avoid_: 把它当作 M6-C 产物；用 `StructuredAnalysisPackage` 指代现役类型

**组件版本所有权（component version ownership）**：
`StructuredAnalysisPackage` 只装确定性/来源/模型分析生产链版本（package schema、
canonical/replay、mapper/source adapter、fact-engine、factor pipeline、Mortal
model/source tag 等）；LLM prompt/解释版本（provider/model、prompt version、输出
schema 版本、validator/generation 版本）属 `ReviewReport`。同一分析包可被不同
LLM/prompt 重生成多个 ReviewReport。

### 评审选择（review selection）

**DeterministicReviewSelector（确定性评审选择策略）**：
纯函数式、确定性、版本化的产品策略，把 schema-valid 的 `StructuredAnalysisPackage`
投影为可机器审计的 `ReviewSelectionResult`；只消费 M6-C 已有信息，不新增任何分析
能力。入选 authority 只有一条门："分歧 AND errorGap ≥ T"（T/N 冻结进 policy
版本）；preference 冲突只作排序 tiebreaker；graph / UI / 引擎都不拥有"什么值得
评审"的判定权（grill F1/F3）。
_Avoid_: 把它当智能选择器 / 质量/重要性评分器；让 M7-A 或 M6-D2 自行推理
"为什么入选、为什么排序"

**ReviewSelectionResult（评审选择结果）**：
selector 的确定性投影：`policyVersion` + `analysisPackageId` +
`analysisPackageStatus`（原样透传 `package.record.status`）+ `selected`
（decisionId / 1-based rank / selectionReason）。没有 `selectionId` /
`semanticHash` / `createdAt`；identity = `(analysisPackageId, policyVersion)`，
M7-B 只保存这两个值即可重算。`selected` 只引用 decisionId，不复制 errorGap /
preferredActions / factor differences（避免第二套 truth）。
_Avoid_: 把它当新的 evidence artifact / 有独立生命周期的产物

**selection reason（入选原因）**：
冻结的两值机械词汇：`model_disagreement_above_threshold`（分歧且 ≥T 且
actual↔preferred 存在 valueRelation ≠ equal 的确定性 FactorDifference）与
`no_distinguishable_factor_difference`（分歧且 ≥T，但已计算确定性维度无可区分
差异）；后者不构成独立入选 authority。pedagogy / CoachJudgment 措辞
（bad_push / dangerous_decision / important_learning_point /
learning_opportunity）一律不得进入结果；heuristic / advisory 差异不参与该判定。
_Avoid_: 用"学习点"式措辞替换 selection reason；让 heuristic 差异决定 reason

### ContextGraph 与推理审计（context graph / reasoning audit）

**ContextGraph**：
由 StructuredAnalysisPackage 投影出的 typed provenance graph，加上可选 LLM
reasoning overlay。v1 是内存中的 typed property graph + deterministic traversal，
不引入 graph database / GraphRAG。

**Evidence subgraph**：
非 LLM 起源、不可被 LLM 修改的 graph partition；由 StructuredAnalysisPackage
deterministic projection 得到。

**Reasoning overlay**：
LLM 追加的 CoachInference / CoachJudgment / Explanation relation 集合；只允许
append，可以引用 evidence subgraph，但不得修改、删除或覆盖其中节点/边。

**GraphContextSlice**：
从 ContextGraph 通过确定性 allow-list / traversal 选出的单次 LLM 输入。

**Reasoning trace / argument trace**：
面向产品保存和审计的显式结构化推理路径。

> reasoning trace != raw chain-of-thought

**读牌语义拆分**：

- 上游、本地、版本化的 behavioral heuristic / river estimate
  → advisory signal（无否决权）；
- LLM 根据真实 KnownGameFacts（舍牌顺序、手切/摸切、立直时机等）形成的
  高级读牌判断 → CoachInference（属于教练判断层）。

### 证据先行教练语义（evidence-first coaching）

**局面事实（KnownGameFacts）**：
从 canonical 重放直接投影出的客观局面状态（巡目、手牌、河牌、立直状态、
分数、场风/自风、当前动作）。
_Avoid_: 把候选分析值称为 fact（那是候选因素）

**候选因素账本（CandidateFactorLedger / FactorFact）**：
对某个候选动作确定性计算出的分析值全体（账本）及其中单个值（FactorFact，
如 shanten、ukeire、逐威胁现物）。
_Avoid_: 笼统的 "Fact"、"candidate fact"

**候选差异（FactorDifference）**：
两个候选因素账本在同一维度上的确定性比较，含数值与方向
（supports_left/supports_right/neutral）；回答"候选之间客观存在什么差异"，
不做跨轴取舍。

**确定性偏好信号（DeterministicPreference）**：
本地显式规则从已计算确定性维度导出的**可选**偏好信号；轴间冲突时为 null。
null 不是"禁止综合判断"，而是把取舍交给教练判断层。
_Avoid_: 最终推荐、教练结论的唯一合法来源

**教练判断（CoachJudgment）**：
LLM 在已有证据之内（hard evidence 为约束、advisory signal 为参考上下文且
无否决权）做出的跨因素权衡、最终推荐与置信度；可以处理轴间冲突、表达
经验性取舍，但不得发明或修改局面事实、候选因素数值或差异方向。
_Avoid_: 把它当局面事实；把 LLM 降格为纯语言包装层

**解释条目（ExplanationBullet）**：
面向用户的最终表达单元；来源可以是候选差异（证据向）或教练判断（判断向），
一个教练判断可展开为多条解释条目。解释条目 ≠ 教练判断。

**核心不变量**：事实必须确定（deterministic）；判断可以经验
（heuristic/experiential）；无出处的局面事实一律禁止。
No game-state fact or candidate-level analytical fact may originate from the LLM.

**硬证据（hard evidence）**：
KnownGameFacts 与确定性候选因素，构成事实约束——LLM 对其不可有意见
（现物是不是现物不由 LLM 说了算）。

**参考信号（advisory signal）**：
版本化启发式/估算（helper 风险刻度、顺位 EV、版本化上游 behavioral
heuristic / river estimate）；只作上下文、**无否决权**——教练可以不认，
也可以在真实牌河依据上判断其低估/高估。

**教练推断（coach inference）**：
CoachJudgment 的综合层；LLM 根据真实 KnownGameFacts（舍牌顺序、手切/摸切、
立直时机等）形成的高级读牌判断属于 CoachInference。可以否决参考信号，不得
抵触硬证据。

**顺位条件（placement conditions）**：
点数/番数/点位算术导出的升顺保顺条件；确定性事实，属硬证据。

**顺位 EV（placement EV）**：
依赖模拟的顺位期望值；版本化估算，属参考信号，永不进入确定性偏好。
