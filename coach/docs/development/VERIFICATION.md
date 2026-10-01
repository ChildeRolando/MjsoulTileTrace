# 测试与发布门禁

## 日常门禁

在 `coach/` 运行：

```powershell
npm run typecheck
npm test
npm run test:package-import
npm audit --omit=dev
```

`npm test` 已包含 workspace build、全部 Vitest、协议 updater 测试、协议
compatibility 测试与**架构边界检查（`npm run check:architecture`）**。
检查器自测（`scripts/check-architecture.test.mjs`）由 Vitest 在 `npm test`
中自动发现执行，**不在全量门禁内重复运行**；`npm run test:architecture-checker`
是同一套测试的聚焦命令（node --test），供单独调试使用。

### 架构边界检查

`npm run check:architecture` 机械强制包依赖方向、renderer 安全边界与包内深导入
规则（规则与对应 INV-\* 见 `docs/development/INVARIANTS.md` 与
`docs/adr/0005-workspace-dependency-boundaries.md`）。新增/移动包、改动依赖方向、
新增 renderer 文件或包内深导入时，必须同步更新
`scripts/check-architecture.mjs` 的规则表与其测试。

### Golden vertical slice

`npm run test:golden` 运行唯一直立纵向回归路径
（`packages/reasoning/tests/golden-vertical-slice.test.ts`）：真实 fixture →
canonical 事件流 → 决策快照 → 确定事实 → 模型比较 → 打包 sidecar 因素管线 →
结构化分析产物。大改动后先跑它回答"语义主干是否仍在"。

### Local Mortal Runtime Production Spike

#### 2026-09-28 唯一来源重构验收（按候选提交验收）

[ADR-0006](../adr/0006-libriichi-single-legal-action-authority.md) 和
[新规格](../specs/2026-09-28-libriichi-legal-action-authority-design.md) 已取代本地
第二套合法动作检错要求。下文 R10–R13 对本地枚举/资格证明的描述是旧实现与
历史回归记录；保留行为反例，按唯一 libriichi 结果改写测试入口，不继续实现旧算法。
现有 v1 与历史回执不能证明迁移完成。

新包构建口现已要求 libriichi 规则结果与 v2 schema。`scripts/native-whole-game-golden.test.mjs`
从完整天凤 XML 重新映射，回放绑定的真实 native/CPU 响应，再运行真实 helper、full-game、
builder/validator 和 selector；覆盖 65 边界、22 个有评分决策、43 个非行动时点。
默认测试不运行 checkpoint，不替代当次 CPU spike。旧包只读兼容使用固定 v1 JSON；
来源与哈希见 `packages/reasoning/tests/fixtures/PACKAGE_FIXTURES.md`。旧 full-game
枚举分支已退出，具体职责及替代入口见
`docs/handoffs/2026-09-28-libriichi-rule-retirement.md`；退出检查不能代替当次真实验收。

实现验收必须包括：

- 真实 libriichi 无 checkpoint 规则查询；完整输入/规则配置与未知输入的分离。
- 所有适用事件边界均被扫描；规则集合先于实际动作对应，不受选择或评分影响。
- local/remote、模型请求、单候选证明和 full-game 复用一个内容绑定结果；旧包只读
  兼容，新包不接收旧枚举证明。规则来源与 checkpoint 来源分别校验。
- helper 的向听/进张/评分/结构/防守回归继续成立，但不再是合法集合的第二裁判。
- R10–R14 反例及正常对照；R14 全 11 项逐项验证，包括生命周期、JSON 序列化、
  模型来源、跨内容响应、动作表示交换和实际下游结果。
- 旧规则代码/导出/前置过滤退出所有产品与默认测试路径；封存清单、构建/打包检查，
  以及现有 architecture checker 的防回流负例。
- 从 coach/ 完整运行 typecheck、build、全量 Vitest、architecture、package-import
  五门和 diff 检查；最终代码提交绑定真实 CPU spike。逐例汇总失败和 degraded 原因。

新守恒检查证明规则结果在编码、传输、评分和下游没有丢失或错配；因为规则与模型
共用 libriichi，不将其称为两套独立规则的差分证明。固定案例预期须有明确规则依据，
不能由运行输出或封存枚举器自动生成。禁止缩小既有支持范围或恢复第二来源兜底。

