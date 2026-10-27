# COAC-244 并行编排：双制作槽 + 候选认领

用户 2026-10-27 09:23 UTC 授权「允许，加速加速，编排一下任务，提升编修的并行率」，要求把串行返修
拆成两条互斥章节修订线（A=COAC-248，B=COAC-269 新增子票）、独立审校、唯一合库，并在当前任务安全
边界内落实最小可用编排。本目录是该轮编排的交付记录。

## 一、结论

1. **网关不是瓶颈**。模型调用是本机 `codex.exe exec --model gpt-6.1-sol --config model_reasoning_effort="high"`
   的独立子进程，代码路径没有任何并发上限，只有 STOP 文件准入；三个 STOP 文件当前均不存在。
   09:33 UTC 实测两路 `codex exec` 同时存活（215-4 rev2 复核 + 283 b0099 限定复核），说明账号侧可承载 ≥2 路。
2. **此前确实是串行**。今日两条账本共 40 次调用（制作 23、独审 17），按 `startedAt`+`durationMs` 折算的
   重叠对为 0，最大并发 1。要提升的是编排，不是网关。
3. **双槽已实现并验证**。`slots.mjs` 用 `mkdir` 排他临界区 + `wx` 原子落盘，上限 2 制作槽（A/B 各 1）。
   15 项验证全过：并发抢占只成 2 个、第 3 个被 `maker_slot_limit_reached` 拒；同线重复占槽被拒；
   非 owner 释放被拒；正常退出释放；死主才可恢复且必须带死主证据；认领独占、A 线可读 B 线认领后跳过。
4. **B 线首批已产出**。COAC-269 在 09:35:25 认领 `nemata-jp-chapter-338-1` / `nemata-jp-chapter-273-1`
   （父候选 SHA `04ab7640…` / `c57c30e4…`），09:38:07 与 09:39:17 两次制作调用均成功，
   产出 `archive01-section006.coac269rev1.json`（`ff5a9b52…`）与
   `chapter06-exercise002-02.coac269rev1.json`（`42991d76…`）。
5. **249 入队已验证**。两条新候选写入 `audit/explicit-targets-coac269-line-b-20261027.json`，
   用审校驱动 `--select-only` 回读：pendingBefore=2、selected=2、terminalSkips=0、modelCalls=0，
   即队列真实接受、且同 SHA 未曾通过（不重复审）。
6. **旧锁未动**。`processing/production-lane.lock` 保持原样，未删除、未改写、未旁路；双槽是它之外的
   可核查记录，不替代既有在途所有权。

## 二、如实说明的边界

- 今日账本里**还没有出现两路制作调用同时存活**：A 线 09:41:27 的制作与 B 线 09:38/09:39 的制作是交替的，
  不是重叠的。第二槽已开、可用、有验证，但"2 制作同时跑"的首个真实重叠要等两线各自在途时发生；
  本报告不把它写成已完成。
- B 线在自己回合内串行跑了两章（B 的批次规则允许），并未自带并发；真正的跨线并发靠 A/B 各自占槽。
- 同一模型账号在 2 路以上长时间并发下的稳定性未验证；出现 429/usage-limit/质量 STOP 时按契约
  立即停新增、回退 1 制作，不改 provider。

## 三、机制用法（摘要，完整见 artifacts/CONTRACT.md）

```text
node slots.mjs acquire --lane A|B --owner "<线owner>" [--pid <驱动PID>]   # 派发前占槽
node slots.mjs heartbeat --slot <slot文件> --owner "<线owner>"            # 长批次续心跳
node slots.mjs release  --slot <slot文件> --owner "<线owner>"            # 只释放自己的
node slots.mjs status                                                    # 真实占用
node slots.mjs claim    --chapter <chapterId> --candidate-sha <sha> --lane B --owner "<线owner>"
node slots.mjs check-chapter --chapter <chapterId> --owner "<自己的owner>"  # 他人认领 → 跳过
```

固定 owner：A 线 `COAC-248 Mika`，B 线 `COAC-269 Ticket executor`。

## 四、文件

- `artifacts/slots.mjs` — 机制实现（单文件，无框架）
- `artifacts/slots.test.mjs` — 15 项验证，全部用真实子进程跑
- `artifacts/verification-20261027.json` — 验证回执
- `artifacts/CONTRACT.md` — 双槽与认领契约
- `evidence/gateway-throughput-evidence-20261027.json` — 网关与吞吐实测
- `evidence/status-20261027T0942.json` — 槽位/认领注册表快照
- `evidence/explicit-targets-coac269-line-b-20261027.json` — 249 入队配置（select-only 已核）
- `evidence/live-snapshot-20261027T0942.txt` — 该时刻在途 codex 进程快照（空=两线均无在途调用）
