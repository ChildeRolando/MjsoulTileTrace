# M6-A3 及之后：范围盘问决策记录

日期：2026-08-16
性质：范围/语义盘问（grill）会话的决策沉淀，供 A3 计划与实现直接引用。
证据基准：M6-A2 handoff（2026-08-15）、live 报告 `fresh.json`（113-match H2 样本）、
Mortal 源码 ACTION_SPACE（ADR-0001）、ROADMAP.md。

## 一、已决策（不再开放）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | A3 范围 | **三段全做一个里程碑**：①立直舍牌+非普通候选全集 ②post_riichi/post_call 表面 ③terminal 行动 |
| 2 | 立直候选契约 | **新增 tile-less 候选 kind（declare_riichi）**；actual 侧保持 riichi_discard(本地权威 tile)。证据：Mortal ACTION_SPACE 立直=单索引、mjai reach 无 tile 字段、live 40+ 处无例外、本样本立直后舍牌 4/4 tedashi。见 ADR-0001 |
| 3 | 候选映射范围 | **self-turn 面全集一次做完**：dahai / reach→declare_riichi / ankan / agari→tsumo / ryukyoku→kyuushu_kyuuhai；`mortal_candidate_action_not_supported` 整类消灭 |
| 4 | 新表面枚举 | **canonical 驱动全开**：本地独立枚举全部 post_call/post_riichi 窗口，源侧缺 entry 记 `no_mortal_entry`，两侧独立守恒；账本 local 基线 120→新口径，以 A3 重跑为准；post_riichi 窗口与 self_turn 同构比较，不设特殊 outcome |
| 5 | terminal 窗口 | **四类开窗**：tsumo / ankan / kakan / kyuushu_kyuuhai；荒牌流局等纯终局**不开窗不入账本** |
| 6 | 验收方法 | **coverage-driven 两层真实语料**：discovery（本地扫描，绝不调 Mortal）+ acceptance（仅目标 game+seat 提交，串行/延迟+jitter/断点/去重/硬预算/缓存）；停止条件=**语义覆盖矩阵无空格**（每分支 ≥1 真实 E2E 命中解除 fail-closed，常见分支 3–5 例）；synthetic 只做 regression，不解除 production fail-closed。见 ADR-0002 |
| 7 | corpus 本地侧 | **天凤原文→新 Tenhou→canonical mapper**（第二生产入口），不用报告内嵌 mjai_log 派生（保指纹交叉验证独立性） |
| 8 | A3 之后顺序 | **M6-A4 = 响应面全覆盖**（discard_response/kan_response + chi/pon/ron/pass 候选）→ 产品闭环（awaiting_mortal_verification / 导入 UI / 工作包 / 固定报告渲染）后置 → Akagi (M6-B) 更后 |

## 二、可推导项（不必再问，直接进计划）

- **黙听窗口立直候选**：tile-less declare_riichi 统一解决（决策 2 的自然推论），
  无需 derived tile 两套规则。
- **post_call 身份事实表**：round identity（roundOrdinal/roundWind/dealer/honba）
  + 副露后手牌 multiset + `fuuros` 对齐 + `at_self_chi_pon` ↔ 紧随自呼 chi/pon 事件
  + tiles_left；junme/序号照旧排除。post_riichi 同理用 `at_self_riichi` ↔ 立直
  受领后弃牌事件。每种窗口种类一张身份事实表，预检仍全局。
- **因子装配**：管线已 kind-aware（防守矩阵仅 discard/riichi_discard，非切牌候选
  走 blocked-projection 账本），analysis_ready 口径不变。
- **候选按类型等价匹配**：actual(riichi_discard) ↔ 候选(declare_riichi) 以类型
  对应，不按 tile 相等。

## 三、A3 内部落地顺序（建议，未盘问）

1. corpus 工具先行（Tenhou mapper + discovery/acceptance runner + 覆盖矩阵框架）——
   它是后续一切段的验收基础设施；
2. 段①（候选全集 + declare_riichi 契约扩展 + 立直窗口）→ 账本重跑；
3. 段②（post_call/post_riichi 表面 + 身份事实表）→ 账本重跑；
4. 段③（terminal 四类窗口）→ 覆盖矩阵收口 + A3 close。

## 四、开放风险（显式记录）

1. **九种九牌可能扫不到**：万场级 discovery 仍无命中时 A3 无法按"矩阵无空格"
   CLOSE。需要降级条款（扫描 N 场后该分支保持 fail-closed 并记 ROADMAP），
   在 A3 计划中定 N 与条款措辞。
2. **ROADMAP 关键路径矛盾**：决策 8（响应面先于固定报告渲染）与 ROADMAP
   "当前关键路径"第 3→4 条顺序相反。A3 落地时必须同步改写 ROADMAP，否则
   违反完成定义第 5 条（文档与代码一致）。
3. **A2 交接 §21 的"M6-A3 建议"本文档取代**：其三段排序建议被决策 1/6/7 修订
   （corpus 验收、Tenhou 入口、A4 响应面均为新增）。

## 五、产物清单（本会话）

- `coach/CONTEXT.md`（新建：账本/窗口/验收术语表）
- `coach/docs/adr/0001-tile-less-riichi-candidate.md`
- `coach/docs/adr/0002-coverage-driven-real-corpus-acceptance.md`
- `coach/docs/specs/2026-08-16-m6-a3-action-support-and-real-corpus-design.md`
  （共识的正式规格：契约变更、候选映射全集、窗口种类与身份事实表、账本口径、
  两层语料与覆盖矩阵、隐私、明确不做、固定失败码、实施顺序、开放风险）
- 本文档
