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

## 8. 第三实施切片：整盘消费者与 v2 规则证据包

本切片将新规则结果接入整盘分析和分析包。生产 main/spike/discovery 的默认入口仍待
切换；旧枚举尚未封存，不能据此宣称唯一来源迁移整体完成。

- 新响应边界扫描不经过旧牌形筛选；规则收集器逐边界聚合成功、非行动和失败，
  不因首个运行时异常停止全盘收集。旧筛选入口只供尚未迁移的调用者临时使用。
- 整盘分析的原生路径不调用旧 self/response 候选证明或 helper 荣和资格预判。
  同一重新绑定的规则结果产生版本化单候选证明，或要求完整模型行；非行动边界
  单独计入本地守恒，不伪装成单候选或模型评价。实际动作在完整集合产生之后核对。
- 模型报告规范化后的全部评分动作必须等于原生集合；缺失未选动作在 helper 分析
  前拒绝。R14 九种九牌完整 16 候选已走新整盘路径、真实 helper 和 v2 包校验；
  分数为受控测试数据，不将此项称为真实 CPU 全链 spike。
- 增加 `structured-analysis-package/v2`：规则版本参与包身份，原始规则请求/结果
  单独保存并参与语义摘要；重读复用相同的动作转换与绑定检查。无行动边界和规则
  失败都可追溯；旧 v1 包仍按旧语义验证，不接受新证明，新包拒绝旧证明。
- 包构建仍不查询规则进程/模型/helper，不重新裁定合法性；仅重新核验输入、规则
  结果和消费者对应。包内摘要验证不宣称独立重跑了原生规则或证明上游规则无缺陷。
- 发现并补充事实绑定：下游 KnownGameFacts 若单独变更、与 canonical 快照不符，
  在规则请求前失败；避免规则按一份手牌工作、教学消费者使用另一份手牌。

回归证据（源码外 `LOCALAPPDATA/RiichiCoach/spike-runs/libriichi-migration-dafb76f`）：

- `rule-ledger-red.log`：旧整盘路径两项失败——原生单候选得到旧证明；余牌证据不全
  仍被旧路径豁免。新路径相同断言通过。
- `native-package-red.log`：原生 16 候选通过整盘分析但未能产生新版本分析包，
  在包迁移前失败；迁移后通过完整 v2 validator。
- `native-consumer-facts-red.log`：改写下游手牌后仍调用规则端口，失败断言确认；
  修复后端口零调用且记录 `rules_input_incomplete`。
- 新增原生 full-game 20 项，覆盖合法多分解暗杠实际摸切/暗杠、真单候选、非行动、
  未知/缺失/错误/空结果、伪造缓存动作、实际动作不在集合，以及重算包摘要后的
  错误证明、缺失/重复结果、失败伪装成功、旧证明混入和版本降级。
- 聚焦三文件 45 项通过（`native-consumers-focused.log`）。完整五门最终退出码均为 0：
  `npm run typecheck`、`npm run build`、`npx --no-install vitest run`、
  `npm run check:architecture`、`npm run test:package-import`。全量 181 文件 / 2234 项；
  架构 7 包 / 422 文件 / 1882 导入 / 0 违规。日志统一 `native-consumers-` 前缀。
- 工作区与暂存区 `git diff --check` 最终退出 0；暂存检查先发现抽出的 fixture
  末尾多余空行，删除后重新检查通过。
- 开发中类型检查曾因新增可选字段的 TypeScript 精确可选语义和测试对象推断失败；
  已修正并完整重跑（`typecheck-complete.log`、`build-complete.log`）。无环境失败。

受影响约束：INV-002 规则/模型/教学事实分离，INV-004 完整候选与评分守恒，INV-007
版本来源；由新整盘/包负例、原有门禁和旧包回归保护。本切片不新增包或特权依赖边。
仍需完成 main/local/remote/spike/discovery 默认接线、物理动作对应、旧枚举退出与
封存清单、最终提交真实 CPU spike，以及 Multica 独立验收和后续修复循环。
本切片没有运行禁网演练，也没有声称最终 CPU spike 或独立验收通过。