仅规划/共识 Markdown 的提交检查链接、语义一致性、diff 和现有架构检查；不宣称
产品验收、不复用历史 PASS。实施提交仍执行上述完整门禁与真实 spike。
历史验收身份、结果、回执不因本次规划改变。

#### 现有运行入口与历史回归基线

ADR-0006 当前回归 owner：真实原生规则案例在
`packages/mortal-runtime/tests/runtime_rules_native_test.py`；输入与规则绑定在
`libriichi-rule-projection.test.ts`；评分对应在 `local-mortal-rule-scoring.test.ts`；
历史反例下游效果在 `native-action-regressions.test.ts`；完整真实来源的消费者回放在
`scripts/native-whole-game-golden.test.mjs`。Electron 持久化冒烟通过同一捕获夹具重算
v2 包后保存、独立进程重开，继续核验零来源/LLM 请求。捕获回放不是当次 CPU 推理。
原生测试需显式设置 `COACH_LIBRIICHI_NATIVE_MODULE` 为已验证的 native 路径，用既有
Python 执行上述测试文件；不下载资产，不加载 torch/model。
`check:architecture` 拒绝已封存模块原路径及静态导入；package-import 另查旧导出和生成
文件不存在。删除源文件后旧 dist 文件须清除，不能让增量构建保留可执行旧实现。
下文 R10–R13 的“本地证明/共享枚举”描述是历史基线，其行为反例迁至上述 owner，
不得恢复旧生产算法来满足旧实现专用断言。

[冻结规格](../specs/2026-09-24-local-mortal-runtime-production-design.md) 要求 COAC-111
长期提供两个显式入口：

```powershell
npm run prepare:local-mortal-spike
npm run test:local-mortal-production-spike
```

准备命令固定上游 revision，把 runtime/checkpoint 放入 gitignored app-managed artifact
目录并复验 SHA-256/license metadata；资产下载仅在显式准备步骤执行。测试命令必须再次校验 runtime、
checkpoint、protocol 与 adapter identity，用已准备的本地真实 `mortal-582500` CPU inference
运行脱敏雀魂 fixture → canonical/replay（self + response wave-1）→ candidate conservation →
strict `ModelEvaluation` → whole-game review → `StructuredAnalysisPackage` validator。

测试阶段不得下载缺失资产或调用远程推理替代；缺资产明确失败，不能 skip 后报 PASS。

ADR-0006 迁移后的 spike 使用独立 native build 回执：先用已有上游源码与 Cargo 缓存运行
`node scripts/build-libriichi-rule-native.mjs`，将产出的 `receipt.json` 绝对路径设为
`RIICHI_LIBRIICHI_NATIVE_RECEIPT` 后执行测试命令。已有模型 preparation receipt 继续
核验 checkpoint/model/engine；当前 wrapper 由仓库 manifest 核验，native 由固定源码、
补丁与产物回执核验，不要求覆盖旧准备回执或重新下载权重。

远端报告的新验收（`scripts/tenhou-acceptance.mjs`、`scripts/majsoul-acceptance.mjs`）
与桌面单决策/整局诊断也使用该 native 回执。单决策诊断 v2 摘要保留规则身份、
requestId/resultId；规则失败、输入快照过期或缺少未选动作不能返回 `review_ready`。
天凤/雀魂 discovery 的 `--dama-tsumo`
及 bounded dama subset 扫描使用同一无权重规则服务，按全部 self 边界查询后再筛选，
报告保留规则身份、命中结果 ID 和窗口失败分类；`needsRuleEngine` 表示是否尚未
执行该私有视角规则扫描。纯事件 census 仍可独立运行，不能把事件命中当作合法性证明。
`RIICHI_LOCAL_MORTAL_ROOT` 指定现有受管
Python 资产目录，缺省为 `LOCALAPPDATA/RiichiCoach/local-mortal-spike`；
`RIICHI_LIBRIICHI_NATIVE_RECEIPT` 指向当前构建回执，必要时可用
`RIICHI_LIBRIICHI_NATIVE_MODULE` 指定搬迁后的同哈希 native 文件。这些入口只查询
规则，不需要 checkpoint/model.py/engine.py，也不会自动下载。缺规则资产记录失败。
验收核心自行重放全部适用边界，不接受调用方裁剪后的窗口列表；新验收摘要使用
`mortal-acceptance-artifact/v2` 并记录规则身份。历史 v1 证据不改写。

