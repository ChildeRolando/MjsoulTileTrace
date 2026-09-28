# libriichi 唯一合法动作来源实施计划

日期：2026-09-28；状态：合法动作消费者已切换、旧枚举已封存；雀魂来源补全及 P4 未完成
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

## 16. 第十一实施切片：旧规则退出与行为回归迁移

基线 `57a41f8cdb25797d1e1ac15833b90374d7624787`，原支持范围保持。

- 删除旧 local adapter、response enumeration、single-candidate proof、response eligibility
  和仅供后者使用的 win-shape；删除旧导出。保留 native scoring/report 转换、helper 教学
  计算与旧 v1 包只读验证。没有新增生产抽象、包或依赖边。
- response replay 只扫描所有 wave-1 opponent discard/kakan；移除牌形资格预筛、
  legacy 模式和 actual-action 回填。测试先核对全部边界事件，再核对身份和实际行动。
- 原生回归补入历史立直/杠/海底/河底/食替/振听/和牌/赤牌/多分解反例及正常对照；
  native action identity 不允许重复。受控端口回归验证完整候选进入评分、整局、v2 包，
  单候选来源明确，输入 canonical/快照/教学事实不被改写。真实 native 与受控消费者
  分别检验规则能力和传递契约，不能合称独立双引擎验证。
- 旧函数、文件及测试的精确基线 blob、退出职责和替代关系见 retirement 清单 §4。
  已清除五个旧模块的本地 dist JS/声明文件；package-import 检查导出与生成文件不存在。
  既有架构检查新增 R5 拒绝这些原路径和静态导入；不宣称识别任意改名规则代码。
- Electron 持久化冒烟发现仍使用旧 response API/partial bridge，改用原生黄金测试共享
  的完整真实来源和捕获响应，经真实 helper 重算全部 22 个评价、65 个规则边界的 v2 包。
  保存/重开、A-B-A、损坏缓存、零来源/LLM 请求断言保留，不删除大包内容。

本切片日志在源码外
`LOCALAPPDATA/RiichiCoach/spike-runs/native-retirement-closeout-20260928-082818/`：

- `node --test --test-name-pattern='retired' scripts/check-architecture.test.mjs`：修改前退出 1，
  原检查器漏报恢复源码和测试/工具导入；修复后整份 checker 测试退出 0（74 项）。
  首轮实际架构检查错误地禁用了已迁移同路径的 dama discovery，退出 1；核对该文件
  只查询 native 后修正清单，最终 7 包/425 文件/1919 导入/0 违规，退出 0。
- `npm run typecheck`、`npm run build`、`npm run check:architecture`、
  `npm run test:package-import`、`npx --no-install vitest run` 均退出 0。
  最终 Vitest 184 文件/2219 项，package-import 2 项（包括无旧产物）；日志分别为
  `typecheck-final.log`、`build.log`、`architecture-final.log`、`package-import.log`、`vitest-final.log`。
- 用既有 Python/native 执行 `packages/mortal-runtime/tests/runtime_rules_native_test.py`：
  33 项及参数化子例通过，退出 0（`native-final.log`）。native SHA-256 为
  `5ff7f712a45c7288f739af7c7e0613567b467ee4ade2c66c0988e18982cdefad`，
  回执仍为 `88e5a0210896-1790544126466/receipt.json`；未构建/下载新资产、未加载模型。
- `npm run test:electron-persistence` **退出 1**：完整包/报告已保存，但独立 Electron
  重开子进程没有在原 30 秒限时内通过。单独诊断相同资料库的 `openReview` 耗时
  66,939 ms，证明桌面全包读回耗时超过原限时；原断言/限时未放宽，完整冒烟仍待修复重跑。
  不是源映射、native 或模型错误，也不能计为环境故障或 PASS。
- `electron-offline-diagnostic.log`：单独运行相同保存库的重开子进程最终退出 0，
  Overview/List/Detail/session 相等且来源/LLM 请求为零；不是完整冒烟 PASS 或系统禁网。
  再用原 30 秒 spawn 条件复现 `ETIMEDOUT`（30,130 ms、SIGTERM、status=null），
  回执为 `electron-timeout-diagnostic.json`。数据读回正确性与延迟问题分别记录。

当前切片未运行最终提交 CPU spike/禁网演练，未提交独立评审。
剩余为完整包持久化与桌面消费性能、雀魂原始来源缺失证据、最终完整 CPU 与外部独立验收。
五门和原生案例通过不能替代这些剩余要求，目标保持进行中。

## 17. 第十二实施切片：严格图校验与不可变读回复用

基线 `d19bcfd95fd57d8667e9550f8789fd50af287279`。

