# Self-RAG 配对实验协议与结果

日期：2026-10-27
状态：**formal-v2 真实实验已完成（2 局 pilot + 8 局 evaluation，一次跑完）；工具与两轮独立就绪审查的全部修复均已验证；本批多数 selfrag 批次降级，结论为“本批未能检验语义过滤效果”。**

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
| pilot 与 evaluation 质量分离：质量、通道、正负结论与理由判读只读 8 局 evaluation | 已实现并有反例回归（仅 pilot 有剔除 / eval 全保留；pilot 重跑） |
| 全部尝试成本（pilot + 所有失败 + prejudge + 理由判读）单列 | 已实现并有回归 |
| 每次 prejudge 调用前 claim、返回/失败后立即落盘（含已知与未知用量） | 已实现并有回归（第 2 次失败、10 次全 useful 停止） |
| 返回但校验不通过的预判按失败结算（不记 completed），保留已报告 usage/elapsed | 已实现并有回归（重复 `sourceRef` → `prejudge_invalid`） |
| 理由判读的观察身份绑定：wrapper `caseId` 与 `observation.caseRef` 必须等于冻结候选/当前 case | 已实现并有回归（跨 case 与缺失均拒绝） |
| 理由判读返回但校验失败时，失败调用保留已报告 usage/elapsed 与失败码 | 已实现并有回归，判读循环本身由 `runReasonAudit` 承载 |
| 门控返回 `status=failed` 时在生成前终止该 attempt（不回退 baseline，不写 completed） | 已实现并有回归；`degraded` 仍按规格 §5 第 4 条继续 |
| CLI 入口可加载（`bin/selfrag-study.mjs` 的本地命名导入必须真实存在） | 已修复：`buildResearchArenaCorpus` 现从 `knowledge.mjs` 导入；`entry.test.mjs` 逐条核对 |
| 真实语料规则来源：只用自身 `nikke-tenhou` observation 的 Tenhou GO locator 位域（四麻/东南、赤牌、食断），未观察规则保持 `unknown` | 已实现并有回归：缺失/不可解析/冲突/三麻/东只/非 mjai 均带原因排除，规则来源与摘要随 case 冻结并在 `verify` 由 locator 重算 |
| 抽样排除原因与逐局进度（不再静默扫描全集） | 已实现并有回归：`freeze.sampling.exclusions` 记录每局原因；CLI 向 stderr 输出 `game_analyzed` / `slot_selected` 进度 |
| 与工单 A 的真实门控联通 | **已验证**：A/COAC-266 合并后，formal-v2 的 pilot 与 evaluation 均实际调用 `blind-discard-arena-rag-applicability`（evaluation 3 applied / 5 degraded；含 pilot 共 4 applied / 6 degraded / 0 failed） |
| pilot（2 局 × 2 臂）与 evaluation（8 局 × 2 臂）真实运行 | **已运行**：4/4 与 16/16 completed，无失败、无重试、无换题（§6.1） |
| 真实质量、token、失败与耗时数字 | **已产生**：见 §6.2；结论按预声明规则写作“本批未能检验语义过滤效果”（§6.3） |

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
| `observations/<case>.json` | 每个 case 的盲观察（含 per-case alias vault 结果；仅供 harness 与理由判读的可见上下文投影） |
| `prejudge/<case>.json` | 独立 AI 预判与 attestation（不是专家真值） |
| `prejudge-attempts.jsonl` | 追加式 prejudge 调用账本：调用前写 claim，返回/失败后立刻写 settle（真实 usage、elapsed、失败码；未知留 `null`）。`freeze.json` 绑定其摘要 |
| `schedule.json` | 预声明的 20 次运行顺序 |
| `attempts.jsonl` | 追加式 attempt 账本（先 claim 后运行；失败/取消/中断不删除） |
| `runs/<case>/<arm>/<attempt>.json` | 完整请求、原始响应、交付/剔除、gate 回执、用量、耗时、失败码 |
| `report.json` / `report.md` | evaluation 两臂聚合与逐 case 配对、通道分解、pilot 链路、全部尝试成本、限制声明 |
| `reason-review.json` | `report --judge-reasons` 产生的语义理由独立判读（可选；无 evaluation 剔除时为 `not_applicable`，未运行时报告 `not_run`） |