spike 的规则查询、评分、单候选和 v2 package 消费同一原生结果。逐窗口及牌谱聚合失败，
有未完成/blocked/unsupported 结果时不报 PASS。每次输出新建于
`LOCALAPPDATA/RiichiCoach/spike-runs/production-native-<commit>-<timestamp>/`，末行给出
回执路径；可用 `RIICHI_LOCAL_MORTAL_EVIDENCE_ROOT` 指定输出父目录。回执 v3 记录
规则身份、模型身份、运行范围、失败及未运行状态；不覆盖旧 `production-spike-receipt.json`。
完整包证据按共享 canonical 序列分块导出，回执记录文件名、字节数与文件 SHA-256；
导出失败保留失败阶段，不把已完成推理视为整链通过。
R19 大包回归从本轮完整 CPU 回执选择最大原包；build 后运行
`npm run test:package-persistence-scale -- <production-spike-receipt.json> <工作树外输出目录>`。
该入口要求九个原视角并选择实际最大档案，核对全部字节哈希，在默认堆预算下
使用生产 repository 保存、关闭、新实例重开，核对包身份、决策、边界、选择及完整图
节点/边计数。2026-09-29 批准的自动候选对策略验证每个已分析决策恰有两个详细账本，
并记录完整模型候选数、详细候选数和差异数；不再要求新档案达到旧冗余体积。
2026-09-30 用户批准丢弃旧 5.49 GB 冗余档案，取消该档案的兼容/存储规模验收及
旧体积下限；规模入口只接受当前自动比较策略的完整新产物。旧日志与失败回执保留
历史身份，不要求恢复旧大档案。既有小型版本兼容回归继续保留。
不得增大堆、裁包或换小样本；最终代码仍须完整 CPU、九视角最大新产物及保存关闭重开。
默认快速测试另有受限堆短字符串读取回归。
`RIICHI_LOCAL_MORTAL_ACTORS` 筛选运行仅为诊断，即使所选项通过也不签发全量 PASS。
按冻结规格 §8 的 2026-09-26 用户批准修订，宿主网络可以保持开启，系统级禁网不再是
真实本地模型正确性验收的前置门槛。真实推理、候选守恒、下游 package 与最终提交绑定
等要求不变；历史 PASS 不替代当前提交的运行证据。

禁网演练独立记录离线可用性，不阻塞上述正确性验收。可选路线见
[Windows Sandbox 禁网 spike](WINDOWS_SANDBOX_SPIKE.md)：只读映射已准备资产、
保存禁网配置与运行前后网络状态。未运行或环境失败时标为“离线可用性未验证”；
配置生成、功能启用或普通环境 receipt 均不能记为禁网 PASS，也不能改写历史评审结论。

立直后暗杠的本地证明须与固定 runtime 的 Tenhou 非 strict 规则一致：比较杠前后可和牌种，
禁止杠掉等待牌；不要求所有分解共有刻子，也不要求等待形状或役保持不变。
`invariantClaims` 是结构事实，不能直接充当动作合法性条件。回归同时保留字牌、多分解数牌、
等待改变的反例、海底禁止暗杠/加杠，以及 full-game 模型评价路径。
河底响应在余牌为 0 且字段完整时禁止吃、碰、大明杠，保留合法荣和/pass；共享 response
枚举同时保护本地请求与 full-game 单候选证明。余牌未知不作为删除可能候选或豁免模型行的依据。
R12 回归补充吃入口的喰替后可弃牌检查、桌面四杠上限、开放手牌未选择的合法自摸、
多个暗杠/加杠的第二阶段身份与分数、海底/四杠后立直摸切的单候选证明，以及非立直
本人弃牌后的临时振听重置。focused 测试和真实 CPU 差分分别检查这些边界；
运行时第二阶段协议测试不加载权重，不能替代真实 spike。日志与新回执保存在源码外，
既有资产不重新下载，旧回执不覆盖。候选集合不依赖实际选择，也不按模型 mask 取交集。

