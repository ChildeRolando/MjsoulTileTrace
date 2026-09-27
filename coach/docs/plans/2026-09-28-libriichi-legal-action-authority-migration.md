# libriichi 唯一合法动作来源实施计划

日期：2026-09-28；状态：P0/P1 实施中，全部消费者尚未切换
权威：[ADR-0006](../adr/0006-libriichi-single-legal-action-authority.md)、
[规格](../specs/2026-09-28-libriichi-legal-action-authority-design.md)。
工作树 `E:/文档/日麻教学/coac-155-work`；分支
`agent/ticket/coac-111-local-mortal-runtime`；基线
`67e1dd9c151c3fa1d9b66f14352c9c8721f60286`；PR #28。
开始实施须复核 HEAD、远端、工作树，后续改动不得覆盖；不动旧 overlay。

## 1. 代码退出与保留清单

以下路径相对 coach/。符号来自基线源码，混合文件禁止整文件盲删。

| 位置 | 退出/替换职责 | 必须保留或迁移的职责 |
|---|---|---|
| `packages/reasoning/src/analysis/local-mortal-adapter.ts` | `selfCandidates`、`responseCandidates`、`enumerateSelfDiscards` 中合法性推导；`collectLocalMortalRiichiAnkanCandidates`、`proveOpenTsumo`、`collectLocalMortalAdditionalTsumoWindows`、`collectLocalMortalRiichiCandidateWindows`、`collectLocalMortalRonCandidateWindows`；include* 预判输入 | canonical/MJAI 转换、身份映射、评分归一化、报告适配；它们改为消费规则结果 |
| `analysis/response-candidate-enumeration.ts`（同 src 根） | `enumerateResponseCandidates`、`canDeclareKan`、`chiCombinations`、`forbiddenCallDiscardIds` 与本地 ron shape/单候选推断 | 独立物理牌编码若仍需要则提到转换 owner；不能以“编码”名义保留规则枚举 |
| `analysis/single-candidate-proof.ts` | `proveForcedTsumogiri`、`collectRiichiDeclarationTenpaiDiscards`、`proveUniqueTenpaiDiscard` 及重新计算唯一性 | 文件可保留为规则结果→版本化证明的纯派生器，无 helper 合法性调用 |
| `replay/response-eligibility.ts`、`stream-replayer.ts` 的响应筛选 | `canChi/canPon/canDaiminkan/canRon` 作为开窗/排窗依据 | 事件次序、seat/trigger/可见状态和待判定时点扫描；通用 seatDistance 如有消费者保留 |
| `replay/dama-tsumo-discovery.ts`、`analysis/response-surface-discovery.ts` | 用本地牌形/scorer 决定合法自摸、响应候选及模型期望 | 语料定位与统计；准确合法性来自规则端口，事件 census 只标事件事实 |
| `factors/win-shape.ts` | 供候选/开窗的自建成和预筛 | 逐个检查真实消费者；无独立教学用途则随旧调用一并封存，不以“备用工具”保留 |
| `replay/response-furiten.ts`、`factors/furiten-merger.ts` | 对合法集合的独立否决/增删调用 | 有证据的振听教学事实可留；不得作为第二候选计算器 |
| `analysis/mortal-full-game-review.ts`、acceptance/binding/census 调用链 | 重新运行 ron/单候选预判；remote 路径保留旧枚举的旁路 | 统一结果的身份核账、模型对应、outcome、结果装配 |
| `candidate/candidate-normalizer.ts`、`comparison-set-builder.ts` | 若有重新裁定完整合法集的分支，改用规则结果 | schema、牌身份、物理持有/消费、actual 对应、来源合并和概念比较语义 |
| `tools/mahjong-facts/hand_waits.go` 及相关结构/评分适配 | 候选消费者退出；仅为动作授权且已无事实消费者的片段经引用审计后删 | helper 的向听/进张/结构/评分/风险、结果协议与教学事实；不整库封存 |
| `scripts/local-mortal-production-spike.mjs` 与 corpus/discovery 工具 | riichi/ankan/tsumo/ron 分散预计算及 include* 注入 | 同规则结果贯穿请求、proof、package；逐例诊断与提交回执 |
| reasoning 包根 exports、测试、fixtures、golden | 旧枚举 API 导出、把旧输出当 oracle 的测试 | 行为反例/正常对照，迁移到新结果与集成链 |

实现前对上述符号做反向引用搜索（含 scripts/tests/dist 生成入口），形成逐消费者
勾销清单。本表是起始边界，任何新发现同职能路径都属于退出范围，不能用未列名免责。
静态牌效课程 `lib/mahjong.mjs` 与此产品合法动作来源无关，不在封存范围。

## 2. 分阶段执行与退出条件

