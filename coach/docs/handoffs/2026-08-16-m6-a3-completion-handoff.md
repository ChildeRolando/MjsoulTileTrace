# M6-A3：行动支持扩展与真实语料 — 最终收口交接

> **历史标记（2026-08-16 source-policy correction）**：本页"下一步：用户从自己的
> 天凤对局历史取回 log URL"的收口路径已被**来源政策修正**取代——验收不变量是
> 真实 + 独立本地权威 + 全 E2E，不是"仅天凤"；雀魂官方原始牌谱为**首选**验收
> 来源（`scripts/majsoul-acceptance.mjs`，H2 样本即雀魂来源），天凤降级为补充
> （仅对仍缺分支使用；用户天凤牌谱只在某分支确实无其他来源时才需要）。本文的
> 结构性事实（Turnstile 门禁、钉死语料无归档 id、西局 kyuushu 缺口）仍然成立。
> 权威表述见 `2026-08-16-m6-a3-source-policy-correction-report.md` 与 ROADMAP §2。

日期：2026-08-16（final closing round）
分支：`codex/m6-a3-completion`
base SHA：`0c18a1d9db47a101bde71ecf3d890070bd828210`（规划线 A3 文档与执行线 A3 实现的合并点）
本轮起始 SHA：`eedffe55e5aaf633bb16d8de4c5c3eaf2aa20096`（上轮 docs 收口提交）
final code SHA：`66dc6e1`
final docs SHA：本文档所在 docs 提交（见 completion report）

完成线提交（base 之上）：

| SHA | 内容 |
|---|---|
| `c5947d8` | riichi 比较保留 declare_riichi 与 riichi_discard 两个独立身份 |
| `ef5f913` | §9 post_call 身份以源 fuuros ↔ 本地 melds 闭合 |
| `e4d0ce0` | §10 post_riichi 语义时刻实证钉死（outcome A） |
| `fd9a78f` | §21 优先级重排 + §20/§21/§22 绑定完整性回归 |
| `c07f846` | §12–§15 tenhou-source importer + 语料 runner |
| `180c98a` | §16 coverage evidence manifest（fail-closed lift 路径） |
| `f495dc3` | 真实 Mortal hora 形态贯穿 checker + importer |
| `eedffe5` | docs：上轮收口（本文档前一版本 + ROADMAP 同步） |
| `74ce281` | §21 收口：本地支持与源候选面支持判定拆分 |
| `2102075` | legacy ComparisonSet 转换如实报告其真实作用域 |
| `c73f298` | 发现层：具体分支候选 + §7 dama_tsumo 私有扫描 |
| `5698687` | live 验收 runner：全 E2E 责任主体 + §5 断点状态机 + 证据抽取 |
| `7869617` | 修复：发现层 dama 扫描消费正确 replay 返回形态 |
| `66dc6e1` | 修复：验收计划终态失败不烧预算；Stage 3 推进脱队 pending 对 |

## 1. 里程碑契约变化（最终语义）

