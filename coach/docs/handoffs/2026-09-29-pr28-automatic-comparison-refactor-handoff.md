# PR #28 自动比较范围重构：接力开发交接

## 最新接力入口（2026-09-29，优先于下方阶段快照）

1. 当前处于**实现已落地、固定版本整体验收前**。本文件及本轮自动比较补丁仍在
   `c6da015` 之上的未提交工作区；接手先核对 Git，不把本文件里的基线当作最终候选。
2. 图/报告越界 P2 正常路径修复后，独立审查又发现“改写图中 scope 后获得未分析动作
   推荐权限”。永久回归先红：`graph-scope-tamper-red.log`，断言 expected function to throw。
   现在 `validateAutomaticComparisonScopes` 从同决策唯一且 contains 绑定的完整
   ModelEvaluation 重算范围，图校验、直接 grounding、报告读回共用；缺失、重复、
   畸形评分、缺边、键序、生成前零 provider 调用均有回归。
3. 独立原反例最新复核 **已阻断**，未发现该补丁新增 P1/P2；不是整体最终 PASS。
   证据：`subagent-top-pair-preliminary/SCOPE-FIX-RECHECK-V2.md` 与
   `scope-fix-boundaries-v2.json`。审查发现测试 draft 多带非法 schemaVersion 的问题
   也已去除，并将断言绑定到 automatic_comparison 错误，避免以别的错误误绿。
4. M6-D1/M6-D2 规格已追加批准修订，明确 Decision.scope 是产品策略注释，不是
   canonical 牌谱事实；图、切片、提示与报告消费范围同步。其他动作对的在线比较
   **现有分析接口已验证，尚无新桌面入口**；本轮不应声称用户操作闭环已交付。
5. 第一轮 scope 完整门禁：typecheck/build/architecture/package-import/diff 均 0；
   vitest 1，三处旧断言仍要求 prompt v1 / 旧 Decision 白名单。已按批准契约更新，
   相关回归通过。六门已完整重跑，全部退出 0（02:11–02:13），Vitest 为
   195 文件 / 2433 项；见 `scope-final-results.json`。这是实现门禁，不是最终 CPU PASS。
6. 下一步：读取最新门禁回执，审查全部补丁，提交并 push；固定新 SHA 后完整九视角
   CPU、Electron、最大新档案默认堆保存关闭重开与独立验收。新的实际体积尚未测得。

### 总体重构定位

- 已有基线采用 libriichi 作为合法动作权威，Mortal 负责评分，mahjong-helper 负责教学
  事实；本轮没有重新引入本地合法动作计算器。迁移细节、R14 后续修复和历史提交证据
  见 `docs/plans/2026-09-28-libriichi-legal-action-authority-migration.md`。
- `c6da015` 前已处理请求/评分绑定、生命周期、包校验及真实大档案内存峰值；旧
  5.49 GB 保存重开曾成功。该历史结果不能证明新策略最终提交已通过。
- 当前工作是减少自动详细计算与重复引用产生量，并贯通报告消费边界；新策略仍保留
  完整合法候选和评分。真实规模、耗时与最终独立结论是下一阶段，不在此交接中宣告完成。

落盘后补充（02:03）：已补报告读回越界回归。旧无 scope 图允许的第三候选报告在旧图
读回通过，在新 scoped 图读回被 `recommendation_not_in_candidates` 拒绝；所选对报告
生成和读回仍通过。`automatic-report-scope.test.ts` 两项全链测试退出 0，日志为下述
证据根的 `report-scope-readback-green.log`。已请原独立审查者复核，结果尚待返回。

更新时间：2026-09-29 02:02（Asia/Shanghai）。这是实施中快照，不是验收 PASS。

## 1. 目标、位置与禁止事项

- 总目标：完成 PR #28 的 R14 请求绑定、分数错贴、进程退出、包校验等修复及架构迁移，
  持续修复—独立验收直到通过。用户追加的自动比较范围重构属于本轮目标。