## 9. 第四实施切片：同牌手切/摸切的显式对应

对全部已登记真实牌谱/视角做无模型规则诊断，逐窗口收集而非首错退出。
发现雀魂主样本 1945 个边界均缺少必要源证据；天凤抢杠补充样本有一处实际三万手切
与原生同牌摸切表示不一致。前者是来源映射/旧脱敏资产的信息缺口，尚待解决；
不能把完整性 unknown 改为 complete 或删除输入门来处理。后者由本切片修复。

- 原生 `discard_realizations` 复用现有弃牌 mask，按原生持牌和摸牌副本输出允许的
  出牌方式。未立直与宣言后允许已有同牌手切；受理后只保留摸切；赤牌独立计数。
- 规则协议/转换显式升级 v2，`physicalAliases` 记录同一模型动作的其他实际表示。
  分数、概率和模型候选只计一次；实际手切不改写模型行，也不添加重复分数。
- 既有 comparison correspondence 扩展为带规则结果 ID 的
  `native_physical_realization`。full-game 重新绑定原生证据后产生对应，v2 包重读
  校验其来源和评分载体，旧 v1 包拒绝新关系。没有增加包、特权依赖或第二合法性来源。
- 受影响约束为 INV-002、INV-004、INV-007：由规则协议、逐动作绑定、整盘/包
  回归及真实 native 测试保护。唯一来源的全部生产消费者切换仍未完成。

本切片证据位于源码外 `LOCALAPPDATA/RiichiCoach/spike-runs/libriichi-migration-dafb76f`：

- `physical-alias-native-red.log`：原实现 3 个子例失败，均缺少应有的手切对应。
  `physical-alias-consumer-red.log`：下游原协议拒绝该显式对应。
- 真实 native 规则 13 项、真实 native + 受控评分 8 项通过，不加载 checkpoint。
  覆盖 declared/accepted、相同牌不同副本、赤/普通五、无同牌、分数行守恒，以及
  篡改对应后重算摘要仍在模型调用前拒绝。
- focused 两文件 31 项通过；同牌实际切换不改变请求/分数，完整 14 候选进入真实
  helper、full-game 与 v2 包。换牌、重复、错 actor、缺副本和错规则 ID 均拒绝。
- 五门均退出 0，日志 `physical-alias-gate-*`：typecheck、build、vitest
  （181 文件/2240 项）、architecture（7 包/422 文件/1886 导入/0 违规）、package-import。
  `git diff --check` 退出 0。
- 初次 native patch hunk 行数和一次临时脚本编码错误已修正；初次 build/typecheck
  的 ActionRef 类型/测试 narrowing 错误已修正并完整重跑。focused 曾因 fixture
  摸牌/弃牌不一致、缺少既有 dama coverage 注册失败，修正测试输入后完整通过。
- 原真实天凤边界 `.../7/742/0` 已用新 native 复查：10 个模型动作保持不变，
  三万手切/摸切显式对应到 index 2。开发期回执明确 dirty；干净提交复核另写新回执。
  这是一处真实规则回归，不是最终真实 CPU spike、完整 corpus PASS 或禁网演练。

剩余：雀魂源证据及真实资产补全、其他物理动作粒度、remote 表示对应、生产默认入口
切换、旧枚举封存、最终提交 CPU spike 与 Multica 独立验收。不得将本切片标为目标完成。

## 10. 第五实施切片：来源余牌证据与原生 spike 入口

- 雀魂 mapper v2 用真实 NewRound 的 14/13/13/13 配牌和 69 张余牌建立
  canonical 摸牌前 70 张，逐次核验 DealTile（包括岭上）的计数。缺失保持 unknown，
  矛盾拒绝；protobuf 省略零只在此前完整计数已经推出零时接受。未补造规则配置、
  响应历史或杠宝牌证据。真实 9 局 / 466 次摸牌、四视角完整 replay 已覆盖。
