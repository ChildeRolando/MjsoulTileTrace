# M6-A3：行动支持扩展与真实语料 — 完成线交接

日期：2026-08-16
分支：`codex/m6-a3-completion`
base SHA：`0c18a1d9db47a101bde71ecf3d890070bd828210`（规划线 A3 文档与执行线 A3 实现的合并点）
final implementation SHA：`f495dc35184b6730ba0cb389951f89c42d5f18db`
final docs SHA：本文档与 ROADMAP 同步的 docs 提交（纯文档，无代码差；SHA 见 completion report）

完成线提交（base 之上共 7 个）：

| SHA | 内容 |
|---|---|
| `c5947d8` | riichi 比较保留 declare_riichi 与 riichi_discard 两个独立身份 |
| `ef5f913` | §9 post_call 身份以源 fuuros ↔ 本地 melds 闭合 |
| `e4d0ce0` | §10 post_riichi 语义时刻实证钉死（outcome A） |
| `fd9a78f` | §21 优先级重排 + §20/§21/§22 绑定完整性回归 |
| `c07f846` | §12–§15 tenhou-source importer + 语料 runner |
| `180c98a` | §16 coverage evidence manifest（fail-closed lift 路径） |
| `f495dc3` | 真实 Mortal hora 形态贯穿 checker + importer |

## 1. 里程碑契约变化（最终语义）

1. `ActionDraftSchema`/`UserActionDraftSchema` 新增 `declare_riichi`：tile-less、**仅模型侧可产生**；实际侧永不合法（§8 强制，测试钉死）。
2. riichi 语义（ADR-0001）：模型表示 = tile-less `declare_riichi`；实际表示 = `riichi_discard`（本地权威牌 + discardMode）；对应关系 = 显式类型化 `correspondences`（`relation: "realizes"`）；模型分数载体 = declare_riichi 候选本身；actionRef 相等性永不编码该关系；无 declare_riichi 行 = 立直实际未被模型评分（`actual_action_not_scored`）。
3. 决策面新增 `post_call_discard`（副露后切牌）与 `post_riichi_discard`（立直宣言后切牌）。
4. 终局 actual 类型化：`tsumo`/`ankan`/`kakan`/`kyuushu_kyuuhai`（§11 审计）。
5. `SourceAdapterContextSchema` 新增 `currentDrawTile?`：ADR-0001 本地牌权威延伸到自摸——真实 Mortal hora 行不带 `pai`，自摸和牌牌张 = 本地摸牌事实，绝不被发明为模型起源数据。
6. mjai importer：hora/agari 必需字段 = `[actor, target]`（真实报告实证：candidate `{hora,actor,target}`，actual 另带 `deltas`/`ura_markers`，均无 `pai`）；自摸窗口无 `pai` 时用 `context.currentDrawTile`；响应面（M6-A4）仍要求 `pai`。
7. 绑定交叉检查 `mortalActualMatchesLocal` tsumo 分支：验证 type/actor/target + `sourceWinningTile = actual.pai ?? sourceEntryTile`（entry.tile 已被身份表钉死到本地摸牌）；两处皆无牌则 fail-closed。
8. `CanonicalSourceKindSchema` 新增 `"tenhou"`：第二生产 canonical importer（严格 fail-closed，独立于 Mortal/mjai_log）。
9. §16：`MortalCoverageEvidenceManifest`（`mortal-coverage-evidence-manifest/v1`，隐私严格 schema）+ `createMortalCoverageRegistryFromManifest`（唯一合法 lift 路径：schema 校验 + `acceptedRealSampleCount == evidence.length`，只覆盖 count≥1 的分支）。生产默认仍是 `EMPTY_MORTAL_COVERAGE_REGISTRY`；**永不**手写全分支注册表。

## 2. post_riichi 语义证明（§10，outcome A）

- 钉死样本：已接受的 A2/H2 真实样本（Mortal 报告 player=1、model 4.1b、113 self entries）。
- canonical 事件序：`tsumo → riichi_declared(reach) → dahai(宣言牌) → riichi_accepted`。
- Mortal 源序：`at_self_riichi=true` 的 `dahai` entry。
- 关键实证：受领严格晚于宣言切牌——同一巡后续 `pon` 证明宣言牌在受领前仍可被鸣。
- 选定触发：canonical `riichi_declared`，本地立直状态 `declared`。
- spec 措辞已修正：是（“立直受领后”→“宣言后/受领完成前”；证据注 `docs/specs/2026-08-16-m6-a3-post-riichi-semantic-moment-evidence.md`）。

## 3. H2 连续性复跑（§19，修复后最终账本）

样本与 A2 完全相同（record pb sha256 `44BDD035…DD18` = H2 交接钉；报告经注入 fetch 走完整生产解析路径，零网络）。

- `newLocalDecisionCount = 125`（self_turn 120 / post_riichi_discard 4 / post_call_discard 1；实测值，非硬编码）
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

