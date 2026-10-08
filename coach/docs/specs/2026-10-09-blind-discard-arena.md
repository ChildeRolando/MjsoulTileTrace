# Blind Discard Arena：主动取证 Coach 实验台

日期：2026-10-09

状态：阶段 1 契约候选；父票接受后作为 T1–T5 的唯一 Arena 设计与验收事实源。

本规格只拥有 Blind Discard Arena 的新增契约。已有生产事实仍以代码、schema、测试及相应权威文档为准；canonical 回放与动作权威、Mortal runtime 身份、Coach production generation seam、依赖方向和 renderer 安全边界分别继续归属现有 owner。工单只引用本文件，不复制本文件内容。

## 1. 目标与边界

建立一个本机离线实验入口，输入决策时可见局面和完整合法切牌集合，让 Coach 自主按需调用真实 helper MCP 与可选本地知识检索，先固定一个合法 actionRef 和简短公开依据，再由隔离裁判揭示并比较固定 Mortal runtime 的最终选择。

Mortal 选择是比较标签，不是“正确答案”或专家正确性证明。匹配率不设通过门槛。此实验台不取代或扩展生产复盘，不改生产报告、重试、保存、重开、Mortal adapter 或 UI 语义。

当前工作树有可复用的 canonical replay、libriichi 规则、managed Mortal runtime、helper sidecar 与 completion-only provider；还没有 Arena case/runner schema、MCP server/client、工具循环、RAG retriever 或 Arena run archive。本规格冻结这些后续工作的边界，不声称功能已经实现。

## 2. 仓库复用基线

下表区分代码已实现的事实与 Arena 尚缺的接缝。路径均相对于仓库根目录。

