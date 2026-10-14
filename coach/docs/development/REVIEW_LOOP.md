# Review Loop 接入、Codex 评审与轻量交付

本页说明 Coach 产品与本地交付工具的边界。工具源码、测试和发布由独立本地工具仓维护。

## 当前交付方式（2026-10-15）

执行和审核在 Codex 完成，负责人直接复用已有验收交付，不再创建 Multica 执行/审核工单，也无需本人 @Controller。编码后的待审PR进入本机Codex队列；旧Controller Autopilot已暂停。轻量通道是本地程序调用GitHub / Multica CLI，不是Multica GPT MCP。

编码执行器完成相关实现、验证、现有owner更新和正常推送后，创建或更新同业务票PR，在原票记录真实结果并设为in_review（no-start），自行登记，无需用户填写JSON：

```powershell
& 'E:/IDE/NodeJS/node.exe' 'C:/Users/Roland/.multica/review-loop-v2/review-queue.mjs' register 'C:/Users/Roland/.multica/review-loop-v2/config.json' <PR编号> <业务票ID或COAC编号>
```

Coach与Arena项目已显式映射。隐藏任务 `ReviewLoopCodexReview` 每分钟检查队列，等本票编码run结束后，在独立工作树运行Codex评审。P1/P2需有本票接受条件和可复核证据；必要时Codex最小修复，程序正常推送原分支，再对新head独立复审。复审复用此前独立评审未受影响的结论，通过后接下面的合并关票入口。默认最多两轮评审、一次修复，每次模型调用25分钟；阻塞或超限保留结果，不无限重试。相同head不重复调用模型，不创建平台执行/审核票。

定时发现仅是登记遗漏的补救：同仓库、非draft、标题/正文唯一COAC编号、已映射项目、in_review且无活动run。多业务票PR由执行器显式登记；编码结束回复须区分已推送/已登记/待独立评审与最终通过。

负责人提交 PR number、已验收 head、验收结论与来源；本任务结束条件确实是“验收有效且 PR 已合并”时，可明确关联业务 issue。程序发布当前 head 的检查、按 GitHub 规则正常合并、回读确认 merged 后关票；关票使用 `--no-start`，不唤醒 Agent。需要部署或其他验收的总工单须先满足其条件，不得因一个文档 PR 合并就关闭。

```powershell
& 'E:/IDE/NodeJS/node.exe' 'C:/Users/Roland/.multica/review-loop-v2/delivery.mjs' submit 'C:/Users/Roland/.multica/review-loop-v2/config.json' '<已有验收请求.json>'
```

请求由执行者准备，使用前可将 `submit` 换为 `preview` 只读回核对。命令不要求 `review-loop-admission`、`scope_proof`、模型会话或规则 hash；已接受的验收不会因此重新审查。维护者接受已知问题使用 `owner_accepted`，保留原发现和失败检查，不伪造无问题的评审结论。

GitHub `Review Loop v2` 名称暂作兼容：绿色表示所引用的验收或维护者接受支持当前交付；description/证据入口说明范围，不声称重新执行了全量产品门禁。其他 GitHub 保护仍由平台执行。候选变化停止相关写动作；响应丢失由程序回读。已有验收的 `ReviewLoopDelivery` 空队列只读本地；评审发现程序空闲时会读平台，无新候选不调用模型。两个定时器均无窗口启动，使用Roland当前Windows登录会话，不弹cmd。

## 所有权

- 独立本地工具仓拥有 Review Loop 源码、工具测试和发布版本。管理员部署固定版本；配置、凭据、ledger、结果和快照保存在 Coach/GitHub 共享仓之外的私有状态目录。
- Coach 拥有产品 PR 的目标、接受条件和产品验收门禁；检查按[实际改动范围](VERIFICATION.md#按改动范围选择门禁)选择。
- 本地评审队列负责调用Codex形成当前候选的质量判断；交付模块只消费有效验收，不再重复审查。同候选已有适用验收直接复用，无需为交付重新启动AI审查；检查按实际任务范围选择。

产品发布等需要完整验收时，五门如下；普通文档只使用适用的文档检查，不要求以下五门：

1. `npm run typecheck`
2. `npm run build`
3. `npx vitest run`
4. `npm run check:architecture`
5. `npm run test:package-import`

Review Loop 工具协议与状态机回归由独立本地工具仓运行，不属于 Coach 产品的 `npm test`。

## 历史冻结协议

[`2026-09-20-review-loop-v2.md`](../specs/2026-09-20-review-loop-v2.md) 保留为 COAC-30 / `review-loop/v2.1` 的历史冻结契约，也是既有 admission 引用的原始路径。引用该路径的旧 PR 与候选仍按其当时记录的 spec path 和 rubric 理解；本接入页和后续工具发布不追溯替换或重解释这些历史准入。

该历史 spec 记录当时的产品准入与协议，不再拥有当前工具源码、测试或发布。工具发布与运行状态以管理员部署的固定本地版本及其私有 ledger 为准。
