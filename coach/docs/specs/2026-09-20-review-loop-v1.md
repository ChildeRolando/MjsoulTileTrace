# Review Loop v1 protocol and Multica deployment specification

日期：2026-09-20

状态：路线 B 已批准并落实仓库协议；平台激活 BLOCKED（§3.11、§8）

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
[review-loop/v1][event][<run-id-prefix-12>] <owner>/<repo>#<pr-number>
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

`transition_key` 只绑定 effect，不含任何 source 字段。对以下八字段对象按
[RFC 8785/JCS](https://www.rfc-editor.org/rfc/rfc8785) 编码后取 UTF-8 lowercase SHA-256：

```json
{
  "protocol_version": "review-loop/v1",
  "ticket_issue_id": "<uuid>",
  "repository": "ChildeRolando/MjsoulTileTrace",
  "pr_number": 123,
  "base_sha": "<40 lowercase hex>",
  "current_head_sha": "<40 lowercase hex>",
  "round": 1,
  "transition": "DISCARD_AND_REVIEW"
}
```

`source_key` 对且仅对 `source_semantics`、`source_kind`、`source_id`、`source_sha256`
四字段对象采用同样 JCS/SHA-256 编码。Webhook 使用 §3 的 run/JCS 语义。
Review/Fixer comment 保持精确 content UTF-8 bytes hash（不规范化 CRLF 或尾换行），
source kind 分别是 `review_comment` / `fixer_comment`，source id 是 Multica comment UUID；
其既有 byte-exact 行为标记为 `multica-comment-utf8/v1`，不得与 webhook semantic hash 混用。
Schema `$defs.webhookSource`、`$defs.effectIdentity` 定义这两个独立封装；review observation
顶层仍由 §4 定义，不混入 webhook 字段。

Controller 在 child create 前完整读取 canonical root children、transition comments 与来源记录。
来源关联、live admission、schema/hash、冲突校验必须先于重复 shortcut；不能用重复记录
绕过已失效的 trust predicate。相同 source semantics/kind/id 对应不同 hash，或已有 child
title/key/immutable effect metadata 冲突，均 `BLOCKED`。Immutable effect metadata 是上面八字段；
child 的确定性 title、归属与执行角色也必须匹配，source provenance 列表是可追加审计记录。

相同 effect 的可信新 source（包括 push 与 PR 双事件）追加 provenance，返回
`NO_ACTION_ALREADY_DISPATCHED`，复用 child，不增 round。先从完整 ledger 找现有
base/head/transition 的 round，再决定是否分派；新 candidate 才消耗 next round，上限三轮。
既有 child/transition 记录不完整、分页失败或并发冲突都 fail closed，不创建后缀副本。

## 3. GitHub webhook admission — normalized Route B

以下十节是 COAC-15 用户裁决的 repository-owned 版本。Webhook URL/signing material
是秘密，不进入仓库、日志、issue 或 PR。Multica ingress delivery dedupe 与 effect dedupe
独立；run read path 不提供 raw bytes，且本版本不需要 raw delivery CLI。

**Decision: Route B — 批准新的 versioned normalized webhook admission/hash semantics。**

语义标识：

`multica-github-run-jcs/v1`

本裁决不声称 Multica `trigger_payload` 等于原始 HTTP request，不声称其 hash 是 raw request body hash，也不从解析后的 JSON 重构原始 bytes。

### 3.1. Trust boundary

Review Loop v1 webhook source 信任的是：

1. Multica 已完成 webhook ingress admission；
2. 对应 trigger 固定为 `provider=github`；
3. 部署回读必须证明该 trigger `has_signing_secret=true`；
4. Multica 在创建 Autopilot run 前已经完成 GitHub-compatible HMAC 校验；
5. Controller 再通过 live GitHub 查询验证 repository、PR、state、draft、base SHA 和 head SHA。

Webhook payload 只提供“发生了一个候选事件”的来源证据，不拥有当前 GitHub 状态。

若 trigger 不是 GitHub provider、没有 signing secret、run/source/trigger/issue 关联无法唯一验证，则 `BLOCKED`。

### 3.2. Source association

Controller 仍以：

`multica autopilot runs <autopilot-id> --output json`

为 repository-approved read path。

对 intake `issue_id` 必须精确匹配唯一一条 run，并要求：

- `run.issue_id == intake_issue_id`
- `run.source == "webhook"`
- `run.trigger_id == configured_trigger_id`
- run 属于配置的 Review Loop Autopilot
- `trigger_payload.eventPayload` 存在且是 JSON object
- 零条、多条或字段冲突均 `BLOCKED`

### 3.3. Source identity

新的 webhook source 字段定义为：

- `source_kind = "multica_github_run"`
- `source_id = <autopilot_run.id>`
- `source_semantics = "multica-github-run-jcs/v1"`

不再要求 Controller 取得 provider `X-GitHub-Delivery` 作为协议 source id。

Multica 自身仍可使用 `X-GitHub-Delivery` 做 ingress dedupe；这是平台内部 admission 行为，不伪装成 Review Loop 可审计字段。

### 3.4. Source hash

`source_sha256` 定义为：

`lowercase_sha256(UTF8(JCS(trigger_payload.eventPayload)))`

其中 JCS 为 RFC 8785 canonical JSON。

明确排除：

- `trigger_payload.event`
- `trigger_payload.request.receivedAt`
- `trigger_payload.request.contentType`
- 任意重新构造的 HTTP headers
- provider delivery id

因此该 hash 的准确名称和语义是：

> **normalized GitHub event payload semantic hash**

不是：

> raw webhook request body hash

相同 JSON 语义、不同原始空白/字段顺序在此版本中有意得到同一 hash。若未来需要 byte-exact provenance，必须发布新的 source semantics version，不得静默改变本规则。

### 3.5. Event classification

Controller **不得信任 `trigger_payload.event` 作为 event/action 权威**。

event family 从 `trigger_payload.eventPayload` 的严格结构机械分类。

#### `pull_request`

必须同时满足：

- `repository.full_name == "ChildeRolando/MjsoulTileTrace"`
- 存在合法 `pull_request`
- 存在 PR number
- `action` 恰为：
  - `opened`
  - `reopened`
  - `synchronize`
  - `ready_for_review`
- body 中 base/head/repository identity 形状合法

随后必须通过 live GitHub 查询重新验证：

- PR 存在；
- open；
- non-draft；
- repository 正确；
- live base/head SHA 合法。

payload 中 SHA 不是当前状态权威。

#### `push`

必须满足严格 push payload shape，包括：

- `repository.full_name == "ChildeRolando/MjsoulTileTrace"`
- `ref`
- 40 位 lowercase `before`
- 40 位 lowercase `after`
- `deleted == false`
- 不得同时匹配 pull_request shape

随后 live GitHub 查询必须证明 `after` 恰好是唯一一个 open、non-draft admitted PR 的当前 live head。

无法唯一映射则 `BLOCKED`。

#### Unknown / ambiguous

同时匹配多个 event family、一个也不匹配、字段缺失或 unsupported event 均：

`BLOCKED`

不得从 prose、`trigger_payload.event` 或近似字段猜测。

### 3.6. Effect idempotency 与 source provenance 分离

为正确处理 GitHub 对同一 HEAD 同时产生 `push` 和 `pull_request.synchronize` 等合法双事件：

**source identity 不再参与“是否已经执行这个 effect”的唯一键。**

新增两个概念：

#### `source_key`

绑定来源：

- source semantics
- source kind
- source id
- source SHA-256

用于 provenance 与冲突检查。

#### `transition_key`

只绑定 effect：

- `protocol_version`
- `ticket_issue_id`
- `repository`
- `pr_number`
- `base_sha`
- `current_head_sha`
- `round`
- `transition`

按 RFC 8785/JCS 后 SHA-256。

若两个独立、均可信的 webhook source 导向完全相同的 transition/head/round：

`NO_ACTION_ALREADY_DISPATCHED`

并保留额外 source provenance，不创建第二个 child。

若相同 effect identity 下已有 child，但其 immutable metadata 与期望 transition/head/round 不一致：

`BLOCKED`

这样平台 delivery dedupe 和 Review Loop effect dedupe 是两层独立机制，不依赖 provider delivery id 才能正确工作。

### 3.7. Failure semantics

以下任何情况必须在 child dispatch 前 `BLOCKED`：

- intake → run 无法唯一关联；
- source / trigger / Autopilot 不匹配；
- GitHub provider/signing prerequisite 不满足；
- eventPayload malformed；
- event classification unknown 或 ambiguous；
- live GitHub 查询失败；
- repository / PR / ticket admission 不一致；
- JCS/hash 失败；
- source provenance 冲突；
- effect metadata 冲突。

不得 fallback 到旧的 raw-body 语义，不得把重新序列化后的 payload 描述成原始请求。

### 3.8. Required repository updates

实施负责人必须同步修改：

1. `2026-09-20-review-loop-v1.md`
2. `review-loop-v1.multica.json`
3. review-loop protocol schema/checker（如字段发生变化）
4. `decision-cases.json`

fixtures 至少增加/修订：

- valid signed normalized pull_request source
- valid normalized push source
- malformed eventPayload
- ambiguous event shape
- wrong repository
- wrong trigger/run association
- unsigned/non-GitHub trigger deployment configuration
- duplicate same run
- distinct push + pull_request events resolving to same HEAD/effect
- same effect metadata conflict
- stale payload but newer live HEAD
- live GitHub lookup failure

机械检查仍至少要求：

- `npm run test:review-loop-protocol`
- `npm run check:architecture`
- `git diff --check`

### 3.9. Activation gate — inactive configuration before activation

本裁决**解除“必须等待 raw delivery CLI”的架构决策阻塞**，但不立即授权启用 webhook。

只有在：

- 上述 B 语义已经进入部署引用的权威 commit；
- spec / manifest / fixtures / Controller instructions 一致；
- protocol fixtures 与规定 gates 通过；
- 部署回读确认 `provider=github`、`has_signing_secret=true`、trigger/filter/Controller 配置正确；

之后才可以创建外部事件订阅并启用 Review Loop webhook。为满足回读前置条件，内部 trigger 只能先在已证明安全、不可接收/派发事件的配置阶段创建；如果平台不能保证该顺序，必须停止。详见 §8。

### 3.10. Future raw-delivery support

若以后 Multica 正式向 Agent/CLI 暴露可稳定关联的 raw delivery read surface，可以新增例如：

`multica-github-raw-delivery/v1`

但它必须作为新的 source semantics version 单独验收。

不得把现有 `multica-github-run-jcs/v1` 的 hash 定义原地改成 raw-body hash。

### 3.11. Executable shape and platform evidence

`scripts/review-loop-source.mjs` 是离线协议参考模型，不发送 CLI/API、不验证真实 HMAC、
不创建 child。fixtures 中 `config.hmac_before_run_verified=true` 只是模拟已验收部署证据；
Controller 必须从平台负责人确认的 ingress contract/验证记录获得该事实，不能从 payload
自报或由 `has_signing_secret` 单独推导。Manifest 当前值为 false，激活保持 BLOCKED。

机械 shape 明确如下：eventPayload 必须是 object；PR 顶层 `number` 是正安全整数，且等于
`pull_request.number`；base/head 各自包含非空 ref、40 位 lowercase SHA 和本仓库
`repo.full_name`（fork 不接纳）。Push ref 必须是非空 `refs/heads/...`，after 不得全零。
PR 标志字段为 pull_request/number/action；push 标志字段为 ref/before/after/deleted。
两组任意字段同时出现也拒绝，防止残缺的另一 family 被宽松分类。额外 GitHub 非判别字段
保留在 semantic hash 中，不参与近似猜测。Live push 候选必须唯一，且该唯一候选通过
repository、open/non-draft、ticket/project/spec/gate admission；不能靠过滤掉 admission
失败的 PR 将多候选伪装成唯一。PR payload 的旧 SHA 不覆盖 live SHA；stale push 的 after
若已不是 live head 则 BLOCKED。

JCS 对 JSON object 递归排序 UTF-16 keys，保持数组顺序和字符串 Unicode，不接受
non-finite number、lone surrogate 或其他非 JSON 值；序列化失败即 BLOCKED。这里只 hash
平台解析后的 eventPayload，不能恢复入站重复字段或原始数字字节，也不声称可以检测它们。
run 读取必须完成 `--limit/--offset` 分页，唯一性不能从默认第一页推断；live 查询亦须完整。

2026-09-20 只读核验：Multica CLI v0.5.0，commit `2df765a3c`。

- `autopilot --help` 无 delivery 子命令；`runs --help` 提供 limit/offset。
- `trigger-add --help` 只有 kind/cron/label/timezone；没有 provider、signing secret 或初始
  disabled 参数。`trigger-update --help` 有 enabled，但没有 provider/signing secret。
- `autopilot create --help` 未提供初始 paused；先创建再暂停的窗口不能假设安全。
- `autopilot list` 只返回现有“每日进度报告”。其 `get` 的 schedule trigger 回读包含
  `provider=null`、`has_signing_secret=false`；`runs` 返回 schedule source 与 null payload。
  这证明字段可读，不证明 GitHub signed trigger 可配置，更不证明 pre-run HMAC 已生效。
- 未创建/修改 Agent、Autopilot、webhook，未调用 API 绕过 CLI，未读取任何 secrets。

**剩余激活阻塞与负责人动作**：Multica 平台负责人需提供 CLI 支持的 GitHub provider/
signing 配置途径，以及从创建开始就禁止 ingress/dispatch 的安全配置顺序；随后在授权部署
阶段回读真实 Review Loop trigger 的 provider/signing 标志，验证签名无效时不能创建 run、
签名有效时先 admission 后 run 的平台保证，并验证 Controller/filter/关联。没有这些证据，
部署负责人不能启用事件。仓库 fixtures 通过不解除此阻塞，也不需要重新等待 raw delivery。

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
| 1 | source/admission/schema/live checks passed, no source/effect conflict, exact effect/child already recorded with identical immutable metadata (possibly a distinct trusted source) | `NO_ACTION_ALREADY_DISPATCHED` | 不创建、不重发、不改 round |
| 2 | duplicate title/key/source exists but any immutable metadata/hash/result conflicts | `BLOCKED` | 记录 conflict，零 dispatch |
| 3 | unsupported/malformed input；webhook normalized source 或 provider/signing/HMAC 前置条件不可验证；identity/spec/live PR 不可验证；Reviewer/Fixer 作者或 comment/child 归属不匹配；review envelope/hash/verdict 自相矛盾；multiple conflicting results | `BLOCKED` | 零 dispatch |
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

1. 部署引用的 commit 必须包含路线 B 的 spec/manifest/schema/checker/fixtures，规定 gates
   通过；重新只读核验 runtime/project/Fixer/model IDs。
2. 平台负责人先证明安全的 inactive 配置途径（§3.11），否则停止。不能执行当前裸
   `trigger-add --kind webhook` 再补 signing；没有 provider/signing 参数时也不能猜参数。
3. 在后续授权的部署阶段创建 Controller，回填 ID 后创建 Reviewer，再把 Reviewer ID
   回填 Controller；任何创建失败立即停止，不创建替代资源、不修改仓库律法审查官。
4. 仅通过已核验的 CLI 能力建立 paused Autopilot 与 disabled GitHub signed trigger。
   manifest 中 paused/enabled=false 是要求，**不是当前 CLI 已支持该原子创建的声明**。
   若必须先经历可能接收事件的 active/unsigned 状态，停止并报告平台缺口。
5. 在事件仍不可进入时回读 provider=github、has_signing_secret=true、trigger 所属 Autopilot、
   project、Controller/Reviewer instructions hash、模型、权限、并发、events/actions filter；
   取得 HMAC-before-run 证据。所有回读必须来自本次实际配置，不能引用测试 fixture。
6. 配置仍为 inactive 的 GitHub pull_request/push 订阅，URL/signing material 仅进入 secret
   配置面；全部前置条件通过后才允许事件启用。启用后回读配置，不主动发送测试事件。

目前没有可安全执行的 Autopilot/webhook 创建命令预览：CLI 缺口见 §3.11，manifest 的
`cli_preview` 仅保留 Agent 配置样例；不以成功的 CLI exit code 代替部署验收。
本工单只完成仓库协议与只读核验，不执行任何平台部署，不创建 Squad。

## 9. Fixtures and acceptance

`decision-cases.json` 至少冻结：clean pass、P1、P2、P3-only、gate fail、environment
blocked、malformed、stale HEAD、stale Fixer（含 round 3）、untrusted Reviewer/Fixer、
unverifiable webhook source、round 3、duplicate transition、conflicting results；另有
initial candidate 与 Fixer new-head 用例。检查器必须证明每个 fixture 只得到一个允许的
transition、所有未知组合 fail closed、配置中 Controller 并发为 1、Autopilot 不含非法
title token、Fixer ID 被复用且无 Squad。

新增 `webhook_cases` 直接输入模拟 CLI run/config 与 live PR，而非用一个 true flag
假装 admission 已检查；覆盖签名配置前置、source 关联、严格 shape、错误 repository/ticket、
重复 run、push+PR 相同 effect、source/effect 冲突、stale live head、查询失败与三轮上限。
`test:review-loop-protocol` 同时运行既有 review/fixer 状态机 fixtures 和 normalized source
tests。真实 HMAC/平台读写仍是外部验收，不由离线测试证明。

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
绑定八字段 identity，再由追加的 source_key 追到 run/comment。

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

### COAC-15 Route B change control — 2026-09-20

- Scope / Locality：只改本协议及 manifest/schema、fixtures、离线 checker/test 与命令接线；
  不改变产品包或平台资源。原 checkout 的无关未提交内容保持原样。
- Invariants：INV-006 fail closed、INV-007 version/provenance 的已有规则由 normalized
  admission/冲突 fixtures 扩展保护；没有削弱或新建不变量。HMAC 为待外部验收部分。
- Traceability：用户十节裁决成为 §3.1–3.10；live PR 仍拥有当前状态；source hash 明确是
  normalized eventPayload semantic hash，不是 raw-body。schema defs 与 manifest 同步。
- Replaceability：来源语义采用 versioned identifier；未来 raw delivery 必须新版本验收。
- Recoverability：strict shape、关联、JCS、provenance/effect 冲突在 dispatch 前拒绝；
  push/PR 双事件复用 effect 并记录两份来源；离线 fixtures 可重放。
- Semantic Load：source_key/effect key 折入既有 Review Loop identity owner；拆分防止同 HEAD
  双事件重复 dispatch，隔离来源与副作用去重，不新增服务或第二套日志。
- Verification：基于默认分支 `4e41784bc765b6cd0306fe9c5084ba31f85d6854`，Windows /
  Node.js v24.15.0，cwd `coach/`：`npm test` exit 0（162 files / 1902 tests，包含 build、
  脚本测试与架构检查）；`npm run typecheck`、`npm run test:package-import` exit 0；
  `npm audit --omit=dev` exit 0、0 vulnerabilities。`npm run test:review-loop-protocol`
  exit 0（18 个既有决策 fixtures、40 个 webhook scenarios + 2 个 coverage/JCS/schema tests）；
  `npm run check:architecture` exit 0、0 violations；`git diff --check` exit 0。
  独立工作树初次依赖安装因 cache 目录写入被拒失败，改用该工作树内 cache 后安装成功，
  随后上述原命令全部通过；未修改 ACL 或绕过沙箱。平台证据边界仍按 §3.11。

以下 COAC-14 记录是历史候选的验收证据，不是当前激活规则；其中等待 raw delivery/裁决的
旧阻塞由本次路线 B 取代，当前剩余阻塞仅按 §3.11/§8 判定。

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

#### Gate rerun — candidate `e7df092`, 2026-09-20

应用户要求在新的 Multica 运行中补跑相同门禁。子进程创建限制已解除，但 desktop build
仍被 workspace 产物写入边界阻断：

- `npx vitest run`：exit 0，161 test files、1851 tests 全部通过；
- `npm run test:review-loop-protocol`、`npm run typecheck`、
  `npm run check:architecture`：均 PASS，架构检查 0 violations；
- `npm run build`：exit 1；esbuild 已成功启动，但写入既存
  `packages/desktop/dist/preload.bundle.cjs` 时返回 `Access is denied`；
- `npm run test:package-import`、`npm test`：均 exit 1，停在相同的前置 build 写入失败，
  后续阶段未执行；
- 目标文件属性为 `Archive`、`IsReadOnly=False`；这不足以判定拒绝来源，未修改 ACL、沙箱
  配置或生产 bundler 来规避门禁。

因此 Vitest 门禁已经补齐通过证据；build、package-import 与 full 仍未通过，关闭阻塞尚未
清零。当前失败与 Review Loop 协议逻辑无关，但必须由运行环境修复该工作区输出文件写入
边界后，对 PR HEAD 重跑原命令。

#### Gate rerun — candidate `05d82bf`, 2026-09-20

宿主已恢复被旧沙箱身份创建的、Git 忽略的
`packages/desktop/dist/preload.bundle.cjs` 产物生命周期；生产 bundler 与候选 HEAD 字节一致，
本轮未修改 ACL、沙箱配置或生产代码。随后在 Windows / Node.js v24.15.0、cwd `coach/`
对 PR #5 HEAD `05d82bf01e13971da142a9040bfdb41f67294aff` 重跑原门禁：

- `npm test`：exit 0；build、161 个 Vitest files / 1851 tests、协议 updater / compatibility、
  18 个 Review Loop fixtures 与架构检查全部通过；
- `npm run test:package-import`：exit 0，workspace packages 从 emitted JavaScript 导入成功；
- `npm run typecheck`：exit 0；`npm audit --omit=dev`：exit 0，0 vulnerabilities；
- `npm run test:review-loop-protocol`：exit 0，18 fixtures / 5 transitions；
- `git diff --check 3fa9cfe..HEAD`：exit 0。

先前由 `spawn EPERM` 和既存 bundle 写入拒绝造成的环境门禁阻塞至此清零。§3.1 的 webhook
激活阻塞不变：以上仓库验收通过不证明平台提供 raw delivery headers/body bytes，也不授权创建
或启用 webhook。
