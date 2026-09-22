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

雀魂国区登录、跨重启恢复、最近 30 场可分析目录、牌谱取回、canonical 重放、Mortal
整盘确定性分析、selector、ContextGraph 与 grounded ReviewReport 生成链均已接通；
**用户可见的 M7 review UI 与 M7-B 持久化仍未实现**。M7-A 的已冻结实现规格见
[`2026-09-21-m7-a-whole-game-fixed-review-ui-design.md`](../specs/2026-09-21-m7-a-whole-game-fixed-review-ui-design.md)，
M7-B 的已冻结实现规格见
[`2026-09-21-m7-b-review-session-persistence-design.md`](../specs/2026-09-21-m7-b-review-session-persistence-design.md)。

## 文档分层

开发自动化：[自动评审、修复与自动合并](REVIEW_LOOP.md)（部署状态与运行手册）；权威协议
及 COAC-65 自动合并冻结语义见
[`2026-09-20-review-loop-v2.md`](../specs/2026-09-20-review-loop-v2.md)。

- 本目录：living docs，随当前实现更新。
- `coach/docs/specs/`：批准的设计规格，解释某个切片要解决什么。
- `coach/docs/plans/`：逐文件实施计划，是执行时的历史快照。
- `coach/docs/handoffs/`：每次接力的事实记录、已知限制和验证结果。
- `coach/README.md`：推理核心的详细能力清单与命令行原型说明；内容较长，部分里程碑描述可能落后于本目录。
- `COMPLETION-AUDIT.md`：根目录静态课程的完成审计。

## 更新责任

合并任何改变“完成状态、架构边界、公开命令、测试门禁或下一个里程碑”的提交时，必须同步本目录对应页面。handoff 可以追加，但不能替代 living docs 的更新。
