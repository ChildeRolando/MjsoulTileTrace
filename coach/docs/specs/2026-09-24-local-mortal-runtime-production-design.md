# Local Mortal Runtime 生产规格

日期：2026-09-24
状态：**IMPLEMENTED；COAC-111 production spike 已于 2026-09-24 验证**
决策来源：COAC-106 产品 owner 裁决；规格落盘：COAC-110；后继实现：COAC-111

## 1. 当前权威与 supersession

Playable Review MVP 的生产模型评价来源冻结为 managed local Mortal runtime 与
`Yuchen1457/mortal-582500` checkpoint，不等待 Akagi，也不要求用户先取得 remote
Mortal result URL。原 M6-B 的 “Akagi Native” 名称从现在起按其能力本质解释为
**native model runtime capability**；首个且当前唯一批准的实现是 local Mortal。

历史 Akagi 设计保留用于时间语义，不代表当前实现目标。Mortal result URL →
`@riichi-coach/mortal-source` 的既有路径也保留，作为 regression、cross-validation、
diagnostic 与未来备用来源；它不再是 manual-import MVP 的产品前置。两条来源必须在
既有 structured comparison / `ModelEvaluation` contract 合流，不得形成两条 downstream
analysis pipeline。

本规格拥有 local Mortal 的 runtime ownership、协议、身份、候选守恒、失败语义与
Production Spike 验收。M6-A4 继续拥有 self-turn/response-window 绑定和守恒语义；M6-C
继续拥有 `StructuredAnalysisPackage`、provenance 与 validator；Integration Closeout
继续拥有 source-to-session/UI 组合。若发生冲突，以更窄的现有 owner 为准，本规格不得
复制或放宽其契约。

## 2. 固定身份与供应链门

首个 implementation slice 只能使用下表身份；不得以可变文件名、默认路径或 silent
fallback 选择其他 runtime/checkpoint：

| 组件 | 冻结身份 |
|---|---|
| Runtime upstream | `Equim-chan/Mortal` |
| Runtime source revision | `0cff2b52982be5b1163aa9a62fb01f03ce91e0d2` |
| Runtime family | Mortal V4, four-player, CPU correctness baseline |
| Inference policy | CPU, eval/inference mode, greedy action, legal-mask softmax temperature `1.0`, no stochastic sampling/AMP |
| Checkpoint repository | `Yuchen1457/mortal-582500` |
| Checkpoint repository revision | `7386c9f5c751a3ea75efea99737cef5a5ef950f1` |
| Checkpoint file | `mortal_582500.pth` |
| Checkpoint SHA-256 | `738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20` |
| Checkpoint model identity | `mortal-hpc`, Mortal V4, 582500 steps, four-player |
| Geometry | observation `[1012, 34]`, legal action space `46`, output width `47` |
| Upstream runtime compatibility digest | `0afff5c64f0459408efc7dc7c512a615432c37f1b2017aeab9f0bea63b347fac` |
| Runtime protocol | `riichi-local-mortal-jsonl/v1` |
| TypeScript adapter | `local-mortal-adapter/v1` |

Provenance pointers: runtime source `https://github.com/Equim-chan/Mortal`；checkpoint model
card/manifest `https://huggingface.co/Yuchen1457/mortal-582500`。revision 与 SHA 是 authority，
网页 `main`/文件名不是；准备命令必须按 revision 取件并验证内容。

`runtime compatibility digest` 是 checkpoint 发布者 manifest 的上游声明，不冒充本项目
实际构建的 runtime artifact hash。COAC-111 必须新增并提交严格
`managed-mortal-runtime-manifest/v1`，逐平台记录 runtime source revision、build/runtime
version、artifact SHA-256、protocol version、adapter version、checkpoint repository
revision、checkpoint SHA-256 与 geometry。真实 spike 在启动 subprocess 前重算 runtime
artifact 和 checkpoint SHA-256；缺字段、不相等、文件被替换或 manifest 未知字段均
fail closed。任何实际 runtime artifact 尚未产出前，不得声称其 SHA 已验证。