- 图校验先检查原始属性描述符，拒绝 getter、隐藏属性/toJSON、symbol、非 JSON
  值、稀疏数组及循环。与 package validator 复用已有检查逻辑；保留两处原本不同的
  negative-zero 口径。图 header/node/edge 逐条使用原严格 schema，保留身份重算、
  全局唯一、端点与分区校验，避免整图 stringify/parse 及完整 schema 副本。
- read-back 组合只完整校验一次最终图；有报告时由既有 append seam 校验全部
  evidence + overlay，无报告时校验 base。选择检查只查询决策存在性，详情引用只在
  已得出的同决策子图内解析，不为每个引用重建整图索引。
- SQLite 每次 read 仍验证实际字节 hash/schema/identity，构建新的既有
  ReviewReadBackContext，并深度冻结该次读回拥有的输入与图。controller 的概览/详情
  复用这一 context；报告更新/切换替换 context。没有按自报身份缓存校验结论，
  没有持久化图或把它送入 IPC，没有冻结 save 调用方的输入。
- 职责仍在 reasoning 的校验/组合与 desktop 的保存/展示 owner；未增加包、依赖边、
  规则来源或领域抽象。INV-011 的不可变复用条件及测试在原登记处补充。

本次日志：`LOCALAPPDATA/RiichiCoach/spike-runs/readback-fix-20260928-085722/`。

- `graph-red.log`：9 个新增边界用例在旧实现 3 失败/6 通过；隐藏 toJSON 被执行、
  getter 与隐藏属性未被拒绝。后续补充冻结/共享无环数据正例和 header/node/edge/数组
  严格性负例；`reuse-focused.log` 中图 30、包 58、读回 4、展示 17、保存 20，共 129 通过。
- `reuse-red.log`：旧保存路径未保留读回 context，新增回归退出 1；修复后验证深度
  不可变、不同读回得到不同 context、调用方不被冻结、磁盘损坏再次打开仍拒绝。
- 类型检查、构建、全量 Vitest、架构、package-import 最终均退出 0；全量为
  184 文件/2235 项，架构 7 包/426 文件/1921 导入/0 违规，包导入 2 项。
  首次 build 退出 2（新增类型引用遗漏），已修正并完整重跑，未隐藏失败记录。
- 同一已保存真实包（22 个评价、65 个规则边界）组合测量从此前约 38.6 秒降到
  `readback-profile.log` 的 16.1 秒；此时未跨层复用，完整 Electron 仍退出 1，
  重开子进程达到原 30 秒门槛（`electron-persistence.log`）。
- 接入不可变复用后，`reuse-cold-open.log` 的独立 Electron 子进程在原 30 秒条件下
  退出 0，总耗时约 19.2 秒，open 约 18.4 秒，Overview/List/Detail/session 与原值
  一致、来源/LLM 请求 0。这是应用离线读回诊断，不是系统禁网或完整冒烟替代品。

- `electron-final.log`：完整命令退出 0，真实包保存/重开、原 30 秒子进程限制、
  零来源/LLM 请求、kill recovery、A→B→A、迁移与坏缓存流程全部通过。
  最后补齐 selection 与冻结 context 的同对象绑定及 controller 三项身份核对，
  不改变报告内容；最终源码五门日志使用 `closeout-*` 前缀。
- `closeout-vitest.log` 曾退出 1：2234 项通过、1 项在账户目录测试 finally 清理
  临时 profile 时遇到 Windows EPERM，并非该测试产品断言失败。确认 Electron
  进程均退出后，原全量命令单独重跑 `closeout-vitest-retry.log`，184 文件/2235 项
  全部通过、退出 0；没有修改测试/重试次数/断言来绕过此次失败。
- `closeout-electron.log`：最后 selection 绑定修正后的完整
  `npm run test:electron-persistence` 再次退出 0；仍使用原 30 秒重开门槛，未复用
  上一轮 PASS。Electron 43.3.0 / Node 24.18.1，全部原有流程通过。

更大分析包的存储边界、雀魂来源缺失证据、最终提交完整真实 CPU spike 与外部
独立验收仍需完成。本切片未运行系统禁网验证，也未提交外部独立验收。

## 18. 第十三实施切片：完整分析包分块存储

基线 `66a38cf0c9063625d4f7bc48c2e868953185d4a5`。

- 既有 desktop repository 内增加 package 字节编码模块；完整 canonical JSON 分成
  64 KiB SQLite 块，父行保留版本头与全字节 SHA-256。写入仍与 session 同事务，
  读回核对全部块/长度/hash 后再执行原领域校验；没有裁剪账本、差异或 provenance。
- storage v3 前向迁移只增表和版本，不改旧 artifact 字节；旧 inline JSON 继续校验。
  新旧混合表示拒绝，失败写入回滚，删除通过外键级联。领域 schema、身份和两阶段
  report activation 不变；新库版本断言同步为 3，新版本拒绝负例同步为 4。
