# Riichi Coach strict reasoning core

> 当前面向开发人员的统一入口见 [`docs/development/README.md`](docs/development/README.md)。本文件保留推理核心的详细能力清单和原型说明；路线图、架构、开发流程与验收门禁以统一开发文档为准。

文档导航：

- [开发文档首页](docs/development/README.md)
- [当前路线图](docs/development/ROADMAP.md)
- [系统架构](docs/development/ARCHITECTURE.md)
- [规格档案](docs/specs/)
- [实施计划档案](docs/plans/)
- [交接档案](docs/handoffs/)

This workspace currently contains the evidence-grounded reasoning milestone for
the local LLM riichi coach.

Implemented:

- Mortal report facts normalized with `modelReason: "unknown"`;
- opponent concealed draws redacted at the import boundary;
- decision-boundary replay using only information visible to the player;
- standard, chiitoitsu, and kokushi shanten with family-specific effective tiles;
- per-riichi-player genbutsu and ippatsu evidence;
- a versioned five-axis coverage catalog and isomorphic candidate ledgers;
- bilateral factor accounts that preserve evidence for model and actual actions;
- a fail-closed PF-03 policy gate that cannot read model/actual labels;
- replay evidence registry, trusted recomputation, and structural validation;
- emitted JavaScript packages for ordinary Node/Electron imports;
- deterministic Chinese explanations for the East 1 turn 6 and 7 regressions.
- unified comparison-request, analysis-frame, candidate-reference, model-evaluation,
  and preference-set contracts;
- replayable Mortal probability and Akagi Native softmax selection scores with a
  frozen per-evaluation detail threshold;
- a fixed agreement truth table for model and coach preference sets;
- strict structured contracts for discard, riichi discard, chi, pon, three
  kans, tsumo, ron, nine-terminals abort, and pass;
- canonical action references, four decision windows, and explicit projection
  to the legacy comparison view;
- shared user/MJAI/typed-engine candidate normalization with structural-invalid,
  ambiguity, known-fact conflict, and missing-fact states;
- same-action origin merging, cross-window rejection, and an isolated
  discard-only legacy bridge;
- a managed Go JSONL fact-engine sidecar pinned to mahjong-helper commit
  `514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0`;
- structured candidate projection for discards and completed hands, with one
  request and state hash bound to each canonical action;
- deterministic shanten, effective tiles, live remaining tiles, dora count,
  completed-hand points, riichi state, ippatsu, and per-threat genbutsu facts;
- versioned helper estimates for yaku IDs, dama/riichi points, wait speed,
  win-rate/furiten heuristics, round points, suji, wall, one-chance, and related
  structural risk classes, always marked heuristic-only;
- isomorphic five-axis factor ledgers, same-version candidate differences, and
  a Pareto resolver that returns no overall preference when deterministic axes
  conflict or required coverage is missing;
- real East 1 turn 6/7 regressions proving that 2p/7p are efficiency choices
  while 6s/8p are per-threat genbutsu defense choices.
- a strict `canonical-riichi-events/v2` event stream covering draws, discards,
  riichi declaration/acceptance, calls, three kan forms, dora, wins, draws,
  score settlement, and round/game boundaries;
- immutable public round state separated from self-only private hand state,
  stable stream/prefix hashes, and `decision-snapshot/v2` decision freezes;
- event-sequence validation for actor/phase identity, call and kan references,
  physical tile counts, multiple ron, riichi/ippatsu flow, and terminal order;
- canonical event identities bound to game, round occurrence, source record,
  and sub-event position, with explicit legacy-to-canonical reference maps;
- projection from canonical snapshots into the existing `KnownGameFacts`
  pipeline, including melds, called discards, rivers, dora, winds, scores,
  riichi threats, evidence IDs, and field completeness;
- the East 1 turn 6/7 factor gate now consumes V2 decision snapshots while
  retaining the same packaged-sidecar golden calculations;
- strict `hand-structure/v2` facts for all three hand families, non-dominated
  structural decompositions, invariant/conditional shape claims, composite
  wait labels, and baseline ron eligibility;
- a deterministic 64-item cap for returned non-dominated decompositions; when
  the full set is larger, invariant claims remain exhaustive while conditional
  claims refer only to returned representatives and carry an explicit
  truncation limitation;
- separately evidenced discard, temporary, and riichi furiten, including
  response-window closure, atamahane, self-draw clearing, riichi persistence,
  and a candidate discard that creates its own furiten;
- one shared consumer-side validator for every fact-engine result kind, so a
  typed adapter cannot bypass request/action/state/threat/evidence binding or
  inject schema error prose;
