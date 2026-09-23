# M7-B ReviewSession / SQLite / privileged raw-cache 实现规格

冻结日期：2026-09-22
状态：**SPEC FREEZE；产品与技术审阅已收敛，可供 COAC-8 实现。** 规格冻结不等于实现、验收或合并已经完成。

## 1. 权威、消费基线与范围

本文件是 M7-B 持久化设计、失败矩阵和机械验收的唯一 owner。它消费而不复制以下权威：

- COAC-4 已验收生成链基线 `404fc9c596ccb406fa9334bdcbab186ef933ee0c`；M7-A 产品冻结基线 `febf6d911e9f9f743314fcf2d033c5f54dc78eb6`。
- M7-A 技术 read-back 基线：PR #14 合并提交 `3e9bbb7b0e90e2072053c1eb16fff7ad5c44db74`，其候选 HEAD `039bd13433f009e658f3a35e38be345b4cb912f8`。最终 DTO、P6 和 presenter 边界以 [M7-A owner](./2026-09-21-m7-a-whole-game-fixed-review-ui-design.md) 为准。
- M6-C 拥有 `StructuredAnalysisPackage` 身份和 validator；D1 拥有 `projectContextGraph`；D2 拥有 `ReviewReport`、grounding validator 和唯一生成 authority；selector owner 拥有 `ReviewSelectionResult`。
- 持久化和 presentation 只可调用 reasoning-owned `composeReviewReadBackContext(package, selection, report?)` 组合已保存数据。desktop 不得直接导入或调用 `appendReasoningOverlay`。

MVP 用户范围只有：会话列表、保存、退出、重启、离线重开、首次 Coach 生成，以及浏览当前 active report 的 Overview → List → Detail。没有 regenerate、history picker、A/B comparison/switching UI，也没有隐藏菜单、快捷键或禁用占位。

多份 immutable reports、append、active switch 和 A→B→A 只作为内部 repository/controller 能力与回归边界。多请求粒度、生成断点/续做、归档/文件夹、云同步、多用户、跨设备、GraphDB、向量检索和 M4 对话历史不属于 COAC-8 MVP；不得为它们新增表、DTO 或 UI。

## 2. 冻结不变量

1. `ReviewSession` 围绕一份 package 组织报告引用；每个 `analysisPackageRef` 最多一个现存 session。session 不内嵌 package 或 report 正文。
2. package/report 正文作为独立 immutable artifact 保存；一次合法生成取得全局唯一 `reportRefId`。`reportId` 是内容身份，允许两个不同 `reportRefId` 具有相同 `reportId`。
3. session 保存冻结并验证过的 selector 结果，供重开复用；它是派生 session state，不是第三个 canonical artifact。重开不得按当前策略重新选牌。
4. `activeReportRefId` 为 `null` 表示 `not_generated`；非空时必须唯一指向该 session、同一 package 下的一项 report ref。时间戳和 append 顺序都不能代替显式 active ref。
5. graph 永不持久化：`ContextGraph = project(package) + active ReviewReport.reasoningOverlay`。每次重开或内部切换都从新的 package evidence 投影开始，只装配目标报告。
6. package 读回经过 `validateStructuredAnalysisPackage`；selection 经过 `ReviewSelectionResultSchema`；report 经过 `validateReviewReport`。随后必须再通过获准的 `composeReviewReadBackContext`。缺失引用、不支持版本、hash 不符、身份不符或 validator 拒绝一律 fail closed。
7. component version ownership 不混淆：canonical/replay、Mortal source/model、factor pipeline、selector policy 和 package schema 属 package/selection；provider/model、prompt/draft/generator/validator 和 report schema 属 ReviewReport；SQLite `user_version` 只描述存储结构。
8. `complete`、`partial`、`evidence_only` 都是合法可保存报告。损坏或无法验证的数据不是 `evidence_only`。
9. raw Mortal/source cache 只属于 main/source infrastructure，不进入 ReviewSession、ReviewReport、renderer DTO、audit、日志或错误 prose；离线重开不依赖 raw cache。
10. renderer 只收到 M7-A 窄 DTO：当前 active ref、当前状态及页面所需 evidence/judgment/explanation/provenance；不收到完整 report catalog、artifact bytes、数据库路径或 cache material。

## 3. 数据目录与 SQLite 运行边界

```text
app.getPath("userData")/review-library/
  library.sqlite
  library.sqlite-wal
  library.sqlite-shm
  source-cache/
  staging/
```

