# 结构化日麻动作与候选规范化设计

日期：2026-07-30
状态：对话设计已批准，待书面复核
适用切片：统一候选比较架构第 2 切片

## 1. 背景与关系

本设计从已批准的《统一候选比较与经验教学设计》中提取第 2 个可独立验收的实施切片：

- 完整日麻动作判别联合；
- 稳定且可验证的动作引用；
- 明确的决策窗口；
- 模型、牌谱和用户候选的统一规范化；
- 已知事实一致性与候选可比较性检查。

第 1 切片已经提供 `AnalysisRequest`、`AnalysisFrame`、`ComparisonSet`、`ActionRef`、模型评分、冻结阈值和偏好集合。本切片为这些 opaque 引用补充结构化领域动作，但不提前实现五轴 `FactorPipeline`。

## 2. 目标

本切片必须：

1. 表达首版需要比较的全部动作种类；
2. 保留会改变麻将后果的动作身份；
3. 让所有领域逻辑读取结构化字段，而不是拆分动作引用字符串；
4. 把相同结构动作从 model、actual、user 来源合并为一个候选；
5. 明确区分自摸回合、弃牌响应、杠响应和鸣牌后弃牌；
6. 只检查能由已知直接事实确认的矛盾，不枚举完整合法动作；
7. 在事实不足时返回“无法检查”，而不是把动作判为非法；
8. 为 Mortal/MJAI、牌谱事件、Akagi 适配器和用户动作草稿提供同一个规范化入口；
9. 保持现有东一局 6、7 巡严格回归不变。

## 3. 非目标

本切片不负责：

- 枚举某个窗口的全部合法动作；
- 判断完整役、振听、同巡振听、包牌或和牌合法性；
- 搜索鸣牌后的全部打牌分支；
- 实现五轴候选后果、教练偏好或决定性理由；
- 猜测尚未取得样例的 Akagi Native 私有原始格式；
- 让 LLM 的自由文本直接成为可信领域动作；
- 一次性删除旧 `ActionId`、`NormalizedDecision` 或严格回归管线。

## 4. 方案选择

### 4.1 采用：兼容式结构化迁移

新增结构化动作、决策窗口和规范化结果。新统一管线只消费结构化动作；旧弃牌管线通过显式兼容桥保留，直到第 3 切片迁移 `FactorPipeline`。

优点：

- 当前严格回归继续稳定；
- 动作契约可独立验收；
- 不把动作建模、五轴迁移和解释器重写混成一个提交；
- 新代码从第一天起不依赖字符串解析。

### 4.2 不采用：一次性替换旧严格核心

同时替换 `ActionId`、`NormalizedDecision`、`FactorEvidence`、分析器、解释器和验证器会把第 2、3、5 切片耦合，无法独立判断动作契约是否正确。

### 4.3 不采用：扩展动作字符串

把吃碰杠和牌继续编码成 `discard:6s:tsumogiri` 一类字符串，会迫使业务逻辑解析字符串，无法可靠保留红牌组合、响应事件、加杠副露引用和决策窗口。

## 5. 结构化动作

所有动作对象使用严格 Schema，拒绝未声明字段。动作来源不属于动作身份；来源继续由候选的 `origins` 保存。

### 5.1 牌

沿用现有 `TileSchema`：

```ts
type Tile = {
  id: TileId;
  red: boolean;
};
```

赤五与普通五永远是不同牌实例。结构校验按 `id` 判断同类牌，同时保留每张牌的 `red` 身份。

### 5.2 动作判别联合

