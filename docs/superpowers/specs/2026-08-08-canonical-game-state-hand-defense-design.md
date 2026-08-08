# M2 基础：规范牌局状态、牌形与防守事实设计

日期：2026-08-08

状态：待书面复核

上位规格：

- `2026-07-30-evidence-grounded-coach-reasoning-design.md`
- `2026-07-30-unified-comparison-analysis-design.md`
- `2026-08-08-structured-factor-pipeline-design.md`

关联里程碑：M2-A、M2-C，并为 M5 雀魂牌谱获取与完整重放提供共享边界

## 1. 背景

Slice 3 已经能够把 `StructuredComparisonSet` 中的候选动作投影给固定的麻将事实引擎，并生成同构五轴账本。但当前 `NormalizedEvent`、`SceneSnapshot` 和 `KnownGameFacts` 仍是为首个 East 1 回归构造的最小边界：副露变化、被鸣弃牌、杠宝牌、轮转、振听、流局与和牌结算等信息尚未形成统一的权威状态。

如果先分别扩充牌形分析、防守分析和雀魂适配器，每个模块都会自行解释“决策发生在事件之前还是之后”“加杠如何替换碰”“被鸣弃牌是否仍在河中”“一发何时消失”等规则，最终形成多套相互矛盾的局面。

本切片先建立唯一的事件溯源局面模型，再让牌形与防守事实只读取该模型。雀魂下载协议、Mortal/Akagi 评分和 LLM 均不进入这一边界。

```text
Source record / user assertion
              |
              v
       CanonicalEventStream
              |
              v
     DeterministicRoundReducer
              |
              +------------------+
              |                  |
              v                  v
     PublicRoundState      DecisionPrivateState
              |                  |
              +---------+--------+
                        v
              KnownGameFacts V2
                        |
              +---------+---------+
              |                   |
              v                   v
     HandStructureFacts     DefenseMatrixFacts
              |                   |
              +---------+---------+
                        v
              Slice 3 FactorPipeline
```

## 2. 目标

1. 用一个版本化规范事件流表达四人南风牌谱中所有影响决策的公开事件和主视角私有事件；
2. 从事件流确定性重放任意原子事件之前或之后的局面，并冻结稳定的决策前快照；
3. 明确分离公开状态、主视角私有状态、推导事实和未知信息，杜绝对手暗牌泄漏；
4. 完整保存副露、手切/摸切、被鸣牌、立直两阶段、一发、宝牌、点数、剩余摸牌和结算；
5. 在普通形、七对子和国士三类手牌上生成可审计的向听、有效牌、等待和牌形事实；
6. 对每个威胁者分别生成确定安全与结构启发式防守矩阵，支持多家威胁；
7. 对不完整的用户假设题逐维度退出，不默认追问无关信息；
8. 让 M5 的雀魂适配器只负责“源记录 → 规范事件”，不在适配器中实现第二套麻将状态机；
9. 保持模型分数删除不变性和 East 1 turn 6/7 回归。

## 3. 非目标

本切片不实现：

- 雀魂网络下载、protobuf 解码或分享 URL 解析；
- Mortal/Akagi 的生产运行时和候选评分；
- LLM Prompt、自然语言解释、会话存储或 UI；
- 全部合法动作枚举或无模型情况下的全局最优动作搜索；
- 染手、对对和、役牌、宝牌周边和手切序列等行为牌河推断；
- 跨筋、里筋、间四间等等待猜测；
- 校准放铳概率、点棒 EV 或顺位 EV；
- 用一个任意总分合并牌效、打点和危险度；
- 重复实现 Slice 3 已由固定 `mahjong-helper` 提供的算法。

行为与等待启发式作为 M2-C 的后续子切片接入同一防守矩阵。当前先保证其所需事件历史完整、来源稳定，不能让 LLM 临时读牌。

## 4. 方案选择

### 4.1 采用：事件流为唯一权威来源

每个牌谱或实盘题首先形成不可变、顺序稳定的 `CanonicalEventStream`。状态只能由 reducer 从事件前缀计算；持久化快照是带流哈希的缓存，不成为第二真相。

优点：

- 任一事实可以回指事件；
- 可以重建“发送消息瞬间”的局面；
- 规则修复后可重放历史会话；
- 适合雀魂、MJAI 和用户题面共用；
- 一发、振听、被鸣牌等时序语义只有一份实现。

