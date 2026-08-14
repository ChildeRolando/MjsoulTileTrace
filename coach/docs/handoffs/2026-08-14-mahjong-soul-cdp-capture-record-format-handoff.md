# 雀魂牌谱 CDP 捕获验证与真实 wire 格式交接

日期：2026-08-14

## 结论（一句话）

「骑官方客户端 Chromium 会话 + CDP 被动捕获牌谱」的路线**已验证可行**，真人牌谱实抓成功；但实抓暴露了一个更底层的问题——**coach 的牌谱解码层假设的 wire 结构与真实服务器不符**（真实数据有 `Wrapper` 包裹，且动作名是 `Record*` 而非 `Action*`），所以现有 `mapMahjongSoulRecord` 拿到真牌谱也解不出来。

## 已验证：CDP 捕获路线成立

新增的一次性诊断命令：

```powershell
npm run desktop:diagnose-mahjong-soul-capture-record -- --paipu-url "<paipu 链接>"
```

它开一个 Chromium 窗口骑官方牌谱查看器（登录后），用 CDP 抓官方客户端自己的 Lobby WebSocket，捕获 `fetchGameRecord` 的内联响应并解码 `GameDetailRecords`。

- 真人实抓成功：`{"status":"record_captured",...}`，原始字节写入
  `%TEMP%\mahjong-soul-captured-record.pb`（86KB）。
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
- `desktop/src/capture-record-diagnostic-runner.ts`（新）：`--diagnose-mahjong-soul-capture-record` 的编排 + 解码 + 字节落盘 + legacy 探针。
- `desktop/src/electron-entry.ts` / `package.json`：接入新诊断命令。
- 测试：`record-capture.test.ts`（新）、`liqi-codec.test.ts` 能力集断言更新。
- 附带保留：恢复/重放诊断的可复用加固（`--probe-rejection` 默认关闭、恢复阶段细分状态码、单请求拒绝码投影 `snapshotRestoreRejection`）。

注意：`capture-record-diagnostic-runner.ts` 里的 `legacyRecord` 探针（按 `RecordGame` 解码）是上一轮的**误判产物**，已在本文档订正；第 1+2 步会把它替换成正确的双层 Wrapper 解码。

## 下一步建议

先做 **1+2**（解两层 Wrapper，纯 decode，不动 mapper），用 `%TEMP%\mahjong-soul-captured-record.pb` 验证能解出 1616 个 `Record*` 动作并打印动作名分布；确认后再做 **3**（`Record*` → canonical mapper，工作量最大）。
