# 牌谱分析 P0/P1 验收与变更控制回执

## 实施结果

同一完整雀魂 fixture（1,026 events，485 规则边界，155 包内决策/145 ready）从
360.7106 s 降到 72.4421 s、71.1876 s；两次均运行真实 native/CPU checkpoint 与
helper，从映射到持久化和展示缓存。没有减少评分、详细分析、合法候选或改变筛选。
用户资料库没有被本次测量改写，全部使用独立新 SQLite 库。

| 阶段 | 基准秒 | 优化第二次秒 |
| --- | ---: | ---: |
| 规则 | 29.650 | 18.623 |
| 评分与准备 | 106.576 | 11.227 |
| 事实分析 | 161.206 | 9.905 |
| 组装/验证包 | 14.073 | 12.855 |
| 保存与展示缓存 | 47.313 | 16.698 |

还原次数由 441 降到 2（入口首次回放、生产分析上下文各一次）。293 次规则投影
factory 不再重建整盘状态。完整验证约 5 s，之后对私有不可变对象的调用复用结论；
graph 只构建/验证一次。固定静默等待退出，原协议身份/候选/请求绑定检查保留。

固定本次真实 native/helper 响应，完整重放旧 2a1f26d 分析与保存链后逐字段对照：
188,932,190 bytes 的包差异为 0；semanticContentHash 均为
`sha256:eb65114e043ecad86bc5bd7e81061b6beb85cff8a008ba3b885e0ed0160de81f`。
固定响应用于正确性对照，不能用其运行时间替代真实 CPU 性能测量。未固定 helper
的跨进程估算存在浮点尾数波动，不通过放宽包哈希断言解决。

## Change Control

Locality、Invariants、Traceability、Replaceability、Recoverability、Semantic Load
按 [实施计划](../plans/2026-10-14-record-analysis-performance.md) 执行。共享上下文、
验证结果复用、编码暂存均扩展现有 owner；没有新事实源、通用缓存框架、新数据库逻辑
格式、持久化 graph 或自动后台审计。父/块不可变触发器、WAL 事务和 strict DTO 保留。
真实 spike runner 同样显式传递已有上下文，保持完整矩阵和提交身份验证。

## 验证

- typecheck、build、213 文件/2,686 Vitest、36 Node 协议工具测试、package-import、
  architecture（0 violations）、diff 检查通过；生产依赖 audit 0 vulnerabilities。
- 新永久回归：共享评分请求相等且不追加整盘还原、全部振听前缀/请求相等与未来隔离、
  跨 stream 拒绝、私有深度不可变验证结果、可变/浅冻结/解码输入仍验证、新包保存
  零整包读回、写入失败事务回滚与清理、原编码字节/哈希/行边界一致。
- 真实 Electron MVP Golden：account failure、account/share、evidence-only、single action
  及离线新进程通过。Electron persistence：真实 native 22 decisions/65 rule boundaries，
  kill recovery、真实 main/preload/renderer、离线零网络、A-B-A、迁移通过。
- 7 份已有真实存档由生产 Electron main/preload/renderer 重开复测，仍为亚秒。
  逐份数字保存在外部实施 evidence；这是隐藏窗口的 DOM/layout 到达时间，不是物理屏幕
  绘制，未清空系统文件缓存。
- 提交后完整真实 CPU 矩阵必须以该提交运行，receipt/最终状态归外部 final-receipt.json；
  提交前不把历史矩阵或单 fixture 测量记为新提交全矩阵 PASS。

## 初次失败和限制

首次移除 20 ms 后，旧测试对迟到 extra response/超长输出的“当前请求必须拒绝”假设
失败。按用户批准的 tradeoff 分开验证同一块中的即时异常和响应完成后的迟到异常；
迟到异常立即使原 child 失效，后续不得继续使用。原错误身份/候选/超时/关闭检查不降级。
第二次失败由 CRLF 导致测试 fixture 修改未生效，修复后聚焦和完整套件通过；初次日志
均保留。一次验收启动命令使用了不存在的 PowerShell 路径，改用本机实际 pwsh 后通过。

性能只有一个完整 fixture、两次真实测量，不等于所有牌谱 p95。源取回/网络不在该基准
中，原应用五次历史平均约 1.4 s。分析仍使用原执行线程；保存阶段最长同步占用仍约
16–17 s，本次没有引入分析 worker 或按需详细分析。

## 外部证据

`E:/文档/日麻教学/coach-acceptance-evidence/analysis-performance-20261014/` 保存基准、
两次 implemented 测量、固定响应旧链及完整输出对照、全部门禁、Electron 逐包结果，
提交后完整矩阵及最终 sealed receipt。私人档案、响应记录和数据库不进入 Git。
