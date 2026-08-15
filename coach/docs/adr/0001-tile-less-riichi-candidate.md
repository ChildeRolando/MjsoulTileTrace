# 候选侧立直动作为 tile-less 的 declare_riichi，actual 侧保持带 tile 的 riichi_discard

Mortal 的动作空间（`ACTION_SPACE = 37 弃牌格 + 1 立直格 + …`，Mortal 源码
`libriichi/src/consts.rs`）里立直是**单一索引**，"立直后弃哪张"不是模型的输出维度；
mjai 协议的 reach 事件亦无 tile 字段，live 报告 40+ 处 reach 全部
`{"type":"reach","actor":N}`。因此立直候选的舍牌 tile **结构性不可恢复**——任何
"derived tile"（继承 actual 或假设摸切）都是在类型字段里存模型没说过的值，且本
live 样本 4 次立直后舍牌全部 tedashi，摸切假设 0/4 成立。决定：M0 契约新增候选
专用、永不携带 tile 的立直候选 kind（declare_riichi）；actual 侧的立直舍牌 tile
一律来自本地 canonical 事件（权威）。两侧规则不混用。

## Considered Options

- 继承 actual tile / 摸切 tile 并标 derived：零契约改动，但字段值是臆造，且两种
  窗口要两套规则。
- 模型首选立直则该行 fail closed：丢掉"该立直没立"这个教练价值最高的信号，
  账本多一类永久不支持。

## Consequences

- 契约、action codec、候选正规化、装配管线需同步扩展一个 kind；候选匹配按
  类型等价（reach ↔ declare_riichi），不按 tile 相等。
- Mortal 的 46 格候选全集自此全部可映射：dahai / reach / chi×3 / pon / kan /
  agari / ryukyoku / pass。