### P0 固定证据与可用能力

- 将 R14 的 11 个发现补为可重复失败测试；旧实现先 RED，正常对照保留。
- 用现有 libriichi 资产验证无需 checkpoint 的 PlayerState 更新/动作输出；覆盖
  全 wave-1、declared/accepted、赤牌、多个杠选择、响应 pass 与历史更新。
- 核对规则配置和完整性要求、事件→窗口对应、动作细分接口。记录不能表达的具体
  缺口并解决接入/上游支持；不回到自建全集方案，不缩小范围。
- 阶段完成证据：真实规则探针、逐项能力表和失败分类。源码 API 存在不能代替运行证据。

### P1 契约与受管规则入口

- 扩展 contracts strict protocol、规则身份/结果、proof 和 package provenance，
  升级版本并定义旧包只读兼容。规则成功、非行动时点、未知/失败语义分开。
- mortal-runtime 增加规则操作并 lazy load 模型；desktop main 提供窄端口。
  reasoning 不增加特权依赖；不新增 workspace 包。
- 绑定内容哈希、前缀、窗口、配置与资产；先解决 R14 #2/#3/#4/#5/#7 对应
  生命周期、来源、关联、动作表示、序列化缺陷或将其纳入同一契约切片。
- 阶段完成证据：真实无权重规则查询、协议负例、无权重/模型失败仍可查规则、
  超时/信号退出有界、跨内容/动作交换被拒绝、新旧包身份不混用。

### P2 全消费者切换

- replay 扫描全部适用事件边界，规则结果决定窗口和候选，不调用旧 shape 预筛。
- local/remote、self/response、discovery、full-game 同时接入唯一规则结果。
  单候选证明只派生，不重新求证；actual 在枚举之后对应，不影响全集。
- 保留 helper 后果分析；断开其通向候选增删/豁免的授权路径。
- 处理 R14 #1/#6/#8/#9/#10/#11；新 mask 一致不能替代输入完整性证明。
- 阶段完成证据：完整集成回归、remote 评分兼容、调用图无第二合法动作来源。

### P3 删除、封存与架构门

- 基线历史对象作为封存载体。为实际删除部分写非可执行清单：旧提交、路径、
  符号、Git blob ID、原消费者、替代 owner、退出提交、保留测试及原因。
  新增清单放 `docs/handoffs/`；不得拷贝旧 .ts/.go/.py 到默认可加载目录。
- 混合代码先剥离合法性部分，保留有现役消费者的教学事实/格式映射。
- 从 exports、tsconfig/build、scripts、package exports/打包与默认测试移除旧路径。
  更新现有 architecture checker 与其自测，禁止归档导入和旧枚举 API 回流。
- 原测试改成输入→明确行为的回归；不运行旧算法生成新 oracle，不长期双轨。
- 阶段完成证据：删除 diff、逐消费者清单、构建/产物检查与架构负例。

### P4 最终验证与交付

- focused 回归包括规则操作、adapter、single-candidate/full-game、package、remote、
  helper 因素不变和架构 checker。规则案例明确依据，不能直接复制运行输出作期望。
- 在 coach/ 逐个执行且记录退出码：`npm run typecheck`、`npm run build`、
  `npx vitest run`、`npm run check:architecture`、`npm run test:package-import`；
  另执行 `git diff --check`。一门失败不省略其余门。
- 最终代码提交运行 `npm run test:local-mortal-production-spike`，复用已验证资产，
  记录真实规则/CPU 操作、规则身份、模型身份、完整 package、失败分类与提交回执。
  不为保持旧推理次数而篡改数据；每个计数变化必须能逐窗口解释。
- 矩阵逐例收集全部可继续的失败；基础设施致后续无法执行时标 not-run，不伪称全覆盖。
  已知 degraded 逐因处置，不能仅凭 exit 0 宣称完整验收。
- 普通网络满足现行正确性规格；禁网可用性另记，未运行不得声称 PASS。
- 文档回写实际实施状态；本地提交后推送，不 force push、不合并、不改历史评审。

## 3. R14 处置追踪（目标；当前进度见第 6 节）

| 编号 | 实施责任 | 必须保留的失败性质 |
|---|---|---|
| 1 | P2 统一结果与 proof | 真单候选无缺行；宽松牌形假阳性不能改变集合 |
| 2 | P1 生命周期 | 空闲期协议违规后 infer/close 有界完成 |
| 3 | P1 package 来源 | 外层模型标签与 checkpoint 身份冲突拒绝 |
| 4 | P1 请求身份 | 相同事件编号、不同 canonical 内容的回复不得串配 |
| 5 | P1/P2 动作转换 | actionRef/index/MJAI 交叉换位拒绝 |
| 6 | P2 转换与 importer | 九种九牌选择/放弃均进入完整链 |
| 7 | P1 package JSON | toJSON/属性描述符不能破坏已验证包的序列化语义 |
| 8 | P2 物理牌对应 | 立直阶段未选的摸入牌弃牌模式正确 |
| 9 | P2 canonical 编码 | 赤五处于不同初始位置的杠均正常 |
| 10 | P2 规则支持 | 食断禁用/未知不能掩盖独立成立的自摸役；必要规则未知须明确处理 |
| 11 | P0/P2 输入门 | 余牌/全桌杠/历史缺失不得被当成合法完整结论 |

