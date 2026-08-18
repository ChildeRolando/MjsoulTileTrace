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

### workspace import 指向旧的 `dist`

先运行 `npm run build`，再跑跨 workspace 的 focused 测试。desktop 测试通过包名导入 source 包时，旧 `dist` 会造成看似无法解释的失败。

### 找不到 Go

只有修改/重建 sidecar 时需要 Go。若当前任务不改 sidecar，运行 TypeScript 全量和 package-import 即可；不要为了绕过缺失 Go 修改清单或二进制。

### Electron 登录成功但没有教学报告

这是当前产品状态，不是登录失败。现有链路停在 canonical replay；生产模型候选和完整分析报告属于下一里程碑。
