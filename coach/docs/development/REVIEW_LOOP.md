# Review Loop 接入、Multica 直接评审与轻量交付

本页说明 Coach 产品与本地交付工具的边界。工具源码、测试和发布由独立本地工具仓维护。

## 当前接入（2026-10-27 生产读回）

本节只记录边界与分工，不复制工具实现。事实来源：生产配置
`C:/Users/Roland/.multica/review-loop-v2/config.json`，以及工具证据
`production-activation.json`（2026-10-26T19:02:22Z，`status=ACTIVATED`，
release `f26ef56b6c2a3c40b5a48bef98080b2318c51ec7`，前一版本
`0b25ae3f519a47bf4e66a4bbf28b79b546b4d504`）。配置、凭据、私有 ledger 与 state
目录仍只在私有工具目录，不进入本仓库。

### 运行时

- `review.enabled=true`、`delivery.enabled=true`；二者与顶层 `enabled` 不是同一开关。
- 顶层 `enabled=false` 继续表示**旧 Controller Autopilot 暂停**：固定版本部署前工具会断言它为
  `false`，`maintenance` 也把 `legacy_controller_enabled` 读作它的值。它不是自动评审的关闭信号，
  也不能据此推断评审未启用。
- `auto_merge` 与 `delivery` 均为 squash；状态检查上下文仍是 `Review Loop v2`。

### Reviewer 池（multi / priority）

- `review.engine=multi`、`review.mode=priority`：按 `review.reviewers` 的顺序，最高优先级的可用
  reviewer 独自决定本轮；该 reviewer 饱和时顺延到下一位；全部饱和时本轮等待容量，不把排队伪装成执行。
- 当前池为两位：`gptweb`（GPT-Web 独立评审）与 `local`（本地独立评审），各自 `max_concurrency=1`。
- `capacity_key` 表达共享执行资源，不只按 agent 计数。`gptweb` 共用 `gptweb-browser` 容量，
  `capacity_resources.gptweb-browser.max_concurrency=1`，状态来自本机网页桥的鉴权
  `/v1/status`。**GPT-Web 全局并发为 1**：复制 agent 或改显示名都不会增加真实浏览器页容量。
- 网页桥忙碌时适配器 `reject_if_busy`，不隐藏排队；已超等待预算但真实 run 仍活跃的评审继续占用
  资源并接收本轮迟到结果。

### 工作树小队

- 项目资源使用 `execution_mode=worktree`：每位成员拿到平台分配的隔离分支与目录，代码负责人不争用
  原始 checkout。
- 小队是平台既有对象，只用于启动既有的业务子票；没有第二套队列、第二套消息通道或新的流程工单。

### 结果文件与授权目录

- **结果文件是唯一评审事实源**。Reviewer 读取工具入口给出的固定候选、worktree 与结果路径，只把
  结论写入 `context` 给出的 `result_path`；GPT-Web 通过 `codexpro write` 写入固定授权根下的相对
  结果路径，会话文本仅作留档。缺少文件就保留待处理，不从文字补造文件；结果里的 `head_sha` 必须
  与本轮候选相等。
- 授权结果根由 `review.result_root` 与 `review.result_workspace_root` 共同决定，当前为
  `E:/文档/日麻教学/production-review-results`（工作区根 `E:/文档/日麻教学`），按 PR 分子目录。
  这是**授权写入/读取根的变化**，不是把私有 state、凭据或 ledger 公开：`state_dir` 仍在
  `C:/Users/Roland/.multica/review-loop-v2/state`，配置与凭据仍在私有目录。
- 中台消费结果：PASS 发布检查、正常合并并在确认 merged 后关票；CHANGES_REQUIRED 回到同票编码
  执行器修复新 head 复审；BLOCKED 如实保留。Reviewer 不执行平台状态、GitHub 写或合并。

### 与历史记录的关系

下面的 2026-10-15 说明是**当时**的接入记录（单 reviewer、`engine=multica`、旧结果路径与旧
prompt 协议）。它保留原始含义，便于理解旧 PR 与旧验收，但不描述当前行为；后续工具发布也不
追溯改写旧记录。日常评审入口仍是 `review-queue.mjs register`，交付入口仍是 `delivery.mjs`。

## 历史接入说明（2026-10-15，已不代表当前接入）

本次工具改造和验证由Codex完成；日常自动评审仍在Multica的Reviewer run中执行。编码结束直接交Reviewer，通过后合并关同一业务票，阻断直接回本票编码执行器，不经过Controller、不新增流程工单。Codex评审是明确启用的备用入口。轻量程序通过GitHub / Multica CLI交接及交付，不是Multica GPT MCP；旧Controller Autopilot保持暂停。

编码执行器完成相关实现、验证、现有owner更新和正常推送后，创建或更新同业务票PR，在原票记录真实结果并设为in_review（no-start），自行登记，无需用户填写JSON：

```powershell
& 'E:/IDE/NodeJS/node.exe' 'C:/Users/Roland/.multica/review-loop-v2/review-queue.mjs' register 'C:/Users/Roland/.multica/review-loop-v2/config.json' <PR编号> <业务票ID或COAC编号>
```

Coach与Arena项目已显式映射。默认 `review.engine=multica`；隐藏任务 `ReviewLoopReview` 等本票编码run结束，将现有业务票所有权交给Reviewer并启动一次fresh普通run。Reviewer用本机入口context取得固定候选、工作树、结果路径；依据本票接受条件评审，只原子提交内部结果文件。中台定时读取结果，负责平台状态流转、同票修复交接、GitHub评论/检查发布、正常合并并确认merged后关票。Reviewer不执行平台写操作，complete入口已移除，也不主动调用run、reconcile或delivery submit。

