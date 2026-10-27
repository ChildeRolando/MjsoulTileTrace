# COAC-250：246-3限定增量接收

本次唤醒仅接收79-cn-chapter-246-3 / cv1785741的passed展示稿fc0027a1。交接ec16dd22实际包含两章，222-5为needs-repair且有源图读法冲突，未纳入；246-3的r1.json中间稿c69a75f6仅作谱系证据，未单独装配或审校。原候选、source、父稿、父审、原始调用和既有审核意见均保留。

`preconsume.json`记录交接、source ec4a7264、独审8fdd6033、raw 1c1358fc、父链、展示派生关系及冻结manifest56287cda的实际SHA核验。9个冻结依赖无diff，现有独立门禁确定性复验passed。核对当前owner、224章预览、台账、exclusion、hold、STOP及写锁；活动consumer STOP/写锁不存在，历史STOP未解除。新增模型调用0，原独审一次、零重试仅复用。

三条非阻断source-note完整保存在`intake-annotations.json`并绑定到selection与覆盖证据。b0025/b0037/b0047在审校投影的配对为1/4、2/5、3/6，制作sourceNotes为交错配对1/2、3/4、5/6；分别记录上下文，未静默改稿或清空意见。

复用已审展示稿中5张PNG，未生成新图或改写原图。`verify-presentation.py`只读比对5组JPEG原图/既有PNG，格式、源SHA、派生SHA、尺寸及RGBA像素完全一致，见`presentation-pixels.json`。5张JPEG原字节随新预览source-assets保留，衍生关系写入注记；此前5张JPEG及b8/090-6注记继续保留。原候选与独审SHA不变，不把PNG展示件冒充JPEG源图。

独占consumer锁，仅运行246-3的既有stage一次；原232单元（含090-6及027-1）逐一比较相等，没有重跑历史章节。发布pointer前通过全库233单元/5067图的真实MCP字节验证、Arena正文及引用验证、来源去重，以及本章62块正文的多页读回、5张图字节读回、原文/转录/caption/出现及来源绑定核对。

selection新增v16并保留v15，builder仅改版本名和对应SHA两处pin。其他selection项、027边界配置、hold/exclusion、owner及正式active均未变。实际覆盖在读回后更新为225/256原章、257/303原单元，预览225章/233单元/6224块/5067图，剩余31原章保持原状态。配置历史另存数据根`coac250-246-history-20261027`。

主要证据：`handoff.json`、`preconsume.json`、`gate-reverified.json`、`stage-receipt.json`、`intake-annotations.json`、`presentation-pixels.json`、`readback.json`、`coverage.json`、`final-verification.json`和`selection-pin.patch`。本目录是一次限定集成记录，初始pointer/版本断言固定，不可盲目重放；后续先查canonical SHA去重，不重做本章或090-6/027-1。整票继续in_progress，未切正式active，未合并、部署或运行效果实验。
