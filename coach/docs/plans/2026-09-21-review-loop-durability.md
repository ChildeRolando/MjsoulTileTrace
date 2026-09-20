# COAC-30 实施与变更控制

权威行为与验收语义仅在 `../specs/2026-09-20-review-loop-v2.md` 的 COAC-30 条款。
本文件记录实施边界，不复制治理政策。

1. protocol.mjs：严格 finding metadata、严重性校准、v2.1 版本及 durability receipt。
2. reviewer-instructions.md：Reviewer human/runtime policy；controller.mjs 读取该单一来源、
   组合 pinned 参数，并保存确定性 follow-up 意图、幂等派发和回执。
3. runtime.mjs：独立 worktree/branch、远端 Git artifact 核验、关闭 PR 队列扫描。
4. 同目录 tests：两轴路由、来源/替换/陈旧候选、失败恢复及真实 Git regression。
5. REVIEW_LOOP.md：升级和运维入口。原产品包、M6-D2/M7 无改动。

## Change control

Scope/Locality：开发自动化同一边界内的 protocol/controller/runtime 和必要文档、测试。
Invariants：延续 INV-006/007 的严格来源、版本、失败关闭；review-loop 测试拥有工作流
可执行语义，architecture gate 检查产品边界。未新增另一套 invariant registry。
Traceability：原 finding 与完整评审 hash 绑定到 source issue/comment/run/head，独立
completion receipt 保存 branch/commit/artifact hashes，原 review result 不被改写。
Replaceability：仍由 runtime 独占 gh/Multica/git I/O；Controller 只处理结构化证据。
Recoverability：同一部署锁、atomic ledger、attempt-before-send、精确 reconcile；未知
发送与未提交 artifact 不宣称完成。focus tests 可重放，真实 Git 测试不连接外部平台。
Semantic Load：将 durability 生命周期折入既有 PR ledger，而非新平台/代理/治理层。
它防止 P3 PASS 后丢失未来知识，隔离 PR 阻断与持久化完成两个变化轴；既有 pending/job
只拥有串行 review/fix，会被新候选替换，无法同时拥有跨 PASS/closed PR 的义务。把队列
塞入该单槽会覆盖 review 身份或把非阻断 P3 错变成 PR 阻断。

Verification（2026-09-21）：`npm run test:review-loop-protocol` 52/52；
`npm run typecheck`、`npm run build`、`npm run check:architecture`、
`npm run test:package-import` 均 exit 0；`npx vitest run` 全绿。
真实 Git 测试使用临时本地 bare remote，覆盖未推送/错误 hash/未改变 artifact/symlink；
外部 Multica 和 GitHub 派发由 runtime 注入测试验证，并未宣称生产端到端或部署完成。
follow-up commit 的语义充分性仍需验收；Controller 独立核验内容/来源/可达性，不执行
finding 的任意命令，其 check PASS 来自指定 completed agent run 的严格 receipt。
