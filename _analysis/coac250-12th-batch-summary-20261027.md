# COAC-250 第十二批增量合库（249 b7 两章 + 248 081-8，共 3 章）

零模型调用、零制作调用。唯一写者不变；正式 active 库未切换，旧 pointer 与既有候选/回执/父稿一律未改动、未删除，全程未重审。

## 一、本批入库

| 原章 | 预览章 | 候选 SHA-256 | 有效回执 | 状态 | 改动面 |
|---|---|---|---|---|---|
| 089-1 | `modern-yabejp-ja-chapter01-section031-chapter` | `c5317d99…` | `11e0c9f0…` | passed 12:00:09Z | b0042/b0084/b0102/b0153 四处译文，其余 29 文本块与 75 图不变 |
| 060-1 | `modern-yabejp-ja-chapter01-section021-06-chapter` | `6de46bfb…` | `949a4856…` | passed 12:01:14Z | b0027/b0033 两处译文，其余 19 文本块与 50 图不变 |
| 081-8 | `79-bilibili-cn-cv1721475-chapter` | `d1fc1ea8…` | `f1328e6a…` | passed 11:51:50Z | 4 个 figure 牌码重读；19 文本块与其余 4 图实质不变 |

- 交接件实算：`integration/coac249-incremental-269-b7-20261027.json`（`ccedd72f…`）、`integration/coac250-incremental-081-8-20261027.json`（`9a456aef…`），与交接声明一致。
- 逐项重算源/父/父审/候选/审核 SHA 全部吻合；三份回执的 production 都绑定本候选，`modelChecks`/`effectiveModelChecks`/`deterministicChecks` 均 passed；auditor 快照重组哈希与声明一致。
- 089-1、060-1 绑在冻结 `web-target-text-chain-20261027`（auditor `856dad9d…`，依赖 manifest `0aa071a4…`，对基座复验 `ok:true`）；081-8 绑在 e89dcffe 基座（auditor `453ba938…`，manifest `ed07f6b8…`，复验 `ok:true`）。
- 三章都确认是各自 canonical 文章**当前有效的最后一版 passed**（按章版本清单逐版核回执；081-8 的 display 父稿仍保留其 needs-repair 回执）。
- 活跃审计门实时复验三章均 `passed`，且返回的正是交接点名的回执路径。

## 二、跨书重号（本次重点核对）

- `nemata-jp-chapter-215-4`（chapter03-section027）已覆盖，本批未动。
- `79-cn-chapter-215-4`（p215–217）仍 `produced-needs-repair`，p217 无 passed 回执，作为**未结项保留**：未按尾号去重、未移除、未并入 nemata 的同号章。
- 去重键始终是「书 + canonical 文章 id」；预览章 id 带书前缀，物理上不可能碰撞。register 新增 `crossBookNumbering` 段固定这条规则与两条实际状态。MCP 读回同时验证：catalog/corpus 里 nemata-215-4 在、79-cn-215-4 不在。

## 三、构建、保留与读回

- 新 pointer `accepted-content-preview-2026-10-27T13-28-23-528Z`，corpusId `09354736…`：**220 章 / 228 units / 6,072 blocks / 4,960 figures**（原 217/225/5,981/4,827）。
- 新增 3 章、移除 0；保留 225 units **逐块指纹改写 0、丢失 0**；图 +133（=75+50+8）、移除 0。
- pendingWeb 35→32，减的正是三章 display，**无新增 pending**。
- 构建内门禁：MCP 228 units、最大文本 14,883B；Arena 228 units、最大信封 15,066B（上限 16,384）；来源去重通过。
- 本轮独立读回（真实 stdio MCP）：catalog **220** 条；三 unit 分页逐块一致（44 / 28 / 19，`exactBody=true`）；三处修订文本都在正文内，检索 **top1** 均为本 unit；133 张图逐张 sha256 可读且匹配；最大文本 14,659B。
- 本轮 Arena 复验：228 units 全量通过，最大信封 15,066B，`exactBody=true`，`tailCannotGrantCitation` 全部成立。
- 正文/图完整性：三章候选文本块按 `sourceBlockIds` 逐块原样落进 staged 段落；修订块的新文句全部落库、旧表述消失；081-8 的 8 个 figure 块转录与候选逐字一致，4 个改名 figure 的转录确实变化，其余 4 图只差派生 presentationAsset。
- 027-1（chapter01-section010）仍在 catalog/corpus 之外：held 未解除、未重审、未入库。

## 四、register 与覆盖

- register `7437df35…` → `9e644446…`：已覆盖 **220** / needs-repair **35** / 已通过未入库 **1**（027-1，hold）/ 未审 **0** / 真未制作 **0** = 256。
- 原单元覆盖 **252 / 303**（剩余 36 章合计 51 单元）。
- 剩余 36 章：`confirmed-produced-not-covered` 31 + `additional-uncovered-not-in-246` 5；路线 web 33 / 仅 PDF 3；被 source-structure hold 卡住的只有 027-1。
- 本批覆盖数是按真实构建与逐章回执实算的 220，不是把任何理论数字（如 214+7）当作已验收结果。

## 五、正式库与边界

- 正式库未动：`textbook-corpus.json` 仍 `9836ee5b…` / corpusId `3f44d5dc…`，`activeLibraryChanged:false`；旧 pointer `…12-22-49-037Z` 及其回执原样保留。
- builder pin 从 selection v11（`3e222bac…`）移到 v12（`943b47ee…`），构建器 `7ddd83f3…` → `ea1f6250…`，改前副本 `build-accepted-preview.before-v12-20261027.mjs`。
- 全程 0 次模型调用、0 次制作调用。

## 六、仍未合入

- **027-1**：passed 回执就位，但 `chapter01-section010` 的定义边界 hold 未解，需先补 sidecar + stage proof。
- **79-cn-chapter-215-4**：p217 needs-repair，未结项保留。
- **283-1** 仍 needs-repair；**183-1** 仍无审核回执。
