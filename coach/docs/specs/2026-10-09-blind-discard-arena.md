# Blind Discard Arena：主动取证 Coach 实验台

日期：2026-10-09

状态：阶段 1 规格及 T1–T5 已实现；2026-10-16 在冻结代码 85b9cf7 上完成真实 Codex/MCP/RAG、独立牌局 Off/Local、受控故障与离线复算验收。开发组各 3/3 成功且匹配；独立组各 3/3 成功、1/3 匹配，不宣称专家正确性或 RAG 提升。结果、初始失败及修复、审核与交付依据见 [T5 验收记录](../development/2026-10-16-arena-t5-acceptance.md)。本文件仍是唯一 Arena 设计与验收事实源。

本规格只拥有 Blind Discard Arena 的新增契约。已有生产事实仍以代码、schema、测试及相应权威文档为准；canonical 回放与动作权威、Mortal runtime 身份、Coach production generation seam、依赖方向和 renderer 安全边界分别继续归属现有 owner。工单只引用本文件，不复制本文件内容。

## 1. 目标与边界

### 2026-10-16：实验类型与公开场面展示

现有 `blind-discard-dev-v1` 的 110 个开发案例来自同一完整牌局，原始盲观察已包含
四家牌河、鸣牌、立直、分数和局况，不能称为纯平面何切。历史实验继续读取原档，
控制台单列为“旧版混合题库”，不改写类型或成绩。

新增 `blind-discard-flat-v1`（平面何切／基础牌效场景：四家均无立直、无鸣牌）与
`blind-discard-spatial-v1`（立体何切：四家中有已宣言／成立的立直或鸣牌，含杠）。
二者是对既有真实牌谱事前快照的互斥分组，并非新增独立牌局或专家标注题；基础组
仍保留所有当时可见信息，不宣称是只输入手牌的纯平面测验。筛选只读公开状态，
不读实际弃牌、未来事件或 Mortal 标签；之后再按各组内部顺序分批，RAG Off／Local
使用同组同范围。未入本组的已合格场面记 `different_experiment_type`。

类型通过独立 dataset ID 绑定 manifest、dataset scan、case-set digest、CLI 与归档；
看板和结果按所选类型统计，Token 报警线仍覆盖所有类型。题库和案例日志必须展示
四家分数／座风／庄家、立直、按顺序的牌河、摸切与被鸣标记、鸣牌及完整性状态。
展示只消费既有盲观察，不增加对手暗牌、牌墙、actual 或比较答案。

变更边界为 desktop 的 Arena 筛题／归档和本地 CLI／控制台；不增加 package、
provider 权限或架构抽象，不改生产报告与 Mortal/helper 权威。标签隔离和候选全集
继续由 `blind-discard-arena-case.test.ts`、scorer/runner/MCP 测试与 architecture checker
约束；分组互斥、组内分页、类型参数传递、历史可读和指标隔离分别由
`arena-dataset.test.mjs`、`arena-console.test.mjs`、`blind-discard-arena-archive.test.ts`
和 `arena-presentation.test.mjs` 保护。无独立验收牌局仍是当前实验限制。

本次验证：9 项 Node 检查、23 项 Arena case/archive/scorer 测试及 architecture checker
通过；真实本机规则重建为 55 道基础场景与 55 道立体场景，互斥且覆盖原 110 题。
立体组 25 题有立直、48 题有鸣牌（有重叠）。13 份已完成历史归档离线重算后与原汇总
逐字节一致；新的排除原因不会为旧汇总补零字段。浏览器验证了两类型切换、旧成绩
单独查看、四家场面／立直宣言牌、图片加载及滚动时固定关闭按钮。本次未调用模型；
组内真实模型质量与跨牌局独立验收仍未验证。

建立一个本机离线实验入口，输入决策时可见局面和完整合法切牌集合，让 Coach 自主按需调用真实 helper MCP 与可选本地知识检索，先固定一个合法 actionRef 和简短公开依据，再由隔离裁判揭示并比较固定 Mortal runtime 的最终选择。

Mortal 选择是比较标签，不是“正确答案”或专家正确性证明。匹配率不设通过门槛。此实验台不取代或扩展生产复盘，不改生产报告、重试、保存、重开、Mortal adapter 或 UI 语义。

当前工作树已有可复用的 canonical replay、libriichi 规则、managed Mortal runtime、helper sidecar 与 completion-only provider。COAC-220 增加 Arena case/observation/label/submission/scoring DTO、label-blind case screening、opaque alias、私有 tool binding 与离线 scorer；COAC-221 增加 Arena MCP server/client；COAC-222 增加 off/local RAG retriever 与本地课程摘要；COAC-223 增加独立 provider protocol、main-owned OpenAI-compatible function-call adapter，以及可按需调用真实 MCP/RAG 并在 submission 锁定后评分的 runner。T5 run archive、离线 inspect 与演示 CLI 仍未实现，尚无真实模型运行结果。

## 2. 仓库复用基线

下表区分代码已实现的事实与 Arena 尚缺的接缝。路径均相对于仓库根目录。

