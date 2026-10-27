继续 COAC-248。先读 issue 与评论，再读本目录的 summary-p330-structure.json、metadata-evidence-inventory-20261027.json 与刷新后的 unified-repair-list-20261027.json。

本轮结果：330 页级结构修订通过独立审校（候选 314cb1…，父稿 7eaa03dd…），并纠正旧审漏掉的 4s/6s；
328–334 七页现均 passed，可交 COAC-250 装配。metadata 四页仍 unresolved-evidence，证据清单已建。

下一轮任务（每轮 1–2 项）：
1. nemata-jp:261 修订 2：只改 r50 的 transcription/caption 与正文引用为 5m（源块 nemata-jp-p261-b92），
   新建 candidate/approval/job，父稿 376c71a3…，原审用本轮 needs-repair 回执，再交 1 次独立审校。
2. nemata-jp:260 的 5 处定点（r5、r21、r26、r28、r33；先免费源图核，再建修订）。
3. 随后旧 PDF 79-cn 50/217/263、nemata-jp 98/257，再 web 7 与 protected supplement 1。
4. p317 b5 已授权修正：给定点入口加显式 unknowns 数组条目（页级、SHA 绑定），与 b5 同一 job 交独立审校；
   仍不解除封面证据缺口、不入正式库、不改四页的 unresolved-evidence 状态。
5. 两项 failed 不盲重试：先确认无在途调用与质量 STOP，再 exercise003 从存量 raw 重组、exercise004 只补 batch-003 一次审校。
6. 330 不再改；若 COAC-250 装配报回，按装配实际问题处理。

规则不变：定点修订 + 真实独审，保留父稿/旧审/原始 raw，逐稿可追溯；每轮只发一条最终结果评论，状态 in_progress；完整章节才交 COAC-250。
