# 自动评审与修复

当前实现：Review Loop v2.1，2026-09-21 完成受审代码部署、状态迁移和真实平台 smoke。

Controller 创建的审查、修复和知识持久化工单使用简体中文标题与说明；协议字段、枚举、命令、路径、SHA、分支名和 JSON fence 保持机器约定的原文。
2026-09-20 的 v2 人工风险放行不是独立评审 PASS；其已知问题和原始结论仍保留如下。
权威协议：[v2 spec](../specs/2026-09-20-review-loop-v2.md)。

COAC-30 代码协议已升级并部署为 `review-loop/v2.1`。finding 独立声明 severity 与
durability；P3 ephemeral 可直接 PASS，P3 repository_required 在独立分支持久化，
不会因此否决原 PR。Reviewer human/runtime policy 的单一权威源为
`scripts/review-loop/reviewer-instructions.md`，`controller.mjs` 读取该文件并仅组合本轮
固定参数、门禁与结果字段，严格 schema/validation 由 `protocol.mjs` 拥有。
直接证伪显式验收/不变量声明的 finding 至少 P2，且必须 repository_required。

fresh reviewer 保持独立新会话，但不是历史盲审：可按需读取与当前 PR 直接相关的父/兄弟
issue、历史讨论、finding、复现和修复说明。历史仅为 evidence/claim；不得继承旧 PASS 或
fixed，必须对 pinned base/head 的 current candidate 重新验证，也不得浏览无关 session/
private state 或改变固定 identity、rubric、gates、permissions。

`pr-N.json` 的 durability 队列保存原 review issue/comment/run/hash/head/finding；
health 的 durability 数组显示 WAITING、RETRY_IO、DURABLE_KNOWLEDGE_BLOCKED 或 COMPLETE。
即使原 PR 已关闭也继续扫描。仅在核验独立远端分支中的新 commit、已改变的 owner/
regression 普通文件及 blob hashes、指定 agent/completed run 的严格 receipt 后 COMPLETE；
工单 done/in_review 本身不构成完成。验收回执的命令 PASS 是受信 agent 的报告，Git
内容与远端可达性由 Controller 独立核验；Controller 不执行 finding 提供的任意命令，
也不使用 LLM 判断改动语义。是否充分解决 finding 仍由 follow-up 的人工验收负责。
durability follow-up 提交不自动合并，owner 可以从 receipt 的 branch/commit 审查合入。

### 自动合并交付状态（COAC-65）

权威契约见 spec 的“COAC-65：独立评审 PASS 后自动合并”。COAC-66 候选已在同一
Controller/runtime、`pr-N.json`、deployment lock 和 Autopilot 内实现 fail-closed merge
阶段；`auto_merge` 配置独立版本化且示例默认 `enabled=false`。2026-09-22 的 COAC-71
round 3 对候选 `776bc3e1434ae4c2c2a68f03681ebcc653715bac` 给出
`CHANGES_REQUIRED`：required commit-status 历史尚未按 context 归一化为最新状态，且明确
merge 请求失败后的同账号外部合并仍可能被误归属为 Controller 成功。Controller 已在默认
三轮上限记录 `BLOCKED`，GitHub `Review Loop v2` 状态为 failure。因没有可信独立 PASS，
**PR #16 未人工合并，也未执行 disabled 部署、受控验收或生产启用**；生产继续运行既有
Review Loop v2.1，`auto_merge.enabled=false`，现有生产 PASS 不会自行合并 PR。恢复交付前
必须先在现有 owner/test 中修复上述两项并取得重新授权的 fresh independent PASS；不得以
旧轮次结果或人工声明放行。

候选把最后一次严格解析的 review result 的 issue/run/comment/raw hash、五门结果、base/head
和零 P1/P2 证明固化到原 ledger；每次写前以 GitHub 实时 PR、repository merge policy、
调用者、collaborator permission、branch protection、适用 rulesets/bypass actors、commit
statuses、check runs 和 mergeability 重建并哈希 eligibility。任何分页、规则类型、bypass
归属、required check 身份或权限无法解释均拒绝。intent 在请求前原子落入同一 ledger，固定
`merge` 和 expected HEAD；重复 tick 先回读，disabled 只允许回读，不发送或重发。health
只公开已净化的 eligibility、intent 和 read-back，不记录 token、webhook URL 或上游错误正文。

