# Review Loop v1 protocol and Multica deployment specification

日期：2026-09-20

状态：冻结，ready for platform implementation

协议标识：`review-loop/v1`

本文是 Review Loop v1 的唯一权威设计与验收语义。Multica 工单、Agent
instructions、Autopilot description 和 GitHub webhook 配置只能引用或实现本文，不能
成为第二套协议。机器可读伴随物：

- [`review-loop-v1.schema.json`](review-loop-v1.schema.json)：Controller 观察到的 review
  结果封装；
- [`review-loop-v1.multica.json`](review-loop-v1.multica.json)：可直接转成 CLI 操作的
  平台配置预览与完整 Agent instructions；
- [`../../fixtures/review-loop-v1/decision-cases.json`](../../fixtures/review-loop-v1/decision-cases.json)：
  决策 fixtures；
- `npm run test:review-loop-protocol`：协议、配置与全部 fixture 的机械检查。

## 1. Scope and non-goals

v1 只处理已经推送到 GitHub 的 open、non-draft PR candidate HEAD。它不接受
local-only worktree、patch、bundle、未推送 commit 或聊天中粘贴的 diff。实现只使用
Multica webhook、issue、child issue、comment/mention 和现有 GitHub/仓库能力；不新增
sidecar、数据库、长期服务或 Squad。

三个执行角色严格分离：

- **Controller**：`gpt-5.6-luna` 的确定性协议解释器。只验证输入、读取事件日志、计算
  transition、复用或创建 child；不审查代码、不总结 findings、不自行修复。
- **Fresh Reviewer**：每轮一个新的 review issue/run，只读审查精确的
  `base_sha..candidate_head_sha`。
- **Fixer**：复用现有 `Ticket 编码执行器`
  `ba77da89-8574-4dea-8fc2-24e841fc2754`；不创建新的 Fixer Agent。

v1 最多允许三次 review dispatch。`round` 是已分派的 review 次数，取值 `1..3`；首次
review 是 round 1。stale review、外部新 push 或 Fixer 产生的新 HEAD 要进入新的 review
round，因此也消耗一次 round。round 3 之后不得分派 round 4。

## 2. Authorities and event log

事实权威按以下顺序解释：

1. 本文及 admission block 列出的 repository specs/contracts；
2. GitHub live PR 的 repository、state、draft、base SHA 与 head SHA；
3. reviewer final comment 的原始 UTF-8 内容；
4. Multica canonical control issue、children 与 transition comments 组成的 append-only 事件日志。

Issue/comment 是事件日志，不拥有设计语义。Controller 每次运行都重新读取 canonical
control root 的 children 和 relevant comments，不依赖模型记忆。

### 2.1 Ticket admission block

可进入 v1 的 Ticket 必须在 description 中包含且只包含一个如下 JSON fenced block：

```json
{
  "protocol_version": "review-loop/v1",
  "authoritative_spec_paths": ["coach/docs/specs/<approved-spec>.md"],
  "rubric": "Review the approved ticket acceptance criteria and repository invariants.",
  "gate_profile": "coach-five-gates/v1"
}
```

PR title 必须包含唯一的 Multica key（例如 `COAC-12`），并且该 Ticket 必须属于配置的
Coach project。缺失、重复、路径逃逸、指向不存在文件或多个 ticket key 均 `BLOCKED`。

### 2.2 Deterministic identities

Canonical control root title：

```text
[review-loop/v1][control] <owner>/<repo>#<pr-number> <ticket-key>
```

Autopilot 创建的第一张 intake issue 被 Controller 重命名为 control root。后续 webhook
intake 被挂为它的 child：

```text
[review-loop/v1][event][<delivery-id-prefix-12>] <owner>/<repo>#<pr-number>
```

intake issue 与触发记录的唯一可读关联路径是：对配置的 Autopilot 执行
`multica autopilot runs <autopilot-id> --output json`，在返回的 run 中按
`issue_id == <intake-issue-id>` 精确匹配一条记录，并要求 `source == "webhook"`、
`trigger_id` 等于配置的 webhook trigger ID。零条、多条或字段不匹配均 `BLOCKED`。

工作 child title：

```text
[review-loop/v1][review][r<round>][<head-prefix-12>] <ticket-key> PR #<number>
[review-loop/v1][fix][r<round>][<head-prefix-12>] <ticket-key> PR #<number>
```