| 能力 | 当前 owner 与证据 | Arena 复用及限制 |
|---|---|---|
| 事前决策快照 | contracts `DecisionSnapshotV2Schema`；reasoning `freezeDecisionSnapshotInContext`、`freezeDecisionSnapshot`、`replayCanonicalStream`；`replay/decision-snapshot.ts` 与 `replay/stream-replayer.ts`。快照在触发事件前缀上冻结，带 stream/prefix hash、public/private state 和事件引用。 | 从冻结快照做新的白名单 projection。`ReplayedDecision` 同时包含 actual action，不能把整个对象或 canonical full-game stream 交给 Coach、MCP 或 RAG。不得删去当时已经可见的手牌、摸牌、公开场况、规则与历史。 |
| 合法动作 | contracts `LibriichiRulePort` / `LibriichiRuleRequestSchema` / response schema；`mortal-runtime` 的 `ManagedMortalRuntime.queryRules`；reasoning `queryCanonicalLibriichiRules`、`createLibriichiRuleProjector`、`bindLibriichiRuleResult`、`normalizeLibriichiRuleActions`。 | 动作全集只能来自固定版本 libriichi 规则结果。helper 和 Arena 不得枚举、补齐、取交集或修改动作全集。决策资格只看事前状态与完整规则动作空间。 |
| 动作身份与 equivalence | contracts `canonicalActionTuple` / `canonicalActionRef`（`action-codec.ts`）；tuple 编码动作种类、牌 id、赤牌标记和 discard mode。`LibriichiBoundAction.physicalRealizations` 由 `normalizeLibriichiRuleActions` 验证 native 暴露的物理实现映射。 | Coach 输出必须是本题候选 actionRef。评分使用相同 canonical ref；只允许现有已验证 physical realization 映射。不得按牌名/自然语言匹配或抹去赤牌差异。 |
| Mortal 最终选择 | `LocalMortalScoringPort.scoreRules` 与 `preferredRuntimeAction` schema；`ManagedMortalRuntime`；reasoning `projectLocalMortalRuleScoring`、`bindLocalMortalRuleScores`、`localMortalRuleScoresToReportEntry`。runtime 验证候选全集与 preferred action；生产 `LocalMortalAnalysisService.analyze` 随后把它们装入含 actual/expected/details 的生产报告。checkpoint/runtime 固定身份见 [local Mortal runtime spec](2026-09-24-local-mortal-runtime-production-design.md)。 | label 只从经验证的 `preferredRuntimeAction` 投影到本题规范 actionRef；不按 Q 值、概率或显示分数重新排序。报告里的 expected、actual、Q 值、概率和 selector 信息不进入 Coach、工具或 RAG。执行 Mortal 可以先于模型，但 label 必须封存在 grader 边界直到提交锁定。 |
| helper 公共接口与实现 | contracts `fact-engine.ts`；reasoning `MahjongFactEnginePort`、`JsonlFactEngineClient`、`ManagedFactEngineTransport`；Go adapter `tools/mahjong-facts` 固定 `mahjong-helper` upstream commit。当前接口有 `analyzeHand13`、可选 `analyzeHandStructure`、`analyzeCompletedHand`、`analyzeThreatRisk` 与 `identity`。 | 复用这些请求、结果、单位、诊断和 producer identity。当前 managed transport 是受管本地 JSONL sidecar，**不是 MCP**；它也没有按 caseRef/actionRef 授权的模型工具 server。T2 必须通过真实 MCP 协议包一层，内部再调用既有 helper/client，不复制计算。 |
| Coach provider 与生成 seam | contracts `LlmCoachProvider.complete(LlmCoachRequest)` 是单次 completion。reasoning `generateReviewReport` 只调用一次 provider-level completion；语义、grounding 和 read-back 失败不重试，transport retry 归 provider。OpenAI-compatible adapter 发 `stream: false` 的 JSON completion；Codex CLI adapter 关闭 shell/tool/MCP tool feature。 | 当前没有 provider tool-call DTO 或可由 runner 驱动的多轮工具循环。T3 需要独立 Arena tool-call provider/runner seam；凭据仍留在 desktop main 的现有 privilege owner。不得改变 `generateReviewReport` 的次数、重试或报告语义，也不得通过绕过架构检查来调用 production provider 内部。 |
| RAG | 当前 `buildGraphContextSlice` 是从当前分析图按 allow-list 投影上下文，不是教材语料检索；没有外部或本地教学语料 RAG interface/retriever。 | T4 新增本地、可关闭的窄 retrieval seam。MCP/helper、scorer 和 Coach loop 不依赖某个具体 retriever。 |
| schema、测试与记录 | 生产 `StructuredAnalysisPackageSchema`、`ReviewReportSchema`、`ReviewSession` SQLite repository 属于复盘档案；不能承载盲测，因为生产 artifact 会记录 actual 与 expected。`coach/bin/riichi-coach.mjs` 是 fixture-oriented 五轴 prototype CLI，默认输出 `coach/reports`，不是通用记录导入器。仓库根 `.gitignore` 已忽略 `coach/reports/`。 | 不复用或扩展生产 ReviewSession/ReviewReport 保存语义。run 使用 `coach/reports/blind-discard-arena/<runId>/` 下有界的本地 JSON artifacts；这里不存完整牌谱、secret 或 hidden CoT。 |

现有 helper 请求均要求绑定 `actionRef`、`stateHash`、request/protocol identity，并由 strict schema 验证。`hand13` 还要求 34 种牌计数、可见剩余牌/完整性状态、宝牌/自家牌河完整性与剩余摸牌；`completed_hand` 使用 34 种完成手牌计数及和牌方式/和牌牌；`threat_risk` 使用威胁家、巡数、安全牌表、剩余牌、宝牌、场风/自风、早巡字牌与 evidence refs。Hand-structure 使用独立的 `HandStructureFactEnginePort` 与 schema。响应保留 helper identity、diagnostics、限制和 unavailable 状态。当前契约明确 han/fu upstream API 不可用、helper risk scale 不是 Mortal 放铳概率、不同威胁独立分析；MCP 不得将这些变成更强结论。

生产 `MortalDecisionOutcomeSchema` 仍是七值生产分析状态：`analysis_ready`、`unsupported_action`、`source_row_not_expected`、`no_mortal_entry`、`binding_mismatch`、`model_output_incomplete`、`analysis_blocked`。Arena 应有自己的 run/failure 结果语义，不把 provider/tool/预算失败伪装成生产 Mortal outcome 或 `ReviewReport` explanation status。

### 2.1 复用边界与抽象准入