- 实现工作树：`E:\文档\日麻教学\coac-155-work`；命令一般在其 `coach\` 下运行。
- 分支：`agent/ticket/coac-111-local-mortal-runtime`。
- 当前 HEAD：`c6da015933991d5070a8dd173316ec84d34885ca`，此前已推送。
- PR：https://github.com/ChildeRolando/MjsoulTileTrace/pull/28 。BASE 定位线索：
  `efc40f02591a36ba4a63072f6d8f31ca097e050d`。接手时重新核对远端，不 reset。
- **本交接描述的新策略代码、测试及文档均未提交、未推送**。不要覆盖现有 dirty 补丁。
- 用户明确要求：本地提交后总是普通 push；不 force push、不 merge、不修改保护规则。
- 不修改旧主工作区 `E:\文档\日麻教学\overlay`；不修改 Review Loop、admission、
  Controller ledger/check、历史评审结果；不经 Clod 转发任务。
- 先读 README、CONTEXT、development/INVARIANTS、ARCHITECTURE、VERIFICATION，
  以及本交接引用的规格。此前适用路径未发现 AGENTS；接手时可再次核验。

## 2. 用户批准的新契约

2026-09-29 用户明确指出全候选两两比较空间成本过高，批准：

1. Mortal 有异议：仅详细比较 Top1 与玩家实际行动。
2. Mortal 无异议：仅详细比较 Top1 与 Top2。
3. 其他候选对由用户按需在线比较，不作为自动报告完备条件。
4. 完整合法动作、完整 Mortal 评分仍保留、仍校验双射；详细计算范围与合法动作集合分离。

权威修订已写入 `docs/specs/2026-08-18-m6-c-structured-analysis-package-design.md` 末尾；
CONTEXT、INV-002 与实施计划末尾 §31 已同步。INV-002 现在明确：模型可决定计算范围，
但不得改写固定候选、固定状态/引擎版本的事实值。

边界决定：异议沿用模型最优集合语义，不使用报告入选的 errorGap 阈值；实际属于并列
最优时按无异议，以实际对应动作作为本次 Top1；其余按完整选择分数降序、稳定动作身份
破同分。Top2 不得是实际动作的另一种模型表达。单合法动作继续采用原规则证明。

## 3. 为什么重构：已测量证据

历史原档案：
`E:\文档\日麻教学\coach-acceptance-evidence\independent-r19\production-native-438053e50d33-1790602732233\mahjong-soul-primary-actor-0-package.json`

- 大小 5,490,668,445 bytes；SHA256：
  `a33a57776007bba9d5cac88e2af5aa2876422b23f6ef316d53e37dca32b16d08`。
- 158 决策：149 个详细分析、9 个单候选；详细候选共 1,394，平均 9.36 个/决策。
- 7,061 对候选 → 321,463 条指标比较；66,643 条候选事实。
- 比较记录 4,348,894,099 bytes，候选账本 980,833,768 bytes。
- evidenceIds/sourceRefs 数组占 5,043,303,611 bytes（91.85%）；76,431,767 个引用条目，
  仅 4,002 个独立引用 ID。Mortal 评价约 0.59 MB。
- 主要放大路径：累计事件来源列表 → 每个候选的多条事实 → 全候选两两差异再次保存引用并集。
- 旧内存修复解决完整档案保存重开 OOM，未解决磁盘体积；新策略不是压缩、裁牌谱或删合法动作。

流式统计代码与回执在工作树外：
`E:\文档\日麻教学\coach-acceptance-evidence\package-composition-20260929\`
包括 `composition.json`、`candidate-counts.json` 及对应 `.mjs`。统计完成，无遗留统计进程。

## 4. 已实现但未提交的代码

### 契约与范围生产

- `packages/contracts/src/automatic-comparison.ts`（新增）：
  `AutomaticComparisonScopeSchema` 与 `deriveAutomaticComparisonScope`；版本
  `automatic-comparison/top-pair-v1`，reason 与有序 actionRefs 二元组。
- `structured-analysis-package.ts`：ready 决策可带 `automaticComparisonScope`；包级
  `analysisPolicy.automaticComparisonPolicyVersion` 参与既有 packageId/content hash。
  包级和决策级必须一致；旧档案两者都缺省时保留旧全量语义。
- `mortal-review-service.ts` 在完整评分/规则绑定验证后调用 assembly，设置 `automaticReport: true`。
- `structured-analysis-assembly.ts` 复用原完整评分绑定，再派生范围；用户比较不套用自动策略。
- `structured-factor-pipeline.ts` 在 helper 调用前只遍历所选两项，将范围返回到 factorResult。
  不能退化为先全量计算后过滤输出。
- builder 保存范围；validator 重算范围，账本精确匹配所选对，差异/确定性偏好仅能引用该对；
  原完整比较集合与模型评分双射仍强制。

### 图、模型输入与报告消费（最新修复）

- `project-context-graph.ts` 将 ready 决策的范围投影到 Decision payload。
- contracts `GRAPH_SLICE_PAYLOAD_ALLOWLIST` 显式允许该字段，不默默扩展其他字段。
- `groundingValidator.ts` 共用 `recommendationActionRefs`，生成与报告读回都将建议限制在
  已分析对内；无 scope 的旧图仍按原全部候选语义。畸形 scope 不获得推荐权限。
- 提示更新为 `coach-review-prompt/v2`，明确未选动作仅有评分、不能将对内偏好称为全局最优。
- `COACH_GROUNDING_VALIDATOR_VERSION` 为 `coach-grounding/v2`。
- 新请求使用 v2；`ReviewGenerationSchema` 兼容历史 v1 提示版本，以免已有报告无法读取。

### 存储与按需比较

- `package-persistence-scale.mjs` 仍要求完整九视角回执、取最大档案、全文哈希、默认堆、
  保存/关闭/新 repository 重开。旧全量档案仍检查至少 5.49 GB；新策略检查已分析决策恰
  两账本，记录详细候选/完整模型候选/差异数量，不要求新档案人为达到旧体积。
- 用户指定另一对动作可走已有 `runStructuredAnalysisAssembly` 的 user_comparison 输入，
  `modelEvaluation: null`；新增回归验证调用该两项并独立返回，不改写原自动输入。
  **目前仅验证分析接口，没有新增或声称已完成桌面“在线比较”操作入口。**接手须据用户
  需求和现有 MVP 路由判断是否还需补产品入口，不能把分析接口测试冒充用户可操作闭环。

## 5. 验证实际状态（不要继承旧 PASS）

外部日志根：`E:\文档\日麻教学\coach-acceptance-evidence\package-composition-20260929`。

| 阶段 | 实际结果 | 限制 |
|---|---|---|
| 首批实际排名 first/second/last | 旧实现 3 FAIL：12 账本而非 2；修复 3 PASS | `automatic-pair-regression-red.log` |
| 选择策略边界 | 8 PASS | 并列、顺序、实际对应、非法评分/偏好 |
| 包 scope 及策略身份 | 先红后绿 | 包级 policy 最初缺失，已修复，不再共用旧策略身份 |
| 按需比较分析接口 | 1 PASS | 不是桌面 UI 验收 |
| 五门 + diff | 6 命令 exit 0，194 文件/2430 测试 | `pair-gates-results.json`；早于下面两个预审修复，须重跑最终门 |
| 键序 P2 | 旧红，新 7 项 pair integrity PASS | `scope-key-order-{red,green}.log`；审查者已独立复核修复 |
| 图/报告范围 P2 | 旧 2 FAIL：scope 丢失、第三候选 ready；新相关 60 测试 PASS | `report-scope-red.log`；最新绿为工具输出，独立复核/最终完整门待执行 |

最新 60 项来自：automatic-report-scope（2）、grounding-validator（38）、review-report（19）、
coach-prompt（1）。contracts 已重新 build。最新完整工作树尚未执行最终全套门禁，
特别应核查 prompt v2 导致的其他契约/桌面测试及历史 v1 报告兼容。

## 6. 独立审查及运行状态

- 当前子代理 `/root/independent_storage_review` 是独立审查者，无产品源码修改。
- 用户此前明确授权在 Multica 登录失败时使用子代理；之后告知 Multica 已恢复。
  总目标仍要求独立验收，后续可发 Multica 工单；不要把本预审当作正式通过。
- 上一固定 c6da015 的正式九视角 CPU 在新需求批准后已安全停止，全部自有子进程已退出。
  五份已生成档案与日志保留；状态 `CANCELLED_USER_REQUIREMENT_CHANGE`，不是产品 FAIL/PASS。
  Electron、最大新档案存储没有启动。不得恢复后拼接或冒用该次不完整回执。
- 取消证据：`E:\文档\日麻教学\coach-acceptance-evidence\independent-r20\candidate-c6da015-20260929-0050\user-change-cancellation.json`。
- 预审证据：`E:\文档\日麻教学\coach-acceptance-evidence\subagent-top-pair-preliminary\PRELIMINARY-REVIEW.md`。
  两个 P2：键序已独立确认修复；图/报告越界已由实现修复，尚待原独立反例复核。
  **不要修改该历史报告为 PASS**；让审查者追加新复核回执。
- 独立 checkout：`C:\Users\Roland\.codex\worktrees\pr28-independent-r20\日麻教学`，
  上次 clean/c6da015；新候选需重新固定版本、重新构建。
- 当前没有已知仍需等待的重型验收进程；接手如有新消息，以进程/回执实时状态为准。

## 7. 下一步顺序

1. 复核最新图/报告 P2 修复；补报告读回伪造未选候选的 durable 回归、旧无 scope 数据及
   v1 报告兼容、scope 在图/切片中的身份/合法性边界。重点防止“对内偏好”被误读成全局最优。
2. 请求原独立子代理用已有反例复核最新修复；继续有限检查新策略消费链，不重复报同一问题。
3. 补足按需比较的实际交付边界说明/实现；更新 M6-D1/M6-D2 受影响说明及实施计划状态。
4. 完整检查补丁，重跑 typecheck、build、npx vitest run、check:architecture、test:package-import、
   git diff --check；所有失败分别记录，不因一个失败省略其余门。
5. 提交并普通 push；核对本地/远端 PR SHA。新文档也属于提交内容，先完成再固定候选。
6. 对最终固定提交运行完整九视角真实 CPU，复用已有权重/native/helper 资产，不默认重新下载。
   记录新字节数、计算范围、差异数、耗时；运行 Electron 及新最大档案默认堆保存关闭重开。
   旧 5.49 GB 文件兼容回归仍保留，但不能代替最终新产物验证。
7. 独立验收按新契约执行，保留 R14、后续回合的全部请求绑定/评分/生命周期/包安全边界。
   新旧策略的支持范围变化必须基于用户批准的契约，不能靠隐藏其他错误通过。
8. 只有最终候选完整证据与独立结论齐备才能完成目标；不自动合并。

## 8. 环境与其他历史限制

- Windows PowerShell；Node v24.15.0。现成 Go 1.24.13 在
  `C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin`。
- 原真实 CPU 命令自带 8 GiB 生成堆；存储验收必须保持 Node 默认堆。二者不能混淆。
- Windows Sandbox 曾报 0x80370106。后续已批准系统禁网是独立可选可用性演练，
  未验证就标未验证；不得用 offline 环境变量或零请求观察冒充 OS 隔离。
- 不改全机防火墙或断网。用户手动登录捕获已完成，复用现有私有捕获，不输出账号、URL、token。
- 已有真实牌谱与规则来源证据路径见实施计划历史章节；诊断日志、大 JSON、SQLite 放工作树外。
- 之前 c6da015 的默认堆原档案回归保存关闭重开曾成功约 1238 秒，但只是旧版本历史证据，
  不声称是当前新策略的性能或最终验收结论。
