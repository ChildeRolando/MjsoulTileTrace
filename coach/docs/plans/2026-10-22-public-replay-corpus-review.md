# 公开牌谱爬虫重构审核

日期：2026-10-22。用户授权：审核本次重构，通过后合并到主分支。
方式：Direct Codex 本地审核；不是 Multica Reviewer、远端 CI 或独立人工评审。

初始候选 `69a1b1ce6df526a1c8de1cffe1f96a786bf09abf`，主分支基线
`f3f21b1b20d78cafcb7657379e3ac8d4ca7ed4fe`。复审结论适用于包含本报告及下述
修复的候选；最终完整 head、验收状态与合并回执绑定在 PR，不用浮动分支代替提交身份。

## 发现与修复

初始候选不通过：发现以下四项 P2。四项均有修复前失败、修复后通过的可重复测试。

| 问题 | 触发与影响 | 修复 |
|---|---|---|
| 暂停任务的失败牌谱被跳过 | `--max-records` 或限额使任务 paused，随后 `--retry-failed` 删除 failures，但旧逻辑只重置 done/failed 的游标 | 对所有有失败位置的任务回退到最早失败之前；失败记录仅在对应成员成功入库后清除 |
| 元数据失败留下半条入库结果 | Parquet int64 为 BigInt，或不可序列化元数据，JSON 编码在 games/variants 写入之后抛错 | 写入前完成元数据编码；BigInt 保存为精确十进制字符串；异常不留下无来源的 games |
| 部分续传被标为整包完成 | manifest 未提供 size，服务器返回 `bytes 100-199/300`；旧逻辑将 200 字节文件标 complete | 始终核对 Content-Range 的返回边界和完整对象长度；未完成部分保留以便下次续传 |
| 新清单错误复用旧缓存 | 同 URL 的 SHA-256 或 size 变更，旧逻辑只核对本地大小与旧下载行 | 保存已验证 checksum，缓存命中同时核对当前清单；旧缓存首次补验证，之后复用证明，不反复散列整包 |

专项测试名称：

- `retry-failed rewinds a paused job and retains evidence until the record succeeds`
- `metadata serialization precedes mutations and preserves Parquet 64-bit identifiers`
- `a partial 206 segment without manifest size cannot be marked a completed shard`
- `a completed download cannot satisfy a changed manifest checksum`

复审：上述问题已修复，当前无未解决的阻断级发现，允许按 GitHub 现有保护规则合并。
没有通过调整超时、删断言、放宽事件守恒或修改分支保护获得通过。

## 验证

- workspace build、八包 typecheck：通过。
- 完整 Vitest：237 文件、**2,893 测试通过**；既有 5 文件、22 测试跳过，98.79 秒。
- 独立 corpus 专项：**28 项通过**。
- 架构：8 包、574 文件、2,887 imports，**零违规**。
- package import smoke 与协议 updater / compatibility / fixture generator：通过。
- `npm audit --omit=dev`：零已报告生产依赖漏洞。
- 三个真实已完成分片以 **0 字节新增下载预算**复用并恢复：全部跳过已完成导入，
  downloadedBytes 增量为 0，games 仍为 **36,223**。
- `git diff --check`：通过。

本机证据：`E:/AgentData/Coach/public-replays-20261022/evidence/review-*`。
四项原始失败保留在 `review-regressions-before.log` 和 `review-cache-before.log`；
最终专项、全量、构建、类型、附加门禁、依赖检查和真实恢复分别保留独立结果。

## 范围与变更控制

本次复审修复只涉及 CLI 重试入口、采集状态、导入循环、下载恢复及专项测试。
原重构的 contracts / reasoning 变更已纳入完整回归；本次不扩展领域契约。
内容 ID 算法、规则权威、原始数据和既有用户复盘库不变。

来源到 canonical、显式 partial/unknown、版本和来源可追溯、CLI 与用户档案隔离的
不变量继续由原实施记录列出的检查保护。修复使用既有 SQLite 表、队列、游标和测试框架，
未新增全局抽象或交付机制；故障在采集边界本地化，28 项专项覆盖恢复路径。

保留的明确限制：尚未核实公开批量入口的平台不宣称支持；公开数据缺失的日期/段位和
流局事实不补猜；部分历史北风局、转换器延迟宝牌顺序和损坏牌谱会被现有 canonical
验证拒绝，原始表示可保留导出。原始真实抽样的 1,188/1,200 转换结果见实施记录，
此次未重跑完整教学分析，也不将这个 CLI 审核说成桌面产品发布验收。

合并时必须回读 base/head 未变，发布说明为 Direct Codex 验收的兼容检查，正常合并
已验收 head，并回读 merged 与主分支树。`Review Loop v2` 名称的兼容含义以
`docs/development/REVIEW_LOOP.md` 为准，不伪装成运行了 Multica 或远端 Actions。