`transition_key` 是以下对象按 RFC 8785/JCS canonical JSON 编码后 UTF-8 bytes 的
lowercase SHA-256：

```json
{
  "protocol_version": "review-loop/v1",
  "ticket_issue_id": "<uuid>",
  "repository": "<owner>/<repo>",
  "pr_number": 123,
  "base_sha": "<40 lowercase hex>",
  "current_head_sha": "<40 lowercase hex>",
  "round": 1,
  "transition": "DISCARD_AND_REVIEW",
  "source_kind": "github_delivery|review_comment|fixer_comment",
  "source_id": "<provider delivery id or Multica comment id>",
  "source_sha256": "<64 lowercase hex>"
}
```

GitHub source hash 必须覆盖平台保存的原始 request body bytes；comment source hash覆盖
Multica API 返回的 `content` 字符串按 UTF-8 编码的精确 bytes，不增删尾换行、不规范化
CRLF、不重排 JSON。当前平台可读面不能取得前者，故 webhook source 不得生成
`source_sha256` 或进入 dispatch；见 §3 的冻结限制。

Controller 在任何 child create 前必须扫描：

1. canonical root 的所有 child title；
2. root 与 relevant child comments 中的 `transition_key`；
3. 相同 round/head 的 review/fix result source id 与 SHA。

相同 key 和相同 payload 已存在时返回 `NO_ACTION_ALREADY_DISPATCHED`。确定性 title 已存在
且 metadata 完全相同也视为同一 dispatch；title/key/source 发生一项冲突即 `BLOCKED`，
不得猜测或创建后缀副本。

## 3. GitHub webhook admission

Autopilot webhook URL 是 secret，不能写入仓库、issue、日志或 PR。Multica ingress 使用
`X-GitHub-Delivery`（否则 `Idempotency-Key`）复用重复 delivery；Controller 仍执行上节
的第二层幂等检查。

### 3.1 Frozen Multica delivery/read path and current limitation

截至 2026-09-20，仓库可验证的 Multica CLI read path 只有：

1. `multica autopilot runs <autopilot-id> --output json`；
2. 以 run 的 `issue_id` 精确关联当前 intake issue；
3. 读取 run 的 `source`、`trigger_id` 和解析后的 `trigger_payload`。

该 read path **不提供** delivery read 子命令，也不在 run 记录中提供原始 request headers、
原始 body bytes、provider delivery id 或原始 body hash。`trigger_payload` 是解析后的 JSON，
不得重新序列化后冒充原始 bytes，也不得从 payload 字段猜测 `X-GitHub-Event` 或
`X-GitHub-Delivery`。因此当前所有 webhook intake 的 normalized
`source_payload_verified=false`，Controller 必须在任何 child dispatch 前返回 `BLOCKED`。

激活 webhook 前，Multica 平台负责人必须二选一并更新本文、manifest 与 fixtures：

- 暴露与 `issue_id` 关联的只读 delivery 记录，其中含未经重序列化的 headers、body bytes
  和 provider delivery id；或
- 明确批准一个新的 versioned hash/admission 语义。

在该裁决落盘前不得创建或启用 Review Loop v1 webhook；实现者无权自行选取新语义。

唯一允许的 repository 是 `ChildeRolando/MjsoulTileTrace`。必须有
`X-GitHub-Event`、provider delivery id，并通过 live GitHub 查询重新验证 PR；event
payload 是不受信提示，不是当前 HEAD 权威。

支持：

| Event | Actions / conditions | Candidate |
|---|---|---|
| `pull_request` | `opened`, `reopened`, `synchronize`, `ready_for_review`; live PR 必须 open、non-draft | live `pull_request.head.sha` |
| `push` | non-deletion push；`after` 必须恰好是一个 open、non-draft PR 的 live head，且该 PR 唯一映射到一个 admitted Ticket | live PR head（必须等于 `after`） |

任何其他 event/action、draft/closed PR、deleted branch、fork repository、不唯一的 push→PR
映射、缺失 ticket/spec/gate profile、无法查询 live PR 均 `BLOCKED`。v1 不把 ignored
input 悄悄当成功。

如果 event 中的 head 已落后于 live PR head，旧 head 不得被 review 或 fix：当 round 尚
有容量时使用 live head 执行 `DISCARD_AND_REVIEW` 并增加 round；round 3 已消耗时
`BLOCKED`。重复 delivery 或 live head 已有同一 dispatch 则
`NO_ACTION_ALREADY_DISPATCHED`。