### 4.2 不采用：源适配器直接输出快照

快照实现较短，但会丢失从何时开始立直、哪张弃牌被鸣、临时振听因何产生等证据。不同源适配器也容易产生字段语义漂移。

### 4.3 不采用：事件流与快照同时为权威

双写无法定义冲突时听谁的。快照只允许由规范流派生，并携带事件前缀哈希；哈希不符时丢弃缓存并重算。

## 5. 规范事件流

### 5.1 流身份

每条流包含：

- `schemaVersion`；
- `gameId`：源牌谱的稳定匿名标识或用户题目的本地标识；
- `sourceKind = mahjong_soul | mjai | user_asserted | fixture`；
- `playerCount = 4`；
- `ruleSet`：至少包含东/南场范围、赤牌配置、食断、头跳和西入设置；
- `selfActor`；
- 有序事件数组；
- 原始源身份与规范事件内容分别计算的哈希。

首版产品仍只接受四人南风常规牌谱，但规范事件允许东场和南场事件，以便表达南风战中的全部局。规则不明时记录 unknown，而不是猜默认值。

### 5.2 稳定事件 ID

事件 ID 来自规范位置，不使用可能碰撞或因补充字段而变化的纯内容哈希：

```text
gameId / roundOrdinal / sourceRecordOrdinal / subEventOrdinal
```

一个源记录若展开为多个规范事件，使用 `subEventOrdinal` 保持先后顺序。例如立直弃牌可以展开为宣言、弃牌、接受三个事件，但共享 `sourceRecordRef`。

适配器升级后若事件映射改变，提升 mapper 版本并产生新流身份；不能用旧 ID 伪装等价。

### 5.3 事件联合

规范事件至少覆盖：

- `game_started`；
- `round_started`：场风、局序、本场、供托、亲家、点数、初始宝牌指示牌和主视角 13 张手牌；
- `tile_drawn`：actor、主视角可见牌或 opponent hidden；
- `tile_discarded`：actor、精确赤牌身份、手切/摸切、立直宣言关联；
- `riichi_declared`；
- `riichi_accepted`：扣棒与供托变化；
- `chi_called`、`pon_called`、`daiminkan_called`；
- `ankan_declared`、`kakan_declared`；
- `dora_revealed`；
- `win_declared`：ron/tsumo、赢家、放铳者、和牌牌和可见结算字段；
- `round_drawn`：荒牌、九种九牌及源协议明确提供的其他流局类型；
- `scores_updated`：只在源记录明确给出结算点数时保存；
- `round_ended`；
- `game_ended`。

所有联合分支严格拒绝未知字段。不可见的对手摸牌使用显式 `hidden`，不能以 `null` 同时表示“确知不可见”和“源数据缺失”。

### 5.4 副露语义

每个副露保存：

- actor；
- kind；
- 精确牌张及赤牌身份；
- 被叫牌；
- consumed tiles；
- target actor；
- 被叫弃牌事件；
- 建立副露的事件；
- 对加杠保存被升级的碰事件。

确定约束：

- 吃只能来自上家且组成同色连续三张；
- 碰/大明杠的被叫牌来自目标牌河；
- 暗杠没有目标或被叫弃牌；
- 加杠必须引用同 actor、同牌的现存碰并将其原位升级；
- 同一弃牌最多被一个副露消费；
- 被鸣弃牌保留在牌河历史中，并以 `calledByEventRef` 标记，不从历史删除。

### 5.5 立直、一发和轮转

立直宣言与接受分开保存。`riichi_declared` 后到合法结算前是宣言中；`riichi_accepted` 后才扣除 1000 点并增加供托。

一发由事件序列确定：立直接受后建立窗口；该玩家下一次正常摸牌前，任一吃、碰、明杠、暗杠或加杠都会使所有仍存活的一发窗口失效。局结束也终止窗口。具体规则变体若不同，必须由 `ruleSet` 明示。

reducer 同时跟踪预期 actor 和阶段：摸牌、自摸后弃牌、他家弃牌响应、抢杠响应、鸣牌后弃牌。与阶段不一致的事件流失败关闭，不尝试自动排序。

## 6. 权威局面模型

