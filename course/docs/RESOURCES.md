# 科学日麻牌效率 Resources

## Knowledge

- [Riichi Wiki: Tile efficiency — Riichi Wiki contributors](https://riichi.wiki/Tile_efficiency)
  用于：核对牌效率、进张与牌形比较的通行术语。可信依据：专门面向立直麻将、公开修订且能逐段追溯的社区知识库；具体枚数结论仍需用可执行算法交叉检查。
- [MahjongRepository/mahjong — MahjongRepository](https://github.com/MahjongRepository/mahjong)
  用于：交叉检查普通手向听计算，并作为日后自动枚举有效牌的可审查实现。可信依据：开源代码包含独立的 `Shanten` 实现、测试目录与持续集成，计算过程可复现。
- [Riichi Book I — Daina Chiba](https://dainachiba.github.io/RiichiBooks/)
  用于：把向听、搭子选择与牌效率计算转化为牌桌上的判断顺序。可信依据：作者公开免费完整教材及修订记录，内容长期被英语立直麻将学习社群引用。
- [天鳳統計(2) 〜 巡目ごとの向聴数・立直率・和了率 — 小林聡](https://blog.kobalab.net/entry/20180118/1516202840)
  用于：巡目别平均向听数、听牌率、累计立直率与和了率。可信依据：公开统计口径为 2016 年天凤凤凰桌东南战赤牌规则 159,798 个半庄，并给出逐巡完整分布。
- [天鳳鳳凰卓統計 (2023年) — 小林聡](https://blog.kobalab.net/entry/2024/11/04/215201)
  用于：现代赤牌规则下的整体和了率、放铳率、立直率、副露率与平均和了打点基准。可信依据：作者公开说明样本年度、计数方式与汇总量；2023 年样本的平均和了打点为 5,789 点。
- [現代麻雀技術論：赤あり麻雀のリーチ平均点 — ネマタ／雀Key会](https://yabejp.web.fc2.com/mahjong/tactics/chapter02/section016.html)
  用于：理解攻防模型为什么必须把亲家立直与子家立直分开，并提供较早期赤三规则立直打点样本作为历史参照。限制：样本较旧，不与 2023 年整体平均打点混为同一统计口径。

## Wisdom (Communities)

- [r/Mahjong](https://www.reddit.com/r/Mahjong/)
  用于：带完整手牌、巡目与可见牌发布何切推理，观察真实玩家如何指出遗漏条件。质量控制：社区有公开版规和版务管理；意见不是定理，必须回到枚数与牌谱验证。

## Gaps

- 尚缺一份可公开访问、同时严格讨论一次进张与二次改良权重的统一中文资料；课程将把两者分层呈现，不伪造单一万能分数。
- Riichi Wiki 会拒绝部分自动化访问；引用前需在浏览器中人工确认目标段落，不能只依赖链接可达性。
- 仍缺同一现代样本中按巡目、亲子、立直／副露状态、牌种危险度联合分层的公开中文攻防表；攻防课程必须把各统计量的条件写清，不能把无条件平均值当作个别对手的听牌率。