- desktop main process 是唯一数据库写入者；同一资料库只允许一个应用实例持有写所有权。renderer/preload 不获得 SQL、路径或任意文件能力。
- SQLite 初始化后设置并读回 `foreign_keys=ON`、`journal_mode=WAL`、`synchronous=FULL`、`busy_timeout=5000`。不得手动删除 WAL/SHM 充当恢复或清缓存。
- 写入使用参数化语句和串行短事务。网络、LLM、下载、JSON parse、validator 与 graph projection 均在事务外完成；提交前在事务内重新检查 revision、引用归属和删除状态。
- 正式桌面发行物携带 SQLite runtime，不要求用户安装 SQLite CLI。实现必须在仓库固定的 Electron `43.3.0` 进程和发行布局验证所选 binding；普通 Node mock 不替代该门。
- 正文保存 validator 接受后的 canonical UTF-8 JSON bytes、SHA-256、schema version。内容 hash 检测与已登记 bytes 的偏差，但不宣称防御拥有本机写权限的攻击者。

## 4. SQLite v1 schema

下列是 v1 必须实现的逻辑 schema；DDL 可按所选 binding 拆分，但表、字段语义、唯一性和复合外键不得弱化。

| 表 | 必需字段 | 约束 |
|---|---|---|
| `library_meta` | `singleton INTEGER PK CHECK(singleton=1)`, `format_version INTEGER`, `created_at TEXT` | `format_version=1`，与 `PRAGMA user_version` 一致 |
| `analysis_packages` | `package_ref_id TEXT PK`, `package_id TEXT`, `content_hash TEXT`, `schema_version TEXT`, `payload BLOB` | `package_id UNIQUE`；正文不可 UPDATE |
| `review_sessions` | `session_id TEXT PK`, `package_ref_id TEXT`, `selection_hash TEXT`, `selection_payload BLOB`, `revision INTEGER`, `created_at TEXT`, `updated_at TEXT` | `package_ref_id UNIQUE FK`；`revision>=0` |
| `review_reports` | `report_ref_id TEXT PK`, `package_ref_id TEXT`, `report_id TEXT`, `content_hash TEXT`, `schema_version TEXT`, `payload BLOB`, `created_at TEXT` | `(report_ref_id,package_ref_id) UNIQUE`；`report_id` 仅普通索引；正文不可 UPDATE |
| `session_report_refs` | `session_id TEXT`, `package_ref_id TEXT`, `report_ref_id TEXT`, `append_ordinal INTEGER` | PK `(session_id,report_ref_id)`；`report_ref_id UNIQUE`；`(session_id,append_ordinal) UNIQUE`；复合 FK 同时证明 session/report 属同一 package |
| `session_active_report` | `session_id TEXT PK`, `package_ref_id TEXT`, `active_report_ref_id TEXT NULL` | active 非空时以 `(session_id,package_ref_id,active_report_ref_id)` 复合 FK 指向 `session_report_refs` |
| `activation_intents` | `session_id TEXT PK`, `operation_id TEXT UNIQUE`, `package_ref_id TEXT`, `target_report_ref_id TEXT`, `previous_report_ref_id TEXT NULL`, `expected_revision INTEGER` | target/previous 必须属于同 session/package；完成激活后删除 |
| `operation_receipts` | `operation_id TEXT PK`, `kind TEXT`, `session_id TEXT`, `report_ref_id TEXT NULL`, `state TEXT`, `committed_revision INTEGER`, `created_at TEXT` | `state IN ('report_saved','activated','deleted')`；为提交结果未知和重试提供 durable idempotency |
| `source_materials` | `material_id TEXT PK`, `content_hash TEXT`, `byte_length INTEGER`, `relative_path TEXT UNIQUE`, `state TEXT` | `state IN ('ready','deleting')`；路径仅 main 解析；不存 URL/token/cookie |
| `raw_cache_entries` | `cache_key TEXT PK`, `material_id TEXT FK`, `source_kind TEXT`, `record_identity_hash TEXT`, `parser_version TEXT`, `validation_version TEXT`, `created_at TEXT` | 仅 privileged 索引；命中仍须验证 material |

额外数据库约束：