### 6.1 `PublicRoundState`

公开状态包含：

- 场风、局序、本场、供托、亲家；
- 四家点数和座风；
- 当前事件位置、阶段和预期 actor；
- 当前及历史宝牌指示牌；
- 四家牌河，含手切/摸切、立直宣言牌、被鸣引用；
- 四家副露；
- 四家立直宣言/接受和一发状态；
- 公开已见牌计数；
- 牌山剩余摸牌数及其完整性；
- 终局/结算状态。

### 6.2 `DecisionPrivateState`

每个决策快照只保存 `selfActor` 的：

- 闭合手牌；
- 当前摸牌及其事件；
- 自家副露；
- 决策窗口；
- 实战动作引用；
- 已确认的临时、舍牌和立直后振听状态；
- 各字段完整性和证据事件。

不保存或推导对手暗牌、墙中顺序、里宝牌或未来摸牌。即使源报告含有全知信息，导入边界也必须在形成规范流前删除。

### 6.3 决策前快照

快照语义固定为“触发决策的事件已经发生，玩家动作尚未应用”。例如：

- 自摸切牌窗口包含刚摸入的牌；
- 他家弃牌响应窗口包含该弃牌；
- 抢杠窗口包含加杠宣言，但尚未把抢杠后的牌局继续推进；
- 鸣牌后弃牌是独立 `post_call_discard` 窗口。

快照身份由规范流身份、事件前缀哈希、actor 和窗口种类组成。候选投影不得修改原快照。

### 6.4 完整性

不再使用单个 `complete` 布尔值代表整个局面。至少分别标记：

- self concealed hand；
- melds；
- rivers and called markers；
- dora indicators；
- scores and round context；
- remaining draws；
- response opportunities；
- rule set；
- settlement。

每项状态为 `complete | partial | unknown`，并附缺失原因码。某项 partial 只阻塞依赖它的事实。

## 7. 振听事实

振听分开记录：

- `discard_furiten`：当前等待中至少一张存在于自家舍牌历史；
- `temporary_furiten`：在完整响应机会流中放过可荣和牌，直到下次自摸；
- `riichi_furiten`：立直后放过可荣和牌，持续到本局结束；
- `unknown_due_to_missing_response_events`。

舍牌振听由当前等待和自家牌河确定性计算。临时/立直后振听只有在响应机会完整、当时手牌可重建且事实引擎确认可荣和时才能成立；不能仅因“玩家没有荣和”推断其放过了和牌。

## 8. 手牌结构事实

### 8.1 复用事实引擎

向听、有效牌、改善、三种和牌家族和完成手点数继续由 Slice 3 固定 sidecar 提供。本切片扩展协议或本地适配，只获取现有上游公共 API 能证明的结构，不读取 helper 的最终推荐。

### 8.2 多家族结果

每个候选保存：

- standard shanten；
- chiitoitsu shanten；
- kokushi shanten；
- overall minimum shanten；
- 达到最小向听的家族集合；
- 每家族的有效牌种和在公开信息完整时的剩余枚数。

不能只保存一个最低数字后丢失七对/国士路线。

### 8.3 牌形分解

牌形经常存在多个同等最优分解，因此系统不得输出一份任意分解并让 LLM 把它当成唯一结构。结果保存：

- 所有非劣最优分解的稳定、去重表示；
- 每个分解中的完成面子、雀头候选、搭子和浮牌；
- 跨全部最优分解都成立的 invariant facts；
- 只在部分分解成立的 alternative facts。

教练默认只能把 invariant facts 写成断言；alternative facts 必须使用“可按……理解”等条件措辞，并保留分解引用。

为控制体积，协议不枚举任意劣分解；若非劣分解超过固定上限，返回结构摘要和 `truncated_non_dominated_decompositions`，LLM 不接收被截断原始列表。

### 8.4 等待

听牌时按和牌牌分别保存：

- tile identity and live count；
- ron/tsumo eligibility；
- wait types：两面、嵌张、边张、双碰、单骑及复合等待；
- 对应家族；
- 舍牌振听状态；
- 结构证据。

一个和牌牌可能因不同分解具有多个等待类型；不得强行选一个标签。

### 8.5 候选动作边界

