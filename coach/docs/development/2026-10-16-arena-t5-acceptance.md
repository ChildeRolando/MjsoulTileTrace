# COAC-224 小批量验收

当前阶段：冻结前回归。最终运行编号、计数与评审结果在运行后补充。

## 范围

沿用 Arena CLI、desktop runner/MCP/RAG 与 archive owner；仅补知识描述、固定独立牌局数据源和验收展示分类。无新队列、服务或架构抽象，不改生产 Coach 生成、保存与重开语义。

## 不变量与回归

- 模型输入无 Mortal 标签/Q、未来动作、原记录身份；沿用 case/scorer/runner 隔离测试。
- 完整牌局按源哈希分组、不同分组不重叠；dataset/manifest 测试验证来源和完整结尾。
- 输出失败、预算、工具故障与旧归档继续保留，离线 inspect 不调用模型；archive/provider 测试及真实故障演示验证。
- 知识来源使用原课程摘要，不含验收案例答案；RAG hit/off/引用测试验证。
- 包依赖/生产隔离以现有 check-architecture、全量测试及类型/构建为准。

## 冻结运行计划

保持同一代码提交，模型 gpt-6-luna/high；max-provider-turns=6、max-tool-calls=4、max-provider-output-tokens=8192、max-run-ms=300000、token-warning-threshold=100000000。

1. blind-discard-smoke-v1，3 题，Off 与 Local。
2. blind-discard-dev-v1，1 题，Local + first-helper-timeout。
3. blind-discard-holdout-v1，3 题，Off 与 Local。

所有运行保存 manifest/events/summary、case-trace、Mortal 评分；分别执行 `node bin/blind-discard-arena.mjs inspect <runId>`。控制台独立显示验收结果。完整原始归档留在本机 reports，不将原牌谱或私有推理写入提交。

首次 RAG 开发验证：代码 6ed0499，run 29b4c4b3-6cd5-4068-8b35-4e60fe28423c，1/1 成功且匹配；helper 1/1，RAG 1 次查询命中、2 条来源，78,089 已报告 tokens。这是方法开发证据，不能替代冻结版本验收。

## 边界

独立牌局曾用于生产解析回归，但未用于 Arena 方法调参；仅声明 Arena 分组隔离。验收结果披露后转为回归资料，不继续称未见样本。不设 Mortal 匹配率门槛，不以机械引用校验代替专家正确性审查。