唯一新增边界是本机 Arena 执行/裁判路径：它阻止评估标签、工具循环与 run archive 穿过生产 ReviewReport seam；它隔离的是离线评估生命周期、工具权限和统计口径。最近的 production abstraction `generateReviewReport` 是 selector 驱动的单次 completion，ReviewReport/ReviewSession 也是面向生产复盘的含答案产物，因此不是 Arena 的正确 owner。若把这些职责折入生产路径，会改变既有重试与持久化语义，并让 label 与 Coach 输入处在同一错误边界内。

按现有 workspace 结构，本地运行命令与 provider credential custody 由 desktop main 组合；确定性 replay/helper 通过公开 contracts/reasoning/runtime seam 消费。不得让 renderer 接触该功能、Mortal 进程、helper 子进程、路径或凭据。无需为 handoff 中每个概念词创建同名 package/type；只有真正跨包的 DTO 才进入 contracts。若实现选择新增 workspace package，必须先依 ADR-0005 同步依赖表和 `check-architecture`，不能静默扩大依赖方向。

## 3. T1–T5 共用的运行契约

以下是角色契约，不强制类型或 package 名称。T1 确定最小实际 DTO；后续票只依赖该 DTO 和本规格，不另立事实源。

1. **Case selector** 只读取决定时的 frozen snapshot、规则身份和完整合法动作集合。Selector 输出 `included` 或带稳定 reason code 的 `excluded`，并统计所有排除原因。先筛选、定序并冻结 case set，之后才允许读取 Mortal label。
2. **Blind observation** 只含 opaque caseRef、decision-time observation、规则/候选说明、完整候选 actionRef 与中立显示信息、工具说明和本题支持的分析能力。caseRef 不得含 gameId、decisionEventRef、Mortal label、文件名或可从其排序推断答案的内容。
3. **Tool binding** 是 runner/server 私有的 caseRef 到 frozen decision state / 合法候选映射。工具输入不接受牌谱、路径或自由状态；工具不持有 Mortal scoring result。MCP 输出仅引用 caseRef、候选、维度、值/单位、evidence/source ref、producer/version 和明确的 available / unsupported / unavailable 状态。
4. **Reference label** 由独立 grader 私有持有，包含经验证的 Mortal `preferredRuntimeAction` → canonical actionRef 和完整 runtime/checkpoint/config identity。label 是否成功不能反向改变资格、顺序、观察、工具结果或 RAG 结果。
5. **Coach submission** 在当前 case 内提交一个 offered actionRef、简短且可检查的依据、实际使用的 evidence/source refs、一个有比较价值时的主要备选及未选理由、重要不确定性。没有备选时允许明确为空。引用必须属于同一 case 与本次观察到的工具/知识结果；不保存 provider 的 hidden reasoning/CoT。
6. **Finalization** 先严格校验并锁定 submission；随后才向 grader 交付 submission 和 reference label。grader 产物不得回送同次 provider/tool loop。

### T1–T5 接口责任

| 票 | 读取 / 产出 | 不得接管的责任 |
|---|---|---|
| T1：case、blind observation、label map、submission 与 scorer | 按第 3、4、8 节冻结最小共享 DTO；实现 label-isolation、case eligibility、action equivalence 和 failure denominator。 | 不建立第二合法动作来源，不在入选前读 Mortal 答案。 |
| T2：helper MCP | 接受 caseRef + 少量 offered actionRefs + supported dimensions，解析 server-bound frozen state，调用现有 `MahjongFactEnginePort`，返回 typed facts/evidence/producer 或 unsupported。 | 不提供文件、shell、牌谱、Mortal score/label 或任意案例访问。 |
| T4：RAG off/local | 实现第 7 节 retrieval contract，带 source/corpus/retriever identity 和 bounded passages。 | 不决定案例、动作合法性、评分或工具权限。 |
| T3：Blind Coach runner/provider | 初始只发送 blind observation 与工具定义；按模型 tool call 路由到真实 MCP/RAG，直到严格的 final submission 或失败终态。 | 不预查全部候选，不调用生产 `generateReviewReport`，不读取 grader label。 |
| T5：CLI、批处理、run archive、演示 | 实现第 9、10 节命令/manifest/events/summary/offline inspection 与完整统计。 | 不把 fixture/stub 当作真实 MCP、Mortal 或真实 LLM 验收。 |

