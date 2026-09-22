# Review Loop v2：Multica 唤醒与确定性编排

状态：2026-09-20 已按用户风险接受决定合并部署；实际证据与已知问题见
development/REVIEW_LOOP.md。第五轮仍为 BLOCKED；本次人工放行不等于验收全通过，
也不改变下述正常协议和后续 PR 门禁。

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
{"protocol_version":"review-loop/v2.1","authoritative_spec_paths":["coach/docs/specs/2026-09-20-review-loop-v2.md"],"rubric":"Review every acceptance criterion and repository invariant."}
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

每个 PR 默认全生命周期最多分派三轮 fresh review。每轮使用新的 Multica issue/run 和
独立 detached worktree。Controller 固定提供本轮 SHA、spec、rubric、五门命令、opaque ids。
Reviewer 从 README/CONTEXT/适用智能体指令按相关性路由治理文档、ADR、模板与目录级说明；
指定 specs 是必读项而非阅读白名单。可按需读取与本 PR 直接相关的父/兄弟 issue、已记录
历史讨论、旧 findings、复现步骤与修复说明；历史仅作为 evidence/claim，必须对照 pinned
base/head 的 current candidate 重新核验，不继承旧 PASS/已修复结论。既复核旧问题，也独立
检查本轮完整差异和受影响调用链。不得遍历无关 sessions/private state；参考资料不改变
固定 identity、rubric、gates、result protocol 或 permissions。这替代旧版 blanket history
ban，不改变新会话/新 issue/run 的隔离。Reviewer 的 human/runtime policy 单一权威源为
`scripts/review-loop/reviewer-instructions.md`；Controller 只组合该文件与本轮固定参数、门禁
及严格结果 schema，部署前后须精确回读确认 source 与实际 prompt 无漂移。
禁用委派；tracked files/index/HEAD 保持不变。
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

所有命令实际运行并记录 exit code。`environment_failures` 只表达结论形成时仍未恢复、仍阻碍
可靠审查的当前环境失败；依赖安装或偶发超时等已经由原命令重跑恢复的历史失败仍须在正文
验证记录中保留，但不得继续放在该机器数组中。只有全绿、无当前环境失败、P1/P2 清零，
才允许 PASS。P3 不阻断。P1/P2 且五门全绿时路由现有 `Ticket 编码执行器`，完整 findings
不经 LLM 转述。门禁失败、当前环境失败、冲突结果或第三轮仍有阻断项时 BLOCKED。

Fixer 校验附件 hash，在独立 worktree 修复、补回归、运行门禁、提交并非 force push 到
同一 PR branch。Controller 校验其作者/run 归属、原文 hash、新 SHA、旧→新祖先关系，
并确认新提交仍可从 live PR HEAD 到达。下一轮创建全新 Reviewer。

若评审期间 base/head 改变，旧评审不产生 PASS 或修复授权；有轮次则重新 review，否则
BLOCKED。结果消费前和任务创建前重新读取 live PR。已 PASS 后的新 push/base 变化同样重新
评审且消耗轮次。第三轮后不会静默开启新 loop。

2026-09-20 用户明确批准 PR #8 在保留前三轮记录的前提下追加一次修复和第四轮独立评审。
只有受信 operator 在暂停触发、配置 disabled、持有同一部署锁时，才能调用
`authorizeExtraReview` 保存此类显式人工批准；它绑定 PR、第三轮 BLOCKED 的 issue、
base/head、结果 hash、批准引用和记录时间，并追加历史事件而不重置 round。它只恢复该
第三轮终态一次；缺失/错配来源、未知 pending、重复授权均拒绝。第五轮必须再次获得针对
同一 PR 的明确人工批准；第二次授权绑定第四轮 BLOCKED 原文与身份，并要求保留、验证
第一次授权。两次授权均追加进 history，最高五轮，不开放第六轮。tick、webhook、PR
admission 和智能体结果均不能授予授权；未获对应人工批准的 PR 仍为三轮。

