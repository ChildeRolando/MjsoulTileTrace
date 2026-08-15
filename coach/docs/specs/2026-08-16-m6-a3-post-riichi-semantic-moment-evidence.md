# M6-A3 §10 — post_riichi 语义时刻实证记录

日期：2026-08-16
结论：**结局 A — 维持现有实现**（触发事件 = canonical `riichi_declared`，
本地立直状态 = `declared`），仅修正规范措辞。

## 问题

规范原文写"立直受领后"/"紧随立直受领"（受领 = accepted），而现实现把
post_riichi_discard 窗口开在 canonical `riichi_declared`（状态 declared）。
两处语义时刻不同，必须实证钉死，不允许凭措辞改代码。

## 证据（ pinned 真实 H2/Mortal 样本）

样本：`coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`
（已入库固定样本；本文只记录事件序数/类型，不含任何原始标识信息）。

### 源侧（mjai）事件顺序（该局唯一一次立直，宣言者非自席）

```
序数 45  dahai          actor 1        （他家舍牌）
序数 46  tsumo          actor 2        （宣言者摸牌）
序数 47  reach          actor 2        （立直宣言）
序数 48  dahai          actor 2 pai 6s （立直舍牌）
序数 49  reach_accepted actor 2        （受领，严格晚于舍牌）
序数 50  tsumo          actor 3        （下家摸牌）
...
序数 58  pon            actor 1        （他家对后续舍牌鸣牌）
```

### 本地（canonical）事件顺序

映射器保留同一顺序：`tile_drawn → riichi_declared → tile_discarded →
riichi_accepted → …`。本地 `post_riichi_discard` 窗口触发于
`riichi_declared`（`stream-replayer.ts`），冻结快照中立直状态为
`declared`、手牌 = concealed + 该巡摸牌（14 枚）。

### Mortal 行语义

Mortal 的 `at_self_riichi == true` 的 `dahai` 行对应序数 48 的舍牌决策：
该决策只能发生在序数 47（reach）与序数 48（dahai）之间。`reach_accepted`
（序数 49）本身不承载任何行动选择；且受领之前该舍牌仍可被鸣牌（同局
序数 58 存在 pon，证明可鸣性真实存在——被鸣则立直作废重来）。因此：

1. **受领事件严格晚于立直舍牌** —— post_riichi 舍牌决策时刻不可能是
   "受领后"；
2. 该决策时刻本地对应状态必然是 `riichi_declared`（declared）；
3. `at_self_riichi == true` ↔ 窗口触发于 `riichi_declared`，手牌含该巡
   摸牌。

### 自席 at_self_riichi 行的手牌状态

pinned 样本中该次立直来自他家，样本的 2 行自席决策不含 at_self_riichi=true
行；此半边由合成 `riichiDeclarationStream` 测试钉死（两窗口分别以 14 枚
手牌 multiset 绑定 reach 行与同巡 dahai 行，互斥不交叉，
`mortal-full-game-review.test.ts` "M6-A3 per-window-kind identity tables"）。

## 决定

- **选定触发**：canonical `riichi_declared`（结局 A）。实现与测试保持不变。
- **规范修正**：`2026-08-16-m6-a3-action-support-and-real-corpus-design.md`
  中三处"立直受领后/紧随立直受领"改为"立直宣言（declared）后、受领
  （accepted）完成前的宣言同巡舍牌"，并注明本证据文件。
- 未采用结局 B（改触发到 `riichi_accepted`）：与真实事件顺序直接矛盾
  （受领晚于舍牌），会系统性丢失全部立直宣言同巡窗口。
