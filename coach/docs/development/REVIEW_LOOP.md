# Review Loop 接入契约

本页说明 Coach 产品与 Review Loop 评审服务之间的边界。它不负责工具的实现、测试或发布。

## 所有权

- 独立本地工具仓拥有 Review Loop 源码、工具测试和发布版本。管理员部署固定版本；配置、凭据、ledger、结果和快照保存在 Coach/GitHub 共享仓之外的私有状态目录。
- Coach 拥有产品 PR 的 admission 与 rubric、Coach 产品验收门禁，以及对正常 Reviewer 结果的消费。
- GitHub `Review Loop v2` check 继续为符合 admission 的 Coach 产品 PR 提供普通产品评审状态。它不评审 Review Loop 工具自身；工具变更需要独立评审。

Coach 产品验收保留原有五门：

1. `npm run typecheck`
2. `npm run build`
3. `npx vitest run`
4. `npm run check:architecture`
5. `npm run test:package-import`

Review Loop 工具协议与状态机回归由独立本地工具仓运行，不属于 Coach 产品的 `npm test`。

## 历史冻结协议

[`2026-09-20-review-loop-v2.md`](../specs/2026-09-20-review-loop-v2.md) 保留为 COAC-30 / `review-loop/v2.1` 的历史冻结契约，也是既有 admission 引用的原始路径。引用该路径的旧 PR 与候选仍按其当时记录的 spec path 和 rubric 理解；本接入页和后续工具发布不追溯替换或重解释这些历史准入。

该历史 spec 记录当时的产品准入与协议，不再拥有当前工具源码、测试或发布。工具发布与运行状态以管理员部署的固定本地版本及其私有 ledger 为准。
