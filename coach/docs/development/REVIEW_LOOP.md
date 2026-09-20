# 自动评审与修复

当前实现：Review Loop v2。部署尚在验收中；不能把本页视为已上线证明。
权威协议：[v2 spec](../specs/2026-09-20-review-loop-v2.md)。

流程：Multica webhook/schedule → 受信本机 Controller → GitHub live PR → fresh Reviewer
→ 完整 findings → 现有 Fixer → pushed HEAD → 下一轮 fresh Reviewer。默认最多三轮；
仅 PR #8 已获用户明确批准追加第四轮，授权与原有轮次一起留存在 ledger。

## 接入 PR

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
  `authorizeExtraReview` 并原子保存。保留全部 round/history；该操作一次性最多允许第四轮。
  普通 tick 不会自动恢复 BLOCKED；第四轮仍有阻断项则停止。
- `publication-<sha>.json`：同一提交的成员集与聚合发布缓存。它不授予 PASS，源事实仍
  是实时 GitHub 状态及每个 PR 的已核验 ledger；旧 per-PR published 字段不再用于发布。
- 孤儿锁：暂停 Autopilot，核实 PID 已退出后运行 `runtime.mjs recover-lock <config>`；
  该命令会拒绝仍存在的 PID。恢复后重新 tick 并回读任务，最后恢复 Autopilot。
- 暂停：Autopilot pause 并将 enabled=false；已经分派的 agent run 不会因此自动取消，须
  单独查询并决定取消，避免误认为写操作已经停止。
- 升级：先停触发并确认无 Controller 进程；更新受信 deployment checkout，运行协议测试，
  保留 ledger 与凭据；只读运行确认后恢复。禁止并行部署两个状态目录指向同一组 PR。

## 验证与证据

`npm run test:review-loop-protocol` 检查生产状态机与适配器；五项门禁仍依 spec 原样运行。
真实部署 ID、触发记录与 review/fix 证据在完成实测后补在本节。未实测项保持未完成。