`freeze.json` 最后写入；它的存在表示 prepare 完成。除 `selectorBudget` 外，freeze 不再被修改。
prepare 失败、被拒绝或 `prejudge_no_irrelevant_instances` 停止时，`prejudge-attempts.jsonl` 已发生的调用仍保留，
不因没有 `freeze.json` 而消失。

## 3. 冻结输入摘要

- 牌局来源：`E:/AgentData/Coach/public-replays-20261022/corpus.sqlite`，`node:sqlite` 以 `readOnly: true` 只读打开，
  只执行 `SELECT`，不 checkpoint、不改 `journal_mode`、不写入任何表。SQLite 在 WAL 模式下读取时会映射/更新共享内存
  文件 `corpus.sqlite-shm`（引擎固有行为）；数据库文件与 `-wal` 内容不被本工具修改。
- 牌局规则来源：corpus 的 MJAI variant 本身不带规则字段。适配器只接受同一只读库中
  `observations.source = "nikke-tenhou"` 且 `hash` 精确等于 variant hash 的 Tenhou GO locator 位域
  （`\d{10}gm-([0-9a-f]{4})-`：四位玩家、东南战、赤牌、食断），与产品 `tenhou-source` 同一 profile；
  locator 不携带的 `westExtension` / `ippatsuCancelledByAnkan` 保持 `unknown`，绝不按常识补成标准规则。
  缺失、不可解析、冲突（同一 hash 得出不同规则）、三麻、东只或非 mjai 的 variant 一律带原因排除，
  不进入 mapper。规则来源、locator、规则与摘要写入 `freeze.sampling.selected[].ruleSource`，
  `verify` 由 locator 重算并核对摘要。语料完整性门没有放宽：`eventSequence`/`scores`/`doraIndicators`/
  `rivers`/`calledDiscardMarkers`/`melds`/`remainingDraws`/`responseOpportunities` 任一为 partial 即
  以 `stream_<field>_partial` 排除，partial 不会被改成 complete。
- 排除记录：每个被分析但不可用的牌局写进 `freeze.sampling.exclusions`
  （`gameId`、`sourceHash`、`slotIndex`、`layer`、`reason`、可选 `detail`），CLI 同时向 stderr 输出
  `game_analyzed` 与 `slot_selected` 进度；因此不会出现“无进展、全库扫描”而不留原因的情况。
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
  每次 prejudge 调用在发出前写入 `prejudge-attempts.jsonl` 的 claim 行，返回或抛错后立即写 settle 行，
  记录状态、真实 usage、elapsed 与失败码。适配器把 provider 已报告的失败/无效输出用量一并带回；
  未报告即 `null`（未知，不当 0）。`freeze.json` 的 `prejudge.attempts` 绑定该账本的摘要与计数，
  `verify` 对账，事后增删或改写任何一行都会失败。

## 4. 执行身份与预算

规格 §9.0 的身份由 `verify` 逐项核对：`codex-cli 0.162.1`、原生可执行文件 SHA-256
`dd13bd…9a6a`（333 479 728 字节）、`gpt-6-luna`、`high`、各提示词版本与门控版本。
任一变化即使本节证据失效，`verify` 停止，不“先跑跑看”。

selector 预算在 pilot 后、evaluation 前**一次性**冻结，规则固定为：取 pilot 全部成功 selfrag 运行中
`turn.completed.usage.output_tokens` 与实际 `submit_applicability_verdicts` 参数字节的最大值，
从预声明 ladder（token `[1024,2048,4096]`、字节 `[4096,8192]`）各取最小可容纳档位；
无可用观测则 `selector_budget_unobservable`，超出 ladder 则 `selector_budget_ladder_exhausted`。
该 token profile 在任何正式 prepare/pilot/evaluation 调用前，于 2026-10-27 根据开发期真实
921/1300 输出 token 修订；gate 默认上限同步为 2048。旧 512 上限的失败记录保留，
明确 512/890 的超限回归仍须降级；新上限照常严格执行，不按评估结果调整。
evaluation 全程只用该组合。参数字节由 harness 在 selector provider 边界实测（包装 provider 读取
`ready` 响应的 `call.arguments`），不依赖门控额外导出字段。

