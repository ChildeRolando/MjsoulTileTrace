# 本地复盘展示缓存实施与变更控制

## Scope
用户批准 M7-B 2026-10-14 修订；解决已分析牌谱重开重复验证/构图造成十几秒等待。
正常展示目标为亚秒，旧库存档付出一次准备成本。原始“分析牌谱”引擎加速不在本次重构。

## Locality
desktop repository/controller/service 负责存储和消费派生 DTO；reasoning 仅提取已有舍牌
损失计算的最小输入，算法不变，通过现有公共 exports 接线。无新包或 provider。

## Invariants
INV-011/012 的完整验证要求保留在生成/重建路径，正常展示改为可信本地缓存。INV-001/005
保持：没有新事实来源，没有原始输入/graph 暴露给 renderer。缓存缺失重建、报告 revision、
删除、取消、strict DTO 与离线重启由新缓存回归及原 generation/worker/Golden 保护。

## Traceability / Replaceability
缓存来自同一生产 presenter，绑定原包身份与 session/revision/report 映射及版本；允许
删除重建。舍牌损失仍消费原 native 规则结果，不增加第二套合法动作或替代模型。

## Recoverability
先运行跨重启禁止 `readPackageArtifact` 测试，原代码因访问原包失败；实施后通过。
缓存版本显式更新；准备脚本可安全重复执行，已有效缓存直接命中。源数据无需迁移格式，
派生表兼容旧版本忽略，旧版本更新报告后 revision 使缓存失效。

## Semantic Load
在现有 repository 增加可重建展示投影，没有通用缓存框架、后台审计或新信任服务。
两张派生表分别避免整包页面重建与历史统计身份读取；均由原 repository 管理。

## 验证记录
已完成，门禁、真实档案耗时、首次失败及限制见
[验收记录](../handoffs/2026-10-14-review-open-cache.md)。