## 4. Protocol envelopes

SHA 必须是完整 40 位 lowercase Git object id，不接受缩写。Ticket 与 PR identity、
`base_sha`、`current_head_sha`、`reviewed_head_sha`、round、verdict、P1/P2/P3、五项 gate、
环境失败、`source_review_id` 和原文 SHA-256 都是必填协议字段；不得从 prose 推断缺失值。

Fresh Reviewer final comment 必须以一个且仅一个 `review-loop-result` JSON fenced block
结束。其 JSON 提供 schema 顶层 observation 的 reviewer-owned 字段；`source_review_id`
是 fresh review issue UUID。Controller 读取 comment 后补入 live `current_head_sha`、
`source_review_comment_id`、`raw_review_sha256` 与 `source_review_provenance`，再校验
[`review-loop-v1.schema.json`](review-loop-v1.schema.json) 定义的完整 observation。

`source_review_provenance` 只能由 Controller 从 Multica 元数据派生，Reviewer prose/JSON
不能声明或覆盖它。以下条件必须同时成立：comment `author_type == "agent"`；
`author_id` 严格等于 manifest 中部署后回填的 Fresh Reviewer Agent ID；comment 的 owner
issue 严格等于 `source_review_id` 和本轮确定性 review child；该 child 的 assignee 仍是同一
Fresh Reviewer ID。任一字段缺失、不相等或归属冲突均 `BLOCKED`，即使正文/hash 自洽也
不得 `PASS` 或消耗新一轮。

五项 gate 固定且必须各出现一次：

| Gate id | Exact command (cwd `coach/`) |
|---|---|
| `typecheck` | `npm run typecheck` |
| `build` | `npm run build` |
| `vitest` | `npx vitest run` |
| `architecture` | `npm run check:architecture` |
| `package-import` | `npm run test:package-import` |

PASS 要求每项 `status=PASS` 且 `exit_code=0`。缺失、重复、额外 gate、命令不完全匹配、
非零 exit、未运行或 unknown 都不是全绿。

Reviewer verdict 只有：

- `NO_P1_P2`：P1/P2 均为空，五 gate 全绿，无环境失败；允许 P3。
- `CHANGES_REQUIRED`：至少一个 P1 或 P2，五 gate 仍须全数实际运行且记录。
- `ENVIRONMENT_BLOCKED`：至少一个环境失败，或者无法取得/验证精确 checkout 以运行全部 gate。

verdict、finding 数量、gate 与 environment failure 互相矛盾时 observation malformed。

## 5. Fresh-review isolation

每轮 Controller 必须创建新的确定性 review child，从而得到新的 issue 与 run；禁止在旧
review issue 上重跑。Reviewer 只能接收：

- 协议版本与 opaque correlation ids；
- repository/PR 标识、`base_sha`、candidate `reviewed_head_sha`、round；
- Ticket admission block 指向的 authoritative spec paths；
- rubric；
- 上述五项 exact gate commands。

仓库自动注入的顶层安全/治理指令仍然适用。除此之外，Reviewer 禁止读取 canonical
control issue、parent/sibling issue、旧 review/fix comments、旧 findings、其他 Agent
session 或实验输出。Reviewer 不能编辑 tracked files、index、commit、branch 或 PR；gate
产生的 ignored build outputs 允许。拿不到精确 base/candidate 或环境无法运行五项 gate
必须输出 `ENVIRONMENT_BLOCKED`，不得 review 相近 HEAD。

Reviewer final comment 必须原样保留其完整 findings 和 JSON。它在最后的 JSON block 前用
`mention://agent/<controller-id>` 触发 Controller，使 JSON block 仍是 comment 的最后内容；
mention 之外不得主动路由其他 Agent。

## 6. Fixer handoff and provenance

`ROUTE_TO_FIXER` 创建新的 fix child，分配给现有 Fixer ID。Controller 不得总结、改写、
删选或重排 reviewer findings。Fix child 必须包含：

- ticket/spec/PR/base/reviewed/current HEAD、round；
- `source_review_id`、`source_review_comment_id`、`raw_review_sha256`；
- 一个附件 `review-output-<raw_review_sha256>.txt`，其 bytes 与 reviewer comment `content`
  UTF-8 bytes 完全相同。