- 使用固定 MIT 依赖 `@streamparser/json@0.0.26` 做 main 内分块解析；一次读取内
  有界复用长字符串以控制重复证据 ID 的内存。无新增包、依赖边或领域抽象；
  M7-B §7、ARCHITECTURE 与 INV-012 记录表示及可执行检查。

证据目录：`LOCALAPPDATA/RiichiCoach/spike-runs/chunked-package-20260928-092437/`。

- `whole-package-red.log`：旧 `saveSession` 在禁止整包 JSON 字符串化时抛出
  `whole_package_string_limit`，退出 1；新路径 `whole-package-green.log` 退出 0。
- `mixed-storage-red.log`：旧新表示混用未拒绝，新增负例退出 1；加入读取拒绝后
  `chunks-focused-final.log` 为 2 文件/44 项全部通过，退出 0。覆盖 UTF-8/转义/特殊
  对象键、缺块/截断/篡改/多块、不可变、事务失败、迁移回滚和 session 删除。
- 已有真实 chankan 包 2,353,369,432 字节、122 个决策，实际执行解析、领域校验、
  序列化、35,910 块写入、读回、再次领域校验和完整 canonical hash 比较；
  `large-artifact-v2.log` 退出 0，约 191 秒，SHA-256 为
  `27d8e59dd256e15effe9f23a74c41b7659f1bfdd9d0038a0c97e0b4bec8cfc23`，与原文件一致。
  Node 24.15.0，仅启用 `--expose-gc`，未提高 heap 上限；本次网络未隔离、未运行模型。
  这证明完整字节存储和领域校验，不等同完整图/会话/renderer 验收。
- 首次 `large-artifact.log` 退出 1：诊断脚本误用不存在的 schema 字段，SQLite 参数
  绑定拒绝；修正脚本后从头完整重跑。原文件/回执未覆盖，未将该失败归咎产品或环境。

- `large-session.log`：同一包经实际 selector 后调用完整 repository `saveSession`，
  默认 heap 在保存期间耗尽，退出 134；未获得保存/重开成功回执。诊断未提高内存上限，
  未删减任何包/图字段。这是尚存的产品资源问题，不能记作环境故障；需要进一步定位
  保存校验、图构建与复制的内存峰值。字节存储通过不代表大包会话可用。

- 五个现有门禁本次全部实际退出 0：`npm run typecheck`、`npm run build`、
  `npx vitest run`（185 文件/2259 项）、`npm run check:architecture`
  （7 包/428 文件/1934 导入/0 违规）、`npm run test:package-import`（2 项）。
  日志依次为 `typecheck-final.log`、`build-final.log`、`vitest-final.log`、
  `architecture-final.log`、`package-import-final.log`；`diff-check-final.log` 退出 0。

- `npm run test:electron-persistence` 完整执行退出 0（`electron-final.log`），
  Electron 43.3.0 / Node 24.18.1。原真实来源完整 22 评价/65 规则边界包的保存/重开、
  kill/WAL 恢复、A→B→A、迁移、坏缓存与零来源/LLM 请求全部通过；原 30 秒
  独立重开时限不变。该夹具小于上述 2.35 GB 包，不替代超大包完整会话验收。

大包会话资源问题、最终提交 CPU 全语料、来源缺失证据、
外部独立验收仍未完成；不以分块存储通过替代整体目标。

## 19. 第十四实施切片：完整图的重复溯源路径与包副本

基线 `23ddecd08fb28498d7aa29dec726abece3a5bb0d`。上轮 2.35 GB 完整会话
默认堆耗尽是真实产品失败。本轮先测量，再在既有 projector/repository owner 修复。

- 源码外阶段诊断 `profile-baseline.log` 复现退出 134：图投影到第 40 个决策时，
  已有 6,890,484 条边，heapUsed 约 4.01 GB。包加载、校验、repository 整包副本、
  projector schema 副本分别记录；没有提高内存上限。
- `provenance-count-v2.log` 对全部 122 个决策计数：45,451 个因素、181,150 个差异，
  29,137,938 个溯源引用；其中 28,680,699 个 canonical-event 引用同时可由本节点
  自身引用的 fact_engine_request.sourceRefs 到达。初次计数脚本误用 ledger 字段名
  退出 1，修正后完整重跑退出 0；这是诊断脚本错误，不是产品失败。
- `compact-experiment.log` 是源码外可执行实验：保留全部 package、230,684 个图节点、
  所有节点 provenance 和结构边，只合并有明确两跳替代的直连；逐引用检查没有丢失，
  1,825,108 条边经原 graph validator 验证通过。Node 24.15.0 默认 heap、无 GC/内存
  参数，约 119 秒、退出 0。它不能替代生产完整会话和兼容验证。
