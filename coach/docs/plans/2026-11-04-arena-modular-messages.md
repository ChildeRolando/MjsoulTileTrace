# Arena 模块与直接提交：实施、验证与变更控制

COAC-271 的设计与验收 owner 是 [Arena spec 修订](../specs/2026-10-09-blind-discard-arena.md#coac-271模块输入与直接提交修订2026-11-04)，不以工单正文或旧 A/B/C/D 名称作为实验配置。

Scope：在现有 Arena 中增加原始白名单、可冻结模块、tile/red 提交、请求正文审计和直接批次中断恢复。没有增加模型调用通道或认证方式。旧工具路径和生产默认行为保留。

Locality：contracts 拥有实验依赖及锁定提交；desktop 的既有 provider／runner／archive／scorer 拥有执行、请求证据、恢复及评分；bin 只组装现有 MCP／RAG 和批次生命周期；现有 console 只显示当次归档。新增 `blind-discard-arena-experiment.ts` 归属同一 Arena 边界，隔离原始投影与可选输入，不建新包。

Invariants：INV-013 的输入白名单／标签隔离与现有 physical equivalence 保持。INV-011/012 的生产生成／保存 seam 不变。配置依赖、没有二次问答、赤五映射、原始字段、资料差异、请求上限和恢复通过 `blind-discard-arena-experiment.test.ts` 固化；旧 runner、provider、archive 和 production suites 继续回归。

Traceability：可见资料只来自原始观察、libriichi 候选、现有 helper MCP 与版本化 local retriever；没有新增判断权威。模块版本／实际内容／路由 digest／应用请求／实际正文 digest 可追溯同一 run。请求审计不保存认证头。Mortal 评分保持在模型边界外。

Replaceability：仍通过已有 Arena provider port；直接最终答复是同一 port 的新增结果，HTTP 与 CLI 都不改变认证 owner。CLI 本地隔离已有当前适配器捕获；真实通道请求边界未知时整批预检拒绝，不替换供应商。

Recoverability：原始投影、配置或提交错误先由 focused regression 失败；日志失败先于发送。恢复只处理已有事件与未请求项，无法确认的在途结果不会重复付费。日志与 manifest 损坏失败关闭。

Semantic Load：没有新架构层。组装职责折入现有 Arena。`request_prepared` 区分应用实际输入与适配器正文，防止把预览当最终 wire；`request_audit` 在同一事件档案保存实际正文或明确不可观测限制，避免建立另一套存储／控制台。

提供方限制：本机 CLI 是 0.162.1；旧适配器的生产验证声明仍为 0.155.1，本票不修改生产认证／模型或冒充重新验证。Codex 实验干净 home 与三项客户端 catalog 工具设置在当前 adapter 中实现。真实认证／内置重试次数尚未验证，生产批次在派发前拒绝。相关设置的官方说明见 [OpenAI 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)；是否隔离以实际捕获为准，配置名称不是证据。

## 实际验证

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 全 workspace 通过；最终 desktop 修改亦经单独 tsc 复核 |
| `npm run test:package-import` | build 及 2 项通过；新增实验 public export 又以 `node --test smoke/package-import-smoke.mjs` 复核通过 |
| `npm run check:architecture` | 8 packages、616 files、3165 imports，0 violations |
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
| 原始最终输入无候选 enum／派生字段／教材／工具／额外解释／历史；可见场面完整且标签隔离 | HTTP 合成本地 E2E 通过；当前 Codex adapter + 真实 CLI 0.162.1 本地 wire 捕获通过，无工具／环境／技能污染；真实通道边界仍预检阻断 |
| 模块开关与依赖；固定选材不暗变；路由实际内容变化可见 | 通过；回执分别记录 material_changed／no_material_change，固定对照只作审计 |
| tile/red、赤五、既有摸切／手切规范等价、非法／空／损坏 JSON、无二次问答及中断恢复 | 通过；未知在途保守记失败，已有答案不丢失，请求意图消耗上限且不会重发 |
| 旧工具、旧归档、生产默认回归；升级 spec、样例、版本与原页面入口 | 相关回归／构建／架构／浏览器通过；完整 Vitest 命令存在上面列明的两个既有 runner 不兼容文件 |
| 工程改造及零真实研究调用边界 | 未启动付费 200 题或历史重跑、未切教材库、未以 Mortal／蒸馏策略辅助作答；未作独立 PASS |

## 执行期间整合补充的落实

在交付前回读到维护者 2026-11-04 08:33:56Z 的整合补充后，原 PR 继续修订：

- 二值场景／写死查询已移出生产实现，测试中明确标为 fixture。实际模式与选材使用带 sourceId、version、inputDigest 的注入端口；helper 依赖声明不满足即拒绝。未接源的控制台组合在整批前拒绝，不能伪称实现了现有模式。
- `runBlindCoachCase.prepareModules` 消费实际源输出；main-owned `runCommand(options, moduleSources)` 分别通过 scenario／selection 端口注入现有实现；固定 selection 只接 raw，不能读可见提示开关、模式输出或 helper。既有 local retriever 消费实际输出的 query／fixedQuery。固定资料不由可见模式提示改变，对照资料只作审计。
- provider_final 保存最终回答原文及解析状态，非法／空／损坏 JSON 也保留；没有自动重问或择优替换。
- 当前 Arena Codex adapter 的实验 clean-home 分支已执行真实 CLI 零生成捕获，污染源中的 AGENTS／config／skill 哨兵均未进入请求；只临时复制虚拟 ChatGPT 认证，真实认证没有被读取。catalog 源／override 字节摘要、客户端 flags、CLI 与 catalog 版本绑定，除 Terra 三项客户端工具配置外保留全部元数据。
- 内置 openai provider 的物理请求重试仍 unknown；不采用不等价的 OpenAI alias，也不新增 Responses 通道或转发器。生产批次预检拒绝、派发 0 题；不能把 CLI 进程数当物理请求数或将 200 个未请求项计为生成失败。

补充后的最终相关回归为 **229 通过、4 跳过**（3 个外部 CLI capture 和 1 个 opt-in native）；随后显式设置
COACH_ARENA_ISOLATION_CLI／COACH_ARENA_CATALOG，执行 `npx vitest run
packages/desktop/tests/codex-arena-isolation.test.ts --maxWorkers=1 --no-file-parallelism`，
**5 项通过**：包括真实本机 CLI 的 success／503／流中断三种 loopback 捕获，各恰好 1 POST。
这些零重试设置仅属于模拟 provider，不能迁移为内置通道的计数证明。

真实认证链、服务端接受性、真实通道物理请求边界和供应商私有背景仍未核实，因此 Terra High
真基线仍不能启动。工程提供本地可核查实现与拒绝边界，待独立评审；不宣称研究目标已完成，
不把本地自验或排队写成独立 PASS。

最终收口复核：runner／原始模块 48 项通过，CLI／console／请求边界 66 项通过；外部源包后续变异不改变已冻结模块，实际请求字节 SHA-256 在 loopback 接收端直接计算。

## PR #78 独立评审 R1／R2 修复

本轮只处理两项 P2。R1 在 provider_final 已 flush、锁定事件尚未写入时，用冻结观察与
配置重新校验原始 tile/red，补齐锁定／拒绝和 terminal；空答、损坏 JSON、非法牌保持
invalid_submission，已有 terminal 优先，已报告用量保留，不重新请求模型。原先模拟
“没有回答”的用例改为真实请求前缀，避免删掉 provider_turn 却仍留下最终回答。

R2 在结束原因与协议校验前提取 usage，失败结果可选 finalResponse 仅保留有界可见
content／refusal 与 finishReason；runner 归档带 failureCode 的 invalid provider_final。
length 即使带完整合法 JSON 也保持 provider_error，恢复亦不将它改成成功。旧工具分支
继续丢弃非工具 prose／隐藏推理；新事件字段均可选，旧档案可读。

回归 owner 为既有 `blind-discard-arena-experiment.test.ts` 与
`arena-tool-call-provider.test.ts`。先运行 experiment：旧实现 **7 failed／20 passed**，
分别命中恢复错误和已报告用量丢失；修复后两个 suite **39 passed**。最终相关命令：

```text
npx --no-install vitest run packages/desktop/tests/blind-discard-arena packages/desktop/tests/arena-tool-call-provider.test.ts packages/desktop/tests/codex-coach-provider.test.ts packages/desktop/tests/coach-provider.test.ts packages/desktop/tests/codex-arena-isolation.test.ts scripts/arena- --maxWorkers=1 --no-file-parallelism
```

结果 **241 passed／4 skipped**，包含旧工具、归档、生产 provider 与控制台。3 个外部 CLI
捕获和 1 个 native 用例保持 opt-in，本轮未重复显式真实 CLI 捕获。`npm run build`、
`npm run typecheck`、`npm run check:architecture`（8 packages／616 files／3166 imports／
0 violations）、`node --test smoke/package-import-smoke.mjs`（2 项）及 `git diff --check`
通过。首次 typecheck 指出新增参数化夹具将数组展开为参数，改成对象行后 provider 12 项
复测及完整 typecheck 均通过。
全部请求均为本地／
合成，真实模型调用 0；真实认证与服务端／物理重试边界仍未知，Terra 真实批次继续预检
拒绝。此处为作者自验；修复 head 仍须登记 Multica 独立复审。