Fixer 下载附件、重新计算 SHA-256，一致后才执行；不一致或附件缺失即 fail closed。Fixer
必须在同一 PR branch 上提交并 push 新 candidate HEAD，运行 Ticket/spec 要求的验证，
并在 final comment 报告完整 40 位 pushed HEAD，然后 mention Controller。没有新 pushed
HEAD、只改 local worktree、force-push 无法验证或 fixer result malformed 均 `BLOCKED`。

Controller 在解释 Fixer comment 前必须从 Multica 元数据验证：`author_type == "agent"`、
`author_id == ba77da89-8574-4dea-8fc2-24e841fc2754`、comment owner 是本轮确定性 fix child，
且该 child 分配给同一 Fixer ID。该 conjunction 是 normalized `source_author_valid`；任一项
不成立立即 `BLOCKED`，不允许伪造 Fixer result 或借此消耗 round。

## 7. Controller state machine

Controller 唯一允许输出以下五种 transition：

- `DISCARD_AND_REVIEW`
- `ROUTE_TO_FIXER`
- `PASS`
- `BLOCKED`
- `NO_ACTION_ALREADY_DISPATCHED`

未被下表覆盖的任何组合一律 `BLOCKED`。表按从上到下的优先级求值，首个匹配项唯一
决定结果：

| Priority | Normalized condition | Transition | Effect |
|---:|---|---|---|
| 1 | verified source provenance and exact delivery/transition/child dispatch already recorded with identical metadata | `NO_ACTION_ALREADY_DISPATCHED` | 不创建、不重发、不改 round |
| 2 | duplicate title/key/source exists but any metadata/hash/result conflicts | `BLOCKED` | 记录 conflict，零 dispatch |
| 3 | unsupported/malformed input；webhook 原始 source 不可验证；identity/spec/live PR 不可验证；Reviewer/Fixer 作者或 comment/child 归属不匹配；review envelope/hash/verdict 自相矛盾；multiple conflicting results | `BLOCKED` | 零 dispatch |
| 4 | no review exists for an admitted initial candidate | `DISCARD_AND_REVIEW` | 创建 round 1 fresh review child |
| 5 | event/review/fixer references stale HEAD and next round is `<=3` | `DISCARD_AND_REVIEW` | 丢弃旧结果，仅对 live HEAD 创建 next-round fresh review |
| 6 | event/review/fixer references stale HEAD but next round would be `4` | `BLOCKED` | 三轮上限，零 dispatch |
| 7 | valid Fixer result has a new pushed live HEAD and next round is `<=3` | `DISCARD_AND_REVIEW` | 创建 next-round fresh review |
| 8 | Fixer has no new pushed live HEAD, or next round would be `4` | `BLOCKED` | 零 dispatch |
| 9 | review verdict/environment 是 `ENVIRONMENT_BLOCKED`，任一 gate 缺失/重复/非全绿，或 gate profile 漂移 | `BLOCKED` | 零 dispatch |
| 10 | coherent review has P1 or P2 and `round < 3` | `ROUTE_TO_FIXER` | 创建本 round fix child；附完整原文与 hash |
| 11 | coherent review has P1 or P2 and `round = 3` | `BLOCKED` | 三轮上限，零 dispatch |
| 12 | coherent `NO_P1_P2`，P1/P2 均为空，五 gate 全绿，无环境失败；P3 任意 | `PASS` | 不 merge、不 close Ticket；control issue 进入人工 acceptance |

`PASS` 不是 merge、Ticket `done` 或 PR acceptance。Controller 只把 control issue 置为
`in_review` 并保留 provenance；人类/既有仓库流程决定 merge 与 Ticket 完成。

## 8. Native Multica orchestration

Autopilot 使用 `create_issue`，project 是 Coach
`bc4d48fd-93e1-4377-9342-670a523729ac`，assignee 是新 Controller。因为 Autopilot title
template 只支持 `{{date}}`，配置只使用 `Review Loop webhook intake {{date}}`；不能假设
`{{branch}}`、`{{delivery_id}}`、`{{pr}}` 等变量。Controller admission 后再按 §2 重命名/
reparent。

Reviewer/Fixer 的 final comment mention Controller，是唯一 continuation trigger。Controller
`max_concurrent_tasks=1`，因此同一 Agent 的 transition 串行；幂等扫描仍是强制项，不能以
并发限制代替。

配置预览的固定值与完整 instructions 在
[`review-loop-v1.multica.json`](review-loop-v1.multica.json)。后续实施顺序：

