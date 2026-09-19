# COAC-3 privileged provider — change-control receipt

日期：2026-09-19。基线 HEAD 已核对为
`44a633da1ffff7fede80a5fb04f8681d5e7b98c9`，初始工作区干净。
冻结 issue/spec 未修改。只在本仓库执行，无委派、外部 LLM、push、PR 或 merge。
首次执行的提交被 `.git/index.lock` 写权限阻止（`git add` exit 1），该历史保留在下方。
恢复本会话时已核对实现提交为 `57cd43ce5d8ed849ab5b02c4ef06aae58d5f9b5f`，工作区
干净。本轮按 controller 提供的三个 P2 修复并重跑五门；最新结果见文末修复回执。

## Scope

实现 contracts `LlmCoachProvider` 的单一 main-process OpenAI-compatible adapter、
独立 safeStorage provider credential record、非敏感配置/status DTO、五个窄 IPC 与
实际 sandbox preload、Electron 组合根，以及单 slice 的生成接点。transport failure
最多自动重试一次；未配置和空 selection 不联网，语义/grounding 失败不重试。
复用既有 report assembly/read-back，不实现 COAC-4 工作流、后台任务、流式输出、
M7 UI、SQLite 或报告持久化。

冻结规格早期 configure/key 的笼统描述，以冻结 issue 的明确补充为准：configure
只接收 baseUrl/modelName；环境槽 `RIICHI_COACH_API_KEY` 只由 main importer 消费并删除。
key 仅在 importer/provider 短暂持有和出站 Authorization 使用；safeStorage 直接加密，
原子落盘到 userData 的独立 `coach-provider-credential.json`，不复用 session vault。
失败替换保留旧密文，但当前服务 fail closed；显式成功导入或经校验重启才恢复。
删除与替换会等待在途生成结束。session protector 文件与 32 字节 canonical-base64
契约均未修改。

## Locality

- contracts：共享 renderer DTO/通道；抽出既有 DecisionId/RecordAnalysisStatus 基础
  schema，公共形状与原有导出保持相同。`sideEffects: false` 使 preload tree shaking
  移除无关的分析/Node crypto 模块；未增加依赖或公共 subpath。
- reasoning：唯一新增生产能力是冻结 prompt builder，使用既有 canonical serializer
  与 GraphContextSlice schema，通过包根导出；不联网。
- desktop：credential service、HTTP adapter、窄生成 seam、只读 package reference
  adapter、IPC、安全 API、preload 与 electron-entry 接线；附离线测试与既有 M6-C
  canned fixture 的合法 package snapshot。
- living docs：ARCHITECTURE、ROADMAP、INVARIANTS 和本回执。

跨包调用仅使用既有包根 exports；dependency-direction table 与 renderer safe import
allow-list 零改动。最终 architecture check：6 packages / 370 files / 1559 imports /
0 violations，exit 0。

## Invariants

- INV-005（既有 machine-enforced）：新增 `provider-credentials.test.ts`、
  `coach-ipc.test.ts`、`coach-preload-bundle.test.ts` 与 provider 泄漏负例。
  两端严格解析 DTO、固定错误、无 key 参数、无 upstream prose、禁止重定向、拒绝
  不安全 URL/弱 Linux backend；检测明文和 JSON 转义的 key/prompt 反射。
- INV-001（partial）、INV-006、INV-007、INV-011：复用 package/graph/slice/grounding/
  report validators；新 `coach-provider.test.ts` 覆盖请求、完整报告、degrade、一次
  retry、语义不重试与 hash-only audit。diagnostics 不输出被拒绝模型的任意 prose。
- INV-003/009 的依赖方向门通过；不修改 selector、D1 allow-list 或 session 加密语义。

没有新增、放宽或删除不变量，也不因本次实现升级不变量等级。首次执行的测试被环境
阻止；恢复会话后实际完成全量运行，结果见文末，历史失败不删除。

## Traceability

证据仍来自 StructuredAnalysisPackage。package reference 读回必须验证包并核对
packageId；真实 selector 拥有 selection，slice builder 拥有传输 allow-list。provider
只给冻结端口结果，report 沿用 generation versions、身份重算、input/output hash 与
实际 transportRetries。凭据记录只含 schemaVersion/providerId/ciphertext，不是分析
证据，也不进入 audit、report、SQLite 或日志。

