# 自动评审与修复

当前实现：Review Loop v2，2026-09-20 按用户明确接受已知风险的决定合并部署用于试用。
这是人工放行，不是独立评审 PASS；已知问题和原始结论保留如下。
权威协议：[v2 spec](../specs/2026-09-20-review-loop-v2.md)。

流程：Multica webhook/schedule → 受信本机 Controller → GitHub live PR → fresh Reviewer
→ 完整 findings → 现有 Fixer → pushed HEAD → 下一轮 fresh Reviewer。默认最多三轮；
仅 PR #8 已获用户两次明确批准追加第四、第五轮，授权与原有轮次一起留存在 ledger。

## 接入 PR

将编码 Ticket 交给现有 `Ticket 编码执行器`。该智能体已接入本指南：推送实现后创建/
更新同仓库 PR，填写该 Ticket 实际适用的权威文档和验收要求，准备完成后由五分钟
schedule 自动发现。需要用户裁决的 PR 保持待确认。无需为每个 Ticket 配 webhook。

在 PR description 加入 spec 中的 `review-loop-admission` block，填写实际批准的 spec
路径和验收 rubric。只接受同仓库已推送且 ready 的 PR。无需 GitHub 正式 approval
或额外账号；评审与合并权限分开。结果在 GitHub `Review Loop v2` status 和 Multica issue。
GitHub status 是同提交所有已接入 PR 的聚合门禁，单个 PR 的结论以其 ledger 和评审
原文为准。共享提交上只有所有 live 候选都通过才会显示 success。

配置与 ledger 保存在专用部署目录外的本机私有状态目录。示例配置见
`scripts/review-loop/config.example.json`。首次 enabled=false，用真实 GitHub 只读检查后启用。
所有路径须绝对路径；CLI profile/workspace 必须明确。部署 checkout 固定受审版本，不能
指向任意 PR checkout。现有用户 checkout 与未提交工作不会被覆盖。

```powershell
node coach/scripts/review-loop/runtime.mjs tick C:\absolute\review-loop.local.json
```

Multica Controller 智能体只运行此命令，程序承担同一控制角色的状态判断和派发。
Autopilot run_only，Agent concurrency=1，schedule 每五分钟，
generic webhook 作为可选即时唤醒。URL 只保存在本机 secret file 或 secret store，POST body
只用于唤醒，不能指定命令、repository、HEAD 或结果。通知可用稳定 Idempotency-Key 减少重复
Controller run；程序仍靠 ledger 防重复任务。Controller Autopilot 不绑定项目的
in-place 本机目录，避免与 Reviewer/Fixer 争用目录锁；评审/修复工单仍属于 Coach 项目。

## 故障与恢复

- `health.json`：最近成功扫描时刻、PR 状态、轮次和当前 issue；超过两次周期未更新先查
  Multica Autopilot runs、daemon 和主机在线情况。智能体 run 显示 completed 不足以证明
  程序成功，须同时核对程序 JSON 和 health 更新时间；固定命令执行失败会等待下次唤醒。
- `pr-N.json`：完整轮次与来源账本；`results/` 保存完整评审，`snapshots/` 保存 GitHub 观察。
- BLOCKED：先读 reason 与对应 issue。已有 tasks 的实际状态通过 `multica issue runs` 核实。
  不能因为观察超时就重新创建任务，不能删除 ledger 绕过轮次上限。
- 人工追加：只有收到针对该 PR 的明确批准后，暂停 Autopilot、设置 enabled=false，
  核验无活动 Controller，再持锁备份 ledger、验证第三轮原文 hash 与来源，调用
  `authorizeExtraReview` 并原子保存。保留全部 round/history；第一次仅允许第四轮。
  PR #8 的第二次明确批准另绑定第四轮结果并验证原授权，最多第五轮，不开放第六轮。
  普通 tick 不会自动恢复 BLOCKED；达到已批准上限仍有阻断项则停止。
- `publication-<sha>.json`：同一提交的成员集与聚合发布缓存。它不授予 PASS，源事实仍
  是实时 GitHub 状态及每个 PR 的已核验 ledger；旧 per-PR published 字段不再用于发布。
  POST 前缓存先落为 uncertain；响应丢失或进程中断后，下次会按实时聚合重新发布。
- 孤儿锁：暂停 Autopilot，核实 PID 已退出后运行 `runtime.mjs recover-lock <config>`；
  该命令会拒绝仍存在的 PID。恢复后重新 tick 并回读任务，最后恢复 Autopilot。
- 暂停：Autopilot pause 并将 enabled=false；已经分派的 agent run 不会因此自动取消，须
  单独查询并决定取消，避免误认为写操作已经停止。
