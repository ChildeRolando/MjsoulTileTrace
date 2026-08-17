# M6-A4：响应面——决策归属升级与他家响应决策全覆盖规格

日期：2026-08-18
决策来源：[2026-08-18 下一阶段 roadmap 盘问决策记录](../handoffs/2026-08-18-next-phase-roadmap-grill-decisions.md)（A1–A9，已定稿）；
术语以 [`coach/CONTEXT.md`](../../CONTEXT.md) 词汇表为准；验收口径见
[ADR-0002](../adr/0002-coverage-driven-real-corpus-acceptance.md)；证据分层语义见
[ADR-0003](../adr/0003-evidence-first-coaching-judgment-and-authority-layers.md)。
修订：2026-08-18 review round 1——冻结降级阈值 N（数值+口径）、冻结 outcome
第七值 `source_row_not_expected`（删除"按需增加"）、开窗权威分离（Mortal
标记仅源侧锚点）、`resp_pass_on_discard` 候选族子覆盖、response identity
对齐既有 contract 词汇。

## Problem Statement

用户请求一场"整盘复盘"时，教练实际只分析了受评者自摸面的决策（打牌、立直、
暗杠/加杠、自摸、九种九牌）。受评者对他家行动做出的一切响应决策——吃、碰、
大明杠、荣和、抢杠荣和，以及最高频的"选择过"——被 pipeline 整层丢弃，且用户
毫不知情。用户会把"教练没提我那手没吃/没和"误读成"教练认为没问题"，而真相是
系统根本看不见这类决策。一份静默省略一整类决策的"整盘复盘"，比没有复盘更有害。

工程侧根因有二：

1. **决策归属按"谁最后行动"判定**：投影层与绑定层都用 `last_actor == 受评者`
   过滤报告 entry，而响应决策行的 `last_actor` 是出牌/杠牌的他家——于是响应
   entry 全部被丢弃。投影层旁的注释误以为这些行是"对手视角行"（涉及隐私所以
   不投影），事实上报告是单视角评审，所有 entry 的手牌视图恒为受评者手牌：
   这不是隐私边界，是归属 bug。
2. **绑定守恒不变量按"两侧计数相等"表达**：Mortal 报告只为"合法候选 ≥2 的
   决策点"产出行（单候选决策点合法无行，如立直后强制摸切），计数相等在响应面
   上必然不成立，守恒语义必须升级。

## Solution

把 decision identity 从"谁行动了"升级为"谁拥有这个决策"：

- **A4.0（source model 修正）**：拆除两处 `last_actor` 归属过滤；把"报告全部
  entry 均为受评者视角"钉死为受验证事实（不靠注释假设）；重跑 H2 连续性确认
  自摸面绑定不回归；现有 12 个 `no_mortal_entry` 逐个证明本地候选数 = 1 并
  重分类为新合法值 `source_row_not_expected`。
- **A4.1（响应面开窗）**：canonical replay 打开两类响应窗口——他家舍牌响应
  窗口（吃/碰/大明杠/荣和/过）与他家杠响应窗口（抢杠荣和/过）。
- **A4.2（绑定校验）**：响应窗口身份事实表；本地候选枚举与 Mortal 候选空间
  同构；守恒不变量升级为"每个本地窗口要么可绑定、要么有明确无行原因"。
- **A4.3（真实语料验收）**：`response window × actual action` 覆盖矩阵，
  wave-1 六分支每分支 ≥1 真实 E2E，其中 pass 分支按候选族（吃/碰/大明杠/
  荣和）子覆盖取证；稀有单元 fail-closed + 事前冻结的降级条款（N 与计数
  口径见 Implementation Decisions）；chankan 纯事件扫描最早启动。

用户得到的是覆盖所有 A4 已支持并完成验收的响应决策的整盘复盘：已验收响应面上
他家的"吃不吃/碰不碰/和不和/过不过"都出现在分析里，与 Mortal 的分歧可被指出；
未验收的稀有形态必须显式 fail-closed，不允许静默省略——"没出现"只发生在有
机器可读原因时，覆盖完整性成为可验证属性而非口头承诺。

## User Stories

