继续 COAC-248 主线。先读本票最新评论、统一 register（integration/coac250-unified-chapter-register-20261027b.json，0294cb22…）与 `.multica/delivery/coac-248-native-inline-correction/round-20261027T0330.json`。

本轮已完成（03:00–03:45Z）：
- **131-1 passed**：源门禁不是阻断——绑定源是 `source.v2.json`（a463edd2…，34/34 资产下载、独立源核 0 错误），失败的 `assoc-amazon.jp/e/ir` 只是 v2 里已按 `explicit-amazon-affiliate-tracking-pixel-1x1-empty-alt` 记录的非内容像素；v1 才是 failed。只改 b0123，候选 `20e84a64…`，独审 `311372d6` passed。
- **116-1 passed（专用首次修正链）**：没有父审。以父候选 `6f251511…` + 其绑定 raw `13adea8d…` + 确定性拒绝（`web_translation_placeholder:b0016`，0 模型调用可复算）建立 `audit/source-corrections/web-first-revision/chapter01-section041.deterministic-rejection.json`；新运行时 `audit/runtimes/web-first-revision-20261027` 把 `provenance.revision.firstRevision` 当作"无父审"，只验父稿真实生产调用与展示链，然后做**完整首次审校**。只改 b0016，其余 46 块与 29 图逐字节不变；候选 `6d5fd5ae…`，独审 `b5e586b7` passed。中间 rev1（同义简写仍被门禁拒）、rev2（重复邻项被弃）与一次传输失败 `a4cac35d` 的 raw 全部保留。
- **283-1（exercise003）装配已修**：b0785 的 `provenance.callId` 指向不存在的 `8b122484…`，实际字节来自 `d43a772e…`。用补丁 runner（`modern-batch-reassembly-20261027`，只为 resumed checkpoint 绑 `record.callId`）重跑，11 个 batch checkpoint 全部 resume，**0 次新调用**，候选 `dea1ba24…`，装配校验通过。批量独审已跑 2/11 组：batch-001 `7a9473ef` needs-repair（b0099 uncertain，组内看不到完整场况，非确认漏译）、batch-002 `505b780c` needs-repair（b0168 真错：`（由于摸入宝牌`直接接四索图，读成"摸入宝牌四索"，丢掉"摸入的真正宝牌是北"这一独立条件）。

下一轮任务：
1. **续跑 283-1 批量独审**：同一条命令即可，检查点 `audit/web/batches/dea1ba2453…/554a60a6…/` 已存在，续跑不重复已完成的组。每组约 5 分钟，注意前台窗口；不要在别处另起同目标审校。
2. **283-1 的 b0168 定点修订**：先看完全部 11 组问题再一次性修，避免反复作废检查点；b0099 只在确认属组内上下文限制时按证据记 uncertain，不猜。
3. **再挑 1–2 个已有父审的 web 章做定点 revision + 独审**：211-1（2 项）优先，其次 027-1/127-1/142-1/173-1/174-1/187-1/198-1/201-1/215-4/227-1/236-1/246-1/347-1（各 3 项）。
4. 79-cn:217、nemata-jp:257/98 仍先做免费源核，未定不动候选；183-1 保持校注口径 hold，不插正文注；p317 b5 仍按原授权，不解除封面证据缺口。

规则不变：定点修订 + 真实独立审校；保留父稿/旧审/原始 raw；不改全局门禁、不加豁免；同 SHA 不重派；每轮只发一条最终结果评论，状态 in_progress；整章过审才交 250。