- 升级：先停触发并确认无 Controller 进程；更新受信 deployment checkout，运行协议测试，
  保留 ledger 与凭据；只读运行确认后恢复。禁止并行部署两个状态目录指向同一组 PR。

## 验证与证据

`npm run test:review-loop-protocol` 检查生产状态机与适配器；五项门禁仍依 spec 原样运行。
2026-09-20 实测与上线记录：

- [交付 PR #8](https://github.com/ChildeRolando/MjsoulTileTrace/pull/8) 已合并；候选
  `c0639672622c407f56d91a8bedcc54d97cd512d6`，合并提交
  `b249d8b40035d1a96bc6425094acdc1269b18b2f`，两者 tree 完全一致。
  受信部署 checkout 已更新；后续收尾提交仅改变文档，不改变运行时代码。
- 五门全部通过，`npm test` 通过：Vitest 164 文件 / 1,898 项，另含 38 项编排回归。
  最终独立评审 COAC-25 仍为 CHANGES_REQUIRED，ledger 保留 BLOCKED / round=5。
  run `01a0be9b-6f25-7eed-b4a2-e842d3e0b7b9`，comment
  `01a0bea0-401b-7e63-a602-3b0d3c82f86d`，原文 SHA-256
  `c2560d5dfa61c9b1bd4f4d03915970d4c03746a5660569f01c6b37f497377ba1`。

- Autopilot `d715ccd5-692c-41e8-9f6f-b4f4306a6344`，run_only、project=null；
  Controller `a169a7d8-ee06-4b75-8658-68ac47131d8a`，Reviewer
  `e860cd42-646c-47e5-9076-5ef82fc3efe1`，复用 Fixer
  `ba77da89-8574-4dea-8fc2-24e841fc2754`。
- webhook trigger `9522702a-972c-4bc0-bd73-f136f4e1d668`；schedule trigger
  `f6632cf5-f2ae-4acb-a713-e15b2a9c77a5`，每五分钟，Asia/Shanghai。
  URL 不入库、不放入工单。
- disabled 实读检查零 dispatch；证据在私有部署目录
  `release-audit/disabled-receipt.json`。
- 真实 webhook run `01a0be9a-bfda-7046-b310-0dee6d66010f` 完成并派发 COAC-25；
  相同 Idempotency-Key 两次 POST 返回 accepted/duplicate，同一 delivery
  `01a0be9a-bfd5-7703-bced-26b9a0149f9c`。此前原生 schedule run
  `01a0be90-3e33-73d4-9bca-95d75ba62fe4` 完成，health 更新为 11:25:51Z。
- PR #8 的真实链路：COAC-19 → 自动修复 COAC-20 → COAC-21 → 自动修复 COAC-22
  → COAC-23（三轮上限停止）→ 人工批准修复 → COAC-24（四轮上限停止）
  → 第二次人工批准修复 → COAC-25。前两次修复由现有 Fixer 推送；最后两次为人工
  授权下的 operator 修复，不冒充全自动动作。
- 每轮原文、来源 comment/run、SHA-256 和决策完整保存在私有 `state/pr-8.json`、
  `state/results/`、`state/snapshots/`；轮次未重置，原文 hash 已逐轮核验。
- 旧 v1 checker/schema/manifest/fixtures 在交付变更中移除，Git 历史可恢复。
  旧 PR #7 已关闭；COAC-12 标注历史替代，COAC-14/15 已取消并标注替代。

本次 Codex 上线推进提醒在交付完成后停用；日常运行由上述 Multica 原生 Autopilot
承担，不需要该 Codex 对话持续在线。主机和 Multica runtime 仍须在线。

## 已知问题与本次人工放行

R5-001：新 PR 在尚未建立 review job 前被准入校验阻断时，发布器可能不更新 GitHub
共享 commit status；若该 SHA 曾被已关闭的 PR 标为 success，新 PR 页面可能保留旧绿灯。
这不会把本地 ledger 改成 PASS，但意味着不能只看 GitHub 绿灯决定合并：同时核对
该 PR 的 Multica 评审原文及 ledger 的当前 base/head、轮次和结论。

用户明确指示“不修了，直接上线，用出问题再修”，仅对本次交付接受此已知问题。
[批准记录](https://github.com/ChildeRolando/MjsoulTileTrace/pull/8#issuecomment-5749596459)。
未派发第六轮，未伪造 PASS，未重置或删除五轮记录。默认三轮、未来 PR 的门禁和
“评审通过不等于自动合并”的规则均保持不变。当前只验证了真实 review/fix/re-review
链路，未取得本次端到端 PASS；它是已记录的上线例外，不作为全部验收条件满足的证明。