- 脱敏生成器保留摸牌、弃牌、暗杠/加杠记录上的公开 doras 字段；合成传输用例验证
  字段保留，不将合成内容写进真实样本。旧真实样本缺失的杠宝牌尚无法恢复。
- 真实 CPU spike 改用同一原生规则结果生成评分、单候选与 v2 分析包，不再经过旧
  候选枚举。每个窗口、每份牌谱失败继续收集；所有视角记录完成/失败/未运行。
  子集执行只作诊断；每次在源码外新建提交绑定的 v3 回执与包目录，历史证据不覆盖。
- 复用已有 checkpoint/model/engine 资产，新 native 单独核验构建回执与当前补丁；
  Windows Sandbox 准备/执行脚本同步支持该产物和路径迁移。本次没有启动 Sandbox。

受影响约束为 INV-001/002/004/007：原始来源产生余牌事实，原生规则唯一生成动作，
规则/评分/包身份守恒；七包及特权边界不变，没有引入新的架构抽象。

验证日志位于源码外 `LOCALAPPDATA/RiichiCoach/spike-runs/libriichi-migration-dafb76f`：

- `majsoul-source-evidence-red.log`：改动前 8 项失败；focused 3 文件 36 项及
  real-record replay 5 项通过。`native-spike-proof-red.log` 记录旧计数器无法读取
  新请求；新计数器测试 4 项通过，包含评分和包引用不同规则结果的拒绝断言。
- 五门实际均已执行。typecheck、build、architecture（7 包/422 文件/1887 导入/
  0 违规）、package-import 退出 0。首轮全量测试 1 失败：旧 unknown 回归隐含依赖
  mapper 不提供余牌证据；测试改为显式构造证据缺失，保留 unknown 与禁止豁免断言。
  完整重跑 `npx --no-install vitest run`：181 文件/2254 项通过，退出 0。
  日志为 `source-native-spike-gate-*` 与 `source-native-spike-vitest-rerun.log`。
- JS 语法、两个 PowerShell 脚本解析、`git diff --check` 通过。真实 CPU 新入口还须在
  干净提交上实际运行；以上确定性门禁不代替 spike、禁网或外部独立验收。

剩余仍为来源缺失证据、全部生产消费者迁移、动作粒度、旧实现封存及最终独立验收。

### 10.1 干净提交的真实 CPU 运行与大包导出修复

已推送提交 `2a689080ff8776397c3d8ef59231e76d14b0ce22` 实际运行完整
`npm run test:local-mortal-production-spike`，退出 1。新回执目录为
`LOCALAPPDATA/RiichiCoach/spike-runs/production-native-2a689080ff87-1790546235217`：

- 六个牌谱视角全部运行，雀魂四视角仍有 1945 个 `rules_input_incomplete`；
  未伪造规则配置、响应历史或旧脱敏资产已删除的杠宝牌。Git 首次纳入该 fixture
  时的生成器也删除这些字段，不能从该文件历史补回。此前询问的原始文件仍待提供。
- 两份天凤补充样本规则无错误：抢杠 122 成功/243 非行动/1 单候选，121 次推理；
  大明杠 22 成功/43 非行动，22 次推理。合计 143 次真实 CPU 推理。
- 大明杠的 22 个评价全部 `analysis_ready`，v2 package validator 通过，保存
  97,232,235 字节完整包；抢杠样本下游遇到 `Invalid string length`。回执同时记录
  来源失败、无分析、覆盖缺口等，共 1952 条失败记录；它们不是 1952 种独立 bug。
- 未禁网，未提交外部独立验收，不是全量 PASS。

导出修复复用既有 canonical hash walker，开放同字节序列的分块输出；CPU runner
以 64 KiB 字节缓冲写文件，记录文件字节数与 SHA-256。既有语义哈希不变，不裁剪
候选、教学因素或证据。每份运行增加失败阶段定位，防止把导出失败与模型失败混淆。

复现/验证（同上迁移证据目录）：

