# H2：牌谱链接导入（paipu URL import）产品化交接

日期：2026-08-15
分支：`codex/m5-h2-paipu-url-import`（基线 `codex/m5-h1-replay-acceptance` @ `52efd59`）

## 结论（一句话）

「粘贴雀魂分享链接 + 选座位 → 应用骑自己的官方客户端会话抓牌谱 → 与账号目录路线汇合到同一分析」已全链落地并通过**真人产品路径验收**（renderer → IPC → 生产捕获原语 → 共享分析 → `analysis_ready`，1024 canonical events / 116 decisions）。live 验收还揪出并修复了两个只有真机才能暴露的 Electron 43 坑（见下文，后续任何 CDP 窗口工作都会踩）。

## 组件地图（P0–P5）

| 层 | 文件 | 职责 |
|---|---|---|
| 生产捕获原语 | `packages/desktop/src/official-client-record-capture.ts` | createWindow → attach → listener → loadURL →（commit）→ Network.enable → 捕获 INNER bytes；deadline 兜底整个流程；固定 fail-closed 错误 |
| CDP 观察器 | `packages/desktop/src/cdp-record-observer.ts` | `start()` 拆成 `attach()` + `enableNetwork()`（原因见坑 1） |
| 共享分析仓 | `packages/desktop/src/record-analysis-store.ts` | 唯一的 map→replay→缓存实现，key = `recordId#selfActor`；mapper 拒绝即不缓存 |
| 导入服务 | `packages/desktop/src/paipu-import-service.ts` | URL 严格解析在任何窗口创建之前；selfActor 显式 0..3 无默认；同 key 并发去重共享同一 promise |
| IPC | `packages/desktop/src/ipc.ts` | 专用通道 `mahjong-soul:import-paipu-url`（不重载 startRecordAnalysis）；trusted sender + 严格单对象信封 + 结果 zod 校验 |
| 类型化 API | `packages/desktop/src/paipu-import-api.ts` | `PaipuImportResultSchema`（安全字段白名单）+ renderer 类型 |
| preload | `packages/desktop/src/preload-entry.ts` | `window.riichiCoachPaipu.importPaipu`；ERROR_CODES 补齐全部 12 个源错误码（原先缺 `mahjong_soul_record_container_invalid`、`mahjong_soul_canonical_unsupported_semantics`） |
| 窗口工厂 | `packages/desktop/src/electron-entry.ts` `createOfficialClientCaptureWindow` | 诊断与产品共用：持久分区 + 全套加固 + `backgroundThrottling:false` + 置顶（坑 2） |
| 渲染端 | `packages/desktop/src/renderer/`（index.html / app.ts / paipu-ui-policy.ts） | 「通过牌谱链接分析」独立区块；固定中文状态文案，不暴露内部错误码 |

路线收敛不变量（有测试钉死）：同一 INNER bytes + 同一 selfActor，无论从账号 fetch 还是 URL 捕获进入，canonical stream 与 replay decisions 完全一致（`paipu-import-service.test.ts` + `record-analysis-store.test.ts`）。URL 路线**不查 catalog**、不用 `ingest(recordId)`（那是目录路线的守卫，共享链接恰恰没有）。

## 真机踩出的三个 Electron 43/Windows 坑（别重踩）

### 坑 1：未 commit 的 about:blank 目标上 `debugger.sendCommand` 永久挂起

- 现象：`attach()` 正常返回，但对其后任何 `sendCommand`（Network.enable / Page.enable 都一样）**永远不 resolve**；窗口停在 about:blank（CDP 里 url 为空串），进程不崩。
- 隔离实验（2026-08-15 凌晨，nav-matrix 探针组）：attach-only 可正常导航（maj-soul 页 ~1.1s commit）；attach+enable 在 loadURL 之前 → 挂死；页面 commit 之后再 enable → **5ms 返回**；换 shell（PowerShell）、换默认/持久分区、全新临时 userData、清僵尸进程都复现 → 与 profile 无关。
- 历史成因：accf970 把顺序改成「observer 先于导航」，但那次之后**从未真机跑过**——H1 收尾的 live 验证（02:42）用的还是旧竞态顺序（loadURL 先完成，日志可证）。FakeDebugger 永远即时应答，测不出这个差别。
- 修复（`8be90a8`）：保持 accf970 的本质（不错过任何 Lobby WebSocket 帧）：**attach + listener 在导航前**；**Network.enable 推迟到首个主框架 commit**（Electron `did-navigate`，严格早于任何页面 JS 执行）。窗口端口新增 `onDidNavigateCommit`。同时 deadline 兜底整个捕获（含导航）：永不 commit 的页面 / 永不 settle 的 loadURL 到点返回 `no_capture`（这是 live 挂死暴露的第二个潜在 bug）。测试钉死新顺序：`attach < listener < loadURL < commit < Network.enable < frames`。