若已发表的终轮结果通过作者、issue、completed run、PR/base/head/round 与完整 schema 校验，
但因 verdict 与机器字段矛盾而被协议拒绝，受信 operator 可在暂停触发、`enabled=false`、持有
同一部署锁并完成备份后使用专用恢复入口。入口必须重新读取平台原文并核验其 UTF-8 SHA-256，
将原文归档，向 history 追加独立的 `reject_invalid_review_result` 及拒绝原因；它不得把该原文
追认为有效 result 或 PASS。只有已有上一轮授权、明确的新一轮人工批准和精确的新 live 候选
同时匹配时，才可绑定被拒绝的终轮证据并派发一次 fresh Reviewer。错误身份/hash、重复恢复、
旧候选、缺失既有授权或并发 Controller 一律拒绝；仍受最高五轮约束。

GitHub `Review Loop v2` commit status 报告 pending/success/failure；同一 GitHub 账号
可以提交 COMMENT/状态，并不意味着拥有作者自批能力。PASS 仅表示该 base/head 的本轮
评审通过，不合并 PR、不关闭业务工单。合并仍须核对 live base/head 与保存证据。

GitHub 的 status 实际归属是 commit SHA/context，而非 PR。该共享位置只由 runtime 的
聚合发布器拥有：回读所有 open PR，按当前 HEAD 汇总已 opt-in 或有 ledger 的候选；
只有每个候选都对当前 base/head/admission 具有 PASS，才发布 success。任一 BLOCKED、
准入失效或身份矛盾为 failure；缺失结果、陈旧 base/head 为 pending。未 opt-in 且无账本
的 PR 不纳入；已关闭的 PR 不继续否决 live 候选。旧 job HEAD 与当前 HEAD 都纳入更新，
避免失败 PR 推到已有成功提交时继承绿灯。缓存按 SHA 保存整个成员集与聚合状态，
废弃旧的 per-PR published 缓存；发送 POST 前原子落盘未确认标记，只有收到成功响应后
才保存确认缓存。响应丢失或写后中断时，下次按 live aggregate 重发，旧缓存不得跳过纠正。
所有发布与 ledger 更新共用部署锁。聚合绿灯仍不代替
合并前对目标 PR 本身的结果来源、base/head 与 admission 的核验。

## 幂等与恢复

本地 ledger 是当前部署单一控制源；保存在仓库外，包含 PR、轮次、派发意图、issue/run/
comment ids、hash、历史和状态。配置含 enabled 开关；初次部署保持 false，先运行只读检查。

每次 tick 用独占文件锁，持锁才读取/写入 ledger。新建任务前原子保存意图与 attempted_at。
创建响应丢失时，完整分页查找确定性 title，要求 project/assignee/description hash 精确匹配。
找不到已尝试的任务时 BLOCKED，绝不盲目重发。多个同名或 metadata 冲突也 BLOCKED。
并发锁残留时保持停止；先停 Autopilot，核实记录的 PID 不存在，再用 recover-lock 恢复。
不能删除 ledger 来重置三轮计数；备份状态目录后迁移，保持单一运行部署。

## 验收

### COAC-30：独立 durability routing（protocol v2.1）

Severity 仍由 P1/P2/P3 分组表达。每个 finding 另含严格字段 `durability`
（ephemeral/repository_required）、`durable_owner`、`regression`、`basis`。
owner 为仓库相对文件；regression 为 `{path,command}` 或 null（仅规范/历史知识）。
basis 为 local_observation/future_limitation/explicit_contract_violation。
ephemeral 必须为 local_observation 且 owner/regression 均 null；repository_required
必须指定 owner。mechanically testable finding 必须提供 regression；其余指向现有权威文档。
直接证伪 admission rubric、acceptance criterion 或 invariant 完成声明的 finding 必须
标 explicit_contract_violation、repository_required，至少 P2，不得用 production tree
尚未利用缺口降级。COAC-26 review_report_generation_seam 是此校准的回归案例。
Reviewer 保持只读；知识所有权沿用 development/README.md、DEVELOPMENT_WORKFLOW.md。