## 5. 两臂、口径与指标

- baseline：交付检索原始片段。
- selfrag：交付门控保留片段；门控失败/缺失**不会**回退成 baseline，该 attempt 记为失败。
  具体地：门控返回 `status="failed"`（如 `receipt_too_large`）时，harness 先保存 gate 回执与 selector
  实际 usage，再在构建生成请求之前把该 attempt 记为 `failed`（原 `failureCode` 保留，generator 记
  `not_called`，合计用量只含真实发生的 selector 成本，不捏造生成器成本）。`status="degraded"` 的合法
  fallback 按规格 §5 第 4 条继续生成，并显式记录降级与失败码——不把两者一刀切。
- 两臂唯一差异是交付片段：同一观测、同一候选、同一冻结查询、同一生成提示词
  （`selfrag-study-generator/v1`）与同一工具 schema；测试断言请求信封逐字节相同。
- **阶段分离（规格 §9.3）**：pilot 的归属只取 `freeze.sampling.selected` 里预声明的 phase，不信任 run 自带标签。
  质量、通道分解、正负结论与理由判读只读 8 局 evaluation；只过滤 `caseIds` 不够，通道扫描也必须同样限定，
  否则 pilot-only 的剔除会被写成实验性语义过滤。pilot 只按“链路状态 + 用量 + 通道观察”单列，标 `qualityComparable: false`。
- **全部尝试成本**：另出一节汇总 pilot + evaluation + 所有失败/取消/中断的 attempt，以及 prejudge 调用
  （含失败与未结算 claim）与独立理由判读调用。该节显式标为不可用于质量比较。
  返回后校验失败同样计入：预判返回但覆盖非法时只结算一次 `failed`（带 `prejudge_invalid` 与已报告用量），
  理由判读返回但校验不通过时保留已报告 usage/elapsed 与失败码；无调用时不产生任何成本。
- 报告同时给出：交付中 prejudge=irrelevant 片段数、drop precision、useful drop rate、
  uncertain 保留率、引用越界与引用 irrelevant 次数、过滤通道分解（三种语义 basis、机械特例、
  逐条降级、整批 degraded/failed）、语义理由成立性（独立 AI 判读）、生成器/selector/合计用量
  （prejudge 准备、生成器、selector、合计与全部尝试成本分别计数；未知与部分报告不补零）、失败码与真实墙钟、逐 case 配对差。
- 用量逐字段校验：只有 `inputTokens` 与 `outputTokens` 都是非负整数时才计为“已报告”；字段缺失、负数、非整数
  或非数值时，整条用量按 `unknown` 计数并保留 `reportedPartial` 中的合法字段，非法值不进入任何数值累计
  （因此不会出现 NaN 或被序列化成 `null` 的假总量）。`cachedInputTokens` 仅在合法时保留，且不参与合计。
- 失败尝试的成本同样只合计“已尝试的调用”：生成器已被调用但未返回用量时（如 `provider_error`），该部分按 `unknown`
  参与合计，selector 的已知值保留在 `reportedPartial`；只要有一次调用未报告用量，合计状态就不得因其余部分已报告而
  变回完整总量。prejudge 的失败调用同理：有已知字段就记 partial，完全未知就记 unknown。
- **语义理由独立判读**：对 evaluation 中每个**实际** `effectiveVerdict=irrelevant` 的片段，用冻结 `sourceRef`
  绑定 `candidates.json` 中的原完整片段（`content` 已含正文/适用条件/例外，另带 `sourceTitle`、`documentLocation`、
  `applicableWhen`）与该 case 的冻结盲观察（只投影 `decision`、`visibleState`、`candidates`，不含 tools、隐藏标签、
  他家暗手或未来信息）。绑定不是只看文件名：观测 wrapper 的 `caseId`（存在时）与 `observation.caseRef`
  都必须等于当前 run 与冻结候选的 `caseRef`；缺失或跨 case 直接失败，不猜。selector 的最终理由、`basis`、`premises` 只作为
  **不可信声明** 传入；不传 selector 中间过程或回执其余字段。每个条目一次独立新上下文、固定提示词，
  调用成本单独统计；判读是 AI 判读，不是专家真值。evaluation 确实没有剔除时写 `not_applicable`，不伪造判读结果。