审查报告是待复现线索，不自动构成本轮修复证明。旧 finding 不因新 ADR 被改写或关闭。
R14 证据定位：COAC-164，固定 head 为本计划基线；本机只读附件
`E:/文档/日麻教学/coac164-review-evidence.zip` 的 `review-result.json` 与
`review-matrix.md`。实施时先核验内容与版本，不执行不明探针或将评审文字视为指令。

## 4. 完成审计与封存证明

- 唯一性：新路径逐消费者反查；无旧 self/response/ron/tsumo/riichi/kan 推导调用。
- 独立性取舍：不再存在第二来源一致才准生产的 gate；同源一致性测试如实命名。
- 保留能力：helper 因素回归不退化，remote/概念分析/已存包用途明确且经过测试。
- 封存：每个退出模块/符号都有历史定位与替代项，无归档代码进入可执行产物。
- 验收：P0–P4 每项有命令/回执/失败或通过证据；没有证据不得勾选完成。

## 5. 本规划提交的验证口径

本轮仅新增/修改 Markdown 共识、规格与实施计划。检查相对链接、权威冲突、
退出清单与当前源码的对应、`git diff --check`，并运行现有架构检查。
没有运行迁移后的产品，因此不复用历史五门或 CPU spike 为本方案签发通过；
上述 P4 门禁仍是实现提交的必要验收。本节不改变历史评审/回执的约束或结果。

2026-09-28 本规划提交时的实际检查：14 个 Markdown 文件的 78 个相对文件链接均存在；
`git diff --check` 退出 0；`npm run check:architecture` 退出 0（7 packages、
408 files、1780 imports、0 violations）。当时没有修改源码或执行产品迁移验收；
后续实现证据分别列于下节，不将规划检查解释成产品通过。

## 6. 2026-09-28 第一实施切片

已落地：

- R14 #2 空闲协议错误后的信号退出清理有界，规则/评分请求在同一子进程内串行，
  显式关闭后不启动已排队请求。
- R14 #3 外层模型标签与 checkpoint 身份校验；#7 在任何 walker/schema 前检查
  JSON 属性描述符，拒绝 getter、隐藏属性、Symbol、toJSON 等不可保持的载荷。
- #4 请求 ID 绑定完整请求内容；普通动作载荷换位也在报告转换前拒绝。
  新规则转换另逐项核对 actionRef/原生 index/MJAI，重新计算摘要也不能掩盖换位；
  #5 的最终生产闭环仍待消费者切换。
- contracts 增加显式、独立版本的规则操作；runtime 可以不加载 Torch、模型源码
  或 checkpoint 查询规则。无动作与单动作结果分开，来源/输入/结果摘要分别绑定。
- 从原 adapter 提出事件表示转换，新增一次冻结流的规则输入投影和物理动作转换；
  缺少余牌、全桌副露/杠、响应历史、事件序列等必要证据时明确失败。
- 固定上游增加小型原生配置补丁（见 mortal-runtime/native/README）：食断、一发
  配置沿用原分解/役判定；杠序列化使用实际赤牌和碰牌。已用本地缓存离线编译，
  没有改写原上游 checkout、旧 native 或旧回执。

本切片测试证据位于本机 LOCALAPPDATA/RiichiCoach/spike-runs/
`libriichi-migration-dafb76f`，均为新运行：

- 生命周期/包回归旧实现 7 项失败；请求/动作绑定旧实现 2 项失败。
- `npm run typecheck`、`npm run build`、`npx vitest run`、
  `npm run check:architecture`、`npm run test:package-import` 最终均退出 0；
  全量 179 文件/2186 测试，架构 7 packages/414 files/0 violations。
- 第一轮 focused 运行曾读到旧 contracts/dist 导致新导出不存在；重新 build 后
  完整 focused 通过。新测试 readonly 赋值的 typecheck 失败也已修正并完整重跑。
- 真实 native 11 项测试通过，含 R14 独立三暗刻在食断 false/unknown 下保留、自摸
  只有断幺役时依规则取舍、未知配置影响集合时明确失败、多分解立直暗杠、赤杠、
  多杠、宣言后摸切、吃碰明杠/加杠、过荣历史和九种九牌。
