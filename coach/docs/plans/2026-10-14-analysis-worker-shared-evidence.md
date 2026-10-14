# 分析无响应修复与共享证据 P2

用户批准并案实施。窗口响应是独立验收目标，不能等待数据压缩收益。

## Scope / Locality

desktop 的既有 record-analysis-store 原样在后台执行首次校验/重放，账号抓取校验和
后续 handoff 以输入字节、规则证据、记录/视角身份复用结果。原同步 store 保留用于
工具和测试；两条生产入口接受同步或异步端口。独立分析 Worker 拥有 runtime、helper、
组包/验证、构图、编码、SQLite 事务、展示缓存及标题保存。主线程仅持有 canonical
输入上下文及小型状态/结果编号，不收完整分析包；问答/展示沿用独立 Coach Worker。

reasoning 的构建器和验证器私有副本合并相同 evidenceIds/sourceRefs、native 事件描述。
构图直接消费本应用验证器拥有的不可变包；普通调用方仍验证 schema 并取得私有副本。
共享列表使完整引用检查、图边计算、JSON 检查/散列可以复用同一个对象的遍历结果。

desktop 的 RCPKG03 是存储编码：证据集合字典、事件字典及历史前缀父指针，读取后
直接连接到共享数组/对象，不生成大量独立副本。分析合同/编号/语义哈希不变；存储
content_hash 绑定实际紧凑字节。RCPKG01/02 和 inline 历史档案继续读取。历史 RCPKG01
自动压缩继续使用 RCPKG02，保持原内容哈希；不强制转换历史包或重新分析。
新编码以 64KiB 内的原始块压缩，避免去重后大块无法装入行而全量退回原文。

## Invariants / Traceability

INV-001/002/003/004/009：仍只使用 canonical、libriichi 与 helper 权威事实；生产门禁、
完整候选、跨局面绑定和事实/模型分区不变。源字节和认证留在原特权入口，runtime
路径只通过内部 Worker 参数传递，不成为 renderer/preload 能力。
INV-005：Worker 主机仅接受 strict 进度与 sessionId/packageId，拒绝额外整包数据。
INV-011/012：全部保存仍经过现有 repository 事务、不可变触发器、展示缓存绑定与恢复。
取消先关闭 sidecar 并在保存前检查；退出等待 Worker 清理完成，不强杀持有子进程/
事务的线程。已提交的事务不会因取消被虚构成未发生。

## Replaceability / Recoverability

没有新增事实来源或通用缓存系统。新增执行位置是必要隔离：原 Coach Worker 的
长任务会阻塞展示/问答；主线程的同步拼包/保存已实测阻塞窗口约 15 秒。独立线程
隔离这条 CPU/SQL 生命周期，协议只返回小型结果，后续存储表示可独立替换。
共享表示折叠在已有 builder/validator/storage；不改变上层工具的数据字段。

## Verification

永久回归：线程崩溃/非法整包响应/取消排空；真实完整牌谱 preflight 等价与去重；
共享表示逻辑等价、顺序/Unicode、事件分支、引用篡改拒绝；新格式存储/元数据读取；
旧档案压缩原哈希/回滚；原包校验、图投影、复盘展示及 report/tool 回归。
隐藏 Electron 测量完整 CPU/保存期间窗口到主线程请求、事件循环、存储原始/实际
字节、读回耗时与进程 RSS。固定 native/helper 响应比较全部字段（只剔除合同允许
变化的 createdAt/detailPolicy.frozenAt），同时执行真实 native 与桌面集成检查。
本轮测量、失败及最终门禁记录到 handoff，未运行的检查不写 PASS。