模型卡将 checkpoint 标为 AGPL-3.0，并声明基于 Mortal V4；上游 Mortal 代码为
AGPL-3.0-or-later。上述是 provenance 记录，不是项目对再分发权的法律结论。checkpoint、
runtime 和其大文件均不得提交进仓库或普通安装包。开发 spike 可由显式准备命令下载到
gitignored app-managed artifact 目录，但 M8 打包前必须单独核验：model card 与来源、
runtime/checkpoint license、再分发权、attribution/notice、源码提供义务及目标分发方式。
若不可随安装包再分发，M8 必须使用合规的 app-managed download；这不阻塞开发 spike。

## 3. Ownership 与依赖方向

批准新增一个窄 workspace owner：`@riichi-coach/mortal-runtime`
（`packages/mortal-runtime/`）。它隔离的是“受管 subprocess/checkpoint 生命周期”这一独立
变化轴，不是通用麻将模型 provider framework。

```text
Electron main composition root
  → @riichi-coach/mortal-runtime
      → managed local subprocess + pinned checkpoint
      → strict contracts-owned protocol result
  → @riichi-coach/reasoning adapter
      → existing structured comparison / buildMortalModelEvaluation
      → existing deterministic analysis
      → StructuredAnalysisPackage
```

- contracts 拥有 strict request/result/error/identity schema；runtime 只依赖 contracts；
- reasoning 不依赖 runtime 包，不启动进程，只消费 contracts-owned result 并拥有 action
  normalization、candidate binding、score normalization、detail policy 与
  `ModelEvaluation` construction；
- desktop main 是唯一进程生命周期组合根；renderer/preload 只接收既有安全 review DTO；
- `@riichi-coach/mortal-source` 继续只拥有 remote report schema/fetch/import，不得增加
  subprocess、checkpoint 或 runtime dependency；
- `mahjong-facts` 保持独立 deterministic fact authority。Mortal runtime 只产生 model
  evidence，两个 sidecar 不共享协议、manifest、错误或进程 owner。

### 抽象准入

该新 owner 防止 privileged subprocess/checkpoint 能力污染 reasoning 与 remote report
parser；它隔离 runtime/checkpoint 更新这一独立变化轴。最近的 `mortal-source` owner 只因
“无 privileged runtime”才获准被 reasoning 依赖，不能承载该职责；合并会迫使 reasoning
传递依赖进程与模型文件能力，并破坏 ADR-0005。故独立 runtime package 通过抽象准入。
除此之外不新增 provider registry、模型市场或通用 runtime framework。

## 4. Authority 与输入边界

Mortal 是 model evidence source，不是 hard-fact source：

```text
Mortal runtime → candidate raw values / scores / preferences → ModelEvaluation
```

它不得产生或改写 `KnownGameFacts`、`CandidateFactorLedger`、`FactorDifference`、
`DeterministicPreference` 或 canonical/replay identity。删除全部 Mortal scores 后，事实
账本和差异必须逐字节保持不变；`modelReason` 恒为 `unknown`。raw tensor、activation、
guessed explanation、debug dump 与任意 stdout/stderr prose 不得进入 contracts、package、
ReviewReport、renderer、LLM、日志或错误正文。

runtime 的唯一 game input 来自 contracts-owned canonical/replay projection：

```text
Mahjong Soul source → CanonicalEventStreamV2 → replay/windows
→ LocalMortalInferenceRequest → runtime
```

runtime 不得导入或解析雀魂 protobuf、Liqi frame、account payload、token、record URL/raw
bytes，也不得依赖 `mahjong-soul-source` / `tenhou-source`。需要 MJAI 时，由 runtime adapter
从 canonical events、self actor、窗口 identity 与本地合法候选做窄投影；不得从原来源重建
第二套牌局真相。

renderer/preload 不得启动/停止 subprocess、知道 runtime/checkpoint 路径、读取模型文件、
接收 raw stdout/stderr，或获得任意通用命令执行能力。

## 5. Strict protocol 与 fail-closed 语义

