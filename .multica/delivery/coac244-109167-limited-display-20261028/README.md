本包仅固定两个已真实生产、已真实独审的候选，零新增模型/制作/复审。

| canonical | candidate SHA | 已通过修订 | 保留未知 | 实际隔离显示 |
| --- | --- | --- | --- | --- |
| 79-cn-chapter-109-4 | 3cfe3a27bd799782d6ac8e626fcf97d26e1724ce544b6ccf26bcd740bd259dcb | b0004/b0006首张5m | b0012三处弃牌 | 17作者块+6非原文限制=23块，7图 |
| 79-cn-chapter-167-4 | 5bfa90e3e15deb0c3f868ee1811fe50cdba75357f2805b3c37ed5f1d86538a58 | b0005北家7p横置立直牌/方向例外 | 南家第5行第3列万子 | 6作者块+3非原文限制=9块，1图 |

原30依赖冻结模块pair.mjs的verifyReviewExecution严格布尔limitedUnknownOkay=false保持。其逻辑将每项unknown影响允许条件与“没有非source-note issue”相与；模型真实保留uncertain，所以false。不能将其当模型没有允许有限展示，也不能将其改true。新合同仅消费每项独立输出faithfulWithExplicitUnknown=true、requiresExactTile=false和完整requiredDisplayLimitations，保留原uncertain与原父审，并按固定原图/完整对象hash安装非原文限制。不声称完整牌河或对所有家安全，不认证概率、最优性、暗手或未读牌码。

入口位于共享处理根的integration/coac244-109167-limited-display-20261028：

- admit.mjs：verifyLimited(root,candidatePath)，只接受表内两个精确文件；重新执行原prepareReview/verifyReviewExecution和真实producer、父审、原始输入/图片/ledger门禁。
- stage.mjs：stageLimited({processingRoot,candidatePath,destination})，新隔离目录才可创建；复制原图、生成正文后插入非原文说明，重新编译HTML/corpus。不存在全局pointer写入。
- stage109、stage167已经真实生成；两份stage*-snapshot.zip含原字节完整stage，stage*-files.sha256.json可逐文件验真。
- contract.json绑定父/源/原审/实际raw/精确差异/完整figure和unknown原串/分析上下文；manifest.json绑定116个输入及代码依赖。
- verification109.json、verification167.json各27项反向回归；两章实际HTML和编译corpus均读到全部限制与unknown。去除说明后的作者块/marks/segments/原图/顺序逐对象完全还原。raw-allowance-map.json保留真实字段与UTF8位置，不替代原审。

109六条说明位于b0012图后、b0013分析前，保留“少数时候”、摸3饼与假设摸4饼的区别。167三条位于b0005图后、b0006分析前，保留“零风险”作为作者建议前提、作者听牌难易及选择判断。所有说明authorText=false；候选body/source/raw/旧审均未修改。当前都是隔离显示已验证，globalAdmissionGranted=false、ordinaryWholeArticlePassed=false；实际全局MCP/Arena读回和覆盖更新归现有250唯一写者。

去重：250的109唤醒01a181ca-b11e-7bfe-b58e-32e3ad8aae60已并入run01a181c4-5975-737e-a21a-67fafbaea8cf；167唤醒01a181cb-dd6c-7383-93ba-7650c3d17db7已排队run01a181cd-17c0-7ed0-828b-cfab604f1d80。未新建消费者或重发唤醒。本票109/167两个唤醒均fire_count=1、disabled，并入本run，不用再次disable或重置。

批累计maker2+独审2=4/4，余0，0retry；本合同新增0calls。两次独审实际terra/max、3图和1图；费用、远端权重及上游执行次数unknown。全书仍未完成，旧版本“提案未授权”仅历史，不覆盖本批真实已完成的生产/独审记录。