- a packaged Windows sidecar and trusted manifest that include V2 analysis,
  plus real V2 golden outputs for both East 1 turn 6/7 candidates;
- a per-threat `defense-matrix/v1` for every discard candidate: one typed row
  per riichi/open threat with deterministic genbutsu safety bound to the exact
  supporting river event, plus request-bound structural cells (suji, wall,
  no/one-chance, early-outside, honor, versioned helper risk scale) that are
  heuristic-only and never enter deterministic preference.
- an M5-A privileged Mahjong Soul CN protocol foundation: renderer-safe DTOs,
  redacting secret wrappers, a source-locked and hash-verified protocol bundle,
  a narrow CN endpoint policy, bounded Liqi request/response correlation, and a
  six-field login-result projection that never exposes raw decoded payloads.
- an M5-B Electron session boundary: an isolated official CN login window,
  correlated login observation, OS-backed encrypted persistence across restarts,
  conservative restore/logout semantics, and a renderer/IPC surface that exposes
  only safe session status.

The per-threat defense matrix M2-C slice is complete for deterministic genbutsu
safety and structural riichi analysis. Deterministic safety is per-object: a tile
safe against one threat is never generalized to another, threat rows are never
aggregated into a synthetic total, and helper risk is a versioned heuristic scale
that is never presented as Mortal/Akagi deal-in probability. `user_marked_open`
threats keep a typed row but their structural risk remains explicitly unsupported
in V1. Exact public han/fu details, calibrated deal-in probability, placement EV,
option-value branch search, flush/hand-composition inference, and
discard-sequence behavioral inference remain explicit unsupported or
missing-data dimensions. Therefore the applied East 1 decisions correctly keep
`deterministicPreference: null` even though their efficiency-only and
defense-only preferences are available.

PF-03 is registered for audit but deliberately not activated in this milestone.
Activation requires scored-candidate normalization plus value, placement,
calibrated-risk, multi-threat, and option-value analyzers under separately
approved plans. The coach does not claim to enumerate every legal action.

Outside the completed M5-A/M5-B slices:

- recent-30 Mahjong Soul catalog synchronization, analyzable-entry filtering,
  production record download, and record-to-canonical-event mapping;
- production Mortal and Akagi Native report integration;
- production Akagi Native private-format parsing;
- complete legal-action enumeration and call-follow-up branch search;
- legal-action enumeration, call-follow-up branch search, and production
  remaining-draw/response-opportunity completeness;
- calibrated placement, option-value, opponent-hand, and statistical-risk analyzers;
- persistence, LLM dialogue orchestration, and the three-column UI.

## M5-A/M5-B 雀魂国区协议与本机会话

M5-A 建立了账号同步所需的协议受信边界；M5-B 已实现隔离 Electron 官方登录
窗口、相关登录帧捕获、操作系统安全后端包裹的本机加密令牌保险库、跨重启保守
恢复、注销清理，以及不暴露令牌或账号 ID 的 IPC/renderer 表面。自动化测试只用
假令牌与假账号；M5-B 真人登录冒烟仍需用户本人在官方页面完成。目前本机
Electron 43.3.0 可执行文件因官方下载未完成而尚未启动该冒烟。总规格 H1 是
M5-E 的登录→目录→下载→重放全链路人工验收，不在 M5-B 宣称完成。

M5-B 不同步近期目录，也不下载或转换完整牌谱。现有命令行教练仍是 fixture-only
回归原型，不能用作生产雀魂导入器。下一切片 M5-C 才会同步最近 30 场元数据，
并只向界面提供可分析的四人南风标准规则条目。

协议资源固定到雀魂国区客户端 `0.11.252.w`，并使用 Akagi commit
`27e994ad8bacd87833856b3b36b146ebb7cccbbc` 的 Apache-2.0 `liqi.proto`、
RPC map、LICENSE 与 NOTICE。manifest 同时绑定官方 schema、vendored proto、
RPC map、端点策略及必需路由/消息的三方兼容报告。运行时只接受生成的窄端点
策略：官方登录/静态站点、固定 route-2…6 网关与对应 WSS authority、固定旧
牌谱数据前缀；tracker、支付、聊天、广告和任意配置 URL 都不在信任面内。

更新与验证：

```powershell
node scripts/update-mahjong-soul-protocol.mjs
node scripts/update-mahjong-soul-protocol.mjs --check
node scripts/update-mahjong-soul-protocol.mjs --check-current
node --test scripts/mahjong-soul-protocol-compatibility.test.mjs
```

