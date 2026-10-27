本阶段新增模型0、制作0、独审0、候选0；没有重派215scope/193补文、222或234。

修复的是两个指定文字目标的制作入口，不是主控runtime、图片runtime或通用框架。旧15依赖快照/源/父/旧审/raw保持。新快照 `coac244-text-exact-183236-v2-20261028`，实际入口 `textbook-production-web.mjs` 引入 `exact-text-contract.mjs`，完整依赖与两个目标绑定见 `exact-runtime-manifest.json` / `exact-text-contracts.json`。

真实原因见 `request-output-investigation.json`：旧主指令为 Translate this complete Japanese textbook article；旧审建议确已提到校注，quoted context也有父译文，并非根本没给上下文。问题是批准的逐字白名单/明确非原文校注未成为强制请求或schema，普通 isolated translation repair仍允许模型重译整段。外部executor正确拒绝了越界稿，但生产者已先保存候选。本修复把验证移到真实raw/ledger保存之后、正文赋值及候选写盘之前；恢复旧候选路径也拒绝无校注稿。

183的唯一正文是原父b0018逐字符不改，加两个换行及显式 `【校注（非原文）：…】`，同时记录两组4%=4%、役牌2%/客风3%及“见1张”口径未定。236的唯一正文只删除指定短语的“剩余”两个字，其余父段不改，加明确时机未定的非原文校注。完整实际允许目标text在两个contract条目；不把uncertain改error，也不在制作端宣布解决语义歧义。

测试不是仅测helper：运行真正producer的 `--request-only true`，返回与 `invokeTextbookCodex(modelRequest)` 完全相同的modelRequest及真实CLI `textbookClosedPrompt`包装。两个 `*-actual-request-boundary.json` 保存完整拟发stdin/schema。JSON schema的translations恰1项、精确ID和完整目标text enum，figures为空。用真正producer `--validate-existing-raw`回放两份原失败raw，均拒绝且没有进入invoke；完整exitCode/stderr在调查回执。27个逐项结果包含漏校注、改作者段、改标点、改校注标记、增段/增图的拒绝，原raw/source/父/旧审及ledger未变；synthetic正例仅在内存，不保存为候选，不冒充模型产出。

合法派生评估：两份原raw均无校注。236虽然含可抽取的中性短语，拼parent+唯一目标+人为追加校注仍与实际完整raw翻译不同。两份内存组合均被既有 `verifyWebProductionCall` 以 `web_production_translation_not_from_bound_output` 拒绝。唯一既有normalization是inline155的特定call/格式例外，不能套用到这两段。没有改raw/伪造模型输出或另开宽泛派生入口。

预算下一步：旧制作已用2；原余2仍只供逐章首审。按现有证据契约，需额外明确增加2制作（各1、失败void计、0retry）。未来本地最多4（新制作2+原首审2），本批终身最多6；未自动调用，费用未知。逐完整canonical的source/parent/parentAudit SHA、精确request-only与制作命令在stage-summary.json。继续时使用新variant，保留原失败稿。

PDF217：旧 `coac249-p217-single-tile-read-20261027.json` 明确第二行第二张。244上一包[150,325,175,357]是第一张；249调用09362d05按此坐标给unknown，明确排除了右邻。正确对应及旧候选SHA/旧审原文在 `p217-location-corrigendum.json`。第二张新包bbox [174,325,196,357]，真实430×463原PNG、邻行上下文、精确切片和最近邻4倍均附；没有识图结论。下一单点审若授权另需最多1call/0retry，不在已用完的两次point预算内；不等于全页通过。packet历史候选码/旧审答案仅供控制器追溯，不给新模型；下一调用只发送proposedNextMinimumRequest里的中性指令和指定图片。rev5仍隔离，215 b1/b3及193补文在途保持。