1. 作为复盘用户，我想在整盘复盘中看到我对他家舍牌选择"过"的每一次决策，因为放弃鸣牌/放弃和牌是节奏与防守的重要决策。
2. 作为复盘用户，我想看到我实际吃牌的决策分析，因为吃牌时机（以及吃哪一组搭子）是我最常犯错的领域之一。
3. 作为复盘用户，我想看到我实际碰牌的决策分析，因为碰牌对进攻节奏与防守安牌的取舍影响很大。
4. 作为复盘用户，我想看到我实际大明杠的决策分析，因为杠的时机涉及打点与安全两轴。
5. 作为复盘用户，我想看到我荣和时机的分析（能和而过 vs 即和），因为这是直接的得失决策。
6. 作为复盘用户，我想在他家加杠恰好点炮给我听牌的场景下看到抢杠荣和决策分析，因为这是稀有但高价值的决策点。
7. 作为复盘用户，我想让"分析里没出现"只发生在有明确原因时（该窗口单候选、不构成决策点），这样"教练没提"不再被误读为"没问题"。
8. 作为复盘用户，我想在复盘里看到响应面决策与自摸面决策使用同一套比较与因素差异语义，这样我不需要学习两套语言。
9. 作为复盘用户，我想让"过"被当作一个显式候选参与比较并能看到 Mortal 对它的评分，因为 pass 是响应面最高频的候选。
10. 作为复盘用户，我想让吃牌候选按具体的搭子组合展开（哪一组、吃进哪张），因为"吃"不是一个单一选项。
11. 作为复盘用户，我想让我立直期间的他家舍牌响应（受振听/现物约束的荣和机会）也被正确归属，因为立直后我仍存在"能否荣和"的决策点。
12. 作为维护者，我想让决策归属由决策拥有者（decision owner）而非最后行动者（trigger actor）决定，这样响应决策不会被系统性丢弃。
13. 作为维护者，我想把"全部 entry 均为受评者视角"钉死为受验证的事实，这样未来不会有人再以"对手视角/隐私"为由加回过滤。
14. 作为维护者，我想让决策身份对齐既有 canonical 契约（actor / sourceActor / triggerEventRef / offeredTile / kanKind 等字段被扩展与填充而非另立词汇），这样每个绑定的归属可独立复核。
15. 作为维护者，我想让绑定守恒不变量升级为"每个本地窗口要么可绑定、要么分类为 `source_row_not_expected`"，这样单候选窗口合法无行不会被判为守恒失败。
16. 作为维护者，我想让本地候选枚举与 Mortal 候选空间同构（含吃搭子组合展开与 none），这样枚举差异会被守恒门直接暴露，而不是靠语料碰运气。
17. 作为维护者，我想让"本地枚举 ≥2 的窗口找不到源行"直接判验收失败，这样"Mortal 大概没记"永远不会成为搪塞理由。
18. 作为维护者，我想让"源行出现而本地未预期该窗口"直接判守恒失败，这样本地开窗不会漏掉响应面。
19. 作为维护者，我想重跑 H2 连续性并保持自摸面绑定（125 窗口 / 113 绑定）不回归，这样 A4.0 的拆除过滤不破坏已闭合的 A3 面。
20. 作为维护者，我想让现有 12 个 `no_mortal_entry` 逐个证明候选数 = 1 并重分类为 `source_row_not_expected`，这样 outcome 纪律不被稀释、无行不再无法审计。
21. 作为维护者，我想把 outcome 契约冻结为七值（新增合法值 `source_row_not_expected`，`no_mortal_entry` 保持完整性故障语义），这样 A3 建立的 §21 优先级纪律不被缩水枚举破坏。
22. 作为维护者，我想让稀有分支降级条款事前冻结（N = 10,000 场合格局 + 两来源合计口径），这样稀有分支不会无限期阻塞 A4 关闭。
23. 作为维护者，我想让 chankan 纯事件扫描最先启动（零 Mortal 提交成本），因为它是 wave-1 唯一没有降级兜底的分支。
24. 作为维护者，我想先确认国士抢暗杠规则在雀魂是否存在，存在才纳入矩阵、不存在即出 scope，这样不确定规则不进验收矩阵。
25. 作为维护者，我想让未覆盖的响应枚举与未知规则形态 fail closed（固定 blocked/unsupported 状态），与全仓 fail-closed 纪律一致。
26. 作为维护者，我想复用双平台真实语料验收入口（雀魂首选 + 天凤补充、共享验收核心），这样单平台语料不足的分支可跨平台补齐。
27. 作为审计视角，我想让每个响应窗口携带身份事实（owner / triggerActor / triggerEvent / offeredTile / responseKind），这样每个绑定结论可以脱离实现独立复核。
28. 作为审计视角，我想让每个"跳过"携带机器可读原因而非沉默省略，这样覆盖完整性是可验证属性而非口头承诺。
29. 作为维护者，我想让本地候选数 = 1 的窗口返回独立的合法 outcome（`source_row_not_expected`）而不是伪装成"缺行"故障，这样 outcome 纪律在响应面扩展后依然精确。
30. 作为维护者，我想让降级阈值 N 事前冻结（数值 + 计数单位 + 来源合计口径），这样"扫描到什么时候允许宣布未命中并降级收口"不由执行过程临时决定。
31. 作为维护者，我想让 pass 分支按候选族（吃/碰/大明杠/荣和）分别取证，这样"能荣而过"（none + hora）不会被一个吃牌 pass 代理验收掉。
32. 作为维护者，我想让本地开窗只由 canonical 事件与本地规则/候选枚举驱动、Mortal 源标记只作源侧绑定锚点，这样守恒验证不产生循环依赖。