1. `ActionDraftSchema`/`UserActionDraftSchema` 新增 `declare_riichi`：tile-less、**仅模型侧可产生**；实际侧永不合法（§8 强制，测试钉死）。
2. riichi 语义（ADR-0001）：模型表示 = tile-less `declare_riichi`；实际表示 = `riichi_discard`（本地权威牌 + discardMode）；对应关系 = 显式类型化 `correspondences`（`relation: "realizes"`）；模型分数载体 = declare_riichi 候选本身；actionRef 相等性永不编码该关系；无 declare_riichi 行 = 立直实际未被模型评分（`actual_action_not_scored`）。
3. 决策面新增 `post_call_discard`（副露后切牌）与 `post_riichi_discard`（立直宣言后切牌）。
4. 终局 actual 类型化：`tsumo`/`ankan`/`kakan`/`kyuushu_kyuuhai`（§11 审计）。
5. `SourceAdapterContextSchema` 新增 `currentDrawTile?`：ADR-0001 本地牌权威延伸到自摸——真实 Mortal hora 行不带 `pai`，自摸和牌牌张 = 本地摸牌事实，绝不被发明为模型起源数据。
6. mjai importer：hora/agari 必需字段 = `[actor, target]`（真实报告实证）；自摸窗口无 `pai` 时用 `context.currentDrawTile`；响应面（M6-A4）仍要求 `pai`。
7. 绑定交叉检查 `mortalActualMatchesLocal` tsumo 分支：验证 type/actor/target + `sourceWinningTile = actual.pai ?? sourceEntryTile`；两处皆无牌则 fail-closed。
8. `CanonicalSourceKindSchema` 新增 `"tenhou"`：第二生产 canonical importer（严格 fail-closed）。
9. §16：`MortalCoverageEvidenceManifest`（`mortal-coverage-evidence-manifest/v1`）+ `createMortalCoverageRegistryFromManifest`（唯一合法 lift 路径）。生产默认仍是 `EMPTY_MORTAL_COVERAGE_REGISTRY`。
10. **本轮** §21 拆分：绑定行的本地实际表示支持（`support`）与源候选面支持（候选 action 类型可理解）为两级独立判定；源候选面失败给出独立 reason，不再伪装成本地支持失败。
11. **本轮** legacy ComparisonSet 转换：如实报告其真实作用域（哪些比较被转换、哪些被拒绝），不再隐式扩大。
12. **本轮** §5 断点状态机（`mortal-acceptance-checkpoint/v1`）：每 (game, seat) 对走 `local_ready → mortal_submission_pending → mortal_submitted → report_pending → report_ready → review_complete → accepted`，任一非终态可 `fail`（终态 `failed` 带不透明原因码），`retry` 仅自 `failed` 回 `local_ready`；`accepted` 终态且必须携带 evidenceHash/evidenceVersion（fail-closed 校验拒绝不可能记录）。秘密与定位符永不入 checkpoint（§15）。
13. **本轮** 验收证据抽取（`mortal-acceptance-artifact/v1`）：只有 `analysis_ready` 行（完整走完 StructuredComparisonSet→ModelEvaluation→装配链）可提升分支；用同一导出分类器 + 绑定计划源行重推导，无第二意见。脱敏 artifact 只含 allowlist 字段（版本、不透明 gameId/seat、模型摘要、分支、analysisReady 行摘要）。

## 2. post_riichi 语义证明（§10，outcome A）

（不变，见上一版）钉死样本 = 已接受的 A2/H2 真实样本；canonical 事件序 `tsumo → riichi_declared → dahai(宣言牌) → riichi_accepted`；选定触发 = canonical `riichi_declared`，本地立直状态 `declared`；spec 措辞已修正（证据注 `docs/specs/2026-08-16-m6-a3-post-riichi-semantic-moment-evidence.md`）。

## 3. H2 连续性复跑（§13，最终账本 — 本轮代码后复测）

样本与 A2 完全相同（majsoul record、selfActor 1；报告经注入 fetch 走完整生产解析路径，零网络，缓存复用 1 份）。

- `replayDecisionCount = 125`（self_turn 120 / post_riichi_discard 4 / post_call_discard 1；实测）
- Mortal self entries = `113`

| 量 | 值 |
|---|---|
| analysis_ready | 99 |
| unsupported_action | 14（全部 `coverage_branch_uncovered`，空注册表 fail-closed 设计） |
| no_mortal_entry | 12 |
| binding_mismatch | 0 |
| model_output_incomplete | 0 |
| analysis_blocked | 0 |
| bound / unbound / ambiguous | 113 / 0 / 0 |