## 4. 资格与候选动作

首版 case 仅限规则结果成功，且完整合法动作集合中至少有两个候选，并且每个候选的规范 action kind 都是普通 `discard`。`riichi_discard`、`declare_riichi`、鸣牌、杠、和牌、pass、abortive draw、response-window 和 singleton 等非纯切牌动作不纳入首版。后续若放宽，必须另更新本规格及测试，不能在实现中静默扩大。

case qualification 不读 actual action、Mortal label/Q 值/排名、product selector 入选原因、`errorGap`、旧报告或之后事件。候选展示顺序使用固定、与标签无关的 canonical 顺序或记录 seed 的 shuffle；不得沿用 Mortal 分数顺序。`actionRef` 是 model 输出唯一合法动作身份。对齐 native 最终动作只使用 canonical ref 与已验证 `physicalRealizations` 关系；例如赤五与普通五保留差异。

不合格决策仍记录稳定排除原因与计数，不能只展示成功题。筛题范围由事前输入状态与完整规则动作空间决定，不按 Mortal 决策或 Coach 预期表现选题。样本中须保留普通决策，不得只用产品 selector 挑出的高分歧点。

## 5. Blind observation 与隔离裁判

Blind observation 从 `DecisionSnapshotV2` 的决策前状态做**显式白名单投影**，不是从含答案的生产 package 删除几个字段。至少保留当前玩家自己当时可见的手牌/摸牌、已公开的牌河/副露/宝牌/立直状态、局况/规则、可用公开历史与完整合法切牌集合。未知字段继续显式 unknown；不得用结果事件或对手暗手补值。

以下数据禁止进入 provider 请求、MCP/RAG 请求/响应以及可回读的 Coach-visible metadata：

- 实战最终动作与产生该动作的后续事件；
- Mortal 最终动作、Q 值、概率、排序与 model identity 可推断的推荐；
- `errorGap`、model/actual agreement、selector 入选原因及既有 Coach 报告/答案性文本；
- 决策后的摸牌、和牌/流局结算、之后的场况以及当时不可见的他家暗手；
- 原始牌谱 bytes、原始 source path、账号/牌谱 URL、secret 和 grader map。

校验不可只扫描关键字或删除字段。任何 observation/tool/RAG DTO 均从 allow-list 构建且以 strict schema 验证。caseRef 在 Coach-visible 侧为不含来源语义的 per-run opaque ref；内部 grader/source mapping 不导出。对同一个 frozen snapshot 改动 actual、label、Q 值或后续事件，不得改变 observation bytes、候选顺序和任何 helper/tool/RAG 结果。

## 6. 真实 MCP 与资源界限

helper MCP 必须由真正的 MCP client/server 协议调用；现有 JSONL helper transport 只作为内部下游，不能冒充 MCP。首版本地只读，优先 stdio；server 绑定本次 run 的案例表和合法候选，不解析模型给出的原始牌谱，也不自行重建规则状态。

工具职责保持少量、面向问题，例如按需取得允许的局面细节、对少量指定候选/维度分析、或检索资料。初始观察已足够回答的问题不强迫调用。每条事实包括 actionRef、维度、值、单位、evidence/source ref、计算器及版本；不支持的能力返回 `unsupported`/`unavailable`，不补造数字。

MCP server 仅允许读取当前授权 case 的冻结事前状态和提供的合法 actionRefs。拒绝越权/未知 caseRef、非法或重复 actionRef、任意路径、shell、完整牌谱读取、未来事件、Mortal 查询与任意模型评分。每次 actionRefs 与 dimensions 数量、返回字节数、helper timeout 和整 run tool-call/总时长都必须有有限上限；实现将上限写入版本化配置并测试超限拒绝，超过结果上限时返回错误状态，不能截断后假装完整。相同 frozen request 可以做确定性缓存，但缓存键和返回物不得包含或依赖 label。

helper direct call 与 MCP 返回在相同输入上语义一致。至少一个测试通过真实 stdio MCP protocol server/client，并验证访问控制、超时、断连、helper 错误、超大结果和 unsupported dimension。