- `review_sessions` 声明 `UNIQUE(session_id,package_ref_id)`；`session_report_refs` 以复合外键分别引用该键和 `review_reports(report_ref_id,package_ref_id)`，从数据库层拒绝跨 session/package 挂接。
- `session_active_report` 和 `activation_intents` 的 ref 外键引用 `session_report_refs` 的三列唯一键。active 为 null 时仍保留一行，避免用“缺行”表达第二种空状态。
- artifact 表禁止修改 payload、content hash、领域身份或 schema version；新报告只 INSERT。重复提交同一 `operation_id` 必须通过 `operation_receipts` 读回既有结果，不能重复追加。
- session 删除在一个事务中先置空 active/删除 intent，再删除 refs、reports、session；package 只在没有任何 session/ref 后删除。cache 清理是另一条 privileged 操作，不能借 session 删除扫描任意目录。

## 5. 事务、事件与崩溃恢复

### 5.1 创建/保存 session

1. 在事务外验证 package，运行既有 selector，验证 selection，并固定两者 bytes/hash。
2. 单个事务插入 package（或核实完全相同的既有 package）、session、selection snapshot 和 null active 行。
3. 仅在 commit 成功并按 `session_id` 读回后返回“已保存”。同 `packageId`/ref 但 hash 不同返回 `identity_conflict`，不得覆盖。
4. 零报告 session 是合法状态；打开它只展示确定性 evidence 和 `not_generated`，不得伪造 `evidence_only` 或自动调用 provider。

### 5.2 首次报告保存与激活

共享事件名和顺序沿用 M7-A：`GENERATE_REQUESTED → REPORT_GENERATED → REPORT_READ_BACK_VALIDATED → REPORT_REF_APPENDED → ACTIVE_REPORT_SWITCHED → VIEW_READY`。

1. provider 调用前核实 session revision、P6 首次生成资格和 package/selection；网络调用不在数据库事务内。
2. 唯一 `generateReviewReport` 返回后，在内存中完成 report validator 与 `composeReviewReadBackContext` read-back。失败不保存 ref、不改变 active。
3. **提交一**原子插入 immutable report、`session_report_refs`、activation intent 和 `report_saved` receipt，并递增 session revision。提交后才发出 `REPORT_REF_APPENDED`。写入/回执不确定时按 `operation_id` 读回，不重发模型请求。
4. 从刚保存的精确 ref 重新读取 bytes，重新验证并调用 `composeReviewReadBackContext`。成功后，**提交二**以 expected revision/CAS 设置 active ref、删除 intent、把 receipt 更新为 `activated`、再次递增 revision；提交后才发出 `ACTIVE_REPORT_SWITCHED` 和 `VIEW_READY`。
5. 提交一成功后，若第 4 步的精确 ref 读回、report validator 或 compose 拒绝，已提交的 report/ref、activation intent 和 `report_saved` receipt 全部保留，旧 active（首次生成时为 null）不变；不得发出 `ACTIVE_REPORT_SWITCHED`/`VIEW_READY`，不得向 renderer 暴露被拒内容，也不得自动删除、换 active 或把 receipt 伪装成 `activated`。本次及以后重开都只可按同一 intent 重试本地第 4 步；仍拒绝时返回固定恢复 unavailable 状态并继续保留上述恢复记录，验证成功后才执行提交二。全程零网络、零 LLM。
6. 提交一成功、提交二前退出/崩溃时，报告和 ref 保留，旧 active 不变。下次打开按第 5 项规则只做本地第 4 步和提交二；零网络、零 LLM。
7. 生成中退出且提交一尚未成功时，使 operation 失效并丢弃迟到结果，不创建半成品 ref。已有已保存报告和 active 均不变。

### 5.3 内部 append/switch 回归

P6 不向用户暴露这些操作。repository/controller 仍必须支持：追加新 immutable ref；为既有 ref 建 intent；从 fresh base graph 装配目标；CAS 切 active。A→B→A 每次均先丢弃整个旧 read-back context，再从同一 package 重建，禁止全局 reasoning-node registry 或跨报告 ref 解析。

## 6. 离线重开

重开按以下固定顺序执行：

1. 读取 session、selection snapshot、package ref、active row 和可能存在的 intent；验证 FK、hash、版本、revision 与身份。
2. 对 package 运行 `validateStructuredAnalysisPackage`，对 selection 运行 `ReviewSelectionResultSchema`；不得重新调用 selector。
3. active 为 null 时调用 `composeReviewReadBackContext(package, selection, null)`。active 非空时读取精确 `reportRefId`，运行 `validateReviewReport`，再调用 `composeReviewReadBackContext(package, selection, report)`。
4. presenter 从该 seam 的返回值构造 M7-A narrowed active-report DTO；不得自行装配 overlay、重验 grounding、调用 provider、刷新 source 或读取 raw cache。
5. intent 存在时先按 5.2 的本地恢复完成或返回固定恢复错误，再向 renderer 发布一致快照。不能用 `created_at`、`reportId` 或 append 最后一项猜 active。

