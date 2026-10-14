# 分析 Worker 与共享证据 P2 交接

## 已实施

账号与分享入口共用后台首次校验/重放和独立分析 Worker。runtime/helper、组包完整
验证、构图、编码、事务、展示缓存、标题保存均不在窗口主线程执行。分析线程只返回
进度与 sessionId/packageId，退出/取消等待所拥有资源清理；展示与问答另有 Worker。

包内部共享 evidenceIds/sourceRefs 和 native 事件描述，图直接复用私有不可变包；
共享列表遍历和 canonical 编码复用只限一次操作。RCPKG03 以证据集合/事件字典和
历史父指针存储，再连接为原合同的共享数据。旧 inline/RCPKG01/02 保持可读，历史
压缩仍保持旧内容哈希。没有事实删减、候选缩水、证据编号翻译或全库重分析。

## 已测收益与限制

同一完整真实 fixture：1026 events、485 native rule boundaries、145 scores、155 package
decisions。实际 CPU runtime/helper 的两次分析加保存（包含后台 preflight）为
50.254/50.786 秒；此前同样本 P0/P1 约 71.2–72.4 秒。窗口到主线程请求最大
22.8/18.1ms，主线程采样间隔最大 58.4/49.1ms。隐藏 Electron 窗口，OS 缓存未清空；
两个样本不构成全体牌谱 p95，也没有复刻用户那次 470MB 包的完整分析。

固定真实响应对照独立线程基准：整理/保存 10.490/12.937 秒，合并实现约
7.2–8.6/8.3–9.7 秒。除合同允许变化的 createdAt/detailPolicy.frozenAt 外，所有字段
严格深比较零差异，packageId/semanticContentHash 一致。完整逻辑 JSON 约 188.93MB，
紧凑存储原文约 32.82MB；读回约 0.53–0.67 秒，基准 2.10 秒。

实际压缩字节是代价：约 0.716MB → 1.468MB，因为全局重复消失且新块较小。
新结果的编码要求本版本读取，旧版应用不支持 RCPKG03；旧结果不强制迁移。
用户侧使用更新后的「启动Coach秒开优化验收.cmd」。

LLM/工具完整上下文沿原生成入口按需读回；普通打开不后台展开/校验整盘。字典引用
对上层仍呈现原字段，图、证据、所有局面均保留。现有跨重启缓存后首次生成完整
上下文、grounding 和离线读回回归通过。

## 验证与证据

本轮全量 216 Vitest 文件/2701 测试、36 Node 工具测试、build、typecheck、architecture
及 package-import 通过；生产依赖漏洞 0。Electron Golden 的账号/分享/失败/证据型/
单行动路径通过；Electron 持久化的真实 native fixture、独立离线重启零请求、崩溃恢复、
A-B-A/partial/evidence-only/迁移通过。七份历史档案秒开结果在本轮证据目录。

证据根：`E:/文档/日麻教学/coach-acceptance-evidence/analysis-shared-worker-20261014`。
完整原生 CPU corpus 的提交绑定回执放在 `native-corpus/`，最终回执记录准确 head、
门禁和启动入口准备结果；不能用上一轮 corpus 回执冒充本次验证。

## 尝试与首次失败

- 首个独立线程基准把测试设置阶段的同步 replay 算入响应采样，预算失败；保留其
  原始结果。修正采样范围，同时把生产 preflight 移入后台，预算保持 <200ms。
- 首个紧凑编码仍用 4MB 块，压缩后不适合 64KiB 行，大量退回原文（16.8MB）；
  改小块后实际存储约 1.47MB。这不是旧格式重写。
- 旧格式测试只改存储头，误保留了新编码 SHA；修复 fixture，使其哈希绑定真实旧字节，
  继续验证旧 SHA 不变和失败事务回滚。新增测试的不可用私有 hash import、TS Worker
  路径和漏 await 均已修正；Windows ESM 本地路径比较脚本重试已通过。
- 第二轮全量一次桌面用例超出原 5 秒超时；保留失败日志，不改超时。修复新增测试后
  聚焦 54 项和单独运行的最终全量 2701 项通过。

架构控制、所有权与可执行保护见
[实施计划](../plans/2026-10-14-analysis-worker-shared-evidence.md)。
未改原主验收版本，没有合并或发布 PR，也未替用户打开可见应用。