## 7. RAG 插拔契约

统一窄接口：`query + context/filter + limit → status + passages + source refs + retrieval metadata`。具体类型由 T4 落在最近的现有 owner；不引入通用 agent/RAG framework。

- **off**：明确回 `disabled`；不打开、访问或扫描 corpus。它与 local 无命中不可混为一谈。
- **local**：在少量有来源、可使用、被本地整理的种子材料上做真实检索；可从简单全文/词项检索开始，不要求 embeddings、远程服务或外部数据库。无命中回 `no_hits`。
- 命中 passage 有 bounded content、source id/文档位置、适用条件、corpus version、retriever version；检索 metadata 记录 query/filter/limit 与结果 ref。
- 牌例题干、关键状态、解释及适用限制作为一个有语义关联的 passage 保持完整，不以切块制造错误上下文。
- corpus 是不可信数据，不能改变 system instruction、case 权限或工具名单；不得包含评测 case、Mortal label、候选排名或针对验收题生成的答案解释。
- off/local 替换不得要求修改 scorer、helper MCP 或 Coach 主循环。seed material 保留许可/来源记录；每个机械引用检查只证明引用存在与归属，不证明策略正确。

## 8. Tool loop、submission 与预算

运行顺序固定为：

`blind observation → model-selected query → actual tool call → bounded tool result → optional further query → locked final submission → grader`

不得在 runner 预填候选 × 维度矩阵。provider 只在 Arena 专属的 tool-call contract 下返回 tool request 或 final structured submission。工具请求必须由 run registry 验证；未知工具名、格式错误、case mismatch 或超额调用都拒绝并记录。Final schema 拒绝非本题 actionRef、跨 case 引用、重复/缺失字段、超长文本与凭空声称的工具/资料引用。

运行必须有可设置且有限的总时间、provider turn 数、工具调用数、上下文/输入字节和输出 token/字节上限，以及取消信号。每次 tool call 另受第 6、7 节限制。预算在开始前绑定并落 manifest；耗尽/超时/取消后保留已发生的证据和准确终态，绝不构造默认选择、伪造事实或把失败写成 complete。Provider 用量缺失时为 unknown，不推算精确费用。

Arena tool-call provider/loop 可复用 main-owned credential custody，但它必须是新且隔离的 Arena seam。不要扩展 `LlmCoachProvider.complete` 使生产行为变成 tool loop；不要改 `generateReviewReport` 的 one-completion/transport retry/semantic failure 语义。若既有获授权 provider 无法支持所需工具循环，则如实标注真实 LLM 演示待办，不用 stub 代替。

## 9. 评分、数据和可复查产物

### 9.1 批量指标

每个 run summary 至少有：输入 case 数、合格/纳入数、按 reason 排列的排除数；有效完成率；非法/缺失提交、provider error、timeout/cancel、tool failure、budget stop 与 Mortal label binding failure 数；总时长、工具调用数及 provider 报告的 token/unknown。

Arena run 的 terminal status 至少能区分 `completed`、`invalid_submission`、`provider_unavailable`、`provider_error`、`timeout`、`cancelled`、fatal `tool_failure`、`budget_exhausted` 与 `label_binding_failure`。可恢复的单次工具失败保留为独立 event/count；之后若产生合法 final submission，run 可完成，但 tool failure 数仍需显示。

- **主 Mortal 一选匹配率** = 与 Mortal fixed final action 等价匹配的纳入 case 数 ÷ 全部纳入 case 数。No output、非法、timeout、工具/预算失败和 label 无法绑定均留在这个分母，记为未匹配/不可比较并单独计数；不得静默删题。主指标同时列出 label 可用分母，方便解释不可比较数。
- **条件匹配率** = 有合法最终 actionRef 且 Mortal label 可用的回答中的匹配数 ÷ 这类回答数。该值只作补充；分母为 0 时写 `not_available`，不写 0%。
- 可按已有可靠场景类别分层；未知类别不猜。合法引用的机械检查不证明引用在专业语义上适用或决策理由正确。报告明确区分 mechanical checks 与尚未专家验收。
- 不设匹配率 PASS 阈值；低分、0 分、无样本都是可报告的实验结果。