### 坑 2：被遮挡窗口的 rAF 节流把 Unity WebGL 卡死在 0%

- 现象：产品路径（主窗口 + 捕获窗口双开）下捕获窗口停在「正在初始化遊戲資源 0.0%」（截图为证），240s 超时 `no_capture`；而单窗口的诊断进程同一分钟捕获正常。
- 成因：主窗口持有焦点，捕获窗口在其后被遮挡；Chromium 对遮挡窗口节流 rAF，Unity 加载器停摆、网关永不连接——正是旧记忆里「后台窗口只加载资源不连网关」的机制化解释。
- 修复（`0d6d45c`）：共享捕获窗口工厂 `backgroundThrottling: false` + `moveTop()` + `focus()`。诊断路径（无其他窗口）不受影响。

### 坑 3：Windows 上未激活的新窗口纯白不渲染（native occlusion）

- 现象（用户观察 + live 复现）：新 show 出来的 Electron 窗口只要从未获得 OS 激活（点任务栏图标前）就是纯白表面——任务栏悬停预览也是白的；点任务栏图标使其成为焦点后才开始加载。首轮真实 UI 验收即死于此：捕获窗口 240s 全程白屏，`no_capture`。
- 成因：Chromium 的 `CalculateNativeWinOcclusion` 特性把未激活窗口判为 occluded，renderer 不 present，Unity WebGL 永不启动。`backgroundThrottling:false`（坑 2 的修复）管不住这条 native 判定。
- 修复（`7c2fd63`）：main 进程 `app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")`（Electron 社区标准 workaround）。修复后同一 UI 流程**无人值守**完成捕获+分析。

## 真实 DOM UI 验收（H2 收尾轮，2026-08-15 08:0x–08:2x）

通过用户可见 DOM 全链完成一次（本轮要求：必须触发 `#paipu-import` 的真实 click handler，不允许直接调用 `importPaipu`）：

- **session state**：vault 起始为空（logged_out）。真实点击 `#login`（CDP Input.dispatchMouseEvent 于元素实际坐标，hit-test 校验）→ 应用真实 openLogin 流程 → 登录窗口在持久分区上被动捕获凭据（零人工输入，t+220s）→ `账号已连接`（valid）。
- **UI visible**：登录后 `.paipu-import` 区块 `hidden=false`。
- **button click**：真实鼠标事件点击 `#paipu-import`（(665,484)，viewport 904×641，按钮 en 非禁用）→ 处理器真实运行：状态进入「正在通过雀魂客户端读取牌谱…」、导入按钮 `disabled=true`。
- **final visible status text**：`牌谱已导入，可分析 116 个决策点`（MutationObserver 记录的完整转移链：idle → pending → ready）。
- **replayDecisionCount = 116**（直接可见于文案）。
- **canonicalEventCount = 1024**：产品 UI 按设计不显示该值；由同一 URL/座位的诊断 instrumentation 直接观测（1024），与本 UI 运行的 decision 数（116）逐项一致，符合上文 LIVE/STRUCTURAL 证据分层。
- 中间教训：首轮 UI 导入因坑 3 超时；第二轮 driver 的 30s evaluate 超时在捕获窗口真正开始渲染（CPU 占用上升）后误杀 driver，但应用本身继续完成了全链（事后 DOM 探针取证成功）。
- 真实 URL/recordId/昵称均未写入任何 git 内容；验收 driver 与截图只存在于会话临时目录。

## P7 真人验收证据（2026-08-15 06:1x，同一份真实牌谱，selfActor=3）

**LIVE direct observations（真人直接观测）**

- 产品路径（正常 renderer/IPC 路线，非诊断命令）：renderer 收到
  `{"status":"analysis_ready","selfActor":3,"canonicalEventCount":1024,"replayDecisionCount":116}`（151.4s，含 ~116s replay）。