- discard / riichi discard：分析动作后 13 张手牌；
- tsumo / ron：分析完成手牌和结算前状态；
- chi / pon：投影副露后进入独立 `post_call_discard` 窗口，不用尚未选择的弃牌伪造牌效；
- daiminkan / ankan / kakan：投影杠状态和新宝牌/补牌等待阶段，未发生的岭上牌保持未知；
- pass：保留原手牌并推进响应窗口；若是已确认可荣和牌，可参与振听推导；
- kyushu_kyuhai：只记录终止动作事实，不伪造后续牌效。

比较“鸣或不鸣”时，如果用户/模型只提供鸣牌动作而未提供后续弃牌，账本明确包含 `followup_discard_unresolved`。系统不枚举全部弃牌并自行替用户选择。

## 9. 防守矩阵

### 9.1 威胁对象

防守事实以 actor 为键，不生成无对象的“安全牌”。首版威胁包含：

- 已接受立直；
- 宣言中立直；
- 用户显式指定为威胁的副露手。

副露牌型和价值推断尚未实现时，只记录其公开副露与威胁来源，不凭副露数量自动生成精确危险度。

### 9.2 四级证据

本切片实现前两级：

1. `deterministic`：逐对象现物、公开事件、立直巡目、一发、亲子；
2. `structural_heuristic`：筋、壁、one-chance/no-chance、字牌剩余枚数、固定 helper 风险刻度；
3. `behavioral_heuristic`：预留，后续实现染手、对对、役牌和手切序列；
4. `wait_heuristic`：预留，后续实现跨筋、里筋、间四间等等待推测。

第 2–4 级只能形成 heuristic difference，不能直接进入 `DeterministicPreference`。现物也只对对应 actor 确定安全；抢杠、国士抢暗杠等规则边界另行声明。

### 9.3 `DefenseMatrixFact`

对每个候选弃牌和每名威胁者保存：

- candidate actionRef；
- threat actor and evidence；
- threat kind, dealer status, riichi turn, ippatsu；
- genbutsu status and supporting discard/pass events；
- structural classifications；
- raw versioned risk scale；
- tile visibility inputs；
- evidence class, eligibility and limitations；
- calculated/blocked/unsupported status。

多家威胁下不把风险相加或取最大值形成伪概率。账本保留逐家矩阵；只有后续有明确教学规则时才能比较“对所有威胁均现物”等确定集合关系。

## 10. 用户假设题与缺失事实

`user_asserted` 流允许从一个局面种子开始，而不是必须伪造完整牌谱。题目只给手牌时：

- 手牌与牌形事实正常计算；
- 剩余枚数若没有完整可见牌，标记使用理论未见张或 blocked；
- 防守、顺位和一发不参与；
- 回复不背诵被跳过的五轴，也不要求用户补充无关信息。

只有以下情况触发澄清：

- 题设宣称的动作结论与当前可计算的限定范围相反；
- 用户要求的结论依赖缺失事实；
- 用户给出的牌张、轮转或动作彼此矛盾；
- 动作草稿无法唯一规范化。

澄清只指出最小缺口，例如“平面牌效支持 B；如果实战应切 A，请补充牌河或攻守条件”，不要求填写整局。

## 11. 数据流与模块边界

建议模块：

- contracts/event-stream：规范流、事件联合、规则和身份；
- contracts/round-state：公开/私有状态、完整性和快照；
- replay/event-validator：序列、actor、阶段和物理牌张校验；
- replay/round-reducer：纯函数事件归约；
- replay/decision-snapshot：冻结决策前状态；
- facts/hand-structure：sidecar 输出到结构事实；
- facts/furiten：三类振听；
- factors/defense-matrix：逐威胁防守矩阵；
- import/legacy-event-bridge：旧 fixture 的显式迁移桥；
- future import/mahjong-soul：只做源格式到规范事件映射。

reducer 不导入 Mortal、Akagi、LLM、数据库或 UI。分析器不读取源牌谱 JSON，只读取已验证状态。

## 12. 错误与失败关闭