R13 回归分别检查自摸/荣和的役语义（开放三暗刻实际弃牌与实际自摸）、
post-call 同牌唯一弃牌与两种弃牌、立直前已有四张且当前摸牌不同、非等待牌的确定不成立
与引擎失败的未知语义。候选与 post-call 单候选证明复用同一物理弃牌枚举；
开放自摸使用既有 completed-hand scorer 的 tsumo 语义，去掉宝牌/赤宝牌，
对未知风位逐一核验，不用实际动作回填，也不从模型 mask 删除候选。
运行时故障注入同时验证 ready 后关闭 stdin 的 EPIPE 被归类并能重启；
model/engine 从校验的源文件直接执行，绕过同名模块缓存与未校验字节码，
native 模块来源在执行前核验。真实 CPU 另测 native 目录中同名 model/engine 不被执行。
诊断矩阵逐例收集结果，不在首个反例停止；固定牌谱 spike 与故障注入都不是状态穷举，
历史反例不复发只能证明局部收敛，不能用每轮发现数量（受停止条件影响）证明总体收敛。

普通 `npx vitest run` 只跑 protocol fixtures/fake exact child，禁止联网或加载真实 checkpoint；
它覆盖 crash/timeout/protocol/candidate mismatch 与安全边界，但不能冒充 production spike。
**当前状态（2026-09-26，COAC-141）**：wave-1 覆盖计数只接受成功推理、候选双射、
同窗口 validated package 的 ModelEvaluation；未知荣和资格仍 fail closed。
此前六视角中 9 个舍牌荣和、1 个抢杠荣和及 3 个含荣和候选的 pass 窗口因资格未知
被跳过，真实 spike 正确以 exit 1 报告缺口。完整解析的真实 Tenhou mjlog 现在提供
`responseOpportunities=complete` 的历史证明；手牌、役、规则与振听仍逐窗口由事实引擎
核验，未知者继续跳过。现有脱敏 Tenhou 补充 fixture 已分别证明一例舍牌荣和、
抢杠荣和及含荣和候选的 pass，无需增加原始牌谱。

私有 discovery corpus 使用仓库现有 Tenhou 批量下载器新增 20 份公开牌谱，合计扫描
3,020 份原始 mjlog；2,504 份映射、2,467 份 canonical 校验、2,397 份重放通过。
失败分别为 mapper invalid event 147、断线不支持 369、canonical 校验 37、
重放 70；纯事件 census 命中舍牌荣和 12,637、抢杠荣和 3。这些数量只定位候选，
不替代资格证明或真实模型验收；私有下载映射与原始牌谱不入库。

真实 `mortal-582500` CPU spike 在干净提交上 PASS/0：716 次推理、六个 validated
package，全部必需 wave-1 实际分支 chi/pon/daiminkan/hora/pass/chankan 为
7/13/1/1/131/1，pass 候选族 chi/pon/daiminkan/hora 为 6/5/2/1；固定 runtime 错误均为 0。
部分非目标窗口仍为 degraded/blocked，本结果只关闭本规格的 wave-1 真实覆盖门，
不代表整盘所有窗口或 M8 发布条件均已完成。
receipt 必须绑定 clean tracked working tree 的实际完整 HEAD SHA；外部 GITHUB_SHA
若存在须与其一致。checkpoint、native runtime 和大模型文件不进入 Git、npm package
或普通五门；M8 再分发/notice/源码义务核验仍未完成。

#### PR #28 验收证据盘点（COAC-155）

历史盘点绑定 PR #28 的独立候选；该候选现已以 merge commit `dfc5361` 合入 `master`，
其最终 head `ddff078` 的独立评审结论为 `NO_P1_P2`。该结论只覆盖 COAC-111 的
runtime/真实 CPU spike 与既有五门，不替代本票的产品组合验收；本票新增提交仍须绑定
自己的 clean-tree 检查结果。