- 诊断路径（同 URL 同座位，`--diagnose-mahjong-soul-capture-record`）：`storedActionCount=978`、`canonicalEventCount=1024`、`replayDecisionCount=116`、audit 落盘 exit 0 —— canonical/decision 计数与产品路径**逐项一致**。
- 诊断路径 hash 链：audit `streamHash = sha256:44bdd035c352a850cc6fa1c5801b27ef0eca7a80102c3cfe8c966eb63d66dd18` = `%TEMP%\mahjong-soul-captured-record.pb`（INNER 86139 bytes）的 sha256。

**STRUCTURAL / AUTOMATED guarantee（结构保证，非 live 暴露）**

- `sourceRecordHash` **不出现在任何 renderer/IPC 结果里**（安全边界保持不变；schema 白名单无 hash 字段）。
- 产品与诊断路径共享同一个捕获原语（`captureRecordViaOfficialClient`）与同一个分析仓；「同 INNER bytes + 同 selfActor ⇒ 同 canonical stream / 同 replay decisions」由 route-convergence 测试钉死（`paipu-import-service.test.ts`、`record-analysis-store.test.ts`）。因此两条路线的 `sourceRecordHash` 相等**由自动化收敛保证**，而非把 hash 暴露给 renderer 直接比对。若未来需要一次真人直接 hash 交叉验证，只允许 main-process 侧 diagnostic/test instrumentation，不得扩展 renderer-facing result schema。

- 会话注记：验收时 vault 显示 logged_out（应用内「尚未登录」），但 URL 导入照常成功——捕获走的是持久分区的**网页会话 cookie**，与 vault 的账号令牌无关（H2 设计如此：不声称匿名，也不要求 vault 登录）。

## 测试与提交

- 全量：vitest **117 文件 / 1147 tests** 全绿；node 脚本 26/4/4；typecheck 0 错误；仓库无 lint script（如实报告）。
- 提交（本轮）：`e13450f` P0 捕获原语抽取 → `641deff` P2 共享分析仓 → `cd9de3d` P1 导入服务 → `db5a622` P3+P4 IPC/preload/窗口 → `22dee27` P5 渲染端 → `8be90a8` 坑1修复 → `0d6d45c` 坑2修复 →（收尾）debug 文件污染修正 + 本 handoff。
- H2 测试要点：URL 拒绝矩阵（错误 origin/http/多余 path/query/hash/畸形 paipu，且**零窗口创建**）；identity（recordId 出自解析器、原样 URL 进 loadURL、selfActor 原样到 mapper、无默认）；捕获生命周期（顺序/期间捕获/超时关窗+detach/INNER bytes/绝不二次 unwrap）；路线收敛；catalog 独立；fail-closed（未知杠 type / RecordLiuJu / 畸形 record 不缓存不回放）；IPC 安全（不可信 sender、多余参数/键、bytes 过不了 IPC）；preload 白名单；渲染端文案策略。

## 剩余 unsupported semantics（继续 fail closed，未变）

- `RecordLiuJu`（全部 type，无真人样本）
- `RecordAnGangAddGang` type ∉ {2,3}
- 五牌暗杠（红五位置不在 wire 上）

## 下一步建议（含 H2 未展开的技术债）

1. **[backlog] account 路线座位回退债**：`electron-entry.ts` 的 account fetch 回调仍是 `summary?.selfSeat ?? 0`（H1 旧默认，非 H2 regression）。正确行为：catalog summary 在 fetch 期间消失应 fail closed（`if (!summary) throw mahjong_soul_record_not_analyzable; selfActor: summary.selfSeat`），而不是静默按座位 0 分析。本轮**未改**：该逻辑在 electron-entry 的注入式 wiring 里、无单测挂点，改了就得补 race/regression 测试，属于下一步独立小任务（顺手把座位解析提为可测组件）。
2. 真人把 audit/分析与雀魂回放对照（H1 遗留的人工验收动作，现在可以直接用 UI 的「通过牌谱链接分析」入口做）。
3. `replayCanonicalStream` 全量局 ~1s/decision（116 决策 ≈ 2 分钟）——UI 体验前需要性能剖析（H2 非目标，未动）。
4. M6：只接一个模型来源（Mortal 或 Akagi 二选一）。
5. 登录窗口顺序天然安全（loadURL 先于 observer.start()，`mahjong-soul-login-window.ts:376-378`），无需改动；但若未来重构登录 CDP，先读坑 1。
