# COAC-250 第十一轮：staging-ready-4 交接核对 + 读回 + register 口径纠正

零模型调用、零制作调用。正式 active 库未切换；旧 pointer 与既有候选/回执一律未改动、未删除。

## 一、交接的 4 章实际状态（本机实算，不沿用交接单）

短协调 11:34Z 的 `staging-ready-4.json` 生成于第十批构建（12:22Z）之前。实数状态：

| 原章 | 预览章 | 候选 SHA-256 | 状态 |
|---|---|---|---|
| 199-1 | `modern-yabejp-ja-chapter03-section013-chapter` | `3d93eb86…` | 已入库（第十批 12:22Z 构建，10 blocks / 14 figures） |
| 142-1 | `modern-yabejp-ja-chapter01-section054-chapter` | `f3570e7b…` | 已入库（32 blocks / 84 figures） |
| 127-1 | `modern-yabejp-ja-chapter01-section047-chapter` | `363fd45c…` | 已入库（39 blocks / 72 figures） |
| 027-1 | `modern-yabejp-ja-chapter01-section010-chapter` | `44ce506d…` | **未入库，受既有 source-structure hold 约束** |

- 三章均在当前 pointer 的 `selectedWeb` 内（按路径匹配各 1 条），当前 preview receipt 的 `stages/` 各有一份 stage receipt，绑定同候选 SHA 与 passed 回执。
- 027-1 在 `pendingWeb`，错误码 `confirmed_source_definition_boundary_hold`；`integration/source-structure-holds.json`（证据 `ee816566…`）仍含 `chapter01-section010`，`integration/definition-boundary-stage-selection.json` 无该章条目，`integration/stage-definition-chapters.mjs` 仍显式断言该章 held。本轮**不解除、不重审、不入库**。
- 构建侧无漂移：builder `7ddd83f3…`，pin 仍为 `specific-web-variant-selection.v11.json`（实算 `3e222bac…`，与 pin 字面量一致）。

## 二、逐章读回（本轮重跑，真实 stdio MCP + Arena）

- pointer `accepted-content-preview-2026-10-27T12-22-49-037Z`（`99c3c7b5…`），corpusId **`f223871f…`**：**217 章 / 225 units / 5,981 blocks / 4,827 figures**，selectedWeb 188 / pendingWeb 35 / pdfStages 27。
- 三章 MCP 分页读回逐块一致：10 / 32 / 39 块，`exactBody=true`；三处修订文本均在正文内，检索 **top1** 均为本 unit；170 张图逐张 sha256 匹配、全部可达；最大文本信封 14,879B。
- Arena：225 units 全量通过，最大信封 **15,066B**（上限 16,384），`exactBody=true`，`tailCannotGrantCitation=true`。三章引用抽查：分页 2 / 9 / 8 页，末页 `sourceRefs=1`（读全后可引用），仅读尾块不得引用。
- 观察（非本批引入）：225 units 中 22 个在非末页就已返回 `sourceRefs>0`——引用在读取窗口触及 unit 末尾时即授予，而非严格最后一页；与本批三章无关，记录供后续核对。
- 四章未入库确认：`chapter01-section010`、`cv1721475`、`chapter01-section031`、`chapter01-section021-06` 均不在 catalog / corpus / knowledge-index 内。

## 三、register 口径纠正（本轮唯一写者改动）

第十批把 `produced-passed-not-staged` 写成 0，并在 `remainingTypes.note` 断言“没有已通过未入库”。按真实 passed 回执重算，实际为 **4**：

| 原章 | 文章 | 候选 | 回执时间 | 去向 |
|---|---|---|---|---|
| 027-1 | chapter01-section010 | `44ce506d…` | 11:27:18Z | 源结构 hold，未入库 |
| 081-8 | cv1721475 | `d1fc1ea8…` | 11:51:50Z | 未在本次派发清单内 |
| 089-1 | chapter01-section031 | `c5317d99…` | 12:00:09Z | 未在本次派发清单内 |
| 060-1 | chapter01-section021-06 | `6de46bfb…` | 12:01:14Z | 未在本次派发清单内 |

逐项实算：候选 SHA = 回执 `production.sha256`；候选 `source.sourceSha256` = 回执 source SHA = 当前源文件 SHA；修订父稿按 SHA 绑定成立；回执 `modelChecks`/`effectiveModelChecks` 与 `deterministicChecks` 均 passed。四者都不在当前 preview。

- 计数改为 **217 covered + 35 produced-needs-repair + 4 produced-passed-not-staged = 256**；`remainingTypes` 增 `byVerdict` 与 `eligibleForNextStage`；`blockedBySourceStructureHold` 仍为 027-1。
- 只改这 4 行（其余 76 行逐字节不变），追加 3 条 correction，历史快照 `…before-coac250-11th-run-2026-10-27T13-10-17-261Z.json`；register `5a19d2c2…` → `7437df35…`。

## 四、未做与边界

- 不切换正式库：`textbook-corpus.json` 仍 `9836ee5b…` / corpusId `3f44d5dc…`，`activeLibraryChanged=false`；旧 pointer 目录未动。
- 081-8 / 089-1 / 060-1 具备零模型调用入库条件，但不在本次派发范围（回执晚于 11:34Z 清单），本轮未动其文件，留待下次派发。
- 027-1 的解锁条件不变：`chapter01-section010` 的定义边界 sidecar + stage proof 进入 `definition-boundary-stage-selection.json`，并取得独立门禁；其后可零重审入库。
- 仍未覆盖原章 39 / 256（覆盖 217）。
