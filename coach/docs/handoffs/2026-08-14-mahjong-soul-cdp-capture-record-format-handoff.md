# 雀魂牌谱 CDP 捕获验证与真实 wire 格式交接

日期：2026-08-14

## 结论（一句话）

「骑官方客户端 Chromium 会话 + CDP 被动捕获牌谱」的路线**已验证可行**，真人牌谱实抓成功；但实抓暴露了一个更底层的问题——**coach 的牌谱解码层假设的 wire 结构与真实服务器不符**（真实数据有 `Wrapper` 包裹，且动作名是 `Record*` 而非 `Action*`），所以现有 `mapMahjongSoulRecord` 拿到真牌谱也解不出来。

## 已验证：CDP 捕获路线成立

新增的一次性诊断命令：

```powershell
npm run desktop:diagnose-mahjong-soul-capture-record -- --paipu-url=<paipu 链接> --self-actor=<0|1|2|3>
```

**注意 URL 必须用 `--paipu-url=<链接>` 连写形式**（8/15 发现）：Electron 43 在 Windows 上，当空格传值的
switch 带一个 `http(s)://` 值且**后面还有任何参数**时，会在应用代码执行前静默退出（exit 255、零输出，
`--enable-logging` 也无痕迹）。URL 在最后或值不含 `://` 则正常。这是 chromium 层 argv 再分词的问题，
已用 `packages/desktop/src/diagnostic-flags.ts`（`--name value` 与 `--name=value` 双形式解析 + 单测）
规避，`--paipu-url`/`--self-actor`/`--record-id` 全部支持连写。

它开一个 Chromium 窗口骑官方牌谱查看器（登录后），用 CDP 抓官方客户端自己的 Lobby WebSocket，捕获 `fetchGameRecord` 的内联响应并解码 `GameDetailRecords`。

- 真人实抓成功：`{"status":"record_captured",...}`，原始字节写入
  `%TEMP%\mahjong-soul-captured-record.pb`。（8/15 订正：当日 23:19 落盘的是**外层 Wrapper bytes**
  86166B，属旧格式；当前版本 capture 在落盘前已完成 unwrap，写的是 INNER bytes——真实契约见下文
  「TEMP 捕获文件的真实契约」。）
- 后台任务里跑不出来（Unity WebGL 在后台 Electron 窗口缺 GPU/渲染上下文，只加载资源不连网关）；必须用户**前台**跑，且需要登录态（用户自己的牌谱是非匿名片谱，看它要登录）。

## 关键发现：真实 wire 格式与 coach 假设不符

解码 `%TEMP%\mahjong-soul-captured-record.pb` 得到真实结构：

```
ResGameRecord.data
  └─ Wrapper { name: ".lq.GameDetailRecords", data: <86KB> }       # 第 1 层 Wrapper
        └─ GameDetailRecords { version: 210715, actions: 1616 }     # 现代格式，不是旧格式
              └─ 每个 GameAction.result
                    └─ Wrapper { name: ".lq.RecordNewRound", data } # 第 2 层 Wrapper，名字是 Record*
```

三点钉死：

1. `data` 不是裸 `GameDetailRecords`，外面包了一层 `lq.Wrapper`；
2. 牌谱本身是**现代格式**（version `210715`、1616 个 `GameAction`、978 个非空 `result`），**不是旧格式**；
3. 每个动作 `result` 也包了一层 `lq.Wrapper`，且 `name` 是 **`Record*`（存储格式，如 `.lq.RecordNewRound`）**，不是 coach 假设的 `Action*`（实时格式，如 `.lq.ActionNewRound`）。proto 里两套并存，字段布局也不同（`RecordNewRound` 用 `tiles0/1/2/3` 分座位，`ActionNewRound` 用 `tiles`）。

### 这解释了之前的假象

