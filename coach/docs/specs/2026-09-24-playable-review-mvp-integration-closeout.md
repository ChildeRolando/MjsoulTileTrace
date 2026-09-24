# Playable Review MVP Integration Closeout 实现规格

日期：2026-09-24  
状态：**SPEC READY；A/B/D 尚未实现，C 修复已在 PR #23 通过独立评审但尚未合入 `master`**  
父目标：Playable Review MVP v0.1

## 1. 权威、现状与范围

本规格只冻结现有 M5/M6/M7 能力在 Electron composition root 的最终接线与发布验收，
不重开它们的架构：

- M7-A 的 Overview → List → Detail、`selectedCount`、renderer-safe DTO、首次生成与
  `partial | evidence_only` 语义由
  [M7-A owner](./2026-09-21-m7-a-whole-game-fixed-review-ui-design.md) 持有；
- M7-B 的 `ReviewSession`、唯一 package ownership、`activeReportRefId`、离线重开、
  immutable artifacts 与 raw cache 边界由
  [M7-B owner](./2026-09-21-m7-b-review-session-persistence-design.md) 持有；
- StructuredAnalysisPackage、selector、ReviewReport、judgment/explanation/provenance
  及其 validators 仍由既有 contracts/reasoning owners 持有；
- 本规格拥有 account/import 入口到既有分析与 Review Workspace 的组合语义，以及
  MVP Electron Golden Slice 的发布门。它不复制上述 schema、算法或持久化规则。
- manual-import 的生产模型前置由
  [Local Mortal Runtime 生产规格](./2026-09-24-local-mortal-runtime-production-design.md)
  持有：managed local Mortal + `mortal-582500` 是批准的 M6 native runtime path；本规格
  只在其真实 spike 合入后消费 validated `StructuredAnalysisPackage`，不实现 runtime。

`master` 已包含 M7-A/M7-B（PR #17 / #22），但真人 smoke 证明“内部能力完成”不等于
“真实应用入口已接通”：账号页把同步失败伪装为空目录；手动导入成功只显示决策点数量，
没有创建/复用 session 并进入 Review Workspace。MVP 因此仍为 **not demoable**。

COAC-100 已持久化 `R5-P3-1`，原提交 `cfa2b815` 的等价 normal-polish 提交
`31100bd089aeff296e04f246342c65732d480bdf` 位于 PR #23。该 PR 当前为 OPEN，
`Review Loop v2` 为 SUCCESS，独立评审结论为 `NO_P1_P2`；在合入前 C 仍不得标为完成。
后续 C 只核验、合入并在最终组合中回归，不改 Controller 工单、协议、ledger 或原始证据。

## 2. 冻结的组合边界

两条真实来源路径必须在 Electron main composition root 汇合到同一生产链：

```text
connected account → sync/filter/select ─┐
                                       ├→ deterministic analysis
share URL → capture/import ────────────┘  → StructuredAnalysisPackage
                                          → ReviewSession create/reuse
                                          → openReview(packageId)
                                          → Overview → List → Detail
```

1. source/import 层只取得并验证牌谱；不得拥有 selector、ReviewSession 或 UI truth。
2. deterministic analysis 只使用既有生产入口，不复制 fixture-only pipeline。
   manual-import 自动路径的 model evidence 前置是已经验收的 managed local Mortal
   production seam；不得要求用户另行生成 remote result URL，也不得在 B 内复制 runtime、
   comparison、`ModelEvaluation` 或 package pipeline。remote report adapter 仍是兼容路径。
3. 每个 `analysisPackageRef` 最多一个现存 `ReviewSession`。已有 session 必须 reuse/reopen，
   不得建立第二套 session truth。
4. renderer 的成功 authority 是 repository 已验证的 `sessionId` 与当前
   `packageId`（内部 `analysisPackageRef` 仍由 main/repository 持有），不是“可分析 N 个
   决策点”的 prose。renderer 只把该 `packageId` 交给既有 `openReview`。
5. `activeReportRefId = null` 是合法零报告 session：展示 evidence 与首次生成入口；
   不伪造 `evidence_only`，不自动调用 provider。
6. 打开后的 `selectedCount` 必须精确等于既有 selector 结果，不能用 replay 决策总数、
   import 诊断计数或 UI 过滤计数替代。
7. 合法 `complete | partial | evidence_only` 均沿 M7-A/B 同一路径保存和重开。
   `partial` / `evidence_only` 不能抹掉确定性 evidence。
8. import、analysis、session 事务或 open-review 失败时留在来源页，显示固定、安全、可重试
   的错误；不得泄漏上游 prose、路径、账号、token 或 raw bytes。失败不得留下半创建
   package/session/ref，也不得导航到空 Review Workspace。

