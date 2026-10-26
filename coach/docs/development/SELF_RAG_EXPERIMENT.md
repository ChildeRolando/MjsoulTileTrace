# Self-RAG 配对实验协议与结果

日期：2026-10-27
状态：**工具已实现并通过纯函数/夹具验证；正式 20 次模型评估未运行。**

本文件是该实验**真实结果**的 owner。契约与不变量见
[冻结规格](../specs/2026-10-27-self-rag-applicability.md)（下称“规格”）；
文件顺序与执行门见 [实施计划](../plans/2026-10-27-self-rag-applicability.md)（工单 B）。
本文件只记录协议摘要、实际运行方式与真实结果；未产生真实结果的部分明确写“未运行”，不以单元测试代替。

## 1. 当前能证明与不能证明的事实

| 项 | 状态 |
|---|---|
| 研究语料只读转换（20 张冻结子集、哈希、后置条件、超限拒绝） | 已实现并有夹具测试 |
| 场景层定义、槽位抽样、单决策冻结、排除集 | 已实现并有纯函数测试 |
| 冻结查询（不设置 `filter.topics` / `context.topic`） | 已实现并有测试 |
| 原始候选、预判校验、20 次顺序、attempts ledger、重复拒绝 | 已实现并有测试 |
| 两臂请求除交付片段外逐字节一致；用量分列、逐字段校验且未知不补零 | 已实现并有测试 |
| 指标计算、通道分解、限制声明、理由判读契约 | 已实现并有测试 |
| 与工单 A 的真实门控联通 | **未验证**：A 的 `blind-discard-arena-rag-applicability` 尚未合入；harness 用夹具 gate 验证纯函数，`prepare`/`run` 在真实导入失败时以 `applicability_gate_unavailable` 停止 |
| pilot（2 局）与 evaluation（8 局）真实运行 | **未运行** |
| 真实质量、token、失败与耗时数字 | **未产生**；本文件不给出任何质量结论 |

`prepare` 在没有工单 A 导出的环境会直接失败并报 `applicability_gate_unavailable`；它不会把 mock gate 当作已集成，
也不会伪造候选或判定。

## 2. 运行入口与产物

```text
node bin/selfrag-study.mjs prepare --artifacts <dir> --seed <seed>
node bin/selfrag-study.mjs verify  --artifacts <dir> [--phase pilot|evaluation]
node bin/selfrag-study.mjs run     --artifacts <dir> [--phase pilot|evaluation] [--case <id>] [--arm baseline|selfrag]
node bin/selfrag-study.mjs report  --artifacts <dir> [--judge-reasons]
```

产物目录（本地私有，不入仓、不发布）：

| 文件 | 内容 |
|---|---|
| `freeze.json` | 代码 SHA、seed、场景抽样、研究语料/子集/排除/查询/候选/观测/预判/顺序摘要、执行身份、selector 预算 ladder |
| `research-subset.json` | 20 张研究卡的冻结转换结果（原出处、条件、例外、原文、转换片段、逐字段可见性与哈希） |
| `exclusions.json` | 三个历史实验的已用牌局身份与来源文件哈希 |
| `requests.json` / `candidates.json` | 冻结查询与两臂共用的原始候选片段 |
| `observations/<case>.json` | 每个 case 的盲观察（含 per-case alias vault 结果；仅供 harness，不给判读者之外的人） |
| `prejudge/<case>.json` | 独立 AI 预判与 attestation（不是专家真值） |
| `schedule.json` | 预声明的 20 次运行顺序 |
| `attempts.jsonl` | 追加式 attempt 账本（先 claim 后运行；失败/取消/中断不删除） |
| `runs/<case>/<arm>/<attempt>.json` | 完整请求、原始响应、交付/剔除、gate 回执、用量、耗时、失败码 |
| `report.json` / `report.md` | 两臂聚合、逐 case 配对、通道分解、用量、失败、限制声明 |
| `reason-review.json` | `report --judge-reasons` 产生的语义理由独立判读（可选，缺失时报告 `not_run`） |

`freeze.json` 最后写入；它的存在表示 prepare 完成。除 `selectorBudget` 外，freeze 不再被修改。

## 3. 冻结输入摘要

- 牌局来源：`E:/AgentData/Coach/public-replays-20261022/corpus.sqlite`，`node:sqlite` 以 `readOnly: true` 只读打开，
  只执行 `SELECT`，不 checkpoint、不改 `journal_mode`、不写入任何表。SQLite 在 WAL 模式下读取时会映射/更新共享内存
  文件 `corpus.sqlite-shm`（引擎固有行为）；数据库文件与 `-wal` 内容不被本工具修改。
- 研究语料：`E:/AgentData/Coach/scene-pattern-study-20261023-kb-v2/knowledge.json`
  （`coach-scene-knowledge-web/v2`，40 张卡，87 933 字节，SHA-256 `73375324…9dab`）。
  `prepare`/`verify` 逐字节核对；只读、不复制进仓库、不发布。
- 20 张冻结子集：b01,b02,b03,b05,b07,b09,b10,b12,b13,b14,b17,b19,a01,a03,a04,a05,a08,a09,a13,a16。
  转换规则 `scene-kb-v2->arena-rag/v2`：基线为 `content` 原文逐字节，缺失的
  `concept`/`conditions`/`exceptions` 按固定顺序以【概念】【适用条件】【例外与限制】追加；
  转换后必须逐字节包含三者，且长度 ≤ `ARENA_RAG_LIMITS_V1.maxPassageChars`（1000），超限即
  `research_corpus_invalid`，不截断、不换卡。