`riichi-local-mortal-jsonl/v1` 每条 request/response 都是单行、size-bounded、strict JSON。
request 至少绑定：protocol/runtime/checkpoint identity、record/self actor、canonical stream
identity、decision/window identity、local legal candidates 与 actual action correspondence。
response 只能返回相同 identity、每候选 runtime action identity、canonicalizable action、
raw finite Q value 与 legal mask。runtime 自选 action 只用于一致性核对，不是下游 authority；
normalized probability、preferred set 与 error gap 由 reasoning 在候选双射通过后计算。

禁止额外字段、NaN/Infinity、重复 action、未知 action、缺候选、额外候选、跨 decision
response、错序复用或多余 stdout。stderr 仅可被 main 丢弃或转为 bounded hash/exit metadata，
正文永不穿透。生命周期必须有 bounded start/inference timeout、单任务取消、graceful stop
后强制终止 exact child PID；不得按 executable name 终止进程。

固定安全错误如下；UI 只能看到这些 code 的产品映射：

| 错误码 | 既有 outcome 映射 |
|---|---|
| `mortal_runtime_unavailable` | `analysis_blocked` |
| `mortal_runtime_identity_mismatch` | `analysis_blocked` |
| `mortal_checkpoint_identity_mismatch` | `analysis_blocked` |
| `mortal_runtime_crash` | `analysis_blocked` |
| `mortal_runtime_timeout` | `analysis_blocked` |
| `mortal_protocol_invalid` | `analysis_blocked` |
| `mortal_candidate_mismatch` | `binding_mismatch` |
| `mortal_actual_action_mismatch` | `binding_mismatch` |
| `mortal_output_incomplete` | `model_output_incomplete` |

不得把异常 message、Python traceback、路径、命令行、checkpoint 名称以外的本机信息或
runtime prose 作为 reason。重试政策不在本规格泛化；首个 spike 不静默换 runtime、模型、
device 或 remote source。

## 6. Candidate-space 双射

多个 self-turn 暗杠/加杠使用既有 `runtimeAction.variant` 的 `kan:<tile34>` 身份；
只有一个杠或大明杠仍使用 `null`。运行时从固定 libriichi 的第二阶段 mask 独立展开合法
牌种，主 mask 的 42 与这些牌种共同参与完整双射，不能按本地列表裁剪。
多个杠的 response 同时携带 raw 主阶段 `qValue` 与 raw 第二阶段
`kanSelectionQValue`；每个杠的主 Q 必须相同，非杠不得带第二阶段 Q。
运行时偏好先按主 Q，再按杠选择 Q 取最大值。reasoning 用
`mainQ + kanQ - maxKanQ` 作为杠候选的派生选择分数，再与其他主 Q 一同 softmax；
这保留原两阶段 greedy 排序，报告的 `qValue` 仍为 raw 主 Q，派生概率不宣称是原生策略概率。
候选缺失、重复、错误 variant、缺第二阶段 Q 或非最大第二阶段偏好均拒绝。
该扩展沿用 v1 的 nullable variant 与 finite-Q 契约，runner 变更由 manifest 的资产 hash 绑定。

对每个本地候选数大于一且需要模型评价的 self-turn 或 response window，必须证明：

1. response 的 decision/window/trigger/self actor 与 request 完全一致；
2. 本地 canonical legal candidate set 与 Mortal legal action set 一一双射；
3. 每个 runtime action 唯一映射到一个 canonical `actionRef`，反向也唯一；
4. actual canonical action 唯一对应到一个可评分 model action；保留既有
   riichi/kakan 等 realization correspondence，不假设 ref 恒等；
5. preferred actions 全部属于该双射；
6. self-turn 与 M6-A4 wave-1 response families 使用同一纪律，包括 chi、pon、
   daiminkan、hora、pass-on-discard 与已支持 kan/response 分支；
7. duplicate、missing、extra、unknown、ambiguous 或顺序猜测全部 fail closed。

禁止取交集、静默丢 action、补零分、按数组位置配对或把 runtime candidate set 当本地合法性
authority。M6-A4 的 conservation ledger、actual↔model realization 与既有
`ModelEvaluation` candidate universe validator 必须复用或抽取共享核心，不能建宽松旁路。

## 7. ModelEvaluation 与 package provenance