| 验收面 | 代码位置 | 测试或回执 | 对应提交 | 仍存在的缺口 |
|---|---|---|---|---|
| Runtime 与协议 | `packages/mortal-runtime/src/manifest.ts`、`packages/mortal-runtime/src/managed-runtime.ts`、`packages/desktop/src/local-mortal-runtime-service.ts`、`scripts/check-architecture.mjs` | `managed-runtime.test.ts` 覆盖五种资产哈希、严格帧、固定错误、启动/关闭竞态与 native 路径；`local-mortal-runtime-service.test.ts` 覆盖主进程组合与 preload 隔离；`npm run check:architecture` 检查导入边界 | PR #28 / `dfc5361` | 独立 `NO_P1_P2` 已记录；M8 再分发判断不属于本次验收。 |
| 候选合法性与守恒 | `packages/reasoning/src/analysis/local-mortal-adapter.ts`、`packages/reasoning/src/analysis/response-candidate-enumeration.ts`、`packages/reasoning/src/replay/response-furiten.ts`、`packages/reasoning/src/factors/furiten-merger.ts` | `local-mortal-adapter.test.ts` 覆盖 self/response 实际行动、赤五吃/碰、ron/chankan/pass 正例、舍牌/临时/立直振听及未知牌河/役/历史负例；`response-furiten.test.ts` 覆盖临时振听解除与立直振听持续；`response-binding.test.ts` 和 `mortal-full-game-review.test.ts` 覆盖单候选证明、未知阻断；`managed-runtime.test.ts` 覆盖候选双射负例 | PR #28 / `dfc5361` | COAC-111 结论已由独立 `NO_P1_P2` 覆盖；本票仍需 focused 产品组合回归。 |
| 真实端到端覆盖 | `scripts/local-mortal-production-spike.mjs`、`scripts/local-mortal-spike-proof.mjs`、`packages/reasoning/src/validate/structured-package-validator.ts` | `local-mortal-spike-proof.test.mjs` 拒绝虚计数；真实 receipt 必须同时满足同窗口成功推理、候选双射、validated package 的 ModelEvaluation。最终 head 回执为 796 次 CPU 推理、9 个 package，chi/pon/daiminkan/hora/pass/chankan 实际分支 7/13/1/10/145/1，固定 runtime 错误 0 | PR #28 / `dfc5361` | 非 wave-1 窗口仍可能 degraded/blocked；未独立执行系统级禁网演练，不将其冒充已验证。 |
| 证据与候选绑定 | `scripts/local-mortal-spike-proof.mjs`、`scripts/local-mortal-production-spike.mjs`、上述永久测试 owner | `local-mortal-spike-proof.test.mjs` 拒绝脏 tracked tree 与错误 `GITHUB_SHA`；receipt 的 `commit` 必须等于运行仓库完整 HEAD。历史阻断修复均已包含在 PR #28；对应回归进入上述测试 | PR #28 / `dfc5361` | 本票提交产生新 head 后必须重跑五门和 `git diff --check`；COAC-111 的旧 receipt 不得冒充本票产品 PASS。 |

#### COAC-106 B 当前产品组合候选

当前实现把 `share URL → canonical/replay → managed local Mortal → validated
StructuredAnalysisPackage → ReviewSession create/reuse → openReview(packageId)` 接入同一
Electron main composition root。`packages/desktop/tests/paipu-import-service.test.ts`、
`paipu-import-ipc.test.ts`、`review-session-persistence.test.ts` 与
`app-composition.test.ts` 覆盖安全 `review_ready` 身份、失败不导航及 Overview/List/Detail
到达；ReviewSession 以 `semanticContentHash` 区分同一 package 的 wall-clock 元数据重跑与
真正语义冲突，保留既有 immutable package/active report；规则 runtime error/unknown result
以及 fact-helper/analysis-assembly execution failure 经 production analysis owner 进入
`analysis_failed`，不保存 session 或导航，健康重试可重新进入 `review_ready`；合法
non-action、singleton 和其他忠实 degraded diagnostic row 仍保留。自动打开失败由既有 UI
leave/reset 回退：来源区保持可见、失败 Workspace 隐藏且清空，已保存 package/session
仍可重试；`app-composition.test.ts` 在真实 Electron DOM 断言失败可见性及不再导入的
健康重开，手动打开的错误提示契约保持。上述回归不宣称真实
Electron Golden Slice、独立产品 PASS 或
`DEMOABLE`。

### Session List Refresh（Integration Closeout C）

