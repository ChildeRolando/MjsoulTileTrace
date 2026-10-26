继续 COAC-248。先读 issue 与评论。

上一轮（329/330）结果：329 已通过独立审校（修订 a991dd89，回执 receipt-p329.passed.json）；330 的三处牌形错误（r1/r4/r22）已修正并被独立审校确认，但同一份新审校定位到两个碰牌例的切片编排/阅读顺序结构问题，定点字段入口无法表达，已在 audit/unified-repair-list-20261027.json 的 structuralBlocker 记录，等待用户对页面级结构入口的决定。**不要对 330 重跑审校、不要重制整页、不要放宽绑定规则。**

本轮任务：
1. 继续其余 needs-repair：新 PDF 260/261/262（先免费源图核，再共享制作槽），旧 PDF 79-cn 50/217/263、nemata-jp 98/257，随后 web 7 与 protected supplement 1。按当前有效候选 SHA 去重，不重复已 passed 的页。
2. 两项 failed 已查明且本轮不得盲重试：chapter06-exercise003 是 verifyWebBatchedProductionCalls 的 web_audit_batch_output_assembly 确定性装配失败（0 次模型调用），需先从已存 batch raw 重新装配或在该文章的制作槽重跑该批；chapter06-exercise004 的 batch-001/002 已 passed，只缺 batch-003 一次审校调用。只在对应入口可用时做最小恢复，并保留原失败回执。
3. 每轮只做 1–2 项，逐稿交独立审校；保留父稿/旧审/原始 raw；每轮只发一条最终结果评论，状态 in_progress。完整章节才交 COAC-250。