- 守恒：outcome 总和 125 = replayDecisionCount ✓；bound+unbound+ambiguous 113 = 源 entry 数 ✓。
- §13 期望逐项命中：local=125（基线）、source=113、bound=113、unbound=0、ambiguous=0、binding_mismatch=0；no_mortal_entry 12（允许保留）。
- coverage encounters（绑定行）：riichi_window 4 / post_riichi 2 / post_call_pon 1 / self_turn_ankan 1 / self_turn_tsumo_actual 1 / dama_with_riichi_candidate 5 —— 全部被空注册表拦截（=14）。
- **与上轮账本逐字段一致**：本轮 5 个代码提交（§21 拆分、ComparisonSet 作用域、发现层、验收 runner、返回形态修复）对 H2 样本零回归。
- Mortal 报告：新建提交 0；缓存复用 1。

## 4. §4 传输能力钉死（STOP 条款的最终裁定）

对 mjai.ekyu.moe 的取证结论（本轮实地复核）：

- 提交 = 原生表单 `POST /review`，字段 `input-method ∈ {log-url, riichi-city-log-id, hime-mahjong-log-id, tenhou6}` + `player-id`/`engine`/`mortal-model-tag`/`ui`/`lang`/`kyokus`/`temperature`/`show-rating`。
- 该表单由 Cloudflare Turnstile 保护（sitekey `0x4AAAAAAAAnc33mIX4aonHH`；回调 `setReviewSubmitEnabled`/`setBotSubmitEnabled` 重新启用禁用的提交按钮）。
- `/slots` 是唯一开放 JSON 端点；**无 API、无原始牌谱上传通道**。
- 自动化提交 = 击败 bot 保护 → 不安全 → 不做。

裁定：**缺失的传输能力 = 一个机器对机器的提交 API（或 Turnstile 豁免端点）；它公开不存在。** 因此验收 runner 实现 operator-assisted 传输：操作者把 `<gameId>#<seat>.url`（真实可取回的天凤 log URL）放入 `<state-dir>/inbox/`，runner 确认后继续 poll→fetch→E2E。**没有任何东西伪造 acceptance**：只有真实取回的报告通过完整 E2E 后才写 `accepted`。本窗口 live Mortal 请求 = 0。

**结构性更正（修正上轮表述）**：钉死语料（dnovikoff/tenhou test_data，14 份 mjloggm XML）**内嵌无 Tenhou 归档 log id**（`<GO type>`/`<UN>`/`<SHUFFLE>` seed 均非归档 id），无法构造 tenhou.net 取回 URL —— 该语料可做本地发现，**永远不能做验收提交**。真实验收需要用户提供自己牌局的可达 log URL（tenhou.net/0/?log=… 或 tenhou6 JSON log）。上轮"live 提交数为 0（推迟）"的表述在此更正为"该语料 live 提交不可能；需换作用户自有可达牌局"。

## 5. 验收 runner 架构（§2/§4/§5/§10，commit `5698687`）

- **验收 runner 拥有全 E2E**：本地（raw→mapper→validate→replay）+ 模型（inbox 确认→poll→fetchMortalReport）+ E2E（validateMortalReportBinding→runMortalFullGameReview→accepted-branch 证据→脱敏 artifact→evidence hash）。全部走生产原语，无第二解析器、无旁路。
- §4 安全：串行、并发 1、≥10s 基础延迟 + 种子抖动、每状态转移写 0600 断点、game+seat 去重、缓存成功报告、缓存成功永不重提、硬预算 `--max-requests`（2–3）。**终态失败（`local_*` 确定性失败）不消耗提交预算**（`66dc6e1`：此前一轮实证发现计划把 submit 槽分配给了 runner 拒绝执行的重试，活对被饿死）；Stage 3 推进**任何**活对（含脱队于本轮 selection 的早轮 pending 对，不再被孤儿化）；操作者 worklist 从断点重建 = 当前全部 `mortal_submission_pending` 对。
- 缓存命中快速推进：断点 ≥ `mortal_submission_pending` 的对在计划中记为 succeeded，不消耗新预算；`local_*` 永久失败的对不重试。
- poll 耗尽 = 停在 `report_pending`（可恢复），不算失败。
- 验收模式注入 `createMortalCoverageRegistry(全 10 分支)` 作为证据**生产者**（否则空注册表会让 analysis_ready 永不可能出现——自举死锁）；生产消费者仍只能经 manifest lift。
- manifest 从 accepted 对的脱敏 artifact 重建；checkpoint 与缓存不一致 = fail-closed。
- smoke 实证（bug3）：选定 2 对推进到 `mortal_submission_pending`，预算 2/2，worklist 含内容 sha256；重跑幂等（0 新提交）；manifest 诚实为空。
- inbox 信任边界：URL↔pair 对应由操作者声明（runner 不访问 tenhou.net）；错误对应在 `validateMortalReportBinding` 的报告↔本地身份校验处 fail-closed，不会被静默接受。
- **本轮 Phase B 终态（final HEAD 实测，断点可恢复）**：selection 4 对 → 2 对 `local_replay_failed:known_facts_v2_unsupported_round_wind`（西局游戏，fail-closed 设计内）、2 对推进 `mortal_submission_pending`（e783c02c#0：dama_with_riichi_candidate/post_call_chi/post_call_pon/self_turn_tsumo_actual/self_turn_kakan；67d50373#2：self_turn_ankan）；连同早轮 smoke 的 8a152317#0/#2 共 **4 对 pending**，worklist 含内容 sha256；重跑幂等（newSubmissions=0）；manifest 诚实为空；**live Mortal 请求 0、报告抓取 0**。

