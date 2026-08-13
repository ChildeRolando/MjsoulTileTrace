# Canonical 重放、牌形与振听 V2 交接

更新时间：2026-08-09

当前阶段：M2-A 已完成；下一阶段进入 M2-C 逐威胁防守矩阵和 M5 雀魂生产牌谱适配。

## 1. 已交付范围

本批次把“局面 JSON 交给 LLM 猜原因”替换为可重算、可审计的事实链：

```text
canonical event prefix
  -> decision-snapshot/v2
  -> KnownGameFacts
  -> hand-structure/v2 + response furiten
  -> five-axis candidate ledger
  -> deterministic differences/preferences
```

已经落地：

- `canonical-riichi-events/v2`，覆盖摸切、立直、吃碰杠、宝牌、和牌、流局、点数与局界；
- 严格公私状态、事件前缀 SHA-256、四类决策窗口和稳定四元 event ID；
- 普通形、七对子、国士分别计算向听、有效牌与最优家族；
- 非劣结构分解，包含面子、雀头、搭子、浮牌、结构不变量和条件结论；
- 最多返回 64 个非劣结构代表；截断不会把未返回结构伪称为完整条件证据；
- 两面、嵌张、边张、双碰、单骑及国士等待的复合标签；
- baseline 荣和资格的三态：eligible / ineligible / unknown missing context；
- 舍牌振听、同巡振听、立直振听分别归约，含响应窗口关闭、头跳、多家荣和、自摸清除和立直持续；
- 候选弃牌可自行制造舍牌振听，且证据绑定 actor/action/state/scene；
- sidecar 所有结果在通用消费边界重验 schema、requestId、actionRef、stateHash、engine identity 与威胁证据；
- V2 成功时抑制旧 V1 效率维度；全体 V2 失败才允许显式 `legacy_v1_fallback`，混合可用性不产生偏好；
- fixture-only bridge 不再从 reasoning 公共包导出。

## 2. 可信边界

- canonical stream 是牌局事实的唯一权威输入；source adapter 只映射记录，不生成麻将判断。
- 对手暗摸始终隐藏；snapshot 不包含对手暗手。
- `complete / partial / unknown` 不互相折叠。缺牌河、响应机会、场风/自风、立直或食断上下文时，只能得到 blocked/unknown。
- sidecar 输出即使通过 TypeScript 类型端口，也必须在消费处重新绑定请求与场景；任意诊断原文不得进入 LLM-facing 事实。
- helper 的启发式役种、打点与危险度不能产生确定性偏好。
- 模型评分不进入事件流、手牌事实或振听事实；删除评分必须保持这些结果完全相同。

## 3. 主要提交

Canonical 重放：

- `2320316` 事件流契约；`49a7b33` 公私状态；`97e07ec` 序列校验；
- `427405d` 摸切归约；`eee534b` 吃碰杠；`9206cef` 立直/宝牌/终局；
- `c9c1453` 决策快照；`e33c408` fixture bridge 与 V2 投影；
- `f6148c3` 状态机与信任边界加固；`822fb55` 流局/杠宝牌/多家荣和加固；
- `7d94cbd` canonical event identity；`dc42aeb` 连庄局发生序号与 mapper v2。

牌形与振听：

- `e8cc3b1` hand-structure/v2 contracts；`c116fde` 结构证据绑定；
- `ad5c735` 三手型向听与有效牌；`8bc4c4c` 非劣牌形分解；
- `fc5d9db` 役种上下文；`94a27f9` 等待类型与荣和资格；
- `a1bab05` sidecar/client；`a102cc7` 候选请求投影；
- `75fddc4` response-opportunity furiten；`d5e97fd` 三类振听合并；
- `0ee5880` 历史响应证据；`17981b2` 决策场景绑定；
- `3978167` 因素差异信任边界；`8f384f8` V2 账本映射；
- `5e9e386` V2 统一 FactorPipeline 集成。

- `773c9b6`：更新打包 sidecar、真实 V2 golden、typed 分析装配边界、公共导出与信任边界回归。

