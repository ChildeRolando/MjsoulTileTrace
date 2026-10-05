# 教练历史用量统计

## Scope / Locality

保留当前请求用量，在复盘 Overview 增加本机保存记录的历史累计、已解说行动数与盘数。
contracts 增加 strict 计数 DTO；desktop 的既有 repository/controller/renderer 消费它。
IPC、preload 和 worker 复用现有 snapshot schema，不传报告正文、原牌谱或查找表。
统计职责归入既有 ReviewSession repository；没有新增领域实体或 provider 专用统计入口。

## Invariants / Traceability

来源是保存的不可变 ReviewReport.audit.usage 和 ready 条目的 Explanation，统计不改变图、
报告、grounding 或 prompt。reportRefId 表示一次保存生成，幂等操作不会增加记录；不同
reportRefId 即使 reportId 相同仍累加用量。缺失字段独立记录 unknown，不视为零，不补猜；
缓存输入不二次叠加。用户确认“手数”按单行动计，recordId + decisionId 去重；盘数按
至少一条成功解说的 recordId 去重。未保存/已删除报告不在本统计范围，不表示账号账单。

INV-011/012 的身份、哈希、后台消费及 strict DTO 边界保持原规则。历史身份提取只读取
record、packageId 和 packageSchema，并检查父行绑定与存储 hash；不会物化完整证据树，
也不是领域校验豁免。当前已验证包可复用 record 身份，缓存受外部 data_version 失效约束。

## Replaceability / Recoverability / Semantic Load

聚合只消费公共 ReviewReport 用量契约，不识别服务商或模型名字；更换 API 不需要修改
统计或 UI。未知、冲突、溢出与存储损坏由聚焦回归拒绝。历史统计失败显示不可用，不影响
当前合法复盘。后台冷读需要扫描旧档案字节；同进程后续身份读可复用，不阻塞 renderer。
新增概念只有一个操作统计 DTO，没有新事实来源或持久化校验回执。

## Verification

永久回归覆盖聚合、跨块身份、父行/正文错配、SQLite 冷重启和幂等重放、原生 UI 等待期
保留及生成/重开更新。精确候选命令、退出码、真实库只读备份的统计与内存/耗时记录、
独立 scoped 验收放在 checkout 外 coach-acceptance-evidence/coach-history-usage-20261006。
没有新增云模型调用，未对全产品签发验收结论。
