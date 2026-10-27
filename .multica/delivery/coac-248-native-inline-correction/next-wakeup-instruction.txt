继续 COAC-248 主线（262、330、260、309、315、329、263、237-1 已 passed；p50、p261 为限定裁决后 passed；metadata 四页仍 unresolved-evidence）。

本轮结果：246 并入清单零调用复核 + 第一整章收口。
- COAC-246 的 48 个 repair 章已在统一清单中逐项复核（0 次模型调用）：48/48 在册，候选 SHA 与 246 移交值、磁盘字节三方一致；7 个去重对象各自同 SHA；9 个非修复章未混入 repair 对象；与 2 项 failed 无重叠。证据 `coac246-merge-verification-20261027.json`。
- nemata-jp-chapter-237-1（chapter04-section016）整章 passed：唯一问题是 b0002 强调范围。原文 em 覆盖「供託や積み棒が多ければ和了率重視」，候选只强调了「重视和牌率」。走修订生产入口（--revision-from/--revision-notes）只重译该块，新候选 d14aac65…（1 次制作调用 7042ce5f…，12,776/611），独立审校 8567f448…（13,086/410）passed，方法为 target-text review + 继承父稿整篇审校；父候选 5c4048ad… 与父审回执 5c4048ad… 原样保留，其余正文与全部图元未动。已交 250。
- 清单 needs-repair 56 → 55（web 48 → 47）。

上一轮 249 交接的四项（0 次模型调用核实）：
1. 116-1 b0016「（同上）」占位仍在；该 SHA 没有任何审校回执，隔离修订入口要求父回执为 needs-repair，因此它要么先修块再做首审，要么走 root 认可的定点入口，不能套用修订入口。
2. 131-1 b0123「七対子のロス」可走隔离修订入口（父回执 needs-repair，249 已核实源字节未变），下一轮做。
3. 183-1 b0018「１枚切れ１枚見え」：保留原话，不改「見え→持ち」，本轮也不在正文加校注；条目保持 open，等校注口径定稿。
4. 283-1 溯源已定位：b0785 的 provenance.callId 8b122484… 在整个数据根无 raw 调用，而 d43a772e…（候选 attempts 里已有的一次 batch 调用）的 b0785 转录与候选逐字一致——接线指向了一个不存在的调用，字节来自 d43a772e。下一轮按生产链改正并让批量装配自行验真。

方法说明（避免重复踩坑）：
- web 文章的译文不能手改：审校里 `web_production_translation_not_from_bound_output` 要求目标块文本等于绑定生产 raw 的 parsedOutput。定点修必须走 `textbook-production-web.mjs --revision-from <父候选> --revision-notes <父审回执> --dictionary <父候选的 dictionary>`，它只对 notes 中 error 目标块发一次小调用。
- 修订候选若 figure 带 presentationAsset，必须补一条 derivedFromCandidate 指向同 body 的 .rev1.json，否则 `web_presentation_changed_original_content`；本页无图，derivedFromCandidate 保持 null。
- 审校仍用 `audit/runtimes/e89dcffe…` 的 `auditWebCandidate`；target-text 作用域由 provenance.revision.textBlockIds 决定。

下一轮任务（每轮 1–2 项）：
1. 131-1 b0123 修译（隔离修订入口 + target-text 审校），交 249/250。
2. 283-1 b0785 溯源改正（callId → d43a772e…），用批量装配确定性验真，不手改冒充通过。
3. web 47 章按清单继续，优先 2–3 个问题数（211-1、234-12、173-1 等）能一次过独审的整章。
4. 79-cn:217、nemata-jp:257/98 仍先做免费源核，未定不动候选。
5. p317 b5 仍按原授权，不解除封面证据缺口。

规则不变：定点修订 + 真实独审，保留父稿/旧审/原始 raw，逐稿可追溯；每轮只发一条最终结果评论，状态 in_progress；完整章节才交 COAC-250。
