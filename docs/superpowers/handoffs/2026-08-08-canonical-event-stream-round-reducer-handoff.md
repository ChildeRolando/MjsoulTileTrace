# Canonical 事件流与轮局归约交接

更新时间：2026-08-08

当前阶段：M2-A/M5 共用事件事实地基已实现并进入终审加固；canonical event ID 重绑定仍待关闭

## 1. 本批次交付

本批次建立了新牌谱来源、麻将事实计算和 LLM 教练共同依赖的唯一牌局事实边界：

- `canonical-riichi-events/v2` 严格事件流；
- `PublicRoundState` 与 `SelfPrivateRoundState` 公私分离；
- 按事件前缀不可变归约，含 stream/prefix SHA-256；
- `decision-snapshot/v2` 四类决策窗口冻结；
- fixture-only legacy 事件桥；
- V2 snapshot → `KnownGameFacts` 五轴投影；
- 东一局 6/7 巡真实 sidecar golden 回归迁移到 V2 快照。

事件覆盖：开局/开场、摸牌、弃牌、立直声明/接受、吃、碰、大明杠、暗杠、加杠、宝牌翻开、自摸/荣和、流局、点数更新、局终与牌谱终。暗杠和加杠均先进入 `kan_response`，宝牌翻开或岭上摸牌后再结束抢杠窗口。

## 2. 可信边界

- canonical stream 是新重放工作的权威输入；source adapter 只允许映射记录，不允许生成教练理由或麻将偏好。
- 对手暗摸以 `{ visibility: "hidden" }` 表示；snapshot 没有任何对手暗手字段。
- public state 只含牌桌可见事实；self private state 只含我方暗手、当前摸牌、我方副露引用和待补全振听。
- 决策窗口必须同时匹配 self actor、触发事件、事件类型、来源玩家、牌张和归约阶段，否则统一 `decision_window_state_mismatch`。
- `complete / partial / unknown` 不互相折叠；投影到旧布尔 completeness 时仅 `complete` 变为 `true`。
- fixture bridge 明确要求 `sourceKind: "fixture"`，生产 `mjai`/雀魂来源一律拒绝；非法顺序在 import 阶段返回 typed code。
- 模型评分不进入事件流、snapshot 或 `KnownGameFacts`；增删模型评分不能改变牌局事实。

## 3. 主要提交

- `99d14ee`：canonical round replay 实施计划；
- `2320316`：canonical 日麻事件流契约；
- `49a7b33`：公开/私有轮局状态契约；
- `97e07ec`：canonical 事件序列校验；
- `427405d`：摸切事件归约；
- `eee534b`：吃碰杠归约；
- `9206cef`：立直、一发、宝牌与终局流；
- `c9c1453`：决策快照冻结与暗杠抢杠窗口；
- `e33c408`：fixture bridge 与 V2 五轴事实投影。
- `2c2e04b`：canonical 重放不变量与东一局 V2 门禁；
- `f6148c3`：快照重算、来源保真、赤牌守恒、立直状态机、杠/和牌/结算绑定、稳定错误码和防守完整性加固。
- `822fb55`：补齐流局结算、明杠宝牌完整性与结算后多家荣和顺序边界。

设计规格：`docs/superpowers/specs/2026-08-08-canonical-game-state-hand-defense-design.md`。

实施计划：`docs/superpowers/plans/2026-08-08-canonical-event-stream-round-reducer.md`。

## 4. 东一局不可退化门禁

牌谱 fixture：`coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`。

- 6巡 V2 snapshot 当前摸牌为 6索，actor 2 已立直且一发存续；
- 7巡 V2 snapshot 当前摸牌为 8筒，actor 2 一发已因下一次普通弃牌/鸣牌流转结束；
- 6巡效率轴支持实战切 2筒，防守轴支持摸切现物 6索；
- 7巡效率轴支持实战切 7筒，防守轴支持摸切现物 8筒；
- applied scope 保持 `deterministicPreference: null`，不擅自给攻守冲突加权；
- sidecar golden 的状态 hash 和麻将计算内容未改，只将请求 envelope 重绑定到 canonical fact-set ID；
- `modelReason` 仍固定为 `unknown`。

## 5. 当前验收证据

- `npm test`：51 个测试文件，346/346 通过（`f6148c3` 后最终回归）；
- `npm run typecheck`：通过；
- `npm run test:package-import`：1/1 通过；
- `npm audit --omit=dev`：0 vulnerabilities；
- 根目录 `node --test tests/*.mjs`：19/19 通过。

完整切片复审已执行，初审为 Critical 0、Important 11、Minor 1。`f6148c3` 已关闭其中快照伪造、杠宝牌/和牌来源、来源升级、赤五、立直/开手状态、鸣牌后摸切、结算引用、schema 错误泄露、response-opportunity 防守门控及 fixture bridge 公共导出问题。复核仍在进行。

尚未关闭的 Important：事件 ID 目前只保证流内唯一，仍未强制绑定 `gameId / roundOrdinal / sourceRecordOrdinal / subEventOrdinal`；legacy bridge 也尚未返回旧引用到 canonical 引用的显式映射。这是下一次实现的第一项，未关闭前本基础不得标为终审完成。

## 6. 明确未实现

- 雀魂分享 URL 匿名下载与生产 record mapper；
- 生产 MJAI mapper；当前 legacy bridge 不是生产 mapper；
- 旧 normalized fixture 的和牌/流局/跨局 terminal 映射；
- 普通形/七对子/国士的统一牌形分解与逐候选结构账本；
- 舍牌振听、同巡振听、立直振听及 response-opportunity 归约；
- 合法动作枚举、国士抢暗杠的实际资格判定；
- 精确剩余摸牌（legacy fixture 没有壁牌信息）；
- canonical event ID 的跨牌谱/跨局身份约束与 legacy ref map；
- 对手等待、染手、对对/役牌、宝牌周边和手切序列等牌河阅读；
- calibrated deal-in probability、顺位 EV 和未来选择权。

上述缺口必须继续显示为 unsupported / partial / unknown，不允许由 LLM 补写。

## 7. 下一批次入口

下一份规格/计划应消费现有 `DecisionSnapshotV2`，不再另建局面表示：

1. M2-A：hand structure + furiten
   - 普通形、七对子、国士向听；
   - 完成面子、雀头、搭子、浮牌、区块、等待；
   - discard / temporary / riichi furiten 的事件证据；
   - self-turn、discard-response、post-call-discard 的可计算边界。
2. M2-C：per-threat defense matrix
   - 每名威胁独立的现物、筋、壁、one-chance、字牌剩余；
   - 规则确定、结构启发式、行为启发式、校准统计严格分层；
   - 牌河阅读纳入威胁轴，但不得冒充 Mortal/Akagi 铳率。
3. M5：Mahjong Soul source adapter
   - 匿名 URL 获取、主视角、四麻南风规则校验；
   - source record → canonical event；
   - 与雀魂回放逐事件对照，不在 mapper 内做麻将判断。

优先顺序：先完成 hand structure/furiten 的书面规格与 TDD 计划，再实现 per-threat defense matrix；生产雀魂 mapper 可复用相同 snapshot 门禁并行进入后续批次。

## 8. 工作区保护

以下为用户/其他任务改动，不属于本批次，禁止修改、暂存或提交：

- `overlay/cv重做.md`（modified）；
- `overlay/prompt.md`（untracked）。

每次提交前继续执行：

```powershell
git diff --cached --name-only
git diff --cached --check
```
