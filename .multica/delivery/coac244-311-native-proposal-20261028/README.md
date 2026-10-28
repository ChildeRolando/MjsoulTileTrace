311忠实保留原图的待核呈现方案

本阶段落实用户01a1824d-ee23-74fe-b34d-964d7d59e2e3，只准备原图呈现及独立证据核查包，新增模型/制作/识图/独审调用0。不是新普通生产稿、准入证明或对作者计算的证真。

共享目录：`integration/coac244-311-native-proposal-20261028/`。

原源935bbfe6、父候选f44231f9、7777908d真实独审及原raw全部保持。独立的`presentation-proposal.json`保留225有序来源位置、204逐字正文、21图。目标b0122/124/126/128/130/132/156/158八张图直接显示源PNG原字节、原尺寸；13幅非靶完整图对象不变。原图上的日文图例、标记、曲线和轴随完整原图保留，没有重画或重新读取。

派生显示仅修改八靶的三个叶字段，共24项：transcription删去非原文144空槽补录，unknowns移除对应逐槽网格描述但保留精度与未绑定信息，presentationAsset改指原始源PNG。另加八条明确的非原文说明。所有作者文字、sourceSegments/强调颜色/链接/tableContext/顺序原样保留，去除144格仅发生于新proposal；原候选/raw/旧审的网格、uncertain、false及严重度一字未改。逐字段from/to与SHA保留在本机`derivation.json`，反向恢复可得父body/figures完整对象。

两幅一向听图的自摸/被自摸译义仅继承7777908d真实独审的明确陈述，旧整图verdict仍uncertain。未确认的两条件/两系列绑定不编造，b0132叉形约值不强配条件。既有数组仍保留为历史加工部分约值，不把它们包装成原书数据集，不新增数值。非原文说明明确低清图未独立恢复全部逐巡值与绑定，作者阈值、22%和约7000点按原文引用，未由本方案证真。

输出及边界：

- `native-preview.html`：完整225位置、21图、八条非原文说明的本机预览；全部图均原尺寸且可横向滚动，原文在原顺序中。不是Arena/正式教材库。
- `source-to-display-map.json`：每个源块→原正文/图→附注的有序SHA映射。
- `native-image-proof.json`：八靶原字节/尺寸/RGBA像素SHA及全部21显示图字节绑定。
- `independent-review-map.json`：旧8靶结论、40项影响和10条issue逐项保留/映射，不预先改旧disposition。
- `ordered-review-context.json`：完整source/父候选/新proposal/原审上下文，只保存在共享本机，不提交Git或附件。
- `review-boundary.json`：交249的核查问题和将来需要根安排时的最小合并独审边界。本阶段`invokeAuthorized=false`，没有执行模型。

实跑校验：204文字及sourceSegments与源逐字/逐对象相同；225位置有序；13非靶图全等；24叶字段反向恢复父对象；原144槽仅在原历史记录存在；18项越界拒绝检查通过。完整预览的浏览器DOM确认225来源、八附注、21图均加载原生尺寸；实际检查了图8的原图与说明显示。原片段定位截图曾为空白，已保留本机日志并以不改正式方案的单图视觉摘录复核；不将摘录当全文展示。全局MCP/Arena未执行。

仍须249独立区分：图/原句/图例忠实呈现是否缺失，与额外要求恢复作者全部数值的差别。204段源文字和原图当前字节均可达，不意味着已独立证明作者计算。原手牌A b0154源图12张/完整构型uncertain仍单列继承，附件编号source-note也保持；不得以八图方案覆盖这些范围或宣告全章通过。若发现实质漏译、错图/错条件或不可访问图继续hold。缺失绑定与额外逐点数据复现要求不能自动升级成144个人工输入。

可复验（仅本机机械流程，不含模型入口）：

```text
python build.py --root E:/AgentData/Coach/knowledge/processing --out E:/AgentData/Coach/knowledge/processing/integration/coac244-311-native-proposal-20261028
python check.py --root E:/AgentData/Coach/knowledge/processing --out E:/AgentData/Coach/knowledge/processing/integration/coac244-311-native-proposal-20261028
```

原阶段2/2余0、0retry，不借其它章额度。没有改变250全局覆盖或正式active，全书未完成。交249只做零模型接收/边界核对；任何新语义审校额度由根安排，不能把本提案当授权。