- 结论规则：semantic 剔除为 0（全部剔除来自机械特例或无法归类）或多数 selfrag 批次降级/失败时，
  结论明确写“本批未能检验语义过滤效果”；不把 token 下降单独当成功；10 局不声称统计显著性。
  pilot 的剔除与降级不参与该判断。

## 6. 真实结果

**已运行：formal-v2（2026-10-27）。** 唯一正式产物根
`E:/AgentData/Coach/selfrag-applicability-20261027/formal-v2`，代码 SHA
`d68aa088537349cd1f21617eec2795341af40811`（含 A/COAC-266 合并 `61547bd` 与 B/COAC-267 `c5b7bf0`）。
执行身份为冻结值：`codex-cli 0.162.1`、原生可执行文件 SHA-256 `dd13bd…9a6a`
（333 479 728 字节）、`gpt-6-luna`、`high`；`verify` 在 pilot 与 evaluation 前各核对一次。
seed `coach-selfrag-20261027-v1`、20 张研究卡、三个历史实验排除集、场景槽位与预算 ladder 均未改变。
`freeze.json` 的 `codeSha` 是实际产生这批结果的代码提交；其结果之后只允许文档提交。
因此在最终分支 HEAD 上重跑 `verify` 会按设计以 `verify_code_sha_mismatch` 拒绝（代码 SHA 已冻结），
这不代表代码或协议在评估后被修改。
formal-v1 只留下 `exclusions.json` / `research-subset.json`，没有任何模型调用（见下）。

### 6.1 运行链路

| 步骤 | 结果 |
|---|---|
| `prepare --artifacts formal-v2 --seed coach-selfrag-20261027-v1` | 退出 0；freeze 摘要写入；10 次独立 prejudge 调用全部完成（claim 10 / settle 10 / 失败 0）；预判 27 useful / 15 irrelevant / 8 uncertain |
| `verify --phase pilot` | `status=verified`，全部摘要、执行身份与门控版本一致 |
| `run --phase pilot` | 2 局 × 2 臂，4/4 completed；pilot selfrag 1 applied、1 degraded（`timeout`，45 s 门控超时，selector 用量 `unknown`） |
| 预算冻结 | 从 pilot 唯一可观测 selfrag 运行（1546 output tokens / 2083 参数字节）各取最小可容纳档位 → **tokens 2048 / bytes 4096**，一次性写入 `freeze.json` |
| `verify --phase evaluation` | `status=verified`，冻结预算在预声明 ladder 内 |
| `run --phase evaluation` | 8 局 × 2 臂，16/16 completed（attempt 1，无重试、无失败、无替换） |
| `report --judge-reasons` | 退出 0；2 次独立理由判读调用完成；报告摘要 `221f2ad6…4ba5` |

脱敏验收回执（只含 SHA、计数、指标与文件摘要，不含私有牌谱或研究语料）位于
`E:/文档/日麻教学/production-review-results/selfrag-acceptance-20261027/formal-v2/`；formal-v1 的失败说明在同级
`formal-v1/`。

### 6.2 evaluation 质量问题（8 局）

| 指标 | baseline | selfrag |
|---|---|---|
| 尝试 / 完成 / 失败 | 8 / 8 / 0 | 8 / 8 / 0 |
| 门控 applied / degraded / failed | — | 3 / 5 / 0 |
| 交付片段 | 40（prejudge irrelevant 14） | 38（prejudge irrelevant 12） |
| 剔除片段 / 其中 irrelevant | 0 | 2 / 2 |
| drop precision | n/a（baseline 不过滤） | 1.000 |
| useful drop rate | 0 | 0 |
| uncertain 保留 | 6/6 = 1.000 | 6/6 = 1.000 |
| citation 越界 / 指向 irrelevant | 0 / 1 | 0 / 1 |
| 墙钟合计 | 193 698 ms | 536 085 ms |
| 生成器 tokens（in/out） | 150 978 / 7 597 | 149 451 / 8 996 |
| selector tokens（in/out） | 0 / 0 | 333 253 / 17 136 |