从 `coach/` 运行 `npx vitest run packages/desktop/tests/fixed-review-renderer.test.ts`。
既有真实隐藏 Electron 用例覆盖 complete/partial/evidence_only 生成后离开与即时列表更新，
并分别注入生成后一次列表读取失败：已保存 active report 保持、生成不被误报失败、
固定安全刷新提示、无重新生成，随后通过既有打开入口恢复列表。该 renderer 测试的
provider DTO 与已保存引用为模拟边界，不替代 D 的真实主进程、SQLite 与重启验收。

### MVP Electron Golden Slice（Integration Closeout D）

永久发布入口冻结为：

```powershell
npm run test:electron-mvp-golden
```

owner 为 `packages/desktop/tests/electron-mvp-golden-slice.cjs` 与
`packages/desktop/tests/fixtures/`。它必须使用真实 Electron main/preload/renderer、
SQLite、应用退出与新进程重启；account discovery 只可在 main adapter seam 使用安全 fixture，
Coach provider 必须 stub。默认 suite 禁止真实网络、账号和 provider。测试从 app shell 的
account select 或 share import 起步，不得从 `openReview()` 直接起步；离线重开必须先销毁
全部内存 graph/controller/provider state，再禁网/禁 LLM，并断言同一
`activeReportRefId`、judgment、explanation、provenance 与零请求。

**当前状态（2026-10-01，D stacked 候选）**：上述命令与 owner 已实现。测试从账号列表“分析”和分享链接“导入并分析”两个真实 app shell 按钮进入；使用 `packages/desktop/tests/fixtures/real-record-complete.json` 的脱敏真实原谱，经生产 schema、canonical/replay 后由 main 测试适配器裁剪为 actor 3 的 26 事件前缀（3 个 self、9 个 response 边界），再进入生产分析与 package/session 构建。`packages/desktop/tests/fixtures/native-rule-responses-actor3.json` 冻结对**同一前缀**用真实 native 查询得到的完整规则响应：self 候选 13/13/12，response 为 8 个 non_action、1 个 ok；每次请求除测试身份/requestId 外须与冻结请求完全一致，再重绑定 resultId，4 次可评分边界均进入评分链。模型 `scoreRules` 仍是按 native action index 排序的确定性测试夹具，不代表真实 Mortal CPU 推理。fixture 内的原始回执 SHA-256、原谱 SHA-256 和 canonical SHA-256 用于核对来源。

完整链涵盖 `complete` 且账号重复分析复用唯一 session，降级链涵盖 `evidence_only`；账号分析失败另断言不导航且 SQLite package/session 均为零；每条链在保存并退出后启动新 Electron 进程，在应用级网络拦截及无 provider 情况下从会话列表重开并核对 active report、judgment、explanation、provenance 与零请求。`--mvp-golden-child` 与 `RIICHI_MVP_GOLDEN_TEST=1` 同时存在时才加载 main 的 fixture 适配器，窗口保持隐藏；离线重开不加载该适配器。此测试不证明 OS 级断网或整份原谱都被分析。

本节只陈述候选上的永久门；独立评审、保护检查、依赖合并与真人 smoke 仍由 §7 分别确认，不能据此宣布整体 DEMOABLE。完整语义见
[Integration Closeout spec](../specs/2026-09-24-playable-review-mvp-integration-closeout.md)。

### Integration Closeout 固定五门

实现 A/B/C/D 的候选除 focused tests 和 Electron Golden Slice 外，统一运行：

```powershell
npm run typecheck
npm run build
npx vitest run
npm run check:architecture
npm run test:package-import
```

发布闭合还要求 fresh independent `NO_P1_P2`、代码合入及一次获授权的真人 smoke；真实
provider 不进入默认自动 suite。

## 按改动范围选择门禁