冻结的运行选择是普通 merge commit、expected HEAD REST precondition、运行时完整读取
applicable protection/rulesets/required checks、普通 write 权限且调用者不得拥有适用 bypass、
合并后强制回读。`auto_merge.enabled=false` 是独立 kill switch；停用不影响 review/fix/
durability 扫描，尤其 closed PR 的 P3 repository_required follow-up 必须继续。实现 PR 必须
先走当前独立评审流程并由人工普通合并，再以 disabled 部署/read-back 和专用受控验收 PR
证明 allow/deny 路径后才能生产启用；不能让新逻辑为自身放行。

生产启用后的操作顺序必须是：暂停 trigger → 持锁并备份 ledger/evidence/config → 部署固定
受审 SHA 且 `auto_merge.enabled=false` → 回读调用者/权限/规则和一次零 merge-write tick →
受控验收 → 原子启用 → 恢复 trigger → 回读 health、实际 deployment SHA 和验收 PR 的
merge commit。停用/回滚反向执行并保留 intent/evidence；已完成 merge 不自动 revert，
head branch 不自动删除。实现、部署、验证证据尚未落盘前不得把本节写成“已启用”。

### v2 → v2.1 migration / deployment acceptance

本节是 stage 2 的执行 owner；2026-09-21 的首次 v2.1 生产迁移记录见“验证与证据”。

1. **冻结与备份**：暂停 webhook/schedule/Autopilot，将部署 config 设为
   `enabled=false`，确认无活动 Controller/Reviewer/Fixer/durability run，并持有唯一
   deployment lock。备份 config、全部 `pr-N.json`、`results/`、`snapshots/`、
   `publication-*.json`、health 和 evidence；记录备份 hash/位置及旧 deployment SHA。
2. **盘点旧状态**：逐个列出 v2 pending review/fix 与终态 ledger，完成或人工裁定旧在途
   job。不得删除 ledger、重置 round/history/authorization、重写已完成 review evidence，
   也不得为历史 P3 猜 durability。旧 PASS 撤销为待重新核验；在保留预算内按 v2.1 重新
   review，预算耗尽则保持 BLOCKED。
3. **部署受审候选**：只有 COAC-32 独立 code review PASS 且受审远端 SHA 已固定，才更新
   受信 deployment checkout。旧 checkout 可快进时快进；如受审分支因重组而与旧 checkout
   无祖先关系，必须新建 clean detached trusted checkout 固定到该 SHA，保留旧 checkout 和
   完整备份作为回滚点，不得 reset/强行改写旧部署目录。更新 protocol/controller/runtime、
   `reviewer-instructions.md` 和 config；如部署流程另有 Reviewer Agent prompt/config，必须
   从同一 instruction source 同步。禁止并行运行两个指向同组 PR 的 state directory。
4. **disabled read-back**：保持 `enabled=false`，回读 checkout SHA、config、Agent/Autopilot
   配置和实际 Reviewer prompt，确认 `protocol_version == review-loop/v2.1`、prompt 包含
   durability metadata 与 relevant-history policy、Controller/Autopilot 指向新 trusted
   checkout，且一次真实只读 tick 零 dispatch。任一不符立即回滚到旧 checkout/config，
   保留新旧 ledger/evidence 备份，不恢复触发。
5. **runtime smoke**：在隔离验收 PR/账本验证 P3 ephemeral PASS 且无 follow-up；P3
   repository_required PASS、exactly-once follow-up 且 duplicate tick 不重复；P2
   repository_required 路由 Fixer 并完整携带 metadata；closed PR 的 outstanding durability
   继续处理。伪造 author/run/commit/branch/hash、unchanged owner、missing/failed regression
   均必须返回 `DURABLE_KNOWLEDGE_BLOCKED`，不得 COMPLETE。