## 3. A — Account → Supported Record Catalog

### 行为与可观察诊断

实现必须先按以下顺序定位并覆盖真实断点，不能预设为 OAuth、API、filter 或 renderer：

1. connected account 状态；
2. remote/local discovery 结果；
3. raw record count；
4. 既有 `filterAnalyzableRecord` 的 supported/unsupported 结果与确定性原因；
5. renderer-safe catalog DTO；
6. visible list refresh。

这些证据留在 main 测试/安全诊断中；renderer 不接触凭据、raw record、账号 identity 或
过滤器内部对象。不得复制 supported-rule 判定。

### 验收

- 首次登录得到 `valid` 后自动执行 record sync，再渲染受支持四人南风记录；
- 用户执行现有“刷新状态”且状态为 `valid` 后也刷新 record catalog，而不只刷新账号文案；
- fixture/account 含支持记录时，列表显示该记录并可从真实 app shell 继续分析；
- 同步成功且受支持记录确为 0 时，才显示“暂无可分析牌谱”；
- sync/service/DTO 失败显示明确“加载失败/可重试”，不得降格为空数组或覆盖成空目录；
- unsupported records 由既有规则给出确定性过滤原因，且不进入 renderer DTO；
- `offline_unverified` 只可显示已验证的本地缓存与离线提示，不得伪造一次在线 sync 成功。

### 测试 owner 与命令

- service/filter：`packages/desktop/tests/catalog-service.test.ts`；
- IPC/安全 DTO：`packages/desktop/tests/catalog-api.test.ts` 与既有 preload/security tests；
- app-shell 自动 refresh、真实空目录与失败分流：
  `packages/desktop/tests/app-composition.test.ts`（A 实现时新增）。

```powershell
npx vitest run packages/desktop/tests/catalog-service.test.ts packages/desktop/tests/catalog-api.test.ts packages/desktop/tests/app-composition.test.ts
```

## 4. B — Manual Import → Review Workspace

### 成功路径

```text
supported share URL
→ existing strict capture/import
→ canonical/replay
→ accepted managed local Mortal production seam
→ existing deterministic analysis
→ validated StructuredAnalysisPackage
→ ReviewSession create-or-reuse
→ renderer-safe { status: "review_ready", sessionId, packageId }
→ existing openReview(packageId)
→ Overview → List → Detail
```

“牌谱已导入，可分析 N 个决策点”可以保留为进度/诊断信息，但不能是产品成功终点。
同 package 已有 session 时返回同一 session；新 session 必须由 M7-B repository 事务创建。
打开 Overview 后断言 `selectedCount` 来自 selector，List 与 Detail 均可达。零报告 session
保持 `activeReportRefId = null`、evidence 可读和首次生成入口。

B 的实现启动门是 Local Mortal Runtime Production Spike 已以真实 checkpoint 完成
canonical/replay（含 wave-1 self/response）→ candidate conservation → strict
`ModelEvaluation` → validated `StructuredAnalysisPackage`，通过 fresh independent review
并合入 `master`。规格 PR、protocol fixture 或 stub 不满足启动门；门满足后 B 只消费该 seam，
不得扩张为 runtime/checkpoint 实现票。

### 失败路径

- URL/capture/import/unsupported semantics/local-runtime/analysis/validation 失败：不创建
  session，留在 import 页面并显示既有安全固定错误；runtime crash/timeout/protocol/
  candidate mismatch 不得透传 stdout/stderr、traceback、路径或上游 prose；
- package/session 事务失败：无半个可打开 session，不导航；
- 已有合法 session 的 reopen/open 失败：不新建替代 session，不改 active ref，留在来源页；
- 所有失败均不得把 replay 决策数误作成功 authority。

### 测试 owner 与命令

- import/capture：`packages/desktop/tests/paipu-import-service.test.ts`、
  `packages/desktop/tests/paipu-import-ipc.test.ts`；
- analysis/session ownership：`packages/desktop/tests/review-session-persistence.test.ts`；
- app-shell 自动导航、Overview/List/Detail 与失败不导航：
  `packages/desktop/tests/app-composition.test.ts`。

```powershell
npx vitest run packages/desktop/tests/paipu-import-service.test.ts packages/desktop/tests/paipu-import-ipc.test.ts packages/desktop/tests/review-session-persistence.test.ts packages/desktop/tests/app-composition.test.ts
```

## 5. C — Session List Refresh P3 Closeout

C 不重新实现 ReviewSession 或 persistence。消费 PR #23 的既有修复：首次合法报告生成后
由 fixed-review UI 通知 app 重新读取 session list；刷新失败不把已经验证/保存的报告
误报为生成失败。最终组合必须回归：

