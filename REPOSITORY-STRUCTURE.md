# 仓库结构与项目边界

本仓库包含日麻教学与日麻教练两个项目，各自维护代码、测试和文档。

```text
MjsoulTileTrace/
├─ README.md
├─ REPOSITORY-STRUCTURE.md
├─ REPOSITORY-MIGRATION-PLAN.md
├─ course/
│  ├─ README.md
│  ├─ docs/
│  ├─ lessons/
│  ├─ assets/
│  ├─ lib/
│  └─ tests/
└─ coach/
   ├─ README.md
   ├─ docs/
   │  └─ development/
   ├─ packages/
   ├─ scripts/
   └─ tools/
```

## 日麻教学

`course/` 是静态牌效率课程、分析器和训练器。课程运行与测试入口见 [course/README.md](course/README.md)，课程设计和验收记录由 course/docs 维护。

## 日麻教练

`coach/` 是 Electron 复盘教练，包含雀魂牌谱接入、canonical 重放、模型适配和证据型分析。运行与测试入口见 [coach/README.md](coach/README.md)，当前开发说明见 [coach/docs/development/README.md](coach/docs/development/README.md)。

教练的效率分析器仍引用 course/lib/mahjong.mjs。更改共享课程引擎时应同时检查教练消费者。

## 仓库级文件

根目录仅维护项目导航、Git 配置和历史迁移记录。产品的规格、路线图、验收和运行说明归对应项目；各项目从自身目录执行 README 中的检查。

`.tools/`、临时工作树、诊断数据和构建产物属于本地开发资源，不随产品提交。

2026-10-07，雀魂摸切插件移出本仓库，转由 [majsoul_moqie](https://github.com/ChildeRolando/majsoul_moqie) 独立维护。
