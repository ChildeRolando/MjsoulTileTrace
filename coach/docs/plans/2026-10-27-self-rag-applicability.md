# Self-RAG 资料适用性过滤：逐文件实施计划

日期：2026-10-27
状态：设计冻结后待执行。契约与不变量见 [冻结规格](../specs/2026-10-27-self-rag-applicability.md)；
本页只安排文件顺序、测试与接受方式，不重复契约内容。两个工单由同一个现有 Ticket 编码执行器在各自的
独立工作树并行执行，从本设计合入后的同一 commit 开始；不新增队长、成员或小队抽象。

## 0. 执行顺序总览

```text
设计合入（本票）
  ├─ 工单 A：contracts → applicability 模块 → runner 接线 → archive → CLI → 测试 → 真实 smoke
  └─ 工单 B：研究语料/场景层抽样 → 单决策与查询冻结 → prejudge → schedule → 两臂 harness → 报告
两条 lane 完成后（父票集成阶段）
  └─ 合并 → 固定候选真实实验 → 结果落 SELF_RAG_EXPERIMENT.md → living docs 更新
```

两条 lane 之间唯一的同步点是规格 §7 的冻结导出签名与契约 schema；两边都不改对方文件。

## 1. 工单 A：selector + runtime 接线

### 1.1 `coach/packages/contracts/src/blind-discard-arena-applicability.ts`（新增）

1. 常量：`ARENA_RAG_APPLICABILITY_GATE_VERSION`、`ARENA_RAG_APPLICABILITY_PROMPT_VERSION`、
   `ARENA_RAG_APPLICABILITY_LIMITS_V1`、`ARENA_RAG_GATED_CONDITIONS`、`ARENA_RAG_VISIBILITY_FIELDS`、
   `ArenaRagApplicabilityFailureCodeSchema`。
2. Schema：facts / verdicts / result / receipt / limits（全部 `.strict()`，verdict 用判别联合）。
3. `projectArenaRagApplicabilityFacts(observation)`：显式键表构造，不复用 spread。
4. `ARENA_RAG_VISIBLE_FACT_PATHS` 与逐路径只读投影；`isApplicabilityConditionSatisfied(condition, observation)`
   只实现 `complete-visibility-only` 这一个**确定性特例**（不是唯一剔除通道）。
5. `assertPassageBinding` 与 `assertVisiblePremises` 两个独立校验函数：前者只认候选片段 `sourceRefs`，
   后者只认观测 DTO 的可见证据引用域；不取并集、不求交集。
6. `arenaRagRetrievalDigest(result)`：canonical digest，供 selector 回填与 runtime 复核。
7. `coach/packages/contracts/src/index.ts` 增加一行 `export * from "./blind-discard-arena-applicability.js";`。

测试先行：schema 正反例、投影不含 `tools`、digest 稳定性、可见事实路径逐条投影、条件核验、两个引用域分别校验。

### 1.2 `coach/packages/desktop/src/blind-discard-arena-rag-applicability.ts`（新增）

1. 提示词常量与 `submit_applicability_verdicts` 严格工具定义（判别联合用 `anyOf`，参照现有
   `finalSubmissionTool` 的写法）。
2. `createArenaRagApplicabilityGate({ provider, caseRef, limits?, clock? })`：
   - 组装两条消息（system + user JSON），输入超过 `maxInputBytes` → `input_too_large` 降级；
   - 用 `provider.request(request, signal)` 发一次调用，不重试；
   - 解析 `ArenaToolCallProviderResult`：非 `ready` → 对应失败码降级；
   - 严格解析 verdicts，执行规格 §4.3 的两层校验：结构/身份/绑定整批失败，只对可机械判定的情形逐条降级；
   - **不**因语义理由无法机械证明而降级；语义理由成立性留给独立评估；
   - 计算保留集合、构造 `ArenaRagApplicabilityResult` 与 receipt；
   - 超时：内部 `AbortController`，与传入 signal 串联；到期 abort 后 await provider settle。
