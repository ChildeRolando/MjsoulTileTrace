# Slice 3：结构化事实引擎与 FactorPipeline 设计

日期：2026-08-08

状态：待书面复核

上位规格：`2026-07-30-unified-comparison-analysis-design.md`

前置切片：结构化动作与 `CandidateNormalizer` 已完成

## 1. 背景与定位

Slice 2 已经把 Mortal、Akagi、实战动作和用户草稿规范化为同一套 `StructuredComparisonSet`。现有旧版严格推理也能计算标准形向听、有效牌和逐家现物，但它仍以旧 `ActionId` 和固定“模型动作对实战动作”结构工作。

Slice 3 的任务不是重新发明一个完整日麻算法库，而是建立一条可审计的事实管线：复用成熟麻将算法计算候选动作后果，把结果转换为同构事实账本，再做确定性比较。模型评分和 LLM 均不得参与事实计算。

```text
AnalysisFrame + StructuredComparisonSet + KnownGameFacts
                         |
                         v
               Candidate State Projector
                         |
                         v
          MahjongFactEnginePort (source-neutral)
                         |
                         v
             allowlisted RawMahjongAnalysis
                         |
                         v
                  FactorPipeline
                         |
                         v
CandidateFactorLedger[] + FactorDifferences + DeterministicPreference
```

本设计吸收了对 `EndlessCheng/mahjong-helper` 和 Akagi Native 分析模块的代码级调研：首个生产事实引擎直接复用原始 `mahjong-helper/util`，但通过一个很小的、版本固定的 Go JSONL sidecar 暴露结构化事实；Akagi 的 Rust 移植用于交叉校验和未来替换候选，不成为 FactorPipeline 的私有依赖。

## 2. 目标

- 所有候选来源使用同一条事实计算管线，并以 canonical `actionRef` 为唯一动作键；
- 对每个候选生成同构、带状态和来源的五轴账本；
- 首版迁移可靠的牌效事实，以及基于事件重放的立直/现物防守事实；
- 只比较已计算且口径相同的事实，不把缺失、未支持或启发式当成相等；
- 分离单轴确定性偏好、跨轴冲突和总体无法取舍；
- 删除 `ModelEvaluation` 后，事实、差异和教练确定性偏好逐字段不变；
- 保持东一局 6/7 巡严格回归：牌效与防守可以分别支持相反动作；
- 外部事实引擎由应用默认集成，普通用户不设置路径、运行时或模型文件。

## 3. 非目标

本切片不实现：

- 完整日麻合法动作枚举或全局最优动作搜索；
- `mahjong-helper` 或 Akagi 的最终推荐、综合排名或黑箱分数复述；
- 完整役种、符番、期待打点和点棒 EV；
- 筋牌、壁、one-chance、染手、手切序列等启发式危险度；
- 顺位、局收支和选择权的完整取舍；
- 教材/MCP 经验规则；
- LLM Prompt、自然语言解释或 UI；
- 用旧 TypeScript 计算器作为生产环境的静默降级。

这些能力分别留给 M2–M4。Slice 3 只建立稳定扩展边界，并诚实标记尚未实现的轴。

## 4. 外部算法方案

### 4.1 采用方案：固定版本的 Go JSONL sidecar

新增 source-neutral `MahjongFactEnginePort`。首个实现是应用托管的本地 sidecar：

- 使用 Go 编写，只导入 `github.com/EndlessCheng/mahjong-helper/util`；
- 依赖固定到提交 `514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0`；
- 通过 stdin/stdout 逐行交换版本化 JSON，不解析人类可读文本；
- 构建产物随应用管理，不要求终端用户安装 Go 或填写可执行文件路径；
- 仓库记录 MIT 许可证、上游地址、提交和构建校验信息；
- sidecar 只返回原始分析事实，不返回供教练采用的推荐动作。

选择该方案的原因：原项目的 `util` 包已经提供公开结构化 API；一个窄 sidecar 可以直接复用它，同时把 Go 类型、进程生命周期和第三方版本隔离在端口之后。

### 4.2 未采用：解析 mahjong-helper CLI 输出

根 CLI 面向人类展示，含格式化和彩色文本，核心结果类型也不是稳定 JSON 公共协议。解析 stdout 会把文案变化误当成领域契约，因此禁止。

### 4.3 暂不采用：直接依赖完整 Akagi 应用

Akagi 的 `src/analysis` 是活跃维护的 Rust 移植，适合做一致性参考。但完整 crate 同时带入 Tauri 和应用运行时，且其应用 IPC 不是本项目的稳定任意局面批处理协议。直接绑定会让事实层依赖另一个产品的私有边界。

