# Arena 错题重跑与页面拆分

## Scope / Locality

沿用 Arena CLI 的规则筛选、blind observation、runner、MCP/RAG 和归档，增加从原错误 runId/caseOrdinal 选择同一决策的入口。单题直接重跑与控制台错题库批次均由已有 console job 串行执行；每题保留独立新归档，无新队列或数据库。代码仅触及 Arena 的 bin、可选 archive 元数据与本机控制台。

页面为 `/` 实验控制台、`/results` 实验结果、`/mistakes` 错题集、`/settings` 模型与 API 配置、`/model-info` 模型运行配置。导航由 `bin/arena-pages.mjs` 统一渲染；结果详情和配置为页面内容，取消弹窗。面板随内容展开，保留浏览器文档的自然垂直浏览，不使用面板内嵌套滚动或隐藏溢出掩盖内容。

## Invariants / Traceability

- INV-013（已强制）：原记录仅用于重建相同 sourceRecordHash + canonicalDecisionOrder，按原候选 digest 和 Mortal 身份校验；规则与盲输入仍走既有 owner，不把旧提交、错误理由或评分传入模型。`selectReplayCase` 回归覆盖错题与批次局部下标的区别、候选变动拒绝。既有隔离测试继续适用。
- INV-011/012（未改契约）：不进入生产 Coach 生成、ReviewReport 或 ReviewSession；架构检查与类型/构建保护既有依赖。
- 历史事实归原 manifest/events/summary 所有。新 manifest 仅追加可选 replay 来源元数据；已有归档不改写。错题归题键保持相同，累计错误次数不因重跑匹配而清零；有效评分数增加后错误率重算。history 包含匹配、未匹配、缺标签和执行失败；snapshots 保留错误子集。
- 每次启动冻结错题列表、模型与预算；重复启动在现有单作业边界返回 409；修改配置不改变在途作业。控制台批次按错题错误次数排序取范围，单题显式绑定 questionId，不要求用户提交 JSON。

## Replaceability / Recoverability / Semantic Load

无新增架构级抽象；重跑选择扩展既有 CLI，归档展示扩展既有控制台。未知错题、来源/候选/评分基准变动在模型调用前拒绝；执行中止和实际模型失败仍按原终态保存。输送失败不改写旧运行，不通过自动重试整题掩盖失败。

## Verification

实现阶段：desktop build 通过；Node 四个脚本 18/18；Vitest 控制台/题库/错题/archive 四套件 25/25；架构检查 7 packages / 528 files / 2582 imports / 0 violations。浏览器确认五页导航同源、独立配置与结果页面。后续真实重跑与最终页面证据保存在工作区 `review-loop-closeout-artifacts/2026-10-16-arena-pages/`，运行记录仍以本机 reports 为准。