- 之前诊断里 `container:"records"`、`recordCount:1`、`byteLength:21` 是**误读**：没解 Wrapper，把 Wrapper 的 `name` 字符串（`.lq.GameDetailRecords`，正好 21 字节）当成了 legacy record blob。
- 8/13 的 `inline_record_verified` 很可能是**假阳性**：同样把 Wrapper 的 `name` 字符串当 legacy record 就通过了。
- coach 的 `fetchMahjongSoulRecord` / `mapMahjongSoulRecord` 都按「裸 `GameDetailRecords` + `ActionPrototype`/`Action*`」解码，这套假设来自**脱敏 fixture**，从未对真实字节验证过。

## 修复方案（审核后修订）：建立严格四层边界

任务定义从「解双 Wrapper + Action→Record 改名」提升为：

```text
fetchGameRecord / CDP response
        │
        ▼
strict unwrap .lq.GameDetailRecords        (第 1 层：transport / ingestion boundary)
        │
        ▼
raw GameDetailRecords bytes  ← recordBytes / sha256 的统一边界
        │
        ▼
GameAction[index].result
        │
        ▼
strict unwrap .lq.Record*                  (第 2 层：stored-action decoder)
        │
        ▼
decoded Record* + original ordinal
        │
        ▼
canonical mapper
```

关键约束（审核强制）：

1. **两层 Wrapper 不在同一位置，不要实现成"连续 decode 两次 Wrapper"。** 外层属于 record ingestion/transport boundary，内层属于 stored-action decoder。外层 decode 抽成一个**共享、严格**的 normalization function，CDP capture（`record-capture.ts`）和旧 fetcher（`record-fetcher.ts`）都走它。
2. **外层必须校验 `name`，不能"decode 成功就算成功"。** 要求 `wrapper.name === ".lq.GameDetailRecords"` 且 `wrapper.data.length > 0`，然后才把 `wrapper.data` 定义为系统里的 `recordBytes`。禁止"递归 peel 直到能 decode"——那会把协议漂移变成隐式兼容。
3. **mapper 不能只把字符串 `Action` 改成 `Record`。** 新 decoder：`GameAction.result → lq.Wrapper → name(".lq.RecordNewRound" 等) → Record*.decode(data)`。fully-qualified name 正规化一次（`.lq.RecordNewRound → RecordNewRound`）再 dispatch。**Record 与 Action 是两个协议模型，只能复用后面的 canonical business logic，不能复用 wire interpretation**（禁止 JSON structural cast、重新 encode 成 Action* 等）。
4. **空 `GameAction.result` 必须跳过，但不能压紧 ordinal。** 真人数据 1616 个 actions 里只有 978 个非空 result。中间表示直接带 `sourceRecordOrdinal = originalIndex + 1`，eventId / sourceRecordRef 必须保持与原牌谱的位置对应（不能用 `.filter()` 后重排 index）。
5. **`RecordNewRound` 用 `tiles0/1/2/3` 按 `selfActor` 选手牌**（不是 `tiles0` 就是 self）：`seatTiles = [tiles0,tiles1,tiles2,tiles3]; selfTiles = seatTiles[selfActor]`。dealer 第 14 张是否拆出 synthetic `tile_drawn`，用真人脱敏 fixture 钉死实际长度后再写，不沿用 ActionNewRound 旧语义。
6. **`RecordDealTile.tile` 按可见性处理**：`actor != selfActor` → canonical hidden draw（不要求 tile）；`actor == selfActor` → tile 必须存在且合法，否则 fail closed。presence-sensitive 的 Record decode 不用 `defaults:true`。
7. **`RecordNoTile` 从 `players` 数组位置推导 tenpai seat**（当前 mapper 固定 `tenpaiActors: []` 是错的）。`RecordLiuJu`、`RecordAnGangAddGang` 继续 fail closed，直到真人 fixture/协议证据钉死 enum 语义。
8. **测试从根换 fixture，不给旧 Action 测试补 Record 名称。** 至少覆盖：外层 `Wrapper<GameDetailRecords>`、内层 `Wrapper<Record*>`、空 `GameAction.result`、原始 ordinal 保留、`selfActor=1/2/3` 的 `tiles1/2/3`、非 self 且缺 tile 的 DealTile、错误 wrapper name fail closed、NoTile tenpai、以及一份由本次 86KB 真人数据结构化脱敏得到的 fixture。

