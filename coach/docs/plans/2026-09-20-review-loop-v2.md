# Review Loop v2 实施与收口

规格：`../specs/2026-09-20-review-loop-v2.md`。

1. 用生产 protocol/controller 替代 v1 离线模型；先红测试，再实现来源、幂等和轮次校验。
2. runtime 接 gh/Multica、独立工作树、原文附件、持久化与状态回报；测试并发和重启恢复。
3. 清除失效 v1 文件与入口；更新当前运行指南。历史以 Git 保存。
4. 跑五门和 full；创建交付 PR，独立 review/fix 验证。
5. 创建 Multica Fresh Reviewer 与 Controller 执行入口，Autopilot run_only 的 schedule/webhook。
   初始配置禁用，通过真实只读检查后开启；记录原生触发和真实 review/fix 证据。
6. 合并部署经过验收的版本，收口旧 COAC-15 PR/工单，更新本任务 heartbeat 为运行健康监测。

完成以运行证据为准；剩余步骤不能通过缩小目标省略。

第三轮发现 R3-001（同 SHA 的 PR 共享 GitHub status）后自动 BLOCKED，用户已于
2026-09-20 明确批准仅 PR #8 追加修复与第四轮评审。修复共享位置的聚合发布与回归，
以账本中的一次性授权保留前三轮历史，不将默认上限全局提高。
