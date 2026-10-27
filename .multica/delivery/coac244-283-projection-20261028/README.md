283零模型展示核验与下一步

canonical为`nemata-jp-chapter-283-1`。本阶段没有制作/校对模型调用，未改provider、旧raw、源文件、原候选或原审核结论，未改变正式active或全章覆盖。

原候选`dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899`与source.v3 `8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de`保留原字节；旧审`749e242c54019cb6b855a03e6df4fe465bed86e1cf50d7869be548a3b0144d40`仍needs-repair。

原HTML与main逐格一致：6表248格，包括94牌格、117空白格、13个↓、24家位表头，另6个表题。既有composeWebTables/编译器/HTML renderer已支持这些结构，无需重制94牌格或改通用框架。隔离导航预览通过真实stdio MCP、Arena工具分页读回及94原图SHA检查；生成HTML DOM的248个坐标/header/span、117个空白提示和13个箭头一致。这里未操作线上Arena UI或声称完成屏幕视觉验收。导航预览全部sourceRefs=0，不能作为完整教学论证。

`project-and-verify.mjs`沿用实际表格装配、段落装配、编译器和Arena工具，不传伪造passed审核。原表空白格的“（原表空白单元格）”为展示标签，不是原文。`projection-mapping.json`记录源块→衍生块/格位及94原图hash；`stage-files.json`绑定实际呈现文件。4项回归拒绝缺空格、缺箭头、移动箭头、改图hash。

旧4份真实审校raw的candidate projection漏传94个figure块tableContext（source侧却含表格）。`review-projection.mjs`校验原raw SHA与semanticProjection SHA，抽出逐块原始输入证据，再显式调用现有webSemanticProjection(...,3)准备同候选补证包；删除新投影中一个figure的坐标会被拒绝。旧函数兼容默认和旧快照不改，没有声称所有后续调用入口已经切换。`specific-table-review-input.json`仅为待审输入，不是模型回执或自动通过。

当前accepted-preview无283，canonical未accepted。同SHA batch010 b1022–b1134共113块有真实passed回执，应复用，不能重审全1195块。其余1093条faithful单块判定不自动变成完整题解已接受，其他旧错误保持。

完整第8题b0093–b0113和第12题b0151–b0195原日文、现中文、原图绑定及旧审在`semantic-target-packets.json`。

- Q8 b0099仍uncertain：只存有2007年03月外链引用，缺原始场况图/完整文字，尤其1s/2s可见数、完整副露、各家具体点数；原文仅给西家落后和东家第6巡吃8m。先零模型取得/绑定原件，不能猜河牌。当前本地web-source JSON只查到两版锚链接，不代表网上已不存在。未做网络抓取或收费审校。
- b0168有旧独审明确error：题设宝牌北，当前“摸入宝牌”紧接4s造成混同。精确建议只加“或”，其它1194块/图不动；这里只记录修订目标，不冒充制作成果。须沿合法maker1+独审1，完整Q12与b0153/b0169原图入审。无授权自动执行。
- 6表坐标/空白/箭头机械展示已闭合；旧审有效结论转换仍需既有独立专项门禁，只建议1次专项独审，无新制作。旧94图判定为28 faithful、66 needs-repair（后者证据说牌码准确但缺格位），原等级不改。专项包带这些原判和去重原牌PNG，后续含图请求使用terra/max；不是把66图自动变passed。拟下批合计3call（表专项1+b0168制作1审1），失败/void计、0retry；本轮0call，货币额未知。Q8原件到齐后的首次独审另建议1call，不挪用其它票额度。
- 仍保留b0396、b0962、b1017、b1181文字问题及b0785/b0947复杂图争议，不以表格核验宣布整章通过。

共享交接：`integration/coac244-283-projection-20261028`。现有两个剩余register仅283行增加展示证据/下一步，covered未改。不新建消费者/票，不派发其它在途工作。独审预算仅为具体建议，当前不调用模型。
