# Arena small-to-big 与上下文增强

本轮实现两个可独立装配的本地检索步骤，保留原检索默认行为及旧知识库、旧研究档案。不是 Graph RAG；不新增向量库、外部服务、摘要模型或规则引擎。知识卡仍为经原文核对的 `coach-scene-knowledge-web/v2`，没有重新收窄适用条件。

## 装配与边界

沿用 `@riichi-coach/desktop/blind-discard-arena-rag` 的 `ArenaRagRetriever` 端口：

```js
const retriever = createArenaRagRetriever({
  mode: 'local', caseRef, aliases, loadCorpus,
  components: { smallToBig: true, contextEnrichment: true },
  onComponentTrace: trace => localArchive.push(trace),
});
const tool = createArenaRagRunnerTool({
  caseRef, retriever, maxPassagesPerQuery: 3,
});
// 在 Arena runBlindCoachCase 的 tools 中装配 tool。
```

省略 `components` 或两个开关均为 false，保持 `arena-local-terms/v1` 的结果、排序和来源别名。可单独启用任意一步；组合版本为 `arena-context-terms/v1/s1e1`。实验组配置、组件身份、输入与结果单独冻结。

- **small-to-big**：按中文句界/换行切出可定位的小块，保留父卡内 UTF-16 起止位置。用原分词、原词项评分检索小块，同父卡只取最佳命中，再返回完整父卡。旧版本已经返回全文卡片，本次新增的是小块定位与父卡聚合，不能把原有全文返回计作新能力。
- **上下文增强**：确定性加入原有教材标题、章节、主题、知识版本与来源体系，参与检索并在预算内随父卡返回。没有按局面生成新知识，没有把规则阈值变成卡片准入条件。
- **预算**：正文仍限 1000 字符。预算不足先省略附加上下文，绝不截断父卡的条件/例外。每次最多 3 张、2 次查询、6 张去重父卡；次数和跨查询去重由既有实验包装器管理。模型自行决定是否查询、查询措辞与主题过滤。
- **引用**：仅为实际返回的父卡登记现有 opaque 来源引用；兄弟小块不增加引用数。原文 URL/版本/HTML 哈希由冻结知识集回溯。原始网页中未核对的图例和相邻残缺段落不纳入扩展。
- **事实隔离**：组件只消费知识库与查询，不能获得实际行动、Mortal、未来事件或他家暗手。RAG 内容属于资料，不能授予工具权限或来源引用。未改变事实与合法动作权威。

工具主题及适用性枚举现在直接来自 contracts 的 Zod 枚举；公开给模型的每次条数上限与执行校验一致。默认仍为原通用上限 5；本实验装配为 3。

## 独立试验

基线提交 `ff30658eaf9427e03fd00e565f492050f75f1b66` 在原工作区保留，新工作区 `E:/AgentWorkspaces/Coach/arena-context-rag`。旧 v1/v2 研究目录未写入。

新档案：`E:/AgentData/Coach/context-rag-study-20261023-r1`。
初次开发失败档案：`E:/AgentData/Coach/context-rag-study-20261023`。

10 场新真实牌谱，每场随机一个合法弃牌窗口；整场排除旧 120+60 局面及旧准备池涉及的牌谱。先 2 手开发试跑，后 8 手冻结配对对照。两组均修复主题枚举、使用相同完整可见状态及候选事实，不注入模式提示。知识 v2 完全相同，模型冻结为 Coach 无持久设置时的现有默认 `gpt-6-luna / max`。执行顺序预先随机，独立上下文，固定并发 2，不自动重试。初始请求的逐局同一性在报告中验证。

生成前的 8 手知识需求由助手根据可见事实预标，并在正式执行前绑定哈希；它是诊断基准，**不是日麻专家金标准**。主报告分别记录检索覆盖、已知不适用卡命中、无结果、主动不检索、引用有效性、成功/失败、耗时、输入/缓存/输出/总 token。缓存包含在输入，不重复相加。失败缺失用量记为未知。配对 token 比与召回差按完整牌谱重采样；8 场单次生成只用于首轮诊断。

另有 12 条人工编写的固定查询，四种开关组合均运行，其中 10 条中文概念和 2 条英文主题标识分开解释。它们验证检索机制，不计入真实牌局成绩，也不消耗 LLM token。

初次 4 次开发运行在结束评分时因新增了未受契约支持的 unavailable reason 而报错，保留全部记录；其用量丢失不能补写为 0。修复复用既有 `not_requested_in_scene_study`，在脚本加载时检查枚举，新增逐轮请求、响应和事件落盘。r1 重新冻结，不覆写原失败。没有根据正式评测结果调整检索。

## 重现

先在本工作区安装锁定依赖并运行 `npm run build`，具备与原研究相同的本地 libriichi/事实引擎资产。不要在旧研究工作区构建新检索器。

```js
import { prepare } from './scripts/context-rag/prepare.mjs';
import { freeze, run, recover } from './scripts/context-rag/experiment.mjs';
import { report } from './scripts/context-rag/report.mjs';

await prepare({ out, database, previous });
await freeze(out, 'scripts/scene-study/knowledge-v2.json');
await run(out, 'pilot');
// 生成前人工或指定评审填写 needs.json，并绑定 datasetHash、knowledgeHash。
await run(out, 'evaluation');
await report(out, failedPilotDirectory);
```

各调用从 coach 根目录执行。`previous` 指向旧 scene-pattern-study 根；`database` 只读。相同输入可恢复运行，已保存失败也会跳过；进程死亡时先 `recover(out)` 将未完成尝试记为 interrupted，不自动重花预算。冻结后输入/运行代码改变会拒绝继续，须新建实验目录。`report` 要求全部 16 次正式尝试存在，校验需求哈希；输出 `metrics.json`、`REPORT.md` 和复用 Arena 四家牌桌的 `review/index.html`，可直接阅读卡片及原教材链接。

也可使用 `npm run context-rag -- run --out <目录> --split evaluation`；同一入口支持 prepare / freeze / recover / probes / report。`npm run test:context-rag` 运行该范围的主要回归。

## Change Control Report

- Scope / Locality：desktop 既有 Arena RAG 与 runner owner 内扩展；实验装配及统计留在 scripts/context-rag。没有新增包/生产调用边。
- Invariants：contracts 枚举为唯一来源；测试保护工具枚举/限额、父卡条件完整、同父去重、返回引用、缺失来源拒绝、禁入标签字段。既有 Arena runner、场景事实、模式与归档隔离回归保留。
- Traceability：新检索块来自固定卡片精确字符区间；上下文来自既有元数据。版本、知识哈希、模型、每轮请求/响应及来源映射在离线档案留存。
- Replaceability：仍返回 ArenaRagRetriever，可由原检索器或其他端口实现替换；组件独立开关，不修改 runner/provider 协议。
- Recoverability：契约错误在局部校验/测试暴露；实验目录锁、冻结指纹、显式恢复、失败归档沿用现有机制。
- Semantic Load：无新架构级抽象；两个纯函数步骤和布尔装配项折叠在现有本地 retriever 中。
- Verification：实际执行的测试与试验结果见 RESULTS.md；不以机械引用检查冒充语义支持或专家盲评。
