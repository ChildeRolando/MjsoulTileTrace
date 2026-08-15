# M6-A3：自摸面非普通行动支持与真实语料验收规格

日期：2026-08-16
决策来源：[M6-A3 范围盘问决策记录](../handoffs/2026-08-16-m6-a3-scope-grill-decisions.md)；
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 为准；两项关键决策见
[ADR-0001](../adr/0001-tile-less-riichi-candidate.md)、[ADR-0002](../adr/0002-coverage-driven-real-corpus-acceptance.md)。

## 目标

把 M6-A2 账本中 11 个 unsupported local 与 3 个 unbound source 全部回收，使自摸面
（含立直后、副露后、terminal）在真实语料上达到语义覆盖矩阵无空格；验收基础设施
从"自有对局有机命中"升级为 coverage-driven 两层真实语料。

## 范围（一个里程碑，三段）

1. **候选与立直**：self-turn 面 Mortal 候选全集映射 + tile-less `declare_riichi`
   契约扩展 + 立直决策窗口比较。
2. **新决策表面**：post_call（副露后）、post_riichi（立直宣言后、受领完成前的
   宣言同巡）窗口，canonical 驱动枚举。
3. **terminal 行动**：actualDiscard === null 的窗口按四类决策行动开窗比较。

配套基础设施：天凤原文→canonical mapper 与 discovery/acceptance 语料 runner
（见"真实语料验收框架"）。

## 契约变更（ADR-0001）

- `packages/contracts/src/actions.ts` 新增候选专用 kind：

  ```text
  DeclareRiichiAction = { kind: "declare_riichi" }   // strict，无 tile 字段
  ```

- **永不作为 actual**。actual 侧立直舍牌保持 `riichi_discard(tile, discardMode)`，
  tile 一律来自本地 canonical 事件（权威）。
- candidate-contracts、action-codec、候选正规化同步扩展；比较集内
  actual(riichi_discard) 与候选(declare_riichi) 按**类型对应**匹配，不按 tile 相等。
- 变更理由与证据链（ACTION_SPACE 单立直索引 / mjai reach 无 tile / live 40+ 处 /
  本样本立直后舍牌 4/4 tedashi）见 ADR-0001；不得回退为任何"derived tile"方案。

## Mortal 候选映射全集

self-turn 面封闭全集（Mortal `ACTION_SPACE` 46 格可出现于自摸面者）：

| Mortal 候选 | canonical 候选 | 备注 |
|---|---|---|
| `dahai` | `discard(tile, mode)` | 现状 |
| `reach` | `declare_riichi` | tile-less |
| `ankan`（kan choice） | `ankan(tiles)` | |
| `agari` | `tsumo(winningTile, drawEventRef)` | 自摸和 |
| `ryukyoku` | `kyuushu_kyuuhai(drawEventRef)` | 九种九牌 |

`chi/pon/daiminkan/pass` 只出现在响应面（M6-A4），本里程碑不启用。
映射完备后 `mortal_candidate_action_not_supported` 整类消灭，不得残留。

## 决策表面

### 新窗口种类

- **post_call 窗口**：自己 chi/pon 之后、舍牌之前；无摸牌，手牌为副露后暗牌。
- **post_riichi 窗口**：立直宣言（declared）后、受领（accepted）完成前的
  **宣言同巡**舍牌；选择受"保持听牌形"约束。语义时刻已实证钉死：见
  `2026-08-16-m6-a3-post-riichi-semantic-moment-evidence.md`（触发事件是
  canonical `riichi_declared`，此刻受领必然尚未发生）。
- **terminal 窗口**：现有 self_turn 窗口中 actualDiscard === null 者，actual ∈
  `tsumo / ankan / kakan / kyuushu_kyuuhai` 四类开窗比较；**荒牌流局等纯终局
  无行动可选，不开窗、不入账本**。暗杠/加杠的岭上摸牌各自开新窗口。

### 枚举哲学（决策）

canonical 驱动：本地独立枚举全部新窗口；源侧无对应 entry 记 `no_mortal_entry`；
两侧独立守恒（延续 A2）。绝不源驱动枚举。

### 身份事实表（每窗口种类一张）

沿用 A2 原则：round identity（roundOrdinal/roundWind/dealer/honba）、手牌
multiset、立直状态、tiles_left（complete 时）；junme/序号/draw-tile 单独永不作
身份字段。各窗口的差异项：

- self_turn（现状）：14 枚 = concealed + currentDraw，摸牌精确相等。
- post_call：副露后暗牌 multiset（chi/pon 为 11 枚）、`fuuros` 与本地副露对齐、
  `at_self_chi_pon == true` ↔ 窗口紧随自呼 chi/pon 事件。
- post_riichi：宣言时点手牌 multiset（concealed + 该巡摸牌，14 枚）、
  `at_self_riichi == true` ↔ 窗口触发于 canonical `riichi_declared`（本地
  立直状态 = declared；受领事件严格晚于该舍牌）。
- terminal：同 self_turn，另要求 Mortal actual 类型与本地 actual 行动类型对应
  （`hora` ↔ `tsumo` 等）。

### 账本口径变更

local 基线 120 → 120 + N(post_call) + N(post_riichi)（terminal 不新增 local，
由 `local_actual_not_represented` 重分类）；source 侧 3 个 unbound 转 bound；
预期 `unsupported = 0`（四类 reason 全消灭）、`no_mortal_entry` 保持绑定处置
语义。新基线以 A3 live 重跑为准，A2 的"120"不再是守恒基准。绑定算法（唯一
匹配 + 顺序单调 + fail closed）不变。

### 装配