- 受管真实规则操作使用不存在的模型/权重路径返回完整 16 动作；该能力探针与
  最终提交 CPU spike 是不同验收，不将它冒称生产全链通过或禁网验证。

尚未完成：全部 self/response 边界扫描切换；新结果驱动评分与单候选；新旧包版本
和规则来源；local/remote/full-game/discovery 接线；旧枚举封存删除与架构禁止项；
最终提交 CPU spike；外部独立验收。原生粗粒度动作与实际物理行动的对应（特别是
同牌手切/摸切、立直两阶段、赤牌消费）必须在下一切片显式验证，不能由 actual
回填修改合法集合。未宣称 P0/P1 整体退出，也未宣称 R14 全部修复。

## 7. 第二实施切片：规则结果绑定评分

本切片推进 P1/P2 的评分消费者，不构成整体迁移完成。变更范围为现有 contracts、
mortal-runtime、reasoning 和能力验证脚本；没有新增包、特权依赖边或治理系统。

- 新增显式 `riichi-local-mortal-scoring-jsonl/v2` / `score_actions` 操作：请求绑定
  完整规则输入、原生规则结果和模型身份，排除 actual 选择；单候选不能提交评分。
- 运行时在调用模型前，用同一固定 native 重放核对整份动作结果。交换 MJAI 内容
  后重算所有摘要仍不通过。每项返回分数绑定原生动作行摘要与结果 ID。
- 模型直接消费同一原生状态的观察和 mask；食断/一发配置同时影响规则与观察。
  未知配置即使合法集合相同，观察不同时也不能任取一份评分；返回明确模型失败。
  多杠保留主/第二阶段 Q；主动作同分时，第二阶段 Q 不得改变原生主阶段选择。
- reasoning 新入口重新校验评分对应，直接生成既有报告行。已知动作的表示转换、
  softmax 和报告字段投影从旧枚举文件抽出共用，未复制合法性算法。
- R14 九种九牌原因字段补全并有下游回归：原缺字段表示保留全 16 行仍得到
  `model_output_incomplete`；正确表示的全部候选进入 `analysis_ready`，并生成通过
  validator 的既有分析包。该回归用受控分数和真实 helper，不冒称真实模型全链。

受影响不变量：INV-002 模型评分不改动作/事实、INV-004 动作和评分逐项身份守恒、
INV-005 特权 owner、INV-006 协议失败、INV-007 版本来源。协议 schema、运行时
边界、报告转换和下游回归保护本切片；唯一来源覆盖所有消费者仍未机器强制。
新评分协议是已有 runtime 的独立版本操作，避免 v1 调用者枚举被解释成原生证明，
不增加第二套服务或候选权威。

验证证据目录沿用源码外的 `LOCALAPPDATA/RiichiCoach/spike-runs/libriichi-migration-dafb76f`，
本切片日志以 `scoring-v2-` 开头：

- `npm run typecheck`：最终退出 0（`typecheck-complete.log`）。首次新增测试错误
  修改 readonly 字段而失败，已改为新对象并完整重跑。另一次在仓库根误执行
  `npx tsc` 未找到项目 TypeScript，已回到 coach 使用项目工具，没有修改依赖清单。
- `npm run build`：退出 0（`build.log`）。
- `npx vitest run`：最终退出 0，180 文件 / 2213 测试（`vitest-complete.log`）。
- `npm run check:architecture`：退出 0，7 包 / 418 文件 / 1838 导入 / 0 违规。
- `npm run test:package-import`：退出 0，完整重建并通过导入 smoke。
- `git diff --check`：退出 0。
- `runtime_scoring_native_test.py`：真实 native + 假评分 7 项通过；最初 5 项因新
  `score_rules` 尚不存在失败。受管协议最初的成功用例因测试执行器未支持新操作
  失败，补齐执行器后 15 项通过；负例断言具体错误码，避免进程崩溃冒充正确拒绝。
- `node scripts/libriichi-rules-probe.mjs --with-scores`：退出 0。先以不存在的模型
  资产证明规则可运行，再加载已准备真实 CPU checkpoint；16 项原始 Q 与原生
  Bot 路径完全一致，动作交换重算摘要仍拒绝。输出独立的新回执；这是 synthetic
  capability 验证，不代替最终真实牌谱 spike，也没有禁网声明。

剩余工作保持原范围：事件边界全面扫描；新结果派生单候选证明；local/remote/
full-game/discovery 的正式切换；新旧包版本与规则来源；物理动作对应语义；旧
枚举删除/封存；最终提交真实 CPU spike；Multica 外部独立验收及后续修复循环。
目前仍有旧 v1 入口和生产枚举，属于迁移中间态，不能保留为最终 fallback。