```ts
type RiichiAction =
  | {
      kind: "discard";
      tile: Tile;
      discardMode: "tsumogiri" | "tedashi";
    }
  | {
      kind: "riichi_discard";
      tile: Tile;
      discardMode: "tsumogiri" | "tedashi";
    }
  | {
      kind: "chi";
      calledTile: Tile;
      consumedTiles: readonly [Tile, Tile];
      targetActor: number;
      responseEventRef: string;
    }
  | {
      kind: "pon";
      calledTile: Tile;
      consumedTiles: readonly [Tile, Tile];
      targetActor: number;
      responseEventRef: string;
    }
  | {
      kind: "daiminkan";
      calledTile: Tile;
      consumedTiles: readonly [Tile, Tile, Tile];
      targetActor: number;
      responseEventRef: string;
    }
  | {
      kind: "ankan";
      tiles: readonly [Tile, Tile, Tile, Tile];
    }
  | {
      kind: "kakan";
      addedTile: Tile;
      existingMeldRef: string;
    }
  | {
      kind: "tsumo";
      winningTile: Tile;
      drawEventRef: string;
    }
  | {
      kind: "ron";
      winningTile: Tile;
      targetActor: number;
      responseEventRef: string;
      winContext: "discard" | "kakan" | "ankan";
    }
  | {
      kind: "kyuushu_kyuuhai";
      drawEventRef: string;
    }
  | {
      kind: "pass";
      responseEventRef: string;
      responseKind: "discard" | "kakan" | "ankan";
    };
```

设计决定：

- 普通弃牌和立直弃牌是两个 variant；
- 摸切和手切属于动作身份；
- 自摸和荣和保存和牌张；
- 抢杠进一步区分加杠与暗杠来源；
- `pass` 表示放弃整个当前响应窗口，不表示只放弃其中一种鸣牌机会；
- 九种九牌的成立牌集合属于规则证据，不重复写入动作身份。

### 5.3 结构不变量

- 吃的 `calledTile + consumedTiles` 必须构成同花色连续三张数牌；
- 碰的三张牌必须具有相同 `id`；
- 大明杠的四张牌必须具有相同 `id`；
- 暗杠四张牌必须具有相同 `id`；
- 吃碰杠只按 `id` 判断牌面同类，但不能丢失任一赤牌选择；
- 加杠必须具有非空 `existingMeldRef`；
- 吃、碰、大明杠、荣和和 `pass` 必须引用所响应事件；
- 自摸和九种九牌必须引用当前摸牌事件；
- actor 编号使用四人麻将的 `0..3`；
- 结构 Schema 不根据完整规则判定动作是否合法。

## 6. 决策窗口

动作是否可比较取决于窗口，而不只取决于动作种类。

```ts
type DecisionWindow =
  | {
      kind: "self_turn";
      actor: number | null;
      triggerEventRef: string;
    }
  | {
      kind: "discard_response";
      actor: number | null;
      triggerEventRef: string;
      sourceActor: number | null;
      offeredTile: Tile;
    }
  | {
      kind: "kan_response";
      actor: number | null;
      triggerEventRef: string;
      sourceActor: number | null;
      offeredTile: Tile;
      kanKind: "kakan" | "ankan";
    }
  | {
      kind: "post_call_discard";
      actor: number | null;
      triggerEventRef: string;
    };
```

`actor` 或 `sourceActor` 缺失表示题面没有给出，不触发非法判断。`triggerEventRef` 在独立假设中可以引用 `user_asserted` 事实。

允许矩阵：

- `self_turn`：普通弃牌、立直弃牌、暗杠、加杠、自摸、九种九牌；
- `discard_response`：吃、碰、大明杠、荣和、pass；
- `kan_response`：荣和、pass；
- `post_call_discard`：仅手切形式的普通弃牌。

“是否碰”和“碰后切哪张”分别属于 `discard_response` 与 `post_call_discard`，不得进入同一比较。

`DecisionLayerRef` 仍是单次分析内的 opaque 引用。结构化候选集合同时冻结 `DecisionWindow`，验证器必须检查引用、窗口种类和触发事件一致。

## 7. 稳定动作引用

`ActionRef` 是结构动作的版本化内容标识，不是持久层随机 ID。

规范化 codec：

1. 按每个 variant 的固定字段顺序生成 canonical tuple；
2. 使用精确 `Tile.id` 和 `Tile.red`；
3. 保留数组顺序；鸣牌消费牌在进入 codec 前按固定牌序排序；
4. 生成 `action:v1:<encoded-canonical-tuple>`；
5. 结构化候选 Schema 从动作重算引用并拒绝错绑。

权威 codec 必须位于 `contracts` 包，因为结构化 Schema 需要在解析边界调用它；`reasoning` 只能导入该实现，不能维护第二套编码规则。

业务逻辑只能：

- 比较 `ActionRef` 是否相等；
- 通过 action catalog 取得结构动作；
- 使用结构字段计算后果或显示标签。