- 排除：`scene-pattern-study-20261023`、`context-rag-study-20261023-r1`、
  `mortal-rag-ablation-20261023` 的 case/`excludedGames`/`excludedHashes`/jsonl 身份；
  任一 entry 无可核实身份即 `study_exclusions_unverifiable` 停止（避免静默复用）。
- 场景层与槽位：`pilot:[SL1,SL3]`、`evaluation:[SL2,SL4,SL5,SL1,SL2,SL3,SL4,SL5]`。
  每槽在未选中、未排除、含该层至少一个“规则 ok 且候选 ≥2”窗口的牌局中取
  `sha256(seed + "\0" + gameHash + "\0" + slotIndex)` 最小者；无匹配即 `insufficient_scene_coverage`，
  在任何模型调用前停止。
- 产品 `blind-discard-arena-seeds/v1`（2 条生产 seed）只用于 Arena CLI 链路 smoke，不进入本实验输入，
  也不用于替代研究子集。
- 查询：由场景层固定的短中文主题串 + `limit: 5`；**不设置** `filter.topics`、`context.topic`。
  因此研究专用 topic 分粗不改变候选集合与顺序。
- 预判：独立提示词 `selfrag-study-prejudge/v1`、独立 provider 上下文、不看 selector 输出。
  每个候选片段给出 `useful / irrelevant / uncertain` 与理由；全部预判无 `irrelevant` 时
  `prejudge_no_irrelevant_instances`，两臂开跑前停止。

## 4. 执行身份与预算

规格 §9.0 的身份由 `verify` 逐项核对：`codex-cli 0.162.1`、原生可执行文件 SHA-256
`dd13bd…9a6a`（333 479 728 字节）、`gpt-6-luna`、`high`、各提示词版本与门控版本。
任一变化即使本节证据失效，`verify` 停止，不“先跑跑看”。

selector 预算在 pilot 后、evaluation 前**一次性**冻结，规则固定为：取 pilot 全部成功 selfrag 运行中
`turn.completed.usage.output_tokens` 与实际 `submit_applicability_verdicts` 参数字节的最大值，
从预声明 ladder（token `[512,768,1024]`、字节 `[4096,8192]`）各取最小可容纳档位；
无可用观测则 `selector_budget_unobservable`，超出 ladder 则 `selector_budget_ladder_exhausted`。
evaluation 全程只用该组合。参数字节由 harness 在 selector provider 边界实测（包装 provider 读取
`ready` 响应的 `call.arguments`），不依赖门控额外导出字段。

## 5. 两臂与指标

- baseline：交付检索原始片段。
- selfrag：交付门控保留片段；门控失败/缺失**不会**回退成 baseline，该 attempt 记为失败。
- 两臂唯一差异是交付片段：同一观测、同一候选、同一冻结查询、同一生成提示词
  （`selfrag-study-generator/v1`）与同一工具 schema；测试断言请求信封逐字节相同。
- 报告同时给出：交付中 prejudge=irrelevant 片段数、drop precision、useful drop rate、
  uncertain 保留率、引用越界与引用 irrelevant 次数、过滤通道分解（三种语义 basis、机械特例、
  逐条降级、整批 degraded/failed）、语义理由成立性（独立 AI 判读）、生成器/selector/合计用量
  （prejudge 准备、生成器、selector、合计与全部尝试成本分别计数；未知与部分报告不补零）、失败码与真实墙钟、逐 case 配对差。
- 用量逐字段校验：只有 `inputTokens` 与 `outputTokens` 都是非负整数时才计为“已报告”；字段缺失、负数、非整数
  或非数值时，整条用量按 `unknown` 计数并保留 `reportedPartial` 中的合法字段，非法值不进入任何数值累计
  （因此不会出现 NaN 或被序列化成 `null` 的假总量）。`cachedInputTokens` 仅在合法时保留，且不参与合计。
- 失败尝试的成本同样只合计“已尝试的调用”：生成器已被调用但未返回用量时（如 `provider_error`），该部分按 `unknown`
  参与合计，selector 的已知值保留在 `reportedPartial`；只要有一次调用未报告用量，合计状态就不得因其余部分已报告而
  变回完整总量。
- 结论规则：semantic 剔除为 0（全部剔除来自机械特例或无法归类）或多数 selfrag 批次降级/失败时，
  结论明确写“本批未能检验语义过滤效果”；不把 token 下降单独当成功；10 局不声称统计显著性。

## 6. 真实结果

**未运行。** 尚无 pilot、evaluation 或真实模型调用；本文件没有质量、token、失败或耗时数字。
原因：工单 A 的 selector/gate 实现尚未合入，且正式实验属于父票集成阶段（规格 §9.0/计划 §4）。

真实运行完成后按以下顺序补齐，不删失败、不改样本：

1. `prepare` → `verify --phase pilot` → `run --phase pilot`（2 局，自动冻结 `selectorBudget`）。
2. `verify --phase evaluation` → `run --phase evaluation`（8 局，一次跑完，失败不补跑）。
3. `report --judge-reasons`，把 `report.md` 的真实数字与失败原样粘贴到本节，并保留
   `report.json` 摘要与 freeze SHA。

## 7. 明确不做

- 不在评估集上调提示词、阈值、语料、查询或预算。
- 不把 AI 预判或理由判读写成专家真值。
- 不把研究语料（40-card v2 的任何部分）发布为产品语料，也不复制进仓库。
- 不修改 Arena 门控、contracts、desktop/src、Arena CLI 或任何 `package.json`。
