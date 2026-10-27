
列说明：`源SHA` 后 ✓ 表示回执源 SHA = 当前选择的源 SHA；`passed*` 为具体来源校正/标签补译等通过状态；`待通过块` 按章 owned 源块计，括号内是 PDF 侧尚无通过候选的页（网页路线另有候选时仅供参考）。

## 对 246 的三处修正（按当前文件复算）

1. **130-1**：246 记 failed；`2026-10-27T01:43:49Z` 已有 passed 回执（候选 `021f93bc…`、源 `337b6f3f…`），改判 passed-not-staged。
2. **197-1**：246 记 failed（调用失败）；`2026-10-27T02:02:55Z` 已有 needs-repair 回执（同候选 `f5b699f0…`、源 `ecc4814d…`），是语义结论，不是调用失败。
3. **131-1 / 183-1 / 303-1** 的 `auditSourceStale=true` 未复现：候选、回执、`modern-current-source-selection-v3` 三处源 SHA 分别一致（`a463edd2…` / `cb73d3a8…` / `567beb70…`），deterministicChecks 均 passed。它们是语义/模型未过，不是源过期。

## 真实缺口与去向（现有 owner 继续，不新制作）

- **needs-repair 56**：48 章（246 repair 名单）+ 131/183（换绑后重审）+ 197-1 + 215-4 / 217-4 / 001-64 / 250-1 / 317-51。按候选 SHA 定点修复，不重制、不重审同 SHA。
- **passed-not-staged 3**：104-5（回执在基础 id `cv1726202.<sha>` 下，选中文件是 `processing-note-v1` 变体，builder 按变体名找 receipt 落空——是命名/选择接线，不是未制作或未审）、130-1、260-18（PDF 六页全 passed，p263 于 `02:04Z` 新过）。可直接进下一次装配评估。
- **未审 2**：116-1、283-1 → 249 首审。
- **失败 1**：303-1 → 249 重审。
- 待通过源块合计 **6,546**（章 owned 口径）；真正缺制作块 **0**。

## 写入与快照

- **0 模型调用、0 制作调用**；未改 pointer / selection / 预览，194 章 202 units 原样保留。
- 快照时间 `2026-10-27T02:06Z`。248 的返修仍在落地（例如 p263 在 02:04Z 新通过，260-18 因此从“待修”变为 PDF 全页 passed），下一次读回会继续前进。
- 统一清单已写入 `integration/coac250-unified-chapter-register-20261027.json`（sha256 `e5a6bf89…`），并附在本评论；全链以它为唯一映射依据。旧的 80 章 register / readback 由它 supersede，作为历史证据保留、不覆盖。
