# Review Loop v2：Multica 唤醒与确定性编排

状态：实施中；实际部署与真实验收证据见 development/REVIEW_LOOP.md。

## 范围与裁决

用户 2026-09-20 授权重新设计、清理旧方案并上线自动评审。本文替代 v1 及其
normalized-webhook 提案；旧文件从当前树移除，历史仍可从 Git 恢复。

Multica 的 generic webhook URL 内含调用凭据，保存为本机秘密。它只唤醒
Controller；任意 POST 内容均不拥有 PR 身份、HEAD、结果或放行权威。因此不需要
GitHub provider/signing-secret 参数，也不依赖 multica-ai/multica #8583。
没有配置签名密钥的 generic webhook 不承诺在创建唤醒 run 之前执行 GitHub HMAC。
本协议不接收外部 webhook 的事实声明，故删除 v1 的原始 delivery 字节读取前提。

Multica Autopilot 使用 run_only 模式、专用 Controller Agent、并发 1，配置 generic
webhook 和每五分钟 schedule。两种触发均执行已部署的同一 Node 程序 `runtime.mjs tick`。
该程序读取 GitHub API，按本协议创建 Multica review/fix issues。Controller Agent 不解释
事件内容、不决定状态、不审查代码。定时触发补偿丢失通知、GitHub GITHUB_TOKEN
产生的非触发 push 和智能体未主动通知的完成事件。无需 Docker、本机入站端口或新服务。

这里的 Controller Agent 是程序在 Multica 的执行入口，二者属于同一个控制角色；
没有额外 Launcher 角色。Controller Autopilot 不绑定项目的 in-place local_directory，
避免被长时间运行的评审/修复任务占住项目目录锁；创建的 review/fix issues 仍属于 Coach。

部署目录为受信的专用 checkout；不会自动从被审 PR 加载 Controller 代码。
主机在线且 Multica daemon 在线是运行条件。离线时不宣称有新结果，恢复后下一轮扫描补齐。

## 准入与来源

仅 `ChildeRolando/MjsoulTileTrace` 的 open、non-draft、同仓库 PR 可进入流程。
PR description 必须含唯一 `review-loop-admission` JSON fence：

```review-loop-admission
{"protocol_version":"review-loop/v2","authoritative_spec_paths":["coach/docs/specs/2026-09-20-review-loop-v2.md"],"rubric":"Review every acceptance criterion and repository invariant."}
```

它是显式 opt-in；未提供该 block 的 PR 不自动执行代码或分派任务。读取实时 PR 后验证
full base/head SHA、同仓库来源、严格 admission 字段、存在且非 symlink 的仓库文档路径。
admission 在整个 PR loop 内固定，修改后停止，需人工核对恢复。
代码执行信任范围是此用户管理的同仓库分支；这是 Agent 输入隔离，不是敌对代码沙箱。

来源语义是 `github-rest-json-utf8/v1`：通过已认证 gh API 读取 GitHub 状态，记录观察时刻
与保存的 JSON UTF-8 内容 hash。它不是 GitHub webhook 原始字节或 GitHub 签名证明。
GitHub 当前查询拥有 PR 身份、base/head；任何 webhook JSON 都只是唤醒信号。

## 执行与状态

生产契约与校验器为 `scripts/review-loop/protocol.mjs`，生产状态机为
`controller.mjs`；测试调用同一生产代码，不再用另一套离线模型模拟平台完成。

每个 PR 全生命周期最多分派三轮 fresh review。每轮使用新的 Multica issue/run 和
独立 detached worktree。Reviewer 只接收本轮 SHA、spec、rubric、五门命令、opaque ids。
不输入旧 findings、父/兄弟 issue 或旧 session。禁用委派；tracked files/index/HEAD 保持不变。
运行依赖安装与忽略的构建产物允许。Controller 实际检查 review worktree 的 HEAD 与脏状态。

review 结果必须由指定 Reviewer 在本轮 issue 发表，且 `source_task_id` 对应它的 completed
run。正文最后包含一个 `review-loop-result` JSON fence；字段与严格 schema 由生产
`parseResult` 校验。伪造作者、错误归属、未完成 run、多个结果、畸形/矛盾输出均停止。
完整原文以 UTF-8 SHA-256 绑定并保存在本地 evidence；fix issue 附件和本地副本均为相同 bytes。