业务逻辑禁止拆分、正则匹配或反向解释 `ActionRef`。显示文本由结构动作生成。

## 8. 结构化候选集合

现有 `ComparisonSetSchema` 保留为第 1 切片兼容契约。新增权威的新路径：

```ts
type StructuredComparisonCandidate = {
  actionRef: ActionRef;
  action: RiichiAction;
  origins: CandidateOrigin[];
};

type StructuredComparisonSet = {
  comparisonSetId: string;
  origin: "automatic_review" | "user_comparison";
  decisionLayerRef: DecisionLayerRef;
  decisionWindow: DecisionWindow;
  candidates: StructuredComparisonCandidate[];
};
```

除第 1 切片不变量外，还要求：

- `actionRef` 必须等于 codec 对 `action` 的重算结果；
- 相同结构动作只能出现一次；
- 相同动作的多个来源必须合并到同一候选；
- automatic review 的所有候选必须包含 `model` 来源且恰有一个候选包含 `actual`；
- 合并后必须至少有两个不同动作；
- 所有动作必须适用于同一个 `DecisionWindow`；
- 响应型动作的事件引用必须等于窗口的 `triggerEventRef`；
- 荣和/pass 的响应种类必须与窗口一致。

第 3 切片迁移完成后，旧 `ComparisonSet` 可降级为兼容视图；本切片不提前删除它。

由于现有 `ComparisonSetSchema` 是 strict object，`StructuredComparisonSet` 不直接伪装成旧对象。`toComparisonSet(structured)` 必须显式投影出旧视图，供现有 `AnalysisRequest`、`ModelEvaluation` 和偏好契约使用；投影只能删除结构目录和窗口字段，不能改变候选引用、来源、比较 ID 或决策层引用。

## 9. CandidateNormalizer

### 9.1 管线

```text
source adapter
  → typed ActionDraft
  → structural normalization
  → canonical Action + ActionRef
  → known-fact consistency checks
  → decision-window comparability checks
  → origin merge
  → StructuredComparisonSet
```

所有来源进入相同的结构规范化和一致性代码。来源适配器不得自行创建另一套动作语义。

### 9.2 结果

单候选规范化返回：

```ts
type CandidateNormalizationResult =
  | {
      status: "ready";
      candidate: StructuredComparisonCandidate;
      decisionWindow: DecisionWindow;
      consistency:
        | "consistent"
        | "unknown_due_to_missing_facts";
      skippedChecks: string[];
    }
  | {
      status: "structurally_invalid_action";
      issueCodes: string[];
    }
  | {
      status: "needs_clarification";
      ambiguousFields: string[];
    }
  | {
      status: "inconsistent_with_known_facts";
      conflictCodes: string[];
      evidenceRefs: string[];
    }
  | {
      status: "unsupported_source_action";
      sourceType: string;
    };
```

`ready` 结果冻结产生候选时使用的 `DecisionWindow`。集合构建器只能读取这个绑定窗口，不能接受调用者另外提供的窗口并重新标记候选。

结构完整但违反动作本身不变量的草稿（例如混牌碰、非顺子吃、混牌暗杠）返回 `structurally_invalid_action`；它不能抛出未声明的 Schema 异常，也不能伪装成缺事实或已知事实冲突。

集合构建另行返回 `not_comparable` 诊断，不能把跨窗口动作包装成普通 Schema 错误后继续分析。

### 9.3 用户输入

LLM 或界面只能产生受约束的 `UserActionDraft`，不能直接产生可信 `RiichiAction`。

首版接受：

- 中文动作名；
- `m/p/s/z` 紧凑牌记法；
- 赤牌标记；
- 用户明确给出的摸切/手切、鸣牌组合和响应对象。

normalizer 只使用明确字段和当前分析帧。无法唯一确定时返回最小 `ambiguousFields`：

- `tile.red`；
- `discardMode`；
- `consumedTiles`；
- `existingMeldRef`；
- `responseEventRef`；
- `winContext`。

场景只有一个可行牌实例时，可以由确定性事实消除实例歧义；否则禁止猜测。隐藏当前牌局不得污染 `standalone_hypothesis`。

### 9.4 模型与牌谱适配

Mortal/MJAI adapter 支持：

