继续 COAC-248 主线（262、330、260 已 passed；p261 r50 仍待裁决；metadata 四页 unresolved-evidence）。

本轮结果：吸收 249 的依赖身份交付并核定了 330 结构修订后的 manifest 契约（0 次制作、0 次审校调用）：
- 运行时 manifest 8020f7b2…（8 模块 + 8 个页级批准）用仓库 HEAD 模块复算一致、verify ok；旧 manifest 5a60dfbc… 存档未覆盖；
- 330 独审（调用 dcfc3e69…，23:52:01–23:53:37Z）当时依赖的快照已记录；00:02:17Z 对 native.mjs 的改动只是 CRLF 归一化（去掉 CRLF 后与 07:55 冻结副本 75ea9bb2… 逐字节相同），最终代码下确定性闸门重跑 ACCEPTED，未重发审校；
- 249 的四个旧 attestation 现在如实报 verification_dependency_manifest_changed（唯一变更 = corrections 模块加入 260 批准 d61eae→71794ddd），不覆盖；另在 audit/runtime-patches/20261027-coac248-post-p330-manifest 按当前 manifest 重新生成 309/315-rev2/329/330 的 attestation，verify 全 ok。
- 79-cn:50 的 r2 源核：六张 134556s 正确，所谓“灰色符号”是嵌图右缘 2×7 px 的裁切残片（p49、p166 同形，PDF 文本层该处只有空格，无字形）。未建修订，原因见下第 3 条。

下一轮任务（每轮 1–2 项）：
1. 330 不再改、不重审；若 COAC-250 装配报回，按装配实际问题处理。261 r50 继续不动，除非 owner 以新证据推翻本轮判断。
2. 79-cn:50 只剩 unknowns 数组替换：现有定点入口只接受字符串字段（fromValue/toValue），不能改 unknowns 数组，且本票没有 79-cn:50 的 root 批准 job。需 owner 明确：按 nemata-jp:317 b5 同机制扩展 unknowns 条目并开 p50 job，或直接接受本轮证据结案。不要用别的方式绕过。
3. 旧 PDF 79-cn:217/263、nemata-jp:98/257 逐页先做免费源核（217/263 是多错误页，98 含整页阅读顺序问题），确认后再按已批准路径建修订。
4. p317 b5 仍按授权：定点入口加显式 unknowns 数组条目（页级、SHA 绑定），与 b5 同一 job 独审；不解除封面证据缺口、不入正式库、不改四页的 unresolved-evidence 状态。
5. 两项 failed 不盲重试：先确认无在途调用与质量 STOP，再 exercise003 从存量 raw 重组、exercise004 只补 batch-003 一次审校。
6. web 7 与 protected supplement 1 继续排在 PDF 之后；缺图/不清先核原源。

规则不变：定点修订 + 真实独审，保留父稿/旧审/原始 raw，逐稿可追溯；每轮只发一条最终结果评论，状态 in_progress；
完整章节才交 COAC-250。修改 native 门禁模块后必须重新同步运行时并重建 verification-dependencies manifest
（旧 manifest 进 history，不覆盖、不关漂移检测）。冻结驱动目前写 module-only manifest，页级批准由本票在冻结后补写；
已建议 249 在驱动里带上页级批准，本票不擅自改它的 patch。
