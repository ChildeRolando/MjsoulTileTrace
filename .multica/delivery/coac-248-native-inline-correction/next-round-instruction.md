继续 COAC-248 主线（262、330、260、309、315、329 已 passed；p261 r50 与 p50 本轮已裁决；metadata 四页 unresolved-evidence）。

本轮结果：2 项收口，0 次制作调用。
- nemata-jp:261 r50 维持 3m，未按误审改牌。做了 1 次限定该争议与受影响牌例的独立模型复核裁决（调用 91507699…，判定 target-is-3m），裁决书 audit/adjudications/nemata-jp/page-0261.376c71a3….source-3m-adjudication.json 绑定候选 376c71a3… 与 manifest 03052928…；r50 与受影响段 b33 同时解除，状态 passed-after-source-adjudication，不是全页 passed。锚点与原图反证保留。
- 79-cn:50 只改 unknowns 一条：右缘 2×7px 残片记录换成已核实的裁切残片说明，正文/图注/牌形未动，原 unknown 文字、父稿、raw、旧审全部保留。页级批准 native-inline-field-corrections.p50.root-acceptance.json。新候选 002a79ea…，页审仍报 uncertain（页图看不到跨页对照），再以 1 次独立模型复核裁决（调用 bf00d3de…，resolved-as-non-body-crop-fragment）确认后解除，状态 passed-after-source-adjudication。
- 定点入口扩展：unknowns 数组按条精确替换（不得增删条目）；新增 page-scoped-unknowns-evidence route；源裁决可带 1 次独立模型复核并绑定候选+manifest，可清理承载争议图例的正文段，且只有在该复核已解决证据问题时才可清 uncertain。五套审校测试 84/84 通过。
- 运行时冻结 audit/runtimes/native-repair-d0782d5041cfb2，manifest 03052928…（8 模块 + 9 页级批准，含 p50），verify ok；旧 manifest 与中间运行时全部保留，漂移检测不关。
- 两项 failed 未重试：确认无 STOP、无在途调用；exercise003 仍需先从存量 raw 重组，exercise004 只需补 batch-003 一次审校。

下一轮任务（每轮 1–2 项）：
1. 79-cn:217/263、nemata-jp:98/257 逐页先做免费源核，确认后按已批准定点路径建修订。
2. nemata-jp:317 b5 用同一 unknowns 条目机制维护误译修正后的 unknowns；4 页真实不可辨封面保持 unresolved，不清空未知制造通过。
3. web 7 与 protected supplement 1 排在 PDF 之后；缺图/不清先核原源。
4. 两项 failed：exercise004 只补 batch-003 一次审校；exercise003 先从存量 raw 确定性重组再考虑审校。

规则不变：定点修订 + 真实独审，保留父稿/旧审/原始 raw，逐稿可追溯；每轮只发一条最终结果评论，状态 in_progress；
完整章节才交 COAC-250。修改 native 门禁模块后必须重新同步运行时并重建 verification-dependencies manifest
（旧 manifest 进 history，不覆盖、不关漂移检测）。审查裁决若带模型复核，必须绑定候选 SHA 与该 manifest。