统一边界的好处：HTTP fetch 与 CDP capture 最终交给 mapper 的 `recordBytes` 完全相同，`sha256` 与 mapper 的 `sourceRecordHash` 统一定义为 **inner `GameDetailRecords` bytes**，而不是一个 hash Wrapper、另一个 hash 内层 payload。

### 实施顺序

1. 共享 `unwrapGameDetailRecords`（外层 strict unwrap + name 校验），CDP capture 与 fetcher 都走它；`recordBytes`/sha256 收敛到 inner bytes；
2. stored-action decoder（`GameAction.result → strict unwrap .lq.Record* → {sourceRecordOrdinal, name, data}`），跳过空 result、保留 ordinal；
3. `Record*` → canonical mapper（按上述 5/6/7 的语义），复用 canonical business logic；
4. 用真实脱敏 fixture 全量 RED→GREEN。

## 附带发现：牌谱 CDN DNS

`record-old.maj-soul.com` 当前 CNAME 到阿里云抗 DDoS 域名（`*.aliyunddos0018.com`），境外/部分网络解析不到 A 记录。coach 的 `fetchMahjongSoulRecord` 在 `data_url` 分支依赖该端点，即使登录成功也可能因 DNS 不可达而下载失败。本次实抓走的是内联 `data`（未触发该端点），但 `data_url` 分支的风险仍在。

## 本工作树已交付的代码

- `mahjong-soul-source/src/liqi-codec.ts`：新增 `MAHJONG_SOUL_OBSERVED_RECORD_METHODS`，让 codec 能观察 `fetchGameRecord` 及三个列表 RPC 的帧。
- `mahjong-soul-source/src/record-capture.ts`（新）：`createMahjongSoulRecordCapture`，被动捕获 `fetchGameRecord` 响应、取出内联 `data` 字节。
- `desktop/src/cdp-record-observer.ts`（新）：与登录观察器同构的 CDP 帧观察器，改用牌谱捕获。
- `desktop/src/capture-record-diagnostic-runner.ts`（新）：`--diagnose-mahjong-soul-capture-record` 的编排 + 捕获 + 字节落盘。（8/15 注：其中的 legacy `RecordGame` 探针与 records/actions 容器猜测已整体删除，诊断现在直接走 canonical replay 链，见文末 8/15 进度。）
- `desktop/src/electron-entry.ts` / `package.json`：接入新诊断命令。
- 测试：`record-capture.test.ts`（新）、`liqi-codec.test.ts` 能力集断言更新。
- 附带保留：恢复/重放诊断的可复用加固（`--probe-rejection` 默认关闭、恢复阶段细分状态码、单请求拒绝码投影 `snapshotRestoreRejection`）。

注意：`capture-record-diagnostic-runner.ts` 里的 `legacyRecord` 探针（按 `RecordGame` 解码）是上一轮的**误判产物**，已在 8/15 全部删除并替换为 canonical replay 链（见文末）。

## TEMP 捕获文件的真实契约（8/15 订正）

`--diagnose-mahjong-soul-capture-record` 写入 `%TEMP%\mahjong-soul-captured-record.pb` 的是
**INNER `GameDetailRecords` bytes**——`record-capture.ts` 在捕获时已经完成了外层 Wrapper 的
strict unwrap，`result.recordBytes` 就是内层字节。因此：

```text
CDP frame -> createMahjongSoulRecordCapture（外层 unwrap 已在此完成）
           -> result.recordBytes（INNER GameDetailRecords bytes）   ← 统一 recordBytes/sha256 边界
           -> decodeStoredRecordActions（仅 diagnostic 计数）
           -> mapMahjongSoulRecord（内部自行 decode，不重复造 API）
           -> replayCanonicalStream -> build/serializeMahjongSoulReplayAudit
```