6. **恢复与记录**：保存 read-back/smoke 的命令、exit code、ledger identity、issue/run/
   comment/hash/head 与 deployment SHA。全部通过后才启用 config 并恢复 trigger；失败则保持
   disabled，按第 4 步回滚。PR merge/code deploy 不能单独证明 runtime migration 完成。

新任务使用 `config.example.json` 和 v2.1 admission。stage 2 完成前不得把 COAC-30 关闭。

流程：Multica webhook/schedule → 受信本机 Controller → GitHub live PR → fresh Reviewer
→ 完整 findings → 现有 Fixer → pushed HEAD → 下一轮 fresh Reviewer。默认最多三轮；
任意 PR 的第四、第五轮都必须分别获得一次明确人工批准，并各自绑定上一轮 BLOCKED 证据；
两次授权与原有轮次一起留存在 ledger，绝不开放第六轮。

## 接入 PR

将编码 Ticket 交给现有 `Ticket 编码执行器`。该智能体已接入本指南：推送实现后创建/
更新同仓库 PR，填写该 Ticket 实际适用的权威文档和验收要求，准备完成后由五分钟
schedule 自动发现。需要用户裁决的 PR 保持待确认。无需为每个 Ticket 配 webhook。

在 PR description 加入 spec 中的 `review-loop-admission` block，填写实际批准的 spec
路径和验收 rubric。只接受同仓库已推送且 ready 的 PR。无需 GitHub 正式 approval
或额外 reviewer 账号；独立评审身份与普通 write 合并身份必须分开。结果在 GitHub
`Review Loop v2` status 和 Multica issue。
GitHub status 是同提交所有已接入 PR 的聚合门禁，单个 PR 的结论以其 ledger 和评审
原文为准。共享提交上只有所有 live 候选都通过才会显示 success。

配置与 ledger 保存在专用部署目录外的本机私有状态目录。示例配置见
`scripts/review-loop/config.example.json`。首次 enabled=false，用真实 GitHub 只读检查后启用。
所有路径须绝对路径；CLI profile/workspace 必须明确。部署 checkout 固定受审版本，不能
指向任意 PR checkout。现有用户 checkout 与未提交工作不会被覆盖。

```powershell
node coach/scripts/review-loop/runtime.mjs tick C:\absolute\review-loop.local.json
```

Multica Controller 智能体只运行此命令，程序承担同一控制角色的状态判断和派发。
Autopilot run_only，Agent concurrency=1，schedule 每五分钟，
generic webhook 作为可选即时唤醒。URL 只保存在本机 secret file 或 secret store，POST body
只用于唤醒，不能指定命令、repository、HEAD 或结果。通知可用稳定 Idempotency-Key 减少重复
Controller run；程序仍靠 ledger 防重复任务。Controller Autopilot 不绑定项目的
in-place 本机目录，避免与 Reviewer/Fixer 争用目录锁；评审/修复工单仍属于 Coach 项目。

## 故障与恢复

- `health.json`：最近成功扫描时刻、PR 状态、轮次和当前 issue；超过两次周期未更新先查
  Multica Autopilot runs、daemon 和主机在线情况。智能体 run 显示 completed 不足以证明
  程序成功，须同时核对程序 JSON 和 health 更新时间；固定命令执行失败会等待下次唤醒。
- `pr-N.json`：完整轮次与来源账本；`results/<issue>-<hash>.json` 保存按内容寻址的结果，
  评论替换不覆盖旧证据；`snapshots/` 保存 GitHub 观察。durability 原文同时保存在队列。
- BLOCKED：先读 reason 与对应 issue。已有 tasks 的实际状态通过 `multica issue runs` 核实。
  首次准入在 round 0 因 admission/spec 暂时无效而失败时，只要 ledger 仍无
  `admission_hash`、job、pending 与 history，修正 PR 后下一次 tick 会记录
  `recover_initial_admission` 并重新准入；任何已经冻结身份或产生历史的 ledger 都不会
  走这条自动恢复路径。
  不能因为观察超时就重新创建任务，不能删除 ledger 绕过轮次上限。
