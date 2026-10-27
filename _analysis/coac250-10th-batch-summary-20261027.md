# COAC-250 第十批增量合库（269 b5b6 小批：199-1 / 142-1 / 127-1，027-1 留出）

零模型调用、零制作调用。唯一写者不变；正式 active 库未切换，旧 pointer 原样保留。

## 一、本批实际入库

| 原章 | 预览章 | 候选 SHA-256 | 独审回执 | 状态 | 改动面 |
|---|---|---|---|---|---|
| 199-1 | `…chapter03-section013-chapter` | `3d93eb86…` | `2247cb22…`（retry） | passed 10:01:30Z（248 审，本批不重审） | 仅 `b0006`/`b0009`，其余 35 块逐字节不变，14 图继承父稿 |
| 142-1 | `…chapter01-section054-chapter` | `f3570e7b…` | `5a8a41e7…` | passed 11:25:33Z（249 审） | 仅 `b0173`，其余 184 块不变，84 图继承父稿 |
| 127-1 | `…chapter01-section047-chapter` | `363fd45c…` | `05be99be…` | passed 11:27:18Z（249 审） | 仅 `b0030`，其余 161 块不变，72 图继承父稿 |

- 交接件实算：`integration/coac249-incremental-269-b5b6-20261027.json`（`4c825b06…`）。三章源/父/父审/候选/审核 SHA 逐项重算全部吻合，未替换任何候选，也未重审任何已通过 SHA。
- 三份 269 attestation 逐项核实：manifest `0aa071a4…` 冻结、receipt 绑定本候选与本 review、原模型调用记录文件哈希一致、manifest 对冻结基座复验仍 `ok`。
- 199-1 的**有效回执是绑定重试**：基础回执 `failed`（空传输），`retry-1793095290967-e15ea7b7` 的 `retryOfAudit` 绑定前一份（路径+sha）且 `passed`。审计门实时复验同为 `passed`。
- 依赖基座：199-1 走 `web-e89dcffe`（manifest `ed07f6b8…`，auditor 快照 `453ba938…`）；269 三章走冻结 `web-target-text-chain-20261027`（manifest `0aa071a4…`，快照 `856dad9d…`）。重算均与实算一致、diff 为空。

## 二、027-1 留出的确切理由（不是 283）

`chapter01-section010` 处于**既有 source-structure hold**（`integration/source-structure-holds.json`，证据 `ee816566…`）之内，且 `integration/definition-boundary-stage-selection.json` 没有它的条目；`integration/stage-definition-chapters.mjs` 仍显式断言该章 held（“unresolved semantic review remains held”）。027-1 的修订只动 `b0056` 一句译文，既不解决、也不豁免 dt/dd 边界呈现的语义复核。因此本批**不解除该 hold、不重审、不入库**，只把它记入剩余类型。283-1（chapter06-exercise003）的争议本批完全没有触碰，也没有阻塞这三章。

## 三、构建、门禁与读回

- 新 pointer `accepted-content-preview-2026-10-27T12-22-49-037Z`，corpusId `f223871f…`：**217 章 / 225 units / 5,981 blocks / 4,827 figures**（原 214/222/5,900/4,657）。
- 新增 3 章、移除 0、保留 185；**保留 unit 逐块指纹改写 0**、保留章版本变更 0；图 +170、移除 0（=14+84+72，与三章候选图数完全相等）。
- pendingWeb 38→35：−3 全部是本批解决的三条 display；**无新增 pending**；`chapter01-section010.display.json` 仍为 `confirmed_source_definition_boundary_hold`。
- 构建内门禁：MCP 225 units、4,827 图逐张 sha256、最大文本 14,883B；Arena 225 units、最大信封 15,066B（上限 16,384）；来源去重 11,456 唯一源块、跨章碰撞 **0**。
- 正文完整性：三章候选文本块按 `sourceBlockIds` 逐块原样出现在 staged 段落中；三处修订的整段候选文本均落库，旧表述消失。
- 定向 stdio MCP：catalog 217 条，三 unit 分页读回逐块一致（10/32/39），修订文本均在正文内且检索 **top1**，170 图逐张 sha256 匹配。

## 四、本批发现并修掉的 builder 缺陷

第九批新增的 `webCandidateDedupe` 只读基础回执 `<article>.<sha>.json`，所以**有效回执是绑定重试**的稿子会被记成 `superseded-failed` 且 `effective: null`。第一次构建（11:50）里三章都正确入库，但回执自身把 `chapter03-section013` 记成“没有生效的通过版”，与同一份回执的 `selectedWeb` 自相矛盾。

已按 `textbook-audit-web.mjs` 的 `latestWebAuditReceipt` 规则修：`retry-` 回执只有在 `retryOfAudit` 绑定紧邻前一份（归一化路径 + sha）且前一份为 `failed` 时才生效；每个版本行额外记录 `effectiveReceiptPath` / `receiptChainLength`。该字段只作报告，不参与选片与装配，因此重构建与首构建内容完全相同（同 corpusId、同 217/225/5981/4827）。首构建目录留存、不被任何 pointer 引用。

## 五、正式库与 register

- 正式库未动：`textbook-corpus.json` 仍 `9836ee5b…` / corpusId `3f44d5dc…`，`activeLibraryChanged:false`。
- 旧 pointer（`…10-38-35-579Z`，回执 `3927fdab…`）未改动，目录字节不变。
- register：`8db9643f…` → `5a19d2c2…`，已覆盖 **217** / needs-repair **39** / 未审 **0** / 真未制作 **0** = 256 原章；原单元覆盖 249 / 303（剩余 39 章合计 54 单元）。
- 剩余 39 章的类型：`confirmed-produced-not-covered` 34 + `additional-uncovered-not-in-246` 5；按路线 web 36 / 仅 PDF 3；其中被 source-structure hold 卡住的仅 027-1。全部都有产物，只是尚未拿到整章 passed 回执（needs-repair 或修后待复审），没有“已通过未入库”，也没有“未制作”。

## 六、仍未合入

- **027-1（chapter01-section010）**：通过稿 `44ce506d` 已就位，但受既有定义边界 hold 约束，等该章语义复核与 stage proof 补齐后可零重审入库。
- **283-1（chapter06-exercise003）**：最新回执仍 needs-repair，本批未触碰。
- **183-1（chapter03-section003）**：仍无任何审核回执，不可入库。
- 其余 36 章保持 needs-repair，等各自 passed 交接。