3. 语言层不导入任何 grading/label 类型；`observation` 是唯一事实来源。

测试（`coach/packages/desktop/tests/blind-discard-arena-rag-applicability.test.ts`，新）用 fake
`ArenaToolCallProvider`：

- `relevant/uncertain/irrelevant` 保留与剔除；
- 重复/缺失/新增 ref、digest 不符 → 整批降级且保留全部；
- 合法可见证据引用不属于候选 `sourceRefs` → 接受（两个域不取交集）；
- 候选 `sourceRef` 被当 `evidence-ref` 且不在可见证据域 → 整批失败（两个域不取并集）；
- `fact` premise path/observedValue 正确 → 接受；path 不在冻结表或值不等 → 整批失败；
- 语义错误的 `irrelevant` 不被程序降级（effectiveVerdict 仍为 irrelevant）；
- `complete-visibility-only` 特例：条件满足却被声称不满足 → 该条降级为 uncertain；
- 片段原文逐字节不变；注入式文本不改变结构；
- provider 返回 provider_error/timeout/cancelled/invalid → 降级与失败码；
- usage 缺省 → `null`，不补零；
- receipt 超 `maxReceiptBytes` → `receipt_too_large` 降级；
- canary：grading label 字符串不出现在发给 provider 的请求里。

### 1.3 `coach/packages/desktop/src/blind-discard-arena-runner.ts`

1. `ArenaRunnerTool` 增加可选 `applicabilityGate`（规格 §4.6）。
2. 在 `parseOutput` 之后、`references` 之前调用；之后再 `parseOutput(gate.output)`。
3. 每次调用：预算判定（call/byte）、独立计时器、abort 串联、失败降级、`usage`/`elapsedMs` 收集。
4. `tool_result` 追加可选 `reflection` 字段。
5. 结果新增可选 `applicability` 汇总；生成器 `providerUsage` 语义不变。
6. 未开启门控时走原路径，事件与结果逐字节一致（回归断言）。

测试（`blind-discard-arena-runner.test.ts` 扩展）：门控成功/降级/skipped、调用预算、输出预算、
run 取消与超时、provider 未 settle 的 orphan 终态、无门控路径不变。

### 1.4 `coach/packages/desktop/src/blind-discard-arena-archive.ts`

1. `rag.applicability` 可选字段（manifest）。
2. `summary.applicability` 可选聚合与 `evidence` 里的门控计数。
3. 历史 manifest/summary 继续通过 strict 解析（用现有 fixture 做回归）。

### 1.5 `coach/bin/blind-discard-arena.mjs`

1. `--rag-applicability` 解析与组合校验（§6）。
2. `runCommand` 构造门控：`createArenaRagApplicabilityGate({ provider: descriptorProvider, caseRef })`，
   挂到 `createArenaRagRunnerTool`。
3. manifest 仅在开启时写入 `rag.applicability`。
4. `usage()` 帮助文本增加一行。

### 1.6 文档 owner

- `coach/docs/specs/2026-10-09-blind-discard-arena.md`：加一行指向本规格的 RAG 适用性指针。
- `coach/docs/development/INVARIANTS.md`：INV-013 Enforcement 补门控边界与新增测试文件名。

### 1.7 工单 A 的完成门

```powershell
npm run typecheck
npm run build
npx vitest run packages/desktop/tests/blind-discard-arena-rag-applicability.test.ts packages/desktop/tests/blind-discard-arena-runner.test.ts packages/desktop/tests/blind-discard-arena-rag.test.ts packages/desktop/tests/blind-discard-arena-archive.test.ts
npx vitest run
npm run check:architecture
npm run test:package-import
```

