# COAC-250 第七批增量集成：222-1（chapter04-section004）合入预览

零模型调用、零制作调用、零数据根外写入；正式教材库未切换，上一版 pointer 原样保留。

## 一、交接件与 SHA 一致性

交接件 `integration/coac250-incremental-222-1-20261027.json` 实算 sha256
`7c562509efbb0b6d99f6c411bf91874ca40cf810188cfc1254e5e05a94f85b28`，与唤醒给出值一致。
**5 个 SHA 逐项重算全部吻合，无差异，未替换任何候选。**

| 项 | 路径 | SHA-256 | 与票面 |
|---|---|---|---|
| source | `web-sources/v1/modern-yabejp-ja/articles/chapter04-section004/source.json` | `cd98c1b5…a557605` | 一致 |
| parent | `…/chapter04-section004.display.json` | `0422143b…56f4f4d2` | 一致 |
| parent audit（needs-repair） | `…0422143b….retry-1792992204029-f963202a.json` | `3c50dae1…6c467f58` | 一致 |
| candidate | `…/chapter04-section004.rev1.json` | `3910165816…de4d56a` | 一致 |
| audit（passed） | `…/chapter04-section004.3910165816….json` | `a3981976…ba7943d` | 一致 |

- 父链三方一致：父文件、候选 `revision.parentSha256`、回执 `productionCall.revision.parentSha256` 同为 `0422143b…`；父审 needs-repair 回执 `3c50dae1…` 原样保留，未重制父稿。
- 修正链：`notesPath` 就是父审 needs-repair 回执本身（其 `production.sha256` 指回父稿），`notesSha256` 与候选、回执两侧一致。
- 改动面：`revision.textBlockIds` 声明 `b0016`、`b0018`；实算只有这 2 块变化，其余 **19 块逐字节不变**，块序与块身份不变，图 0 张（与票面"本章无图"一致）。
- 审核者快照 `453ba938…`（`3cd55e4a…`，与 227-1/246-1/211-1/173-1 同一冻结运行时）重组哈希通过。
- 依赖 manifest `manifest-web-e89dcffe.json`（`ed07f6b8…`）对冻结基座 `e89dcffe…` 重建后 **diff 为空**（added/removed/changed 全 0）。
- 活门禁 `verifyAuditForWebCandidate` 判定 `passed`——**没有重审、没有新模型调用**。
- 去重：候选 SHA 不在旧 206 章预览内，`nemata-jp-chapter-222-1` 未覆盖；该章原本就在 `pendingWeb`，错误码正是 `web_audit_not_passed_or_inputs_changed`。

## 二、选择与构建

- 新增 `integration/specific-web-variant-selection.v8.json`（18 job，`0877e327…`），v7（`758b043a…`）原样留历史、v8 `previousSelection` 指回 v7；builder 固定哈希同步改 v8，旧 builder 留档 `build-accepted-preview.before-v8-20261027.mjs`（`06b90b4d…`，改后 `build-accepted-preview.mjs` = `3008a0aa…`）。
- 新 pointer：`accepted-content-preview-2026-10-27T07-16-27-706Z`，corpusId `472db63a…`。**207 章 / 215 units / 5,454 blocks / 3,994 figures**（原 206/214/5,433/3,994）。
- 新旧对照：新增 1 章、移除 0、保留 177；新增 1 unit（`modern-yabejp-ja-chapter04-section004-argument`）、**保留 unit 逐块指纹改写 0**；selectedWeb 177→178，pendingWeb 46→45（只少了 `chapter04-section004.display.json`，无新增挂起项）。
- 构建内门禁全过：MCP 215 units 逐块 exact、3,994 图逐张 sha256、最大文本 14,883B；Arena 215 units、最大信封 15,066B（上限 16,384）；来源去重 9,501 唯一源块（+21）、9,936 唯一图出现、跨章碰撞 **0**。
- 正文完整性定向复核：候选 21 块 → 正文 21 块，**逐段字符完全一致，字符净差 0**（本章无内联牌码渲染）；`b0016`、`b0018` 两块的修订文本确实落库，父稿原文与候选新文可对照。

## 三、真实读回

定向 stdio MCP：catalog **207** 条；`modern-yabejp-ja-chapter04-section004-argument` 分页读回 21 块与 corpus 逐块完全一致；检索命中 top1；本章 0 图（无图可读）；最大文本 10,545B。

## 四、pointer、正式库与 register

- **旧 pointer 原样保留**：`accepted-content-preview-2026-10-27T06-08-03-592Z/accepted-preview-receipt.json` 未改动，仍为 `f54af915…`（即本轮开始前 pointer 的逐字节内容）。
- 正式库未动：`textbook-corpus.json` 仍 `9836ee5b…` / corpusId `3f44d5dc…`，`activeLibraryChanged:false`，`production-lane.lock=0`。
- `coac250-unified-chapter-register-20261027b.json`：`f352ac3c…` → `b6ed3e0a…`，上一版原样另存 history（`…before-coac250-7th-batch-2026-10-27T07-42-06-262Z.json`）。已覆盖 **207** / needs-repair **49** / 未审 **0** / 真未制作 **0** = 256 原章。pendingWeb 45 = 43 章审核未通过 + `chapter01-section010` 定义边界保持 + `chapter06-exercise003` 基准候选无回执。

## 五、本轮成本

- 本轮 0 次模型调用、0 次制作调用。审校回执内记录的历史用量保持原值：制作 call `5a366e25…` 13,574 in / 707 out，审校 call `de957f3e…` 14,142 in / 644 out，缓存 0。
