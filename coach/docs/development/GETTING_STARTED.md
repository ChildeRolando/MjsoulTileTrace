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

经用户批准，先对 Mika 与 Ticket 编码执行器应用专用配置，后补齐仓库律法审查官：custom_args 追加
`-c windows.sandbox=elevated`；custom_env 的 PATH 优先放可运行的实际 PowerShell
目录并保留 Node/npm、Multica CLI 和原工具路径。COAC-13 已关联已有 Coach
local_directory。保存配置时尚未进行新任务验收；后续真实运行结果见下文，
不能把配置已保存等同于运行恢复。

后续复验应核对新任务的实际 argv/config、PowerShell 解析路径、cwd 与 checkout
提交，再跑检查器、npm test、package-import。旧运行进程不会自动继承设置；后续若
初始化 COM+ 弹窗复发，按 #6883 记录并停止宣称完整恢复，不回退到已知 pipe 失败的
unelevated，也不自动取消沙箱。不要更改机器级 PATH、全局 Codex 配置或安全软件。

### 跨任务复用 preload bundle 的写入拒绝（COAC-13 / COAC-14）

2026-09-20 的真实 Multica 续跑已不再复现 pipe EPERM：COAC-13 的
`01a0bb6a-6a0f-7c5d-8ea0-c3c754e877d8` 探针全绿，COAC-14 的
`01a0bb6c-0d7f-7864-92a3-df8fc3e7dc50` Vitest 161 文件 / 1851 测试通过，
但二者都无法覆盖 `packages/desktop/dist/preload.bundle.cjs`。
因此 transform 成功不能作为 build 恢复的验收。

在 COAC-14 HEAD `05d82bf01e13971da142a9040bfdb41f67294aff` 上，宿主侧
检查发现旧 bundle owner 是 `CodexSandboxOnline`，其继承 ACL 缺少当前任务
`cap_sid` 中的 workspace SID，而父目录已有该 SID。使用该失败任务的
CODEX_HOME、elevated/workspace-write/network_access=true 重放：已有 bundle
的 `openSync(path, "r+")` 返回 EPERM，旁边 preload-entry.js 可写，实际 bundler
报 Access denied；删除 bundle 也失败。文件非只读，不能仅凭属性判断可写。
独立任务 CODEX_HOME 的身份不同；单个 home 的构建成功不能证明跨任务复用。

机械回归在 `coach/`（已有完整 build 输入）运行：

```powershell
node scripts/check-windows-esbuild.mjs --bundle
```

`--bundle` 除管道/transform 外运行真实 bundler 两次；任何一次非零即失败。
原故障环境中前面三项通过、两次 bundler 均失败，构成 RED。不要从受限 Agent
嵌套启动沙箱绕过策略；外部宿主复现应使用明确的任务 home、工作区和模式。

本机恢复只在正常宿主终端处理这个已由 Git 忽略的生成文件：先备份，确认绝对
路径在目标 checkout、`git ls-files -- packages/desktop/dist/preload.bundle.cjs`
为空且 `git check-ignore` 命中，然后删除此单一文件并运行
`node packages/desktop/scripts/bundle-preload.mjs` 重建。不要递归清理工作区。
新文件 owner 为宿主用户 Roland，可正常继承后续任务的授权；构建继续使用原
生产脚本，不修改 ACL、不扩大 writable roots，也不改安全软件或全局配置。
这是对本机陈旧构建产物的恢复，不是上游沙箱身份/ACL 生命周期缺陷的通用修复。
产物若以后在其他沙箱身份下首次生成而再次出现同类 ACL 差异，仍需宿主侧恢复。

真实任务日志确认 elevated command-runner 已在运行，虽然复制的 config.toml
仍含 unelevated（启动覆盖生效）；不能只读该文件判断有效模式。实际工具 shell
仍为 Windows PowerShell 5.1，先前保存 PATH 不等于 shell 继承验收成功。
本轮按真实 PowerShell 5.1 验证，不把指定另一 pwsh 的成功作为继承证明。
新 COM+ 初始化是否在所有后续任务都可靠，仍不由这些构建检查证明。
修复后的宿主重放验证（不是新 Multica 模型任务）：COAC-14 原失败 task home，
相同 E 盘项目根 cwd、实际 Windows PowerShell 5.1，检查器含两次 bundle 均通过；
`npm test`（161 文件 / 1851 测试、18 protocol fixtures）、`test:package-import`
和 `typecheck` 全部 exit 0，候选仍为 `05d82bf`，生产代码未改。
重建前后 bundle SHA-256 相同，说明恢复改变了产物生命周期而非编译结果。
切换至 COAC-13 的 c3c754e877d8 task home 后，同一检查器（两次 bundle）及完整 build 也 exit 0，产物仍由宿主用户拥有；跨这两个已存在身份的复用已通过，新任务创建/COM+ 生命周期仍待单独验收。

### 新 Multica 任务验收（2026-09-20）

用户授权重跑 COAC-14 后，Ticket 编码执行器的新 run
`01a0bb87-9e8b-752c-b8ba-62917dd1c88e` 从 daemon 正常启动，在同一个 E 盘
checkout、候选 `05d82bf` 上通过 `npm test`（161 文件 / 1851 测试，18 protocol
fixtures）、独立 `test:package-import`、`typecheck`、`npm audit --omit=dev`
（0 vulnerabilities）与差异检查。真实 sandbox 日志显示 setup refresh
`errors=[]`、helper completed，并使用 elevated command-runner；本轮不需人工
干预初始化。它证明本次新任务恢复，不证明上游 COM+ 问题永不复发。

同轮发现审查官仍无专用配置，已按用户的全权修复授权为
`a800ee82-550e-49ce-aac1-eeb211135da8` 补齐与 Mika/Ticket 相同的 elevated
参数和唯一 PATH 环境配置，修改前为空且已备份，回读验证参数精确匹配。
完整恢复仍应包含这个第二 Agent 的新任务对同一生成产物的复验。

沙箱内 `.git` 写入及宿主 SSH 私钥读取仍有访问边界；不将这些边界当作 esbuild
复发，也不为了推送文档而放宽它们。执行器通过已有 GitHub CLI 认证的 Git Data
API 保存仅含验收记录的文档提交；生产代码与被测试候选一致。
### workspace import 指向旧的 `dist`

先运行 `npm run build`，再跑跨 workspace 的 focused 测试。desktop 测试通过包名导入 source 包时，旧 `dist` 会造成看似无法解释的失败。

### 找不到 Go

只有修改/重建 sidecar 时需要 Go。若当前任务不改 sidecar，运行 TypeScript 全量和 package-import 即可；不要为了绕过缺失 Go 修改清单或二进制。

### Electron 登录成功但没有教学报告

这是当前产品状态，不是登录失败。现有链路停在 canonical replay；生产模型候选和完整分析报告属于下一里程碑。
