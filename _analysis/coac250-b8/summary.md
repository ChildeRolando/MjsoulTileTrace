本阶段遇到可复现的装配失败，已按「具体失败即落回执退出」收口，COAC-250 标为 blocked；**本批未发布，预览仍为 220 章，正式 active 未切换**。

- b8 两章 `128-14 c14911aa`、`145-4 07a511d4` 的 source／父稿／父审／候选／恢复回执 SHA、原始调用及独立结论均核验通过；交接件从指定提交 `438bdd8` 取回，实算 `255873f8…`，冻结 manifest `56287cda…` 复验通过。两章均是各自 canonical 当前有效通过稿。
- 本机审计入口同步了已获准的一个精确传输诊断字串；11 项机械测试通过，实时门禁均返回 `passed-after-transport-recovery`。复用两次原完整审校，新增模型／制作／审校调用均为 **0**，没有重计旧调用。
- `128-14` 已生成隔离 stage：18 blocks／7 figures，**尚未进入当前 pointer**。`145-4` 在 `stage-web-textbook.mjs:106` 报 `web_stage_image_identity`：其 5 张绑定原图均为 JPEG，逐张 SHA 匹配；该入口仅接收 PNG，且单资产图不会走父稿 PNG presentation 继承，因而拒绝装配。不是语义审校失败。
- 候选字节、父稿、旧失败回执和 raw 全部保留。128 的句号未改；145 的已审 caption 与父稿「原图与近邻放大图为同一图像，仅计一次。」已在 provenance 核验记录保留，未抹掉备注。
- pointer SHA 仍 `73c0bbbf…`，selection 仍 v12 `943b47ee…`；未生成 v13、未改覆盖 register。正式 corpus SHA 仍 `9836ee5b…`。本轮 consumer 锁已正常释放，没有后台消费者。

下一步是修复既有 stage 的 JPEG／父图 presentation 继承，再接续两章并完成真实 MCP 分页、Arena 引用和全库 canonical 去重读回。本次在第二章装配时已停止，**未运行本批 MCP／Arena 全库验收**，不报合库成功。027、p217、p257 均未介入。

附件为实算失败读回、装配前核验与机械测试结果。本阶段保留本机装配脚本和证据，未创建 PR、未合并或部署。
