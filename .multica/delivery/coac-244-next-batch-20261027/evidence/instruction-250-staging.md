本轮由 COAC-244 短协调派发，只做零模型调用的增量入库，不改正式库、不做最终切换。

读本目录 staging-ready-4.json。这 4 章都有真实独立审校 passed 回执、源 SHA 仍绑定当前源，且既不在当前 preview 的 selectedWeb 也不在 pendingWeb：

- nemata-jp-chapter-199-1 / chapter03-section013 / rev1 / 3d93eb86…（10:01:30 passed）
- nemata-jp-chapter-142-1 / chapter01-section054 / coac269rev1 / f3570e7b…（11:25:33 passed）
- nemata-jp-chapter-127-1 / chapter01-section047 / coac269rev1 / 363fd45c…（11:27:18 passed）
- nemata-jp-chapter-027-1 / chapter01-section010 / coac269rev1 / 44ce506d…（11:27:18 passed）

要求：
1. 按既有唯一写者流程把这 4 个 variant 加入 selection（新增 manifest 版本并同步 build 脚本里固定的 selection SHA），重建 preview，零模型调用。
2. 逐章读回：新 corpusId、章/单元/block/figure 数、这 4 章的正文块数、MCP 分页读回与 Arena 引用抽查。
3. 更新统一 register 的 covered/verdicts 与 produced-passed-not-staged 计数（目前 register 记 0，实际至少这 4 章，属于口径错误，需按真实 passed 回执纠正）。
4. 不切换正式教材库、不改 active hash、不动原四章历史证据；不删除任何既有候选或回执。
5. 报告实际入库章数增量、corpusId、读回结果、以及仍未覆盖的原章数（按 256 口径）。
