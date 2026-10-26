# Self-RAG 资料适用性过滤：逐文件实施计划

日期：2026-10-27
状态：设计冻结后待执行。契约与不变量见 [冻结规格](../specs/2026-10-27-self-rag-applicability.md)；
本页只安排文件顺序、测试与接受方式，不重复契约内容。两位成员从本设计合入后的同一 commit 开始并行。

## 0. 执行顺序总览

```text
设计合入（本票）
  ├─ 成员 A：contracts → applicability 模块 → runner 接线 → archive → CLI → 测试 → 真实 smoke
  └─ 成员 B：corpus/排除 → 单决策与查询冻结 → prejudge → schedule → 两臂 harness → 报告
两条 lane 完成后（父票集成阶段）
  └─ 合并 → 固定候选真实实验 → 结果落 SELF_RAG_EXPERIMENT.md → living docs 更新
```

A、B 之间唯一的同步点是规格 §7 的冻结导出签名与契约 schema；两边都不改对方文件。

## 1. 成员 A：selector + runtime 接线

### 1.1 `coach/packages/contracts/src/blind-discard-arena-applicability.ts`（新增）

1. 常量：`ARENA_RAG_APPLICABILITY_GATE_VERSION`、`ARENA_RAG_APPLICABILITY_PROMPT_VERSION`、
   `ARENA_RAG_APPLICABILITY_LIMITS_V1`、`ARENA_RAG_GATED_CONDITIONS`、`ARENA_RAG_VISIBILITY_FIELDS`、
   `ArenaRagApplicabilityFailureCodeSchema`。
2. Schema：facts / verdicts / result / receipt / limits（全部 `.strict()`，verdict 用判别联合）。
3. `projectArenaRagApplicabilityFacts(observation)`：显式键表构造，不复用 spread。
4. `isApplicabilityConditionSatisfied(condition, observation)`：只实现 `complete-visibility-only`。
5. `arenaRagRetrievalDigest(result)`：canonical digest，供 selector 回填与 runtime 复核。
6. `coach/packages/contracts/src/index.ts` 增加一行 `export * from "./blind-discard-arena-applicability.js";`。

测试先行：schema 正反例、投影不含 `tools`、digest 稳定性、条件核验。

### 1.2 `coach/packages/desktop/src/blind-discard-arena-rag-applicability.ts`（新增）

1. 提示词常量与 `submit_applicability_verdicts` 严格工具定义（判别联合用 `anyOf`，参照现有
   `finalSubmissionTool` 的写法）。
2. `createArenaRagApplicabilityGate({ provider, caseRef, limits?, clock? })`：
   - 组装两条消息（system + user JSON），输入超过 `maxInputBytes` → `input_too_large` 降级；
   - 用 `provider.request(request, signal)` 发一次调用，不重试；
   - 解析 `ArenaToolCallProviderResult`：非 `ready` → 对应失败码降级；
   - 严格解析 verdicts，执行规格 §4.3 的整批/逐条两层校验；
   - 计算保留集合、构造 `ArenaRagApplicabilityResult` 与 receipt；
   - 超时：内部 `AbortController`，与传入 signal 串联；到期 abort 后 await provider settle。
3. 语言层不导入任何 grading/label 类型；`observation` 是唯一事实来源。

测试（`coach/packages/desktop/tests/blind-discard-arena-rag-applicability.test.ts`，新）用 fake
`ArenaToolCallProvider`：

- `relevant/uncertain/irrelevant` 保留与剔除；
- 重复/缺失/新增 ref、digest 不符 → 整批降级且保留全部；
- `declared-condition-absent` 条件成立/不成立；
- `visible-fact-contradiction` 证据越界 → 该条降级为 uncertain；
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

### 1.7 A 的完成门

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

## 2. 成员 B：paired 实验 harness

### 2.1 `coach/scripts/selfrag-study/corpus.mjs`