local 与 remote Mortal 都必须调用既有 `buildMortalModelEvaluation` 语义（允许为了复用而
抽取共享核心，但不得复制算法）。local adapter 在候选双射后，对合法候选的 raw Q values
按冻结 temperature `1.0` 计算一次稳定 softmax，概率和必须在容差内为 1，argmax/tie 形成
preferred set，并把 probability + q_value 交给现有 builder。local 路径仍使用
`engineId = "mortal"`、`scoreMethod = "mortal_probability_x100"` 和
`modelReason = "unknown"`；不得把 Q value 称作胜率、打点损失或 EV。runtime manifest 必须
绑定 temperature/greedy/device/AMP 设置，任一改变都产生不同 producer identity。

COAC-111 最小扩展 `StructuredAnalysisPackage.componentVersions`，使每份 local
`ModelEvaluation` 可恢复：

- evidence source kind：`remote_report | managed_local_runtime`；
- runtime implementation/revision/version/artifact SHA-256；
- checkpoint repository revision/model tag/file SHA-256；
- protocol version 与 adapter version。

这些字段参与 package artifact identity 与 semantic content hash。validator 必须把 package
级声明与 decision payload/evaluation 的 engine/adapter identity 逐项交叉验证；篡改任一侧、
保留旧 hash 必须失败。remote report package 继续保留其现有 source/report identity，不能被
伪造为 local runtime。raw model/checkpoint bytes 与本机路径永不进入 package provenance。

## 8. Local Mortal Runtime Production Spike

### 永久 owners

COAC-111 必须建立并长期保留：

- package：`packages/mortal-runtime/`；
- manifests：`packages/mortal-runtime/manifests/`（只存 identity/hash/license metadata，
  不存 binary/checkpoint）；
- protocol fixtures：`packages/mortal-runtime/tests/fixtures/protocol/`；
- protocol/lifecycle tests：`packages/mortal-runtime/tests/`；
- reasoning adapter/conservation tests：
  `packages/reasoning/tests/local-mortal-adapter.test.ts`；
- 真实脱敏雀魂 wave-1 fixture：
  `packages/reasoning/tests/fixtures/local-mortal/`；
- 真实 checkpoint runner：`scripts/local-mortal-production-spike.mjs`；
- package scripts：`prepare:local-mortal-spike` 与
  `test:local-mortal-production-spike`。

### 默认门与显式真实模型门

COAC-111 落地后，protocol/lifecycle/conservation 的永久 focused 入口从 `coach/` 执行：

```powershell
npx vitest run packages/mortal-runtime/tests packages/reasoning/tests/local-mortal-adapter.test.ts
```

该命令只使用 protocol fixtures/fake exact child，覆盖 runtime protocol/lifecycle 与
self-turn/response-window candidate conservation；必须保持离线，且不得加载真实 checkpoint。
在上述 test owners 由 COAC-111 建立前，该命令不可运行且不得报告 PASS。

`npx vitest run` 只使用 protocol fixtures/fake exact child，不下载、不加载大 checkpoint、
不开网络、不冒充真实 inference。它永久覆盖 strict schema、identity/hash、crash、timeout、
oversize/extra prose、所有 candidate mismatch 与 renderer/architecture 边界。

真实模型是显式、可执行但不属于普通五门的验收入口：

```powershell
npm run prepare:local-mortal-spike
npm run test:local-mortal-production-spike
```

资产下载只允许在显式准备步骤执行：固定 repository revision 下载到 gitignored app-managed
目录，重算 checkpoint/runtime artifacts SHA-256，核对 geometry/license metadata，并生成
本地 receipt。测试命令必须先复验 receipt 与每个 artifact hash，使用已准备的本地 runtime
与真实 checkpoint 完成 CPU inference；不得在测试阶段下载缺失资产或使用远程推理替代。
缺资产时明确失败/提示先准备，不得 skip 后报 PASS。宿主网络可以保持开启，系统级禁网
不是模型正确性验收的前置条件。checkpoint/runtime 不进 Git、npm package 或普通构建产物。

### 2026-09-26 验收条件修订（用户批准）