### 9.2 牌局隔离与 run archive

开发集与验收集按完整 gameId 分组；同局全部 decision、座位、牌例变体只能进入同一组。至少两个完整独立牌局才能声明有 holdout 结果。看过并用于调参的验收牌局转为开发/回归数据，并提升 dataset version；不可继续称未见验收集。

run archive 位于被根 `.gitignore` 忽略的 `coach/reports/blind-discard-arena/<runId>/`，至少含：

- `manifest.json`：完整代码 SHA、dataset/case-set version 与分组摘要、Mortal runtime/checkpoint/config identity、Coach provider/model/method prompt/protocol/submission schema version、RAG 模式及 corpus/retriever version、预算/随机 seed、来源摘要/hash 和开始时间；
- `events.jsonl`：有序的 bounded blind observation ref、MCP/RAG 请求与结果引用、tool/provider 状态、最终结构化 submission、grader match 与失败原因；不写 hidden CoT、secret、完整原始牌谱或无界 provider raw output；
- `summary.json`：从 manifest/events 离线计算的纳入数、排除原因、所有失败类别、两个匹配率分子/分母、耗时和用量。

`inspect <runId>` 只读既存事件并重新计算/显示 summary，不启动模型、MCP helper 或 RAG。保存足够的最终提交、引用、bounded tool output 与版本身份以检查一次 run；不宣称相同 seed 会令 LLM 确定性重现。输出文件名不得含账号、raw record id 或 label。

## 10. T5 固定本地演示与验收样例

T5 提供仓库原生、无 Web UI 的本地命令。当前 CLI 模式参考 `coach/bin/riichi-coach.mjs`；为保证生产 prototype 原样，新增 Arena 命令而不改 `coach:demo`。拟冻结的使用形态为：

```powershell
cd coach
npm run arena -- run --dataset blind-discard-smoke-v1 --rag off
npm run arena -- run --dataset blind-discard-smoke-v1 --rag local
npm run arena -- inspect <runId>
```

脚本尚不存在；T5 落地后须在 `coach/package.json` 与 `GETTING_STARTED.md` 定义同一命令，不得把这里的规划命令报告成当前可执行入口。

固定 smoke 数据来源优先从现有脱敏完整记录 `coach/packages/mahjong-soul-source/tests/fixtures/real-record-complete.json` canonical replay；当前 `paipu-import-service.test.ts` 读取的就是该路径。该 fixture 只证明 source/canonical 回放输入，不得复用测试中冻结的 rule response / scoring stub 冒充真实 Mortal。case builder 按第 4 节完整规则动作空间筛选，在符合条件的完整记录内按 canonical 决策顺序选最早最多 3 个 case；筛选全程不读 Mortal label。dataset manifest 冻结 source hash、case refs、分组和 seed。off/local 两次运行消费完全相同的 case set 和候选顺序。

holdout acceptance 至少使用另一个不同的完整 gameId；只能从仓库已有且获准的脱敏真实语料或经授权加入的新记录选择。先按 gameId 固定 dev/acceptance split，再从 accept game 按同一 label-blind 规则取最多 3 个合格 case。若仓库语料不够两个完整且有合格动作的独立牌局，必须报告缺少 holdout 样本，不得把同一牌局按 decision 切分或把模拟数据叫真实验收。case set 无合格项时，T5 必须报告空集及筛题原因。

同一已验收代码 SHA 的实际 demo 至少留下以下可核结果：

1. 一个有效 Coach 请求在冻结提交前自主发起至少一次候选/维度查询；记录证明走真实 MCP stdio client/server 且结果来自现有 helper。
2. 一个 local 检索命中含来源 ref，且 off run 明确是 disabled；两者使用同一 case set。每题是否检索由 Coach 自主决定。
3. 全纳入题目的 summary，列出失败/不匹配数，即使其值为 0；同时报告所有纳入 case 与排除原因。
4. 至少一条受控 helper failure/timeout/budget-stop 路径，保留真实失败状态，无伪造事实或成功结果。
5. `inspect` 在无 provider/MCP/RAG 启动条件下离线重算同一 run summary。

