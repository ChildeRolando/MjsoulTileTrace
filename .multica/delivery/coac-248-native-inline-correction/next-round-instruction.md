继续 COAC-248 主线（262、330、260 已 passed；metadata 四页仍 unresolved-evidence）。

本轮结果：nemata-jp:260 的 5 处定点（r5、r21、r26、r28、r33）全部先做免费源图核，确认后走定点 revision，
新候选 8bbfb99c…，独立审校 1 次 **passed**，制作模型调用 0 次。
p261 r50 未改：源图物证显示该牌为 3m，上一轮审校的「五万」是误读，已附同书锚点对比图，等 owner 裁决。

下一轮任务（每轮 1–2 项）：
1. nemata-jp:261 r50 **暂不动**。除非 owner 认可以新证据推翻本轮判断，否则不建 5m 修订、不改该页候选。
   若 owner 要求复核，只做一次带锚点对照的定向复核，不重跑整页独审。
2. 旧 PDF 79-cn:50（candidate 6d33c818…，审计 6baa4a7e… needs-repair）与 nemata-jp:98（59d82a54…）。
   两项都先免费源图/源文核，确认后再建定点 revision。
3. 随后 79-cn:217/263、nemata-jp:257，再 web 7 与 protected supplement 1。
4. p317 b5 仍按授权：定点入口加显式 unknowns 数组条目（页级、SHA 绑定），与 b5 同一 job 独审；
   不解除封面证据缺口、不入正式库、不改四页的 unresolved-evidence 状态。
5. 两项 failed 不盲重试：先确认无在途调用与质量 STOP，再 exercise003 从存量 raw 重组、exercise004 只补 batch-003 一次审校。
6. 330、260 不再改；若 COAC-250 装配报回，按装配实际问题处理。

规则不变：定点修订 + 真实独审，保留父稿/旧审/原始 raw，逐稿可追溯；每轮只发一条最终结果评论，状态 in_progress；
完整章节才交 COAC-250。修改 native 门禁模块后必须重新同步运行时并重建 verification-dependencies manifest（旧 manifest 存档，不覆盖）。
