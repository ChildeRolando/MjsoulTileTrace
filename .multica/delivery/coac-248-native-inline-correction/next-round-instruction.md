继续 COAC-248。先读 issue 与评论。

本轮（新 PDF 260–262 中的 261/262）结果：
- **262 passed**：段落 b16–b19「摸入3s可形成三面听」→「可形成三面形」（源文 `３ｓ引きで三面`），修订候选 `5c25921e…`，独立审校 1 次（27,752 / 4,479），0 次制作调用。
- **261 原审项已清除、仍未通过**：b4「或」→「和」被新审校判为 faithful，但同一份审校定位到新的源图缺陷 **r50 把 5m 写成 3m**（问题17第二种摸牌；源块 `nemata-jp-p261-b92` 与该段「ドラ［5m］引きでもペン［3p］のダマ跳」）。修订候选 `376c71a3…`（needs-repair 回执已保留），该页仍未通过。
- 另外修了两处记录问题：冻结 runtime 的 `textbook-audit-pdf-native-corrections.mjs` 是旧副本（只有 309/315，导致已 passed 的 329 今天重跑闸门会被判 unapproved_page），已从 coach 仓库同步（两文件身份 sha 7076217d… 不变，329 已复验可过闸）；`audit/unified-repair-list-20261027.json` 曾漏掉 metadata 四页（17 vs 21），现已用超集重建并让两处副本一致（needsRepair 21→20，resolved 15→16）。

下一轮任务：
1. **nemata-jp:261 修订 2**：只改 r50（transcription、caption、句内 figure 文本改 5m），新建 candidate/approval/job，父稿 = `376c71a3…`，原审 = 本轮 needs-repair 回执，再交 1 次独立审校。
2. **nemata-jp:260**：`_issues.txt` 里的 5 处定点（r5、r21、r26、r28、r33，7s/9s 与合并牌形），先免费源图核再建修订。
3. 随后旧 PDF 79-cn 50/217/263、nemata-jp 98/257，再 web 7 与 protected supplement 1。
4. 330（结构阻塞）与 metadata 四页（1/2/3/317 证据入口）继续挂起，等用户决定；不重跑审校、不重制整页、不放宽绑定。
5. 两项 failed 不盲重试：exercise003 先从已存 batch raw 重新装配或在该文制作槽重跑该批；exercise004 只补 batch-003 一次审校。

规则不变：每轮 1–2 项，逐稿交独立审校，保留父稿/旧审/原始 raw，每轮只发一条最终结果评论，状态 in_progress；完整章节才交 COAC-250。