- 人工追加：只有收到针对该 PR 的明确批准后，暂停 Autopilot、设置 enabled=false，
  核验无活动 Controller，再持锁备份 ledger、验证第三轮原文 hash 与来源，调用
  `authorizeExtraReview` 并原子保存。保留全部 round/history；第一次仅允许第四轮。
  如需第五轮，必须取得第二次明确批准，另绑定第四轮结果并验证原授权；该规则适用于
  任意 PR，最多第五轮，不开放第六轮。
  普通 tick 不会自动恢复 BLOCKED；达到已批准上限仍有阻断项则停止。
- `publication-<sha>.json`：同一提交的成员集与聚合发布缓存。它不授予 PASS，源事实仍
  是实时 GitHub 状态及每个 PR 的已核验 ledger；旧 per-PR published 字段不再用于发布。
  POST 前缓存先落为 uncertain；响应丢失或进程中断后，下次会按实时聚合重新发布。
- 孤儿锁：暂停 Autopilot，核实 PID 已退出后运行 `runtime.mjs recover-lock <config>`；
  该命令会拒绝仍存在的 PID。恢复后重新 tick 并回读任务，最后恢复 Autopilot。
- 暂停：Autopilot pause 并将 enabled=false；已经分派的 agent run 不会因此自动取消，须
  单独查询并决定取消，避免误认为写操作已经停止。
- 自动合并停用：先暂停 trigger，将 `auto_merge.enabled=false`，再运行 disabled tick 回读
  零 merge write 后恢复 review trigger。保留 merge intent、attempt 和 read-back evidence；
  网络未知结果先 reconcile，不通过删除 ledger 或重复请求来“恢复”。
- 升级：严格执行上文 v2 → v2.1 migration/deployment acceptance；不得以替换 checkout 或
  PR merge 代替 ledger migration、disabled read-back 与 runtime smoke。

## 验证与证据

`npm run test:review-loop-protocol` 检查生产状态机与适配器；五项门禁仍依 spec 原样运行。

### 2026-09-21 v2.1 migration / deployment（COAC-33）

