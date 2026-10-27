236 已按唯一通过 display SHA `6193212639b7c8abb42adf64b69759a5d00effc67c1f20d2c9ae681ded121a28` 增量进入 v25；新增模型/制作调用均为 0。

- 使用冻结 fidelity236-v1 的真实 `verifyAuditForWebCandidate` 回调连接既有 stager；17 份运行文件和父 exact 18 份文件、完整生产/父审/raw 链重算 SHA，门禁复验 passed。5 项装配路由绑定拒绝检查通过，未改共享 stager、旧审校或语义门禁。
- 实际 Windows codex.exe argv 为 sol/high、无 `-i`。父 CLI 的 raw 没有结构化 requestExecution，原样保留；额外采集的 process236 和原 CLI 结果逐字段核对并单独归档，不伪填原 raw。
- 4 个源/候选块保留为 4 个发布块，0 图。真实 stdio MCP 一页读全；全部译文、四个源定位、h2 标题与完整非原文校注一致。原源段没有内联强调；没有误将日文 sourceSegments 按中文位置截断，也未丢失校注。
- “即使巡数很少”与“原文未明确巡数方向”的非原文说明保留。此轮验收的是翻译忠实性，没有读出作者未说明的时机方向。旧7a1363b3 uncertain 及 raw 原样。
- 混合预览完整 MCP：242 单元、5128 图；Arena 全文、引用与目录边界、canonical 来源去重通过。原241单元逐对象不变，全部旧选择及215 scope、193版本补文、217补证、283两个分支及其它 hold 保留。
- v25 的重建入口已持久写入原 builder 与 selection，按候选/manifest/sidecar/raw 精确绑定。实际从安装后的入口再次 stage，重建 corpus 与预检相同；再对重建产物独立执行真实 stdio MCP 和 Arena，1单元/4块/0图及完整引用授权通过。183旧装配函数原文保留。
- 实际覆盖 233/256 原章、265/303 原单元，剩余23章；预览234展示章项、242单元、6353块、5128图。正式四章 active 未切换，v24与旧pointer/register有回滚档，写者锁已释放，主书未完。
- 唯一上游新审 call `2b075f4d-a305-4630-9a87-ab957fd130f5`：14428 input / 0 cache / 680 output，35166ms。本项1/1、余0、0retry、0制作；费用、上游执行总数和远端权重未知。

`final-verification.json`、`readback.json`、`persisted-route-verification.json` 和 `coverage.json` 是实际验收证据。`selection-pin.patch` 与 builder/selection/register 前后快照保留接入及恢复依据；`236-preview.zip` 是通过持久入口重建并读回的单章可读预览，解压后打开 `knowledge.html`，其相对链接数据一并包含。全部证据禁用 Git 换行转换。

本轮脚本按既有183有限增量流程适配；执行顺序为 prepare → test-route → integrate（全部读回通过后发pointer）→ verify-persisted-route → finalize → persisted-readback → seal。已经消费的候选不得再跑 integrate/finalize；恢复前先核当前pointer/选择/锁和publication-journal。
