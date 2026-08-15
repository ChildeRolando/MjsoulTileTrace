# Coach（日麻教练）

本机日麻教练应用：登录雀魂国区账号取回牌谱，用可验证的本地事实管线加上生产模型
（Mortal/Akagi）候选评分，产出可回放、可审计、可追问的整盘教学分析。

## Language

### 覆盖账本（full-game coverage ledger）

**本地决策（local decision）**：
canonical 重放暴露的一个自视角决策窗口（当前为自摸回合），是账本的本地一侧。
_Avoid_: 决策点、ReplayedDecision（实现名）

**Mortal 源行（Mortal source row）**：
Mortal 报告中摊平后的自视角 entry，是账本的源一侧；只按身份事实与顺序绑定，绝不按序号猜。
_Avoid_: Mortal entry（与原始报告条目混淆）

**绑定对（bound pair）**：
一个本地决策与一个源行经身份事实双向唯一匹配后的组合；任一侧不唯一即 fail closed，不猜。
_Avoid_: 锚定对、匹配对

**analysis_ready**：
绑定对进入比较分析并被成功装配的状态；未绑定或动作不被支持的行绝不进入此状态。

### 真实语料验收（real-corpus acceptance）

**语义覆盖矩阵（semantic coverage matrix)**：
按"窗口种类 × 行动分支"列出的验收清单（立直/黙听、chi 后弃牌、pon 后弃牌、
立直后、自摸、暗杠、加杠、九种九牌……）。某分支的 production fail-closed 只有
在其取得**真实 E2E 命中**后解除；矩阵无空格才是验收完成，corpus 场数不是。

**Discovery corpus**：
本地批量扫描的原始牌谱集合，只跑 mapper/canonical/census，**绝不调用 Mortal**；
用途是寻找稀有语义分支，不是评审。

**Acceptance corpus**：
从 discovery corpus 中选出的最小完备真实样本集；只对目标 game+seat 提交 Mortal
获取报告。Mortal 不是稀有事件搜索工具。

_Avoid_: "测试牌谱集"（掩盖两层职责差异）、"语料库"（不区分 discovery/acceptance）

### 决策窗口

**自摸回合窗口（self-turn window）**：
自己摸牌形成的决策窗口。

**副露后窗口（post-call window）**：
自己 chi/pon 之后、舍牌之前的决策窗口；无摸牌，手牌为副露后的暗牌。

**立直后窗口（post-riichi window）**：
立直受领后的舍牌决策窗口；选择被"保持听牌形"约束，通常唯一。

**终局决策窗口（terminal decision window）**：
实际行动为 tsumo / ankan / kakan / 九种九牌的自摸回合窗口。荒牌流局等
**纯终局不是决策**——无行动可选，不开窗、不入账本。

**立直决策窗口（riichi decision window）**：
实际动作为立直舍牌的自摸回合窗口。其中被比较的抉择是**立直 vs 黙听**，
不是"弃哪张牌"。
_Avoid_: 立直舍牌窗口（弱化了抉择语义）

**立直候选（declare-riichi candidate）**：
模型侧的立直动作，**永不携带舍牌 tile**——Mortal 的动作空间中立直是单一索引，
"立直后弃哪张"是受领后另一个决策行的事。actual 侧的立直舍牌 tile 一律来自
本地 canonical 事件（权威），两侧规则不混用。
_Avoid_: riichi_discard 候选（候选侧禁止使用带 tile 的立直动作）
