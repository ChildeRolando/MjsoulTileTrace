# 决策局面事实与无确定性差异解说

## 用户契约

- 教练使用决策当时的各家点数与局次、本场、供托来权衡保位/追分；领先和落后目标不同，不能把纯进张统计自动转成无条件最佳行动。终局点数、玩家段位与 Mortal 评分均不得代替当前点数。
- 确定性差异相同、未知或未计算，是三种不同情况。不能捏造因素支持推荐，也不能把模型的偏好称为已证明的牌理或期望收益。
- 现有自动比较仍仅为 Top1/实际或 Top1/Top2；此次不增加两两比较。

## 解说生产与消费

最新本机失败报告 `f36466cf-5b2b-4678-9784-dbcc3c753cfb` 是 v5、`discard_response`，三个候选（明杠、过、碰）没有 FactorFact 或 FactorDifference，只有 KnownGameFact 与 ModelEvaluation。旧 claims 两值枚举无法引用这些已有证据。旧报告只保存输出哈希与 invalid_payload 诊断，不能恢复模型原输出，也不能断言所有 invalid_payload 都来自这一缺口。

新增 claims `known_game_fact`、`model_evaluation`，分别严格绑定同一决策的 KnownGameFact、ModelEvaluation 节点。非空 claims/前提、候选比较范围、节点类型检查和未知语义保持。模型证据的 authority=model 不变。provider-neutral contracts、短引用解码、生成/存档读回校验、Codex 输出 schema 共同消费同一契约；换 provider 仍使用领域校验。

prompt v6 说明无确定性优势时据现有局面事实和模型建议解释，并明示证据限度。grounding 版本 v3。v3/v4/v5 prompt 字节和版本对应请求 audit 重建保持；历史 prompt 不接受新 claims，不改写旧报告。

## 验证

`coach-without-factor-differences.test.ts` 修复前在 `prepared.decode(wire)` 得到 null，修复后通过生成 → ready Explanation → report readback。覆盖无因素/差异、伪造、错类型、跨决策引用与存档篡改。`coach-context.test.ts` 覆盖 v3/v4/v5 存档 audit、错误版本标签和上下文绑定。

真实单决策验证与完整门禁结果保存在源码外 `coach-acceptance-evidence/coach-scene-labels-20261006`；交付回执记录最终结果，不继承历史 PASS。

## 工程检查

- Locality：scene facts 在 canonical projection；解说能力在现有 contracts/decoder/validator/provider 边界。
- Invariants：源身份、authority、未知状态、当前/终局分数分离；旧报告不可变。
- Traceability：版本化 prompt 与 request audit，修复前失败记录及真实 mintest。
- Replaceability：provider 不负责建立事实；领域 schema/grounding 统一消费。
- Recoverability：错误输出保持 evidence_only，不重试语义失败，不覆盖历史报告。
- Semantic Load：新增两个来源明确的 claims，不扩展通用自由引用或合法动作引擎。

## 仓库变更控制

架构主干以 `docs/development/ARCHITECTURE.md`、ADR-0005/0006 和唯一登记表
`INVARIANTS.md` 为准。此改动扩展既有 KnownGameFacts、Coach claims 与 request audit，
不建立新事实来源或合法动作来源；没有新增架构级抽象。

| 不变量 | 既有登记状态 | 此次执行保护 |
| --- | --- | --- |
| INV-001/002/008 事实与模型/教练判断分离 | machine-enforced | `known-game-facts-v2`、`known-game-facts-context-flow`、`coach-without-factor-differences` 回归；模型 claim 仍引用 ModelEvaluation |
| INV-003/005 来源与 UI 边界 | machine-enforced | `check:architecture`，provider-neutral claim kinds；renderer 只接收标题 DTO |
| INV-007 版本化产物 | machine-enforced | factorPipeline/v3 包身份回归、历史 v3/v4/v5 request audit 回归 |
| INV-011/012 严格存档读回 | machine-enforced | `coach-context`、`review-session-persistence`、真实隔离库保存重开；旧报告不重写 |

此次不降低这些登记状态或放宽来源/节点归属校验。执行结果、原始日志和最终提交绑定
在源码外交付回执；定向 PASS 与最终五门结果分别记录。
