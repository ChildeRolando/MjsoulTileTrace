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

盘点起点为 live base `efc40f02591a36ba4a63072f6d8f31ca097e050d`、head
`c2317a33e7d8268dfccf8b7a611ca6e1e4bde236`；仍使用原 COAC-111 admission，
不增加功能或验收条件。表中列出的既有提交均为该 head 或其祖先；本表落盘后的新 head 须重新绑定
clean-tree spike receipt，不能沿用旧 head 的 PASS 作为新提交的评审结论。

| 验收面 | 代码位置 | 测试或回执 | 对应提交 | 仍存在的缺口 |
|---|---|---|---|---|
| Runtime 与协议 | `packages/mortal-runtime/src/manifest.ts`、`packages/mortal-runtime/src/managed-runtime.ts`、`packages/desktop/src/local-mortal-runtime-service.ts`、`scripts/check-architecture.mjs` | `managed-runtime.test.ts` 覆盖五种资产哈希、严格帧、固定错误、启动/关闭竞态与 native 路径；`local-mortal-runtime-service.test.ts` 覆盖主进程组合与 preload 隔离；`npm run check:architecture` 检查导入边界 | `43477b8`、`cea3662`、`608ba4f`、`d4e7687` | 无已知 COAC-111 实现缺口；M8 再分发判断不属于本次验收。 |
| 候选合法性与守恒 | `packages/reasoning/src/analysis/local-mortal-adapter.ts`、`packages/reasoning/src/analysis/response-candidate-enumeration.ts`、`packages/reasoning/src/replay/response-furiten.ts`、`packages/reasoning/src/factors/furiten-merger.ts` | `local-mortal-adapter.test.ts` 覆盖 self/response 实际行动、赤五吃/碰、ron/chankan/pass 正例、舍牌/临时/立直振听及未知牌河/役/历史负例；`response-furiten.test.ts` 覆盖临时振听解除与立直振听持续；`response-binding.test.ts` 和 `mortal-full-game-review.test.ts` 覆盖单候选证明、未知阻断；`managed-runtime.test.ts` 覆盖候选双射负例 | `fbe5a9b`、`696f017`、`c2317a3`、本盘点提交 | 当前 focused 回归无失败；独立评审尚未对新 head 给出 PASS。 |
| 真实端到端覆盖 | `scripts/local-mortal-production-spike.mjs`、`scripts/local-mortal-spike-proof.mjs`、`packages/reasoning/src/validate/structured-package-validator.ts` | `local-mortal-spike-proof.test.mjs` 拒绝虚计数；真实 receipt 必须同时满足同窗口成功推理、候选双射、validated package 的 ModelEvaluation。`c2317a3` 回执为 716 次 CPU 推理、六个 package，chi/pon/daiminkan/hora/pass/chankan 实际分支 7/13/1/1/131/1，固定 runtime 错误 0 | `580da93`、`263c666`、`8a75020`、`c2317a3` | 非 wave-1 窗口仍可能 degraded/blocked；未独立执行系统级禁网演练，不将其冒充已验证。 |
| 证据与候选绑定 | `scripts/local-mortal-spike-proof.mjs`、`scripts/local-mortal-production-spike.mjs`、上述永久测试 owner | `local-mortal-spike-proof.test.mjs` 拒绝脏 tracked tree 与错误 `GITHUB_SHA`；receipt 的 `commit` 必须等于运行仓库完整 HEAD。历史阻断修复 R1/R2→`cea3662`/`fbe5a9b`，R3→`608ba4f`/`d4e7687`，R4→`696f017`，R5→`580da93`/`8a75020`，R6→`c2317a3`；对应回归进入上述测试 | `580da93`、`8a75020`、`c2317a3`、本盘点提交 | 文档提交产生新 head 后必须重跑五门和真实 spike，核对远端 SHA；第六轮 BLOCKED 及第七轮禁令不因本表改变。 |

### MVP Electron Golden Slice（Integration Closeout D，待实现）

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

**当前状态（2026-09-24）**：该 package script 与 test owner 尚未实现，命令不可运行，
不得报告 PASS。D 实现票负责添加二者并删除本 pending 标记。完整语义见
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
npm test
```

提交前核对 packaged binary 的 size/SHA-256、manifest、adapter identity 和真实 golden 一致。不要只跑 Go 单测。

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