引用缺失、hash/identity 不一致、不支持 schema、selection 与 package 不一致、report validator 或 compose 拒绝时：不展示未验证数据，不自动删除/迁移/重生/换 active；返回固定 unavailable 状态并保留原 bytes 供受限诊断。独立验证通过的 package evidence 可在产品定义允许时继续显示，但不得把损坏报告降格冒充合法 `evidence_only`。

## 7. migration 与版本兼容

COAC-98 删除回执修复在原 v1 逻辑 schema 上追加 storage v2：
`operation_receipts.package_id TEXT NULL` 保留删除后仍可验证的 package 绑定，
新操作同时写原始 `session_id`；artifact、引用及所有原约束不变。
v1 → v2 的列添加、`library_meta.format_version=2` 和 `user_version=2` 同事务提交。
旧删除回执无法从已删除 artifact 恢复 package 身份时保留 NULL，冲突重试固定拒绝，
不能猜绑定或重新删除；新回执仅在同 package 且原 session 已不存在、没有重建 session
时幂等返回。此存储修复不改变 package/report 的领域 schema 或产品范围。

- 新库从 `user_version=0` 在单个事务初始化到 v1，同时写 `library_meta.format_version=1`。后续只允许应用内、连续、前向 migration；DDL、数据变换、约束检查和版本号在同一短事务提交。
- migration 失败整体回滚并拒绝打开资料库；不得删除旧库、创建空库覆盖或静默跳过。高于程序支持版本的库 fail closed，提示使用兼容新版本；不自动 downgrade。
- 启动取得单实例写锁后让 SQLite 自行恢复 WAL，再执行 `quick_check`/`integrity_check`（实现按启动预算选择）和 `foreign_key_check`。数据库检查不能替代领域 validators。
- package/report schema reader support 与 SQLite schema migration 分离。不得改写 immutable artifact 假装升级成功。
- MVP 没有需要迁移的已发布 ReviewSession 数据。现有开发期 `analysis-packages/*.json` 不自动导入、删除或作为第二 truth；如未来需要导入，必须另立有 fixture、receipt 和来源绑定的 migration 规格。

## 8. privileged raw-cache

- `cache_key = SHA-256(canonical(sourceKind, stableRecordIdentityHash, perspective, source/model/schema/parser/validator versions, relevant request params))`。鉴权分区只可作为 main 内不透明摘要；token、cookie、完整 URL、用户可读昵称不得进入键或日志。缺任一稳定身份/版本即 miss。
- bytes 以 `content_hash` 去重。写入先在 `staging/` 独占创建并 flush，校验后同卷原子 rename 到 `source-cache/`，最后以 SQLite 事务登记 ready material 和 cache entry。未登记文件不是 hit，启动只可清理能证明由应用创建且无引用的 orphan/staging。
- hit 必须重新核对路径位于受控根、非 symlink/reparse-point 逃逸、长度/hash、source identity、parser/validator version；任一不符为 invalid/miss，不向 renderer 或 reasoning 返回 raw bytes。
- MVP **无自动 TTL、LRU 或容量淘汰**；长期保留，直到用户显式执行“清理来源缓存”。因此 eviction 验收验证“不会自动淘汰”及显式清理，而不是虚构后台过期策略。不兼容 entry 拒绝复用但保留，直至显式清理。
- 显式清理先把 material 标为 `deleting` 并禁止新引用，再安全 unlink，最后删 index/material row；崩溃后幂等续做。共享 bytes 仍有 ref 时只删 cache entry/减 ref，不物理删除。路径越界或 unlink 失败保持 `deleting` 并报告未完成，不能谎称已释放空间。

## 9. 备份、删除、隐私与日志