| 能力 | 当前 owner 与证据 | Arena 复用及限制 |
|---|---|---|
| 事前决策快照 | contracts `DecisionSnapshotV2Schema`；reasoning `freezeDecisionSnapshotInContext`、`freezeDecisionSnapshot`、`replayCanonicalStream`；`replay/decision-snapshot.ts` 与 `replay/stream-replayer.ts`。快照在触发事件前缀上冻结，带 stream/prefix hash、public/private state 和事件引用。 | 从冻结快照做新的白名单 projection。`ReplayedDecision` 同时包含 actual action，不能把整个对象或 canonical full-game stream 交给 Coach、MCP 或 RAG。不得删去当时已经可见的手牌、摸牌、公开场况、规则与历史。 |
| 合法动作 | contracts `LibriichiRulePort` / `LibriichiRuleRequestSchema` / response schema；`mortal-runtime` 的 `ManagedMortalRuntime.queryRules`；reasoning `queryCanonicalLibriichiRules`、`createLibriichiRuleProjector`、`bindLibriichiRuleResult`、`normalizeLibriichiRuleActions`。 | 动作全集只能来自固定版本 libriichi 规则结果。helper 和 Arena 不得枚举、补齐、取交集或修改动作全集。决策资格只看事前状态与完整规则动作空间。 |
| 动作身份与 equivalence | contracts `canonicalActionTuple` / `canonicalActionRef`（`action-codec.ts`）；tuple 编码动作种类、牌 id、赤牌标记和 discard mode。`LibriichiBoundAction.physicalRealizations` 由 `normalizeLibriichiRuleActions` 验证 native 暴露的物理实现映射。 | Coach 输出必须是本题候选 actionRef。评分使用相同 canonical ref；只允许现有已验证 physical realization 映射。不得按牌名/自然语言匹配或抹去赤牌差异。 |
| Mortal 最终选择 | `LocalMortalScoringPort.scoreRules` 与 `preferredRuntimeAction` schema；`ManagedMortalRuntime`；reasoning `projectLocalMortalRuleScoring`、`bindLocalMortalRuleScores`、`localMortalRuleScoresToReportEntry`。runtime 验证候选全集与 preferred action；生产 `LocalMortalAnalysisService.analyze` 随后把它们装入含 actual/expected/details 的生产报告。checkpoint/runtime 固定身份见 [local Mortal runtime spec](2026-09-24-local-mortal-runtime-production-design.md)。 | label 只从经验证的 `preferredRuntimeAction` 投影到本题规范 actionRef；不按 Q 值、概率或显示分数重新排序。报告里的 expected、actual、Q 值、概率和 selector 信息不进入 Coach、工具或 RAG。执行 Mortal 可以先于模型，但 label 必须封存在 grader 边界直到提交锁定。 |
| helper 公共接口与实现 | contracts `fact-engine.ts`；reasoning `MahjongFactEnginePort`、`JsonlFactEngineClient`、`ManagedFactEngineTransport`；Go adapter `tools/mahjong-facts` 固定 `mahjong-helper` upstream commit。当前接口有 `analyzeHand13`、可选 `analyzeHandStructure`、`analyzeCompletedHand`、`analyzeThreatRisk` 与 `identity`。 | 复用这些请求、结果、单位、诊断和 producer identity。当前 managed transport 是受管本地 JSONL sidecar，**不是 MCP**；它也没有按 caseRef/actionRef 授权的模型工具 server。T2 必须通过真实 MCP 协议包一层，内部再调用既有 helper/client，不复制计算。 |
| Coach provider 与生成 seam | contracts `LlmCoachProvider.complete(LlmCoachRequest)` 是单次 completion。reasoning `generateReviewReport` 只调用一次 provider-level completion；语义、grounding 和 read-back 失败不重试，transport retry 归 provider。OpenAI-compatible adapter 发 `stream: false` 的 JSON completion；Codex CLI adapter 关闭 shell/tool/MCP tool feature。 | T3 在 desktop 增加与 production completion 分离的 Arena provider DTO/prompt 和 OpenAI-compatible function-call adapter；main-owned service 使用既有凭据 owner 创建 adapter，runner 只依赖非特权 protocol contract。不得改变 `generateReviewReport` 的次数、重试或报告语义，也不得绕过 architecture checker 导入 concrete provider。 |
| RAG | `buildGraphContextSlice` 是从当前分析图按 allow-list 投影上下文，不是教材语料检索。Arena 的 `contracts` 拥有严格 retrieval DTO，`desktop` 拥有可关闭的 `ArenaRagRetriever` 与本地种子；T4 不改生产图投影、MCP/helper、scorer 或 Coach 主循环。 | T3 runner 只依赖窄查询/结果契约，不依赖种子文件或具体检索算法。切换为 `off` 时不加载 corpus；替换 corpus/retriever 不改其它 Arena 边界。 |
| schema、测试与记录 | 生产 `StructuredAnalysisPackageSchema`、`ReviewReportSchema`、`ReviewSession` SQLite repository 属于复盘档案；不能承载盲测，因为生产 artifact 会记录 actual 与 expected。`coach/bin/riichi-coach.mjs` 是 fixture-oriented 五轴 prototype CLI，默认输出 `coach/reports`，不是通用记录导入器。仓库根 `.gitignore` 已忽略 `coach/reports/`。 | 不复用或扩展生产 ReviewSession/ReviewReport 保存语义。run 使用 `coach/reports/blind-discard-arena/<runId>/` 下有界的本地 JSON artifacts；这里不存完整牌谱、secret 或 hidden CoT。 |

现有 helper 请求均要求绑定 `actionRef`、`stateHash`、request/protocol identity，并由 strict schema 验证。`hand13` 还要求 34 种牌计数、可见剩余牌/完整性状态、宝牌/自家牌河完整性与剩余摸牌；`completed_hand` 使用 34 种完成手牌计数及和牌方式/和牌牌；`threat_risk` 使用威胁家、巡数、安全牌表、剩余牌、宝牌、场风/自风、早巡字牌与 evidence refs。Hand-structure 使用独立的 `HandStructureFactEnginePort` 与 schema。响应保留 helper identity、diagnostics、限制和 unavailable 状态。当前契约明确 han/fu upstream API 不可用、helper risk scale 不是 Mortal 放铳概率、不同威胁独立分析；MCP 不得将这些变成更强结论。

生产 `MortalDecisionOutcomeSchema` 仍是七值生产分析状态：`analysis_ready`、`unsupported_action`、`source_row_not_expected`、`no_mortal_entry`、`binding_mismatch`、`model_output_incomplete`、`analysis_blocked`。Arena 应有自己的 run/failure 结果语义，不把 provider/tool/预算失败伪装成生产 Mortal outcome 或 `ReviewReport` explanation status。

### 2.1 复用边界与抽象准入

唯一新增边界是本机 Arena 执行/裁判路径：它阻止评估标签、工具循环与 run archive 穿过生产 ReviewReport seam；它隔离的是离线评估生命周期、工具权限和统计口径。最近的 production abstraction `generateReviewReport` 是 selector 驱动的单次 completion，ReviewReport/ReviewSession 也是面向生产复盘的含答案产物，因此不是 Arena 的正确 owner。若把这些职责折入生产路径，会改变既有重试与持久化语义，并让 label 与 Coach 输入处在同一错误边界内。

按现有 workspace 结构，本地运行命令与 provider credential custody 由 desktop main 组合；确定性 replay/helper 通过公开 contracts/reasoning/runtime seam 消费。不得让 renderer 接触该功能、Mortal 进程、helper 子进程、路径或凭据。无需为 handoff 中每个概念词创建同名 package/type；只有真正跨包的 DTO 才进入 contracts。若实现选择新增 workspace package，必须先依 ADR-0005 同步依赖表和 `check-architecture`，不能静默扩大依赖方向。

## 3. T1–T5 共用的运行契约

以下是角色契约，不强制类型或 package 名称。T1 确定最小实际 DTO；后续票只依赖该 DTO 和本规格，不另立事实源。

1. **Case selector** 只读取决定时的 frozen snapshot、规则身份和完整合法动作集合。Selector 输出 `included` 或带稳定 reason code 的 `excluded`，并统计所有排除原因。先筛选、定序并冻结 case set，之后才允许读取 Mortal label。
2. **Blind observation** 只含 opaque caseRef、decision-time observation、规则/候选说明、完整候选 actionRef 与中立显示信息、工具说明和本题支持的分析能力。caseRef 不得含 gameId、decisionEventRef、Mortal label、文件名或可从其排序推断答案的内容。所有 Coach-visible 的来源身份引用（包括 canonical event/evidence/source refs、MCP/RAG 引用与诊断引用）也必须是每次 run 独立生成的不透明 alias；不得包含原始 gameId、recordId 或其它来源身份。
3. **Tool binding** 是 runner/server 私有的 caseRef 到 frozen decision state / 合法候选映射。工具输入不接受牌谱、路径或自由状态；工具不持有 Mortal scoring result。MCP 输出仅引用 caseRef、候选、维度、值/单位、每次 run 的 opaque evidence/source ref、producer/version 和明确的 available / unsupported / unavailable 状态；canonical/source identity 必须先经私有 alias map 映射，不能直接透传。
4. **Reference label** 由独立 grader 私有持有，包含经验证的 Mortal `preferredRuntimeAction` → canonical actionRef 和完整 runtime/checkpoint/config identity。label 是否成功不能反向改变资格、顺序、观察、工具结果或 RAG 结果。
5. **Coach submission** 在当前 case 内提交一个 offered actionRef、简短且可检查的依据、实际使用的 evidence/source refs、一个有比较价值时的主要备选及未选理由、重要不确定性。没有备选时允许明确为空。引用必须属于同一 case 与本次观察到的工具/知识结果；不保存 provider 的 hidden reasoning/CoT。
6. **Finalization** 先严格校验并锁定 submission；随后才向 grader 交付 submission 和 reference label。grader 产物不得回送同次 provider/tool loop。

