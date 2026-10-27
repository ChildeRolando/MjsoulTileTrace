# COAC-250 第五批增量：211-1 / 173-1 / 116-1 实装与读回（2026-10-27T05:2x–05:5xZ）

零模型调用、零制作调用；正式教材库未切换（`textbook-corpus.json` 仍为 `9836ee5b…`，corpusId
`3f44d5dc…`，`activeLibraryChanged:false`，`production-lane.lock=0`）。

## 一、三个新通过项的实算绑定（先验证，后装配）

| 原章 | 预览章 | 候选 | 候选 SHA-256 | 审核回执 | 回执状态 |
|---|---|---|---|---|---|
| `nemata-jp-chapter-211-1` | `modern-yabejp-ja-chapter03-section024-chapter` | `chapter03-section024.rev1.json` | `643cc585…196eba` | `chapter03-section024.643cc585….json` | passed 04:09:52Z |
| `nemata-jp-chapter-173-1` | `modern-yabejp-ja-chapter02-section023-chapter` | `chapter02-section023.rev1.json` | `098459b6…9cd3` | `…098459b6….retry-1793074518139-c3b705f3.json` | passed 04:15:18Z（retryOfAudit，首次传输失败） |
| `nemata-jp-chapter-116-1` | `modern-yabejp-ja-chapter01-section041-chapter` | `chapter01-section041.rev3.json` | `6d5fd5ae…e9e46` | `chapter01-section041.6d5fd5ae….json`（调用 `b5e586b7…`） | passed 03:22:55Z |

逐项实算（`verify-pre-consume-coac250-5th-20261027.mjs`，全部 `true`）：

- 回执 `production.sha256` = 候选文件实际 SHA；回执 `source.sourceSha256` = 当前 `web-sources/v1`
  源文件 SHA；`mainSha256`/`htmlSha256` 与源一致。
- 父链：211-1 父 `chapter03-section024.display.json` `692318b7…`、173-1 父
  `chapter02-section023.display.json` `a1c2a38b…`、116-1 父 `chapter01-section041.display.json`
  `6f251511…`，均与候选 `provenance.revision.parentSha256` 与回执
  `productionCall.revision.revision.parentSha256` 三方一致。
- 修正链说明数据：211-1 `notes` = 旧 needs-repair 回执 `8ced42b7…`；173-1 `notes` =
  `beda2be1…`；116-1 为 `firstRevision`，`notes`=`evidence`=
  `audit/source-corrections/web-first-revision/chapter01-section041.deterministic-rejection.json`
  `4d7d156f…`，证据内 `auditReceipt:null`、`modelCalls:0`、目标块 `b0016` 与候选
  `textBlockIds` 完全一致。
- 审核者快照：`combinedSha256` 重算一致，四份文件内容 SHA 全部通过。
- 依赖 manifest：211-1/173-1 的运行时 = 冻结基座
  `audit/runtimes/e89dcffe…`，对应已记录的 `manifest-web-e89dcffe.json`
  （`ed07f6b8…`）本轮重算仍匹配；116-1 的运行时 = 冻结基座
  `audit/runtimes/web-first-revision-20261027`，此前没有记录 manifest，本轮以零模型调用确定性
  生成 `audit/runtime-patches/20261027-coac250-116-1-first-revision/manifest-web-first-revision.json`
  （`1f67dc86…`），其 JS 闭包与审核者快照逐一相符（`.py` 提取器由快照自身内容哈希覆盖）。
- 与现 201 章预览对照：三个候选 SHA 均不在预览内，三个原章均未覆盖 → 无需去重排除。

## 二、为了让 116-1 的既有回执可被门禁验证

工作树 `scripts/scene-study/textbook-audit-web.mjs` 只有 COAC-249 的批次重试补丁，没有
`verifyWebFirstRevision`；直接跑会退回父稿 `verifySource`，在 `b0016` 占位符上拒绝已通过的回执。
本轮把冻结运行时 `web-first-revision-20261027` 里已有的首修门禁原样移植进工作树（14 行函数 +
1 处分派 + 1 处“首修强制全文审”投影守卫），保留批次重试补丁；原文件留
`textbook-audit-web.mjs.orig-coac250-firstrev`。补丁后 sha `0d501787…`，门禁对三项均返回 `passed`
——**没有重审、没有新模型调用**。

## 三、选择与构建

- 新增 `integration/specific-web-variant-selection.v6.json`（15 个 job，v5 原样保留为历史、
  `previousSelection` 指回 v5 `5058bfec…`），builder 的固定哈希同步改为 v6 `16745299…`。
- 构建产物 `integration/accepted-content-preview-2026-10-27T05-19-25-744Z`，corpusId
  `a8742114…`：**204 展示章 / 212 units / 5,377 blocks / 3,984 figures**（原 201/209/5,342/3,935）。
  selectedWeb 172→175，pendingWeb 51→48，PDF 完整章 27 不变。
- 新旧对照：新增 3 章、移除 0 章、保留 201 章逐块指纹未改写（`rewritten 0`）。
- 构建内门禁：MCP 212 units 逐块 exact、3,984 图逐张 sha256；Arena 212 units，最大信封
  15,066B（上限 16,384）；来源去重 9,374 个唯一网页源块、9,924 次图片出现、跨章碰撞 0。

## 四、真实读回

定向 stdio MCP（`readback-coac250-5th-batch-20261027.mjs`）：catalog 204 条，
`read_textbook` 三个 unit 逐块与 corpus 完全一致（8 / 5 / 22 块），三次检索均把目标 unit 排进
top3，最大文本 14,360B。0 模型调用。

## 五、统一 register

`integration/coac250-unified-chapter-register-20261027b.json` 更新为 `ef95cd8b…`，上一版原样另存
`…b.before-coac250-5th-batch-20261027T0520Z.json`。

- 口径：已覆盖 **204** / needs-repair **52** / 未审 **0** / 真未制作 **0** = 256 原章。
- 116-1 记为 covered-effective（不再是无审）。
- `nemata-jp-chapter-283-1`（`chapter06-exercise003`）由“无审”改为 **produced-needs-repair**：
  其 `chapter06-exercise003.rev1.json`（`dea1ba24…`）已有一份真实 needs-repair 回执（389 项），
  属待修而非缺回执。

## 六、当前真实剩余

- pendingWeb 48 = 46 章审核未通过 + 1 章 `chapter01-section010` 定义边界保持 + 1 章
  `chapter06-exercise003` 基准候选仍无回执（其 rev1 已 needs-repair）。
- needs-repair 原章 52 章，均为已产出待修；真未制作 0。
- 本票当前 **0 条 enabled 的同目标唤醒**（24 条历史唤醒全部 disabled），无可复用者，本轮也未新建。

## 附

- `coac250-5th-batch-preconsume-20261027.json`：三项逐条检查原始结果。
- `coac250-5th-batch-readback-20261027.json`：定向 MCP 读回明细。
- `coac250-5th-batch-accepted-preview-receipt-20261027.json`：新构建回执快照。