## 6. 真实语料最终发现（§12–§15，全语料 14 份，本地 only）

- 语料：14 份钉死真实天凤 log（dnovikoff/tenhou test_data，repo 内 fixture；11 clean + 3 disconnect fail-closed）。外部扩展已评估：kobalab/Mahjong、mjr、neg 三仓库树 0 个 log 文件；mthrok 工具为按 id 下载器（无 id 来源）。**该 14 份 = 本地可得的全部语料。**
- 发现 runner：`scripts/tenhou-discovery.mjs`（公共结构 census + `--dama-tsumo` §7 私有扫描：逐 seat 映射→replay→手牌结构事实引擎）。逐 seat fail-closed 隔离（西局等不支持重放的 seat 跳过、计数，不中止语料）。
- **全语料结果（final HEAD 实测，commit `7869617`）**：公共 census 11 games / 44 seats（3 份 disconnect fixture 以 `tenhou_record_disconnect_unsupported` fail-closed）；dama_tsumo 私有扫描 40 seats replayed / 16 seat maps failed / **1896 个窗口全部经手牌结构引擎分类 / 0 引擎失败 / dama_with_tsumo_candidate = 0（诚实零，非跳过）**。

## 7. 10 分支覆盖矩阵（§17 最终状态）

接受的真实 E2E 命中（天凤入口→canonical→绑定→装配→脱敏输出全链）：**全部 10 分支 = 0**。

发现层候选（本地结构 census，全语料 11 games / 44 seats，非验收产物）：

| 分支 | 本地命中 | 备注 |
|---|---|---|
| riichi_window | 70 | |
| dama_with_riichi_candidate | 3788 | |
| post_call_chi | 122 | |
| post_call_pon | 144 | |
| post_riichi | 70 | |
| self_turn_tsumo_actual | 37 | |
| dama_with_tsumo_candidate | **0** | 引擎全分类后的诚实零（1896 窗口） |
| self_turn_ankan | 3 | |
| self_turn_kakan | 3 | |
| self_turn_kyuushu | **1** | 仅存于西局游戏（见 §8） |

policy 选定 4 对（selectionPairs），覆盖 9/10 分支的候选（除 dama_with_tsumo_candidate 语料为零）。

二级证据（H2 样本绑定行）：riichi_window 4 / post_riichi 2 / post_call_pon 1 / self_turn_ankan 1 / self_turn_tsumo_actual 1 / dama_with_riichi_candidate 5。

矩阵有缺口 → manifest 保持空 → 注册表保持空 → 所有非普通 self_turn 绑定行保持 `coverage_branch_uncovered`（=14）。

## 8. §11 kyuushu 审计