- `node:sqlite` `DatabaseSync(file, { readOnly: true })`；只读取 `games` / `variants` / `observations`。
- 导出候选牌局与 `gameHash`；任何写操作都不存在。测试用临时只读夹具，断言不会创建 WAL 文件。

### 2.2 `coach/scripts/selfrag-study/prepare.mjs`

1. 读取三个历史实验目录，提取已用牌局身份；构建 `exclusions.json`（含来源与摘要）。
   身份无法恢复的牌局标为不合格并计数。
2. 按 `sha256(seed + "\0" + gameHash)` 升序取 2 pilot + 8 evaluation。
3. 对每局：map → canonical stream → `replayCanonicalStream` → 按冻结规则选一个决策 →
   `createArenaBlindRuleRequest` + `queryRules` 取候选 → `screenArenaDecisions` 复用既有筛选 →
   `createArenaBlindObservation`（per-case alias vault，仅存私有 artifact 目录）。
4. 冻结 `requests.json`（固定查询规则生成的 `ArenaRagRequest`）。
5. 调用 `createArenaRagRetriever` 得到每 case 的原始片段，跑 prejudge（独立提示词/上下文），写
   `prejudge/*.json`。
6. 写 `freeze.json`：corpus 文件哈希、排除/抽样/查询/预判摘要、代码 SHA，以及规格 §9.0 的完整执行身份：
   `codex-cli 0.162.1`、可执行文件 SHA-256 与字节数、`gpt-6-luna`、`high`、各提示词版本、语料版本。
7. 最小化复用：只移植 CLI 里必要的 pinned runtime bootstrap，不整段复制 `blind-discard-arena.mjs`。

测试：排除集、抽样确定性、单决策规则、冻结摘要、prejudge 不读 gate 输出。

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
- 固定声明：AI prejudge 不是专家真值；10 局不声称显著性；质量无改善按实报告。

### 2.6 `coach/bin/selfrag-study.mjs`

- 子命令 `prepare / verify / run / report`；`verify` 在开跑前核对干净 HEAD、冻结摘要、provider 可执行版本
  （精确 `codex-cli 0.162.1`）与可执行文件 SHA-256；任一项不符即停止。

### 2.7 B 的完成门

```powershell
node --test coach/scripts/selfrag-study/*.test.mjs
node bin/selfrag-study.mjs verify <artifact-dir>
```

harness 测试不联网、不调用模型；真实 20 次运行属于父票集成阶段的实验执行，不属于 B 的编码完成条件。

## 3. 共享与冲突规则

1. A 独占：`coach/package.json`、`coach/packages/*/package.json`、`contracts/src/index.ts`。
2. B 独占：`coach/bin/selfrag-study.mjs`、`coach/scripts/selfrag-study/**`、
   `coach/docs/development/SELF_RAG_EXPERIMENT.md`。
3. 双方都不在实现 lane 中改 `docs/development/README.md`、`ROADMAP.md`、`VERIFICATION.md`、`ARCHITECTURE.md`。
4. 若 B 发现 A 的导出签名需要变化，先写进父票评论，不在自己分支里改 A 的文件。
5. 两个 PR 各自独立；父票集成阶段再按真实实验更新 living docs。

## 4. 父票集成阶段的实验执行清单

1. 固定已合入候选 SHA（干净工作树）。
2. 复核 §2.2 的 0.162.1 兼容证据（版本、哈希、已实测面）；补跑未实测的失败/超时路径；不通过则 BLOCKED 并停止，
   不改整盘断言、不放宽解析。
3. `prepare` → `verify` → `run`（20 次）→ `report`。
4. 把真实数字写入 `coach/docs/development/SELF_RAG_EXPERIMENT.md`，失败与限制原样保留。
5. 按结果更新 ROADMAP/README 状态；门控保持 opt-in，不修改生产默认。
6. 父票保留至生产接入、真实运行并行证据、结果文件与结论核验完成。