初始 observation 中已展示的引用无需工具调用即可使用。`sourceRefs` 接收本题牌河的
`sourceRef`、`riichiDeclarationRef`、`calledByRef`，当前摸牌的 `sourceRef`，副露的
`createdEventRef`、`latestEventRef`、`calledDiscardEventRef`、`upgradedPonEventRef`，
以及立直状态的 `declarationEventRef`、`acceptanceEventRef`（仅非空值）。这些公开事件
也可作为 `evidenceRefs`；后者另接收 `self.evidenceRefs`、振听各分量的 `evidenceIds`、
`self.meldRefs` 与公开副露的 `meldRef`。副露身份或仅作为证据展示的引用不自动取得
source 权限。工具/知识结果新增引用继续分别按 evidence/source 分类登记；白名单只取
当前题已展示字段与该题已观察结果，不取整个 run alias map，未知或仅在其他题出现的
引用仍须拒绝。

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

T1 稳定排除 reason code 为 `rules_unavailable`、`non_action`、`not_pre_action_snapshot`、`fewer_than_two_candidates`、`contains_non_discard_action`、`invalid_action_binding` 与 `case_limit_reached`。先按 canonical decision order 对完整数据集筛题，纳入最早最多 3 题，再把超额合格题记为 `case_limit_reached`；label 只可在全量选择结果冻结后计算。候选 actionRef 始终按 canonical 字符串序排序。Arena native rule query 要先将 `canonicalStreamIdentity` 收窄为仅承诺 `eventPrefixSha256`、决策身份、规则集与 rule identity 的前缀身份，并重算 requestId；拒绝仍带 whole-stream identity 的规则请求，避免未来事件改变规则请求字节。

## 5. Blind observation 与隔离裁判

Blind observation 从 `DecisionSnapshotV2` 的决策前状态做**显式白名单投影**，不是从含答案的生产 package 删除几个字段。至少保留当前玩家自己当时可见的手牌/摸牌、已公开的牌河/副露/宝牌/立直状态、局况/规则、可用公开历史与完整合法切牌集合。未知字段继续显式 unknown；不得用结果事件或对手暗手补值。

以下数据禁止进入 provider 请求、MCP/RAG 请求/响应以及可回读的 Coach-visible metadata：

- 实战最终动作与产生该动作的后续事件；
- Mortal 最终动作、Q 值、概率、排序与 model identity 可推断的推荐；
- `errorGap`、model/actual agreement、selector 入选原因及既有 Coach 报告/答案性文本；
- 决策后的摸牌、和牌/流局结算、之后的场况以及当时不可见的他家暗手；
- 原始牌谱 bytes、原始 source path、账号/牌谱 URL、secret 和 grader map。

校验不可只扫描关键字或删除字段。任何 observation/tool/RAG DTO 均从 allow-list 构建且以 strict schema 验证。所有 Coach/provider 可见的来源身份引用均使用每次 run 独立生成的 opaque alias，包括 `caseRef`、canonical event/evidence/source refs（例如 `canonicalEventId` 与 `sourceRecordRef`）、MCP/RAG 返回的 citation/ref，以及可见的诊断与错误文本。alias 不得包含、拼接、可逆编码或以排序关系泄漏原始 `gameId`、`recordId`、`decisionEventRef`、文件名、账号/牌谱 URL、Mortal label 或答案顺序。由于现有 `canonicalEventId` 与 `sourceRecordRef` 可包含原始 game/record identity，它们不得直接穿过该边界。trusted runner 在读 Mortal label 前为选定 case 建立私有 alias map；同一 run 内同一身份映射到稳定 alias，不同 run 不共享 alias。该 map 只供受信 runner/helper/grader 解析引用和校验，不得发给 provider，也不得出现在 Coach-visible DTO、MCP/RAG 输出或工具错误信息中。对一个固定 alias map 和 frozen decision-time state，注入原始 gameId/recordId canaries 或仅改动 actual、label、Q 值、后续事件，都不得改变发出的 blind observation、MCP/helper 与 RAG bytes；其中实际/标签变化必须 byte-for-byte 保持相同，候选顺序也不得改变。

## 6. 真实 MCP 与资源界限

helper MCP 必须由真正的 MCP client/server 协议调用；现有 JSONL helper transport 只作为内部下游，不能冒充 MCP。首版本地只读，优先 stdio；server 绑定本次 run 的案例表和合法候选，不解析模型给出的原始牌谱，也不自行重建规则状态。

工具职责保持少量、面向问题，例如按需取得允许的局面细节、对少量指定候选/维度分析、或检索资料。初始观察已足够回答的问题不强迫调用。每条事实包括 actionRef、维度、值、单位、evidence/source ref、计算器及版本；不支持的能力返回 `unsupported`/`unavailable`，不补造数字。

MCP server 仅允许读取当前授权 case 的冻结事前状态和提供的合法 actionRefs。拒绝越权/未知 caseRef、非法或重复 actionRef、任意路径、shell、完整牌谱读取、未来事件、Mortal 查询与任意模型评分。每次 actionRefs 与 dimensions 数量、返回字节数、helper timeout 和整 run tool-call/总时长都必须有有限上限；实现将上限写入版本化配置并测试超限拒绝，超过结果上限时返回错误状态，不能截断后假装完整。相同 frozen request 可以做确定性缓存，但缓存键和返回物不得包含或依赖 label。

COAC-221 的 v1 实现只注册 `analyze_candidates`：strict 输入为 `caseRef`、1–3 个 offered `actionRefs` 与 1–4 个请求维度；维度目前为 `shanten`、`effective_tiles`、`remaining_waits`、`ukeire`、`dora_count`。未知维度逐项返回 `unsupported`，事实不足返回 `unavailable`，不会补造数值。server 从绑定的决策时 facts 与已验证候选调用现有 `projectCandidate`/`MahjongFactEnginePort.analyzeHand13`，并以现有 `validateHand13Result` 校验；输出只包含请求的候选/维度、值与单位、per-run opaque `sourceRef`/`evidenceRefs`、helper identity 或 adapter 版本及状态，不暴露原始 helper 请求身份或错误 prose。