- `package-evidence-writer-red.log`：6 份已验证真实包组成的导出压力输入在旧
  `JSON.stringify` 报相同 RangeError。该输入仅验证导出，不宣称是合法分析包。
- `package-evidence-writer-large.log`：同输入分块导出 583,393,417 字节，文件大小
  与独立流式读回 SHA-256 一致。未删减内容；完整 CPU 仍须在新干净提交重跑。
- `artifact-writer-focused.log`：15 项通过，包括 UTF-8 跨缓冲、全部字段、原有
  canonical 字节/哈希一致及不覆盖历史文件。此修复限于验证证据导出；桌面现有
  JSON 持久化对超大包的上限仍是已发现的产品风险，未声称已解决。
- 五门均实际执行：build、typecheck、vitest（182 文件/2256 项）、package-import
  退出 0。architecture 初次发现脚本测试跨包导入内部 serializer；改用公开导出后
  重跑退出 0（7 包/424 文件/1899 导入/0 违规），改动测试再聚焦重跑 2 项通过。
  日志 `artifact-writer-gate-*`、`artifact-writer-architecture-rerun.log`、
  `artifact-writer-focused-rerun.log`。JS 语法与 diff 检查通过。

## 11. 第六实施切片：远端验收与桌面整局诊断接线

- runtime 包复用既有资产核验机制，新增共享 composition 函数；核验当前 wrapper、
  native、上游版本及仓库补丁的构建回执。规则服务不依赖旧模型 preparation receipt，
  checkpoint/model/engine 仍只在模型评分时核验。desktop 与两个 CLI 共用此入口。
- 共享验收核心自行从 canonical 重放 self 与全部 response 边界，查询同一规则端口，
  将结果传入 full-game。删除调用方可传入的旧窗口列表，避免空列表或旧牌形预筛漏窗。
- 天凤、雀魂远端报告验收及 desktop main 整局诊断完成接线；缺资产按固定错误失败。
  main 在退出前关闭精确规则子进程与事实引擎。没有启动真人桌面验收或提交远端模型任务。
- 新验收摘要为 v2，带独立规则身份；历史 v1 产物不重写。没有增加架构层抽象或包依赖边。
  INV-002/004/007 的职责、绑定与证据由现有 schema、full-game 和新集成回归保护；
  唯一来源覆盖全部生产入口仍未完成，旧枚举尚未封存。

本切片验证证据仍在 `LOCALAPPDATA/RiichiCoach/spike-runs/libriichi-migration-dafb76f/`：

- `native-consumer-assets-red.log`：旧服务要求模型准备回执，5 项失败；新服务 6 项通过，
  覆盖缺模型资产及 native/补丁/版本/wrapper 被替换。旧 native 替换拒绝能力保持。
- `native-acceptance-red.log`：旧核心未查询规则端口，3 项均失败。最终集成夹具包含
  3 个受控候选（不是原生合法性 oracle）；完整集进入真实 helper 与验收分支，缺少
  未选动作但仍有两项评分时拒绝，规则错误也拒绝，两负例均不调用教学分析。
  初次绿测的普通弃牌夹具没有专项覆盖分支，已改为有效的含立直选项场景，未放宽门。
- desktop 2 项集成回归验证传入空旧窗口列表仍扫描他家舍牌和自己摸牌，分别记录
  原生单候选/非行动或全部规则失败。focused 共 14 项通过；共享来源一致性另 10 项通过。
- `native-consumers-weightless-probe.log`：真实 native 经共享资产服务，在模型权重和
  模型源码均不存在时返回完整 16 项预期动作。回执目录
  `libriichi-rule-probe-1790548622930`，明确 dirty、无 CPU 评分、无禁网声明；不代替最终 spike。
- 五门：build、architecture（7 包/427 文件/1926 导入/0 违规）、package-import 退出 0。
  typecheck 首次因新增测试缺 `modelTag` 退出 2，补全后整命令重跑退出 0。
  全量 Vitest 首次 2264 项通过、1 项在浏览器退出后清理临时目录遇到 Windows EPERM；
  未修改或跳过该测试，完整重跑 183 文件/2265 项通过，退出 0。
  日志为 `native-consumers-*`；四个受影响 JS 脚本语法检查通过。

