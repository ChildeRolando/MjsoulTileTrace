# COAC-250 b8 JPEG 装配恢复

128-14 与 145-4 已通过原独审回执进入增量预览；没有新制作、模型审校或模型调用。正式 active 未切换。

实际覆盖：222/256 原章、254/303 原单元。展示库：222 章、230 单元、6104 block、4972 图。剩余34原章沿用原门禁，本阶段未改其状态。

本 worktree 不含已安装的 textbook-processing 源码，因此按本票既有方式提交运行时源码前后快照、精确补丁、执行脚本和实际证据。安装位置与文件 SHA 见 `install-receipt.json`。`compatibility.patch` 包含 stage、Pillow worker、现有损坏 PNG 测试 fixture 的修正和现有 owner 文档同步；兼容测试见 `compatibility.test.mjs`。没有创建 PR、合并或部署。

`install.mjs`、`prepare-regression.mjs`、`integrate.mjs`、`update-coverage.mjs` 是本次有边界的执行记录，不是可盲目重复执行的通用入口。它们的旧 pointer、计数、选择版本等前置断言只适用于执行时状态。后续增量沿用已安装 stage 和已更新 builder/selection v13，避免重放本批。

- `preconsume.json`：候选、source、父稿、原独审 raw 与恢复回执绑定，受保护文件 SHA。
- `stage-128.json`、`stage-145.json`：实际装配收据；145 的5组原 JPEG / PNG / RGBA SHA 与衍生关系单列，原 JPEG 字节保存在预览 source-assets。
- `readback.json`：真实 stdio MCP 两章完整正文、12张图的字节读回；独立逐像素验证5组 JPEG/PNG；原228单元不变、canonical去重及正式库不变。
- `mcp-validation.json`、`arena-validation.json`、`source-deduplication-validation.json`：全库230单元/4972图及引用边界验证。
- `coverage.json`：完成读回后的覆盖更新和旧登记表备份 SHA；登记表 rows 是80章追踪子集，覆盖分母仍是256章。
- `tests.json` 与对应日志：PNG/JPEG、错MIME/损坏文件/SHA拒绝、独审门禁、装配回归、架构、包导入与 desktop 类型检查均通过。

128 的 caption 标点不改候选；145 父稿“原图与近邻放大图为同一图像，仅计一次。”说明保留在新预览的 b8-source-notes.json。原候选、来源 SHA 和原审字节保持不变，沿用恢复后的有效结论。PNG 是 JPEG 的解码展示衍生件，未冒充源 PNG。