- MVP 不提供内置备份/恢复 UI。手工备份必须完全退出应用后复制整个 `review-library/`；不得只复制运行中的 `library.sqlite`。恢复同样在完全退出后进行，并先保留现目录。凭据位于其他 owner，不属于该备份。
- 删除 session 使用第 4 节事务规则，成功回执必须在 commit 后；提交结果未知则按 session/revision 读回。删除不能通过迟到 callback、旧 intent 或 cache scan 复活。SQLite 删除不承诺法证级安全擦除。
- 本地资料默认明文，继承 OS 用户目录权限；本期不新增应用级加密。provider credential 仍只由 safeStorage owner 管理，绝不进入该库。
- 允许日志：operation/session/ref 的不透明 ID、固定错误码、schema/version、计数、耗时和 hash 前缀。禁止日志/audit/error/telemetry：artifact payload、raw bytes、牌谱 URL、账号身份、cookie/token/key、完整 prompt/response、reasoning 文本、绝对用户路径或 SQL 参数正文。

## 10. 失败矩阵

| 注入点 | 必须结果 |
|---|---|
| package/session 事务任一步失败 | 无半个可打开 session；既有数据不变 |
| 合法 `complete/partial/evidence_only` | 同一保存/读回路径；状态如实保留 |
| 提交一前 report validator/read-back 拒绝 | 不追加 ref，不改变 active，不向 renderer 暴露内容 |
| 提交一后精确 ref 读回、report validator 或 compose 拒绝 | 已提交 report/ref、intent 和 `report_saved` receipt 保留；旧 active 不变；无 `ACTIVE_REPORT_SWITCHED`/`VIEW_READY`，不暴露被拒内容；重开只做本地恢复，仍拒绝则返回固定 unavailable |
| 提交一前退出 | 无新 ref；旧 active 不变 |
| 提交一后、提交二前 kill | ref 恰好一份；重开本地完成 intent；0 网络/LLM |
| 提交二回执丢失 | 按 operation/active/revision 识别已提交；不重复 append |
| 缺失/跨 package ref、篡改或不兼容版本 | fail closed；原 bytes 保留；不猜 active、不生成替代物 |
| `reportId` 相同而 `reportRefId` 不同 | 两实例不互相覆盖；按 ref 精确激活 |
| 不同内容 A→B→A | 最终内容、provenance 和 ref resolution 精确等于 A；无 B 独有内容或跨报告解析缓存残留；允许领域身份规则产生的共享 nodeId |
| migration 中断或旧程序开新库 | 回滚或拒绝；不得空库覆盖 |
| `SQLITE_BUSY`、磁盘满、权限丢失 | 固定保存错误、无假成功、无旧数据清除 |
| cache hit/miss/invalid | hit 仍校验；invalid 为 miss；raw bytes 不越 privileged 边界 |
| 自动 eviction 时钟/容量压力 | 不淘汰；entry 保留 |
| 显式 cache clear 中断 | `deleting` 可幂等恢复；共享/越界文件不误删 |

## 11. fixtures、机械验收与执行门

验收 owner 就是本节；实现把机械规则固化到既有 contract/repository/Electron/DOM/architecture test owner，不另建第二份长期 truth。

1. **主链**：受支持的真实、脱敏牌谱 fixture → 生产确定性分析 → 既有 selector → 首次 stubbed Coach 生成 → Overview/List/Detail → 保存 → 退出并清空全部内存 graph → 重启、禁网、禁 LLM → 重开同 session。断言同一 `activeReportRefId`、selection/report status/version、judgment、explanation 与 provenance，provider/network 请求数均为 0。
2. **降级链**：分别从真实生产 contracts 构造 `partial` 和 `evidence_only`，保存后离线重开；确定性 evidence 仍可浏览、状态不变、provider/network 请求数为 0。零报告 session 另测 `not_generated`，不得冒充 `evidence_only`。
3. **内部寻址与隔离**：分别固化两组不可互相替代的案例。duplicate identity 案例让两个不同 `reportRefId` 指向相同 `reportId`，断言两份 ref、append ordinal、intent/receipt 和 active 寻址互不覆盖，按精确 ref 激活且元数据不串写；不能用内容相同来声称已证明 overlay 隔离。隔离案例使用同一 package/decision/localId 但不同 judgment/explanation 内容、因而 `reportId` 不同的 A 与 B，执行 A→B→A；每次都清空旧 read-back context，最终 current graph、judgment、explanation、provenance 和 reasoning ref resolution 精确等于 A，且没有 B 独有内容或解析缓存残留；允许 canonical identity 规则使非 B 独有节点共享 nodeId。两组均覆盖跨 session/package ref、重复 ref、迟到 activation 与 operation 幂等拒绝。
4. **P6 DOM**：用户 DOM、preload API、菜单和快捷键均不存在 regenerate/history/A-B switch；snapshot 不含完整 report catalog。内部 repository 方法不得被 renderer 发现或调用。
5. **SQLite/recovery**：真实 Electron 进程和磁盘库覆盖两个提交点、kill/restart、WAL recovery、外键、复合引用、migration rollback/newer-version refusal、删除竞争；另在提交一成功后分别注入精确 ref 读回、report validator 和 compose 拒绝，断言 report/ref、intent 与 `report_saved` receipt 保留、旧 active 不变、无 `VIEW_READY`/内容暴露，重启仍只做零网络/零 LLM 的本地恢复并在继续拒绝时返回固定 unavailable。不能只用 in-memory repository 或 mock transaction 代替。
6. **cache/security**：固定 raw fixtures 覆盖 hit/miss/hash invalid/content dedup/no-auto-eviction/explicit clear/restart recovery，以及路径越界、symlink/reparse point、秘密反射。IPC→preload→renderer 全链断言无 raw bytes/URL/account/secret/prompt/response。
7. **项目门**：从 `coach/` 实际运行 `npm run typecheck`、`npm run build`、`npx vitest run`、`npm run check:architecture`、`npm run test:package-import`，并运行新增的 Electron persistence suite。真实收费 provider 只在人工明确授权、确认账号/额度后补充验证；默认 suite 使用 stub，未获授权必须记录“未执行”而非 PASS。

