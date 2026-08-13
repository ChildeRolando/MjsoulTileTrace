# Slice 3 结构化事实引擎交接

更新时间：2026-08-08

当前阶段：Slice 3 完成并通过全量验收；下一阶段为 M2-A/M2-C 与 M5 的共享局面事实设计

## 1. 已交付

统一的 `AnalysisFrame + StructuredComparisonSet + KnownGameFacts` 管线已经实现。每个 canonical candidate 独立投影、调用事实引擎、生成五轴账本；随后仅在证据类别、单位、引擎版本和假设条件相同的事实之间建立差异，并以无权重 Pareto 规则生成 `DeterministicPreference | null`。

主要提交：

- `0e2e1f3`：事实引擎协议契约；
- `385116e`：Factor ledger/difference/preference 契约；
- `1f50788`：固定 mahjong-helper 上游源码与许可证；
- `a94f85d`：手牌事实 sidecar；
- `1d2101a`：完成手牌点数与结构危险度；
- `06c12a7`：托管 sidecar 生命周期；
- `c9e63c4`：候选状态投影；
- `6095524`：可审计候选账本；
- `71379ed`：同口径差异与确定性 dominance；
- `ce394d7`：端到端结构化 FactorPipeline。

最终审查修复提交：

- `2bf428f`：跨手牌/副露的物理牌张一致性；
- `40647da`：真实 sidecar East 1 回归；
- `2595e45`：并发请求下的单飞重启；
- `58c1364`：完成手点数的假设边界；
- `3bae2ad`：上游估算严格判别联合与数值范围；
- `8c26239`：局面 actor/event/river 身份约束；
- `4bebe68`：逐威胁请求完整哈希绑定；
- `75a1f42`：确定性覆盖不能被启发式事实冒充；
- `99218d7`：集合与分类启发式差异；
- `014892f`：固定役种名称与字牌剩余/分类；
- `3ddd190`：sidecar 文本隔离与项目自有诊断码；
- `e0a7550`：确定性发布打包、身份与完整性校验；
- `95a569e`：每个候选强制完整五轴；
- `f879b77`：golden 生成器改用打包资源。

## 2. 可信边界

- 确定事实：向听、有效牌种、完整可见信息下的剩余张、改善路线、宝牌数、完成手牌点数、立直/一发、逐威胁现物；
- 版本化启发式：役种 ID、默听/立直平均打点、等待速度、和率/振听、局收支，以及筋、壁、NC/OC、早外和 helper 风险刻度；
- 启发式差异永远不能进入 `DeterministicPreference`；
- helper 的推荐、排序和综合评分不进入协议；未知响应字段由严格 schema 拒绝；
- 每条上游计算事实携带 engine、commit、adapter、protocol 四元身份；本地事件重放事实不得伪造上游身份；
- 某个候选或某个威胁的 sidecar 失败只生成窄范围 blocked fact，本地防守事实继续保留；
- 不完整可见信息下的上游估算明确标注使用理论未见张。

## 3. 已验证的东一局边界

真实 fixture：`coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`。

- 6 巡：效率轴支持切 2筒；防守轴支持摸切 actor 2 的现物 6索；
- 7 巡：效率轴支持切 7筒；防守轴支持摸切现物 8筒；
- 两手 applied decision 均为 `null`，不以任意权重解决攻守冲突；
- 不存在“效率支持 6索/8筒”的差异；
- `modelReason` 继续固定为 `unknown`。

真实 fixture 通过 `legacy_regression_bridge_only` 测试桥进入新管线。此桥只用于共享维度回归，不是生产 fallback。

## 4. 最终验收证据

- `go test ./...`：通过；
- `go vet ./...`：通过；
- `npm run package:fact-engine`：通过；
- `npm test`：40 个文件、281/281 通过；
- `npm run typecheck`：通过；
- `npm run test:package-import`：1/1 通过；
- 根目录 `node --test tests/*.mjs`：19/19 通过；
- `npm audit --omit=dev`：0 vulnerabilities；
- `npm run generate:factor-regression-golden`：通过，重新生成与版本库无差异；
- 完整 Slice 3 复审：Critical 0；12 项 Important、2 项 Minor 全部关闭。

打包身份：

- 平台：`windows-x64`；
- 二进制大小：2,565,120 bytes；
- SHA-256：`d0b57b55bc69d64d751d806f7818d85ab23e2034c850d194adbcfeab383d2df5`；
- Go：1.24.13；
- adapter：0.1.0；
- manifest、Go module pin、协议身份和 TypeScript 常量由打包检查交叉验证。

## 5. 后续产品开发

Slice 3 只是可审计麻将事实层，不是可发行教练产品的终点。下一步直接进入 roadmap 的 M2-A/M2-C，并把完整公开局面事件模型设计成可被 M5 雀魂牌谱重放复用；随后依次推进价值/顺位/教学规则、模型接入、教练编排、会话服务和三栏 UI。下一次计划中的用户节点仍是 H1：能用真实雀魂南风牌谱跑通后，核对主视角、局面、动作、候选和分数；不为 sidecar 路径或其他工程参数停下。

继续开发时首先检查：

1. M2 不重复实现 Slice 3 已由固定 helper 提供的向听、役种估算、筋/壁/one-chance；
2. 新事实必须声明 deterministic / under assumptions / upstream estimate / unsupported；
3. 牌河阅读的“对手可能牌型”与规则确定安全牌严格分层；
4. 新五轴事实必须维持模型评分删除不变性；
5. East 1 turn 6/7 继续作为不可退化门禁。

## 6. 工作区保护

下列文件属于用户/其他任务，不得修改、暂存或提交：

- `overlay/cv重做.md`（modified）；
- `overlay/prompt.md`（untracked）。

每次提交前继续运行：

```powershell
git diff --cached --name-only
git diff --cached --check
```