- schema 未知字段：拒绝该事件或状态；
- actor/阶段/目标冲突：拒绝整个受影响回合，不自动重排；
- 主视角物理牌超过四枚或摸切不可能：拒绝；
- 对手隐藏摸牌：只更新数量/轮转，不生成牌身份；
- 副露引用不存在或重复消费弃牌：拒绝；
- 加杠找不到对应碰：拒绝；
- 宝牌翻开数量与杠序列冲突：相应完整性 blocked，不猜指示牌；
- 点数结算与源总分不一致：结算 blocked，前序决策仍可分析；
- sidecar 失败：保留局面和本地现物事实，牌形轴窄范围 blocked；
- 缺响应机会：临时/立直后振听 unknown，不影响舍牌振听；
- 行为牌河推断未实现：明确 unsupported，不输出自然语言猜测。

所有内部错误细节保留在私有日志；进入教练证据包的只有允许码和项目自有文本。

## 13. 测试策略

### 13.1 契约测试

- 每个事件分支的有效/无效夹具；
- unknown field、重复事件 ID、错误 actor、非法副露、错误加杠、非法赤牌；
- `hidden` 与 missing 的区别；
- 完整性逐字段约束；
- 公私状态中不存在对手暗牌字段。

### 13.2 reducer 单元测试

- 正常摸切轮转；
- 吃碰后的独立弃牌窗口；
- 大明杠/暗杠/加杠、补牌和宝牌阶段；
- 立直宣言、接受、扣棒、一发建立与因鸣牌消失；
- 被鸣弃牌保留并唯一引用；
- 和牌、流局和点数结算；
- 每个事件前后状态的稳定哈希。

### 13.3 牌形与振听

- 普通形、七对子、国士分别最优和并列最优；
- 多重最优分解不产生唯一牌形假断言；
- 复合等待与多标签；
- 扣除公开牌后的有效牌；
- 舍牌振听、临时振听、立直后振听和缺响应机会 unknown；
- 鸣牌后与弃牌后分别计算。

### 13.4 防守矩阵

- 同一牌对 A 现物、对 B 非现物；
- 多家立直不合并为伪概率；
- 筋/壁/one-chance 保持 heuristic only；
- 移除某条河牌只影响引用它的事实；
- 改变 helper 风险刻度不改变确定性偏好；
- 没有威胁或牌河时防守轴按范围 skipped/blocked。

### 13.5 真实与变形回归

- East 1 turn 6：效率支持 2筒，防守支持对上家现物 6索；
- East 1 turn 7：效率支持 7筒，防守支持现物 8筒；
- 删除立直事件后对应现物/一发事实消失；
- 更换立直 actor 后现物归属改变；
- 候选顺序、origin 和模型评分变化不改变事实；
- 规范流序列化再读取产生相同每一步状态哈希；
- 旧 fixture 通过显式 bridge 与新状态结果等价。

## 14. 迁移

1. 新增 V2 契约，不立即删除现有 `NormalizedEvent`、`SceneSnapshot`；
2. 用 legacy bridge 将 East 1 fixture 转换为规范流，并建立等价 golden；
3. 让新 `KnownGameFacts V2` 驱动 Slice 3 pipeline；
4. 全量回归和真实 fixture 通过后，将旧 replay 标为 deprecated；
5. M5 雀魂适配器只输出 V2 流；
6. 所有生产消费者迁移完成后再独立删除旧契约。

不存在运行时静默 V1 fallback。bridge 只允许出现在迁移和 fixture 路径，并携带显式 provenance。

## 15. 完成判据

本切片只有同时满足以下条件才完成：

1. 四人南风牌谱的全部决策相关事件能由严格规范流表达；
2. reducer 能稳定重放摸切、鸣牌、杠、立直、宝牌和结算；
3. 每个决策快照的公私边界、阶段、证据和完整性明确；
4. 对手暗牌无法通过类型或序列化结果进入事实管线；
5. 普通形、七对子、国士、非劣牌形分解、等待和振听均有结构化事实；
6. 逐威胁现物和结构启发式形成防守矩阵，且启发式不能决定确定性偏好；
7. 不完整假设题只跳过缺失维度，矛盾时才最小澄清；
8. East 1 turn 6/7 和 Slice 3 全量回归通过；
9. 完整代码复审无 Critical 或 Important；
10. 书面交接记录契约版本、测试证据、未支持的行为/等待牌河推断和 M5 接入点。

完成后进入两个独立子项目：行为/等待牌河阅读，以及雀魂源记录到规范事件流的生产适配器。二者共享本切片状态模型，不能各自复制 reducer。