未来若抽取出独立、版本化的 Akagi 分析 crate，可新增第二个 `MahjongFactEnginePort` 实现。替换引擎时必须通过同一契约和黄金夹具，不能改变上层事实语义。

## 5. 输入边界与候选投影

FactorPipeline 的输入固定为：

- `AnalysisFrame`：题意范围和局面事实边界；
- `StructuredComparisonSet`：至少两个同一决策窗口中的规范动作；
- `KnownGameFacts`：从牌谱重放或用户题面得到的已知手牌、副露、公开牌、牌河、立直状态和来源；
- `FactEnginePolicy`：协议版本、超时和本切片启用的事实白名单。

禁止把以下数据传入事实分析器：

- `ModelEvaluation`；
- 模型首选动作；
- 候选概率、logit、Q 值或错误分差；
- LLM 输出；
- 特定牌谱的预期结论。

`CandidateStateProjector` 对每个候选独立执行确定性投影：

1. 从相同的不可变前置局面开始；
2. 应用结构化动作；
3. 保存 `actionRef`、动作精确赤牌身份和投影证据；
4. 生成事实引擎需要的 13 张/14 张手牌计数、副露和可见牌计数；
5. 不修改原始 `AnalysisFrame` 或其他候选状态。

首版牌效投影支持 `discard` 与 `riichi_discard`。其他动作仍必须得到一份账本，但相关轴标记为 `unsupported_action_in_slice`，不得伪造弃牌后的 13 张手牌。

## 6. 事实引擎协议

### 6.1 端口

概念契约如下，实际 TypeScript/Go 字段在实施计划中逐文件固定：

```text
MahjongFactEnginePort
  engineIdentity() -> engine/version/protocol/upstream commit
  analyze(request: MahjongFactRequest) -> MahjongFactResult
  close() -> void
```

请求至少携带：

- `requestId`；
- `protocolVersion`；
- `actionRef`；
- 投影后的精确状态哈希；
- Tile34 手牌计数；
- 已完成副露；
- 按 Tile34 聚合的可见牌计数及其完整性；
- 规则标识与计算模式。

响应至少携带：

- 相同的 `requestId`、`protocolVersion`、`actionRef` 和状态哈希；
- 引擎、上游提交和适配器版本；
- 每项事实的值、计算状态、前置条件和 provenance；
- 结构化诊断；
- 不含推荐动作、候选排序或模型评分。

请求与响应必须使用严格 schema；未知字段、非有限数字、重复牌、超过四枚的 Tile34 计数、身份不匹配和协议不匹配均失败关闭。

### 6.2 sidecar 传输

- 一行请求对应一行响应；
- stdout 只允许协议 JSON，日志写入 stderr；
- 请求 ID 支持乱序防护，即便首版串行执行；
- 单次超时只阻塞相应引擎事实，不抹掉本地重放事实；
- 进程退出、超时、畸形 JSON 或版本不匹配会重启至多一次；
- 重试仍失败则标记 `blocked_engine_failure`，不切换到另一算法；
- 上层保存诊断，但不把堆栈或进程路径送给 LLM。

## 7. 事实分类与白名单

第三方输出不能因为“是数字”就自动成为可信事实。所有字段分为三类：

### 7.1 `deterministic_allowlisted`

Slice 3 可进入账本和比较的外部事实：

- 动作后向听数；
- 有效/改善牌的 Tile34 身份；
- 在可见牌计数完整时，每种有效牌的理论剩余枚数和合计；
- 改善路径中可重算的向听变化；
- 算法明确区分且测试覆盖的普通形、七对子、国士结果。

若某项需要完整可见牌而题面只给手牌，则只阻塞“剩余枚数”，不能连带否定可由手牌计算的向听或牌种集合。

### 7.2 `deterministic_local_replay`

不交给第三方综合计算、由本项目事件重放产生的事实：

- 当前有哪些对手已经立直；
- 一发窗口是否仍有效；
- 候选弃牌对每个立直者是否为现物；
- 形成现物判断的具体牌河事件 ID；
- 候选动作是否打出赤牌、是否摸切/手切。

这些事实保留原始事件证据，不依赖 mahjong-helper 的危险度百分比。

### 7.3 `heuristic_or_out_of_scope`

Slice 3 不进入确定性偏好的输出包括但不限于：

- helper 的最终推荐或弃牌排序；
- `MixedWaitsScore`、`MixedRoundPoint`；
- `AvgAgariRate`、`FuritenRate` 等统计或混合指标；
- 未冻结口径的风险百分比；
- 期待打点、立直/默听综合分和未来局收支；
- 无来源的牌形质量标签。

