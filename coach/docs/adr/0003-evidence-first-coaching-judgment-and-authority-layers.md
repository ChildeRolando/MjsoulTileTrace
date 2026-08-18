# ADR-0003：Evidence-First 教练判断与证据权威分层——LLM 可给最终推荐，DeterministicPreference 不是最终裁判，启发式估算无否决权

2026-08-18 roadmap grill 裁定（Q3/Q7，决策记录 C1–C8、G1–G5）。Coach 的底层
原则是 evidence-first，但 **evidence-first ≠ reasoning-deterministic**。证据分
三层，各层权威不同：

- **Hard evidence**（KnownGameFacts + 确定性候选因素 / deterministic
  FactorDifference）：factual constraints——LLM 不可有意见、不可发明、不可修改、
  不可补全。
- **Advisory signals**（版本化启发式/估算：helper 风险刻度、顺位 EV、版本化上游
  behavioral heuristic / river estimate）：reproducible context，**no veto
  power**——教练可以不认，也可依据真实牌河判断其在当前局面低估/高估。这里的
  “读牌行为推断”特指上游、本地、版本化的启发式/估算，不是 LLM 教练推断。
- **Coach inference / CoachJudgment**（LLM）：在证据之内综合、权衡冲突轴、给出
  最终推荐与置信度；**可否决 advisory signals，不得抵触 hard facts**。LLM 基于
  KnownGameFacts 形成的高级牌河阅读（舍牌顺序、手切/摸切、立直时机等）属于
  CoachInference，不属于 advisory signal。

`DeterministicPreference` 由此定位为 **optional deterministic signal**：本地显式
规则一致时给出，轴间冲突时为 null；null 不是"禁止综合判断"，而是"交给教练判断
层"——轴间冲突（效率 vs 防守）恰恰是 Coach 最应该工作的区域。它不是最终推荐的
唯一合法来源，也不是 LLM 的强制上游结论。

一句话：现物是不是现物，LLM 不能有意见；helper 说这张牌危险多少，LLM 可以不认；
依据真实牌河判断 helper 低估/高估了危险，正是教练发挥价值的地方。

## Considered Options

- **A. LLM 只是确定性结论的复述层**（FactorDifference → DeterministicPreference
  → paraphrase）：审计最简单，但把 Coach 降级为报告渲染器；轴间冲突场景下只能
  输出"无结论"，恰好放弃最有教学价值的位置。
- **B. 所有可复现启发式约束 LLM 方向**（helper 风险刻度等拥有否决权）：防守教学
  会被上游刻度的系统性偏差绑架，且把版本化估算升格为结论，违反"确定性与启发式
  分离"。
- **C. LLM 可自由推断局面事实**（补全读牌/打点/威胁）：表达力最强，但重新打开
  hallucinated Mahjong knowledge 的闸门，摧毁可审计这一核心产品价值。

三案均拒绝；采用上述三层权威模型。

## Consequences

- 事实必须确定；判断可以经验；无出处的局面事实一律禁止。解释验证器做 grounding
  校验（hard/soft 分层），不试图确定性证明 CoachJudgment"正确"。
- 机械 grounding 靠 contract 结构而非事后自然语言理解：要求机械保证为真的事实
  内容必须结构化（EvidenceClaim，轴/方向由 evidence 查回而非 LLM 声明）或由证据
  占位符渲染——不是"validator 事后抓幻觉"，而是"contract 不给事实幻觉留产生
  空间"。
- `DeterministicPreference` 的计算语义不变（启发式永不进入），变的只是它在产品
  链中的权威地位；既有 FactorPipeline 契约无需破坏性修改。
- 解释与分析物理分离：LLM 产物（CoachJudgment / ExplanationBullet）放在独立
  ReviewReport，经 decisionId/evidenceId 引用 StructuredAnalysisPackage，类型上
  无法改写证据层。
- 缺失的分析能力不构成缺失的解释——系统没有可据以识别"解释缺口"的独立真相
  来源；M2 能力扩充是 pull-based 能力池，不从"解释缺口"反推。
- 本 ADR 取代任何更早把 DeterministicPreference 解释为跨因素/最终教练结论唯一
  来源、或把 LLM 定位为纯表达/复述层的说法。历史文档原文不动，时间语义保留，
  以本 ADR 为准。
