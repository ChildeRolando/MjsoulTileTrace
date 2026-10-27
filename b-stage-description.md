## 当前b9有限阶段收口（COAC-244效率核验，2026-10-27）

当前run `01a17d8f-972b-74fb-a899-249bd7a2862c` 仅以已存在157-11/205-5证据收口。本批停止新增制作/审校，不重派两章、不扩其他章，不为等待249而轮询或占槽；正在执行的真实请求保持自然完成，不杀进程、重试或删锁。

205-5唯一制作调用358f4e70已于14:46:06Z–14:51:12Z完成，transport=completed，maker-B正常释放。机械绑定通过不等于图义通过；本线15:28落盘的`b9-205-5-semantic-failure.json`标`void-no-retry-no-handoff`，记录至少5处退化。候选/raw保持，已花1制作、首审未花，不准仅凭机械ok送249/250。157-11的`b9-157-11-source-conflict.json`记`withheld-before-dispatch`（0制作），父审4s/6s冲突及b0011未列靶点的宝牌疑点保持待独立裁决，不宣告passed、不自行扩靶点。

把已有两份证据、实际usage/成本、parent/source/candidate/raw SHA、maker释放与恢复入口、未裁决项写入本票结果后正常退出。现有证据已足以报告有限批失败，不追加全图研究、不自动下一批唤醒或付费重试，不占本run等待。后续裁决/新额度另由244调度；这是本批质量收口，不取消全书目标，也不变更全局门禁。

A当前仅256-18/276-4，090已pass待集成，222/246在审；不要碰这些章。正式active未切。不新增调度框架。


用户直接授权2026-10-27 09:23 UTC：「允许，加速加速，编排一下任务，提升编修的并行率」。仅在Multica执行，不创建ChatGPT Work/Codex任务，不克隆agent、不改变生产review pool。与244/248/249/250现有链协作，不另造框架。
目标：独立普通web修订线，持续消化全书未通过章，有限2章一批，输出真实修订和审校交接，而非只调研。
先读取244最新并行指令、248当前运行与integration/coac250-unified-chapter-register-20261027b.json及audit/unified-repair-list-20261027.json，实际SHA/最新回执为准。数据根E:\AgentData\Coach\knowledge\processing，源根E:\AgentData\Coach\textbook-source-inspection，现代码E:\AgentWorkspaces\Coach\mortal-rag-ablation\coach。使用平台本票独立worktree/目录及可验证冻结快照，只读共享代码，不修改live repo、全局清单、selection、pointer。候选/raw/调用/回执写本票唯一命名空间并交接路径+SHA；勿复制庞大全量数据或造全版本备份。
分片：从当前未过普通web章按canonical chapterId降序选择可用现有revision入口、已有真实父审的2章；必须先以candidateSHA原子认领并在248记明，确认不与在途重复。明确排除248保留的198/187/199/201、215-4、236、283、metadata/PDF、所有已passed/已入库章。若认领设施未就绪，先选候选和源核准备，通知244完成认领，不能盲发模型。
沿用gpt-6.1-sol/high，只修具体问题，完整论证/条件/所有牌例保留，非目标字节保持；只通过真实bound production revision输出修订，保留parent/raw/失败回执/源SHA/依赖manifest。无需代码变更的章优先；入口阻塞报244并切下一个可修章，不在本票擅自修改审校门禁。
总容量由244验证：目标2制作+2独审+1合库。未收到已验证双槽配置前尊重现有单制作锁，可以并行源核但不得绕过/删除锁。成功占槽才调用，前台有限执行正常释放；429或质量STOP停新增。每章最多1次制作+1次首次独审的首批预算，failed/void/传输错误都占次数，不擅自循环重试；超限前报告。发模型前零调用预检完整输入/投影/图/源与依赖SHA。
修订就绪立即交249独审（独审最多2路，优先交独立owner而非阻塞本修订线）；已有许可的标准独审worker也可正常调用，但不重复同SHA。通过后真实向250交接候选/回执/SHA以单写者合库；其他人不写共享集成。普通小批结束安排下一互斥2章，外部wake而非后台长sleep。交付简短列章ID/修正点/审校/实际调用与tokens/真实并发时段。全书目标256原章，不把自己的批次完成当整体完成。未知不猜，正式库不切换。