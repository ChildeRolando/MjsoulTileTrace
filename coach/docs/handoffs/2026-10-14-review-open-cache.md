# 2026-10-14 本地整盘复盘秒开

## 已完成

用户批准修改 M7-B 的本地信任策略。普通重开直接读取已验证的版本化展示缓存，不解压/
hash/验证原包、不构图、不自动后台审计。缓存覆盖概览、全部入选详情和 main-only 的
舍牌损失输入；原分析包、报告和图的生成链完整保留。应用保存/激活时更新缓存，
revision/版本失效或缺失时重建，删除级联。历史用量身份不再重复读取大包。

实施分支 `codex/review-open-cache`，最终集成基线 `d1d6968`，包含已提交的新皮肤及精确
舍牌标记。原 `workspace-ui` 工作树与原验收入口未被此次重构修改。新本地独立入口
保存在 `coach-acceptance-evidence/review-open-20261014/`，版本由入口中的完整 SHA 固定。

## 测量

同一份 353 MB 档案、独立新进程、生产 worker/service/SQLite：固定旧基线 `9fcdb74`
打开＋首个详情为 30,749.61 ms，纯性能改造为 127.62 ms。概览、10 个详情及真实 helper
舍牌损失的完整 JSON SHA-256 一致。初次使用原开发目录测量时发现另一个任务正在修改
展示字段，因此另建固定 SHA 基线；该差异不是缓存丢失，不能混用两版字段做回归结论。

集成 `d1d6968` 后重新准备缓存并复测 7 份真实档案：

| 范围 | 实测 |
| --- | --- |
| 新 worker 打开概览 | 55.5–70.6 ms |
| 概览＋首个详情/舍牌损失 | 59.6–158.2 ms |
| 连 worker 启动计入 | 264.1–357.8 ms |
| Electron 列表点击至牌桌/详情 DOM 与布局就绪 | 111.4–247.0 ms |
| 7 份展示缓存 payload 合计 | 15,311,149 UTF-8 字节（约 15.3 MB） |
| 旧库存档一次准备 | 约 140.3 s 的包内准备时间；每包 14–25.4 s |
| 有效缓存重复准备 | 每包 31–40 ms |

Electron 43.3.0 / Node 24.18.1，7 个独立隐藏窗口进程、实际生产 main/preload/renderer，
网络请求为零。窗口隐藏，指标是 DOM/布局就绪而非屏幕物理绘制；未清空 OS 文件缓存，
不声称物理冷磁盘或真人验收。新界面的最大包输出与其原先已捕获的展示输出摘要一致。

真实用户库已先做 SQLite 在线备份，再准备全部 7 个缓存；分析包、分块、报告、session、
active ref 和 decision 映射表前后逐字节内容指纹一致。证据位于本机
`E:/文档/日麻教学/coach-acceptance-evidence/performance-20261014/`：
`live-cache-receipt.json`、`integrated-worker-*.json`、`integrated-electron-open-*.json`。
这些档案和玩家数据未纳入 Git。

## 验证

- typecheck、build、全量 Vitest：213 files / 2676 tests PASS（并发 2）。
- Electron MVP Golden：account failure、account、share、evidence-only、single-action 与离线重启 PASS。
- Electron persistence：真实原谱链、kill recovery、A→B→A、complete/partial/evidence、migration PASS。
- package-import：2 tests PASS；架构检查 0 violations；Node 工具脚本回归 36 tests PASS。
- 缓存 focused 回归覆盖零原包读取、与原 presenter 逐字段一致、缺失/版本/畸形缓存重建、
  report 刷新/删除、重启后生成按需加载一次、历史用量不扫描原包。

保留首次失败：默认并发全量中 4 个 Electron UI 用例超时，单独复跑 51 tests PASS，
限制并发后的全量通过，未提高超时或弱化断言。旧 persistence fixture 未预期已上线的
`discardLoss: unavailable/legal_actions_missing`，在独立原基线同样失败；补齐该精确预期，
仍做完整 DTO 相等断言。准备 CLI 初放根 scripts 触及包内深导入检查，已移到 desktop
自有 scripts，未增加架构豁免。

## 维护与边界

旧库预备命令：`npm run prepare:review-cache -- <review-library目录>`（先 build）。
验证规则或展示/舍牌计算输入语义改变时更新 `REVIEW_PRESENTATION_VERSION`；普通发布
不自动失效所有缓存。派生表可删可重建，不改变原库格式版本，旧代码可忽略它们。

LLM 问答工具尚未接入；原始数据全部保留。现有舍牌工具按局面级输入计算，现有解说
在需要时加载完整上下文并复用。没有每次打开后的整包预载。未来重工具应独立于展示
worker、按需且单次共享加载，绑定版本与取消；当前首次生成的同步上下文准备仍会延迟
同 worker 后续请求，不宣称完全无感知。本次不缩短原始“分析牌谱”引擎的数分钟计算。

变更控制的 Scope/Locality/Invariants/Traceability/Replaceability/Recoverability/
Semantic Load 见 [实施计划](../plans/2026-10-14-review-presentation-cache.md)。
