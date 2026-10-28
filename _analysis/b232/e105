# 教材并行修订：双槽与认领契约（COAC-244 编排）

本文件只写两条修订线如何共享容量与目录，不引入通用框架。机制实现是 `slots.mjs`（单文件），
验证证据是 `verification-20261027.json`（15 项全过）。

## 一、现状核查（2026-10-27 09:2x–09:40 UTC 实测）

- **网关**：模型调用走本机 `codex.exe exec --model gpt-6.1-sol --config model_reasoning_effort="high"`，
  每次调用是独立子进程；代码里**没有并发上限**，只有准入闸：`processing/STOP`、
  `processing/web-production/v1/STOP`、`processing/model-admission-stop.json`（仅 usage-limit 记录）。
  三个 STOP 文件当前都不存在，即派发开放。
- **实测并发能力**：09:33 UTC 同时存在两个 `codex exec` 进程（父进程分别是
  `audit-explicit-targets.mjs --config explicit-targets-coac249-215-4-rev2…` 与
  `_audit_283_b0099_limited.mjs`），说明网关/账号侧可承载 ≥2 路同时调用。瓶颈在编排，不在网关。
- **历史吞吐**：今日两条调用账本共 40 次（制作 23、独审 17），按 `startedAt`+`durationMs`
  折算的重叠对为 **0**，最大并发 1——此前确实是串行。
- **旧单制作锁**：`processing/production-lane.lock`（内容 `0`，10-25 遗留）。本机制**不删除、
  不改写、不旁路**它；只在它之外增加"按线分配的两个槽"，用于把"2 制作"落成可核查记录。

## 二、容量目标

| 岗位 | 上限 | 载体 |
| --- | --- | --- |
| 制作（maker） | 2（A、B 各 1） | `parallel/slots/maker-A.json`、`maker-B.json` |
| 独立独审 | 2 | COAC-249 现有队列，不变 |
| 合库写者 | 1 | COAC-250，不变 |

任何 429／usage-limit／质量 STOP：**立即停新增派发，回退到 1 制作**，不改 provider、不改模型。
失败、超时、void 调用一律计入实际调用数与额度。

## 三、槽位协议（`slots.mjs`）

持有人：A 线固定用 `--owner "COAC-248 Mika"`，B 线固定用 `--owner "COAC-269 Ticket executor"`。
进程型持有必须带 `--pid`（自己驱动的进程 PID），run 型持有靠心跳与 TTL 判活。

```text
# 派发模型前占槽（同一线第二次占同一槽会被拒）
node slots.mjs acquire --lane A|B --owner "<线owner>" [--pid <驱动PID>]

# 长批次中续心跳（默认 TTL 20 分钟）
node slots.mjs heartbeat --slot parallel/slots/maker-B.json --owner "<线owner>"

# 正常结束/退出释放（只有 owner 能释放自己的槽）
node slots.mjs release --slot parallel/slots/maker-B.json --owner "<线owner>"

# 只读核查：当前真实占用
node slots.mjs status
```

- 互斥：占槽走原子临界区（`mkdir` 排他 + `wx` 落盘），并发抢占时**最多 2 个**成功，
  第三个以 `maker_slot_limit_reached` 拒绝。
- 退出释放：`--hold` 模式在正常退出（含 SIGTERM/SIGINT 或 `--hold-seconds` 到时）释放自己的槽。
- 抢占拒绝：同线重复占槽 → `lane_slot_busy`；别人的槽不能释放 → `owner_mismatch`。
- 崩溃恢复：留残槽时后续占槽被拒 `slot_stale_requires_recover`；只有 `recover` 能清，
  且必须带死主证据文件（`{"deadOwnerProof":true,"subject":"<线owner>"}`）；主进程还活着时
  `recover` 被拒 `owner_still_live`。不存在"删锁/旁路/伪造释放"路径。

## 四、章节认领协议

派发前，每章以**候选 SHA** 原子认领，落在共享只读注册表 `parallel/claims/<chapterId>.json`：

```text
node slots.mjs claim  --chapter <chapterId> --candidate-sha <parentCandidateSha256> --lane B --owner "COAC-269 Ticket executor"
node slots.mjs check-chapter --chapter <chapterId> --owner "<自己的owner>"   # 被他人认领 → exit 7，跳过
node slots.mjs unclaim --chapter <chapterId> --owner "<自己的owner>"
```

- A 线派发前 `check-chapter`，**他人已认领的章直接跳过**。
- 认领只登记"谁在做哪章的哪个父候选 SHA"，不改候选、不改统一清单、不改 selection。
- 章完成后（过审并入 250 或确认放弃）由认领方 `unclaim`。

## 五、目录隔离

- **A 线**：保持既有共享路径，不做迁移。
- **B 线**：只写自己的命名空间 `web-production/v1/coac269-20261027/`（`frozen-runtime/`、
  `claims/`、`preflight/`、`receipts/`、候选变体 `*.coac269rev1.json`）。
  冻结快照在占槽之前完成，源/父审/输出都带 SHA。
- **B 禁止**：改共享代码、改 `integration/` 统一清单、改 selection/pointer、写别人的候选目录。
- 交接面只有两处：`parallel/claims/`（认领记录）与本票/各线工单的结果评论。

## 六、批次与交接

- 每条线一轮最多 2 章；**已有明确候选就交 COAC-249 独审**（不等整批），过审即交 COAC-250 合库。
- 每轮结果必须列出：章 ID、修正点、父/新候选 SHA、制作与独审调用数（含失败/void）、
  真实占槽时段。只有真实收据算数，排队新票不算完成量。

## 七、结论边界

已验证：互斥、退出释放、超限拒绝、死主恢复、认领互斥（15/15）。
未验证且不声称：同一模型账号在 2 路以上长调用的稳定性；B 线除上述两章外的批次质量。