下游**绝对不要再次 unwrap**。`scripts/generate-mahjong-soul-real-fixtures.mjs` 的默认输入
即为 INNER bytes（`--input-format inner`）；只有读取 8/14 23:19 之前产生的旧捕获文件
（外层 Wrapper bytes，86166B）才需要显式 `--input-format outer`，没有“先试 Wrapper 再试
GDR”的启发式。回归测试 `scripts/generate-mahjong-soul-real-fixtures.test.mjs`（已接入
`npm test`）用仓库 fixture 证明「当前捕获输出 → generator → fixture → unwrap」可复现，
不依赖任何历史遗留 TEMP 文件。

## 实施进度（8/14 晚）：四层边界全部落地 + 真人脱敏 fixture 全绿

第 1–4 步已全部完成并通过验收：

- `72926ed`（handoff 四层边界修订）、`5b70eec`（`unwrapGameDetailRecords` 外层严格 unwrap，fetcher/capture 收敛到 inner bytes）、`aef21e4`（`decodeStoredRecordActions` 内层 decoder，空 result 跳过但不压紧 ordinal）、`b087d52`（`Record*` → canonical mapper）+ 后续 real-data 修正提交。
- mapper 由真人数据驱动的三处修正：`RecordNewRound` 用 `doras`（repeated）取宝牌指示（`dora` 字段在真实 wire 上不存在）；`RecordChiPengGang` 的呼叫牌在**唯一非 actor 的 froms 下标**（真实数据 `froms=[actor,actor,target]`，不是 index 0）；`scoreQuads` 遇非 4 整数数组直接 fail closed（不再伪造 `[0,0,0,0]` 与 `scores:"complete"` 冲突）。
- `remainingDraws` 决策：canonical 状态机按 `tile_drawn` 事件递减计数（含 mapper 合成的 dealer 第 14 张 draw），而存储的 `left_tile_count` 是发牌完成后的剩余张数，两者差恰好 1 张；不猜测偏移，保持审核过的 `remainingDraws:"unknown"` 声明、`round_started.remainingDraws` 发 `null`（否则 round-state validator 会因「completeness 与取值不一致」拒绝）。后续若有 kan fixture 再评估升 `"complete"`。

### 真人脱敏 fixture（审核定的验收门）

生成脚本 `scripts/generate-mahjong-soul-real-fixtures.mjs`：读取 `%TEMP%\mahjong-soul-captured-record.pb`（不在仓库），保留 wire 结构（外层 Wrapper、GameAction.result Wrapper、空 result 及其位置、ordinal）和 mapper 实际消费的字段（seat/tile/froms/scores/hules/doras/tiles0-3/left_tile_count 等），删除所有原局指纹字段（`md5`/`paishan`/`sha256`/`salt`/`opens`/`operations`/`zhenting`/`tile_states`/`muyu`/hule 完整手牌等），重编码输出：

- `mahjong-soul-source/tests/fixtures/real-record-wire.json`：全量 1616 动作（638 空 + 978 `Record*`），37KB。
- `mahjong-soul-source/tests/fixtures/real-supported-round.json`：第 0 局（源下标 9..122，114 条），不含任何不支持动作。

验收（`real-record-fixtures.test.ts` + desktop 的 `real-record-replay.test.ts`，全绿）：

- **fixture A（不是 GREEN-to-ready）**：unwrap ✅ → decode 978 条、首个 ordinal=10、ordinal 有空洞且单调 ✅ → 分布 `{NewRound:9, DealTile:466, DiscardTile:481, ChiPengGang:11, AnGangAddGang:2, Hule:9}` ✅ → `mapMahjongSoulRecord` 返回 `{status:"invalid", code:"mahjong_soul_canonical_unsupported_semantics"}` ✅（两个 AnGangAddGang 在源下标 560/1138，即第 3、6 局；mapper 在 fail closed 前完整映射了第 0–2 局真实数据）。
- **fixture B（full chain）**：unwrap → decode → map → `ready` → `replayCanonicalStream`（decision 数 > 0）→ `buildMahjongSoulReplayAudit` → `serializeMahjongSoulReplayAudit` 全部通过 ✅。

## 下一步建议

