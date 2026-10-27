这轮先做来源映射与真缺口裁决，没有触发任何新制作。

## 结论：80 章里真未制作 = 0

246 的 57 章结论成立，并能扩展到本轮全部 80 章；我上一轮把“PDF 页没有 candidate”当成“真未制作”，这个口径是错的，已按既定来源替代契约逐 ID 重算。**没有据“63 真未制作”重制任何内容。**

## 三分统计（分开计，不互相推算）

| 口径 | 数量 | 构成 |
|---|---|---|
| 原章（分母） | **256 章 / 303 units / 21,212 源块** | `chapter-map.navigation-v3`，不变 |
| 展示章（当前预览） | **194 章 / 202 units / 5,084 blocks / 3,653 figures** | pointer 未动，原样保留 |
| 有效通过覆盖（按原章） | **194 章** | web-body 57 + web 页眉URL 110 + PDF 26 + legacy 1（无重复计入） |
| 未覆盖待处理 | **62 章 / 77 units / 7,532 owned 源块** | 全部已有产出；真未制作 **0** |

194 展示章与 194 覆盖原章数值相同但口径不同：展示侧 = 166 篇网页 + 26 个 PDF 段 + 1 supplement + 1 legacy；原章侧 = 1 篇文章（chapter01-section038）同时覆盖 111-1 与 111-25 两个原章。

## 统一来源替代契约（本轮判定标准）

1. **79-cn**：`chinese-source-body-correspondence.json` 的 article → pdfChapterIds 逐篇正文对应，允许替代；改补文字以网页为源，版本差异分别留证。
2. **nemata/modern**：`modern-pdf-url-coverage.json` 的“PDF 页眉印刷 URL 精确对应（不是标题相似）”是获准映射，允许替代；正文等价按 countPolicy 另记，不宣称逐块同一。
3. **只靠标题相似**（`modern-web-pdf-correspondence.json`）是 requires-body-comparison / fullBodyEquivalenceConfirmed=false，不允许替代。实际核对：150 章现代网页映射全部有页眉 URL 证据，没有一章只靠同主题。
4. 由此：候选存在 ≠ 已覆盖；PDF 页无 candidate ≠ 未制作。

## 80 章逐 ID 外连接

80 = **56**（与 246 一致：已产未通过）+ **6**（246 未覆盖到的 needsRepair 组）+ **17**（应改判为已覆盖）+ **1**（098-1 legacy）。
我上轮的 63 “真未制作”里：14 章其实已有效覆盖，49 章是已产未通过。

### 差异表（A = 17 章改判已覆盖；C = 6 章 246 未覆盖到、仍需处理；D = 1 章 legacy）

