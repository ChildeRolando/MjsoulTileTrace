# COAC-250 第九批增量合库（201-1 + 269 首轮 338-1/273-1）

零模型调用、零制作调用。唯一写者不变；正式库未切换，旧 pointer 原样保留。

## 一、本批实际入库

| 原章 | 预览章 | 候选 SHA-256 | 独审回执 | 状态 | 改动面 |
|---|---|---|---|---|---|
| 201-1 | `…chapter03-section015-chapter` | `d63f3a89…` | `6034b9a1…` | passed 09:47:54Z | 仅 `b0041`，其余 46 块逐字节不变，19 图继承父稿 |
| 338-1 | `…archive01-section006-chapter` | `ff5a9b52…` | `74b93630…` | passed 10:01:45Z（249 审） | 仅 `b0518`，其余 587 块不变，260 图继承父稿 |
| 273-1 | `…chapter06-exercise002-02-chapter` | `42991d76…` | `0553be30…` | passed 10:02:55Z（249 审） | 仅 `b0263`/`b0545`，其余 690 块不变，292 图继承父稿 |

- 交接件实算：`integration/coac250-incremental-201-1-20261027.json`、`integration/coac249-incremental-269-line-b-20261027.json`（`9cc7908c…`）。三章源/父/父审/候选/审核 SHA 逐项重算全部吻合，未替换任何候选。
- 父链三方一致，三份父 needs-repair 回执原样保留；审核者快照 `453ba938…`（201-1）与 `856dad9d…`（269 两章）重组哈希通过。
- 依赖 manifest：201-1 为 `web-e89dcffe`（`ed07f6b8…`），269 两章为冻结基座 `web-target-text-chain-20261027`（`0aa071a4…`），均与实算一致且 diff 为空。

## 二、按 canonical 章 ID 去重（不是只比 candidateSHA）

`build-accepted-preview.mjs` 的平扫原先按原始文件名建键，`<article>.coac269rev1.json` 因此被当成另一个「文章」，只能永远 pending，或一旦有同名回执就在装配处撞 `duplicate_chapter`。本轮改为：

1. 文件名先归一到 canonical 章 ID（剥 `.display` / `.coac269revN` / `.revN` / `.rN`）；
2. 每个 canonical 章只保留一个登记，优先级 display > 平稿 > 修订/草稿；
3. preview 回执新增 `webCandidateDedupe`：逐章列出全部版本、各自回执状态、effective 最新通过版与落选项。

因此本批只入 3 章而非 6 章：269 第二轮误重制了**已入库**的 246-1 / 237-1 / 131-1，这三份新草稿没有 passed 回执，被明确排除，原 `.rev1.json` 已通过稿一个字节没动。

| 原章 | canonical 文章 | 已入库版本 | 269 重复草稿 | 结论 |
|---|---|---|---|---|
| 246-1 | `chapter06-section002` | `…rev1.json` `bbf15bbd…` passed | `…coac269rev1.json` 无回执 | 原稿保留 |
| 237-1 | `chapter04-section016` | `…rev1.json` `d14aac65…` passed | `…coac269rev1.json` 无回执 | 原稿保留 |
| 131-1 | `chapter01-section049` | `…rev1.json` `20e84a64…` passed | `…coac269rev1.json` 无回执 | 原稿保留 |
| 183-1 | `chapter03-section003` | 无（父稿 needs-repair） | `…coac269rev1.json` 无回执 | 独立核实为待审，不入库 |

## 三、构建、gates 与读回

- 新 pointer `accepted-content-preview-2026-10-27T10-38-35-579Z`，corpusId `5eebf4df…`：**214 章 / 222 units / 5,900 blocks / 4,657 figures**（原 211/219/5,519/4,086）。
- 新增 3 章、移除 0、保留 182；**保留 unit 逐块指纹改写 0**、保留章版本变更 0；图 +571、移除 0。
- pendingWeb 43→38：−5 全部是本批解决的条目（三章 display 各一，加上两个此前的 `.coac269rev1` 伪条目）；**无新增 pending**。
- 构建内门禁：MCP 222 units 逐块 exact、4,657 图逐张 sha256、最大文本 14,883B；Arena 222 units、最大信封 15,066B（上限 16,384）；来源去重 11,072 唯一源块、跨章碰撞 **0**。
- 正文完整性：三章候选文本块按 `sourceBlockIds` 逐块原样出现在 staged 段落中，无截断/漏块；修订句确实落库。
- 定向 stdio MCP：catalog 214 条，三 unit 分页读回逐块一致（9/107/265），修订文本均在正文内且检索 **top1**，571 图逐张 sha256 匹配。

## 四、正式库与 register

- 正式库未动：`textbook-corpus.json` 仍 `9836ee5b…` / corpusId `3f44d5dc…`，`activeLibraryChanged:false`。
- 旧 pointer `…09-53-06-371Z/accepted-preview-receipt.json` 未改动，仍 `0633fdc0…`。
- register：`20b53539…` → `8db9643f…`，已覆盖 **214** / needs-repair **42** / 未审 **0** / 真未制作 **0** = 256 原章。

## 五、仍未合入

- **183-1（chapter03-section003）**：独立核实——唯一回执是父稿 display 的 needs-repair `889adf0d`，269 b3 草稿 `5083143…` 没有任何回执，故不可合入。
- **283-1（chapter06-exercise003）**：最新回执仍 needs-repair。
- 其余 42 章保持 needs-repair，等各自 passed 交接。
