# COAC-250 第八批增量集成：174-1 / 187-1 / 198-1 / 215-4 合入预览

零模型调用、零制作调用；正式教材库未切换，上一版 pointer 原样保留。

## 一、交接件与 SHA 一致性（先核对，再装配）

| 交接件 | 实算 SHA-256 | 与唤醒/票面 |
|---|---|---|
| `integration/coac250-incremental-174-1-20261027.json` | `5430586e57be6d346395cb59519683163af3279ccab1451af763c6d83574a793` | 一致 |
| `integration/coac250-incremental-187-1-198-1-20261027.json` | `76bfe55dbc7d85f573ba69e81345951abb792b4ed1e692372af0dbaf1d97b5dc` | 与唤醒 `76bfe55d…` 一致 |
| `integration/coac249-incremental-215-4-rev2-20261027.json` | `3c62e9e0cd082abae1e6b8ef8ef8dac93e789f453759bd3e23f29a8997c8e5b1` | 一致 |

四章全部逐项重算源/父/父审/候选/审核 SHA，与交接值完全吻合，未替换任何候选。

| 原章 | 预览章 | 候选 SHA-256 | 审核回执 | 状态 | 实算改动面 |
|---|---|---|---|---|---|
| 174-1 | `…chapter02-section024-chapter` | `7ceae3d0…adc5a7` | `8f586cab…c9290fa` | passed 08:01:43Z | 仅 `b0036`，其余 44 块逐字节不变，8 图仅派生字段 |
| 187-1 | `…chapter03-section006-chapter` | `310a9fb9…644f2d2e2` | `1dff00c2…c414362e3e45` | passed 09:21:53Z | 仅 `b0095`，其余 103 块不变，48 图仅派生字段 |
| 198-1 | `…chapter03-section012-chapter` | `af5ea28c…a1245820e3b` | `d930c9ef…7109be802669` | passed 09:17:56Z | 仅 `b0082`，其余 81 块不变，36 图仅派生字段 |
| 215-4 | `…chapter03-section027-chapter` | `a75742e9…7f5280a431817` | `8f02f593…6fffd91e2e15` | passed 09:32:50Z | 仅 `b0011`，其余 12 块不变，本章无图 |

- 父链三方一致：`0af14db9…`（174-1）、`a09441ee…`（187-1）、`62d901f6…`（198-1）、`e9a9376e…`（215-4）——父文件、候选 `revision.parentSha256`、回执 `productionCall.revision.parentSha256` 相同；四份父 needs-repair 回执（`678e5c8d…` / `02b455cc…` / `69dc5491…` / `42d80845…`）原样保留，未重制父稿。
- 修正链：四章 `notesPath` 就是父审 needs-repair 回执本身（其 `production.sha256` 指回父稿），`notesSha256` 与候选、回执两侧一致。
- 审核者快照：174-1/187-1/198-1 为 `453ba938…`（`3cd55e4a…`）；215-4 为 `856dad9d…`（与 249 交接 `auditorSnapshotSha256` 一致），四个快照重组哈希全部通过。
- 依赖 manifest：前三章 `manifest-web-e89dcffe.json`（`ed07f6b8…`）对冻结基座重建 diff 为空；215-4 的 `0aa071a4…` 在共享根此前没有落盘文件，本轮按冻结基座 `web-target-text-chain-20261027` 确定性补记到 `audit/runtime-patches/20261027-coac250-215-4-target-text-chain/manifest-web-target-text-chain.json`，与 249 交接声明值一致。
- 活门禁 `verifyAuditForWebCandidate` 四项均 `passed`——没有重审、没有新模型调用。
- 去重：四个候选 SHA 均不在旧 207 章预览内，四个原章均未覆盖，原本都在 `pendingWeb`，错误码正是 `web_audit_not_passed_or_inputs_changed`。

## 二、215-4 的第二序修订与门禁移植

- 215-4 是「rev2 on needs-repair rev1」的二级定点修订。其已通过回执是在冻结运行时 `audit/runtimes/web-target-text-chain-20261027` 上产生的；该冻结门禁相对活模块的语义差异只有一处：存在 `effectiveModelReview` / `effectiveModelChecks` 时读合并后的全篇审校，而不是只读目标块审校。
- 活门禁此前对同一已通过 SHA 误报 `web_revision_notes_scope`。按 116-1 首修门禁的先例，把冻结运行时里**已有**的这处逻辑原样移植进活模块（6 处文本拼接），保留首修门禁、组修订门禁和批次重试补丁，原文件留 `.orig-coac250-target-text-chain`：`320e89ce…` → `e001c274…`。
- 移植后四项门禁均 `passed`；构建时对 182 个已选网页候选全部重新过门禁，178 章原样保留、0 章丢失、0 unit 改写——无回归。