1. 由 Multica 平台负责人先解决 §3.1 的 raw delivery 读取/哈希语义裁决；未解决则停止，
   不创建或启用 webhook；
2. 重新只读核验 runtime/project/Fixer IDs 与 model catalog；
3. 创建 Controller，保存返回 ID；
4. 将该 ID 替换进 Reviewer instructions 后创建 Reviewer；
5. 将 Reviewer ID 替换进 Controller instructions；
6. 创建 `create_issue` Autopilot 并添加 webhook trigger；
7. 在 GitHub 只订阅 §3 的 `pull_request` 与 `push` events；webhook URL 不进入仓库；
8. 回读两个 Agent 与 Autopilot，核对 instructions hash、模型、thinking、权限、并发和 project。

后续实施工单可直接从 manifest 取值；以下 PowerShell 是配置预览，不得在本工单运行：

```powershell
$m = Get-Content -Raw coach/docs/specs/review-loop-v1.multica.json | ConvertFrom-Json
$c = $m.agents | Where-Object role -eq controller
$r = $m.agents | Where-Object role -eq fresh_reviewer

$controller = multica agent create --name $c.name --runtime-id $c.runtime_id `
  --model $c.model --thinking-level $c.thinking_level `
  --max-concurrent-tasks $c.max_concurrent_tasks --permission-mode $c.permission_mode `
  --description $c.description --instructions $c.instructions --output json | ConvertFrom-Json

$reviewerInstructions = $r.instructions.Replace('${CONTROLLER_AGENT_ID}', $controller.id)
$reviewer = multica agent create --name $r.name --runtime-id $r.runtime_id `
  --model $r.model --thinking-level $r.thinking_level `
  --max-concurrent-tasks $r.max_concurrent_tasks --permission-mode $r.permission_mode `
  --description $r.description --instructions $reviewerInstructions --output json | ConvertFrom-Json

$controllerInstructions = $c.instructions.Replace('${FRESH_REVIEWER_AGENT_ID}', $reviewer.id)
multica agent update $controller.id --instructions $controllerInstructions --output json

$a = $m.autopilot
$autopilot = multica autopilot create --title $a.name --description $a.description `
  --agent $controller.id --mode $a.execution_mode --project $a.project_id `
  --issue-title-template $a.issue_title_template --output json | ConvertFrom-Json
multica autopilot trigger-add $autopilot.id --kind webhook --label $a.trigger.label --output json
```

命令返回的 webhook URL 只进入 GitHub secret configuration，不写入脚本、仓库或 issue。
创建前仍须执行步骤 1 的只读 revalidation；创建后按步骤 7 回读，不能把 CLI 返回成功当作
配置验收完成。

这是配置预览，不授权本工单创建或修改任何 Agent、Squad、Autopilot 或 webhook。v1 明确
不创建 Squad。

## 9. Fixtures and acceptance

`decision-cases.json` 至少冻结：clean pass、P1、P2、P3-only、gate fail、environment
blocked、malformed、stale HEAD、stale Fixer（含 round 3）、untrusted Reviewer/Fixer、
unverifiable webhook source、round 3、duplicate transition、conflicting results；另有
initial candidate 与 Fixer new-head 用例。检查器必须证明每个 fixture 只得到一个允许的
transition、所有未知组合 fail closed、配置中 Controller 并发为 1、Autopilot 不含非法
title token、Fixer ID 被复用且无 Squad。

## 10. Change Control Report

**Control-plane discovery** — `REPOSITORY-STRUCTURE.md` 将 `coach/` 定义为独立项目并把
`coach/docs/development/` 作为当前入口；`coach/docs/development/README.md` 路由 living
docs/specs/plans/handoffs；`DEVELOPMENT_WORKFLOW.md` 规范跨包/多提交设计进入
`coach/docs/specs/` 并定义大改动报告；`INVARIANTS.md` 是唯一不变量登记表；
`VERIFICATION.md` 与 `coach/package.json` 拥有可执行门禁。前四者是规范性来源；已有代码、
package scripts 与 Multica 只读记录是现状证据。架构 spine 中与本次直接相关的是
`ARCHITECTURE.md` 的 fail-closed、确定性/模型职责分离，以及 `INVARIANTS.md` 的 INV-006
（畸形输入 fail closed）和 INV-007（版本/来源可复现）。它们分别由新增协议 fixtures、
SHA/provenance 字段和 `test:review-loop-protocol` 扩展保护；现有产品 package boundary 仍由
`check:architecture` 保护。

