# ADR 约定（coach）

本目录存放 coach 的架构决策记录（Architecture Decision Records）。只记录
**未来开发者/agent 会问"为什么当初在多个合理方案里选了这一个"**的根基决策；
例行决策、功能规格、路线图状态不进本目录（分别进 `docs/specs/`、`docs/plans/`、
`docs/development/`）。

## 何时写 ADR

- 两个及以上当时都合理、且后果影响多个包的方案被取舍时；
- 决策与既有文档表面表述存在张力、需要钉死权威版本时（如 ADR-0003 取代早期
  "DeterministicPreference 是最终裁判"的说法）；
- 决策影响依赖方向、信任边界或数据权威，且代码已有事实约束需要文档化时。

不要为"每步实现选择"写 ADR；不要批量回溯历史决策。

## 最小字段

```markdown
# ADR-00NN：<标题——决策本身的一句话>

日期：YYYY-MM-DD
状态：已采纳 / 已冻结 / 已废弃（被 ADR-00MM 取代）

## Context
背景、约束、代码事实。术语以 ../../CONTEXT.md 词汇表为准。

## Decision
采用什么，明确"不采用什么"。

## Alternatives considered
至少列出被拒绝的方案与拒绝理由。

## Consequences
正面与负面后果、需要同步改动的机制。

## Supersedes / Superseded by
适用时列出被取代/取代它的 ADR；无则省略。
```

## 编号与文件

- 连续编号 `0001` 起；新 ADR 用下一个可用编号。
- 文件名 `<编号>-<kebab-case-标题>.md`。
- 既有 ADR-0001–0004 使用略不同的标题结构（`## Considered Options` /
  `## Consequences`），作为历史记录保留有效；新 ADR 一律用本模板。

## 与其他文档的关系

- 架构边界、数据流的 living 描述在 `docs/development/ARCHITECTURE.md`；
  ADR 钉死"为什么"，ARCHITECTURE 描述"现在是什么"，两者互相链接。
- 不变量登记表 `docs/development/INVARIANTS.md` 引用 ADR 作为权威裁定来源。
