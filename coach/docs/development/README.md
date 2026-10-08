# 开发文档首页

这里是 Riichi Coach 面向开发人员的**当前文档入口**。代码和自动测试是最终事实来源；本目录解释当前系统、开发顺序和验收方式。按日期保存的旧规格与 handoff 仍保留，但不要求新开发者先读完历史。

## 推荐阅读顺序

| 顺序 | 文档 | 解决的问题 |
|---|---|---|
| 1 | [当前路线图](ROADMAP.md) | 已完成什么、下一步是什么、哪些能力明确未完成 |
| 2 | [系统架构](ARCHITECTURE.md) | 数据从雀魂到教练输出如何流动，模块边界在哪里 |
| 3 | [架构不变量登记表](INVARIANTS.md) | 哪些架构级不变量必须守住，由什么检查保护 |
| 4 | [本地开发入门](GETTING_STARTED.md) | 如何安装、运行、测试和启动现有原型 |
| 5 | [开发工作流](DEVELOPMENT_WORKFLOW.md) | 如何拆任务、写契约、做 TDD、提交和交接；大改动变更控制协议与抽象准入规则 |
| 6 | [测试与发布门禁](VERIFICATION.md) | 改动到哪一层，应运行哪些门禁，何时允许宣称完成 |

## 当前一句话状态

雀魂目录与牌谱分析、managed local Mortal、grounded ReviewReport、M7-A/B，以及 account 与
share-import 到 Review Workspace 的 A–D 组合均已合入 master；最终候选的 Electron Golden Slice、
固定五门和 fresh independent review 均已通过。真人 smoke 目前只绑定较早候选
`d302c383`，其后的最终候选改动尚未由真人账号/provider 流程覆盖。**Playable Review MVP
仍为 not DEMOABLE；唯一剩余发布门是对最终合并版本完成获授权的真人 smoke。** 当前证据和
逐项 §7 对照见[路线图](ROADMAP.md)与[发布验证记录](VERIFICATION.md)。
M7-A 的冻结规格见
[`2026-09-21-m7-a-whole-game-fixed-review-ui-design.md`](../specs/2026-09-21-m7-a-whole-game-fixed-review-ui-design.md)，
M7-B 的冻结规格见
[`2026-09-21-m7-b-review-session-persistence-design.md`](../specs/2026-09-21-m7-b-review-session-persistence-design.md)，
最终应用组合与发布闭合以
[`2026-09-24-playable-review-mvp-integration-closeout.md`](../specs/2026-09-24-playable-review-mvp-integration-closeout.md)
为准；其中 manual-import 的生产模型前置已由
[`2026-09-24-local-mortal-runtime-production-design.md`](../specs/2026-09-24-local-mortal-runtime-production-design.md)
冻结为 managed local Mortal + `mortal-582500`。PR #28 已合入；产品主链消费其真实
checkpoint production seam；spike 本身不替代 §7 的组合发布验收。

### 历史开发阶段记录（2026-09-29）

[libriichi 唯一合法动作来源重构](../specs/2026-09-28-libriichi-legal-action-authority-design.md) 的真实整场可靠性验收当时是开发主线：
第二套本地合法动作推导已退出，helper 教学事实保留。决策见
[ADR-0006](../adr/0006-libriichi-single-legal-action-authority.md)，执行见
[迁移计划](../plans/2026-09-28-libriichi-legal-action-authority-migration.md)。
截至 2026-09-29，唯一来源已接入且真实牌谱来源已补全；完整分析档案的保存重开已通过
实现侧回归。该阶段随后完成；当前 Playable Review 发布状态与实际剩余门见[当前路线图](ROADMAP.md)
及[发布验证记录](VERIFICATION.md)。

## 文档分层

评审接入边界：[Review Loop 接入契约](REVIEW_LOOP.md)。工具实现、测试与发布由独立本地仓维护。

- 本目录：living docs，随当前实现更新。
- `coach/docs/specs/`：批准的设计规格，解释某个切片要解决什么。
- `coach/docs/plans/`：逐文件实施计划，是执行时的历史快照。
- `coach/docs/handoffs/`：每次接力的事实记录、已知限制和验证结果。
- `coach/README.md`：推理核心的详细能力清单与命令行原型说明；内容较长，部分里程碑描述可能落后于本目录。
- [Windows Sandbox 禁网 spike](WINDOWS_SANDBOX_SPIKE.md)：已有 Windows 模型资产的可选离线可用性验证配置、执行与证据回读。
- `COMPLETION-AUDIT.md`：根目录静态课程的完成审计。

## 更新责任

合并任何改变“完成状态、架构边界、公开命令、测试门禁或下一个里程碑”的提交时，必须同步本目录对应页面。handoff 可以追加，但不能替代 living docs 的更新。
