# 牌谱分析 P0/P1 实施与变更控制

## Scope / Locality

用户批准 P0 和两项 P1：复用整盘回放上下文及振听历史状态，消除新包保存时的重复
验证/构图/编码/立即整包读回，去掉受管 Mortal 响应后固定 20 ms 等待。保留完整规则
边界、评分、因素、筛选和展示内容；本次不改变存档逻辑格式，不做按需分析/P2 数据去重。

reasoning 扩展已有 DecisionStreamContext，在同一次分析各阶段显式传递；desktop
复用现有 repository/read-back composer；mortal-runtime 调整已完成响应的返回时机。
没有新包、provider、全局强引用上下文缓存或后台审计。

## Invariants / Traceability

INV-001/002/004/009：回放和事实仍来自 canonical/native/helper；每个局面的请求、规则
结果和评分仍完整绑定检查。共享上下文只能匹配其确切不可变 stream，振听只读取目标
之前的前缀，不能消费未来响应闭合或清除状态。由 scoring、furiten、native whole-game
及固定响应重放对照保护。

INV-011/012：用户批准的新写入路径允许复用本次完整验证后私有、深度冻结的包。
复用记录归现有包验证器所有，用弱引用记录对象身份；可变输入、调用方浅冻结输入、
反序列化数据仍完整验证，调用方输入不被冻结。repository 新包保存沿用 SQLite 事务、
不可变父/块约束和原格式；一次编码暂存到私有临时文件，事务仅插入已编码块。失败
回滚并关闭暂存；自身提交后复用本次 composer，外部连接 data_version 变化仍失效。
恢复/重启的完整上下文读回继续验证实际磁盘数据，展示缓存沿用已批准跨重启规则。

运行时不再承诺等待 20 ms 捕获所有迟到异常。完整响应的 schema、身份、候选全集和
请求编号检查保留；同一输出块中的多余内容立即拒绝，完成后才到达的异常立即使该
子进程失效。后续操作不能把它当作成功响应继续使用。协议测试分别覆盖即时与迟到输出。

## Replaceability / Recoverability

reasoning 不依赖 privileged runtime；desktop 仍通过现有公开入口接线。没有新事实源。
上下文跨 stream 拒绝、前缀等价、不可变验证结果、保存不整包读回、暂存失败回滚、
编码字节/哈希等价、异常输出和既有存档损坏回归定位错误。旧格式保持可读。

## Semantic Load

复用结论归已有验证器；共享状态归已有 DecisionStreamContext；编码暂存归原
package-artifact-storage。没有新增架构层信任服务或通用缓存框架。

## Verification

测量、首次失败、门禁、输出对照和验收入口记于当次 handoff；未完成的验证不记 PASS。
