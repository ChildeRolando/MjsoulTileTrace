# 雀魂牌谱 canonical mapper 交接

日期：2026-08-14

分支：`codex/m5e-oauth2-restore-diagnostic`（工作树 `E:\文档\日麻教学-m5c-integration`）

## 本轮完成

在 codex 的取回层（`record-fetcher` / `record-ingestion-service`）之上，实现了**雀魂 `GameDetailRecords` → `CanonicalEventStreamV2` 的 canonical mapper**（计划 Task 4）。

- `mahjong-soul-source/src/majsoul-tile.ts`：雀魂牌字符串 → canonical `Tile`（红五 `0m/0p/0s` → `{5m,red}`），以及 `chang` 场风解析。
- `mahjong-soul-source/src/canonical-mapper.ts`：`mapMahjongSoulRecord`，把 `GameDetailRecords.actions` 的 `ActionPrototype` 逐条解码并映射为 canonical 事件，最后经 `CanonicalEventStreamSchema` 校验。已映射动作：
  - `ActionNewRound` → `round_started`（含庄家首摸 `tile_drawn`）；
  - `ActionDealTile` → `tile_drawn`（非本人 `hidden`，本人 `visible`）；
  - `ActionDiscardTile`/`ActionRevealTile` → `tile_discarded`（`is_liqi` 时先发 `riichi_declared`）；
  - `ActionChiPengGang` → `chi_called`/`pon_called`/`daiminkan_called`（type 0/1/2）；
  - `ActionAnGangAddGang` → `ankan_declared`/`kakan_declared`（type 0或2 / 1）；
  - `ActionHule` → `win_declared`（自摸 target=null，荣和回溯放铳者）；
  - `ActionLiuJu`/`ActionNoTile` → `round_drawn`。
  - 未知动作名、非法牌、缺目标/缺被鸣弃牌、空记录均 fail closed（`mahjong_soul_canonical_mapping_failed` / `..._validation_failed`）。
- 事件 ID 采用 `gameId/roundOrdinal/sourceRecordOrdinal/subEventOrdinal`，`sourceRecordOrdinal` = 动作下标 + 1（0 给合成的 `game_started`）；多子事件的动作 subEventOrdinal 连续。
- `desktop/src/electron-entry.ts`：`fetchRecord` 在取回后立即 map + 校验，失败抛 `mahjong_soul_canonical_validation_failed`；canonical stream 暂存于主进程 `mappedRecords`（供下一步 reasoning 管线消费）。

## 已锁定的关键事实

- 存储牌谱（`GameDetailRecords`）里的 `ActionPrototype.data` 是**明文 protobuf**，不是实时 WebSocket 的 XOR 混淆（akagi `parser.rs` 明确区分 live XOR / restore 无 XOR）。
- `ActionChiPengGang.type`：0=chi、1=pon、2=daiminkan；`ActionAnGangAddGang.type`：0或2=ankan、1=kakan（**基于协议推断，未用真实牌谱反证**）。
- `ActionNewRound`：`chang`=场风(0东1南2西)、`ju`=局数(庄家座位)、`ben`=本场、`tiles`=本人手牌(庄家14张)、`dora`=宝牌指示、`liqibang`=立直棒、`left_tile_count`=剩余牌数。

## 待核实项（未用真实牌谱验证）

- 荣和 `targetActor` 的回溯逻辑（`tile_discarded` 反查），以及 `ActionHule.delta_scores` 的符号语义。
- `ActionLiuJu.type` 到 `round_drawn.reason` 的精确映射（当前一律 `kyuushu_kyuuhai`，是占位）。
- `ActionAnGangAddGang.type` 的 0/2 语义。

## 下一步

1. 把 canonical stream 接入现有 structured analysis assembly（冻结 decision snapshot → 投影 `KnownGameFacts` → 结构化 factor pipeline），复用我之前在 `coach-report.ts` 的 `analyzePrototypeGame` 流程、但把 legacy bridge 换成 `mapMahjongSoulRecord`。
2. 生成真实分析结果后，才把按钮成功态从 `record_fetched` 升级为分析完成/报告页。
3. 用一份脱敏真实牌谱做 golden 反证上面三个"待核实项"。

## 追加：canonical 重放已接通

在 mapper 之上又完成了"重放"层，证明映射后的牌谱可离线重放到可审计事实层（M5 的"冻结/重放/审计"判据）：

- `reasoning/src/replay/stream-replayer.ts`：`replayCanonicalStream(stream)`，对每个可见的本人摸牌事件冻结 `DecisionSnapshotV2` 并投影 `KnownGameFacts`，同时捕获该巡的实际舍牌（`actualDiscard`）。
- `desktop/src/electron-entry.ts`：取回后 map → replay，结果暂存主进程 `replayedRecords`；`@riichi-coach/reasoning` 已加入 desktop 依赖。

**关键结论（避免后来者重踩）**：模型无关的"单候选比较"不可行——`StructuredComparisonSetSchema` 要求 `candidates.min(2)`，且 `automatic_review` 要求每候选含 `model` origin。因此结构化比较（候选间差异）**必须等 M6 模型候选**。M5 交付物是重放（决策快照 + 实际动作），不是比较。

## 下一步

1. M6 模型候选（Mortal/Akagi 生产接入）——解析适配器已在 M1/Slice 1 就绪，但生产下载/运行时需外部资源（Mortal Turnstile、Akagi 权重）。
2. 拿到模型候选后，把 `replayedRecords` 的每个决策与模型候选拼成 `StructuredComparisonSet`，接入 `runStructuredAnalysisAssembly`。
3. M5 H1 真人验收：用户登录→选真实牌谱→对照雀魂回放核对重放。

## 验收

- 全量 vitest：102 文件 / 1045 测试通过（本轮 mapper + 重放共新增测试）；
- typecheck、package-import、audit（0 漏洞）、Go、根目录测试均通过。

## 工作区保护

`E:\文档\日麻教学`（原工作树）的用户改动从未被读取、修改或提交。本工作树 `E:\文档\日麻教学-m5c-integration` 独立。

## 修正（2026-08-14 晚，分支 `codex/m5-h1-replay-acceptance`）

上文"本轮完成"中两处映射声明过强，已在本分支收口为 fail closed：

- `ActionAnGangAddGang` 的 `type` 0/2=ankan、1=kakan 是**未经证明的猜测**（且 `tiles` 字段是单串 `string` 而非 `repeated string`，原实现根本解析不对）。现已整条返回 `mahjong_soul_canonical_unsupported_semantics`。
- `ActionLiuJu` 一律 `kyuushu_kyuuhai` 是**占位错误**。现已整条返回 `mahjong_soul_canonical_unsupported_semantics`。

`ActionHule` 也已加强（布尔 `zimo`、0..3 winner、四条整数 `delta_scores`）。真实牌谱命中这些枚举时，先补脱敏 fixture 再放宽；详见 `2026-08-14-mahjong-soul-replay-acceptance-handoff.md`。
