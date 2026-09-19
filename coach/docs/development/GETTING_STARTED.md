# 本地开发入门

本指南让新开发者在本机完成安装、全量验证，并运行现有命令行或 Electron 入口。

## 前置条件

- Node.js 22；
- npm（使用仓库 `package-lock.json`）；
- Windows PowerShell 用于现有 fact-engine 构建脚本；
- 仅在修改 Go sidecar 时需要 Go 工具链；普通应用运行使用已打包二进制。

## 第一步：安装 workspace

```powershell
cd coach
npm install
```

项目使用四个 npm workspace：`contracts`、`mahjong-soul-source`、`reasoning`、`desktop`。

## 第二步：验证开发环境

```powershell
npm run typecheck
npm test
npm run test:package-import
```

成功时应看到 TypeScript 无错误、Vitest/协议测试全部通过、编译后的 workspace 能由普通 Node 导入。`npm test` 内含架构边界检查（`npm run check:architecture`）；大改动后另跑
`npm run test:golden`（纵向主干回归）与 `npm run test:architecture-checker`（检查器自测）。

## 第三步：运行一个入口

### 命令行回归教练

```powershell
npm run coach:demo
```

它使用仓库内置的东一局 fixture 和打包 sidecar 输出结构化/Markdown 报告。这个入口是回归原型，不是通用雀魂导入器。

### Electron 桌面应用

```powershell
npm run desktop
```

当前桌面入口支持雀魂国区登录、跨重启恢复、可分析目录、牌谱取回、canonical 映射与重放。点击“分析”后目前只确认牌谱已取得并基础解码；不会生成最终教学报告。

### OAuth2 恢复诊断

```powershell
npm run desktop:diagnose-mahjong-soul-restore
```

这是一次性可见登录诊断，不读取正常产品 vault。它只打印固定状态码，不打印令牌或上游响应。

## 验证静态课程

从仓库根目录运行：

```powershell
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
```

然后直接打开 `index.html` 浏览课程。静态课程与 `coach/` 应用共享麻将教学目标，但构建和测试彼此独立。

## 常用 focused 测试

```powershell
cd coach
npx vitest run packages/mahjong-soul-source/tests/record-fetcher.test.ts
npx vitest run packages/mahjong-soul-source/tests/canonical-mapper.test.ts
npx vitest run packages/reasoning/tests/stream-replayer.test.ts
npx vitest run packages/desktop/tests/record-ingestion-service.test.ts
```

文件名不存在时用 `rg --files packages | Select-String '<关键词>'` 找到当前测试；不要凭旧 handoff 猜路径。

## 修改协议 bundle

只有协议版本或受信 surface 需要升级时才运行：

```powershell
cd coach
node scripts/update-mahjong-soul-protocol.mjs
node scripts/update-mahjong-soul-protocol.mjs --check
node scripts/update-mahjong-soul-protocol.mjs --check-current
node --test scripts/mahjong-soul-protocol-compatibility.test.mjs
```

`--check-current` 是唯一读取可变当前版本元数据的模式。不要手改 vendored bundle 或 manifest 哈希。

## 常见问题

### Windows esbuild `spawn EPERM`（COAC-13）

先在**发生故障的同一个 Agent 会话**、`coach/` 目录运行：

```powershell
$bin = node -p "require.resolve('@esbuild/win32-x64/esbuild.exe')"
& $bin --version
Write-Output "direct_exit=$LASTEXITCODE"
node -e 'try { console.log(require("esbuild").transformSync("let x=1").code) } catch(e) { console.error(e); process.exitCode=1 }'
Write-Output "transform_exit=$LASTEXITCODE"
node scripts/check-windows-esbuild.mjs
Write-Output "check_exit=$LASTEXITCODE"
```

检查器记录 Node/cmd 的管道子进程与 esbuild transform；任一失败即非零退出。
直接运行二进制成功，不能证明 Node 与 esbuild service 之间的管道可用。
不要因此重装依赖、关闭安全软件、修改全局配置或放宽系统 ACL。

2026-09-20 在 COAC-13 原受管理 checkout（`689e5e8`）验证：Node 24.15.0、
esbuild 0.28.1、Codex CLI 0.155.1。宿主直接执行二进制、transform 和完整 build
均退出 0；原 checkout 的宿主 `npm test` 也完整退出 0（含 build、Vitest、
协议/fixture 脚本和 architecture check），不代表沙箱内全量门禁通过。
Codex `unelevated` + `workspace-write`（包括 network_access=true）
中，Node 的 `stdio=pipe` 返回 EPERM/-4048，而 `inherit` / `ignore` 成功；
同一检查切换至 `elevated` 后退出 0。这是该机器沙箱/管道组合的可重复差异，
不是“所有 Node 子进程都被禁止”的证据，也尚未定位到具体 Windows 安全策略。