2026-10-16 修复 `ukeire` 漏映射：该维度复用 helper 的 `effectiveTile34` 与
`waitsRemaining`，不另写向听／进张算法。`available` 的 `value` 包含 `shanten`、
`effectiveTileTypeCount`、`nonExhaustedTileTypeCount`、`totalRemainingCopies`，以及
`tiles: [{ tile34, tileId, remainingCopies }]`；耗尽的有效牌保留在列表中，张数为零。
单位 `unseen_tile_copies` 与 `countBasis: unseen_copies_not_wall_count` 表示扣除自家
已知牌与公开可见牌后的未见枚数，不等于真实牌墙中的枚数。helper 缺少可见信息时
返回 `unavailable/helper_missing_visibility`，不再因维度漏接返回 `unsupported`，也
不把未知记零。工具说明和输入 schema 同时公布此能力。原日志保留历史返回，后续
实验通过新启动的 MCP 子进程使用修复；未增加工具权限、计算 owner 或生产路径。

验证：31 项 MCP／runner 测试及构建、架构检查通过；包含真实 CLI MCP 子进程与
打包 helper 的一致性、缺少可见信息和零枚有效牌。历史实验
`084f2ef9-71ff-498e-a190-35a80857a0d2` 案例 0 的两个失败候选，使用原牌谱前缀与
真实规则重新绑定后均返回 `available`（16 种、52 张），逐牌结果与直接 helper 一致。
复测不调用模型，也不重写旧实验成绩。

限制固定在 `blind-discard-arena-mcp-limits/v1`：每 run 最多 8 次工具调用、12 次 helper 调用；每 call 最多 3 个候选和 4 个维度；单结果上限 16 KiB（超出返回 `result_too_large`，不截断）；helper 单次 2 秒、单次工具 10 秒、helper 累计 20 秒、run 5 分钟。只处理一个并发请求；忙时返回 `helper_busy`。server 要求组合方提供立即释放 helper 的回调（受管 client 的普通 `close()` 可能排在当前请求之后）；helper 超时、stdio client 断连或 run deadline 时调用该回调并关闭 server。运行时调用者只能降低这些上限，不能抬高 v1 上限。

helper direct call 与 MCP 返回在相同输入上语义一致。至少一个测试通过真实 stdio MCP protocol server/client，并验证访问控制、超时、断连、helper 错误、超大结果和 unsupported dimension。

## 7. RAG 插拔契约

统一窄接口：`query + context/filter + limit → status + passages + source refs + retrieval metadata`。严格 DTO 归 `contracts`，可替换的 mode/retriever 与种子读取归 `desktop`；不引入通用 agent/RAG framework。

- **off**：明确回 `disabled`；不打开、访问、动态加载或扫描 corpus。它与 local 无命中不可混为一谈。off 响应的 `corpusVersion` 为 null，retriever version 为 `disabled`。
- **local**：在少量有来源、可使用、被本地整理的种子材料上做真实检索；可从简单全文/词项检索开始，不要求 embeddings、远程服务或外部数据库。已加载 corpus 但没有词项命中时回 `no_hits`。
- 请求只含有界 query、受限 topic/applicability context/filter 和 limit；不接受牌谱、冻结状态、文件路径、候选集、答案或工具权限。v1 限 query 400 字符、最多 5 个结果、单 passage 1,000 字符、corpus 最多 20 个 passage。
- 命中 passage 有有界 content、每次 run 的 opaque `sourceRef`、来源标题/文档位置、适用条件、corpus version、retriever version；metadata 记录 query/context/filter/limit 与结果 refs。所有 source refs 由 run-local alias vault 生成，seed/source id 不出现在结果中。
- v1 retriever `arena-local-terms/v1` 使用 NFKC/case-folded Unicode terms，汉字连续词按重叠双字词项匹配；先过滤，只保留至少命中一个 query 词项的 passage，再按标题/正文词项分数和受限 context 提示排序，context 不能单独召回 passage；最后按隐藏 passage id 确定性打破平手。limit 截取最终有界结果。此检索只负责资料召回，不计算牌效或唯一弃牌。
- 牌例题干、关键状态、解释及适用限制作为一个有语义关联的 passage 保持完整，不以切块制造错误上下文。v1 的两个 seed 都是概念摘要，不含具体题干、牌谱或答案；检索器按登记 passage 原样返回，不会自动切块。
- corpus 是不可信数据，不能改变 system instruction、case 权限或工具名单；不得包含评测 case、Mortal label、候选排名或针对验收题生成的答案解释。检索 DTO 为 strict allow-list，不包含工具权限字段。
- `blind-discard-arena-seeds/v1` 仅收录仓库课程作者的短摘要，分别对应 `course/lessons/0001-effective-tiles-and-live-counts.html`「本课只记一条 / 概念说明」与 `course/lessons/0006-compound-shapes-abcd-abbc.html` 同名位置。归属/许可依据是同仓库课程内容的本地摘要；没有复制外部教材、练习题或答案文本，不表示可重新发布外部来源内容。原课程的技术参考记录在 `course/docs/RESOURCES.md`（MahjongRepository/mahjong、Daina Chiba《Riichi Book I》）。种子本身保留来源位置与 rights basis。
- off/local 替换不得要求修改 scorer、helper MCP 或 Coach 主循环。`blind-discard-arena-rag.test.ts` 机械验证 off loader 零调用、local no-hit/hit 状态、来源 alias/版本/limit/filter、完整 passage、strict DTO 与种子来源边界；这证明接线/引用/边界，不证明策略正确。

## 8. Tool loop、submission 与预算

运行顺序固定为：

`blind observation → model-selected query → actual tool call → bounded tool result → optional further query → locked final submission → grader`

不得在 runner 预填候选 × 维度矩阵。provider 只在 Arena 专属的 tool-call contract 下返回 tool request 或 final structured submission。工具请求必须由 run registry 验证；未知工具名、格式错误、case mismatch 或超额调用都拒绝并记录。Final schema 拒绝非本题 actionRef、跨 case 引用、重复/缺失字段、超长文本与凭空声称的工具/资料引用。

运行必须有可设置且有限的总时间、provider turn 数、工具调用数、上下文/输入字节和输出 token/字节上限，以及取消信号。每次 tool call 另受第 6、7 节限制。预算在开始前绑定并落 manifest；耗尽/超时/取消后保留已发生的证据和准确终态，绝不构造默认选择、伪造事实或把失败写成 complete。注册工具的清理也在 run 总时限内：runner 将取消信号传给 dispose，单次最多等待 250 ms 且不得越过剩余 run 时间；等待超时或 run 取消时触发 forceDispose。清理失败不能报告为 completed，超时/取消期间仍以对应终态结束。Provider 用量缺失时为 unknown，不推算精确费用。

Arena tool-call provider/loop 可复用 main-owned credential custody，但它必须是新且隔离的 Arena seam。不要扩展 `LlmCoachProvider.complete` 使生产行为变成 tool loop；不要改 `generateReviewReport` 的 one-completion/transport retry/semantic failure 语义。若既有获授权 provider 无法支持所需工具循环，则如实标注真实 LLM 演示待办，不用 stub 代替。

