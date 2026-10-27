# COAC-250：347-1限定增量集成

仅接收 `nemata-jp-chapter-347-1` 对应的 `modern-yabejp-ja/archive01-section008`，候选 `45b67ef6`，源 `62523932`，passed回执 `5215961e`。当前原始字节、真实raw、父链、字典、术语来源及九个冻结依赖均确定性复验通过。没有新增制作、审校或其它模型调用，没有修改运行时或语义门禁。

唤醒所载交接摘要 `764263db` 已被上游明确更正。`recover-handoff.py` 通过只读git对象取得244提交 `e61a3a8af63505e82afc106c4cf9f074c89d05fe` 的原始归档；交接 `9394aca8` 与数据根逐字节一致，当前250描述revision125也绑定更正摘要。更正说明称归档复核重新写入打包时间，原候选、源、审校及raw摘要未变；本次分别核验，不重建最初交接字节。见 `handoff-correction-proof.json` 和 `upstream-*`。

仅b0066文字在上游得到新独立审校；未变的其余范围继承已认证完整父审。完整父候选 `522447de`、原父审 `f10c5c6f`（原状态needs-repair）和父raw均保留，未覆盖原结论。新回执的目标审校与有效合并审校分别检查。27幅图语义字段及其余正文与父稿、既有r1相同。本次图像字节完整性读回不称为新语义审图。新译文保留“易得、易出程度”，绑定同书原始定义。网页与PDF沿既有授权替换对应，保留 `bodyEquivalenceConfirmed=false`。

独占既有consumer锁，仅stage本章。原233单元（含027、090、246）逐一比较完全相等；此前JPEG原始资产、派生关系和三批source-note也保留。全章66源块（39文字、27figure）装配为15个展示块，真实MCP分3页读全，27幅图逐字节匹配，77次源图出现及来源绑定保持；完整中文文字、转录和caption均核对。整库234单元/5094图的MCP、Arena正文/引用、来源去重均通过，跨章来源冲突0。

发布前完成实际回读，随后更新pointer及覆盖。预览为226章/234单元/6239展示块/5094图，corpus `326c23be…`；原书覆盖226/256章、258/303单元，剩余30章。selection v17 `916476e4…` 仅替换本章旧r1，保留v16和旧job；builder仅改版本名、SHA两处pin。其余79条登记、selection项、定义边界、hold/exclusion、owner与正式active保持。155、276、222及p217未处理，主书未全部完成，整票继续in_progress。

主要证据为 `preconsume.json`、`gate-reverified.json`、`stage-receipt.json`、`intake-annotations.json`、`readback.json`、`coverage.json`、`final-verification.json`、`selection-pin.patch`。脚本是本次一次性执行记录，固定了起始pointer/selection断言，不应盲目重放；后续先按canonical SHA去重。没有重跑历史章、合并、部署或切正式active。