全语料（11 games / 44 seats 公共扫描 + 40-seat 引擎扫描）**self_turn_kyuushu 命中 = 1**（非零 → 不触发 §11 零命中 STOP 报告，也无需降级讨论）。

唯一候选：`tenhou-g:c39c8eace7825d48#2`（round ordinal 8）。该游戏含西局，本地 replay 以 `known_facts_v2_unsupported_round_wind` fail-closed（设计内）——其 4 个 seat 在 dama 扫描中全部跳过，验收 runner 的本地阶段同样将其 fail-closed（`local_replay_failed`）。**诚实结论：语料非零，但该候选当前不可本地验收**；分支保持 fail-closed，直到 (a) known_facts_v2 支持西局重放，或 (b) 出现仅东南局的 kyuushu 真实样本。两者都不在 A3 收口范围内擅自发明。

## 9. 隐私审计（§15）

- 产出仅含：聚合/计数、不透明内容哈希 gameId、seat、局序、窗口类型、语义分支、outcome/reason、脱敏模型摘要、证据哈希。
- 不含：raw reportId、result URL、raw paipu URL、天凤玩家名、account id、昵称、raw mjai_log、split_logs。
- 复跑结果 JSON、验收 checkpoint、缓存、artifact 以 0600 写入 job 私有目录；控制台仅聚合。
- checkpoint 状态机结构上拒绝秘密/定位符字段（accepted 必带 evidence、failed 必带原因码、seat 范围、外来 schema 拒绝——9 测试钉死）；脱敏 artifact allowlist 钉死无 reportId/playerId/gameFingerprint（3 测试钉死）。

## 10. 验证（§16，final code SHA `66dc6e1`）

- build：OK（contracts/mahjong-soul-source/tenhou-source/mortal-source/reasoning/desktop 全链）
- vitest：**1411/1411 通过（134 文件，最终 HEAD 单次干净全量）**（中途一轮全量首跑有 1 例 5s 超时 = 资产哈希测试与语料引擎 sidecar CPU 争用，隔离复跑 304ms 绿、CPU 空闲后全量复跑干净通过——如实记录）
- node --test scripts：34/34 通过（update-mahjong-soul-protocol 26 / mahjong-soul-protocol-compatibility 4 / generate-mahjong-soul-real-fixtures 4）
- typecheck：OK（6 包）
- GitHub CI：**No remote CI evidence.**（无 gh CLI；仓库无 .github/workflows）

## 11. 结论

**M6-A3 NOT CLOSED**（§18 诚实判定）：

1. 10 分支矩阵无任何接受的真实 E2E 命中——live 验收提交在本语料上**结构性不可能**（mjloggm 无归档 id，无法构造取回 URL），且提交通道本身 Turnstile 门禁、无 API。验收需要操作者提供自己牌局的可达天凤 log URL（inbox 流程已就绪，本轮 4 对推进到 `mortal_submission_pending` 等待）。
2. kyuushu：语料命中 1（非零，无 §11 STOP），但唯一候选在西局游戏、本地 replay fail-closed——分支保持关闭，不降级、不发明。
3. lift 不发生、unsupported=14 是正确状态；不为清零弱化门禁。

已交付且可复查：行动支持扩展客户端语义全部落地并被真实 H2 样本复跑证实无损（125/113 全绑定、0 歧义、§13 逐项命中、5 提交零回归）；§21 两级支持判定 + ComparisonSet 作用域如实化；发现层全语料 concrete 候选 + dama_tsumo 私有扫描；验收 runner = 全 E2E 责任主体 + §5 断点状态机 + §10/§15 证据链；§16 manifest lift 路径就绪。

## 12. 2026-08-17 补证终局（final truth，代码 HEAD `35dde0a`）

§11 结论的三个阻塞项当天全部部分解除：真实语料扩至 2438 局天凤归档（`tenhou-corpus/`，3003 XML）+ 用户自有雀魂对局，live 报告经 operator-assisted inbox 流程真实取回验收。§7 矩阵当前状态：