1. ~~把 CDP 捕获诊断的出口接上生产链~~（8/15 已完成，见文末）。
2. ~~用一份含 `RecordAnGangAddGang` 的真人牌谱钉死 ankan/kakan 判别~~（8/15 已完成：type 3=暗杠、type 2=加杠，fixture 证据钉死并实现；`RecordLiuJu.type` enum 仍无真人样本，继续 fail closed）。
3. `remainingDraws` 升 `"complete"` 需要 kan fixture 证明 `left_tile_count` 在杠后的增减语义。
4. `replayCanonicalStream` 在全量真人牌谱（1022 canonical events）上实测约 **1 秒/decision**（121 个 decision ≈ 2 分钟），疑似随事件数超线性；自动化测试因此只在单局 fixture 上跑 decision/audit，全量局只做 map + state-machine 验证。若要支持全量牌谱分析需要先做 replay 性能剖析。
5. 杠宝牌指示牌：真实 wire 在杠后的 `RecordDealTile.doras` / `RecordAnGangAddGang.doras` 上携带新指示牌，但脱敏 generator 目前丢弃这些字段、mapper 也不发 `dora_revealed`；`doraIndicators` 维持 `"partial"`。若要补全，先扩 sanitizer 再钉 event。

## 实施进度（8/15）：P0–P3 全部落地

- **P0-1（generator 输入契约）**：`5de01f8`。generator 默认接受 INNER bytes，`--input-format outer` 只用于 8/14 23:19 前的旧捕获；脱敏后仍重编码进外层 Wrapper，仓库 fixture 继续测 outer unwrap 边界。`toInnerBytes`/`deriveSanitizedFixtures` 导出为可测函数，round-trip 回归测试进 `npm test`。
- **P0-2（真脱敏）**：同 commit。真实 recordId `260810-…` 从 generator、两个 fixture JSON、全部测试中移除，换成固定 synthetic id `000000-00000000-0000-0000-0000-000000000001`（schema-shaped，全零；wire bytes 不变）。electron-entry 的真人 paipu URL fallback 删除，`--paipu-url` 缺失即固定错误 fail fast。注意：真实 id 已存在于旧 commit 历史中；本轮只是停止传播，**没有**做 history rewrite。
- **P1（真人结构 hardening）**：`67ec10b`。fixture A 的全部 11 个 `RecordChiPengGang` 有独立 decoder-level 断言：tiles/froms 等长、唯一非 actor 下标、被叫牌即该下标、且能回溯到 target 的最近未消费同牌 discard。真实分布：7 碰 4 吃、无大明杠样本。
- **P2（diagnostic 接生产链）**：`0befb6f`。legacy 探针/容器猜测全删；`runRecordCaptureDiagnostic` 要求显式 identity（`--paipu-url` REQUIRED、`--self-actor 0|1|2|3` REQUIRED、recordId 由 `parseMahjongSoulCnShareUrl` 从 URL 严格解析，gameId=`majsoul:${recordId}`，selfActor 无默认值）。新 `CaptureRecordResult` 报告 status/storedActionCount/mappingStatus+mappingCode/canonicalEventCount/replayDecisionCount/auditPath/recordBytesPath/fixed errorCode，record bytes 永不进 JSON/log。生产 catalog 路线仍用 summary.selfSeat，未动。
- **P3（AnGangAddGang 调查 → 实现）**：`26438f0`。两个真实样本各自钉死一个 enum 值：ordinal 561（type=3，seat 2，3s）可证明手握全部 4 张暗牌、本局无副露 ⇒ **暗杠**；ordinal 1139（type=2，seat 3，7z）可证明是对 ordinal 1053 同牌碰的加牌 ⇒ **加杠**。原始 protobuf 字节手工逐字段解码确认 wire 值，方向与第三方实现一致。fixture-backed 证据测试先行，mapper 随后实现 type 3→`ankan_declared`、type 2→`kakan_declared`（加杠必须找到同局同牌碰、暗杠不得与同局碰共存）；杠后该 actor 的下一次 `RecordDealTile` 标记为 `rinshan`（canonical 状态机硬性要求）。**enum 之外的取值、以及含赤宝牌的五牌暗杠（单字符串无法定位红五位置）继续 fail closed**；`RecordLiuJu` 无样本继续 fail closed。
- **P3 附带修复（打通全量局必然暴露的两个 mapper 缺口）**：吃/碰/大明杠的 consumed tiles 按 canonical 顺序排序（wire 顺序不保证）；每局收尾合成 `round_ended`（绑定 terminal 事件的 source position 下一 sub-event）；riichi 弃牌后合成 `riichi_accepted`（存储 wire 无 reach_accepted 等价物）。结果：**fixture A 全量 1616 actions → 978 decode → 1022 canonical events，map `ready` 且 state-machine 验证通过**；desktop 测试以真实 CDP 帧脚本驱动 capture→map→replay→audit 全链（单局），并用 synthetic 未证实 type=9 记录维持 `record_not_replayable/unsupported_semantics` 的端到端断言（无伪 complete replay）。
- **真人 diagnostic 验收语义更新**：对含已证实杠型的 live full game，diagnostic 现在预期走通到 audit（exit 0）；对含未证实语义（RecordLiuJu、未知 AnGangAddGang type、五牌暗杠）的记录仍报 `unsupported_semantics` 且不产生 audit。8/14 那份 1616-action 牌谱现属前者——下一步真人前台跑 H1 验收时，用 `--paipu-url=<自己的牌谱> --self-actor=<自己的座位>` 验证 live CDP 全链。
- **live 全链已实跑通过（8/15 02:42）**：用 8/14 同一份真人牌谱（selfActor=3、连写形式参数）跑通 CDP 捕获 → 978 stored actions → 1022 canonical events（与脱敏 fixture 完全一致，交叉验证了 sanitizer）→ 116 个 self=3 决策 → audit 写入 userData（447KB），exit 0。TEMP 捕获文件现为 INNER bytes（86139B），直接可喂 generator（`--input-format inner` 默认）。