可在正常宿主终端做**单次、非全局**对照（先解析实际 node.exe 路径）：

```powershell
$nodeExe = (Get-Command node.exe).Source
codex sandbox -c 'windows.sandbox="unelevated"' -c 'sandbox_mode="workspace-write"' -c 'sandbox_workspace_write.network_access=true' $nodeExe scripts/check-windows-esbuild.mjs
codex sandbox -c 'windows.sandbox="elevated"' -c 'sandbox_mode="workspace-write"' -c 'sandbox_workspace_write.network_access=true' $nodeExe scripts/check-windows-esbuild.mjs
```

模式以宿主权限/组织策略允许为前提；不要在受限 Agent 内嵌套启动沙箱来绕过宿主策略。
`elevated` 是使用独立低权限用户的沙箱，不是关闭隔离或让构建以管理员运行，参见
[官方 Windows 沙箱说明](https://developers.openai.com/zh-Hans/docs/windows/windows-sandbox)。

单次覆盖已消除本机探针的 EPERM，但不能直接视为 Multica 端到端修复：原 checkout
位于用户目录下，elevated bundler 随后报祖先目录读取拒绝；本机 `E:` 工作区的
bundler 在 elevated 中成功，这两个 checkout 的构建产物不同，不能互相替代验收。
完整 build 成功后再运行 `node packages/desktop/scripts/bundle-preload.mjs`，
避免把缺失 `dist/preload-entry.js` 误判为原故障。Multica 新任务仍须验证有效沙箱
模式、实际 PowerShell 路径（避免 WindowsApps 执行别名）与 checkout 可读边界。
若需进一步归因，应收集同时间窗的沙箱日志与 Windows CodeIntegrity/AppLocker/
Defender 进程及命名管道拒绝审计；不要据 EPERM 单独认定安全软件拦截。

### COAC-14 复发后的已验证组合（2026-09-20）

先检索 Multica 上游：[#6883](https://github.com/multica-ai/multica/issues/6883)
记录任务独立 CODEX_HOME 下的 elevated 初始化问题；
[#6865](https://github.com/multica-ai/multica/issues/6865) 记录工具目录读取问题。
Codex [#35070](https://github.com/openai/codex/issues/35070) 是 unelevated 下
Node/esbuild EPERM 的同类未关闭报告。它们是线索，不是本机全部细节的证明。

本机进一步验证了 COAC-14 **同一提交 `f2d6bd6a46ef7f6c66066115a923ef2d31193f77`**：
E 盘 `MjsoulTileTrace/coach` checkout + CLI 0.155.1 的 elevated/workspace-write
沙箱 + Codex 随附的真实 PowerShell 可执行文件，`npm test` exit=0（161 文件、
1851 Vitest 测试，18 个 Review Loop fixtures，architecture 0 violations），
`npm run test:package-import` exit=0。这是完整沙箱内门禁，不是前文的宿主结果。

PowerShell 也必须一起验证：同机商店安装目录中的 PowerShell 7.6.6 在 elevated
下返回 Access Denied；Codex primary-runtime 中实际 pwsh.exe 可运行。
Multica 0.5.0 的 bundled CLI 在这组测试中也可以执行，无需额外手工 ACL 变更。

经用户批准，已对 Mika 与 Ticket 编码执行器应用专用配置：custom_args 追加
`-c windows.sandbox=elevated`；custom_env 的 PATH 优先放可运行的实际 PowerShell
目录并保留 Node/npm、Multica CLI 和原工具路径。COAC-13 已关联已有 Coach
local_directory，后续任务预期使用 E 盘资源。服务端已确认保存；尚未触发新的
Multica 模型任务验证 daemon 是否选用新的目录及环境，因此不能宣称端到端恢复。

重启一个新任务后应核对其实际 argv/config、PowerShell 解析路径、cwd 与 checkout
提交，再跑检查器、npm test、package-import。旧运行进程不会自动继承设置；后续若
初始化 COM+ 弹窗复发，按 #6883 记录并停止宣称完整恢复，不回退到已知 pipe 失败的
unelevated，也不自动取消沙箱。不要更改机器级 PATH、全局 Codex 配置或安全软件。

### workspace import 指向旧的 `dist`

先运行 `npm run build`，再跑跨 workspace 的 focused 测试。desktop 测试通过包名导入 source 包时，旧 `dist` 会造成看似无法解释的失败。

### 找不到 Go

只有修改/重建 sidecar 时需要 Go。若当前任务不改 sidecar，运行 TypeScript 全量和 package-import 即可；不要为了绕过缺失 Go 修改清单或二进制。

### Electron 登录成功但没有教学报告

这是当前产品状态，不是登录失败。现有链路停在 canonical replay；生产模型候选和完整分析报告属于下一里程碑。
