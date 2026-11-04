# Arena 模块与直接提交：实施、验证与变更控制

COAC-271 的设计与验收 owner 是 [Arena spec 修订](../specs/2026-10-09-blind-discard-arena.md#coac-271模块输入与直接提交修订2026-11-04)，不以工单正文或旧 A/B/C/D 名称作为实验配置。

Scope：在现有 Arena 中增加原始白名单、可冻结模块、tile/red 提交、请求正文审计和直接批次中断恢复。没有增加模型调用通道或认证方式。旧工具路径和生产默认行为保留。

Locality：contracts 拥有实验依赖及锁定提交；desktop 的既有 provider／runner／archive／scorer 拥有执行、请求证据、恢复及评分；bin 只组装现有 MCP／RAG 和批次生命周期；现有 console 只显示当次归档。新增 `blind-discard-arena-experiment.ts` 归属同一 Arena 边界，隔离原始投影与可选输入，不建新包。

Invariants：INV-013 的输入白名单／标签隔离与现有 physical equivalence 保持。INV-011/012 的生产生成／保存 seam 不变。配置依赖、没有二次问答、赤五映射、原始字段、资料差异、请求上限和恢复通过 `blind-discard-arena-experiment.test.ts` 固化；旧 runner、provider、archive 和 production suites 继续回归。

Traceability：可见资料只来自原始观察、libriichi 候选、现有 helper MCP 与版本化 local retriever；没有新增判断权威。模块版本／实际内容／路由 digest／应用请求／实际正文 digest 可追溯同一 run。请求审计不保存认证头。Mortal 评分保持在模型边界外。

Replaceability：仍通过已有 Arena provider port；直接最终答复是同一 port 的新增结果，HTTP 与 CLI 都不改变认证 owner。CLI 无法隔离时明确拒绝，不替换供应商。

Recoverability：原始投影、配置或提交错误先由 focused regression 失败；日志失败先于发送。恢复只处理已有事件与未请求项，无法确认的在途结果不会重复付费。日志与 manifest 损坏失败关闭。

Semantic Load：没有新架构层。组装职责折入现有 Arena。`request_prepared` 区分应用实际输入与适配器正文，防止把预览当最终 wire；`request_audit` 在同一事件档案保存实际正文或明确不可观测限制，避免建立另一套存储／控制台。

提供方限制：本机 CLI 是 0.162.1；旧适配器的生产验证声明仍为 0.155.1，本票不修改生产认证／模型或冒充重新验证。Codex 模块请求目前在 spawn 前被拒绝。相关设置的官方说明见 [OpenAI 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)；是否隔离以实际捕获为准，配置名称不是证据。

## 实际验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 全 workspace 通过；最终 desktop 修改亦经单独 tsc 复核 |
| `npm run test:package-import` | build 及 2 项通过；新增实验 public export 又以 `node --test smoke/package-import-smoke.mjs` 复核通过 |
| `npm run check:architecture` | 8 packages、614 files、3148 imports，0 violations |
| `npx vitest run packages/desktop/tests/blind-discard-arena packages/desktop/tests/arena-tool-call-provider.test.ts packages/desktop/tests/codex-coach-provider.test.ts packages/desktop/tests/coach-provider.test.ts scripts/arena- --maxWorkers=1 --no-file-parallelism` | 222 通过、1 个 opt-in native case 跳过；旧 MCP、RAG、scorer、archive、工具流程与生产 provider 覆盖在内 |
| `npx vitest run packages/desktop/tests/arena-tool-call-provider.test.ts packages/desktop/tests/blind-discard-arena-experiment.test.ts --maxWorkers=1 --no-file-parallelism` | 最后补充的 envelope 严格拒绝回归后 26 通过（19 原始／模块用例、7 provider 用例） |
| `npm run test:mahjong-soul-protocol-updater` / `test:mahjong-soul-protocol-compatibility` / `test:generate-mahjong-soul-real-fixtures` | 分别 26／4／6 通过 |
| `node --test scripts/tile-annotations/annotations.test.mjs scripts/tile-annotations/build-queue.test.mjs` | 6 通过，两个原有 Node 测试文件使用原生 runner 独立验证 |
| `node scripts/arena-modular-browser-check.mjs` | 配置保存／重载、schema、案例实际模块与请求可展开；1440／800／390 无横向溢出或页面异常；截图已目视检查 |
| `git diff --check` | 通过 |

全量命令的限制需保留：首轮 `npm test -- --maxWorkers=1` 实际没有限制 Vitest worker，出现
Electron 初次下载的 EBUSY／资源争用超时。随后 `npx vitest run --maxWorkers=1
--no-file-parallelism --reporter=json --outputFile=reports/coac271-tests.json` 得到 **3038 通过、
0 测试断言失败、23 跳过**，但命令仍退出 1：两个未修改的 tile-annotations Node 文件被
Vitest 报 “No test suite found”。它们以上述 Node 命令 6 项全部通过。本票不改写这些无关
测试或放宽断言，不把全量命令说成绿色。最终相关修改由表中的聚焦命令复核。

浏览器脚本使用已有 Playwright 安装（`COACH_PLAYWRIGHT_MODULE`）和已有 Chromium 路径
（`COACH_BROWSER`），不下载新依赖；先运行原始模块用例并设 `RIICHI_ARENA_CAPTURE` 可重建
本地 capture。设计检测器的字体／原有标题层级／容器推断提示已核对；保留既有界面视觉，
新增配置区有实际内边距和完整标签。截图不代表真实模型或 Mortal 验收。

## 可复核证据与验收对照

- [最终 HTTP 正文与同正文审计](../development/evidence/coac-271/raw-final-request.json)：全局 34 牌编码，只有 tile/red；仅 loopback 的合成响应，真实模型调用 0。不是独立调用通道的实现。
- [CLI 已知隔离问题摘要](../development/evidence/coac-271/codex-isolation-summary.json)：源文件 SHA-256、CLI 0.162.1、五个仍暴露的 builtin 工具；来自工单提供的历史零生成捕获，未冒充本次重跑。当前代码的阻断行为另由 focused test 验证。
- 页面：`/settings` 填 raw 或严格模块 JSON；`/model-info` 预览；`/results?run=<id>` → “模型与工具过程”查看当次冻结模块、路由内容差异、应用请求、实际正文、工具／输出约束与版本。旧档案仍能读，不用当前模板重建它。

| 验收 | 作者验证结果 |
|---|---|
| 原始最终输入无候选 enum／派生字段／教材／工具／额外解释／历史；可见场面完整且标签隔离 | HTTP 合成本地 E2E 通过；Codex CLI 无法提供该保证，明确阻断而不发送污染请求 |
| 模块开关与依赖；固定选材不暗变；路由实际内容变化可见 | 通过；回执分别记录 material_changed／no_material_change，固定对照只作审计 |
| tile/red、赤五、既有摸切／手切规范等价、非法／空／损坏 JSON、无二次问答及中断恢复 | 通过；未知在途保守记失败，已有答案不丢失，请求意图消耗上限且不会重发 |
| 旧工具、旧归档、生产默认回归；升级 spec、样例、版本与原页面入口 | 相关回归／构建／架构／浏览器通过；完整 Vitest 命令存在上面列明的两个既有 runner 不兼容文件 |
| 工程改造及零真实研究调用边界 | 未启动付费 200 题或历史重跑、未切教材库、未以 Mortal／蒸馏策略辅助作答；未作独立 PASS |

Codex 原始模块请求仍不可用，Terra High 真基线不能据此启动。其恢复需要现有 CLI 提供可验证
的输入／工具隔离能力，再在同一 Arena 适配器中以零真实调用捕获复验；本票没有替换实现。
编码交付状态为已实现并自验、待独立评审，不能把排队或本地自验写成独立 PASS。
