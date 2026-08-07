# Slice 3 结构化事实引擎设计交接

更新时间：2026-08-08

当前阶段：书面规格已落盘，等待用户复核

## 1. 当前目标

开发统一架构 Slice 3：让 `AnalysisFrame + StructuredComparisonSet + KnownGameFacts` 经过可审计事实计算，输出 `CandidateFactorLedger[] + FactorDifferences + DeterministicPreference`。

事实计算不读取 Mortal/Akagi 评分，不读取模型首选，也不使用 LLM。它既服务有模型复盘，也服务用户指定的无模型动作比较。

## 2. 已完成基础

- Slice 1：分析帧、模型评分、默认阈值 10、偏好集合与一致性契约；
- Slice 2：11 种结构化动作、四种决策窗口、canonical action codec、CandidateNormalizer、Mortal 结构化导入和 legacy bridge；
- coach 基线：30 个测试文件、209/209 测试通过；
- Slice 2 最终复审：Critical 0、Important 0；
- 产品总 roadmap 已提交：`0ba0c26`；
- Slice 2 交接已提交：`861d686`。

本轮同时更新 roadmap 的 M1 描述，使其与“复用外部事实引擎、拒绝外部推荐”的新边界一致。

## 3. 本轮设计结论

书面规格：

`docs/superpowers/specs/2026-08-08-structured-factor-pipeline-design.md`

核心决定：

1. Slice 3 不是重写麻将算法，而是“麻将事实引擎 → 可审计账本”的适配层；
2. 首个事实引擎是应用托管的 Go JSONL sidecar，直接复用 `EndlessCheng/mahjong-helper/util`；
3. 固定上游提交 `514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0`，保留 MIT 许可证；
4. 不解析 helper CLI 文本，不采用 helper 最终推荐、综合排名或黑箱分数；
5. Akagi 的 Rust 分析移植只作为交叉校验与未来替换候选，不绑定完整 Tauri 应用；
6. Slice 3 外部白名单只纳入向听、有效/改善牌、可验证剩余枚数等确定性牌效事实；
7. 立直、一发、逐家现物继续由本项目事件重放计算；
8. 打点、启发式危险度、顺位和选择权留给 M2；
9. 多轴冲突不使用任意权重解决；缺事实或未支持不能伪装成相等；
10. 用户无需设置 sidecar 路径或 Go 运行时。

## 4. 必须保持的回归

牌谱 `260730-8649addb-b4cb-48e1-ba8e-c6c3ffbb9166_a62115198`：

- 东一局 6 巡：牌效支持切 2 筒；防守支持摸切上家立直现物 6 索；
- 东一局 7 巡：牌效支持切 7 筒；防守支持现物 8 筒；
- 不得把这两处模型偏好解释成牌效；
- `modelReason` 始终为 `unknown`。

## 5. 下一步

当前必须先通过用户对书面规格的复核。获批后：

1. 完整读取 `writing-plans` skill；
2. 写逐文件、逐测试的 TDD 实施计划；
3. 计划至少拆分 contracts、Go sidecar、runtime adapter、candidate projector、fact adapter、FactorPipeline、comparison/resolver、legacy regression、exports/docs；
4. 每个任务 RED → GREEN，限制提交文件范围；
5. 完整实现后读取并执行 `requesting-code-review` skill；
6. 最终运行聚焦测试、209 项基线回归、typecheck、包导入和依赖/许可证检查。

## 6. 工作区保护

当前存在用户/其他任务的改动，不属于教练 Slice 3：

- `overlay/cv重做.md`（modified）
- `overlay/prompt.md`（untracked）

不得修改、暂存或提交这些文件。每次提交前运行：

```powershell
git diff --cached --name-only
git diff --cached --check
```

只提交当前 Slice 3 指定文件。不要整理或回滚其他人的工作树。

## 7. 外部调研摘要

- `mahjong-helper` 是 Go module，`util/shanten_improve.go` 有公开结构化分析函数；根 CLI 不适合机器解析；
- 本机当前没有系统 Go 工具链，实施时应使用固定、可重复的开发构建方式，但不能把这变成普通用户配置；
- Akagi 当前分析模块包含 Rust 移植和可序列化结果，但完整应用依赖较重，没有发现适合作为稳定任意局面批处理协议的独立 CLI；
- 不允许以 helper/Akagi 推荐代替本项目的 `DeterministicPreference`。

## 8. 停止点

本交接落盘后，应把规格与交接作为独立文档提交，并请用户进行书面复核。用户批准前不得进入实施代码。