## Replaceability

HTTP、safeStorage、main-only importer、package reader 与时钟可在主进程注入。
reasoning 只消费 contracts，不依赖具体网络实现；替换 provider 不需要改变 renderer
或证据包。没有增加 workspace dependency。

## Recoverability

凭据故障首先应被 custody/fault-injection 测试捕获，IPC 泄漏由两端 DTO 和沙箱
bundle 测试捕获，transport/semantic 混淆由请求次数与 report 状态断言捕获。使用
stubbed HTTP 和严格 package fixture，可完全离线复现。旧密文在失败原子替换后
保持完整；临时文件只写密文并清理。生成失败不改变分析包。

## Semantic Load

独立 provider credential service 是唯一新的保管边界：防止 API key 被误当作固定
32 字节 session key，隔离 arbitrary HTTP credential 的 OS 加密与原子文件生命周期。
session protector/vault 不是正确所有者，它们拥有 canonical-base64 与账号会话语义；
将本职责塞入它们会放宽会话安全契约或混存 provider/账号凭据。其实现仍在 desktop，
不新增 package、第二 provider port 或新的核心分析真相。其余是既有 DTO、IPC、slice
与 report assembly 的窄扩展。

## Verification（首次受限执行的历史记录）

以下命令均从 `coach` 原样调用，首次受限执行的结果如下：

| 原样门禁 | 结果 | Exit code | 证据/限制 |
|---|---|---:|---|
| `npm run typecheck` | PASS | 0 | 全 workspace 类型检查 |
| `npm run build` | ENVIRONMENT_BLOCKED | 1 | TypeScript 编译结束，esbuild preload 子进程 `spawn EPERM` |
| `npx vitest run` | ENVIRONMENT_BLOCKED | 1 | Tinypool worker `spawn EPERM`；no tests executed |
| `npm run check:architecture` | PASS | 0 | 0 violations；规则表未改 |
| `npm run test:package-import` | ENVIRONMENT_BLOCKED | 1 | 内置 build 在相同 esbuild `spawn EPERM` 处失败，未进入 smoke |

原样命令执行历史（按各命令的时间顺序记录 exit code）：typecheck `1, 1, 0, 0, 0`
（前两次分别发现 request 参数与测试 mock 类型错误，已修复）；build `1, 1`；全量
vitest `1, 1`；architecture `0, 0, 0`；package-import `1`。所有 build/vitest/package-import
非零结果均为上述环境限制。初始 focused RED 尝试及 threads 辅助尝试也各 exit 1，
分别因 Tinypool 和 Vite Windows realpath 的 `spawn EPERM`，未宣称完成 RED/GREEN。

补充验证（不替代任何门禁）：直接运行已编译生产模块的 Node assertions，exit 0，
覆盖 safeStorage stub 的导入/重启/替换/删除、原子失败保留旧密文、真实 selector →
provider → grounding/report、transport retry/degrade、IPC/preload。直接调用现有
esbuild executable 的诊断打包 exit 0，VM 只提供 electron 模块即可加载 bundle；
不含 Node crypto 外部依赖。全部 HTTP 为 stub，没有调用真实 LLM。`git diff --check`
exit 0。构建产物与诊断产物不提交。
最终生产构建产物的转义 key/full-prompt 反射拦截及超时 abort 辅助 assertions 也为
exit 0。精确暂存指定代码/测试/living-doc 文件的 `git add` 为 exit 1，故没有可提交
的 index，也没有执行一个注定无法写对象/ref 的 commit。

## Remaining limitations

首次的三项门禁及 Git 写权限阻塞已在恢复会话后解除，重跑结果见下方。真实 Electron
OS backend/桌面交互仍未做人类验收；门禁通过不替代 controller 的复核决定。

当前非敏感 settings 保留在 main 内存，重启需重新配置；独立凭据可从密文恢复。
生产 reader 从 `userData/analysis-packages/<sha256(packageId)>.json` 读取已有合法包，
不存在时返回 `package_unavailable`。上游包的产品发现/写入、完整生成工作流和报告
UI/持久化由 COAC-4/M7 承接。本次没有把空 resolver、原始牌谱或 fixture 接成生产包。
任何后续 reviewer P1/P2 由同一 executor session 修复、重跑五门并提交；本次未运行
独立 reviewer，也不以自行检查宣称接受。