### Review Loop 第 2 轮修复闭环（COAC-96）

- 首次生成前先从 durable repository 恢复既有 intent/receipt；提交一已成功时只做本地
  read-back 与提交二，不再次调用 provider。activation 在任何数据库写入前校验 package、
  selection、report 的 hash、存储 schema version、领域 identity 与
  `composeReviewReadBackContext`，拒绝时保留旧 active、intent、`report_saved` receipt
  与 revision。
- `activateExisting` 按 operation receipt 的 kind/session/package/target ref 绑定实现幂等；
  同参重试返回既有结果，冲突参数固定拒绝。`review-session-persistence.test.ts` 固化上述
  三条恢复/幂等回归。
- raw cache 以已解析的真实 `review-library` 为锚，写入、命中、恢复与清理均复核
  `source-cache/`、`staging/` 目录链，拒绝 junction/symlink/reparse-point 越界；越界目标
  不读取、不写入、不删除。
- 账号牌谱摄取在创建 Lobby/下载前查询 main-only cache，命中后仍由 source parser 和
  canonical mapper 验证；miss/invalid 才下载并登记。IPC/preload/renderer 仅新增无参数
  “清理来源缓存”与 `{status,pendingMaterials}` 安全结果，不返回 bytes、路径、账号或秘密。
- `electron-persistence-smoke.cjs` 由同进程 reopen 扩展为真实 Electron 子进程在提交一后
  异常终止、WAL/intent 恢复、complete 与 evidence-only 离线读回、不同内容 A→B→A、
  migration rollback，以及脱敏真实牌谱经生产 mapper/replay 的验收；网络与 LLM 边界均
  使用离线 fixture/stub。

### Review Loop 第 3 轮修复闭环（COAC-97）

- artifact 读回同时核对 SQLite 索引列与正文领域 identity；即使正文 hash/schema/validator
  均合法，`analysis_packages.package_id` 或 `review_reports.report_id` 与正文不一致仍固定
  fail closed。`review-session-persistence.test.ts` 以只改索引、不改正文 bytes/hash 的回归
  固化 `R3-P2-1`。
- provider 调用前捕获 durable `sessionId/revision`，报告提交前由 repository 对同一绑定
  执行 CAS；生成期间删除并以相同 package 重建 session 时，旧结果拒绝且不得写入新 session。
  `review-session-persistence.test.ts` 的 deferred provider 删除竞争固化 `R3-P2-2`。
- `electron-persistence-smoke.cjs` 将同一脱敏真实 Mortal fixture 经生产 deterministic
  analysis/package builder、selector、首次 stubbed Coach、Overview/List/Detail 和 SQLite
  保存贯通；随后由独立 Electron 进程禁用并计数 source/network/LLM，离线重开比较 active
  ref、selection/status/version、judgment、explanation、provenance 与 session list，固定为
  `network=0`、`llm=0`，固化 `R3-P2-3`。真实收费 provider 仍未执行。