Slice 3 的 sidecar 响应 schema 不包含这些字段；若上游适配器意外返回，严格 schema 直接拒绝整份响应。未来确需保存隔离指标时，必须提升协议版本并增加显式 quarantine 契约；在进入白名单前，它们仍不能出现在差异、偏好或 LLM 输入中。

## 8. CandidateFactorLedger

每个候选产生一个同构账本：

```text
CandidateFactorLedger
  actionRef
  projectedStateRef
  axes
    efficiency
    value
    defense
    placement
    optionality
  diagnostics
```

每个轴的状态只能是：

- `calculated`：本轴至少有一个口径明确、可比较的事实；
- `skipped_out_of_scope`：题意明确不要求本轴；
- `blocked_missing_facts`：本轴相关但缺少所需事实；
- `blocked_engine_failure`：本轴相关但引擎不可用或协议失败；
- `unsupported_action_in_slice`：动作类型本切片尚不能投影；
- `unsupported_dimension`：题意相关，但对应算法尚未实现。

轴状态与轴内单项事实状态分开。一个轴可以已计算向听，同时将剩余枚数标记为缺可见牌。账本只保存事实，不保存“模型选了谁”或未经解析的自然语言理由。

Slice 3 的轴覆盖：

- `efficiency`：弃牌/立直弃牌的向听、有效牌与可验证改善；
- `defense`：逐立直者现物、一发和威胁存在事实；
- `value`、`placement`、`optionality`：按题意标记跳过或未支持，不产生虚假中性值。

## 9. 差异与确定性偏好

`FactorDifference` 只比较：

- 同一决策窗口中的候选；
- 相同字段、相同单位、相同算法/适配器版本；
- 两边状态均为可比较的 `calculated`；
- provenance 允许用于确定性判断的事实。

缺失、阻塞、未支持和启发式不能转换为零，也不能产生“双方相同”。

### 9.1 单轴支配

在某一轴内，候选 A 支配 B 当且仅当：

1. 两者具有相同的本轴可比较维度集合；
2. A 在每个有方向的维度上不劣于 B；
3. 至少一个维度严格优于 B；
4. 不存在本轴内已计算且方向相反的差异。

向听优先级和有效牌数不通过随意加权合成。首先比较向听；向听相同时才可用有效牌/改善形成同层差异。牌种集合与剩余枚数必须保留，不能只留下一个总数。

### 9.2 跨轴结果

- 用户明确指定单轴时，可输出该轴的确定性偏好；
- 多轴实盘题中，如果效率与防守分别支持不同动作，则 `DeterministicPreference = null`，并保留冲突；
- 只有某候选在所有已计算且题意相关的可比较轴上均不劣，并至少一轴严格更优时，才形成多轴确定性支配；
- 相关轴缺失或尚未支持时，不得假装“总体最优”；只能报告已知的单轴结论；
- Slice 3 没有跨轴教学规则，因此不会用任意权重解决攻守取舍。

`DeterministicPreference` 保存偏好集合、作用范围、支配证据和覆盖状态；无法可靠取舍时使用 `null`，不是异常。

## 10. 赤牌与 Tile34

mahjong-helper 的牌效计算按 Tile34 聚合同种牌，因此赤五与普通五在向听和牌种进张上等价。但 canonical 动作仍必须保留赤牌身份：

- 每个精确候选分别投影和分析；
- 外部结果绑定原始 `actionRef`，不得用 Tile34 重新生成动作身份；
- 本地账本保存弃出/保留赤牌事实；
- Slice 3 不据此计算打点偏好；该差异在 M2-B 进入价值轴；
- 两个只在红五身份上不同的候选，不能因为牌效结果相同而被全局合并。

## 11. 模型与 LLM 隔离

以下变形测试是架构约束，而非普通单元测试：

1. 对相同 `AnalysisFrame + StructuredComparisonSet + KnownGameFacts`，加入、删除或改变 `ModelEvaluation`，账本、差异和 `DeterministicPreference` 必须完全相同；
2. 改变候选 origins（model/actual/user）而不改变动作及事实，结果必须相同；
3. 颠倒输入候选顺序，只允许输出排序规范化，不得改变方向性结论；
4. 外部引擎返回额外推荐/排名字段时，严格 schema 必须拒绝该响应，不能让字段悄悄进入结果；
5. LLM 永远不接触 sidecar 原始响应，只读取已验证账本、差异和后续证据结构。

## 12. 错误处理

