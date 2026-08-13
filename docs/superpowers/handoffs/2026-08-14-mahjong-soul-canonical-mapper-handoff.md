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

## 验收

- 全量 vitest：101 文件 / 1043 测试通过（本交接前 codex 为 99/1022，本轮 +2 文件 +21 测试）；
- typecheck、package-import、audit（0 漏洞）、Go、根目录测试均通过。

## 工作区保护

`E:\文档\日麻教学`（原工作树）的用户改动从未被读取、修改或提交。本工作树 `E:\文档\日麻教学-m5c-integration` 独立。