- 生产 projector 只合并上述可证明重复的边；所有原始引用先解析，无替代路径、无关
  请求和缺失/重复输入不能借压缩得到豁免。M6-D1 的“逐条直接边”表示规则明确修订为
  完整可达证据集守恒；包、图节点/身份/来源/权威、非溯源边、请求 → 事件边保持。
  没有新增图数据库、投影入口、图裁剪、分析分支筛选或新架构抽象。
- repository 在完整 validator 已检验 schema 且拒绝归一化后直接使用本次拥有的读回
  对象；移除冗余整包 parse 副本。保存仍同步且不修改/冻结调用方，返回独立磁盘读回。
  validator 的 TypeScript 签名表达已有类型保证，运行时校验没有减少。
- `compact-red-final.log`：新反例在原 projector 1 失败/4 通过，失败为应合并的
  canonical-event 直连仍存在；首次回归中重复引用已被 schema 提前拒绝，修正负例
  预期为这一更早的拒绝位置。`compact-focused.log` 最终 5 文件/98 项通过，涵盖
  有/无两跳替代、重叠请求、坏引用、全部原证据闭包、图校验/切片和保存输入隔离。

日志目录：`LOCALAPPDATA/RiichiCoach/spike-runs/package-memory-20260928-1000/`。
- `large-session.log`：生产 repository 对同一 2,353,369,432 字节真实包完成完整
  selector、saveSession、关闭及重开，退出 0；122 决策、230,684 节点和 1,825,108
  边保留。总耗时约 524 秒，saveSession 约 331 秒、重开约 165 秒；阶段采样 RSS
  最大约 4.26 GB。Node 24.15.0，仅 `--expose-gc`，没有提高 heap 上限；显式 GC
  仅发生在关闭并释放首份输入/返回状态之后。该证据关闭原保存 OOM，性能仍偏重，
  不宣称已验证该超大包的 renderer/LLM 消费或系统禁网。
- `old-compat.log`：复制历史 `riichi-electron-real-main-chain-Km33hg` 的数据库及
  expected 文件到新证据目录，以现有 Electron offline-reopen-real 子进程运行；
  原件未改写。退出 0，总耗时 9,734 ms，保留原 30,000 ms 超时；旧报告概览、
  详情和 session 列表逐字节相同，来源/LLM 请求均为 0。此为应用读回兼容测试，
  不是系统网络隔离证明。
- 最终五门分别为 `typecheck-final.log`、`build-final.log`、`vitest-final.log`、
  `architecture-final.log`、`package-import-final.log`，退出码均为 0；185 文件/
  2267 项、7 包/428 文件/1934 导入/0 架构违规、2 项包导入。`diff-check-final.log`
  退出 0。
- `electron-final.log`：完整 `npm run test:electron-persistence` 退出 0；
  Electron 43.3.0 / Node 24.18.1，真实完整 22 评价/65 规则边界包、kill/WAL 恢复、
  原 30 秒独立重开、零来源/LLM 请求、A→B→A、迁移及坏缓存流程全部通过。
  未修改原测试阈值、裁剪 fixture 或把历史 PASS 计入本次结果。

最终提交 CPU 全语料、雀魂来源缺失证据、系统禁网可用性和外部独立验收尚未在本节
获得通过证据；不能宣称总体收口。系统禁网按现行规格单独记录，不阻塞正确性验收。

## 20. 完整 CPU 重跑及雀魂来源接入缺口（修复中）

第 19 节已提交并推送为 `c001113f0446e42056fde96ba87e791f36b99b7b`。
在该干净提交上实际执行完整 `npm run test:local-mortal-production-spike`，复用既有
模型与 native 回执、不下载资产、不筛选视角。`production-c001113.log` 退出 1；
新回执目录为 `LOCALAPPDATA/RiichiCoach/spike-runs/production-native-c001113f0446-1790562321102/`。
真实 CPU 推理 143 次、天凤补充包 2 份成功，失败 1951 条：雀魂四视角 1945 个规则
输入不完整、4 个无可分析决策、2 个最终覆盖缺口（暗杠及含大明杠候选的 pass 未命中）。
系统网络未隔离。该结果不能记为整体 PASS。

进一步从生产 mapper 与入口反查，确认不只是旧脱敏样本丢失杠宝牌：

- `canonical-mapper.ts` 固定输出 doraIndicators=partial、responseOpportunities=unknown，
  不投影后续 Record* 的累计 doras；即使完整新捕获也不会通过现有规则输入门。
- RecordGame 响应头里的规则元数据未传入 mapper，redFives 等固定为 unknown；
  需要在既有来源/摄取链中保留并绑定实际来源证据，不能默认填成标准规则。
- 旧真实样本被脱敏时已经丢失杠宝牌；当前临时捕获文件不存在。这一资料缺口与
  上述产品接入缺口分别处理，不能把全部失败归为环境原因。

