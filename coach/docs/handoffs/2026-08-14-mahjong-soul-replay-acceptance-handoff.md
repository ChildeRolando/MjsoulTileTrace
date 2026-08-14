# 雀魂重放 H1 验收交接

日期：2026-08-14

分支：`codex/m5-h1-replay-acceptance`（基线 `master`）

## 本轮完成

在请求真人验收前，先收口了 M5 所有可自动完成的项，并把"猜测语义"改成 fail closed：

### 1. mapper fail-closed 加固（Task 1）

- `ActionLiuJu`：不再把所有 `type` 冒充成 `kyuushu_kyuuhai`。协议未文档化各 `type` 语义且无脱敏 fixture，整条动作固定返回 `mahjong_soul_canonical_unsupported_semantics`。
- `ActionAnGangAddGang`：`type` 的暗杠/加杠判别同样未证明（且 `tiles` 字段是单串而非可重复列表），不再把 0/2 猜成暗杠，整条动作 fail closed。
- `ActionHule`：荣/自摸绑定时强制校验布尔 `zimo`、0..3 的 winner 座位、四条整数 `delta_scores`；无法唯一绑定即 `mahjong_soul_canonical_mapping_failed`。
- `MahjongSoulSourceError` 现在暴露 `code`，mapper 的 catch 边界能区分"未证明语义"与"数据损坏"。

### 2. 修正实际舍牌绑定（Task 2）

`replayCanonicalStream` 不再用 `slice(index+1).find(本人舍牌)` 跨巡/跨局绑定。新增 `immediateSelfDiscard`：只在当前摸牌开启的决策窗口内找本人舍牌，允许中间夹一个本人立直声明，遇到下一次本人摸牌、和牌、流局或新局即停；暗杠/自摸终局无合法舍牌返回 `null`。

### 3. 脱敏 replay audit（Task 3）

新增 `mahjong-soul-replay-audit/v1`（`reasoning/src/replay/replay-audit.ts`），只含人类核对所需的 canonical 数据：牌谱 UUID、self seat、场风/局数/庄家/本场、每个事件的稳定 ID/类型/actor/牌/target/流局·和牌类型、每个本人决策的 trigger/手牌快照/实际舍牌、stream hash / prefix hash、mapper/协议/应用版本。

- 禁止 token、Cookie、恢复上下文、account ID、Lobby endpoint、原始 protobuf/帧/下载 URL、nickname、上游错误文案——schema 用 `.strict()` 钉死顶层键名。
- 写入前 `MahjongSoulReplayAuditSchema.parse` 严格校验，序列化为确定性（换行结尾的）JSON。
- 文件只写 Electron `userData/mahjong-soul-replay-audit/<recordId>.json`，不进仓库、不经 renderer IPC 回传完整内容。

### 4. 一次性 H1 命令（Task 4）

```powershell
cd coach
npm run desktop:diagnose-mahjong-soul-replay
# 或指定牌谱
npm run desktop:diagnose-mahjong-soul-replay -- --record-id 260811-00000000-0000-0000-0000-000000000001
```

行为：读已加密保存的会话（不强制重新登录）→ 恢复并核对账号 → 同步最近目录 → 选最近可分析牌谱（或严格 `--record-id`）→ fetch → decode → map → replay → audit → 写本地审计文件。stdout 只打印固定状态 + 审计文件路径；缺会话固定返回 `login_required`（不弹登录窗）；未证明事件返回 `unsupported_record_semantics`（不跳事件生成"部分成功"）；所有路径关闭 Lobby。退出码固定，测试仅用假账号/假令牌/脱敏 fixture。

## 门禁

- vitest 104 文件 / 1061 测试通过；typecheck、`test:package-import`、`npm audit`（0 漏洞）全绿。

## 仍需真人验收（M5-H1）

用户只需执行一次 H1 命令，然后打开对应雀魂回放，逐项对照审计文件：

1. self seat（审计 `selfSeat`）；
2. 局数/庄家/本场（`rounds[]` 的 `roundOrdinal`/`dealer`/`honba`）；
3. 初始手牌（`rounds[].selfHand`，13 张）；
4. 摸切/手切（`decisions[].actualDiscard.discardMode`）；
5. 鸣牌/立直/和牌/流局（`events[]` 的对应类型与 `targetActor`/`method`/`reason`）。

报告第一处不一致，或确认完全一致。

## 未覆盖枚举继续保持 fail closed

- `ActionLiuJu` 全部流局类型、`ActionAnGangAddGang` 全部杠类型：直到拿到真实脱敏 fixture 反证 `type` 语义为止，继续返回 `unsupported_record_semantics`。
- `ActionChiPengGang.type=2`（daiminkan）虽经结构校验（4 张牌 + froms），但尚未用真实牌谱反证；`ActionNoTile` → `exhaustive` 是明确的荒牌流局。

## 下一步（验收通过后才进 M6）

1. M5-H1 真人验收（上文）。
2. 若真实牌谱命中未覆盖枚举，先补脱敏 fixture + RED/GREEN，再放宽该枚举的 fail closed。
3. 之后进入 M6：优先只接一个模型来源做最小闭环（Mortal 或 Akagi 二选一），不要同时接两个。
