# 验收采用 coverage-driven 两层真实语料（discovery/acceptance），本地侧新增独立的 Tenhou→canonical 入口

> **2026-08-16 来源政策修正（superseding note）**：本 ADR 的核心决策——本地侧必须
> 独立生产、绝不从 Mortal 报告内嵌 mjai_log 派生——不变且被强化。但"天凤入口"只是
> 当时的实现载体，不是验收不变量。修正后：**雀魂官方原始牌谱为首选验收来源**
> （最终产品入口，第一类验收入口 `scripts/majsoul-acceptance.mjs`），天凤降级为
> 补充（discovery 语料 / 稀有事件 / 第二验收来源）。任一获批独立本地来源的真实
> E2E 命中均可解除 fail-closed；证据 manifest 记录 `localSourceType`。详见
> A3 spec 的来源政策修正节与 `2026-08-16-m6-a3-source-policy-correction-report.md`。

A3 起的行动支持验收不依赖自有对局的有机命中，也不用 synthetic fixture 解除
production fail-closed，而是工程化获取公开真实牌谱（如 amae-koromo 索引的天凤
牌谱）：**Discovery corpus** 本地批量扫描 raw 牌谱（只跑 mapper/canonical/census，
绝不调用 Mortal）寻找稀有语义分支；**Acceptance corpus** 从中选最小完备集，仅对
目标 game+seat 提交 mjai.ekyu.moe 获取 Mortal 报告（串行低并发、保守延迟+jitter、
断点续跑、game+seat 去重、硬请求预算、缓存永不重提）。停止条件是**语义覆盖矩阵
无空格**（每分支 ≥1 真实 E2E 命中才解除 fail-closed，常见/高风险分支 3–5 例），
不是任何 corpus 场数。九种九牌等千场级稀有分支靠本地扫描万场级 raw log 命中，
只提交命中的目标 seat，不向社区服务发送批量请求。

账本本地侧为此新增**天凤原文→canonical mapper**（第二个生产入口），而不是从
Mortal 报告内嵌的 `mjai_log` 派生本地侧：指纹 v2 的设计意义是两个独立来源的
交叉验证，同源派生会把校验变成重言，Mortal 日志错误将同时污染两侧而账本测不出。

## Considered Options

- 从报告内嵌 mjai_log 派生本地侧：零新 mapper，但独立守恒原则受损。
- 固定 50–100 场或千场级全提交：前者数字任意，后者对免费社区服务不可接受。
- corpus 仅作统计参考：验收价值缩水，回到有机命中等待。

## Consequences

- 生产 fail-closed 的解除权在真实 E2E 命中；synthetic fixture 只做 regression
  与边界测试。
- 残留风险：若万场级 discovery 仍无某稀有分支（如九种九牌被鸣打而从不成为
  决策）命中，A3 无法按"矩阵无空格"CLOSE——需要显式降级条款（扫描 N 场后该
  分支保持 fail-closed 并记入 ROADMAP），在 A3 计划中作为开放风险处理。