- `dahai`；
- `reach + dahai` 原子化为 `riichi_discard`；
- `chi`、`pon`、`daiminkan`、`ankan`、`kakan`；
- `hora` 映射为自摸或荣和；
- 九种九牌流局映射；
- `none` 映射为整个响应窗口的 `pass`。

牌谱 adapter 使用同一 MJAI 语义，并保留相关事件引用。立直弃牌同时保留 reach 与 dahai 的事实引用，但动作身份是单一 `riichi_discard`。

孤立的 `reach` 或缺少配对弃牌的 reach 序列不能生成 `riichi_discard`，必须保留为导入诊断。模型候选若只给出“立直”而没有唯一弃牌，返回缺少 `tile`/`discardMode` 的不完整动作，而不是自行选择弃牌。

Akagi adapter 通过同一个 typed adapter port 输出 `ActionDraft`。在取得真实生产样例前，不猜测 Akagi 私有 JSON；测试使用 adapter conformance fixture 验证它必须生成相同动作语义。

未知引擎扩展返回 `unsupported_source_action`，不得静默降级为字符串。

## 10. 已知事实一致性

normalizer 接收最小事实视图，不直接读取完整牌谱：

```ts
type KnownMeld = {
  meldRef: string;
  kind: "chi" | "pon" | "daiminkan" | "ankan";
  tiles: Tile[];
};

type KnownActionFacts = {
  decisionWindow: DecisionWindow;
  concealedTiles?: Tile[];
  currentDraw?: { tile: Tile; eventRef: string } | null;
  melds?: KnownMeld[];
};
```

字段缺失表示题面没有提供；空数组或 `null` 表示该事实已知为空。normalizer 不得用完整当前牌谱替换独立假设的 `KnownActionFacts`。

一致性检查只使用直接事实白名单：

- 弃牌实例是否存在于已知暗手或当前摸牌；
- 摸切牌是否精确等于当前摸牌，包括赤牌身份；
- 手切牌是否存在于已知暗手；
- 吃碰大明杠的消费牌是否存在于已知暗手；
- 响应事件、来源玩家和牌是否与已知窗口一致；
- 暗杠四张牌是否存在于已知牌实例；
- 加杠引用的副露是否存在、是否为碰、牌面是否匹配；
- 自摸牌是否匹配已知当前摸牌；
- 荣和牌是否匹配已知响应牌。

只要现有字段已经足以证明矛盾，冲突必须优先于补全提问或 `unknown_due_to_missing_facts`。这包括：已知暗手无法组成省略的吃碰杠组合、缺失摸牌最多只能补一张时仍无法暗杠、以及已知副露中不存在与加杠牌匹配的碰。响应动作也不得把 `targetActor` 指向窗口中的行动者本人；当窗口同时知道行动者和来源玩家时，两者必须不同。

本切片明确不检查：

- 完整役；
- 振听；
- 立直后暗杠限制；
- 吃牌上家方向以外的完整席位规则；
- 九种九牌是否满足九种；
- 杠后牌山、宝牌和岭上状态；
- 完整 legal-action 集合。

若所需事实存在且冲突，返回 `inconsistent_with_known_facts`。若前置事实缺失，保留候选并返回 `unknown_due_to_missing_facts`。对用户可见的措辞不得把后者称为非法。

## 11. 兼容与迁移

- `ActionIdSchema` 保留为 legacy discard-only 类型，不扩展到其他动作；
- `NormalizedDecision`、`FactorEvidence` 和旧严格包在本切片保持原形；
- 提供 `legacyDiscardActionIdToAction`；
- 提供 `actionToLegacyDiscardActionId`，非普通弃牌返回 `unsupported`；
- 旧 Mortal regression facade 保持原输出；
- 新 generic importer 输出 `StructuredComparisonSet` 与评分映射；
- 新代码不得复制旧 `split(":")` 逻辑；
- 旧字符串分析代码在第 3 切片迁移 `FactorPipeline` 时删除。

## 12. 错误处理

- 自然语言草稿歧义：返回具体字段，不生成动作；
- model/replay 缺失必要字段：记录导入诊断，不进入自动比较；
- 已知事实冲突：保留诊断和证据引用，不进入自动错误列表；
- 缺少事实：动作可进入用户限定比较，但相关一致性检查标记 unknown；
- 跨决策窗口：返回 `not_comparable`；
- 相同动作合并后只剩一个候选：不创建比较；
- 实战动作无法映射到已评分候选：沿用第 1 切片规则，不创建自动比较；
- 未知 source action：显式 unsupported，不猜测最相近动作。