诊断 `majsoul-readiness.json` 与以下日志均在第 19 节同一源码外证据目录。
新的来源回归先在旧实现 5 项失败（`majsoul-dora-red.log`）：公开指示牌丢失、
矛盾快照未拒绝。初步投影通过 mapper 局部测试后，新增完整回合 replay 回归发现
直接保留晚到快照的位置会触发 dora_kan_mismatch；构建前旧产物 3 项失败，构建后
初版实现 1 失败/2 通过，分别保存在 `majsoul-dora-replay-red.log` 和
`majsoul-dora-replay-prototype.log`。

本切片实现沿用既有 canonical/Tenhou 的杠后、岭上摸牌前指示牌位置：仅接收
该杠或杠者紧接的摸/弃牌快照，检查既有指示牌前缀、杠关联并去除重复快照。
不能把之后回合的知识前移；缺失指示牌继续 partial。`majsoul-dora-green.log`
3 文件/40 项通过，包含完整回合重放与两个决策分别看到的指示牌；真实旧夹具
仍明确 partial。这些合成传输/重放回归不是新的真实来源覆盖证明。

进一步完成同类分支及来源历史证明：

- mapper v3 仅在所有观察到的回合都有终局时声明响应历史完整；中途截断、此前回合
  未闭合不会被最终一局的终局掩盖。它只证明来源序列，规则查询前仍通过完整 replay
  的阶段/玩家/物理牌校验。规则配置继续 unknown，未猜测标准配置。
- `majsoul-history-red.log` 的完整回合在旧实现失败（固定 unknown），未闭合对照通过；
  新实现在 `majsoul-history-green.log` 通过 39 项。
- 大明杠分支原先未设置 rinshan 标记；`majsoul-daiminkan-red.log` 两项失败：补牌
  被错误标为 live_wall、弃牌才发布宝牌时映射被拒绝。修复后包含三个杠种、宝牌重复/
  前缀变化/缩短/无杠增长/其他玩家/弃牌后晚到、跨局缺失的源回归通过。
- 新 `majsoul-dora-replay.test.ts` 六项运行真实 mapper 和完整回合 replay，断言所有
  自视角决策及逐决策宝牌；包括吃碰后弃牌与之后加杠，确认此前决策不受新宝牌污染。
  这些合成协议输入不替代真实 CPU 或真实来源语料。
- 当次五门 `majsoul-v3-{typecheck,build,vitest,architecture,package-import}.log` 均退出 0；
  全量 186 文件/2292 项，架构 7 包/429 文件/1939 导入/0 违规，package-import 2 项。
  命令、时间、退出码汇总在同目录 `majsoul-v3-gates.json`。没有沿用 c001113 的门禁。

变更控制：仅 source mapper、源测试与跨包 replay 回归，沿用现有 canonical 事件和
完整性字段，无新抽象/依赖边。INV-001/003/004 的来源、可见状态、动作身份边界仍由
mapper/replay 回归与架构检查执行；原始 bytes hash 与 mapper v3 绑定归一化结果。
缺失/矛盾证据不补造；引擎规则和模型协议本切片未变。

剩余为来源规则元数据传递、完整原始雀魂资料、最终提交 CPU 全语料和外部独立验收。
这次来源修复的五门成功不解除旧真实样本缺宝牌和规则配置的阻塞；未执行禁网演练，
未宣称真实 CPU 或 R14 总体通过。

## 21. 雀魂规则证据在下载、捕获和缓存中的传递

原 `fetchGameRecord` 响应的 `head.config` / `head.standard_rule` 在进入 mapper 前
被丢弃；仅有内部 `GameDetailRecords` bytes 无法恢复这些配置。本切片在现有 source
边界提取窄规则证据，绑定 recordId、内部 bytes SHA、归一化配置 SHA；fetch 与官方
客户端捕获共同使用同一提取器，desktop 只转交，不解释雀魂规则字段。
mapper v4 把证据纳入来源身份。无头信息、跨牌谱/字节、畸形证据分别保留 unknown
或拒绝，不从实际动作、模型候选或目录名称反推规则。

配置投影的依据与边界：

- 固定协议的 `RecordGame`、`GameConfig`、`GameMode`、`GameMetaData` 定义字段。
  protobuf 缺省字段先正规化，显式缺省值与省略值在两条摄取路径中身份一致。