## Implementation Decisions

- **决策身份模型（对齐既有 contract，不造第二套词汇）**：归属判定按决策拥有者
  （decision owner ≈ window.actor / report.playerId），不再按 last actor；响应
  身份映射到既有 canonical 契约字段：triggerActor ≈ window.sourceActor /
  entry.lastActor、triggerEvent ≈ window.triggerEventRef、offeredTile ≈
  window.offeredTile / entry.tile、responseKind ≈ 既有 discard / kakan / ankan
  枚举（kanKind / winContext / responseKind）。A4 做的是**扩展并填充既有
  discard_response / kan_response 窗口身份**，不新增"response target"之类的
  第二套 identity 词汇（动作侧既有 `targetActor` 已表达"动作针对哪个玩家"）。
- **开窗权威分离（反循环依赖）**：本地开窗权威 = canonical 事件 + 本地规则/
  候选枚举，仅此而已；Mortal 源标记（受评者吃碰位、立直位、他家加杠位等）
  只能作**源侧绑定/身份锚点**——可以帮助确认"这条 source entry 是 kakan
  response"，绝不能告诉 canonical replay"这里应该开一个响应窗口"。守恒
  验证要求两侧独立产生、再相互验证（ADR-0002 本地侧独立生产原则）。
- **视角事实钉死**：Mortal 报告为单视角评审——全部 entry 的手牌视图恒为受评者
  手牌。此事实进入受验证的 schema/投影语义，投影层现存的"对手视角行不投影"
  注释随过滤一并移除（该理由不成立）。
- **Mortal entry 语义**（调研实证，见决策记录 A1）：entry 单位 = 合法候选 ≥2
  的决策点；pass 显式建模为 `none` 动作（不是决策缺失）；单候选决策点合法
  无行。
- **守恒不变量重写**：每个本地窗口要么可绑定、要么有明确无行原因（单候选 →
  `source_row_not_expected`）；不再是两侧计数相等。
- **枚举同构**：本地候选枚举必须镜像 Mortal 候选空间——吃按搭子组合展开、
  `none` 计一候选；硬规则双向：本地枚举 ≥2 无源行 → 验收失败；源行出现而
  本地未预期 → 守恒失败。
- **outcome 契约冻结（新增第七值，删除"按需增加"）**：`MortalDecisionOutcome`
  扩展为 `analysis_ready` / `unsupported_action` / `source_row_not_expected` /
  `no_mortal_entry` / `binding_mismatch` / `model_output_incomplete` /
  `analysis_blocked`。`source_row_not_expected` 是**合法状态**：纯由本地候选
  枚举决定（候选数 = 1 → Mortal 按定义不产出行），在任何源行查找之前判定；
  `no_mortal_entry` 保持**完整性故障**语义（本地枚举 ≥2 → 源行必须存在，缺失
  即守恒失败），绿色验收 run 中计数必须为 0。A4.0 DoD：现有 12 个
  `no_mortal_entry` 逐个证明 local candidate count = 1 并重分类为
  `source_row_not_expected`，H2 重跑新账本预期 = 113 bound + 12
  `source_row_not_expected`。不采用四值缩水枚举。