真实 smoke（补齐 §2.2 未实测项：失败/超时路径；已实测项复核 CLI 版本与可执行文件哈希）：干净提交上
`node bin/blind-discard-arena.mjs run --dataset blind-discard-smoke-v1 --max-cases 1 --rag local --rag-applicability applicability-v1 --provider codex-cli --model gpt-6-luna --reasoning-effort high`，
回读 archive 的 `manifest.rag.applicability`、`events.jsonl` 的 `tool_result.reflection`、`summary.applicability`。
未通过时在 PR 里如实写 BLOCKED 与原因，不以单元测试冒充真实链路。

## 2. 工单 B：paired 实验 harness

### 2.1 `coach/scripts/selfrag-study/corpus.mjs` 与 `knowledge.mjs`

- `corpus.mjs`：`node:sqlite` `DatabaseSync(file, { readOnly: true })`；只读取 `games` / `variants` / `observations`。
  导出候选牌局与 `gameHash`；任何写操作都不存在。测试用临时只读夹具，断言不会创建 WAL 文件。
- `knowledge.mjs`（新）：只读打开研究 `knowledge.json`，按规格 §9.1.2 的 allow-list 读取每张卡的
  `source`/`conditions`/`exceptions`/`content`，导出 `researchSubsetDigest` 与 20 张冻结子集的转换结果。
  不得写回、不得复制进仓库；任一卡字段超限或缺失即抛 `research_corpus_invalid`。

### 2.2 `coach/scripts/selfrag-study/prepare.mjs`

1. 只读读取研究语料 `E:/AgentData/Coach/scene-pattern-study-20261023-kb-v2/knowledge.json`：
   校验文件 SHA-256、`coach-scene-knowledge-web/v2`、40 张卡；按规格 §9.1.2 的转换规则生成 20 张冻结子集，
   写 `research-subset.json`（逐卡原出处/适用条件/例外/完整摘要/内容哈希）与 `researchSubsetDigest`；
   任一卡超限或校验失败 → `research_corpus_invalid` 停止，不截断、不替换。
2. 读取三个历史实验目录，提取已用牌局身份；构建 `exclusions.json`（含来源与摘要）。
   身份无法恢复的牌局标为不合格并计数。
3. 场景层抽样（规格 §9.1.1）：按预声明槽位 `pilot:[SL1,SL3]`、`evaluation:[SL2,SL4,SL5,SL1,SL2,SL3,SL4,SL5]`
   与 `sha256(seed + "\0" + gameHash + "\0" + slotIndex)` 选局；某槽位无匹配 → `insufficient_scene_coverage`
   在任何模型调用前停止。不再用全局最早决策代替。
4. 对每局：map → canonical stream → `replayCanonicalStream` → 在该场景层内选一个合格决策 →
   `createArenaBlindRuleRequest` + `queryRules` 取候选 → `screenArenaDecisions` 复用既有筛选 →
   `createArenaBlindObservation`（per-case alias vault，仅存私有 artifact 目录）。
5. 冻结 `requests.json`（固定查询规则生成的 `ArenaRagRequest`，不得设置 `filter.topics`/`context.topic`），
   并用 `createArenaRagRetriever` + 研究 corpus 写出 `candidates.json`（两臂共用同一批原始候选）。
6. 跑 prejudge（独立提示词/上下文，不看 selector 输出）写 `prejudge/*.json`；若全部预判没有任何
   `irrelevant` → 报告 `prejudge_no_irrelevant_instances` 并在两臂运行前停止。
7. 写 `freeze.json`：研究知识文件哈希与子集 digest、排除/场景层/抽样/查询/预判摘要、代码 SHA，
   以及规格 §9.0 的全部执行身份：`codex-cli 0.162.1`、可执行文件 SHA-256 与字节数、`gpt-6-luna`、`high`、
   各提示词版本、语料版本、`selectorBudget` ladder。
8. 最小化复用：只移植 CLI 里必要的 pinned runtime bootstrap，不整段复制 `blind-discard-arena.mjs`；
   旧 `scene-study` 代码只作线索，不沿用其硬编码样本或 base commit。