## Reviewer 修复回执（同一 executor session，2026-09-19）

**Scope / Locality**：处理 `44a633d..57cd43c` 审查中的全部三个 P2。只修改 desktop
provider/窄生成 seam、reasoning prompt 及其回归测试和 living docs。冻结 spec/issue、
provider/request/result/report 契约、session protector、依赖表和 renderer allow-list
均未改变，无新依赖。

1. **P2 usage metadata**：在解引用前校验 optional usage 的对象形状；null、primitive、
   array 或非法 token 数值只使 usage 缺省，保留合法 content，不触发 transport retry。
   回归覆盖 8 种缺失/畸形 metadata，断言 complete、单次 HTTP、零重试。
2. **P2 reflected-output audit hash**：在丢弃内容前计算原始字符串的 SHA-256。
   main-only WeakMap 将 hash 绑定到本次安全结果对象；严格解析之后生成 seam 将该
   hash 写入既有 audit.outputHash，再通过 report validator。map 不保留原文，DTO
   仍只有冻结字段；不把 hash 放进模型可控制的字段，不用跨请求共享的 last-result
   状态。明文/转义 key 与完整 prompt 反射继续 invalid_output、不重试、无 overlay。
   测试独立计算预期 hash，并覆盖并发拒绝与后续正常完成之间的隔离。
3. **P2 frozen prompt**：补齐 v1 规格要求的 zh-CN、Mortal/Akagi 内部原因不可知
   （modelReason 恒 unknown）、引用复制、advisory 值/来源不篡改及事实/候选数值
   不补全指令。这是纠正未通过验收的 v1 实现遗漏，保持冻结版本字面量和规格不变。
   新 `coach-prompt.test.ts` 用独立的预期全文与 canonical slice JSON 锁定字节，
   不靠 builder 自比较作为 golden。

**Invariants / Traceability**：INV-005 保持秘密不跨 IPC；INV-006 不把畸形 metadata
误作网络故障；INV-007 恢复原始 outputHash 的审计含义。INV-001/011 的 grounding
与身份验证原样复用。没有放宽检查或降低不变量级别。

**Replaceability / Semantic Load**：冻结 LlmCoachProvider 端口不扩展；新增的私有
hash 关联是 desktop redaction 的实现细节。它避免安全替代文本污染 audit 并隔离每次
completion 的生命周期；端口 DTO 无此元数据字段，扩展它会违反冻结形状，单个全局
last-hash 会串扰并发调用。reasoning 与 renderer 不依赖该关联或具体 provider。

**Recoverability / Verification**：先运行新增定向测试，exit 1，按预期复现上述缺陷
（8 failed / 20 passed）；实现后同一测试集合 exit 0（29 passed）。随后从 `coach`
运行全部五项原样门禁，各一次，结果如下：

| 原样门禁 | 本轮结果 | Exit code | 证据 |
|---|---|---:|---|
| `npm run typecheck` | PASS | 0 | 全 workspace |
| `npm run build` | PASS | 0 | 含实际 sandbox preload bundle |
| `npx vitest run` | PASS | 0 | 161 files / 1,851 tests |
| `npm run check:architecture` | PASS | 0 | 6 packages / 372 files / 1,566 imports / 0 violations |
| `npm run test:package-import` | PASS | 0 | 内置完整 build 与 emitted-JS smoke 均通过 |

本轮无新的环境失败。保留 controller 提供的先前审查记录：第一次全量 Vitest 的
`protocol-bundle.test.ts:239` 因 5000ms 超时被标记 ENVIRONMENT_BLOCKED（exit 1）；
未改代码的全量重跑 PASS（160 files / 1,841 tests，exit 0）。这是 reviewer 提供的
历史证据，与本轮 executor 的一次全量 PASS 分别记录。

所有 HTTP 继续使用 stub，无真实 LLM 调用，无独立 reviewer。本轮三个 P2 已有对应
实现和回归证据，最终接受与否仍由实验 controller 复核；COAC-4/M7 和真实桌面验收
限制保持前述范围。
