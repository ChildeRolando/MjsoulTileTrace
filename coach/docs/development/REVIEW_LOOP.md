# 自动评审与修复

当前实现：Review Loop v2。部署尚在验收中；不能把本页视为已上线证明。
权威协议：[v2 spec](../specs/2026-09-20-review-loop-v2.md)。

流程：Multica webhook/schedule → 受信本机 Controller → GitHub live PR → fresh Reviewer
→ 完整 findings → 现有 Fixer → pushed HEAD → 下一轮 fresh Reviewer。最多三轮。

## 接入 PR

在 PR description 加入 spec 中的 `review-loop-admission` block，填写实际批准的 spec
路径和验收 rubric。只接受同仓库已推送且 ready 的 PR。无需 GitHub 正式 approval
或额外账号；评审与合并权限分开。结果在 GitHub `Review Loop v2` status 和 Multica issue。

配置与 ledger 保存在专用部署目录外的本机私有状态目录。示例配置见
`scripts/review-loop/config.example.json`。首次 enabled=false，用真实 GitHub 只读检查后启用。
所有路径须绝对路径；CLI profile/workspace 必须明确。部署 checkout 固定受审版本，不能
指向任意 PR checkout。现有用户 checkout 与未提交工作不会被覆盖。

```powershell
node coach/scripts/review-loop/runtime.mjs tick C:\absolute\review-loop.local.json
```

Multica launcher 只运行此命令。Autopilot run_only，Agent concurrency=1，schedule 每五分钟，
generic webhook 作为可选即时唤醒。URL 只保存在本机 secret file 或 secret store，POST body
只用于唤醒，不能指定命令、repository、HEAD 或结果。通知可用稳定 Idempotency-Key 减少重复
launcher run；Controller 本身仍靠 ledger 防重复任务。

## 故障与恢复

- `health.json`：最近成功扫描时刻、PR 状态、轮次和当前 issue；超过两次周期未更新先查
  Multica Autopilot runs、daemon 和主机在线情况。
- `pr-N.json`：完整轮次与来源账本；`results/` 保存完整评审，`snapshots/` 保存 GitHub 观察。
- BLOCKED：先读 reason 与对应 issue。已有 tasks 的实际状态通过 `multica issue runs` 核实。
  不能因为观察超时就重新创建任务，不能删除 ledger 绕过轮次上限。
- 孤儿锁：暂停 Autopilot，核实 PID 已退出后运行 `runtime.mjs recover-lock <config>`；
  该命令会拒绝仍存在的 PID。恢复后重新 tick 并回读任务，最后恢复 Autopilot。
- 暂停：Autopilot pause 并将 enabled=false；已经分派的 agent run 不会因此自动取消，须
  单独查询并决定取消，避免误认为写操作已经停止。
- 升级：先停触发并确认无 Controller 进程；更新受信 deployment checkout，运行协议测试，
  保留 ledger 与凭据；只读运行确认后恢复。禁止并行部署两个状态目录指向同一组 PR。

## 验证与证据

`npm run test:review-loop-protocol` 检查生产状态机与适配器；五项门禁仍依 spec 原样运行。
真实部署 ID、触发记录与 review/fix 证据在完成实测后补在本节。未实测项保持未完成。