## 三、选择与构建

- 新增 `integration/specific-web-variant-selection.v9.json`（22 job，`10db28df…`），v8（`0877e327…`）原样留历史、v9 `previousSelection` 指回 v8；builder 固定哈希同步改 v9，旧 builder 留档 `build-accepted-preview.before-v9-20261027.mjs`（`3008a0aa…`，新 builder `bcf2f2a2…`）。
- 新 pointer：`accepted-content-preview-2026-10-27T09-53-06-371Z`，corpusId `34111851…`，bodySha256 `d3e06767…`。
- **211 章 / 219 units / 5,519 blocks / 4,086 figures**（原 207/215/5,454/3,994）；selectedWeb 178→182，pendingWeb 45→43。
- 新旧对照：新增 4 章、移除 0、保留 178 章；新增 4 unit、**保留 unit 逐块指纹改写 0**；图 +92（8+48+36+0）、移除 0。
- pendingWeb 减少 4 条（四章旧 `.display.json`），新增 2 条 `archive01-section006.coac269rev1.json`、`chapter06-exercise002-02.coac269rev1.json`——它们是构建前刚落到候选目录的 COAC-269 首审候选，状态 `awaiting-independent-audit-receipt`，从未在旧选择内，不是本轮回退。
- 构建内门禁全过：MCP 219 units 逐块 exact、4,086 图逐张 sha256、最大文本 14,883B；Arena 219 units（`realStdioMcp:true`、`exactBody:true`、`mixedPdfAndWeb:true`）、最大信封 15,066B（上限 16,384）；来源去重 9,745 唯一源块（+244）、跨章碰撞 **0**；`crossChapterNavigation` 保持 `chapter-local-only`。

## 四、正文完整性与真实读回

- 正文完整性：候选文本块按 `locator.sourceBlockIds` 逐块映射到 staged 段落后，**四章全部逐块原样出现**（无截断/乱序/漏块），差异只有内联牌码渲染（每段 +0～+40 字符，均为偶数位牌码）；四章修订文本确实落库，父稿旧句在新文中被替换（187-1 的新句包含旧句子串，按子串关系如实标注）。
- 定向 stdio MCP：catalog **211** 条；四个 unit 分页读回与 corpus 逐块完全一致（29 / 11 / 12 / 13 块），修订文本均在正文内，四次针对性检索均命中 **top1**；92 张图逐张读盘重算 sha256 全部匹配；最大文本 14,610B。

## 五、pointer、正式库与 register

- **旧 pointer 原样保留**：`accepted-content-preview-2026-10-27T07-16-27-706Z/accepted-preview-receipt.json` 未改动，仍为 `4502ebc0…`（即本轮开始前 pointer 的逐字节内容）。
- 正式库未动：`textbook-corpus.json` 仍 `9836ee5b…` / corpusId `3f44d5dc…`，`activeLibraryChanged:false`，正式库未切换。
- `coac250-unified-chapter-register-20261027b.json`：`b6ed3e0a…` → `20b53539…`，上一版原样另存 history。已覆盖 **211** / needs-repair **45** / 未审 **0** / 真未制作 **0** = 256 原章。

## 六、本轮监听到的其它动态（未入库，原因明确）

- **201-1（chapter03-section015，COAC-248 09:55Z 交接）**：已逐项核过候选 `d63f3a89…` / 审核 `6034b9a1…`（passed 09:47:54Z）/ 父链 `41c7c1bf…` / 父审 `77f02f9a…` / 源 `8939308a…`，manifest `ed07f6b8…` diff 为空，活门禁 `passed`，去重干净；本轮只有这 1 章就绪，按「一批 2–4 章摊薄成本」的规则并入下一批，重新构建时不需再核 SHA 只要文件未变。
- **283-1（chapter06-exercise003，COAC-248 283-1 聚合）**：其 `chapter06-exercise003.rev2.json`（`849267b8…`）最新回执状态是 **needs-repair**（06:28Z，组修订），门禁 `web_audit_not_passed_or_inputs_changed`，不可合入。
- **COAC-269 线**：`archive01-section006`、`chapter06-exercise002-02` 两个首修候选 09:39–09:40Z 刚落盘，尚无首审回执；`chapter03-section013` 的 rev1 首审 09:42Z 为 **failed**。三者均无 passed 交接，本轮不合入。

## 七、本轮成本

- 本轮 0 次模型调用、0 次制作调用；构建与验证均为确定性本地执行。