**Scope** — 新增 Review Loop v1 的 repository-owned 协议、平台配置预览与机械 fixtures；
不实现/触发平台资源。

**Locality** — 变更局限于 `coach/docs/specs`、`coach/fixtures/review-loop-v1`、一个
`coach/scripts` checker、`coach/package.json` 和 `coach/README.md` 导航。没有产品 runtime
实现穿越 workspace 边界。

**Invariants** — 保持 fail-closed、provenance、确定性/LLM 权威分离与 renderer/security
边界。协议规则由 `npm run test:review-loop-protocol` 机械保护；实际 GitHub/Multica
外部权限仍须部署时回读验证。

**Traceability** — live PR 拥有 current HEAD；repository spec 拥有验收语义；review issue
拥有 source review identity；原文 bytes 由 SHA-256 绑定；所有 effect 由 transition key
追到 source delivery/comment。

**Replaceability** — Controller、Reviewer、Fixer 通过 versioned envelope、issue/comment 与
GitHub SHA 交互；协议不依赖 Squad、sidecar 或模型私有格式。Agent model 是部署选择，不是
协议字段。

**Recoverability** — 重复 delivery、stale HEAD、malformed output、环境失败、缺失 gate、
冲突日志和 round exhaustion 都在 dispatch 前 fail closed。control issue/children/comments
允许从事件日志重放决策。

**Semantic Load** — 新增一个架构级抽象 `review-loop/v1`。它防止 review/fix 轮次的 stale
HEAD、重复 dispatch、LLM 转述丢失和无界循环；隔离的变化轴是 review orchestration
protocol。现有产品 contracts 不拥有跨 GitHub/Multica 的工作流状态，Ticket/Agent
instructions 也不是 durable owner；折入它们会把同一语义复制到临时协调面且无法用
fixtures 单点验证。因此由一个 repository spec + machine companions 承载。

**Verification** — 以实际 PR 交付记录为准；最低门禁为
`npm run test:review-loop-protocol`、`npm run check:architecture`、`git diff --check`。

### COAC-14 acceptance evidence — 2026-09-20

审查候选：`3fa9cfe416dad65c22baac98d1862833191c87c5` →
`f2d6bd6a46ef7f6c66066115a923ef2d31193f77`，PR #5。以下是该候选的独立复核，
不把协议 fixture 通过等同于平台部署或仓库全量验收通过。

- `npm run test:review-loop-protocol`：PASS，18 fixtures；不可信 Reviewer/Fixer、
  不可验证 webhook source 均 BLOCKED，可信 stale Fixer 有容量时继续 review，round 3 BLOCKED。
- `npm run typecheck`：PASS；`npm run check:architecture`：PASS，0 violations。
- `git diff --check 3fa9cfe..HEAD`：PASS。
- `npm run build`：exit 1，desktop `scripts/bundle-preload.mjs:12` 调用 esbuild，
  `node:internal/child_process:441` 抛出 `spawn EPERM`（errno -4048）。
- `npx vitest run`：exit 1，tinypool ProcessWorker 创建子进程时 `spawn EPERM`，未执行测试。
- `npm run test:package-import`、`npm test`：均 exit 1，前置 build 命中同一 esbuild
  `spawn EPERM`，后续测试未执行。

复现环境：Windows，Node.js v24.15.0；所有 npm 命令 cwd 为 `coach/`。上述四条失败命令
就是现有 durable gate/check，不另造替代门禁。工单要求的环境阻塞证据已提供，但关闭门槛
中的“相关测试通过”仍未满足；必须在允许这些子进程的环境对同一候选重跑相同命令并记录
通过结果，才能消除这一验收阻塞。审查未修改生产代码或平台资源。

平台读取核对：Multica CLI v0.5.0（commit `2df765a3c`）的 `autopilot --help` 没有
delivery read 子命令，`autopilot runs --help` 提供 runs 读取与分页；本轮未创建/触发
webhook，也未取得真实原始 delivery。因此 §3.1 的激活阻塞仍有效，本文顶部的
“ready for platform implementation”不得解释为获准启用 webhook。原始 delivery 读取路径
或新的 versioned hash/admission 语义须由负责人裁决并落盘后再实施。
