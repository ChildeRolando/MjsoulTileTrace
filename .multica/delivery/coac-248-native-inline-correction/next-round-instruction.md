继续 COAC-248 主线（262、330、260、309、315、329、263 已 passed；p50、p261 为限定裁决后 passed；metadata 四页仍 unresolved-evidence）。

本轮结果：1 页收口 + 清单并入 48 章。
- 79-cn:263 passed：只改 r1 转录。图例回到全书口径 5z=白/6z=發/7z=中 并同步三处字牌码；宝牌「ドラ」栏牌由 3s 改为 2s（两根竹节）；吃牌组横置牌为 3s（原写 2s），画面排列记为 3s、2s、4s；「ドラ」栏按原图标签描述，宝牌/指示牌性质留白。父稿、旧审、raw 全部保留，新候选 4fb2bd6d…，独立审校 passed（调用 2feaa474…，20,560/4,668）。制作调用 0 次。
- 首轮因 candidate 内部摘要未随转录重算被确定性检查拒绝（0 次模型调用）；第二轮真审校解除了三项牌码问题但就「ドラ」栏语义提了一条，第三轮通过。两次未过回执都归档保留。
- COAC-246 的 57 章逐章 JSON 已按 current candidate SHA 并入统一返修清单：48 章 repair 中 41 章新增、7 章与既有 web7 同 SHA 去重；9 章非修复类单列（2 首审、2 重审、3 换绑、1 staging、1 legacy），其中 exercise003/004 与 failed 清单是同一对象，已标注不重复。56 个候选 SHA 已从磁盘重算并与移交值一致（098-1 为 legacy 无候选）。
- 清单 needs-repair 16 → 56（web 48、旧 PDF 3、metadata 4、supplement 1），另 failed 2。

下一轮任务（每轮 1–2 项）：
1. 79-cn:217 先补完免费源核再改：北家舍牌第二行第一张已确认是六萬（候选写 5m），但第二张字形介于八/九之间未定，东家两列需按旋转视角重读；两项未定前不动候选。
2. nemata-jp:257（r1 河牌，1 项 uncertain）与 nemata-jp:98（12 项）同样先源图核；257 的河牌若确实不可辨，保持 uncertain 不补猜。
3. web 48 章（63 单元 4,410 块、294 个块级问题）按清单逐章推进，先做能一次过独审的整章；同一 SHA 不重审。
4. p317 b5 仍按授权：定点入口加显式 unknowns 数组条目（页级、SHA 绑定），与 b5 同一 job 独审；不解除封面证据缺口、不入正式库、不改四页 unresolved-evidence 状态。
5. 两项 failed 不盲重试：exercise003 从存量 raw 重组、exercise004 只补 batch-003 一次审校。

方法说明（避免重复踩坑）：79-cn 页走「克隆生产根 + 确定性改候选 + 全页独立审校」这条路，不需要改 native 门禁模块，因此不触发运行时重冻结与 manifest 重建；改候选后必须同步重算 candidate.candidateSha256，否则确定性检查直接拒绝。只有真正改到 native 门禁模块时，才同步运行时并重建 verification-dependencies manifest（旧 manifest 进 history，不覆盖、不关漂移检测）。

规则不变：定点修订 + 真实独审，保留父稿/旧审/原始 raw，逐稿可追溯；每轮只发一条最终结果评论，状态 in_progress；完整章节才交 COAC-250。