**8/10 分支已有接受的真实 E2E 命中**（manifest 有证据哈希）：
riichi_window、dama_with_riichi_candidate、post_call_chi、post_call_pon、post_riichi、self_turn_tsumo_actual、self_turn_ankan、self_turn_kakan。
来源：雀魂 H2 样本 seat1（6 分支）+ seat3 复跑（7 分支，含 kakan）；天凤 `02720fd2#0`（5 分支）+ `f7138da5#0`。

**两个根因修复（当天实证，勿重查）：**
1. **指纹 v3**（`ee3e3c6`）：v2 把供托分差语义差异当身份差异——canonical 胜和分差是回合折叠零和，mjai hora deltas 把供托归集赢家，凡带供托的胜和局 v2 必挂。v3 胜和事件只绑 (winner,target)，分数由下一 round_start 绑定。修复后天凤两盘本地↔真实报告事件级全等、全 ACCEPTED。
2. **加杠桥接**（`35dde0a`）：ekyu 评分分布把加杠候选序列化成 `ankan(四张)`（副露3+摸1合并），actual 是 `kakan` 形状 → 行死于 ankan_tiles_missing + actual_action_not_scored 双重。三层修复：杠可用集计入副露（multiset 仍 fail-closed）、kakan actual realizes 同牌 ankan 行（ADR-0001 declares 模式同构）、contracts correspondence 放行第二对粒度。seat3 复跑 ACCEPTED，模型杠分 p=0.25 正确挂到 ankan 承载行。

**余 2 分支：**
- `self_turn_kyuushu`：候选 `tenhou-g:8ffcebe9788bdaee#3`（纯东南局、本地映射通过）在 operator worklist 等人工提交（Turnstile）；inbox 就绪。
- `dama_with_tsumo_candidate`：4 个不相交 worker 后台扫剩余语料（前 ~280 局/31k 窗口 0 命中）；0 命中到底 → §11 STOP 报告，降级条款需用户明确批准，不擅自发明。

**8-17 验证全量绿**：vitest 1430/1430（136 文件）、node --test 34/34、typecheck 6 包、build 全链。

**§9 隐私不变**：终产物仍只含不透明哈希/座位/序号/分支/证据哈希；雀魂报告 ID（09d54c…）与 URL 只存在于 0600 私有 state 目录，不入 repo。

下一步（A3 收口，M6-A4 之前）：用户从自己的天凤对局历史取回 log URL → 放入 inbox → 重跑 `scripts/tenhou-acceptance.mjs`（断点续跑，缓存/预算/去重自动生效）→ 补满矩阵 → 生成 §16 manifest → 派生 lift → 届时才可宣布 M6-A3 CLOSED。

## 13. 2026-08-17 kyuushu 收口（final truth，代码 HEAD `588c8cc`）

用户 operator-assisted 提交 `8ffcebe9788bdaee#3`（seat 3）后 run7 ACCEPTED 但 `self_turn_kyuushu` 未 lift——第三个真实序列化根因：

**根因**：ekyu 把九九候选**和**九九 actual 都序列化成裸 `{"type":"ryukyoku"}`（无 actor、无 reason、deltas 全零）。而代码两处假设 actor+reason 必在：`mortalActualMatchesLocal` kyuushu 分支（死因 `mortal_actual_mismatch`）与 adapter（`requiredFields("ryukyoku")=["actor","reason"]` + 全局 actor 门 → 模型行死 incomplete）。诊断路径与 kakan 相同：artifact outcomes（binding_mismatch=1、round 0 零 ready 行）→ 复现脚本对比两侧身份事实 → 绑定其实是 `bound`（14 张手牌+摸牌全等），死因在绑定之后的 actual 交叉检查。

**修复**（fail-closed 边界收缩，不放宽语义）：裸形状仅在 `self_turn` 窗口被承认为九九（鸣牌后/他家回合的流局不是玩家选择，仍 unsupported）；携带的 actor/reason 若存在必须一致；显式非零 deltas 与流局矛盾即拒。两侧归一到同一 canonical `kyuushu_kyuuhai` 身份 → actual 经 builder 合并进被评分的模型行（origins `["model","actual"]`），**无需** realizes 对应（与 riichi/kakan 不同，这次是精确匹配）。

