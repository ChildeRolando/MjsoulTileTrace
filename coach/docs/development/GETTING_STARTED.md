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

### Blind Discard Arena 本地实验台

本地控制台：运行 `npm run arena:console`，打开 `http://127.0.0.1:4318`。页面提供归档用量/结果看板、RAG 对照与受控故障实验的启动/停止，以及 Codex/API 配置。默认 `gpt-6-luna/high` 与 100M tokens 报警线；同一时间只运行一个实验。配置和历史保存在被忽略的 `reports/blind-discard-arena`，API Key 仅留在本次服务进程内存；关闭服务后需重填。停止会终止本次 CLI 及其子进程，不将未完成归档标为成功。此独立本地页面不接入生产 UI；服务仅监听本机，启动和停止均由用户操作，不安装定时任务。

结果列表的“查看”按案例展示执行时间线：盲测输入、每轮公开决策摘要、完整工具参数/返回与错误、最终提交/拒绝原因、耗时、token 和 Mortal 匹配。新运行通过 `case-trace.jsonl` 实时写入已经校验的公开事件；每题最终 `case_run` 仍是评分和统计的唯一来源，刷新不会重复计数。详情支持自动刷新、保留展开位置及 JSON 下载。旧归档没有记录的输入、逐轮摘要或时间不会补造。Codex 私有 reasoning 事件继续丢弃，只让模型额外返回一两句公开摘要，不保存内部思维链。

```powershell
npm run arena -- run --dataset blind-discard-smoke-v1 --rag off
npm run arena -- run --dataset blind-discard-smoke-v1 --rag local
npm run arena -- inspect <runId>
```

使用本机已登录的 Codex 订阅时，不需要 API key：

```powershell
npm run arena -- run --dataset blind-discard-smoke-v1 --rag local --provider codex-cli --model gpt-6-luna --reasoning-effort high --max-provider-output-tokens 2048
```

该适配复用已有隐藏 Codex 进程与结构化输出解析；每轮只返回一个模型选择的 Arena 查询/提交，真实 MCP/RAG 仍由 runner 执行。不会把 CLI 的 shell、文件或其他连接器交给模型，也不改变生产复盘 provider。manifest 保存模型及 reasoning effort。当前工作树的归档累计以已报告 input + output 为准，缓存输入不重复累计；缺失用量保持 unknown。`--token-warning-threshold` 默认 100,000,000，达到后在运行/离线复查输出报警，仅提醒，不自动停止或重跑；它不是全账户或开发/评审聊天的用量统计。原有逐题时间、调用和输出预算继续有效。

Arena 使用固定脱敏 smoke/dev 牌局、真实 managed libriichi 和 Mortal runtime，并把 manifest、事件及可离线重算的 summary 写入 `reports/blind-discard-arena/<runId>/`。两种 RAG 模式必须各自记录 runId；`inspect` 不会启动模型或 helper。设置获授权的 OpenAI-compatible provider 时，分别用 `RIICHI_COACH_ARENA_BASE_URL`、`RIICHI_COACH_ARENA_MODEL` 配置端点与模型，并通过 `RIICHI_COACH_API_KEY` 提供密钥；密钥不会写入 archive，也不会传给 MCP 子进程。若配置或授权凭据缺失，archive 会记录 provider unavailable，真实模型演示仍待完成，不得据此宣称 Arena 总体验收通过。边界与验收事实见 [Blind Discard Arena spec](../specs/2026-10-09-blind-discard-arena.md)。

### Electron 桌面应用

```powershell
npm run desktop
```

当前桌面入口已包含雀魂国区登录、目录/牌谱摄取、M7 Review Workspace 与持久会话；
manual share import 在 main 中使用受管 local Mortal（`mortal-582500`）生成并验证分析包，
创建/复用 ReviewSession 后自动打开 Overview → List → Detail。该接线通过不等于
Playable Review MVP 已完成；固定五门、Golden Slice、独立评审与获授权真人 smoke 仍是发布门。
实现与发布门见
[`Integration Closeout spec`](../specs/2026-09-24-playable-review-mvp-integration-closeout.md)。

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

### Windows esbuild 本机环境诊断（COAC-13）

从 coach/ 目录执行本地探针：

    node scripts/check-windows-esbuild.mjs

它检查当前 shell 中 Node/cmd 管道与 esbuild transform，是可选环境诊断，不是产品门禁，也不修改沙箱、ACL 或 Multica 配置。--bundle 会真实重建 preload bundle 两次并覆盖生成文件；只在成功 build 后的可丢弃隔离 worktree 中运行。

COAC-13/14 的机器版本、路径、权限和任务配置记录属于历史案例，不构成当前生产或 agent 配置要求。完整原始记录及两文件差异保留在 [PR #6 源提交](https://github.com/ChildeRolando/MjsoulTileTrace/commit/39061117c2a99f121df23da11b72f9f33d60a2f3)。

### workspace import 指向旧的 `dist`

先运行 `npm run build`，再跑跨 workspace 的 focused 测试。desktop 测试通过包名导入 source 包时，旧 `dist` 会造成看似无法解释的失败。

### 找不到 Go

只有修改/重建 sidecar 时需要 Go。若当前任务不改 sidecar，运行 TypeScript 全量和 package-import 即可；不要为了绕过缺失 Go 修改清单或二进制。

### Electron 已导入牌谱但没有进入复盘

这是当前已知的 app composition 缺口，不表示 M7 Review Workspace 不存在。不要用手工输入
package id 绕过发布验收；Integration Closeout 要求来源入口创建/复用 session 并自动导航。