默认生成与 `--check` 只依赖已固定的版本化资源，因此可复现；
`--check-current` 才联网检查国区当前客户端版本是否仍等于固定版本。任何协议、
哈希、路由、字段或端点漂移都会以固定项目错误失败，不会猜测或退回宽松解析。

The structured path checks only contradictions supported by `KnownActionFacts`.
Missing facts remain `unknown_due_to_missing_facts`; they are not described as
illegal. “Whether to call” and “what to discard after calling” are separate
decision windows. When V2 fails for every comparable candidate, the pipeline
may use the older V1 efficiency facts only under explicit
`analysisMode: "legacy_v1_fallback"`; mixed V1/V2 availability never produces a
preference. Fixture bridges remain regression-only and are absent from the
public package surface.

`baseRonEligibility` has three meanings: `eligible` proves a baseline ron path,
`ineligible` proves no baseline yaku in the fully known supported context, and
`unknown_missing_situational_yaku_context` means missing wind/riichi/kuitan or
winning-event context could change the answer. Temporary and riichi furiten
require complete response opportunities; missing history stays unknown rather
than being converted to “not furiten.”

The canonical event stream is authoritative for all new replay work. Source
adapters may map source records into events but may not compute coach factors or
mutate a frozen decision. Public state contains only table-visible information;
self private state contains the user's concealed hand and current draw.
Opponent draws are hidden events and no opponent-hand field exists in a
decision snapshot.

`legacy_regression_bridge_only` is a fixture-only migration tool. It rejects
every non-fixture source kind and invalid event sequence, and is never a runtime
fallback for Mahjong Soul or MJAI. This event foundation does not infer waits,
flush plans, opponent hand composition, or behavior from discard order; those
remain later analyzers with explicit heuristic provenance.

The fact engine is bundled below application resources; users do not configure
a Go runtime, executable path, model path, or mahjong-helper checkout. Its
machine boundary is strict JSONL. Responses bind request ID, canonical action,
projected-state hash, protocol version, adapter version, and pinned upstream
commit. Recommendation/ranking fields are not part of the protocol and strict
schemas reject unknown fields.

Developer verification:

```powershell
npm run test
npm run typecheck
npm run test:package-import
npm run build:fact-engine
npm run package:fact-engine
npm run test:fact-engine
```

The upstream MIT notice and pinned source license are stored under
`tools/mahjong-facts`. The sidecar maps upstream calculations into facts only;
mahjong-helper recommendations or composite rankings never enter coach
preference.

The LLM consumes the validated package. It is not allowed to create factors,
change model facts, or infer an engine motive. Coaching judgments (CoachJudgment)
may weigh grounded factors into a recommendation, but never introduce unsupported
game-state facts.

## 可运行原型：命令行教练

`bin/riichi-coach.mjs` 是本机可运行的 M2-C 回归原型入口。它把一份
`source + 截断 mjaiLog + decisions` 原型夹具转成 canonical 事件流，对受支持的
自摸后弃牌决策
运行同一五轴 FactorPipeline（含逐威胁防守矩阵），并输出结构化 JSON 报告与
可读 Markdown 报告。

```powershell
npm run coach                       # 用内置东一局 6/7 巡 fixture 演示
npm run coach -- <report.json>      # 分析兼容的原型回归夹具
npm run coach -- <report.json> --out <dir>
```

原型复用打包 sidecar，终端用户无需配置 Go 或可执行文件路径。报告明确标注
`legacy_regression_bridge_only` 数据来源：这是本地文件回归桥，不是生产雀魂
牌谱映射，也不是通用 Mortal/MJAI 导入器。输入只允许当前原型已映射的截断
事件集合与自摸后弃牌决策；含 `hora`、`ryukyoku`、`dora` 等未映射事件的完整
日志会明确失败。生产雀魂 URL 获取与完整事件映射仍属于 M5。原型只报告可
审计的确定事实与版本化启发式，未覆盖精确符番、放铳概率、顺位 EV、对手手牌
推断与模型内部原因。

主要导出（`@riichi-coach/reasoning`）：

- `analyzePrototypeGame(raw, engine)`：生成整份 `CoachGameReport`；
- `renderCoachGameMarkdown(report)`：渲染可读 Markdown；
- `importPrototypeGame(raw)`：原型回归夹具的受限事件归一化与决策→回放事件映射。

原型在 `packages/reasoning/tests/coach-report.test.ts` 中通过真实打包 sidecar
验证东一局 6/7 巡：6 巡牌效支持切 2筒、防守支持摸切 6索（玩家 2 现物）；
7 巡牌效支持切 7筒、防守支持摸切 8筒；综合偏好保持 `null`。