**验证**：mjai-action/structured-mortal 新增 5 测试（含 3 fail-closed：裸形状他家回合拒、有 actor 无 reason 拒、非九九 reason 拒、未评分拒）；reasoning 全量 530/530 绿、typecheck 6 包绿。checkpoint 该 pair 手动重置 `mortal_submission_pending`（缓存保留，reportFetches=0 复用真实报告）→ 复跑 **ACCEPTED，`self_turn_kyuushu` lift**，矩阵 **9/10**。manifest 该分支 1 条真实证据（哈希 b4fc3e4f…）。

**仅余 1 分支**：`dama_with_tsumo_candidate`——4 worker 后台扫描中（互不相交段 [281,3000)，断点 json `m6a3-dama-w{1..4}.json`）；有候选→inbox 验收；全扫 0 命中→§11 STOP 报告+降级需用户批准。

## 14. 2026-08-17 dama_with_tsumo 收口（final truth，代码 HEAD `f2869b4`）

**先修根因再扫全量**：旧 4-worker 扫描 ~13.5min/局（10 分钟跑不完第一局）。profile 定位不是引擎，而是 `replayCanonicalStream` 复杂度——每个决策窗口经公开 `freezeDecisionSnapshot` 全量重新 parse+reduce 整条流，`projectKnownGameFactsV2` 再冻结一遍做验证（每 seat ~270 次全量 reduce，O(窗口×事件²)，热点 hashJson 26% + structuredClone 23% + zod 12%）。修复（`f2869b4`）：

- `decision-snapshot` 拆出 `freezeDecisionStreamContext`（parse+reduce 一次、eventRef 索引）与 `freezeDecisionSnapshotInContext`；公开 API = context+core，行为不变。
- `stream-replayer` 每 replay 惰性共享一个 context（惰性：零窗口流仍从不校验，保持旧语义；有窗口流本来就会全量校验）。
- `known-game-facts-v2` 可选 `streamContext`：验证冻结共享 reduction——reduce 是纯函数且确定性被 canonical-replay-invariance 钉死，共享=记忆化；快照仍重新冻结（窗口断言+schema parse）并深比较 cachedSnapshot。
- 前置 `win-shape.ts` 完成形预筛（(hand−X)+X=持牌本身，无和牌形⇒引擎问题必为否）；permissive 跨标准/七对/国士，引擎仍是唯一提升权威。

**A/B 验证**：真实语料局 4 seat 输出 JSON 逐字节一致（sha256 相等），172s/seat → 0.9s/seat（192×）；vitest 544/544。

**全量终局（6 worker × [0,500)…[2500,3000)，3100 局段并集覆盖全部 3000 局）**：9812 seat replay 成功 / 2588 mapper not-ready（语料固有覆盖率，抽样确认 replay 失败为 0）；dama 窗口 555,403 个全部结构预筛，仅 4 个进引擎（假阳性 ~1/14 万），**3 个候选获引擎提升**（overallShanten=0 且弃牌在待牌中），引擎 0 失败。发生率 ≈ 5.4/百万窗口（~1/1000 局）。§11 STOP 不触发——语料命中非零。

**3 候选（全部已过验收 LOCAL 段，`mortal_submission_pending`）**：
| gameId（不透明） | seat | decisionEventRef | tenhou log id（私有，仅 operator 用） |
|---|---|---|---|
| tenhou-g:1733834247a789b2 | 2 | …/10/1019/0 | 2026080918gm-00a9-0000-91dc6a72 |
| tenhou-g:d91fdd402a94dc48 | 0 | …/2/335/0 | 2026081204gm-00a9-0000-9d71c14c |
| tenhou-g:f91cc7d8e3d63004 | 0 | …/8/868/0 | 2026081407gm-00a9-0000-abc87788 |