COAC-223 的 `runBlindCoachCase` 接收一份 strict blind observation、私有 grader binding/reference、Arena provider 与本次 run 的 tool registry。初始 provider 输入只含决策时 observation 和实际注册的工具名；runner 不预取候选 × 维度矩阵。模型每轮最多发起一个 function call；真实 MCP adapter 先确认 server 仅公开 `analyze_candidates`，RAG adapter 对 strict retrieval request 及返回 caseRef/sourceRefs 做验证。动态 `submit_decision` 只允许本题 offered actionRef 和当前已观察到的 source/evidence refs。submission 通过校验后立即锁定并结束求解；runner 之后才把私有 grader binding/reference 交给既有离线 scorer，评分结果不返回同一次 provider 循环。

T3 的 `blind-discard-arena-run-limits/v1` 默认上限为：5 分钟、12 个 provider turn、16 次工具调用、每轮 64 KiB provider context、每轮 2,048 output tokens、每轮 16 KiB 与整 run 64 KiB provider output、8 KiB 工具输入、16 KiB 工具结果、单次工具 10 秒、512 KiB 有序事件轨迹。时间、字节和调用次数可降低但不能提高；输出 Token 使用调用者指定的正安全整数，模型能力仍由 provider 决定。超时、取消、MCP/RAG 错误和预算耗尽保留终态、已有事件及 scorer 分母；错误 prose 不透传。OpenAI-compatible adapter 每次只发送一个 `tool_choice: required` function call，不自动重试，只保留经验证的工具调用参数和安全 token usage，不保留 provider content/hidden CoT 或凭据。T3 返回有界的内存轨迹；T5 CLI 将其保存到 run archive。

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

T5 提供仓库原生本地命令，并按用户后续要求提供复用该 CLI 的本地控制台。当前 CLI 模式参考 `coach/bin/riichi-coach.mjs`；为保证生产 prototype 原样，新增 Arena 命令而不改 `coach:demo`。拟冻结的使用形态为：

```powershell
cd coach
npm run arena -- run --dataset blind-discard-smoke-v1 --rag off
npm run arena -- run --dataset blind-discard-smoke-v1 --rag local
npm run arena -- inspect <runId>
```

当前入口定义于 `coach/package.json` 和 `coach/GETTING_STARTED.md`，并新增于 `coach/bin/blind-discard-arena.mjs`；它不改动 `coach:demo`。每个 run 在 `coach/reports/blind-discard-arena/<runId>/` 写入 manifest、事件轨迹和 summary，`inspect` 只读取这些归档并重算 summary，不启动 provider、MCP 或 RAG。

固定 smoke 数据来源优先从现有脱敏完整记录 `coach/packages/mahjong-soul-source/tests/fixtures/real-record-complete.json` canonical replay；当前 `paipu-import-service.test.ts` 读取的就是该路径。该 fixture 只证明 source/canonical 回放输入，不得复用测试中冻结的 rule response / scoring stub 冒充真实 Mortal。case builder 按第 4 节完整规则动作空间筛选，在符合条件的完整记录内按 canonical 决策顺序选最早最多 3 个 case；筛选全程不读 Mortal label。dataset manifest 冻结 source hash、case refs、分组和 seed。off/local 两次运行消费完全相同的 case set 和候选顺序。

T1 已使用 fixture 的真实 record bytes、managed native libriichi 规则查询和固定 Mortal checkpoint 冻结首个 smoke/dev case set。只扫描规则输入与结果后，先将完整 125 个 replay decision 交给 label-blind selector 并冻结纳入集；随后才为三道入选题查询并绑定 Mortal label。评分请求只能使用已筛题的 blinded native request/result，不得为评分恢复 whole-stream identity。以下 receipt 不含 label actionRef、Q 值或分数：

| 字段 | 冻结结果 |
|---|---|
| source | `coach/packages/mahjong-soul-source/tests/fixtures/real-record-complete.json`；sourceRecordHash `sha256:fe547cc2b42f0ea83230feaa0fbbdf9bab7281838a66f051cb7a8609687e1c33`；selfActor `0` |
| scan | 125 个 canonical decisions，完整扫描至 order 124；纳入最早的 orders `0`, `1`, `2`；三题均为 `self_turn`、roundOrdinal `0`，各有 13 个完整合法候选 |
| selected candidate-set digest | 对按 actionRef 排序后的数组运行 `SHA-256(UTF-8(libriichiRuleCanonicalJson(actionRefs)))`：order 0 `5e5412f923b1d7e8bd8cd19b397b2c9c3604ea68d3a51723d0d3430de1244f7f`；order 1 `6bdbf9f931bfb365057adcfc94527dea012e0a1f03efd5a286065d210e5f51a1`；order 2 `339c792bfbc2200cec25278223b217b5093b060637c52e16be088b2171b466e5` |
| exclusions | 122 个：`case_limit_reached` 107（decision orders 3–13、24–32、34、36–63、67–124），`contains_non_discard_action` 6（14、33、35、64–66），`fewer_than_two_candidates` 9（15–23）；其余 reason 为 0。区间逐 decision 展开后即可还原每个稳定 reason code；三道入选题在 label 解封前确定 |
| rule runtime | libriichi revision `0cff2b52982be5b1163aa9a62fb01f03ce91e0d2`；native artifact SHA-256 `5ff7f712a45c7288f739af7c7e0613567b467ee4ade2c66c0988e18982cdefad` |
| Mortal reference runtime | Mortal revision `0cff2b52982be5b1163aa9a62fb01f03ce91e0d2`；checkpoint revision `7386c9f5c751a3ea75efea99737cef5a5ef950f1`；checkpoint file SHA-256 `738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20`；runtime config SHA-256 `1c4d2711033cbc897602655907548ba47876b356723a52efc7ab05a30f6a35df`；三道 label 均经候选全集 binding 验证 |

每次运行仍须为 caseRef 生成新的 opaque alias；canonical decision order 与 candidate-set digest 仅用于 fixture 版本回归，不传给 Coach。T5 若更改 fixture、规则/native identity、checkpoint、runtime config 或 selector，必须提升 dataset/case-set version 并重新保存 receipt。以上为单牌局 smoke/dev 集，不构成 holdout acceptance。

holdout acceptance 至少使用另一个不同的完整 gameId；只能从仓库已有且获准的脱敏真实语料或经授权加入的新记录选择。先按 gameId 固定 dev/acceptance split，再从 accept game 按同一 label-blind 规则取最多 3 个合格 case。若仓库语料不够两个完整且有合格动作的独立牌局，必须报告缺少 holdout 样本，不得把同一牌局按 decision 切分或把模拟数据叫真实验收。case set 无合格项时，T5 必须报告空集及筛题原因。

同一已验收代码 SHA 的实际 demo 至少留下以下可核结果：

1. 一个有效 Coach 请求在冻结提交前自主发起至少一次候选/维度查询；记录证明走真实 MCP stdio client/server 且结果来自现有 helper。
2. 一个 local 检索命中含来源 ref，且 off run 明确是 disabled；两者使用同一 case set。每题是否检索由 Coach 自主决定。
3. 全纳入题目的 summary，列出失败/不匹配数，即使其值为 0；同时报告所有纳入 case 与排除原因。
4. 至少一条受控 helper failure/timeout/budget-stop 路径，保留真实失败状态，无伪造事实或成功结果。
5. `inspect` 在无 provider/MCP/RAG 启动条件下离线重算同一 run summary。