## 实施进度（8/15 收尾轮）：H1 acceptance 四项修复

- **CDP 时序（`accf970`）**：runner 顺序改为 attach → Network.enable → message listener → loadURL → 等待。observer 在 navigation 前就绪，不再依赖"页面已加载后的 websocket"。fake debugger 现在真实模拟"事件只送达已注册的 listener"，loadURL 期间触发 webSocket 帧：旧顺序测试 RED（帧丢失）、新顺序 GREEN。
- **EOF 收尾不变量（`4ac27dc`）**：mapper 在 action 迭代结束后 flush 最终 `round_ended`（全量局 round_started=9 / round_ended=9），终局为和牌时用逐局跟踪的分数（NewRound scores + 每个hule 的 delta_scores 按 action 应用一次）生成 `game_ended`；流局终局无脱敏支付数据，不伪造分数、不发 `game_ended`。`validateCanonicalEventStream` 默认在 EOF 强制合法结束态（between_rounds/game_ended，非法则 `stream_ended_mid_round`）；reducer/decision-freeze 前缀管线与 legacy regression bridge 显式 `allowUnclosedStream` 豁免。全量真人局现为 1024 canonical events、validator `valid`。
- **AnGangAddGang 协议化（`e8298cb`）**：enum 事实（561: type=3；1139: type=2）与映射结果（ankan_declared/kakan_declared + sourceRecordRef 溯源 + kakan 绑定同局碰）直接以协议级断言钉死；删除了"手牌守恒推理"式证明与 mapper 里的暗杠-碰互斥状态推理（type→event 无条件映射；kakan 的 pon 查找保留，因为 upgradedPonEventRef 是 canonical 必填字段）。validator 保持协议无感。
- **验收数字（8/15 收尾轮实测）**：full game decode 1616/638/978 → canonical 1024（9/9/1）→ validator `valid`；supported round map `ready` → 8 个决策 → audit 序列化 28069B。CDP 诊断已验证可从真实 paipu URL 捕获完整 record（见上）。剩余 unsupported semantics：`RecordLiuJu`（全部 type）、`RecordAnGangAddGang` type ∉ {2,3}、五牌暗杠（红五位置不在 wire 上）。
