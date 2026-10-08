# COAC-211 存储治理靶场固定候选

这是用户授权的可抛弃流程靶场，不是产品功能交付或Review Loop源码自审。业务载体仅COAC-211；默认既有legacy协议的review1、fix1、review2是有界机器执行阶段，均归属同一parent。PR不得合并，验收后关闭但保留证据与源码引用。

固定行为：storagePlaygroundMarker()必须返回字符串accepted。保留独立测试对该行为的完整断言。候选模块仅由该测试引用，不导出到产品公共入口，不改变已有产品语义。写入者只修这一行为，不改期望值、不删测试、不改门禁或协议。

真实门禁仍为现有Coach五门：typecheck、build、vitest、architecture、package-import。先使用固定受信resource-build安装/构建包装器，再运行任务参数给出的五门包装器，记录原命令和真实退出码；全部既有测试保留。禁止自行npm/build后把未登记ignored推断为可删除。初次已有失败须原样保留，修复后的复跑独立记录。

资源须使用E:\AgentWorkspaces\Coach的配置managed根及公开分配/构建入口，由Controller保存全轮次索引和来源、接纳归档、lease及回收意图；资源交给普通Git remove，禁止force/清空根/删旧资料。Controller业务状态与PR合并、产品验收分开；结果只证明靶场流程。

独立Reviewer据固定源码、测试和实际运行形成完整结论；正文保留所有实际findings及环境失败，不复制预写结论。该行为问题若需要修复，以现有marker模块为唯一durable_owner，现有storage-playground-marker.test.ts为完整永久反例，不增加知识副本或不相干产品改动。
