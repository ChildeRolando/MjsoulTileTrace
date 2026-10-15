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

最终补充：全 workspace typecheck 通过；INV-013 的 case/runner 两套件额外 31/31。Codex 代码审核覆盖选择绑定、在途配置冻结、单作业冲突、历史追加、条件分母、配置密钥和五页导航；无未解决 P1/P2。五页在 375px / 1440px 检查，未见横向溢出或面板内嵌套滚动；配置保存仍为 gpt-6-luna/high、8192 输出 tokens、100M 报警线。

## 真实重跑回执

三次真实执行均绑定干净代码 `0a5cf028ed3725f000c36d7cf3d6d1b44d9ff26b`；之后只补页面提示与验收文字，不改变重跑、取证、评分或用量逻辑。均使用本机订阅 gpt-6-luna/high、6 轮、4 工具、8192 输出 tokens、逐题 300 秒。

| 页面入口 | 新运行 | 原局决策（从 0 计） | 结果 | 已报告 tokens |
|---|---|---:|---|---:|
| 错题集“重跑这一题” | `4250b02f-ab9e-48b8-a09f-bc779f1e2b83` | 2 | completed / not_matched | 80,239 |
| 实验控制台“错题集”，第 1 题 | `d33fd596-c83b-48da-9328-a7e6f280e10a` | 2 | completed / not_matched | 81,838 |
| 同一两题批次，第 2 题 | `bc30d237-a7cd-44f6-9b0f-1fef3121ce2e` | 1 | completed / not_matched | 55,092 |

合计 217,169 tokens，其中缓存输入 89,856 tokens（输入子集，不重复相加）。每次均真实调用 helper；三次执行成功，均未匹配 Mortal，不以匹配率作为功能门槛，也不改写答案。累计错题仍为 3 道，错误次数 6→9；两道被重跑题目的历史为 2→4、2→3，另一个旧错题保留 3 次历史（含一次执行失败）。单题页面在未手动刷新的情况下自动显示 3 次错误、3 次有效评分与新快照，批次最终也自动写回。

逐次核验新/原 manifest 的源、原决策、候选集合、Mortal 身份完全一致；去掉每轮重新生成的 opaque alias 后，blind observation 的事实与原题一致。一次重跑的结果又作为下一次的来源，仍定位同一原局决策。三份离线 inspect 复算通过；所有旧历史条目逐项保留，20 份旧 summary SHA-256 与先前验收回执一致。证明“匹配后分母增加、错误率降低且保留原错题”的测试通过；本次真实三题均未匹配，故实际错误率保持 100%。

本机证据：`before.json`、`single-replay.json`、`batch-replay.json`、`replay-verification.json`、`workspace-console.png`、`mistakes-history.png`。全部实施、审核、运行均在 Codex；没有新建 Multica 流程工单或重启 Controller。