- 候选投影与已知局面冲突：该候选记录结构化诊断，不调用事实引擎；
- 缺少对本事实必要的输入：只阻塞该事实或轴；
- sidecar 不存在、校验失败或不能启动：显式阻塞，不让用户配置路径；
- sidecar 超时/崩溃：重启一次，仍失败则保留本地防守事实和诊断；
- 响应 action/state 身份不匹配：视为协议破坏，整份响应不可信；
- 外部数值越界或非有限：拒绝相应响应；
- 外部算法版本变化：必须显式升级固定版本和黄金夹具，不能运行时漂移；
- 两个实现出现差异：保留差异并失败测试，不以多数投票决定麻将事实；
- 所有候选在相关轴均阻塞：不生成偏好，也不生成“差距很小”等话术。

## 13. 测试策略

### 13.1 contracts

- 严格解析请求、响应、账本、轴状态、差异和偏好；
- 拒绝未知字段、非法牌计数、身份不匹配、重复事实和非有限数值；
- 证明 blocked/unsupported 不能伪装成 calculated。

### 13.2 sidecar

- 以固定手牌验证向听、有效牌、改善和剩余枚数；
- JSONL stdout 纯净，诊断只写 stderr；
- 协议版本、请求 ID、状态哈希和 actionRef 往返一致；
- 固定上游提交和第三方许可证清单可自动检查；
- Windows 构建产物自检不依赖系统 Go。

### 13.3 adapter 与 FactorPipeline

- sidecar fixture 到账本的字段白名单测试；
- helper 的推荐、综合分、风险和统计字段不会进入账本；
- 不完整可见牌只阻塞剩余枚数，不阻塞可计算向听；
- 结构化 discard/riichi discard 结果一致时共享牌效事实，但保留动作身份；
- 非弃牌动作产生明确 unsupported 状态；
- 引擎失败时本地现物事实仍可用，但不凭空产生效率偏好；
- 候选次序、origin 和模型评分变形测试。

### 13.4 旧新等价与真实回归

- 用固定普通形手牌把 Go 结果与现有 TypeScript 向听/有效牌实现交叉验证；
- 不一致时先确定规则和输入差异，禁止为了通过测试改期待值；
- 东一局 6 巡：牌效支持切 2 筒，防守支持摸切现物 6 索；
- 东一局 7 巡：牌效支持切 7 筒，防守支持现物 8 筒；
- 两处均不得把防守偏好改写为牌效理由；
- 现有 209 项 coach 测试、类型检查和包导入回归全部通过。

## 14. 迁移与模块边界

建议新增的独立单元：

- contracts：事实引擎协议、账本、差异和偏好 schema；
- managed sidecar：固定版本 Go JSONL 进程；
- runtime adapter：进程管理、校验、超时和响应解析；
- candidate projector：结构化动作后的不可变状态；
- fact allowlist adapter：第三方原始结果到可信事实；
- structured FactorPipeline：逐候选计算和轴状态；
- difference builder / deterministic resolver：比较和支配；
- legacy bridge：仅用于迁移回归。

旧 `ActionId` 严格管线在 Slice 3 完成前保留。新管线通过东一局回归和变形测试后成为后续 M2–M4 的唯一事实入口；旧管线随后在独立清理切片移除。生产运行时不会在新旧算法之间静默切换。

## 15. 供应链与发布要求

- 上游：<https://github.com/EndlessCheng/mahjong-helper>；
- 许可证：MIT，保留原许可证与第三方通知；
- 固定提交：`514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0`；
- 记录 Go 工具链版本、模块校验和和 sidecar 二进制校验和；
- CI 从固定源码构建，不下载 `latest`；
- 应用校验随包 sidecar 身份，失败时显式报告安装损坏；
- 普通用户看不到路径设置，也不需要自行下载运行时；
- Akagi 参考实现：<https://github.com/shinkuan/Akagi>，只用于测试研究时也要遵守其 Apache-2.0 与 NOTICE 要求。

## 16. Slice 3 完成判据

Slice 3 只有同时满足以下条件才完成：

1. 结构化候选经同一端口生成同构账本；
2. 牌效与本地防守事实均有明确 provenance 和状态；
3. helper/Akagi 的推荐、模型评分和 LLM 不可能进入事实偏好；
4. 单轴支配、跨轴冲突和缺事实无法取舍均按本规格工作；
5. 东一局 6/7 巡回归正确；
6. 外部依赖固定、许可证完整、Windows 产物无需用户配置；
7. 新旧等价、变形测试、全量测试和类型检查通过；
8. 完整代码复审无 Critical 或 Important 问题。

完成后进入 M2：继续通过相同端口扩充牌形、打点、防守读牌、顺位和选择权事实，而不是扩大 LLM 自由推理范围。