因子管线已 kind-aware（防守矩阵仅 `discard`/`riichi_discard`，其余候选走
blocked-projection 账本），`analysis_ready` 口径不变；比较契约"至少两个候选"
不变——terminal 窗口若 Mortal 候选集退化（如仅 agari 一项）则 fail closed，
不虚构第二候选。

## 真实语料验收框架（ADR-0002）

### 天凤入口（第二生产入口）

新增 `packages/tenhou-source`：天凤原始牌谱（XML/JSON）→ canonical 事件流，
与 `mapMahjongSoulRecord` 同等严格契约与 fail-closed 诊断码。**不得**从 Mortal
报告内嵌 `mjai_log` 派生本地侧——指纹 v2 交叉验证必须保持双源独立。

### 两层语料

- **Discovery corpus**：批量获取公开真实牌谱（amae-koromo 等公开索引），本地
  执行 mapper/canonical/census，**绝不调用 Mortal**；输出各语义分支的 raw 命中。
- **Acceptance corpus**：从 discovery 选最小完备集（目标 game + seat），仅对
  选中样本提交 mjai.ekyu.moe 获取 Mortal 报告。

### Mortal 提交策略

仅选中样本；串行/极低并发；保守延迟 + jitter；断点续跑；game+seat 去重；
单次硬请求预算；已有报告缓存永不重提。Mortal 不是稀有事件搜索工具。

### 语义覆盖矩阵

| 分支 | 说明 |
|---|---|
| 立直窗口 | actual=riichi_discard，候选含 declare_riichi |
| 黙听窗口含立直候选 | actual=discard，候选含 declare_riichi |
| post_call（chi 后） | actual=discard |
| post_call（pon 后） | actual=discard |
| post_riichi | 立直宣言后、受领完成前的同巡弃牌 |
| tsumo | actual=tsumo |
| 黙和窗口含 tsumo 候选 | actual=discard，候选含 tsumo |
| ankan | actual=ankan 或候选含 ankan |
| kakan | actual=kakan |
| kyuushu_kyuuhai | 候选或 actual |

每分支：**≥1 真实 E2E 命中（天凤入口→canonical→绑定→装配→脱敏输出全链）才解除
production fail-closed**；常见/高风险分支尽量 3–5 个不同 live case；稀有分支不为
凑数无限扩样。synthetic fixture 只做 regression/边界测试，**永不解除 production
fail-closed**（九种九牌同样适用：本地可扫千/万场寻找，只提交命中的目标 seat）。

A3 CLOSED 条件 = 目标语义覆盖矩阵无空格，不是任何 corpus 场数。

### 验收报告固定输出

- discovery corpus 扫描场数；
- 各分支 raw 命中计数；
- 提交 Mortal 的选中报告数；
- 各分支 live 验收计数；
- 仍未覆盖分支清单。

## 隐私

corpus 为公开牌谱，无账号关联；脱敏规则沿用 A2 §18：结果文件 0600，只含
聚合与脱敏决策字段；不含 raw reportId/结果与牌谱 URL/record UUID/账号身份/
`mjai_log`/`split_logs`；console 只输出聚合行。天凤牌谱原文只进 discovery
扫描，不写入任何对外输出。

## 明确不做

- 响应面（discard_response/kan_response 与 chi/pon/daiminkan/ron/pass 候选）——
  M6-A4；
- Akagi（M6-B）；
- `awaiting_mortal_verification` 持久化、结果导入 UI、M6-A 工作包、固定报告
  渲染——产品闭环后置（A3 落地时同步改写 ROADMAP 关键路径，消除顺序矛盾）；
- 不从 mjai_log 派生本地侧；不源驱动枚举；不放宽绑定唯一性/顺序单调规则；
- 不把立直候选写回带 tile 形态。

## 固定失败码（新增，沿用既有命名风格）

- `tenhou_record_unsupported` / `tenhou_mapper_*`（天凤入口，具体细分随实现 RED 定稿）
- `mortal_candidate_action_not_supported` 保留为防御性代码路径，live 预期 0
- `terminal_window_action_unsupported`（候选集退化的 terminal 窗口）
- `coverage_branch_uncovered`（验收报告中对未覆盖分支的显式标记）

## 实施顺序（建议）

1. corpus 基础设施（tenhou-source mapper + discovery/acceptance runner + 覆盖
   矩阵框架）——一切段的验收基础设施，先行；
2. 段①（契约扩展 + 候选全集映射 + 立直窗口）→ 账本重跑；
3. 段②（post_call/post_riichi 表面 + 身份事实表）→ 账本重跑；
4. 段③（terminal 四类）→ 覆盖矩阵收口 + A3 close。

每段独立 RED/GREEN + live 账本重跑；全量门禁（build / vitest / node 套件 /
typecheck）逐段通过。

## 开放风险

1. **九种九牌降级条款未定**：万场级 discovery 仍无命中时 A3 无法按"矩阵无空格"
   CLOSE。建议默认：扫描 ≥10,000 场仍无命中 → 该分支保持 fail-closed、矩阵标注
   `coverage_branch_uncovered`、记入 ROADMAP 后允许 A3 以"唯一空格已显式记录"
   关闭。**N 与条款措辞在 A3 计划定稿时敲定。**
2. **ROADMAP 关键路径矛盾**：A4 响应面先于固定报告渲染，与现行 ROADMAP 第 3→4
   条相反；A3 完成定义第 5 条要求本页与 ROADMAP 同步改写。
3. 天凤牌谱源的具体获取通道（amae-koromo 索引 → tenhou log URL → 原文抓取的
   速率与礼貌边界）在实现首日钉死，提交策略先于任何批量抓取落地。