仍待：其余 production/discovery 入口切换，动作表示兼容，雀魂真实来源证据补齐，
旧枚举退出与封存，大包持久化风险，以及最终提交真实 CPU 全语料与外部独立验收。
本切片提交后按当前代码运行真实 spike，不能继承 57a0a77 的结果或宣称目标完成。

## 12. 第七实施切片：语料发现改用原生规则

- dama 自摸发现器移除本地成和预筛、开放手排除及 helper 等待牌资格推导。
  先重放并查询全部 self 边界，再从成功完整规则结果筛选未立直且实际弃牌的自摸机会。
  实际动作只做对应检查，不能补候选。失败分类计数且继续扫描后续窗口。
- 天凤、雀魂和 bounded subset 三个 CLI 共用已有资产 composition；查询无需模型评分。
  每个命中保留规则结果 ID，聚合报告保存规则身份与失败类别。旧报告字段
  `needsHandStructureEngine` 改为 `needsRuleEngine`，历史产物不重写。
- 旧 helper 接口测试退出，新受控规则端口回归覆盖 12 种情形；包括副露自摸、
  post-call、立直两个阶段、七对子/国士、实际动作变化、未知证据和失败后继续。
  旧源码与测试的固定 blob 见 `docs/handoffs/2026-09-28-libriichi-rule-retirement.md`。
  未增加包、依赖边或架构层抽象；INV-002/004/007 的规则/教学职责及身份边界保持。

验证证据仍在 `LOCALAPPDATA/RiichiCoach/spike-runs/libriichi-migration-dafb76f/`：

- `native-discovery-red.log` 是旧函数签名不接受新规则端口的 6 项 RED（接口迁移证据，
  不冒充独立复现麻将合法性 bug）；源代码确认旧路径排除了副露手及本地非成和牌形。
- `native-discovery-integrated.log`：新发现器 12 项和聚合/语料策略 11 项均通过。
- 五门全部退出 0：typecheck、build、vitest（183 文件/2268 项）、architecture
  （7 包/427 文件/1929 导入/0 违规）、package-import。日志 `native-discovery-*.log`。
  四个 JS 入口语法检查及 `git diff --check` 退出 0。
- 实际执行 `node scripts/tenhou-discovery.mjs packages/tenhou-source/tests/fixtures/real-logs/bug1.xml --dama-tsumo --out <源码外新文件>`，
  复用已有 native 构建回执；四视角共 665 个 self 边界完成规则查询，0 规则失败，
  0 个目标自摸弃牌命中。输出 `spike-runs/native-discovery-1790550218884.json`；
  `native-discovery-real-cli.log` 记录每视角计数。此为工作树开发期真实规则 smoke，
  没有神经网络评分、没有禁网，不是最终代码提交的完整 CPU spike。

剩余仍包括单决策入口和旧 full-game 分支、其余旧规则退出、动作表示兼容、雀魂
真实来源缺失证据、大包持久化、最终提交真实 CPU 与独立验收；目标保持进行中。

## 13. 第八实施切片：单决策入口的规则绑定与退出接线

- `runMortalSingleDecisionReview` 强制注入规则端口，校验 canonical 快照后查询规则，
  再处理实际动作、单候选及报告锚定。未知/过期输入、查询失败、跨请求结果、实际动作
  不在集合中都明确失败；报告少一个未选动作也不能进入因素计算。
- 同一 request/result 传给已有 bound review；成功结果记录规则身份及请求/结果哈希。
  单候选不由报告行数推断。现有 bound review 的可选迁移分支尚未全部删除，本节不宣称
  所有 full-game/default 消费者已经退出旧规则。
