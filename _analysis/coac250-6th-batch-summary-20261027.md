# COAC-250 第六批增量：227-1 / 246-1 实装与读回（2026-10-27T06:08–06:35Z）

零模型调用、零制作调用；正式教材库未切换（`textbook-corpus.json` 仍 `9836ee5b…`，corpusId
`3f44d5dc…`，`activeLibraryChanged:false`，`production-lane.lock=0`）。

## 一、交接件与实算一致性

交接件 `integration/coac250-incremental-227-1-246-1-20261027.json`，sha256
`3e9ef413f05d7eabc2b7b17bda0e1c9689d43ae6b84840996b587377df226886`，与唤醒给出值一致。
逐项重算 10 个 SHA，**全部与交接单相符，无差异**：

| 项 | 类型 | 交接值 | 本轮实算 | 结果 |
|---|---|---|---|---|
| 227-1 | 候选 | `4e1c6ed3…2590d6` | 同 | ✔ |
| 227-1 | 审校回执 | `b3b209a3…b225696` | 同 | ✔ |
| 227-1 | 父稿 | `b496daf3…c6902740` | 同 | ✔ |
| 227-1 | 父审 needs-repair | `594ec4df…61ca1c9a` | 同 | ✔ |
| 227-1 | 源 | `c4357e17…5e53d5b` | 同 | ✔ |
| 246-1 | 候选 | `bbf15bbd…26e1904` | 同 | ✔ |
| 246-1 | 审校回执 | `8e573eb3…0f7dcd3b` | 同 | ✔ |
| 246-1 | 父稿 | `eb4caf1b…e5c5c4fc4` | 同 | ✔ |
| 246-1 | 父审 needs-repair | `53f38a52…4d22dab` | 同 | ✔ |
| 246-1 | 源 | `8ea3a713…642f2933` | 同 | ✔ |

## 二、先验后装（`verify-pre-consume-coac250-6th-20261027.mjs`，两项各 21 项检查全 true）

- 回执 `production.sha256` = 候选实算 SHA；回执 `source.sourceSha256`/`mainSha256`/`htmlSha256`
  与当前 `web-sources/v1` 源逐项一致；两源均无 `tables`，不触发表几何挂起。
- 父链：候选 `provenance.revision.parentSha256` = 父文件实算 = 回执
  `productionCall.revision.revision.parentSha256`，三方一致；父审路径与 SHA 落在回执
  `parentAudit` 内且 `originalStatus: needs-repair`。
- 修正链：`notes` 就是父审 needs-repair 回执（227-1 `594ec4df…`、246-1 `53f38a52…`，
  与 `revision.notesSha256` 及回执内绑定一致），其 `production.sha256` 指回父稿。
- 改动面：**各自只重写 1 个文本块**（227-1 `b0007`、246-1 `b0070`），与 `revision.textBlockIds`
  完全一致；块序与块身份（`sourceBlockIds`）逐条不变；图数量不变，图内容实质字段零变化
  （246-1 的 10 图仅缺派生字段 `presentationAsset`，该字段由门禁 `verifyWebPresentations`
  按源重算，与已入库的 211-1/116-1 完全同构）。
- 审核者快照：`453ba938…`（与 211-1/173-1 同一冻结运行时），文件内容 SHA 与 `combinedSha256`
  重算全部一致。
- 依赖 manifest：`audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json`
  （`ed07f6b8…`）本轮重算与冻结基座 `audit/runtimes/e89dcffe…` 零差异，且覆盖快照内全部 `.mjs`。
- 活门禁：`verifyAuditForWebCandidate` 对两项均返回 `passed`（未重审、未新调用模型）。
- 去重：两个候选 SHA 不在旧 204 章预览的 `selectedWeb` 内，两个原章均未覆盖；两章原本在
  `pendingWeb`，错误码正是 `web_audit_not_passed_or_inputs_changed`。

## 三、选择与构建

- 新增 `integration/specific-web-variant-selection.v7.json`（17 个 job，sha `758b043a…`），
  v6（`16745299…`）原样保留为历史、v7 `previousSelection` 指回 v6。
- builder 固定哈希同步改为 v7；旧 builder 留档为
  `integration/build-accepted-preview.before-v7-20261027.mjs`（`c4db8b95…`），新版 `06b90b4d…`。