- [PR #11](https://github.com/ChildeRolando/MjsoulTileTrace/pull/11) 的受审 HEAD
  `cdf76c63f7df705f9f4af178cda243943271a10f` 在生产 v2 的 COAC-40 round 5 获得
  `NO_P1_P2`；run `01a0c0fc-7bc8-7beb-a85c-b099361948f9`、comment
  `01a0c100-c56f-7535-87cb-456a43a0f413`、原文 SHA-256
  `3803e62e1ee7cc7d8d7136344bd99f26f9340f9cccdc1b235787e264badedaab`。五门全部
  PASS，Vitest 165 文件 / 1,916 项。PR 合并提交为
  `439045b52e131916be14fc9eb44fa12bb323e49e`；部署仍固定到受审 HEAD，不以合并动作代替评审。
- 迁移前暂停 Autopilot、webhook 与 schedule，并设置 `enabled=false`。早期快照
  `backups/2026-09-21-v2.1-predeploy`（56 个 payload；manifest SHA-256
  `1a5dc679f52b901f0f85e3092eccce4740be2d723b97178d44099e3a536a7527`）仅到 PR #11
  round 3，不能单独作为最终回滚点。补齐 round 4/5 后的 post-review 快照 manifest 为
  `b2af0782ffe937789b0d79ab6ad8c87faef6be5a3d03a3e13dd3cb6811d3f092`。
- 旧 SHA 不是受审 HEAD 的祖先，因此没有伪造“快进”：保留旧 `review-loop-v2` checkout，
  新建 clean detached `review-loop-v2.1` checkout 固定到受审 HEAD。旧 checkout SHA 为
  `ece3fd23bfc194e14dd4ff70d8d9acc72f270268`；其两处临时授权修改未当作已提交代码，原始
  patch 已单独归档（SHA-256
  `ad3daf8d15f616c18766b2c62c612bf9dfd66f71b8d5f968b34f95846a39c247`）。回滚须从该旧
  SHA 新建 clean checkout，再在锁内只切换 protocol/config/prompt identity；不得复用 dirty 目录。
- `pr-8/10/11` 保留全部原文、round、history、authorization 和 result。旧 v2 PASS 不继承：
  PR #10/#11 分别追加 `migration_revoke_legacy_pass`，PR #8 追加
  `migration_preserve_legacy_block`；迁移终态为 `BLOCKED/r5/history=21`、
  `BLOCKED/r3/history=9`、`BLOCKED/r5/history=18`。最终私有证据备份
  `backups/2026-09-21-v2.1-final` 含 81 个 payload（含隔离 smoke ledger），manifest
  SHA-256 `656adb5cf0c1c9d698fd0483c5ceb079a91239ed509bcc2437edd87789e5808e`。
- disabled read-back 确认 checkout clean、SHA/config/三个 ledger 均为 v2.1，Controller 指向
  新 trusted checkout；平台 Reviewer instructions 与仓库单一权威源逐字一致，SHA-256
  均为 `0becc9acf516faac1c39a932c279d4d5316d6e41c1d021d7330d163641fcb8d6`。
  真实 disabled tick 返回 `enabled=false`、`prs=[]`，零派发。
- 部署目录执行 `npm run test:review-loop-protocol` 为 56/56 PASS；这是代码/本地 Git 回归，
  不冒充真实平台 smoke。其覆盖真实 Git durability、
  P3 ephemeral/repository_required、P2 Fixer metadata、closed PR 队列、exactly-once、伪造
  author/run/commit/branch/hash、missing commit/branch、unchanged artifact、failed regression 与
  transport retry 对照。
- 另以部署 checkout 的同一 `runtime.mjs` `tick` 和独立私有 state 运行真实 Multica 平台
  smoke；PR identity/snapshot/publication 为隔离合成输入，issue/create/run/comment/attachment
  与 Git remote verification 均走真实适配器。COAC-42（run
  `01a0c11a-7390-74f6-bbcf-59e95d70b94d`、comment
  `01a0c11b-ce07-7bb6-8684-c5d9d7f25711`、result hash
  `ba2fb6230893476c8362b54a5eb63c748180a5c1553c029eb74cfd87311ec4da`）验证 P3 ephemeral
  PASS 且零 follow-up。COAC-43 验证 P3 repository_required PASS，并 exactly-once 创建唯一
  COAC-45；duplicate tick 未重复。将该隔离 PR 从 open 集移除后，closed-ledger 扫描仍消费
  COAC-45 的 completed run `01a0c11e-3a12-7747-9d4b-f09cafd2c55c` / comment
  `01a0c11e-f52c-76e0-b0bf-9caf3cde9084`，把真实作者/run 但不存在的远端 branch 判为
  `DURABLE_KNOWLEDGE_BLOCKED`，错误为 `durability branch missing from reachable origin`。
- COAC-44 的 P2 repository_required 结果（run
  `01a0c11a-8fd6-7b71-a9b1-bda28bb226fb`、comment
  `01a0c11d-ce36-7adc-9f2e-bab26cee52c5`、raw hash
  `419fec251fb518f3fa8725bc32b4b2a330f57384f5a02f6f84d47c2399fe7e68`）路由唯一 COAC-46。
  COAC-46 attachment 文件名与 raw hash 一致，完整保留 severity/durability/owner/basis；其
  completed run/comment 也由 Controller 校验。隔离 smoke 共且仅共五个唯一任务
  COAC-42—46；完成后任务置 done，两个临时 receipt actor 已归档。
- webhook URL 已轮换且只保存在本机 secret file。恢复后 webhook run
  `01a0c106-2494-71a0-8490-778f93869533`、恢复时 schedule run
  `01a0c106-1975-7074-84a5-faeaafebc515`，以及下一个正常五分钟周期 schedule run
  `01a0c107-f3cb-7e88-ba8a-fa95c1a6dd95` 均 completed；实际程序输出均为
  `status=OK`、`enabled=true`、`prs=[]`。这证明两种自动入口运行的是 v2.1，不依赖手工 tick。

2026-09-20 实测与上线记录：

- [交付 PR #8](https://github.com/ChildeRolando/MjsoulTileTrace/pull/8) 已合并；候选
  `c0639672622c407f56d91a8bedcc54d97cd512d6`，合并提交
  `b249d8b40035d1a96bc6425094acdc1269b18b2f`，两者 tree 完全一致。
  受信部署 checkout 已更新；后续收尾提交仅改变文档，不改变运行时代码。
- 五门全部通过，`npm test` 通过：Vitest 164 文件 / 1,898 项，另含 38 项编排回归。
  最终独立评审 COAC-25 仍为 CHANGES_REQUIRED，ledger 保留 BLOCKED / round=5。
  run `01a0be9b-6f25-7eed-b4a2-e842d3e0b7b9`，comment
  `01a0bea0-401b-7e63-a602-3b0d3c82f86d`，原文 SHA-256
  `c2560d5dfa61c9b1bd4f4d03915970d4c03746a5660569f01c6b37f497377ba1`。

- Autopilot `d715ccd5-692c-41e8-9f6f-b4f4306a6344`，run_only、project=null；
  Controller `a169a7d8-ee06-4b75-8658-68ac47131d8a`，Reviewer
  `e860cd42-646c-47e5-9076-5ef82fc3efe1`，复用 Fixer
  `ba77da89-8574-4dea-8fc2-24e841fc2754`。
- webhook trigger `9522702a-972c-4bc0-bd73-f136f4e1d668`；schedule trigger
  `f6632cf5-f2ae-4acb-a713-e15b2a9c77a5`，每五分钟，Asia/Shanghai。
  URL 不入库、不放入工单。
- disabled 实读检查零 dispatch；证据在私有部署目录
  `release-audit/disabled-receipt.json`。
- 真实 webhook run `01a0be9a-bfda-7046-b310-0dee6d66010f` 完成并派发 COAC-25；
  相同 Idempotency-Key 两次 POST 返回 accepted/duplicate，同一 delivery
  `01a0be9a-bfd5-7703-bced-26b9a0149f9c`。此前原生 schedule run
  `01a0be90-3e33-73d4-9bca-95d75ba62fe4` 完成，health 更新为 11:25:51Z。
- PR #8 的真实链路：COAC-19 → 自动修复 COAC-20 → COAC-21 → 自动修复 COAC-22
  → COAC-23（三轮上限停止）→ 人工批准修复 → COAC-24（四轮上限停止）
  → 第二次人工批准修复 → COAC-25。前两次修复由现有 Fixer 推送；最后两次为人工
  授权下的 operator 修复，不冒充全自动动作。
- 每轮原文、来源 comment/run、SHA-256 和决策完整保存在私有 `state/pr-8.json`、
  `state/results/`、`state/snapshots/`；轮次未重置，原文 hash 已逐轮核验。
- 旧 v1 checker/schema/manifest/fixtures 在交付变更中移除，Git 历史可恢复。
  旧 PR #7 已关闭；COAC-12 标注历史替代，COAC-14/15 已取消并标注替代。

本次 Codex 上线推进提醒在交付完成后停用；日常运行由上述 Multica 原生 Autopilot
承担，不需要该 Codex 对话持续在线。主机和 Multica runtime 仍须在线。

## 已知问题与本次人工放行

R5-001：新 PR 在尚未建立 review job 前被准入校验阻断时，发布器可能不更新 GitHub
共享 commit status；若该 SHA 曾被已关闭的 PR 标为 success，新 PR 页面可能保留旧绿灯。
这不会把本地 ledger 改成 PASS，但意味着不能只看 GitHub 绿灯决定合并：同时核对
该 PR 的 Multica 评审原文及 ledger 的当前 base/head、轮次和结论。

用户明确指示“不修了，直接上线，用出问题再修”，仅对本次交付接受此已知问题。
[批准记录](https://github.com/ChildeRolando/MjsoulTileTrace/pull/8#issuecomment-5749596459)。
未派发第六轮，未伪造 PASS，未重置或删除五轮记录。默认三轮、未来 PR 的门禁和
“评审通过不等于自动合并”的规则均保持不变。当前只验证了真实 review/fix/re-review
链路，未取得本次端到端 PASS；它是已记录的上线例外，不作为全部验收条件满足的证明。