- desktop 单决策诊断重新从 canonical 取得决策，忽略 acquisition 中的旧决策列表；
  v2 摘要带规则来源，主进程注入无权重服务，关闭精确规则子进程与 helper 后才 app.exit。
  没有启动用户手工桌面验收。七包边界不变，未增加架构层抽象。
- 原 13 项绑定测试改用明确的合成完整回合，保留历史样本的手牌和分数用于受控对照；
  未将历史 partial replay 标成 complete，也未修改真实 fixture。错身份、错手牌、
  重复/缺评分、错实际行动等拒绝断言保持；两项伪造 actual 的负例改在规则对应处拒绝。

验证日志位于既有源码外迁移证据目录：

- `native-single-red.log`：旧入口 6 项失败，未调用规则；unknown-input 情况仍返回 ready。
  `native-single-desktop-red.log`：3 项失败，旧传入空决策列表使规则查询为零。
- `native-single-focused.log`：5 文件/86 项通过，包含新增过期快照、单候选、原有绑定、
  desktop 接线/隐私和 60 项 managed runtime 生命周期/协议测试。受控规则集合只证明
  消费契约，不作为 libriichi 独立规则验证。
- 五门均退出 0：build、typecheck、vitest（185 文件/2278 项）、architecture
  （7 包/429 文件/1952 导入/0 违规）、package-import；日志 `native-single-*.log`。
  `git diff --check` 退出 0。
- 开发期一次聚焦命令误在仓库根执行，npx 取用临时 Vitest 5.0.2，不计入验收结果；
  其输出保留在 `native-single-binding.log`。根目录产生的 `.vite` 缓存已移至源码外。
  此后命令均在 coach/ 用已安装 Vitest 3.2.7 重跑。合成夹具的 self actor、dealer 和
  remainingDraws 初次不一致已修正；desktop 初次绿测使用旧 dist，完整 build 后重跑通过。

此切片没有重新运行真实 CPU spike 或禁网演练。剩余为 full-game 旧分支与其余规则
退出、动作表示、雀魂来源证据、大包持久化、最终完整 CPU 与外部独立验收。

## 14. 第九实施切片：新包只接受规则结果，黄金回归退出旧枚举

- 关闭 `buildStructuredAnalysisPackage` 的 v1 生产分支。新包必须有 native 规则结果、
  v2 schema 和对应引擎身份；无法通过删除规则字段、改标 v1 绕过规则来源。
  不改变已保存 v1 包的只读校验/展示，也不重新执行旧规则来读取它们。
- 包构建/校验的合成夹具改为先取得固定规则端口结果再进入 full-game，规则答案独立
  于被测报告。两个评分错贴负例在新规则证据校验处更早拒绝，保留精确失败断言。
- 旧 whole-game golden 的 partial 牌谱没有被补造历史或修改 completeness。
  四项黄金行为迁到完整天凤样本：当前 source mapper → 重建规则/评分请求 → 固定真实
  响应 → 真实 helper → full-game → v2 package/validator → selector。原 c1924
  教学纵向黄金回归保留。九种九牌的旧生产路径重复参数退出，native 的完整 16 候选、
  缺少流局原因、缺少未选动作、下游包与 helper 不被错误调用等断言全部保留。
- selector/context-graph 的旧版派生场景读固定 v1 JSON；输入由固定 `975d329` 旧夹具
  在 builder 改动前生成并校验，不是删去 v2 来源伪造旧包。只读数据不包含可执行规则。
  来源、SHA、封存 blob 和替代入口已登记；固定字节 JSON 使用既有 `.gitattributes`
  机制防止 Windows 换行转换改变回执哈希。
- 七包和特权依赖边不变，无新增架构抽象。INV-002/004/007 的规则来源、候选守恒与
  包身份由 builder/validator、合成负例和新真实输入黄金回归共同保护；full-game 的
  可选旧分支仍在，唯一来源全覆盖尚未完成。

实际验证（日志仍在 `LOCALAPPDATA/RiichiCoach/spike-runs/libriichi-migration-dafb76f/`）：