- **实施顺序**：A4.0（source model 修正 + H2 重跑回归）→ A4.1（response
  replay 开窗）→ A4.2（绑定校验 + 响应身份事实表）→ A4.3（真实语料验收）。
  A4.0 独立可验收：拆除过滤后 H2 必须不回归、12 个无行必须全解释，才允许
  开响应面。
- **分支矩阵**（`response window × actual action`，pass 与 actual 为不可互相
  覆盖的语义分支；设计单位为 Response Window + Actual Outcome + Mortal
  Candidate Set + State Transition 四元组——候选集不同即不同验收事实）：
  - wave-1（常见，各 ≥1 真实 E2E）：`resp_chi_actual`、`resp_pon_actual`、
    `resp_daiminkan_actual`、`resp_hora_actual`、`resp_pass_on_discard`、
    `resp_chankan_actual`。
  - **`resp_pass_on_discard` 候选族子覆盖**：required candidate-family
    evidence = chi 候选族、pon 候选族、daiminkan 候选族、hora 候选族各 ≥1
    例——`none+chi` 与 `none+hora` 不是同一个验收事实。chi/pon/daiminkan
    族为常规必收单元（无降级路径；扫不中即枚举 bug 信号）；hora 族
    （能荣而过）按稀有单元处理：真实语料未命中时适用下述降级条款。
  - 目标例数（ADR-0002 口径）：`resp_pass_on_discard` 3–5 例（跨候选族）；
    chi/pon/daiminkan/hora actual 各 1–3 例；chankan 为稀有分支，≥1 例即收。
  - wave-2（稀有）：`resp_pass_on_kakan`、国士抢暗杠（雀魂规则存在性确认后
    才纳入；不存在即出 scope）。
- **降级条款冻结（事前固定，执行中不得改）**：适用单元 = `resp_pass_on_kakan`、
  国士抢暗杠（若存在）、`resp_pass_on_discard` 的 hora 候选族。阈值
  **N = 10,000 场**；计数单位 = **本地 mapper 接受且 canonical 重放成功的
  四人南风标准规则局**（本地重放 fail-closed 的局不计入）；口径 = **两来源
  合计**（雀魂自有对局 + 天凤归档），discovery manifest 按 source 分别记录
  计数供审计；计数只含 A4 纯事件 discovery 扫描实际扫过并完成重放的局（语料
  可继续扩档，零 Mortal 成本，承 ADR-0002 万场级 discovery 先例与 A3 已建
  2,438 局天凤归档）。扫描满 N 场仍未命中的单元保持 fail-closed、记入
  ROADMAP 与 evidence manifest，A4 允许收口。
- **discovery**：chankan 纯事件扫描（零 Mortal 成本）最早启动、优先于其他
  分支工作——它是 wave-1 唯一无降级兜底的分支。
- **CLOSE 定义**：① wave-1 矩阵无空格（六分支各 ≥1 真实 E2E，且
  `resp_pass_on_discard` 四候选族各有证据——hora 族可经降级条款收口）；
  ② 降级适用单元带事前冻结条款（N = 10,000 场及上述计数口径）；③ H2 重跑
  中现有 12 个 `no_mortal_entry` 逐个证明候选数 = 1 并重分类为
  `source_row_not_expected`，`no_mortal_entry` 计数为 0，不允许剩余无法
  解释的无行。
- **涉及模块**：mortal-source（投影层——拆过滤、视角事实）、contracts
  （outcome 第七值、候选契约的响应面扩展；响应窗口身份已存在于既有
  discard_response / kan_response 契约，A4 扩展填充而非另立）、reasoning
  （绑定层拆二次过滤、响应开窗、身份事实表、守恒门）、共享验收核心与双
  平台验收脚本（分支矩阵与候选族证据、H2 复跑、discovery 纯事件扫描含
  N 计数与 chankan 最早启动）。

## Testing Decisions

- **好测试只测外部行为**：给定 pinned 报告 fixture → 投影输出包含响应 entry；
  给定 canonical 流 + 报告 → 逐决策绑定 outcome 与守恒结果；给定真实语料对 →
  分支矩阵证据。不测内部函数、不测实现细节。
