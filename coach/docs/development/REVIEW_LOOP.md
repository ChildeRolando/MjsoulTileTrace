# Review Loop 接入与轻量交付

本页说明 Coach 产品与本地交付工具的边界。工具源码、测试和发布由独立本地工具仓维护。

## 当前交付方式（2026-10-15）

执行和审核在 Codex 完成，负责人直接复用已有验收交付，不再创建 Multica 执行/审核工单，也无需本人 @Controller。当前轻量入口已安装；旧 Controller Autopilot 已暂停，新定时程序仅收尾负责人已提交的任务。

负责人提交 PR number、已验收 head、验收结论与来源；本任务结束条件确实是“验收有效且 PR 已合并”时，可明确关联业务 issue。程序发布当前 head 的检查、按 GitHub 规则正常合并、回读确认 merged 后关票；关票使用 `--no-start`，不唤醒 Agent。需要部署或其他验收的总工单须先满足其条件，不得因一个文档 PR 合并就关闭。

```powershell
& 'E:/IDE/NodeJS/node.exe' 'C:/Users/Roland/.multica/review-loop-v2/delivery.mjs' submit 'C:/Users/Roland/.multica/review-loop-v2/config.json' '<已有验收请求.json>'
```

请求由执行者准备，使用前可将 `submit` 换为 `preview` 只读回核对。命令不要求 `review-loop-admission`、`scope_proof`、模型会话或规则 hash；已接受的验收不会因此重新审查。维护者接受已知问题使用 `owner_accepted`，保留原发现和失败检查，不伪造无问题的评审结论。

GitHub `Review Loop v2` 名称暂作兼容：绿色表示所引用的验收或维护者接受支持当前交付；description/证据入口说明范围，不声称重新执行了全量产品门禁。其他 GitHub 保护仍由平台执行。候选变化停止相关写动作；响应丢失由程序回读；无任务轮询不访问平台、不调用模型。定时器使用 Roland 当前 Windows 登录会话。

## 所有权

- 独立本地工具仓拥有 Review Loop 源码、工具测试和发布版本。管理员部署固定版本；配置、凭据、ledger、结果和快照保存在 Coach/GitHub 共享仓之外的私有状态目录。
- Coach 拥有产品 PR 的目标、接受条件和产品验收门禁；检查按[实际改动范围](VERIFICATION.md#按改动范围选择门禁)选择。
- 本地交付工具消费负责人确认的验收，不替负责人作新的质量判断。普通任务不强制另一次 AI 审查；必要的独立验收按具体任务要求完成。

产品发布等要求完整验收的任务保留五门；普通文档变更使用适用的文档检查：

1. `npm run typecheck`
2. `npm run build`
3. `npx vitest run`
4. `npm run check:architecture`
5. `npm run test:package-import`

Review Loop 工具协议与状态机回归由独立本地工具仓运行，不属于 Coach 产品的 `npm test`。

## 历史冻结协议

[`2026-09-20-review-loop-v2.md`](../specs/2026-09-20-review-loop-v2.md) 保留为 COAC-30 / `review-loop/v2.1` 的历史冻结契约，也是既有 admission 引用的原始路径。引用该路径的旧 PR 与候选仍按其当时记录的 spec path 和 rubric 理解；本接入页和后续工具发布不追溯替换或重解释这些历史准入。

该历史 spec 记录当时的产品准入与协议，不再拥有当前工具源码、测试或发布。工具发布与运行状态以管理员部署的固定本地版本及其私有 ledger 为准。
