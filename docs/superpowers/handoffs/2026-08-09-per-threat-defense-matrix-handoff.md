# M2-C V1 逐威胁防守矩阵交接

更新时间：2026-08-11

当前阶段：M2-C V1 逐威胁防守矩阵完成并通过全量验收；下一步为 M5 生产雀魂匿名获取/事件映射与首个 M6 引擎贯通。

## 1. 已交付

散落的现物、筋、壁、one-chance、字牌和 helper 风险事实已收束为严格的“候选动作 × 威胁者”防守矩阵 `defense-matrix/v1`。每个弃牌/立直弃牌候选为每个威胁生成一行单元格：`deterministicSafety` 只接受逐对象现物，`structural` 只承载 request-bound 结构启发式。只有逐对象现物能进入确定性偏好。

主要提交：

- `c0ff9c8`：逐威胁防守矩阵契约；
- `328bcea`：canonical 快照无损投影威胁身份与逐字段完整性；
- `e33a0a3`：确定性现物单元格与最终矩阵组装；
- `fa76d69`：逐威胁结构风险投影（ready / blocked / unsupported）；
- `edac98f`：sidecar 结构风险语义版本化（adapter 0.2.0）；
- `2a0c6b4`：矩阵组装为账本并删除 `local-defense.ts` 第二真相；
- `c4ff9b2`：差异与偏好边界隔离（`genbutsu:actorN` 精确锚定）；
- `26e28c3`：东一局 6/7 巡端到端与变形防守回归。

另交付了本机可运行原型（`feat: prototype coach CLI`）：`coach/bin/riichi-coach.mjs`
把 `source + 截断 mjaiLog + decisions` 回归夹具转成 canonical 事件流，对受支持的自摸后弃牌
决策运行同一五轴 FactorPipeline 并输出 JSON + Markdown 报告。报告复用打包
sidecar，无 Go 配置；`npm run coach` 即可运行东一局 6/7 演示。这不是通用
Mortal/MJAI 导入器；生产雀魂 URL 与完整事件映射仍属于 M5。

## 2. 可信边界

- 对某威胁安全的牌绝不泛化到另一威胁；多威胁保持独立行，不求和、不取最大、不平均、不归一化、无合成总风险；
- `helperRiskScale` 是版本化启发式数值，绝不是概率，也绝不是 Mortal/Akagi 放铳率；结构标签与风险刻度只能 `heuristic_only`，永远不能产生 `DeterministicPreference`；
- 威胁者自身河中的弃牌是确定现物，证据角色为 `threat_own_discard`；跨玩家立直后通过需要完整 response-opportunity，证据角色为 `post_riichi_pass`；
- `declared`、`accepted`、`user_marked_open` 保持三种不同威胁类型；`user_marked_open` 结构风险在 V1 明确 `unsupported_threat_kind`；
- 缺失事实只阻塞依赖该字段的单元格，不使整个矩阵消失；
- 结构请求绑定 actionRef + stateHash + threatActor + scaleVersion + evidenceIds；helper 的 `genbutsu` 标签被过滤，因为确定性安全独占该概念；
- 删除一条河事件只改变依赖该事件的单元格与证据。

## 3. 已验证的东一局边界

真实 fixture：`coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`。

- 6 巡：效率轴支持切 2筒；防守轴支持摸切 actor 2 的现物 6索；2p 不被牌效解释为更安全；
- 7 巡：效率轴支持切 7筒；防守轴支持摸切现物 8筒；7p 保留牌效支持；
- 两手 applied decision 均为 `null`；
- 6s/8p 对 actor 2 的确定现物证据精确绑定到 `.../0/48/0` / `.../0/39/0` 单一河事件；
- 变形测试：重写支持性弃牌只改变依赖单元格；把立直移到另一玩家会移动矩阵行且不残留陈旧证据；
- 修改 helper 风险刻度或分类不改变确定性偏好；删除模型评分不改变完整矩阵与因素结果；
- `modelReason` 继续固定为 `unknown`。

真实 fixture 通过 `legacy_regression_bridge_only` 测试桥进入新管线。此桥只用于共享维度回归，不是生产 fallback。

## 4. 最终验收证据

- Go 确定性构建两次 SHA-256 相同；
- `go test ./...`：通过；
- `go vet ./...`：通过；
- `npm run package:fact-engine`：通过（0.2.0 信任边界未改写）；
- `npm test`：60 个文件、590/590 通过；
- `npm run typecheck`：通过；
- `npm run test:package-import`：通过（含 `DEFENSE_MATRIX_SCHEMA_VERSION` / `DefenseMatrixV1Schema` / `buildDeterministicDefenseMatrix` / `assembleDefenseMatrix`）；
- 根目录 `node --test tests/*.mjs`：19/19 通过；
- `npm audit --omit=dev`：0 vulnerabilities；
- `npm run generate:factor-regression-golden`：通过，每个候选新增逐威胁 `threatRisk.request` / `threatRisk.result`（结果 `kind` 为 `threat_risk_result`，请求 `kind` 为 `threat_risk`）；
- M2-C V1 复审：Critical 0；Important 0；Minor 0；Ready。

打包身份：

- 平台：`windows-x64`；
- 二进制大小：2,879,488 bytes；
- SHA-256：`f87faf31691c666fec5f170866e096b4394254b0772f2a37af2c5e88fde71ba4`；
- Go：1.24.13；
- adapter：0.2.0；protocol：`mahjong-facts/v1`；
- manifest、Go module pin、协议身份和 TypeScript 常量由打包检查交叉验证。

## 5. 后续产品开发

M2-C V1 只覆盖确定性现物与结构启发式，不覆盖行为/等待启发式、染手/对对/役牌宝牌周边推断、手切序列推测，也不覆盖校准放铳概率。下一步直接进入 roadmap 的 M5 生产雀魂匿名获取/事件映射，随后贯通首个 M6 引擎。下一次计划中的用户节点仍是 H1：能用真实雀魂南风牌谱跑通后，核对主视角、局面、动作、候选和分数。

继续开发时首先检查：

1. 新牌河阅读启发式必须保持结构、行为、等待三级分层，并各自标注来源与限制；
2. 任何新“危险度”不得声称是 Mortal 铳率或精确放铳概率；只有明确数据集、规则与验证后才能进入 `calibrated_statistic`；
3. 多威胁永不合成总风险；新增威胁分析必须维持独立行；
4. 新事实必须维持模型评分删除不变性；
5. East 1 turn 6/7 继续作为不可退化门禁。

## 6. 工作区保护

下列文件属于用户/其他任务，不得修改、暂存或提交：

- `docs/superpowers/plans/2026-08-08-hand-structure-furiten.md`（modified）；
- `overlay/cv重做.md`（deleted）；
- `overlay/**`（`.ai-bridge/`、`bridge/` 等 untracked）。

每次提交前继续运行：

```powershell
git diff --cached --name-only
git diff --cached --check
```