| 改动范围 | 最低 focused 门禁 | 合并前门禁 |
|---|---|---|
| contracts | 对应 contracts test + 所有直接消费者 test | typecheck、full、package-import |
| mahjong-soul-source | 对应 source test；协议改动额外 updater/compatibility | typecheck、full、package-import、audit |
| reasoning | 对应 factor/replay/assembly tests | typecheck、full、package-import |
| local Mortal runtime / adapter | protocol/lifecycle/conservation focused；真实模型改动额外 `prepare:local-mortal-spike` + `test:local-mortal-production-spike` | typecheck、full、architecture、package-import、真实 spike receipt |
| desktop IPC/UI | desktop focused、preload、security boundary | typecheck、full、package-import |
| 依赖方向 / renderer 边界 / 包内深导入 | `npm run check:architecture` + checker 测试 | typecheck、full、package-import |
| Go sidecar | Go focused + TS client/semantic tests | `go test ./...`、`go vet ./...`、full、重新打包/清单验证 |
| 静态课程 | 相关 Node test 与浏览器 smoke | 根目录完整课程门禁 |
| 文档 | 链接、命令和当前状态核对 | `git diff --check`；必要时实际运行示例 |

local Mortal 的 hash/fixture 变更还须在新建 Windows `core.autocrlf=true` worktree 中核对
wrapper 与两份 Tenhou XML 的工作树 SHA-256 与入库 manifest 一致，运行五门和真实 spike；
已有工作树的旧 CRLF 字节不能作为新 checkout 验收证据。

## Sidecar 门禁

修改 `coach/tools/mahjong-facts` 或其协议时：

```powershell
cd coach
npm run test:fact-engine
npm run build:fact-engine
npm run package:fact-engine
npm run test:fact-engine-reproducibility
npm test
```

提交前核对 packaged binary 的 size/SHA-256、manifest、adapter identity 和真实 golden 一致。不要只跑 Go 单测。

Go 构建输入由 `.gitattributes` 固定为 LF；Go build ID 包含源码字节，混合换行也会
改变最终二进制。可复现性门禁使用清单固定的 Go 版本，在临时 Git index 分别以
`core.autocrlf=true/false` 检出并真实重建，两者必须与发布 SHA 完全一致。
临时构建及回执保留在系统临时目录 `coach-helper-repro-*`，不改原工作树。

## 雀魂协议门禁

```powershell
cd coach
node scripts/update-mahjong-soul-protocol.mjs --check
node scripts/update-mahjong-soul-protocol.mjs --check-current
node --test scripts/mahjong-soul-protocol-compatibility.test.mjs
```

协议更新必须同时验证 official JSON、vendored proto、runtime RPC map、endpoint policy 和 compatibility report。网络失败、重定向、超限正文或字段漂移不得自动降级。

## 静态课程门禁

在仓库根目录：

```powershell
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
```

视觉或交互改动还需浏览器检查首页、课程、训练器和掌握度页面，并检查移动视口与控制台。

## 人类验收矩阵

自动测试不能代替以下外部事实：

| 能力 | 人类验收 |
|---|---|
| 雀魂首次登录 | 在官方国区页面由用户本人完成；确认应用只显示安全状态 |
| 跨重启恢复 | 关闭并重新启动应用，不打开登录窗即可恢复；身份错配必须清除 |
| 最近 30 场 | 与雀魂账号近期记录对照数量、顺序和规则过滤 |
| canonical mapper | 用脱敏真实牌谱逐事件对照雀魂回放，特别核对杠、荣和、流局 |
| 生产模型 | 对照固定模型版本的原始候选/分数，确认适配后排序与身份 |
| 完整 H1 | 登录 → 选牌谱 → 重放 → 模型比较 → 结构化报告，全程无秘密/原始数据泄漏 |

验收结果必须记录日期、版本/提交、固定状态、发现的问题和是否允许宣称完成；不要记录真实令牌或完整牌谱。

## 发布前检查

1. 工作树只含目标改动，`git diff --check` 通过；
2. living docs 与当前状态一致；
3. full/typecheck/package-import/audit 全绿；
4. sidecar、协议或 Electron 资源发生变化时，重新验证打包产物；
5. 所有外部依赖身份、许可和 hash 已固定；
   local Mortal 发布另须完成 runtime/checkpoint 再分发、attribution/notice 与源码义务核验；
6. 需要人类验收的能力已经验收，或 UI/文档明确标为未完成；
7. handoff 记录下一步，而不是用“后续完善”掩盖关键阻塞。

## 如何描述测试结果

优先写命令和通过/失败，不把测试数量当长期常量。数量只应写入带日期的 handoff；living docs 不锁定会迅速过期的测试总数。