COAC-224 本地 partial verification（2026-10-15，代码 SHA `7faaa81e5ba4041fb0ce8ae2b01b08a526aa3636`）：off run `41320535-eccd-4aa4-b8e8-f40bac9f48f2` 与 local run `ff4e0566-8ece-4274-a30b-3ec5c5f12571` 使用相同 case-set digest `cb38694fab4191f9d40b8174148852aebff268c377991fc14ff85caca8d8192a`；各扫描 125 个 decisions，label-blind 选择 3 题、排除 122 题；每次均有 3/3 个固定 Mortal labels 成功绑定，failure/label-binding 计数如实列入归档。off manifest 明确为 `corpusVersion: null` / `retrieverVersion: disabled`；local manifest 固定 `blind-discard-arena-seeds/v1` / `arena-local-terms/v1`。两次均因 provider 未配置而记录 3 个 `provider_unavailable`，helper/RAG query 均为 0；off 与 local `inspect` 均离线重算成功。此轮没有产生模型提交、真实 MCP/RAG 查询或受控 helper failure，因此这只是 CLI、archive、真实 Mortal labels 与 inspect 的部分验证，真实授权模型演示和相关 tool-loop 验收仍待完成，不构成 Arena 总体 PASS。

真实 Mortal final labels、helper MCP 和获授权且有预算的真实 LLM 是不同验收事实；stub、登录成功、Mortal 成功或历史 receipt 均不能替代真实 LLM tool loop。未获授权或缺凭据时把该栏标成“待真实模型演示”，不宣称总体 PASS。

## 11. 永久回归 owner 与命令

行为测试在权威 owner 中覆盖 T1 的 allow-list、alias、规则请求 future-prefix 隔离、完整候选筛选、submission binding 与 scorer denominator，T2 MCP 协议/权限/资源边界，T4 off/local retrieval 边界，以及 T3 实际 MCP/RAG tool loop、submission-before-grading、错误隔离和预算/取消终态；它们不证明决策策略正确、真实模型演示或 T5 CLI/run archive 已完成。回归 owner：

| 不变量 | 新测试 owner（建议精确路径） | 现有基线 |
|---|---|---|
| 原始 gameId/recordId canary 不出现在 Coach observation；固定 alias map 下 actual/label/future event 不改变 observation/candidate 顺序；规则请求只承诺决策前缀身份；strict allow-list 与隐藏字段拒绝 | `coach/packages/desktop/tests/blind-discard-arena-case.test.ts`（T1 行为回归） | `packages/reasoning/tests/stream-replayer.test.ts` |
| 完整合法动作、赤牌区分、已验证物理实现 mapping、submission action/case/source/evidence binding 与 Mortal label binding | `coach/packages/desktop/tests/blind-discard-arena-case.test.ts`、`coach/packages/desktop/tests/blind-discard-arena-scorer.test.ts` | `packages/reasoning/tests/libriichi-rule-projection.test.ts`、`local-mortal-rule-scoring.test.ts`、`libriichi-full-game.test.ts`、`packages/mortal-runtime/tests/managed-runtime.test.ts` |
| invalid/missing/timeout/tool error/budget stop 始终进入主分母；label 不可用及绑定失败分别计数；固定提交可离线重算 | `coach/packages/desktop/tests/blind-discard-arena-scorer.test.ts` | 新 scorer suite；现有生产 test 不覆盖 Arena 分母 |
| 实际 MCP stdio 协议、只输出 per-run opaque source/evidence refs、case/action 权限、超时/断连/大结果拒绝、同 packaged helper direct parity | `coach/packages/desktop/tests/blind-discard-arena-mcp.test.ts`（T2 行为回归） | `packages/reasoning/tests/fact-engine-client.test.ts` 与 `npm run test:fact-engine` |
| RAG off 不读 corpus、local no-hit 与 hit 可区分、context 不能替代词项命中且只调整词项命中结果排序、有来源、bounded output、prompt injection 不取得权限 | `coach/packages/desktop/tests/blind-discard-arena-rag.test.ts` | Arena 新 suite；COAC-222 实现 |
| 模型选择真实 MCP/RAG 查询，无预取矩阵；只用已观察 refs 锁定 submission，之后才评分；断连/工具超时以 sanitized event 保留并允许安全恢复；清理受剩余 run 时限、取消和有界 force-dispose 约束 | `coach/packages/desktop/tests/blind-discard-arena-runner.test.ts` | Arena 新 suite；COAC-223 实现 |
| Arena provider 每轮最多一个函数调用；凭据留在主进程、无自动重试，不保存 provider 原始 content/hidden CoT | `coach/packages/desktop/tests/arena-tool-call-provider.test.ts`、`coach/scripts/check-architecture.test.mjs` | Arena provider contract；COAC-223 实现 |
| Mortal reference scoring 仅接受 label-blind 筛题所用的 prefix-bound native request/result，且在 selector 冻结后生成评分请求 | `coach/packages/desktop/tests/blind-discard-arena-case.test.ts` | Arena Mortal label projection seam；COAC-224 实现 |
| archive event/manifest schema 校验、失败终态与 helper/RAG/tool 计数离线重算；inspect 不依赖运行中的 provider/MCP/RAG | `coach/packages/desktop/tests/blind-discard-arena-archive.test.ts` | T5 archive summary contract；COAC-224 实现 |
| production ReviewReport 的一次 completion、provider retry、保存/读取与 UI 语义不变 | 继续维护现有 owner | `npx vitest run packages/reasoning/tests/review-report.test.ts packages/reasoning/tests/automatic-report-scope.test.ts packages/desktop/tests/coach-provider.test.ts packages/desktop/tests/codex-coach-provider.test.ts` |

从 `coach/` 运行。每票的 focused Arena command 为 `npm exec -- vitest run` 加该票实际新增的测试路径。跨依赖修改另按 [verification gate](../development/VERIFICATION.md) 运行适用的 `npm run typecheck`、`npm test`、`npm run check:architecture`、`npm run test:package-import`；若改变 architecture checker，同步其自测 `npm run test:architecture-checker`。真实 runtime/helper/provider/fixture 变更按现有 Local Mortal、helper、协议及 external/H1 gate 执行。T1 已运行 focused case/scorer tests（13/13）、`npm run typecheck`、`npm run build`、`npm run check:architecture`、`npm run test:package-import`（2/2）与 `git diff --check`。全量 `npm test` 的并行运行结果为 215 个 test files 通过、4 个失败；2737 个测试中 2728 通过、9 个因超时或 fake-runtime `pid.txt` ENOENT 失败，Arena suites 未失败。将这 4 个受影响文件用 `--no-file-parallelism --maxWorkers=1` 单独重跑后，131/131 通过；因此此处不把那次全量并行运行记为 PASS。真实样例 selection receipt 的 runtime identity 和排除计数见第 10 节。

