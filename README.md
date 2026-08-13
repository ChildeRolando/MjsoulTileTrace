# Riichi Coach

Riichi Coach 是一个本机运行、证据可审计的日麻教练项目。仓库同时包含：

- 根目录的十八课牌效率课程与训练工具；
- `coach/` 下的 Electron 教练应用、雀魂国区数据接入、canonical 重放、确定性事实管线和模型适配边界。

## 开发文档

开发人员从 [开发文档首页](docs/development/README.md) 开始。它按阅读顺序连接：

1. [当前路线图](docs/development/ROADMAP.md)
2. [系统架构](docs/development/ARCHITECTURE.md)
3. [本地开发入门](docs/development/GETTING_STARTED.md)
4. [开发工作流](docs/development/DEVELOPMENT_WORKFLOW.md)
5. [测试与发布门禁](docs/development/VERIFICATION.md)

按日期保存的规格、实施计划和 handoff 位于 `docs/superpowers/`。它们用于追溯决策，不是当前状态的唯一入口。

## 快速验证

```powershell
cd coach
npm install
npm run typecheck
npm test
npm run test:package-import
```

课程站点的独立验证见 [开发入门](docs/development/GETTING_STARTED.md#验证静态课程)。
