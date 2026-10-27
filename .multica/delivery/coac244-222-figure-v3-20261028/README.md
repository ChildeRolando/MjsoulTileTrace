222限定figure独审合同：零模型修复

本阶段真实模型调用0。没有制作候选、重复单点识图、执行首审、变更provider/凭据/正式active，也没有向共享审校ledger写模拟结果。183、236和222的源、候选、父审、旧raw原字节保留。

222唯一canonical `79-cn-chapter-222-5`，唯一display `c51650a43ec7b124b8aaf0dba0b3d7918f674e150cc710141d7ee6230688357d`。旧入口在`textBlockIds=[] / figureIds=[b0018:figure]`时会选择全章schema/23块10图，缺目标figure请求、父审合并与收据验证合同，不能在本授权下直接执行。

新增冻结实际入口：`audit/runtimes/coac244-222-target-figure-v3-20261028`。manifest `8c416f3afbb3e8647e1761d526151825cb79927741d9f331c44225679be6705f`，31文件；旧schema-v2 manifest及28文件均未修改。修改仅新runtime的`textbook-audit-web.mjs`并增加`textbook-audit-222-figure.mjs`，重建依赖manifest，不改旧CLI/模型配置。

- 标准`auditWebCandidate`真实分支选择限定figure schema，实际request为1目标源块/1figure/1occurrence，3只读文字上下文b0017/0019/0021，原PNG+x4最近邻两图，显式terra/max。`prepareBound222FigureAudit`与真实分派共用同一planner；`actual-request.json`保留完整语义输入、CLI包装后stdin、schema、argv和图片SHA，不是只测摘要或prompt标签。
- 限定候选SHA、源SHA、父SHA、父审SHA、真实生产call487c0ef8及两处2m→1m。13个文字块和另9图精确继承，目标caption/sourceNotes/unknowns/其余图码不变。原制作链和逐像素展示门禁继续执行，不伪造模型provenance或raw。
- 绑定既有独立点55d504fb、其完整raw32007944、原图和bbox[170,28,196,65]；1m不是主控判读，也不追加一次点裁决。新审仅验真实产物落实与目标完整保真。
- 新输出仅允许目标block/figure/occurrence各一条检查，context/dom/semantic/completeTargetScopeCompared均须明确；error/uncertain/漏项/空证据/越界scope/伪新审全章标志拒绝。合并只替换目标检查及其原issue，未改父审检查原对象值保留；父审其它阻断不能丢。
- `verifyAuditForWebCandidate`重算真实生产/源/展示/父审、point、schema、语义输入、CLI包装prompt、模型/effort/图片参数、唯一ledger、目标审和effective合并。无图、sol/high回落、额外图或改图hash、合并改写、错点、改schema、重复ledger均拒绝。孤立同SHA ledger阻止再次派发；不存在自动重试路径。

零模型验证：42项新检查通过，包含实际标准入口的3次内存reviewer截获（faithful、uncertain、transport failed）以及实际标准收据验真。模型未被调用。`test-overlay.mjs`将所有新audit/raw/ledger写操作只存内存；共享文件不含模拟passed。`test-results.json`列每个断言及前后ledger哈希。另以已有Vitest依赖运行原web34+image7共41测试通过；初次错误使用node:test且无vitest解析环境，已用现有Vitest及临时依赖junction正确执行，junction已移除，未安装新依赖。

交接`handoff-249.json`指向精确冻结runtime。222阶段原失败maker1+成功maker1=已用2/最多3，保留唯一独立首审1，失败/void计、0retry；此修复不增加预算。249派发前重新读真实ledger/raw/候选选择及在途，存在结果则复用，不新建消费者。仅真实独审passed后交250，附完整runtime/父审/point链；当前无新222审收据，不能称已通过。含图新调用仍需保留actual requestExecution和完整响应；远端权重不由模型标签证明。

183交接SHA9ff0d489已复验：候选973bbc3e不变，call2c2ab5c6 sol/high images=[]，17042in/7808cache/714out，46.550秒；新审20bdc51f、rawcb47737e，passed，累计7/7余0，已由249交250。源计数疑点仍source-note，原uncertain/raw/snapshot不改。

236零调用诊断保留：原uncertain因中性译文仍保留作者未说明的时机方向，并非已证实译文新增早巡/剩余时点。原回执确认其它条件/例外完整，未指出可验证增译/漏译。候选和审等级不改，没有新增额度或自动放行。

现有两个剩余register只登记上述三个canonical的新事实和下一步，不改covered。总教材未完成，总票保持in_progress。
