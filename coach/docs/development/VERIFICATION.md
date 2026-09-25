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
目录并复验 SHA-256/license metadata；只有该步骤可联网。测试命令必须再次校验 runtime、
checkpoint、protocol 与 adapter identity，在禁网状态用真实 `mortal-582500` CPU inference
运行脱敏雀魂 fixture → canonical/replay（self + response wave-1）→ candidate conservation →
strict `ModelEvaluation` → whole-game review → `StructuredAnalysisPackage` validator。

普通 `npx vitest run` 只跑 protocol fixtures/fake exact child，禁止联网或加载真实 checkpoint；
它覆盖 crash/timeout/protocol/candidate mismatch 与安全边界，但不能冒充 production spike。
**当前状态（2026-09-25，COAC-141）**：此前真实 spike 的 wave-1 计数发生在推理前，
因此原有 chi 7、pon 13、daiminkan 1、hora 9、pass-on-discard 133、chankan 1
及 pass 候选族 97/39/3/3 只能视为原始窗口统计，不能证明模型覆盖。
现在只有成功推理且同一窗口在 validated package 中具有 ModelEvaluation 才进入验收计数；
未知荣和资格仍 fail closed。已登记六视角中原先有 9 个舍牌荣和、1 个抢杠荣和、
3 个含荣和候选的 pass 窗口因资格未知被跳过；在补齐可证明资格的真实脱敏 fixture
或能力、并重跑真实 checkpoint 取得全部必需分支前，wave-1 真实验收**未完成**。
receipt 必须绑定 clean tracked working tree 的实际完整 HEAD SHA；外部 GITHUB_SHA
若存在须与其一致。checkpoint、native runtime 和大模型文件不进入 Git、npm package
或普通五门；M8 再分发/notice/源码义务核验仍未完成。

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