测试：研究语料哈希/转换/超限拒绝、`topics` 映射不改变候选集、场景层抽样与无匹配停止、排除集、
确定性抽样、单决策规则、冻结摘要、prejudge 不读 gate 输出。

### 2.3 `coach/scripts/selfrag-study/schedule.mjs`

- 生成固定 20 条 `{ caseId, arm, ordinal }` 顺序并摘要。
- attempts ledger：同一 `(caseId, arm)` 第二次运行直接拒绝（pilot 重跑需显式 `--pilot-rerun` 并单列）。

### 2.4 `coach/scripts/selfrag-study/run.mjs`

- 两臂唯一差异是交付片段；其余请求逐字节一致。
- selfrag 臂调用 `createArenaRagApplicabilityGate`，记录 receipt、usage、耗时。
- 每次运行落 `runs/<caseId>/<arm>/<attempt>.json`：完整请求、响应、usage、耗时、失败码；不重试、不删失败。

### 2.5 `coach/scripts/selfrag-study/report.mjs`

- 产出 `report.json` + `report.md`：逐 case 表、两臂聚合、配对差、token 分解（生成器/selector/合计/未知）、
  失败、真实耗时、drop precision、useful drop rate、uncertain 保留、citation error。
- 过滤通道分解：机械特例剔除数、三种语义 `basis` 剔除数、`downgradedVerdictCount`、整批 `degraded` 次数。
- 语义理由独立判读：对全部 `irrelevant` 报告理由成立/不成立/无法判断的计数（判读提示词跑前冻结）。
- 固定声明：AI prejudge 不是专家真值；10 局不声称显著性；质量无改善按实报告；
  剔除全部来自机械特例或 selector 大面积降级时，写“本批未能检验语义过滤效果”。

### 2.6 `coach/bin/selfrag-study.mjs`

- 子命令 `prepare / verify / run / report`；`verify` 在开跑前核对干净 HEAD、冻结摘要、provider 可执行版本
  （精确 `codex-cli 0.162.1`）与可执行文件 SHA-256；任一项不符即停止。

### 2.7 工单 B 的完成门

```powershell
node --test coach/scripts/selfrag-study/*.test.mjs
node bin/selfrag-study.mjs verify <artifact-dir>
```

harness 测试不联网、不调用模型；真实 20 次运行属于父票集成阶段的实验执行，不属于工单 B 的编码完成条件。
`verify` 必须核对研究知识文件 SHA-256、子集 digest、转换规则版本、场景层抽样摘要与 `selectorBudget`。

## 3. 共享与冲突规则

1. 工单 A 独占：`coach/package.json`、`coach/packages/*/package.json`、`contracts/src/index.ts`。
2. 工单 B 独占：`coach/bin/selfrag-study.mjs`、`coach/scripts/selfrag-study/**`、
   `coach/docs/development/SELF_RAG_EXPERIMENT.md`。
3. 两个工单都不在实现 lane 中改 `docs/development/README.md`、`ROADMAP.md`、`VERIFICATION.md`、`ARCHITECTURE.md`。
4. 若工单 B 发现工单 A 的导出签名需要变化，先写进父票评论，不在自己分支里改对方的文件。
5. 两个 PR 各自独立；父票集成阶段再按真实实验更新 living docs。

## 4. 父票集成阶段的实验执行清单

1. 固定已合入候选 SHA（干净工作树）。
2. 复核 §2.2 的 0.162.1 兼容证据（版本、哈希、已实测面）；补跑未实测的失败/超时路径；不通过则 BLOCKED 并停止，
   不改整盘断言、不放宽解析。
3. `prepare` → `verify` → `run`（20 次）→ `report`。
4. 把真实数字写入 `coach/docs/development/SELF_RAG_EXPERIMENT.md`，失败与限制原样保留。
5. 按结果更新 ROADMAP/README 状态；门控保持 opt-in，不修改生产默认。
6. 父票保留至生产接入、真实运行并行证据、结果文件与结论核验完成。