过滤通道（evaluation）：`declared-condition-not-met` 2、`visible-fact-mismatch` 0、`context-mismatch` 0、
机械特例 0、无法归类 0、逐条降级 0、**整批 degraded 5**、整批 failed 0。语义剔除共 2 次，
两次剔除的独立理由判读为 1 成立 / 0 不成立 / 1 无法判断（AI 判读，非专家真值；2 次调用，66 253 / 916 tokens）。

pilot 单列（不进入质量、通道、结论与理由判读）：baseline 31654/1782 tokens、72131 ms；
selfrag 生成器 31654/2241、selector 1 次已报告 27485/1546、1 次未知（timeout）、136221 ms。

全部尝试成本（pilot + evaluation + 所有失败，不可用于质量比较）：baseline 10/10 completed，182 632 / 9 379 tokens；
selfrag 10/10 completed，生成器 181 105 / 11 237、selector 9 已报告 + 1 未知，360 738 / 18 682 tokens，
合计 541 843 / 29 919（1 个 run 为部分报告）。非两臂调用：prejudge 191 617 / 10 704、理由判读 66 253 / 916。

### 6.3 结论

本批按预声明规则给出：**“selfrag 臂多数反思批次降级或失败，本批未能检验语义过滤效果。”**
8 个 evaluation selfrag 批次中 5 个在冻结的 2048-token 预算下 `output_budget_exhausted`
（实际报告输出 3122 / 2260 / 2215 / 2320 / 2468 tokens，均超过 2048；3 个 applied 批次为
1237 / 1810 / 1704 tokens，均在预算内；参数字节均未触发 4096 上限）。因此：
筛选只在 3 个可用批次上发生，2 次剔除的理由均被独立判读为成立或无法判断、无有用误删，
但样本太小且多数批次降级，不能据此声称语义过滤有效或无效。token 总量 selfrag 明显更高
（selector 成本），不构成成功指标。10 局不声称统计显著性。

预算是进行到 pilot 之后、evaluation 之前一次性冻结的；评估期已开始后没有调整预算、提示词、
语料、查询、场景样本或 seed，也没有重跑任何 evaluation attempt。若后续需要检验过滤效果，
必须作为新的、事先登记的批次（新预算 profile）重新冻结，不能用本批数据回头调参。

### 6.4 formal-v1 与实现修复历史

**formal-v1 未产生模型调用。** 首次 prepare 在输入准备阶段失败，没有写出 `freeze.json` 或
`prejudge-attempts.jsonl`，已发生模型调用为 **0**；目录与 `formal-v1-run-session.json` 原样保留。
失败原因与修复见本节后半段。

独立就绪审查（`experiment-readiness-review.json`，审查提交 `c5b7bf0`）指出的 3 个 P2 已在本 harness 修复，
不改变冻结研究协议：pilot 污染质量口径、理由判读缺少原片段/盲观察、prepare 失败丢失已发生成本。
修复项各有先红后绿回归：

- `pilot drops never enter evaluation quality, channels or the conclusion`、
  `a rerun pilot attempt is kept in the operational totals and never moves evaluation`、
  `phase membership comes from the frozen sampling, never from the run label alone`
- `reason audit entries bind the frozen passage and blind observation, not selector internals`、
  `the reason audit counts its own cost and says not_applicable when evaluation dropped nothing`
- `each prejudge call is claimed before it runs and settled immediately on return or failure`、
  `the all-useful stop keeps all ten incurred prejudge costs`、
  `a failed prejudge call keeps the usage the adapter managed to observe`、
  `freeze binds the prejudge attempt ledger and verify refuses ledger drift`