- 构建产物 `integration/accepted-content-preview-2026-10-27T06-08-03-592Z`，corpusId
  `11298d62…`：**206 展示章 / 214 units / 5,433 blocks / 3,994 figures**
  （原 204 / 212 / 5,377 / 3,984）。selectedWeb 175→177，pendingWeb 48→46，PDF 完整章 27 不变。
- 新旧对照（`diff-previews-coac250-6th-20261027.mjs`，全部 true）：新增 2 章、移除 0 章、
  保留 175 章；新增 2 个 unit，移除 0，**保留 unit 逐块指纹改写 0**；图 3,984→3,994（+10，
  全部来自 246-1）；pendingWeb 只少了这两条，没有新增挂起项。
- 构建内门禁全过：MCP 214 units 逐块 exact、3,994 图逐张 sha256；Arena 214 units，最大信封
  15,066B（上限 16,384）；来源去重 9,480 唯一源块、9,936 图出现、跨章碰撞 0。

## 四、正文完整性定向复核

- 227-1：候选 10 个文本块 → 正文 10 块（1 h2 + 9 p），逐段字符完全一致（908 = 908）。
- 246-1：候选 86 个文本块按 `paragraphId` 合并为 46 段（3 h2 + 43 p），段序与段身份不变；
  正文比候选多 22 个字符，全部来自内联牌码渲染：10 图 `tiles` 共 12 枚牌、逐枚码合计 24 字符，
  其中 b0049 的 `3m/5m/7m` 三连按既有缩写渲染为 `357m`（4 字符而非 6），故净增 22。
  同一现象在此前已入库的 211-1（+46 / 牌码 52）、116-1（+117 / 牌码 154）完全一致，
  属既有 stage 语义，不是截断或新增内容。

## 五、真实读回

定向 stdio MCP（`readback-coac250-6th-batch-20261027.mjs`）：catalog **206** 条；
`modern-yabejp-ja-chapter04-section007-argument`（10 块）与
`modern-yabejp-ja-chapter06-section002-argument`（46 块）`read_textbook` 分页读回与 corpus
逐块完全一致；两次检索均把目标 unit 排进 top5；两章 10 张图逐张读盘重算 sha256 全部匹配；
最大文本 14,731B。0 模型调用。

## 六、pointer 与正式库

- 新 pointer：`accepted-preview-current.json` = 新构建回执（同为 `f54af915…`），
  corpusId `11298d62…`。
- **旧 pointer 原样保留**：`accepted-content-preview-2026-10-27T05-19-25-744Z/accepted-preview-receipt.json`
  未改动，仍为 `42964920…`（即本轮开始前 pointer 的逐字节内容）。
- 正式教材库未动：`E:/AgentData/Coach/knowledge/review/textbook-corpus.json` 仍
  `9836ee5b…` / corpusId `3f44d5dc…`，`activeLibraryChanged:false`。

## 七、统一 register 与真实剩余

`integration/coac250-unified-chapter-register-20261027b.json` → `f352ac3c…`，上一版原样另存
`…b.before-coac250-6th-batch-2026-10-27T06-34-34-649Z.json`。

- 口径：已覆盖 **206** / needs-repair **50** / 未审 **0** / 真未制作 **0** = 256 原章。
- 227-1、246-1 两行由 `produced-needs-repair` 改为 `covered-effective`，并绑定候选/审校/父链/stage。
- pendingWeb 46 = 44 章审核未通过 + 1 章 `chapter01-section010` 定义边界保持 +
  1 章 `chapter06-exercise003` 基准候选仍无回执（其 rev1 已 needs-repair）。
- 本轮扫描 `audit/web/articles` 全部 `passed` 回执：05:20Z 之后只有这两条，无其它已通过待消费项。

## 附

- `coac250-6th-batch-preconsume-20261027.json`：两项逐条检查原始结果。
- `coac250-6th-batch-preview-delta-20261027.json`：新旧预览逐章/逐 unit/图/pending 差异。
- `coac250-6th-batch-readback-20261027.json`：定向 MCP 读回明细。
- `coac250-6th-batch-accepted-preview-receipt-20261027.json`：新构建回执快照。
