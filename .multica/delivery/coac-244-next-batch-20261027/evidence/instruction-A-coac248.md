本轮由 COAC-244 短协调派发，A 线（COAC-248 Mika）下一批只有 1 章，已用当前冻结 runtime 的 verifyWebRevisionContent 做过零调用入口核验并通过。

先读本目录 dispatch-A-coac248.json（章、父候选路径+SHA、父审路径、源 SHA、4 个 figureId、已知修正点、预算）。要点：

1. 只做 79-cn-chapter-081-8 的 figure 定点修订：body.mode 必须保持 verbatim，textBlockIds 必须为空（文本+图混合会被门禁拒绝）。只允许这 4 个 figure 与父稿不同，其余正文块、其余 figure、DOM 顺序、provenance 逐字节不变。
2. 父审已把这 4 个 figure 标为 needs-repair 且每个都有 error issue 与 suggestedRepair；不要重审父稿、不要改父稿、不要用父 SHA 重新认领别的 revision。
3. 预算：本章 1 次制作 + 1 次首次独审；failed/void/传输错误都占次数，不自行重试。发模型前再做一次零调用预检（source 图 occurrence、父候选/父审 SHA、源 SHA 仍然绑定），回执落本票命名空间。
4. 候选就绪后写显式 target 配置，交 COAC-249 独审，并给 COAC-249 建 --kind at --after 1m --agent-id b144c077-cadd-4749-a53d-4b9cb98191b8 的唤醒；不要自审、不要自己判 passed。
5. 217-4（79-cn-chapter-217-4）当前被门禁判为 web_revision_parent_has_other_unresolved_checks（两个 imageCheck 是 uncertain），先不要为它付制作费；保留认领与证据，等源图牌码解决或裁决。
6. 严格边界：不碰 production-lane.lock、共享 selection、preview pointer、统一 register；不新建 ChatGPTWork/Codex 任务、不克隆角色；不改任何质量门禁；不把本票单章通过当成全书完成。
7. 交付注明：章 ID、目标 figure、实际修正、候选 SHA、实际调用与 tokens/耗时、真实占槽时段、交 249 的路径+SHA。