第二轮就绪复核（`experiment-readiness-fixed-review.json`，复核提交 `4a85e43`）确认上述三项已修复，并留下
3 项必须在正式评估前完成的修复，现已在同分支完成（不改变冻结研究协议）：

- 门控返回 `status=failed` 仍调用生成器并写 `completed`：现于生成前终止，保留回执与 selector 用量，
  生成器记 `not_called`；`degraded` 仍继续。回归：`a returned failed gate is terminal: the generator is not
  called and only its real selector cost is kept`、`a degraded gate still proceeds to the generator and
  records the downgrade`。
- 理由判读未校验观测身份：现绑定 wrapper `caseId` 与 `observation.caseRef`。回归：
  `a reason audit refuses an observation that belongs to another case`。
- 返回后校验失败的失真记账：预判校验移入结算前，失败只结算一次并保留用量；理由判读由
  `runReasonAudit` 记录每次调用的真实状态/用量/耗时。回归：
  `a returned but invalid prejudge is settled as failed, keeping its reported usage`、
  `the reason audit keeps the returned usage of a rejected judgement as a failed call`、
  `the reason audit stops at the first failure and keeps the earlier calls`。

同时修复一个更早的实现阻断：`bin/selfrag-study.mjs` 从 `prepare.mjs` 导入了实际由 `knowledge.mjs` 导出的
`buildResearchArenaCorpus`，导致 CLI 在链接阶段即失败（`--help` 也不可用），真实链路根本无法开始。现改为从
`knowledge.mjs` 导入，并新增 `entry.test.mjs` 逐条核对 CLI 对 harness 模块的命名导入，先红后绿。

**formal-v1 首次 prepare 在输入准备阶段失败（不是模型失败）。** 该次运行没有写出
`freeze.json`、`prejudge-attempts.jsonl` 或任何模型调用记录，已实际发生的模型调用为 **0**。
只读诊断（`sampling-probe.json`、`sampling-complete-probe.json`、`corpus-completeness-probe.json`）确认：
hash 排名前 100 局中有 21 局 scores 完整，首个 scores 完整的局仍被原生 `queryRules` 拒绝为
`rules_input_incomplete`，因为适配器直接 `mapMjaiRecord` 未带规则来源，全部规则为 `unknown`；
适配器又吞掉排除原因、没有进度输出，于是继续扫描全库。修复（本文件 §3 与 §1）只涉及 harness 的
真实语料适配与排除诊断，没有放宽 native/候选/规则完整性门。formal-v1 的目录与
`formal-v1-run-session.json` 保留不覆盖；真实实验改在登记于任何模型调用之前的 formal-v2 会话中执行，
seed、20 张卡、排除集、场景槽位、Luna/high 与预算 ladder 均不变。

回归（先红后绿）：

- `tenhou-go locator bits become rules; rules the locator cannot carry stay unknown`
- `three-player, non-four-player and east-only rule evidence is refused`
- `the corpus rule adapter accepts only mjai with exactly one observed rule profile`
- `the corpus adapter entry passes observed rules into the mapper`
- `a frozen rule source is recomputed and refuses drift`
- `rule observations are read for one variant hash in a deterministic order`
- `selection records why a game was skipped and streams progress for every analysis`
- `the freeze binds every selected game to its corpus rule source and verify recomputes it`

formal-v2 已按同一顺序完成（§6.1），没有删除失败、没有改样本；`report.json` 摘要为
`221f2ad6cf562e2a01b04851bcdfc4c934370b275b84052d6b81d0fd7f3f4ba5`，freeze 的代码 SHA 为
`d68aa088537349cd1f21617eec2795341af40811`。`report.md` 与 `report.json` 保存在上述私有产物根，不入仓。

## 7. 明确不做

- 不在评估集上调提示词、阈值、语料、查询或预算。
- 不把 pilot 结果或 pilot-only 剔除写进质量、通道或结论。
- 不把 AI 预判或理由判读写成专家真值；不替没有剔除的批次伪造理由判读结果。
- 不把研究语料（40-card v2 的任何部分）发布为产品语料，也不复制进仓库。
- 不修改 Arena 门控、contracts、desktop/src、Arena CLI 或任何 `package.json`。