```text
open zero-report session
→ generate legal complete/partial/evidence_only report
→ leave review
→ saved-session list immediately shows report present
```

owner 为 `packages/desktop/src/renderer/app.ts`、`renderer/fixed-review-ui.ts` 和
`packages/desktop/tests/fixed-review-renderer.test.ts`。合入 PR #23 后运行：

```powershell
npx vitest run packages/desktop/tests/fixed-review-renderer.test.ts
```

不得修改 COAC-100/Review Loop 的原始协议、ledger、receipt 或证据来完成 C。

## 6. D — MVP Electron Golden Slice

### 永久入口与 owner

D 必须新增且长期保留以下公开命令和测试 owner：

```powershell
npm run test:electron-mvp-golden
```

- package script owner：`coach/package.json`；
- Electron test owner：`packages/desktop/tests/electron-mvp-golden-slice.cjs`；
- fixture owner：`packages/desktop/tests/fixtures/`，只使用受支持、脱敏、经生产 schema
  验证的真实牌谱 fixture；
- account discovery 可在 main 依赖注入边界使用 deterministic adapter fixture；
- Coach provider 必须 stub，默认 suite 禁止真实 provider、网络、账号与收费调用；
- Electron runtime、main/preload/renderer、顶层 routing、SQLite 与应用重启必须真实运行。

在 D 落地前，上述 script/file **尚不存在，命令不可运行且不得报告 PASS**。D 实现票必须
添加命令与 owner，并删除 living verification 中的 pending 标记。

### 主链

测试必须从应用入口开始；禁止直接以 `openReview()`、repository 或 presenter 起步：

```text
launch app
→ through account fixture select or share-import a supported record
→ deterministic analysis
→ create/reuse ReviewSession
→ Review Workspace Overview (truthful selectedCount)
→ List → Detail
→ first stubbed Coach generation
→ save
→ leave review
→ session list reflects active report
→ close app process
→ destroy all in-memory controller/graph/provider state
→ disable network and LLM
→ relaunch a fresh Electron process
→ session list → reopen the same session
→ same activeReportRefId
→ same judgment, explanation and provenance
→ zero provider/network requests after relaunch
```

account 与 share-import 两个 source-to-session 路由都必须从 app shell 自动覆盖；完整的
生成/重启/离线重开长链至少选择其中一条，但不能用 direct `openReview` 替代另一条的
app-shell focused regression。

### 降级链

同一 owner 至少覆盖 `partial` 或 `evidence_only` 的保存、完全退出、清空内存、禁网/禁
LLM、重启与重开。断言 generation status 原样保留，确定性 evidence 可浏览，
`activeReportRefId`、judgment/explanation/provenance（适用字段）与保存值一致，且重开
期间 provider/network 请求数为 0。零报告另保持 `not_generated`，不得伪装成降级报告。

## 7. 交付顺序与发布闭合

A 与 B 可以并行；C 复用并合入 PR #23；D 只能建立在 A/B/C 的最终真实入口上。每张实现
票都必须引用本规格的对应章节和已有 M7 owner，不得复制整个规格或扩大 OAuth、
ReviewSession、analysis architecture。

实现候选的固定五门均在 `coach/` 运行：

```powershell
npm run typecheck
npm run build
npx vitest run
npm run check:architecture
npm run test:package-import
```

只有同时满足以下全部条件，才可记录 `Playable Review MVP v0.1 = DEMOABLE`：

1. A account path、B import path、C session refresh 均按上述 app-shell 验收通过；
2. `npm run test:electron-mvp-golden` 与固定五门 PASS；
3. 最终候选取得 fresh independent `NO_P1_P2`；
4. 最终代码已合入目标分支；
5. 在自动门通过后，获得人工明确授权，完成一次真人 smoke：真实支持牌谱从账号或 share
   link 进入，Overview/List/Detail，真实 provider 首次生成，保存，列表即时更新，退出，
   断网重启并重开同一 report/evidence。

真实 provider 永不进入默认自动 suite；未授权时不得调用。自动 PASS 不能替代真人 smoke，
真人 smoke 也不能替代自动 Golden Slice、五门或独立评审。

## 8. 非目标

- 不新增 OAuth/account architecture、ReviewSession schema/architecture 或第二条下游分析
  管线；已批准的独立 M6 native Mortal runtime prerequisite 由其专属规格/实现票拥有，B/D
  只能消费，不得在本规格内重写；
- 不实现 regenerate/history picker/A-B UI；
- 不加入 Longitudinal Learner Model、user memory、adaptive training、M4 chat、Akagi、
  GraphRAG、vector DB、UI framework migration 或发布阶段的新能力；
- 本规格交付不代表 A/B/D 已实现，也不代表 MVP 已完成。