- `native-package-fixture-red.log`：旧合成链无规则来源，新断言失败。
- `native-package-builder-red.log`：去掉规则并声明 v1 时，旧 builder 未拒绝；修复后拒绝。
- `native-package-capture.log`：复用已有资产，重新完成 65 次原生规则查询和 22 次真实
  CPU 评分；43 个非行动结果，无规则/评分错误。采集处于开发工作树，dirty=true，
  网络开启，仅生成回归输入，不代替最终提交、六视角全语料 spike 或独立评审。
- `native-package-golden.log`：新四项黄金回归通过；22 评价全部 ready，43 个非行动
  单独记账，缺报告时 22 行全部明确缺失，重跑 hash/选择稳定，两个分歧 ID 固定。
- 五门实际退出 0：typecheck（最终 `native-package-typecheck-rerun.log`）、build、
  architecture（7 包/430 文件/1949 导入/0 违规）、package-import、全量 Vitest
  （185 文件/2279 项，`native-package-vitest-rerun.log`）。初次全量有 1 项旧九种九牌
  生产分支被新 builder 拒绝；按上述迁移后完整重跑通过。其余日志 `native-package-*`。
  `git diff --check` 退出 0。

仍待 full-game 旧分支和其他枚举退出、动作表示兼容、雀魂来源证据、大包持久化、
最终提交完整 CPU spike 与外部独立验收；本切片不能宣称 R14 或总体目标已通过。

## 15. 第十实施切片：整局和已绑定决策入口强制规则依据

- `runMortalFullGameReview` 删除旧 self/response 单候选证明和 ron 资格计算分支。
  规则结果为必需输入，先绑定完整 canonical 状态，再判断实际行动、单候选与报告覆盖。
  无规则输入、查询失败、篡改快照都不能继承旧豁免；每窗口失败仍累积进账本。
- `runBoundMortalDecisionReview` 同样强制规则依据，防止绕过单决策/整局入口后仅凭
  报告候选进入 ready。完整候选对应检查和规则来源输出改为无条件执行。
- 旧整局测试迁移为独立于报告的受控规则答案，保留身份、错行、重复/缺评分、单候选、
  响应分区与守恒断言。原 partial fixture 保持不变；合成完整回合明确标识用途。
  修改快照但不修改 canonical 的旧禁杠场景，在整局入口必须被拒绝，不能取得豁免。
  真实 native 规则与历史行为案例继续按既有专项/黄金回归验证，受控答案不自称牌理证明。
- 七包依赖边不变，未增加架构抽象；INV-002/004/007 由规则绑定和包来源链继续保护。
  固定封存基线、blob 与退出符号见 retirement 清单第 3 节。

验证日志位于既有源码外迁移目录：

- `native-fullgame-required-red.log`：旧入口缺规则时仍生成单候选豁免，新断言失败。
- `native-bound-required-red.log`：旧已绑定入口缺规则仍返回 ready，新断言失败。
- `native-fullgame-bound-focused.log`：4 文件/98 项通过；另 52 项适配回归通过。
  初次适配迁移的验收产物测试仍断言 v1，按新增规则来源改断言 v2，隐私字段断言保留。
- 五门本次完整执行均退出 0：`npm run typecheck`、`npm run build`、
  `npm run check:architecture`（7 包/430 文件/1951 导入/0 违规）、
  `npm run test:package-import`、`npx --no-install vitest run`（185 文件/2281 项）。
  日志为 `native-fullgame-final-*.log`。初次类型检查发现旧测试调用缺必需规则字段，
  完成上述迁移后整命令重跑通过；两项故意遗漏字段的负例显式模拟无类型调用。
- `git diff --check` 退出 0。本次未运行真实 CPU spike 或禁网演练；四项真实输入
  黄金回归通过不代替最终提交绑定的 CPU 全语料验收。

旧枚举函数及导出尚未全部退出；动作表示兼容、雀魂来源证据、大包持久化、最终提交
完整 CPU spike 和外部独立验收仍待完成。本切片不宣称总体目标或 R14 验收通过。