- 守恒：`sum(local outcomes) = 125 = replayDecisionCount` ✓；`bound+unbound+ambiguous = 113 = 源 entry 数` ✓；`ambiguous = 0` ✓。
- A2 旧债（2×`post_riichi_discard_not_replayed` + 1×`post_call_discard_not_replayed`）消失：源行 22→local 22、45→local 47、101→local 107 全部恢复绑定。
- 与 A2 基线（120/113、bound 110、ready 99、unsupported 11、no_entry 10）的全部增量有解释：+5 决策 = 3 恢复行 + 2 个无源 entry 的新 post_riichi 窗口（no_entry 10→12）；unsupported 11→14 = 旧 11 项并入 coverage gate + 3 恢复行被 gate；ready 恒 99。
- coverage encounters（绑定行）：riichi_window 4 / post_riichi 2 / post_call_pon 1 / self_turn_ankan 1 / self_turn_tsumo_actual 1 / dama_with_riichi_candidate 5 —— 全部被空注册表拦截（=14）。
- Mortal 报告：新建提交 0；缓存复用 1。

## 4. 真实语料（§12–§15）

- 语料：14 份钉死真实天凤 log（dnovikiff/tenhou 测试数据，repo 内 fixture）；11 clean games 四座位 map+schema+validate 全通过，3 disconnect fixtures 钉 fail-closed 码。
- 发现（`scripts/tenhou-discovery.mjs`，最终 HEAD 实测）：2 games / 8 seats / 1 disconnect fail-closed。
- 本地结构命中：riichi_window 8 / dama_with_riichi_candidate 620 / post_call_chi 29 / post_call_pon 28 / post_riichi 8 / self_turn_tsumo_actual 6 / self_turn_kakan 1 / dama_with_tsumo_candidate 0（诚实零，`needsHandStructureEngine`）/ self_turn_ankan 0 / self_turn_kyuushu 0。
- 选定验收座位：2（selection 3 条，policy 去重 1 条重复 → plan submit 2 / skip_duplicate 1）。
- 验收执行：`--dry-run` 完成——本地管线对每个计划提交全执行（raw → mapper → canonical → validate → replay）：`tenhou-g:e783c02ca594715e#2` ok（1372 events / 168 decision windows）、`tenhou-g:8a15231707219e22#1` ok（638 events / 75 decision windows）；local stage 2 ok / 0 failed；Mortal stage skipped（transport 为注入 seam）。live 提交数为 0。

## 5. 10 分支覆盖矩阵（§17）

接受的真实 E2E 命中（天凤入口→canonical→绑定→装配→脱敏输出全链）：**全部 10 分支 = 0**。

二级证据（H2 样本在 A3 语义下的绑定行，非验收流产物）：riichi_window 4 / post_riichi 2 / post_call_pon 1 / self_turn_ankan 1 / self_turn_tsumo_actual 1 / dama_with_riichi_candidate 5。

矩阵有缺口 → manifest 保持空 → 注册表保持空 → 所有非普通 self_turn 绑定行保持 `coverage_branch_uncovered`。这是 §26 要求的诚实状态。

## 6. 剩余 fail-closed

- 全部 10 个语义分支（registry 空，等待接受的验收证据）。
- `dama_with_tsumo_candidate`：本地结构 census 亦为 0（需要手牌结构引擎），发现层即缺。
- `self_turn_kyuushu`：§18 降级条款（万局阈值 N）未作为显式接受的规范决定记录，不得擅自发明。

## 7. 隐私审计（§23）

- 产出仅含：聚合/计数、样本序号/哈希、局序、窗口类型、语义分支、outcome/reason、脱敏模型摘要、证据哈希。
- 不含：raw reportId、result URL、raw paipu URL、天凤玩家名、account id、昵称、raw mjai_log、split_logs。
- 复跑结果 JSON 与验收 checkpoint 以 0600 写入 job 私有目录；控制台仅聚合。
- §16 manifest schema 隐私严格（strict 拒绝未知字段，7/7 测试含隐私拒绝用例）。

## 8. 验证（§25，最终代码树 `f495dc3`）

- build：OK（contracts/mahjong-soul-source/tenhou-source/mortal-source/reasoning/desktop 全链）
- vitest：1385/1385 通过（131 文件）
- node --test scripts：37/37 通过（update-mahjong-soul-protocol / mahjong-soul-protocol-compatibility / generate-mahjong-soul-real-fixtures / update-packaged-fact-engine-manifest）
- typecheck：OK（6 包）
- GitHub CI：**No remote CI evidence.**（本机无 gh CLI，无法取证远端检查状态；不得称为 CI PASS）

## 9. 结论

**M6-A3 NOT CLOSED**（§26 诚实判定）：

1. 10 分支矩阵无任何接受的真实 E2E 命中——live 验收提交未执行（transport 为文档化 seam；A2 报告来自用户在环上传）。
2. kyuushu 降级条款（§18）未记录为显式接受的规范决定。
3. 因此 lift 不发生、unsupported=14 是正确状态；不为清零弱化门禁。

已交付且可复查：行动支持扩展客户端语义全部落地并被真实 H2 样本复跑证实无损（125/113 全绑定、0 歧义、A2 旧债清零）；A2 全局绑定保证在 A3 语义下存活（§20–§22 回归绿）；Tenhou 第二 importer + 发现/验收 runner 就绪；§16 manifest lift 路径就绪。

下一步（A3 收口，M6-A4 之前）：执行 `scripts/tenhou-acceptance.mjs` live 提交（组合 M6-A2 桌面 Mortal 管线，遵守预算/去重/断点/不重复提交），补满矩阵 → 生成 §16 manifest → 派生 lift → 届时才可宣布 M6-A3 CLOSED。
