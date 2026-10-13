# 仓库迁移历史记录

此文件记录已经完成的目录迁移，不是待执行计划。当前项目边界与检查入口见 [REPOSITORY-STRUCTURE.md](REPOSITORY-STRUCTURE.md)。

## 2026-08-14 目录迁移

课程、教练的代码与文档迁入各自项目目录，根目录改为仓库导航。相关提交：

- `2f54cfd`：课程迁入 course。
- `63530c8`：教练效率分析器改为引用 course/lib/mahjong.mjs。
- `669d3c6`：教练文档迁入 coach。
- `62a05d1`：建立项目导航。

当时的验收记录：

- 课程 Node 测试 18/18 通过，lesson-0001-smoke 通过。
- 教练 typecheck、npm test、test:package-import、npm audit --omit=dev 均退出 0，生产依赖审计 0 漏洞。
- 当时全部 534 个已跟踪路径符合目录归属，59 个 Markdown 文件的本地链接解析成功。

这些计数是当时的历史结果，不代表当前版本已经重新执行上述检查。

完整原始迁移计划与各阶段记录保留在 [Git 历史版本](https://github.com/ChildeRolando/MjsoulTileTrace/blob/57e55012/REPOSITORY-MIGRATION-PLAN.md)。

## 2026-10-07 插件独立维护

雀魂摸切插件的源码、测试、工具、构建配置和产品文档移出本仓库，独立项目为 [majsoul_moqie](https://github.com/ChildeRolando/majsoul_moqie)。本仓库保留课程与教练，不再提供插件的构建或安装入口。

这次移除仅涉及插件目录和仓库导航；课程、教练实现未更改。原有代码和审计记录可从 Git 历史恢复。