COAC-222 T4 验证（2026-10-15）：RAG focused suite 7/7，T1 case/scorer 与 T2 MCP 相邻回归 23/23；`npm run typecheck`、`npm run build`、`npm run check:architecture`（7 packages / 511 files / 2,459 imports / 0 violations）、`node --test smoke/package-import-smoke.mjs`（2/2）与 `git diff --check` 通过。全量 `npm test` 的并行 Vitest 阶段有 218/220 files、2,747/2,753 tests 通过；`fixed-review-renderer.test.ts` 出现 `spawn EBUSY` 与 5 秒超时，`app-composition.test.ts` 有 20 秒超时。以 `--no-file-parallelism --maxWorkers=1` 重跑这两文件后 51/51 通过。由于完整命令在并行 Vitest 阶段退出，后续协议更新器、协议兼容性和真实 fixture 生成器分别单独运行并通过（26/26、4/4、6/6）；因此保留并行全量结果为有资源竞争的非 PASS 记录，不把它写成整体 PASS。

COAC-223 T3 验证（2026-10-15）：Arena case/scorer、MCP、RAG、runner/provider focused suite 6 files / 44 tests passed；production report/provider adjacent regressions 4 files / 74 tests passed。另通过 `npm run typecheck`、`npm run build`、`npm run check:architecture`（7 packages / 517 files / 2,495 imports / 0 violations）、`npm run test:architecture-checker`（128/128）与 `npm run test:package-import`（2/2）。最新全量 `npm test` 并行运行有 221/222 files、2,790/2,791 tests 通过；唯一失败是 `fixed-review-renderer.test.ts` 中的 Chromium `UnknownVizError`，该文件用 `--no-file-parallelism --maxWorkers=1` 重跑后 31/31 通过。并行全量结果仍记录为非 PASS，不把它写成整体 PASS；未执行真实云 provider/model 调用，未验证 T5 archive/CLI。

COAC-223 P2 修复验证（2026-10-15）：`npm exec -- vitest run packages/desktop/tests/blind-discard-arena-rag.test.ts packages/desktop/tests/blind-discard-arena-runner.test.ts packages/desktop/tests/blind-discard-arena-mcp.test.ts --no-file-parallelism --maxWorkers=1`（3 files / 33 tests）、`npm run typecheck`、`npm run build`、`npm run check:architecture`（7 packages / 517 files / 2,495 imports / 0 violations）、`node --test smoke/package-import-smoke.mjs`（2/2）与 `git diff --check` 通过。定向回归覆盖无词项命中时 topic/applicability context 不返回命中、context 只重排词项命中、final/tool-timeout cleanup 的慢或永不结束 dispose 受限、清理中取消，以及真实 MCP stdio 子进程强制关闭。未运行真实云端模型；T5 archive/CLI 仍待后续实现。

COAC-223 P2 清理截止竞态复修验证（2026-10-15）：runner 在剩余 run 预算充当清理 timer 时立即锁定 `timeout`；250 ms 独立清理宽限仍保留原有 force-dispose 恢复语义。新增 fake-timer 回归，固定 clock 让清理 timer 在总 deadline 前触发；去掉修复时该用例稳定得到 `completed` 并失败，修复后 RAG/runner/MCP 3 suites 共 34 项通过。`npm run typecheck`、`npm run build`、`npm run check:architecture`（7 packages / 517 files / 2,495 imports / 0 violations）及 `node --test smoke/package-import-smoke.mjs`（2/2）通过；未运行真实云端模型，T5 archive/CLI 仍待后续实现。

真实样例 selection receipt 的 runtime identity 和排除计数见第 10 节。

## 12. 非目标与停止条件

2026-10-15 用户追加扩充题库：在原 fixture/native identity 上增加 `blind-discard-dev-v1`，扫描全部合格决策形成开发题库，按稳定顺序、offset 与 maxCases 在解封 Mortal labels 前冻结本次范围；默认每批 10 题，单批最多 128 题，实际题数由真实规则筛选决定。旧 `blind-discard-smoke-v1` 的 3 题和 case-set digest 保持原样，不将新范围冒充旧版本。manifest 可选 selection 记录 offset/poolSize，归档/实时轨迹相应支持最多 128 个案例。`catalog` 只运行真实规则筛选并保存公开盲测输入，不调用模型或计算 Mortal 答案；控制台复用同一进程入口刷新目录、浏览题目和选批次。仍只有一个开发牌局，不改变完整牌局隔离或独立 holdout 的验收要求。

2026-10-16 控制台口径与阅读修订：执行成功率为 completed 案例数 / 本批纳入案例数；Mortal 一选匹配率为 matched 案例数 / completed 案例数，成功但缺少标签的数量另行标明。未完成归档单列，不按成功或失败补零；原始评分 DTO 中全纳入主指标保留供离线复查，不再用作控制台决策匹配率。模型可见 DTO 在 `createArenaBlindObservation` 使用现有 `sortTilesCanonical` 复制理牌，摸牌独立保留；原 canonical 流、规则请求与绑定快照不变。旧归档只在显示层理牌，不重写历史输入。控制台复用已有 SVG 牌面；案例默认展开第一项、其余可折叠，展开状态在刷新时保留，详情头与关闭按钮独立于正文滚动。基础事实预计算/缓存属于后续实验方法选择，本次未改变工具取证或默认模型事实供给。

2026-10-15 用户追加本地实验控制台：沿用 T5 CLI 与归档 owner，提供预算/结果看板、实验启停和模型/API 配置，不改生产复盘 UI。控制台默认本机 Codex `gpt-6-luna/high`、累计归档已报告 token 报警线 100M；串行执行同一开发案例集的 off/local 或受控故障运行，不自动生成额外实验。实验“运行完成”、独立验收、专家质量审查保持不同事实；工具失败与未完成归档必须可见。API Key 仅保留在本次服务进程内存，manifest 和配置文件不存密钥。