- 仅 `standard_rule=2`、category=2、mode=2、段位模式 ID 3/6/9/12/16 且无自定义
  规则/AI/试验/房间/比赛配置时投影四人南风标准档。模式 ID 的来源是
  [tensoul 固定数据](https://github.com/Equim-chan/tensoul/blob/f840fae039b52e7af8afa436fd1a2808eb20bc80/data.json)，
  赤牌缺省与自定义配置的区别参照同提交 `convert.js`。这是来源配置识别，不是动作枚举。
- [雀魂官方 FAQ](https://mahjongsoul.com/faq/) 的公开接口
  `https://mahjongsoul.com/api/faq/list` 在本次查证中提供：通常三枚赤牌分别属于三门；
  四人半庄南四最高分不足 30000 时西入并在达到阈值后结束；采用役的断么九没有门清
  条件，一发说明要求期间没有吃碰杠。食断和暗杠消一发的投影依据这些规则说明；
  不声称 FAQ 给出本项目所有规则字段的完整机器协议。
- 未找到足够的同源头跳证据，因此 `atamahane` 仍 unknown，整体 ruleSet 只标 partial。
  缺失/陌生/自定义配置全部保持 unknown，禁止用该档替代尚未取得的实际响应头。

现有 privileged raw cache 改用 `game-detail-records/v2` 保存牌谱 bytes 与绑定证据，
严格验证 envelope、base64、recordId 与 bytes hash。缓存键版本升级；旧 v1 原始缓存
不冒充带规则证据的新缓存，旧正式复盘包仍按既有只读路径展示。没有新增存储 owner。

回归先于实现：`fetch-rules-red.log` 两项证明旧 fetch 丢失头配置/未拒绝错误头身份；
`mapper-rules-red.log` 三项证明旧 mapper 忽略证据；`rule-convergence-red.log` 证明
官方捕获到共享回放的路径丢失证据。新回归覆盖配置档/未知档、getter/额外字段、跨来源
绑定、fetch 与 CDP 捕获、URL 导入，以及真实 SQLite raw cache 写入、关闭、重开后的
同一 canonical 与 replay。这里使用真实回合 bytes 加明确合成的响应头验证接线，
不能作为新的真实雀魂捕获或 CPU 整库验收证据。

本轮证据目录为 `LOCALAPPDATA/RiichiCoach/spike-runs/source-rules-20260928-1108/`；
官方 FAQ 和固定 tensoul 数据的本地查证副本及先失败/后通过日志均在该非源码目录。
首次缓存集成测试因未按生产顺序初始化既有数据库而失败（`cache-rules-green.log`），
修正测试初始化后 `cache-rules-green-v2.log` 九项通过；没有降低缓存拒绝条件。
完整五门、真实规则接线检查与提交身份在后续回执记录，不能继承前一切片 PASS。

变更控制：source 拥有外部协议与缓存编码，desktop main 转交已绑定数据；沿用既有
canonical RuleSetV2、分析 store 和 raw cache，不增加依赖边。INV-001/003/004/007
由来源负例、双路径/重开回归、请求内容绑定及架构门约束。规则引擎、模型评分和
helper 教学计算均未改动。仍需完整原始雀魂资料、最终提交 CPU 整库及外部独立验收。

本切片实际验证：

- `rules-final-gates.json` 记录五门及 diff 检查的完整命令/时间/退出码，全部退出 0；
  Vitest 189 文件、2325 项；架构 7 包、433 文件、1973 导入、0 违规；package-import 2 项。
- `rules-electron.log` 中完整 `npm run test:electron-persistence` 通过 Electron 43.3.0
  的真实 main/package 保存重开、恢复、A-B-A、旧包迁移和零来源/LLM 请求检查。
  该测试的应用层请求拦截不是操作系统禁网证明。
- `source-native-probe.mjs` 以现有 native 构建回执校验资产，故意配置不存在的模型
  目录，经真实 fetch/mapper/replay/规则收集器查询同一回合四视角：128 个边界，
  43 个可行动、85 个 non-action、0 错误。没有加载权重或修改原始 fixture；响应头
  明确为合成输入，回执标为接线验证，不能替代最终真实 CPU 与完整原始资料。

## 22. 诊断、捕获产物与离线语料入口的同一规则证据

第 21 节已提交/推送为 `362ea6bd633b700f692914f5eeb6b1909fe28931`。随后在干净
提交上完整运行 CPU spike，未筛选视角：143 次推理、2 份天凤完整包；整体退出 1，
1951 条失败仍为雀魂四视角 1945 个输入不完整、4 个无可分析决策、2 个覆盖缺口。
回执为 `LOCALAPPDATA/RiichiCoach/spike-runs/production-native-362ea6bd633b-1790566451900/production-spike-receipt.json`。
普通联网环境，无系统级隔离；不是整体 PASS，也不继承此前真实通过记录。

进一步沿输入消费者发现：desktop 的 replay acquisition、replay audit 和捕获诊断
仍只转交 bytes；捕获到磁盘的旧 `.pb` 也不能包含响应头证据。三个先失败回归在
`diagnostic-rules-red.log`，修复后两条 fetch 诊断和捕获映射都传递同一证据。
捕获诊断除原有 inner bytes 外，保存唯一文件名、`wx` 写入的 `game-detail-records/v2`
文件，结果的 `recordCachePath` 给出路径。该文件仅含牌谱字节与窄配置证据，不含
账户清单或令牌；再次运行不覆盖它。请求 recordId 与捕获身份不同则在写入前拒绝。

离线入口通过显式 `--input-format record-cache` 使用现有 source decoder，普通旧
inner 输入仍支持，缺规则保持 unknown。decoder 可从已严格校验的 envelope 读取
独立捕获身份；生产 raw-cache lookup 继续传入预期 recordId 并强制匹配。
没有在各 CLI 复制协议解析器或猜测文件类型。

- `majsoul-discovery.mjs` 的普通 census 和原生规则发现都传入绑定规则；输出仍使用
  输入内容的哈希，不泄漏原始 recordId。带规则的输入身份包含其证据。
- `majsoul-acceptance.mjs` 同样传入证据；损坏绑定在本地分析前以固定错误拒绝。
- `generate-mahjong-soul-real-fixtures.mjs --input-format record-cache` 保留实际捕获的
  窄规则字段，脱敏后重新绑定合成 recordId 和新 bytes hash；输出 fixture v2。
  原有无元数据 v1 的再生成行为不变。生产 spike 转交 fixture 内证据，不补默认配置。
- `fixture-rules-red.log` 证明原生成器丢失规则；`cli-rules-red.log` 三项证明旧 CLI
  无法使用带证据捕获；`capture-cache-red.log` 证明原 decoder 不支持独立捕获入口。
  修复后 focused 回归覆盖证据保存/重开/不覆盖、跨记录拒绝、脱敏身份重绑、未知原始
  输入和两个 CLI 的损坏证据拒绝。所有输入头仍明确为合成测试数据，原真实资产未修改。

变更控制：补齐既有 diagnostic/CLI/fixture owner 对同一 source 数据的传递，复用
第 21 节的 cache codec，无新包或新的规则计算。INV-003/004/007 的来源边界、身份
与可复现约束由负例、实际 CLI 和原生查询检查。完整资料与最终外部验收仍未完成。

当次验证记录仍在第 21 节证据目录：`capture-final-gates.json` 的全部五门与 diff
检查退出 0；Vitest 190 文件、2334 项，架构 7 包、434 文件、1987 导入、0 违规，
package-import 2 项。`capture-focused.log` 的五文件 35 项通过（其后增加的跨记录
捕获拒绝用例由上述全量门覆盖）。`capture-native-discovery.log` 实际调用新 CLI
与已有 native 资产：合成头捕获文件四视角共 32 个 self 边界完成分类、0 引擎错误，
没有神经网络推理，也不把 0 自摸命中称为自摸覆盖证明。

## 23. COAC-165 / E15-P2-1：保留杠宝牌的来源发布时间

外部 round 15 审查固定提交 `04b4e7b7e50bd93740e86063ef85170d54299a01`，结论为
ENVIRONMENT_BLOCKED，确认一项 P2：弃牌记录首次公布的新宝牌被移动到此前摸牌。
同轮五门、R14 补充 native/CPU 回归、2.35 GB 包保存重开通过；完整真实 CPU 命令
退出 1，原始雀魂规则头和后续宝牌资料仍缺失。原评审及回执未改写。

实现先落 `scripts/kan-dora-chronology.test.mjs`：旧实现两个断言失败，分别是后续
新宝牌进入早先快照，以及来源引用错指到杠记录。天凤真实 `bug1.xml` 的 DORA
位置/来源反例也先失败。证据在源码外
`LOCALAPPDATA/RiichiCoach/spike-runs/dora-timing-20260928/`。

改动 owner 为两个 source mapper 和既有 canonical replay：

- 雀魂累计 doras 的新增项保留实际披露记录，kanEventRef 独立保留关联；揭示事件
  在同一 draw/discard 记录中的子事件位置明确，不再反插到先前事件。mapper v5。
- 天凤 DORA 保留原 tag 顺序与引用；删除为了前移宝牌而缓冲岭上摸牌的代码。mapper v2。
- 回放校验保留尚未公布指示牌的杠关联，允许同一回合稍后揭示；跨回合、重复、错误
  关联与缺失完整来源的检查仍在。实际动作扫描越过公共揭示事件，避免漏掉后续弃牌。
- 更新原来认可前移的测试期望；保留完整集合/实际行动和来源断言。R15 指定的
  `majsoul-dora-replay.test.ts` 增加两份只在未来宝牌不同的对照：此前 public/private
  状态及规则事件前缀相同，完整来源内容身份仍不同。

INV-003/004 的来源及决策绑定边界由 mapper、canonical validator、跨来源时序回归
和原生请求前缀回归执行；没有新包、依赖边或第二套合法动作判定。移位后更新的
native golden 使用现有 native 和 CPU checkpoint 重新采集 65 边界/22 评分，原 XML
未改动。采集时 HEAD 为上述提交且 dirty=true，不称为最终提交全语料验收；新旧哈希
和来源在 PACKAGE_FIXTURES.md 中登记。旧包只读数据没有重写。

聚焦运行：4 文件 115 项通过；R15 指定两文件 48 项通过；时序与完整黄金下游 8 项
通过。复跑 reviewer 的来源探针（仅改 import/输出路径）后，两份未来宝牌对照的
此前快照均只有旧宝牌，真实 native 各 5 ok/3 non_action；另一个未确认为 finding
的抢加杠构造仍由既有 win_source_mismatch 拒绝，未宣称该分支已修复。
完整五门和提交后真实 CPU 回执需另行记录，不能继承 round 15 的结果。

本次完整门禁实际记录在同目录 `gates.json`：typecheck、build、全量 Vitest、
architecture、package-import、diff-check 全部退出 0。Vitest 为 191 文件/2340 项；
架构检查 7 包/435 文件/1996 imports，0 违规。`electron-result.json` 记录本次
Electron 43.3.0 实际 main 链、22 决策/65 规则边界的包保存重开、崩溃恢复、
A-B-A 与迁移测试退出 0；其零请求检查不是操作系统禁网证明。
上述均为实现侧验证；当前缺失真实雀魂完整来源的问题仍在，提交后的全量 CPU
及下一轮外部独立验收另外绑定提交，不把这些门禁视为验收 PASS。

## 24. COAC-166 / E16-P2-1：终局不能吞掉必需杠宝牌的缺失

R16 对 `f5be17f5d75991455d0d2689b05ddfdf5c22324b` 的独立结果为
ENVIRONMENT_BLOCKED，确认 1 项 P2：暗杠后删除 DORA，再岭上自摸闭局，来源仍
声明完整；真实 CPU、full-game 和 v2 包错误接受。五门、E15 时序对照和完整
2.35 GB 包保存/关闭/重开通过，但原 CPU 仍因雀魂来源资料缺失退出 1。
原报告及探针只读保存在 `coac-166-review/coach/.review-loop/coac166/`。

本次修改：

- 天凤 mapper v3 在每局结算及下一局重置前检查未揭示杠的来源证据；必需揭示缺失
  时标记整流 doraIndicators=partial，不从终局打点信息补造指示牌。
- canonical validator 在暗杠岭上自摸、杠后弃牌被荣和及补牌后的流局入口检查
  complete 声明；缺失揭示时返回 dora_kan_mismatch，不能被终局 EOF 例外放过。
- 保留抢杠、补牌前四杠/三家和终止、明杠立即岭上自摸的不同语义。天凤的暗杠即开、
  明杠/加杠在打牌或后续岭上前揭示依据为 [官方手册](https://tenhou.net/man/)；
  本次是来源完整性校验，不增加本地合法动作枚举，也不重新前移 DORA。
- `scripts/kan-dora-terminal.test.mjs` 覆盖完整/缺失暗杠 tsumo 与 ron、伪 complete、
  native 请求前阻断及 full-game/package 的 analysis_blocked 记录；不签发单候选。
  canonical validator 既有 owner 增加终局、延迟揭示、抢杠和流局时点回归。
- mapper 版本改变后使用现有真实 native/CPU 重新采集黄金输入：65 边界、22 次
  评分；源 XML 不变，旧样本/采集证据保留。见 PACKAGE_FIXTURES.md。

证据目录：`LOCALAPPDATA/RiichiCoach/spike-runs/r16-terminal-dora-20260928/`。
`regression-red.log` 在修复前 5 项全部失败：错误 complete、validator 错误 valid、
以及 native 端口实际被调用 2 次。修复后最初 9 文件/124 项聚焦通过；增加合法
延迟对照后的 `focused-v3.log` 为 2 文件/32 项通过。R16 原探针仅更改模块位置与
负例预期，`reviewer-missing-dora-current.log` 的完整对照完成真实 CPU→helper→
full-game→v2 包，12 候选、analysis_ready；缺失版本 partial、2 个规则边界拒绝、
native 调用 0 次。

首轮五门全部执行，Vitest 192 文件/2352 项通过，architecture 因新测试深导入内部
策略函数退出 1。删除该导入，直接给测试固定 policy 输入，没有放宽架构检查器。
修正后全部原门禁重新执行，六项均退出 0，结果见 `final-gates.json`；旧失败日志保留。
最终全量 Vitest 为 192 文件/2354 项，架构为 7 包/436 文件/2001 imports、0 违规。
`electron-result.json` 记录本次 Electron 43.3.0 完整命令退出 0，22 决策/65 规则边界
的分析包保存重开、kill 恢复、实际 main 链零来源/LLM 请求、A-B-A 与迁移通过。
最终提交绑定的完整 CPU 和下一轮独立验收另行记录；真实雀魂资料缺口未解决，
禁网未执行，不能由本次反例通过推断完整验收完成。
