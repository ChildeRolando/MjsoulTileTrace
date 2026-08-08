# Slice 3 结构化事实引擎交接

更新时间：2026-08-08

当前阶段：实现完成，等待全量回归与最终代码审查

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

## 4. 当前测试状态

Task 8–10 聚焦回归均已通过；东一局新回归已通过；TypeScript typecheck 已通过。仍需执行 Task 12：

1. `npm test`；
2. `npm run typecheck`；
3. `npm run test:package-import`；
4. Go sidecar 全测与 release build；
5. 根目录 legacy 测试；
6. 按 `requesting-code-review` skill 审查整个 Slice 3，并以失败测试修复全部 Critical/Important；
7. 更新产品 roadmap 状态。

## 5. 后续产品开发

Slice 3 只是可审计麻将事实层，不是可发行教练产品的终点。完成审查后，应直接进入 roadmap 的 M2–M9：更完整的价值/牌河/对手模型、牌谱服务与任务队列、教练提示与对话编排、三栏桌面 UI、历史牌谱会话、模型选择与分发打包。下一次真正需要用户介入的节点应是能用真实雀魂南风牌谱跑通的可视化教练验收，而不是 sidecar 路径或工程参数。

## 6. 工作区保护

下列文件属于用户/其他任务，不得修改、暂存或提交：

- `overlay/cv重做.md`（modified）；
- `overlay/prompt.md`（untracked）。

每次提交前继续运行：

```powershell
git diff --cached --name-only
git diff --cached --check
```