### Review Loop 第 4 轮修复与实际验证（COAC-98，2026-09-23）

- 来源：第四轮原始合法 `ENVIRONMENT_BLOCKED`，comment
  `01a0cd37-2553-79b7-ad77-3cc6d3acfb31`，completed run
  `01a0cd2b-af86-7680-9b7b-e63a85ea703c`，UTF-8 SHA-256
  `5956ca0345903646fd4f10570865a06508a05fcfe58f8d5797f5cb6ca36d04d6`。
  修复消费候选 `e46a349df9c715e8e71052df6b38cfae5703f80a`；原结论、admission 与历史不改写。
- `R4-P2-1`：删除 receipt 持久保留原 package/session 绑定；仅同 package 的已删除目标可
  重试，跨 package 或同 package 已重建 session 均固定 `operation_identity_conflict`。
  `review-session-persistence.test.ts` 在旧实现上实际失败（跨 package 未抛错误），修复后
  通过；另覆盖跨 restart 的同目标幂等、旧 v1 未知绑定拒绝与 migration rollback。
- `R4-P2-2`：组合根捕获 cache 初始化异常，固定记录 `raw_cache_unavailable`；缓存操作
  固定不可用，资料库及离线复盘仍可用。其他启动异常只记录 `startup_unavailable`。
  原始材料与受控路径验证保留，cache 初始化失败释放已打开的数据库句柄。
  `electron-persistence-smoke.cjs` 在旧 emitted entry 上实际复现 `EEXIST`/路径泄露；
  修复后以独立 Electron 启动生产 entry，经真实 preload/IPC 比较原 snapshot/detail，
  对 source-cache 普通文件损坏和 junction 越界均断言固定错误、无用户目录日志、原材料
  不变、离线请求数为 0。该故障注入使用紧凑合法 fixture；完整真实牌谱主链仍单独完整执行。
- Chromium 门的驱动挂起点、替代运行时和生命周期修复由 M7-A owner 的 COAC-98 节持有；
  真实键盘焦点覆盖未减少。诊断期全量首次运行仍是 169 文件/2044 项通过、1 项 90000ms
  超时；对旧 CDP 加期限的实验也失败，均不作为通过记录。新 cache 测试曾把完整真实链
  再次跨 renderer 传输，超过新增测试的 20 秒期限；诊断已确认生产 Detail handler 返回，
  后将独立 cache 故障注入改用紧凑 fixture，不改原真实离线主链或任何焦点断言/超时。
- 本修复实际门禁：`npm run typecheck` PASS/0；`npm run build` PASS/0；
  `npx vitest run` 两次完整 PASS/0，各 170 files / 2047 tests；
  `npm run check:architecture` PASS/0（6 packages / 391 files / 1685 imports / 0 violations）；
  `npm run test:package-import` PASS/0（1/1）；`npm run test:electron-persistence`
  PASS/0（Electron 43.3.0 / Node 24.18.1），含原 kill/WAL、真实主链零请求、A→B→A、
  complete/partial/evidence-only、migration 及新增生产 cache 故障回归。
  诊断阶段一次 test internal import 违反 architecture gate，已移除并以原命令恢复。
  当前无未恢复的本地环境失败；仅 stubbed provider，未调用真实收费服务。
  这些是作者本地验收证据，不是第五轮独立 PASS，也不授权合并。

COAC-8 只有在 COAC-6 accepted/merged、COAC-7 本规格 reviewed/frozen/accepted/merged，并记录二者精确合并 SHA 后才能启动。COAC-6 的 GO 也同时要求 COAC-5 technical gate PASS+merged 与本规格 reviewed/frozen/merged。

## 12. 审阅结论与 out-of-scope

技术审阅已逐项核对实体关系、schema/复合引用、两阶段事务、migration、崩溃恢复、validator/read-back、raw-cache 生命周期、安全边界和主链/降级验收；没有剩余产品决策。实现期仍须选择并实测 Electron-compatible SQLite binding，但该选择不得改变本规格的表语义、边界或验收，属于实现任务而非 spec blocker。

明确不做：用户级 regenerate/history/A-B switch；多请求粒度和生成断点；自动 cache TTL/LRU/cap；内置备份；自选数据目录/搬迁；云同步、多用户、跨设备、服务端托管；GraphDB/向量检索；M4 对话；真实 provider 自动测试；将 graph、raw source 或完整 prompt/response 持久化为产品 artifact。