真实本地模型正确性与离线可用性分别记录。系统级禁网可验证整条执行链在无网络时仍能
完成，但不增加候选守恒、真实推理或 package 正确性的证明；为此配置隔离环境不应阻塞
本次产品修复验收。撤销原“真实 spike 必须在网络禁用条件下运行”的硬门槛。
真实 checkpoint、资产/版本/hash 校验、真实 fixture、候选双射、下游完整链、失败语义与
最终提交绑定要求保持有效；普通环境 receipt 仍须按实际运行的最终提交重新取得。

禁网演练作为独立的离线可用性验证，可复用 Windows Sandbox 配置。其未执行或环境失败
单独记为“离线可用性未验证”，不阻塞上述模型正确性验收；普通环境成功不得改称禁网
PASS，也不得因此声称离线可用性已验证。本次修订不改写历史 receipt 或独立评审结论。

### 真实验收链

`test:local-mortal-production-spike` 必须以受支持、真实、脱敏的雀魂 fixture 运行：

```text
Mahjong Soul fixture
→ production mapper / CanonicalEventStreamV2
→ replay self-turn + response windows
→ real mortal-582500 CPU inference
→ per-window candidate bijection + actual correspondence
→ strict ModelEvaluation (modelReason = unknown)
→ existing runMortalFullGameReview or its approved equivalent
→ buildStructuredAnalysisPackage
→ validateStructuredAnalysisPackage
→ existing selector/full-game review consumer smoke
```

fixture 必须覆盖当前 M6-A4 wave-1 self/response families；若一场无法覆盖，使用最小、已登记
真实脱敏 fixture set，但每条 production run 都必须逐窗口守恒且所有源行入账。禁止 synthetic
或 stub inference 冒充 spike；真实 checkpoint 没有运行就不能 PASS。CPU 是 correctness
prerequisite，GPU 仅可另记性能数据。验收 receipt 记录 commit、runtime/checkpoint/protocol/
adapter identity 与 SHA、fixture hashes、每 family/window 计数、固定错误计数、packageId/
semanticContentHash、命令和 exit code，不记录牌谱 raw bytes、路径或 runtime prose。

COAC-141 响应资格来源：Tenhou mapper 仅在完整、受支持的原始 `mjlog` 经逐事件解析、
本局闭合且 canonical stream 校验通过时，将 `responseOpportunities` 标为 `complete`。
这表示全部他家舍牌/加杠及窗口闭合事件可供重放推导，不表示每个窗口自动可荣和。
每个拟纳入验收的荣和或含荣和候选的 pass 窗口仍须由已冻结手牌、规则上下文、
事实引擎和完整历史分别证明役与振听资格；不完整或不支持的来源仍 fail closed。
不得仅凭 actual 荣和、原始事件命中、窗口计数或模型输出跳过该证明。

## 9. Implementation 与发布 gates

COAC-111 除 focused/default/real-spike commands 外，从 `coach/` 跑固定五门。实现完成前：

- `npm run check:architecture` 必须新增并自测 mortal-runtime dependency/renderer/preload/
  mortal-source/reasoning 禁止边；
- contracts、package builder/validator 与 package-import smoke 必须覆盖新 provenance；
- 每个固定错误和双射失败至少一个永久负例；
- `git diff --check` 通过；
- fresh independent review 必须核验真实 spike receipt 不是 stub。

COAC-111 的真实 local Mortal → validated package 合入 `master` 前，COAC-106 保持 blocked，
不得把 Stage 2 从 backlog 提升为已验收，也不得声称 Playable Review MVP demoable。完成该前置
只解除 production analysis prerequisite；COAC-106 仍只负责 package → ReviewSession →
Review Workspace 接线。

## 10. 非目标

- Akagi、第二模型、训练/fine-tune、通用 provider/runtime framework、模型市场；
- 用户选择 checkpoint/runtime/path/device 的 UI；
- M8 installer 或未经核验的 checkpoint 再分发；
- 修改 `KnownGameFacts` / ledger / differences 的 authority；
- 删除 remote Mortal report adapter；
- Learner Model、M4 chat、regenerate/history UI。