五门固定在 `coach/` 运行：

| id | command |
|---|---|
| typecheck | `npm run typecheck` |
| build | `npm run build` |
| vitest | `npx vitest run` |
| architecture | `npm run check:architecture` |
| package-import | `npm run test:package-import` |

所有命令实际运行并记录 exit code。只有全绿、无环境失败、P1/P2 清零，才允许 PASS。
P3 不阻断。P1/P2 且五门全绿时路由现有 `Ticket 编码执行器`，完整 findings 不经 LLM 转述。
门禁失败、环境失败、冲突结果或第三轮仍有阻断项时 BLOCKED。

Fixer 校验附件 hash，在独立 worktree 修复、补回归、运行门禁、提交并非 force push 到
同一 PR branch。Controller 校验其作者/run 归属、原文 hash、新 SHA、旧→新祖先关系，
并确认新提交仍可从 live PR HEAD 到达。下一轮创建全新 Reviewer。

若评审期间 base/head 改变，旧评审不产生 PASS 或修复授权；有轮次则重新 review，否则
BLOCKED。结果消费前和任务创建前重新读取 live PR。已 PASS 后的新 push/base 变化同样重新
评审且消耗轮次。第三轮后不会静默开启新 loop。

GitHub `Review Loop v2` commit status 报告 pending/success/failure；同一 GitHub 账号
可以提交 COMMENT/状态，并不意味着拥有作者自批能力。PASS 仅表示该 base/head 的本轮
评审通过，不合并 PR、不关闭业务工单。合并仍须核对 live base/head 与保存证据。

## 幂等与恢复

本地 ledger 是当前部署单一控制源；保存在仓库外，包含 PR、轮次、派发意图、issue/run/
comment ids、hash、历史和状态。配置含 enabled 开关；初次部署保持 false，先运行只读检查。

每次 tick 用独占文件锁，持锁才读取/写入 ledger。新建任务前原子保存意图与 attempted_at。
创建响应丢失时，完整分页查找确定性 title，要求 project/assignee/description hash 精确匹配。
找不到已尝试的任务时 BLOCKED，绝不盲目重发。多个同名或 metadata 冲突也 BLOCKED。
并发锁残留时保持停止；先停 Autopilot，核实记录的 PID 不存在，再用 recover-lock 恢复。
不能删除 ledger 来重置三轮计数；备份状态目录后迁移，保持单一运行部署。

## 验收

1. 生产校验/状态机测试覆盖准入、来源伪造、重复/冲突、stale base/head、门禁、三轮上限、
   丢失响应与并发；五门与 `npm test` 在交付候选通过。
2. 配置 disabled 时真实读取 GitHub，零 dispatch；开启后真实 PR 分派 fresh Reviewer。
3. 真正 P1/P2 结果触发 Fixer，其 pushed HEAD 触发新的独立评审，五门通过后 PASS；保存
   PR、issue、run、comment、SHA 与 hash 作为证据，不把 fixture 冒充端到端运行。
4. 重复唤醒不新增同轮任务；对主机重启/daemon 恢复的下一次 tick 可继续 ledger。
5. Multica run_only schedule/webhook 已保存并回读；真实 webhook POST 与 schedule 均能
   唤醒受信 Controller；URL/token 不进入 Git、issue 或默认日志。
6. 旧 v1 checker/schema/manifest/fixtures 退出当前树，旧 PR/工单标注替代；当前入口仅指 v2。

## 变更控制

Scope/Locality：仅仓库自动化 scripts、对应测试与开发文档，不改产品包边界。
INV-006/007：严格来源、版本、hash、fail-closed 延续，由生产代码测试保护。
Traceability：GitHub live snapshot + Multica agent/run/comment 元数据 + 精确原文 hash。
Replaceability：沿用 gh/Multica CLI；runtime.mjs 独占外部 I/O，protocol/controller 不依赖 CLI。
Recoverability：独占锁、写前意图、原子状态、精确 reconcile、停止而非不确定重试。
Semantic Load：仍是一个版本化 review loop；把原来的模型 Controller 换成程序，避免模型
重复派发/转述。它隔离跨系统协调，产品 contracts 不拥有该工作流；折入产品运行时代价
是把开发自动化和用户产品执行路径耦合。新增长期平台、数据库或第二套治理均无必要。