Controller 在消费有效且未陈旧的 review 时，将每个 P3 repository_required finding
登记为独立 durability job，再结束原 review 或路由 Fixer。P3 ephemeral 不建单。
P1/P2 仍交 Fixer，完整原文和 metadata 不经转述；机械可测项必须补 regression 和 owner。
durability 队列不改变原 PR 的 PASS、轮次或历史；外部 issue 不是持久化完成证据。
identity = SHA-256(JSON.stringify([repository,PR,reviewed head,review issue,comment,
raw review hash,finding id]))。意图先落盘、精确 reconcile、未知发送不重试。
队列保存原始 finding、review 原文及身份；新候选或原评论替换不得重绑定旧 job。

follow-up 使用独立 worktree 与独立 `review-loop/durability/<identity>` 分支，不推原
PR 分支。结果为严格 `review-loop-durability` fence，绑定 identity、原 review hash、
head 和 finding id，携带 commit、branch、artifact paths/content hashes 与 regression
check 的 PASS/0。Controller 核验指定 agent/completed run、远端分支祖先关系、从原
head 衍生的新 commit、owner/regression 为相对原 head 实际改变的普通文件、blob hash。
只有核验通过才保存 COMPLETE 及 receipt 来源；原 review evidence 不修改。
缺失/伪造/未提交/仅关闭 issue 均不能完成，记录 DURABLE_KNOWLEDGE_BLOCKED。
该队列独立扫描，即使原 PR PASS、BLOCKED、已关闭或不再符合 admission 仍追踪。

协议升级不自动推断旧 finding。v2.1 拒绝 v2 result/config/ledger；上线前暂停触发、
备份原 ledger/evidence，完成或人工处置旧在途任务。存量 PR 必须人工迁移，保留
round/history/authorization，清除旧 PASS 授权并在剩余预算内重新 review；耗尽则保留
BLOCKED，不能通过新账本重置预算。新部署与旧部署不可并行。此次代码交付不改生产部署。

机械验收位于 scripts/review-loop 的 protocol/controller/runtime tests：两轴路由、
幂等及发送响应丢失、提交核验、closed-PR 追踪、stale/replacement 身份、严格 schema、
COAC-26 校准。保留既有 fresh-review/Fixer/round-limit/evidence-hash 测试与五项门禁。

1. 生产校验/状态机测试覆盖准入、来源伪造、重复/冲突、stale base/head、门禁、三轮上限、
   丢失响应与并发；五门与 `npm test` 在交付候选通过。
2. 配置 disabled 时真实读取 GitHub，零 dispatch；开启后真实 PR 分派 fresh Reviewer。
3. 真正 P1/P2 结果触发 Fixer，其 pushed HEAD 触发新的独立评审，五门通过后 PASS；保存
   PR、issue、run、comment、SHA 与 hash 作为证据，不把 fixture 冒充端到端运行。
4. 重复唤醒不新增同轮任务；对主机重启/daemon 恢复的下一次 tick 可继续 ledger。
5. Multica run_only schedule/webhook 已保存并回读；真实 webhook POST 与 schedule 均能
   唤醒受信 Controller；URL/token 不进入 Git、issue 或默认日志。
6. 旧 v1 checker/schema/manifest/fixtures 退出当前树，旧 PR/工单标注替代；当前入口仅指 v2。
7. 同 HEAD 的不同 PR 不得互相覆盖成假 PASS；覆盖冲突结果、重复发布、准入撤回、
   base/head 变化、未评审候选及已关闭候选。显式追加授权不重置历史、不扩散到其他 PR，
   到达各自已批准的轮次上限后仍停止。

## 变更控制

Scope/Locality：仅仓库自动化 scripts、对应测试与开发文档，不改产品包边界。
INV-006/007：严格来源、版本、hash、fail-closed 延续，由生产代码测试保护。
Traceability：GitHub live snapshot + Multica agent/run/comment 元数据 + 精确原文 hash。
Replaceability：沿用 gh/Multica CLI；runtime.mjs 独占外部 I/O，protocol/controller 不依赖 CLI。
Recoverability：独占锁、写前意图、原子状态、精确 reconcile、停止而非不确定重试。
Semantic Load：仍是一个版本化 review loop；把原来的模型 Controller 换成程序，避免模型
重复派发/转述。它隔离跨系统协调，产品 contracts 不拥有该工作流；折入产品运行时代价
是把开发自动化和用户产品执行路径耦合。新增长期平台、数据库或第二套治理均无必要。