真实 Mortal final labels、helper MCP 和获授权且有预算的真实 LLM 是不同验收事实；stub、登录成功、Mortal 成功或历史 receipt 均不能替代真实 LLM tool loop。未获授权或缺凭据时把该栏标成“待真实模型演示”，不宣称总体 PASS。

## 11. 永久回归 owner 与命令

Stage 1 只写契约，不添加 Arena runtime 测试。T1–T5 必须在实际实现 owner 同步添加以下 focused regressions，并把具体文件纳入每张票的回执：

| 不变量 | 新测试 owner（建议精确路径） | 现有基线 |
|---|---|---|
| 改 label/actual/Q/future events 不改变 blind bytes、候选次序与 tool/RAG 结果；allow-list 不泄漏 | `coach/packages/desktop/tests/blind-discard-arena-case.test.ts` | `packages/reasoning/tests/stream-replayer.test.ts` |
| 完整合法动作、赤牌/物理实现 mapping、非法/重复/跨 case actionRef 与 label binding | `coach/packages/desktop/tests/blind-discard-arena-case.test.ts` | `packages/reasoning/tests/libriichi-rule-projection.test.ts`、`local-mortal-rule-scoring.test.ts`、`libriichi-full-game.test.ts`、`packages/mortal-runtime/tests/managed-runtime.test.ts` |
| invalid/missing/timeout/tool error/budget stop 始终进入主分母并离线重算 | `coach/packages/desktop/tests/blind-discard-arena-scorer.test.ts` | 新 scorer suite；现有生产 test 不覆盖 Arena 分母 |
| 实际 MCP stdio 协议、case/action 权限、超时/断连/大结果拒绝、同 helper direct parity | `coach/packages/desktop/tests/blind-discard-arena-mcp.test.ts` | `packages/reasoning/tests/fact-engine-client.test.ts` 与 `npm run test:fact-engine` |
| RAG off 不读 corpus、local no-hit 与 hit 可区分、有来源、bounded output、prompt injection 不取得权限 | `coach/packages/desktop/tests/blind-discard-arena-rag.test.ts` | Arena 新 suite |
| tool loop 不预取全矩阵；turn/call/context/output/time/cancel 都有界 | `coach/packages/desktop/tests/blind-discard-arena-runner.test.ts` | Arena 新 suite |
| production ReviewReport 的一次 completion、provider retry、保存/读取与 UI 语义不变 | 继续维护现有 owner | `npx vitest run packages/reasoning/tests/review-report.test.ts packages/reasoning/tests/automatic-report-scope.test.ts packages/desktop/tests/coach-provider.test.ts packages/desktop/tests/codex-coach-provider.test.ts` |

从 `coach/` 运行。每票的 focused Arena command 为 `npx vitest run` 加该票实际新增的测试路径。跨依赖修改另按 [verification gate](../development/VERIFICATION.md) 跑对应的 `npm run typecheck`、`npm test`、`npm run check:architecture`、`npm run test:package-import`；若改变 architecture checker，同步其自测 `npm run test:architecture-checker`。真实 runtime/helper/provider/fixture 变更按现有 Local Mortal、helper、协议及 external/H1 gate 执行。当前 Stage 1 的文档验证命令是 `git diff --check`，无需运行 production suite。

## 12. 非目标与停止条件

本轮不做大规模教材搜集/爬虫、第二麻将算法/合法动作引擎、Mortal/LLM 训练微调、多 Agent 辩论、长期用户模型、web dashboard/生产 UI、精确顺位 EV、通用反事实模拟器或“匹配 Mortal 即证明专家正确”的判断。

五票达到第 10 节的真实验收后停止扩框架；下一步由真实失败样本决定补工具、知识、检索、方法或模型能力，不默认扩张 RAG。

## 13. Durable owner

- Blind Discard Arena 的唯一 normative owner：本文件。
- 生产数据/依赖/报告语义继续归 `coach/docs/development/ARCHITECTURE.md`、`coach/docs/development/INVARIANTS.md`、ADR-0005/0006、生产 Coach 与 local Mortal specs 及实现/tests。
- Roadmap 只记当前状态并链接本文件；工作票只记执行范围及本文件路径，不复制 contract。