## 4. 东一局不可退化门禁

牌谱 fixture：`coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`。

- 6 巡：牌效轴支持切 2 筒；防守轴支持摸切立直者现物 6 索；
- 7 巡：牌效轴支持切 7 筒；防守轴支持摸切现物 8 筒；
- 禁止把 6 索解释为牌效冗余张，禁止把 8 筒解释为保留更好牌形；
- applied scope 始终 `deterministicPreference: null`，不对攻守冲突擅自加权；
- `modelReason` 始终为 `unknown`；
- 当前 golden 由真实打包 `hand-structure/v2` sidecar 生成，不是测试内 oracle；
- 增删无关模型评分不会改变 V2 手牌与振听合并结果。

## 5. 打包与验收证据

Windows x64 sidecar：

- Go：`go1.24.13`；
- SHA-256：`9f00640888e1cc2301bed363174bf81f49fd759cfff396353219b227c8e76696`；
- 文件大小：`2,878,976` bytes；
- manifest、TypeScript 固定清单和资源二进制三者一致，安装环境不需要 Go 或用户填写可执行文件路径。

当前门禁：

- `npm run test:fact-engine`：通过；
- `npm test`：56 个测试文件，485/485 通过；
- `npm run typecheck`：通过；
- `npm run test:package-import`：1/1 通过；
- `npm audit --omit=dev`：0 vulnerabilities；
- 根目录 `node --test tests/*.mjs`：19/19 通过。

完整 M2-A 独立复审已完成。初审发现 2 个 Important：identity 错误路径可能回显不可信文本，以及模型评分删除回归未经过真实装配边界；两项均按失败回归先行修复。最终结论为 Critical 0、Important 0、Minor 0，Ready: yes。

## 6. 明确未实现

- M5：雀魂分享 URL 匿名下载、主视角解析、四麻南风校验和生产 record mapper；
- M2-C：逐威胁防守矩阵、染手/对对/役牌/宝牌周边和手切序列阅读；
- M2-B：逐等待完整役种、精确符番、规则变体与可靠打点；
- M2-D：点棒/顺位 EV、结果路径和未来选择权；
- 完整合法动作枚举、鸣牌后弃牌分支搜索；
- Mortal 人工验证接力与 Akagi Native 生产运行时；
- 教学资料、ReasonSelector、LLM 调用与输出验证；
- SQLite 会话、三栏牌桌/对话 UI 和 Windows 应用发布。

这些缺口必须继续显示为 unsupported / partial / unknown，不允许由 LLM 补写。

## 7. 下一批次入口

推荐从同一 `DecisionSnapshotV2` 并行推进两个产品关键路径：

1. M2-C per-threat defense matrix
   - 每名威胁独立输出现物、筋、壁、one-chance、字牌剩余与证据；
   - 规则确定、结构启发式、行为启发式、校准统计严格分层；
   - 牌河阅读不得冒充 Mortal/Akagi 铳率。
2. M5 Mahjong Soul source adapter
   - 匿名 URL 获取、牌谱 ID/主视角与四麻南风规则校验；
   - source record 只映射 canonical event；
   - 用用户已提供牌谱逐事件对照雀魂回放，达到 H1 时才需要用户确认。

关键代码入口：

- `coach/packages/contracts/src/event-stream.ts`
- `coach/packages/contracts/src/hand-structure.ts`
- `coach/packages/reasoning/src/replay/round-reducer.ts`
- `coach/packages/reasoning/src/fact-engine/hand-structure-validator.ts`
- `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts`
- `coach/packages/reasoning/src/factors/hand-structure-ledger.ts`

## 8. 工作区保护

以下为用户/其他任务改动，不属于本批次，禁止修改、暂存或提交：

- `docs/superpowers/plans/2026-08-08-hand-structure-furiten.md`（modified）；
- `overlay/cv重做.md`（modified）；
- `overlay/prompt.md`（untracked）。

每次提交前必须执行：

```powershell
git diff --cached --name-only
git diff --cached --check
```