第 2 候选单局重扫逐字段复现（确定性）。discovery 报告 `m6a3-discovery-dama-final.json`、state 目录 `m6a3-tenhou-acceptance-state/`（checkpoint 已备份 `.bak-dama`，另有本 job tmp 全量备份）。

**收口最后一步（operator，与 9/10 相同流程）**：任选 ≥1 对在 https://mjai.ekyu.moe/ 提交（engine Mortal，Turnstile 须人工）→ 报告 URL 存 `<state-dir>/inbox/<gameId>#<seat>.url` → 重跑
`node scripts/tenhou-acceptance.mjs <对应 raw xml> --discovery m6a3-discovery-dama-final.json --state-dir m6a3-tenhou-acceptance-state`
→ ACCEPTED 后 `dama_with_tsumo_candidate` lift，矩阵 **10/10**，重生成 §16 manifest（复用缓存报告，0 新请求也成立）。

## 15. 2026-08-17 矩阵 10/10 — M6-A3 真实语料验收 CLOSED

Operator（用户）提交 3 份报告 URL，**2 对全链路 ACCEPTED**（run：reportFetches=2，exit 0）：

| pair | 命中分支 | 证据哈希 |
|---|---|---|
| tenhou-g:d91fdd402a94dc48#0 | riichi_window, dama_with_riichi_candidate, post_call_chi, post_call_pon, post_riichi, self_turn_tsumo_actual, **dama_with_tsumo_candidate** | sha256:ce2a2a5267d5… |
| tenhou-g:f91cc7d8e3d63004#0 | riichi_window, dama_with_riichi_candidate, post_call_chi, post_call_pon, post_riichi, **dama_with_tsumo_candidate** | sha256:e93649c0ca2d… |

`dama_with_tsumo_candidate` 获 **2 个独立真实 E2E 样本**（>要求的 ≥1）。

**报告↔pair 预匹配方法（inbox 投放前，防 fail-closed 污染状态）**：报告 JSON 无玩家名，用终局分指纹——四家终局分向量（报告帧 reviewed seat→0，XML 帧 rotate 对齐）+ 局数。两处坑钉死：
1. mjai-reviewer 游戏结束把**未回收立直棒退回宜言者**（每根 +1000），天凤 `owari` 不退 → 报告终局分可比 XML 多出 N×1000（sum>100000）。这是站点记账差异，非 mapper 缺陷；按差值模式对齐即可（f91cc7d8 对恰差 3 根，9 局数 9=9 吻合）。
2. 报告 `relative_scores`/end_status deltas 行含立直供托进出，**非逐行零和**——手工累加终局分必须走"最后局 rs + 末 deltas"并以供托差异容差核对。

**第 3 对（1733834247a789b2#2）按用户指示放弃**：operator 的报告仅存 `/report/<id>.html` 渲染页，规范 `.json` 数据 URL 持续 404（多次重试）；HTML 无内嵌原始 JSON，从渲染 DOM 重建报告字节=伪造证据（政策禁止）。该对停留 `mortal_submission_pending`（无害——矩阵已满，operator worklist 仅剩它）。

**合并矩阵（majsoul + tenhou 两 state 目录 §16 manifest 并集，2026-08-17）**：

| 分支 | accepted 样本数 | | 分支 | accepted 样本数 |
|---|---|---|---|---|
| riichi_window | 7 | | post_riichi | 5 |
| dama_with_riichi_candidate | 5 | | self_turn_ankan | 2 |
| **dama_with_tsumo_candidate** | **2** | | self_turn_kakan | 1 |
| post_call_chi | 5 | | self_turn_kyuushu | 1 |
| post_call_pon | 6 | | self_turn_tsumo_actual | 2 |

**10/10，每分支 ≥1 独立真实 E2E 命中**（来源=雀魂官方原始牌谱 + 天凤权威原始牌谱，均为获批独立本地来源）。A3 真实语料验收目标达成；下一步 = M6-A4 响应面（discard_response/kan_response）。