- **Seam（全部现有，不新增）**：
  - 最高 seam = **共享验收核心 E2E**（双平台入口驱动）：A4.3 的发布门，
    同时承载 H2 连续性复跑模式。理想状态是发布判断只依赖这一个 seam。
  - 失败定位层（vitest，非发布门）：pinned 报告 fixture 的投影输出；
    逐决策绑定 outcome；replay 响应开窗（共享 streamContext）。
- **Prior art**：A3 的 10 分支 fail-closed coverage gate 与 §16 evidence
  manifest lift；H2 连续性复跑（125 窗口 / 113 绑定 / 0 歧义）；RED/GREEN
  fixture 纪律（未覆盖形态先补脱敏 fixture 再放宽实现）；验收模式注入全分支
  registry 作证据生产者、生产消费者只能经 manifest lift；天凤归档 discovery
  扫描（A3 已建 2,438 局归档语料，ADR-0002 万场级扫描先例）。
- **守恒门测试**（双向硬规则，来自枚举同构决策）：本地枚举 ≥2 无源行 → 失败；
  源行出现本地未预期 → 失败。
- **回归门**：H2 复跑自摸面绑定不回归，新账本预期 = 113 bound + 12 个
  `source_row_not_expected`（各附 candidate count = 1 证据），`no_mortal_entry`
  计数为 0（A4.0 的独立验收条件）。
- **降级条款可测**："扫描满 N = 10,000 场未见即降级"是纯事件扫描行为，可用
  discovery runner 直接验证（含计数口径：只计重放成功的合格局、按 source
  分记的 manifest）。
- **危险操作纪律**：已 accepted 的 A3 终局 pair 不得为已 lift 分支重置重跑
  （accepted → failed 丢证据风险）；重推导需手动备份 checkpoint + artifact
  后重置。

## Out of Scope

- M6-C StructuredAnalysisPackage 固化、M6-D 解释引擎与 LLM 任何内容、
  M7 任何 UI/持久化——A4 只到"响应面绑定与分析就绪"。
- M6-B Akagi。
- wave-2 分支的真实语料验收（本里程碑只到 fail-closed + 降级条款 + 纯事件
  扫描）。
- Mortal 报告获取流程改动（operator-assisted 浏览器提交、Turnstile 无 API
  等既定事实不动）。
- 产品级持久化、缓存策略（M7-B）。
- 解释层/教练判断层任何语义（ADR-0003 已冻结，不在本里程碑实现）。

## Further Notes

- **Review round 1 冻结记录（2026-08-18）**：grill 决策留白的三点本轮落冻——
  降级阈值 N（10,000 场 + 合格局计数 + 两来源合计口径）、outcome 第七值
  `source_row_not_expected`（"按需增加"删除，A4.0 即需要）、开窗权威分离
  （Mortal 标记仅源侧绑定锚点，不得驱动本地开窗）；另增 `resp_pass_on_discard`
  候选族子覆盖（hora 族降级适用）与 response identity 对齐既有 contract
  词汇。历史 handoff 原文不动，以本 spec 为准。
- **开放风险 1**：`resp_chankan_actual` 留在 wave-1 且无降级兜底（与 wave-2
  的 `resp_pass_on_kakan` 共享"加杠撞待牌"这一数百局一遇前提）。缓解：
  discovery 把 chankan 纯事件扫描最早启动、优先于其他分支。
- **开放风险 2**：国士抢暗杠在雀魂的规则存在性未确认；确认前按"规则不存在
  即出 scope"处理。
- 真实报告序列化坑已全部实证钉死（hora 行赢牌在 entry 侧字段、加杠序列化为
  四张 ankan 形态、九种九牌为裸 ryukyoku、报告 URL 必须规范形式），见项目
  状态 handoff；A4 绑定实现直接复用这些结论，勿重新调查。
- 证据政策沿用 ADR-0002 与 2026-08-16 source-policy 修正：雀魂首选 + 天凤
  补充，Mortal 报告内嵌数据永不充当本地侧。
- 术语一律以 `coach/CONTEXT.md` 词汇表为准（他家舍牌响应窗口、他家杠响应
  窗口、决策归属、触发者、过、源行门槛）；与既有 ADR 矛盾处显式指出，不
  静默覆盖。
