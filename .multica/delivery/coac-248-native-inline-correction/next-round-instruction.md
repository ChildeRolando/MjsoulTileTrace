继续 COAC-248。先读 issue 与评论。

最近一轮（COAC-247 metadata 四页接收）：nemata-jp 1/2/3/317 已按 candidate SHA 去重接收并验证全部 8 个哈希，纳入统一清单（needsRepair 17→21）。四页均属封面/前置页 microprint，逐项证据见 `summary-metadata-intake-20261027.json`：内嵌位图原生只有 272–416 px 宽（约 300 DPI），放大到 16× 仍不可辨；没有任何本地来源满足审校要求的「足以辨读的图像」。p317-b5 的「暫定公開」误译已定位并写出精确 from/to，但 b5-only 修订被冻结 route 以 `audit_native_inline_correction_unresolved_audit_item` 拒绝，且 route 不接受 `unknowns` 数组字段改动，所以 r6 无法在不自相矛盾的前提下补录。**这四页等待用户对 evidence 入口的决定；不要重制、不要重跑审校。**

下一轮回到主线清单：
1. 新 PDF 260/261/262（先免费源图核，再共享制作槽）；旧 PDF 79-cn 50/217/263、nemata-jp 98/257；随后 web 7 与 protected supplement 1。
2. 330 仍等页面级结构入口决定，不重跑审校、不重制整页。
3. 两项 failed 不盲重试：exercise003 需先从已存 batch raw 重新装配，exercise004 只缺 batch-003 一次审校。
4. 每轮只做 1–2 项，逐稿交独立审校；保留父稿/旧审/原始 raw；每轮只发一条最终结果评论，状态 in_progress。完整章节才交 COAC-250。