P1/P2须有本票接受条件和可复核证据。阻断待Reviewer本次run结束后直接交原票编码执行器，最小修复及相关验证、正常推送原分支，再登记新head交Reviewer复审。复用未受影响的独立结论，明确P1/P2持续触发同票修复和复审，直到验收通过，不按轮数或修复次数截断；P3仍是建议。实际环境阻塞、缺结果或缺新候选时如实停止，不自动切换Codex。临时断线保留当前阶段并返回RETRY_IO，下次定时对账接续；晚到的结果仍会接收。发送结果不明先读回既有run或GitHub评论，避免重复派发和重复发布。旧读取错误或旧轮数上限造成的停滞记录也由既有入口恢复，保留轮次和原发现。已准备的结果文件可由后台继续收尾，同head不重复派发，等待中的PR不挡其他业务票。

当前Reviewer system prompt来源为工具仓的 `multica-reviewer-system-prompt.md`（review-loop/reviewer-direct/v3）。它替代日常评审中的旧Controller授权、固定五门、规则/会话哈希回执和旧结果fence；结果只包含候选、裁决、发现、适用检查及限制。旧prompt与协议保留供历史查询。

操作员明确使用 `register-codex <config> <PR> <业务票> [worktree]` 后才走本机Codex备用评审；已有原生评审或修复待处理时不能直接覆盖。备用每次模型调用25分钟，明确P1/P2持续修复复审至通过，不改变默认路线。

定时发现仅是登记遗漏的补救：同仓库、非draft、标题/正文唯一COAC编号、已映射项目、in_review且无活动run。多业务票PR由执行器显式登记；编码结束回复须区分已推送/已登记/待独立评审与最终通过。

负责人提交 PR number、已验收 head、验收结论与来源；本任务结束条件确实是“验收有效且 PR 已合并”时，可明确关联业务 issue。程序发布当前 head 的检查、按 GitHub 规则正常合并、回读确认 merged 后关票；关票使用 `--no-start`，不唤醒 Agent。需要部署或其他验收的总工单须先满足其条件，不得因一个文档 PR 合并就关闭。

```powershell
& 'E:/IDE/NodeJS/node.exe' 'C:/Users/Roland/.multica/review-loop-v2/delivery.mjs' submit 'C:/Users/Roland/.multica/review-loop-v2/config.json' '<已有验收请求.json>'
```

Reviewer只提交结论。请求由Mika或执行负责人复用验收后准备，使用前可将 `submit` 换为 `preview` 只读回核对。命令不要求 `review-loop-admission`、`scope_proof`、模型会话或规则 hash；已接受的验收不会因此重新审查。维护者接受已知问题使用 `owner_accepted`，保留原发现和失败检查，不伪造无问题的评审结论。

GitHub `Review Loop v2` 名称暂作兼容：绿色表示所引用的验收或维护者接受支持当前交付；description/证据入口说明范围，不声称重新执行了全量产品门禁。其他 GitHub 保护仍由平台执行。候选变化停止相关写动作；响应丢失由程序回读。已有验收的 `ReviewLoopDelivery` 空队列只读本地；评审发现程序空闲时会读平台，无新候选不调用模型。两个定时器均无窗口启动，使用Roland当前Windows登录会话，不弹cmd。

## 运维与历史收口（2026-10-15）

运维使用独立的 `maintenance.mjs inventory|resource-preview|storage-gc` 及既有固定版本发布入口，不进入每分钟交付关键路径，不启动旧Controller或新增流程票。旧PR账本与评审原文保留为历史；已关闭PR的旧pending不再执行，旧CHANGES_REQUIRED不会改成PASS。批量收口先停旧自定义wakeup、先结束父流程票再关闭子票，防止内建children_done接续；no-start不取消其他票的监听。已交付的历史评审票结束评审阶段，被替代的旧实现/恢复路线及放弃PR的未完成修复以cancelled收口。

安装器不再永久pin每次发布；current/previous、人工pin和实际引用仍保护版本。已登记、无人工pin的被替换版本，首次确认被替换时写入30天后的expires_at，重复安装不延长。到期后仍由既有移除入口核对完整launcher/producer清单及活动，缺完整历史清单则保留；不按版本数量或创建年龄删目录。

目录和Git登记均已不存在、无lease/pin的已登记资源，storage-gc只回读修正removed/CONFIRMED_ABSENT，不删除文件或重放评审。恢复备份、独有或脏工作树、正在使用的资源继续保留。历史诊断文件归档不等于原审查通过。

## 所有权

- 独立本地工具仓拥有 Review Loop 源码、工具测试和发布版本。管理员部署固定版本；配置、凭据、ledger、结果和快照保存在 Coach/GitHub 共享仓之外的私有状态目录。
- Coach 拥有产品 PR 的目标、接受条件和产品验收门禁；检查按[实际改动范围](VERIFICATION.md#按改动范围选择门禁)选择。
- Multica Reviewer只负责日常质量判断和结果提交；本机程序中台负责状态流转、同票派修复、检查发布、合并和关票。交付模块只消费有效验收，不再重复审查。同候选已有适用验收直接复用；Codex保留为明确启用的备用，检查按实际任务范围选择。

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