同日追加逐案例执行轨迹：可选的 `run_started.observation`、`provider_turn.decisionSummary` 与工具事件相对开始时间向后兼容旧归档。`decisionSummary` 只是一两句公开操作说明；provider 的私有 reasoning/raw content 仍不保存。CLI 将已通过 runner schema 的事件同步追加到诊断文件 `case-trace.jsonl`，实时读忽略末尾未完成行；最终 `case_run` 是评分/用量的唯一 owner，不从实时副本叠加指标。逐题显示真实工具请求/返回、提交/拒绝、评分与耗时；缺失字段明确显示未记录，不还原或编造旧轨迹。参考界面组织：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[Multica execution logs](https://github.com/multica-ai/multica#stay-in-the-loop)，不引入它们的运行时依赖。

调用失败修复：Arena 的 Codex 结构化入口接受 CLI `error` 事件中已识别的 `Reconnecting... n/m` 进度，继续等待同一进程的最终终态，原有时间/字节/取消边界不变，未增加整题重试。可选 `provider_turn.reconnectCount` 记录连接重试数；`failureCode` 仅允许固定诊断枚举，失败时已报告的 usage 继续归档。未知错误、工具事件、非零退出与缺失终态仍失败；不保存原始错误文本。旧失败记录不追填推测结论，生产 provider 的固定版本与解析策略不变。

引用生成修复：Arena 的 Codex 输出使用闭合对象包裹工具选择；strict 工具（当前为 `submit_decision`）的参数直接嵌入 CLI 输出 schema，不能用 JSON 字符串绕过动作、案例和引用枚举。适配器在返回原有 provider DTO 时才序列化参数，runner 继续执行最终语义校验。证据与来源沿用各自的已观察集合；集合为空时数组上限为 0，超过 128 个编号时也继续枚举，不退化为任意字符串。无效提交仍是失败，不删除引用、不替换答案、不自动重试整题。真实批跑与旧失败记录分别保留。

Arena 的同一 CLI 轮可包含多条助手消息，收到完整终态后只校验最后一条的工具选择 JSON；早期进度消息不执行、不归档，最后一条无效不回退到早期消息。此兼容限定在 Arena 结构化入口，真实工具仍只由 runner 执行。

COAC-224 的真实模型入口补充（2026-10-15 用户授权）：本机 Codex/ChatGPT 订阅，`gpt-6-luna`、reasoning effort `high`；通过现有 main-owned Codex 进程执行一次结构化 Arena 工具选择，再由 runner 调用真实 MCP/RAG。仍使用原 Arena DTO/预算/提交后评分边界，不调用生产 report seam，不暴露 CLI 工具或 grader 标签。当前工作树归档累计已报告 token 的报警线为 100,000,000，缓存为输入子集，未知用量不填零；报警不等于自动停机。此补充不把 smoke/dev 案例变成独立验收集，牌局隔离与真实演示结果仍须如实记录。

本轮不做大规模教材搜集/爬虫、第二麻将算法/合法动作引擎、Mortal/LLM 训练微调、多 Agent 辩论、长期用户模型、web dashboard/生产 UI、精确顺位 EV、通用反事实模拟器或“匹配 Mortal 即证明专家正确”的判断。本地实验控制台已由用户后续明确纳入范围，生产 UI 仍不在本票范围。

五票达到第 10 节的真实验收后停止扩框架；下一步由真实失败样本决定补工具、知识、检索、方法或模型能力，不默认扩张 RAG。

## 13. Durable owner

- Blind Discard Arena 的唯一 normative owner：本文件。
- 生产数据/依赖/报告语义继续归 `coach/docs/development/ARCHITECTURE.md`、`coach/docs/development/INVARIANTS.md`、ADR-0005/0006、生产 Coach 与 local Mortal specs 及实现/tests。
- Roadmap 只记当前状态并链接本文件；工作票只记执行范围及本文件路径，不复制 contract。


### 本地控制台：评分明细与运行配置（2026-10-16）

- 每个案例结束后，`mortal-details.json` 保存最多 10 个真实 Q 评分；不进入模型、MCP 或 RAG 输入。Q 不是胜率或预期得点。侧文件写入失败不丢弃原始实验归档。
- 旧归档可用 `mortal-details <runId>` 补算；校验原牌面、案例集合及 Mortal 身份一致后另存明细，不修改原结论或用量。页面仅返回已有最终案例事件的评分。
- 单轮输出 Token 接受正安全整数，不再固定为 2048/4096。API 模式传递 `max_tokens`；Codex 订阅模式为可见响应提示要求，仍核验已报告用量。独立字节、时间与工具预算保持有效。
- `/model-info` 展示当前代码实际 system prompt、Codex 适配前缀、MCP 能力与预算、本地 RAG 语料及参数。当前配置用于新实验，历史参数以实验 manifest 为准；不显示凭据。


### T5 冻结验收方法（2026-10-16）

- `blind-discard-arena-method/v2` 说明真实知识库主题（进张计数、复合牌形）和中文词项查询方式；模型使用一般教学原则时应取得适用来源，disabled/no-hit 如实说明。查询内容与候选选择仍由模型决定，不预填答案或检索结果。v1 历史结果保持原样。
- `blind-discard-holdout-v1` 来自本机已有完整真实记录，通过原 sanitizer 脱敏。来源在查看标签和模型输出前冻结；选择证据为 `packages/mahjong-soul-source/tests/fixtures/arena-holdout-selection.json`，完整样本为同目录 `arena-holdout-complete.json`。源曾用于生产解析/分析回归，未用于 Arena 方法调参；因此独立性限定为本次 Arena 实验。
- 以完整牌局源哈希固定 dev/acceptance 分组，验收全局 selfActor=0，按原 label-blind 规则取最早 3 个合格决策。不同座位或牌局片段不作为另一独立牌局。manifest 记录 disjoint groups；页面单列独立牌局验收，不混入开发集指标。
- 固定代码、模型 gpt-6-luna/high、6 轮、4 工具调用、8192 输出 tokens、逐题 300 秒，分别跑开发三题 Off/Local、开发一题受控 helper timeout、验收三题 Off/Local。Token 报警线沿用 100M。验收结果披露后，不再用此牌局调参后宣称新的未见验收；保留为验收快照及回归资料。
- 不要求 Mortal 匹配率或 RAG 提升达到阈值；专业内容仍标“未专家验收”。停止条件是同一冻结版本具备真实 helper 与来源链、off disabled、完整统计与故障记录、离线复算、相关回归和审核完成。

### 错题集（2026-10-16）

控制台 `/mistakes` 从已有归档只读聚合错题，不调用模型、Mortal 或 helper，不新增数据库，也不改写原实验。问题身份由完整牌局源哈希、原 canonicalDecisionOrder、候选集合 digest 与完整 Mortal 身份组成；不同批次局部题号、dataset 类型、opaque caseRef 不产生重复问题，评分基准变化则单列。当前 CLI 固定 selfActor=0。

错误只计 `completed` 且评分为 `not_matched` 的案例。每题错误率为该题错误次数 / 执行成功且可评分次数（matched + not_matched）；执行失败、成功但缺标签分别列示。看板汇总仅涵盖至少错过一次的题目，不代表整个实验题库错误率。默认合并各模型/Off/Local，筛选后重算分子与分母；受控故障默认排除，可显式纳入。排序支持错误次数、错误率及最近出错。

每次错误以原 runId + caseOrdinal 引用不可变案例记录：当时可见手牌/摸牌/牌河/鸣牌/局况、模型提交与理由、原 Mortal Top 10、公开摘要、工具参数/返回、用量和版本。按时间切换快照，支持分享当前题目/快照 URL 及返回原实验精确案例。原档没有的牌面或评分明确标缺失，不以当前题库或模型重建历史。中断批次内已完成且验证通过的 case_run 仍可计入；不可读取的归档数量明确显示，不冒充零错误。原实验与错题页复用 `arena-console/case-view.mjs` 显示事实。

实现 owner：`bin/arena-mistakes.mjs` 与 `arena-console/mistakes.*`。验证：`scripts/arena-mistakes.test.mjs` 覆盖跨批次归题、基准隔离、条件分母、筛选与故障排除、旧快照缺失；`scripts/arena-console.test.mjs` 覆盖只读 API 和页面路由。2026-10-16 本机真实归档验证为 3 道错题 / 6 次错误 / 6 份精确案例快照（默认范围），另有 1 次同题执行失败；87 个原归档文件复核未变，未新增模型调用。
