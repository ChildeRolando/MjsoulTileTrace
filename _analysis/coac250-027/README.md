# COAC-250：027-1限定集成

本阶段只接收 chapter01-section010 / nemata-jp-chapter-027-1。独立裁决、验证、闸门与提案在数据根均真实存在，SHA重算分别为 a164f768、1518cdbe、d24a4fcd、1d9cad43。未使用附件回填或猜造缺失文件。

原 CRLF sidecar db081740 原地保留；新 sidecar.v2.json 逐字节复制已验证的 LF 提案1d9cad43。语义仅重绑 candidatePath/candidateSha256，候选44ce506d、source、父稿、父审及原调用均未改写。既有独审与完整独立 DOM/像素闸门复用，没有新模型调用。

现有 owner 先同步本章接受事实。manifest 只改本章；stage guard 只为精确裁决/候选/sidecar允许本章执行；definition selection 增加经实际装配验证的本章 proof，移除本章 semanticHoldRemains。冻结 source-structure-holds 文件及所有其他章节的 manifest/selection 项未变。variant selection新增v14并保留v13，builder只更新两处SHA pin及选择文件名。

`readback.json`记录真实MCP的8页完整正文与84张图，83原译文块逐字一致，216次图出现的顺序、分组及DOM归属精确对应，7切点与独立裁决一致。全库231单元、5056图MCP字节验证及Arena引用验证通过；原230单元、前批5张JPEG来源字节保留。实际覆盖在读回后更新为223/256原章、255/303原单元；剩余33章未改动。

主要证据：`preconsume.json`、`audit-chain.json`、`gate-reverified.json`、`stage-proof.json`、`stage-receipt.json`、`readback.json`、`coverage.json`、`final-verification.json`。源码与配置前后快照、精确补丁、全库验证回执及测试日志一并归档。数据根另保存 `coac250-027-history-20261027` 配置历史。正式active未切换，没有PR、合并或部署。

本目录脚本是一次限定集成记录，不是通用引擎或可盲目重放入口；初始pointer/选择版本/计数断言刻意固定。后续增量使用更新后的builder和v14，不重跑本批或重审相同SHA。