## 13. 测试策略

### 13.1 动作契约

- 赤五与普通五引用不同；
- 摸切与手切引用不同；
- 普通弃牌与立直弃牌引用不同；
- 不同吃牌组合和红牌选择引用不同；
- 吃、碰、三种杠、自摸、荣和、九种九牌和 pass 稳定往返；
- 非顺子吃、异种碰杠、错误数组长度和空副露引用被拒绝；
- 未声明字段被拒绝。

### 13.2 codec

- 同一动作重复生成相同引用；
- 对象输入字段顺序不影响引用；
- 任一后果字段变化产生不同引用；
- Schema 拒绝 action/ref 错绑；
- 显示与业务逻辑不解析引用字符串。

### 13.3 决策窗口

- 允许矩阵逐项通过；
- 自摸动作不能进入弃牌响应窗口；
- 吃碰不能进入鸣牌后弃牌窗口；
- ron/pass 响应事件或抢杠种类错绑被拒绝；
- “是否碰”与“碰后切牌”返回 not comparable。

### 13.4 来源规范化

- MJAI 全部支持动作映射到结构动作；
- reach 与其后 dahai 原子化为立直弃牌；
- 同一动作来自 model/actual/user 时合并 origins；
- 未知源动作返回 unsupported；
- Akagi adapter conformance 输出与同语义 MJAI 动作相同的 canonical action。

### 13.5 用户草稿与事实

- “切5p”在赤牌/普通牌均可用时只询问 `tile.red`；
- 摸切/手切均可能时只询问 `discardMode`；
- 不同吃牌组合均可能时只询问 `consumedTiles`；
- 已知唯一实例能消除歧义；
- 明显缺牌、错误摸切、错误响应事件和错误副露引用返回 inconsistent；
- 缺少暗手、副露或响应事实返回 unknown，不返回非法；
- 独立假设不读取隐藏实盘场景。

### 13.6 回归

- 东一局 6、7 巡 legacy `NormalizedDecision` 快照不变；
- 新 bridge 将四个 legacy 弃牌动作映射到正确结构动作；
- `modelReason` 继续固定为 `unknown`；
- 第 1 切片所有请求、评分、阈值和偏好测试继续通过；
- package import、typecheck、npm audit 和根目录旧测试继续通过。

## 14. 模块边界

建议文件：

- `contracts/src/actions.ts`：动作、窗口、结构候选和结果契约；
- `contracts/src/action-codec.ts`：canonical tuple 与 `ActionRef` 重算；
- `contracts/tests/actions.test.ts`：动作与窗口不变量；
- `reasoning/src/candidate/legacy-action-bridge.ts`：legacy `ActionId` 显式桥接；
- `reasoning/src/candidate/candidate-normalizer.ts`：统一规范化、事实检查和集合构建；
- `reasoning/src/import/mjai-action.ts`：MJAI/牌谱适配；
- `reasoning/tests/action-codec.test.ts`；
- `reasoning/tests/candidate-normalizer.test.ts`；
- `reasoning/tests/mjai-action.test.ts`。

自然语言理解留在 LLM/对话边界；本切片只定义和验证 `UserActionDraft`。Akagi 私有 raw adapter 留到真实生产样例可用时实现，但必须遵守同一个 adapter port。

## 15. 验收标准

1. 首版列出的十一种动作均有严格结构表示；
2. 所有会改变后果的牌实例、鸣牌组合、副露和响应身份均被保留；
3. ActionRef 可稳定重算且不能与动作错绑；
4. 新领域逻辑不解析 ActionRef；
5. model、actual、user 相同动作合并来源；
6. 不同决策层级不能形成比较；
7. 事实不足不被描述为非法；
8. 已知直接事实矛盾阻止自动比较；
9. 未实现完整 legal-action 枚举；
10. Akagi 未知私有格式不被猜测；
11. 旧严格回归与第 1 切片全部保持通过；
12. 第 3 切片能够直接以结构动作作为 `FactorPipeline` 输入。
