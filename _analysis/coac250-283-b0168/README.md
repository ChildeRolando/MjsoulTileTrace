283 的 b0168 单目标独审补证已接收；整章仍为 needs-repair。本轮仅做确定性核验及去重登记，新增模型/制作调用均为 0。

- 唯一候选 `b2417de19a50ec85609f75a4e07f07e002cf636785e1427948c06000a0967c2f`，唯一改动是 b0168“摸入宝牌”后新增“或”。逐对象验证其它 1194 块及全部 524 图与父 `dea1ba24…` 一致。
- 新 checkpoint `311df0ca…` passed、target/context faithful、完整目标范围比较成立、无新 issue。aggregate `d7c8b54d…` 保持 needs-repair。
- 同一冻结模块两个入口均实跑：`verifyGroupRevisionAudit` 验真通过；`verifyAuditForWebCandidate` 按预期拒绝，错误 `web_audit_not_passed_or_inputs_changed`。原 wrapper exit 1 属于整章门禁结果；真实模型 raw exit 0 且 turn.completed，不记为运输失败，不重试。
- 重算审校 manifest `80aa8e8b…` 全部 31 文件，及其生产 manifest、父候选/父审、原制作 raw、目标 raw/checkpoint、图片和批次证据。清理后的原预检请求及 selfcheck 从生产提交 `8a561add329def958c67d9347fe35109ac140ae5` 按原字节恢复，摘要逐项匹配。
- raw 中实际 prompt/schema/images 与已发布预检请求一致；两张北宝牌/四索原 PNG 的字节、SHA、顺序及 `-i` 原字符串均匹配。Windows planner 路径仅分隔符别名。实际 argv/requestExecution 为 terra/max，callerRequested sol/high 保持原记录；未改标签或路由。
- 127 块上下文包含完整 Q12 b0151–b0195 的 45 个日中配对块，targetTextIds 仅 b0168，targetFigureIds 为空；不是全组或全图复审。
- 原 16 条非靶 deferred 原样保留，batch010 的 113 块 passed 继承。六表补证仍绑定原候选 `dea1ba24…` 及自己的 receipt/raw；没有拿新候选覆盖另一分支，也未将限定补证变为整章接受。
- 历史制作 1 + 本次独审 1 = 2/2，剩余 0、retry 0。历史独审 call `3bbbff33…`：51957 input / 0 cache / 7936 output，109070 ms。费用、上游执行总数、远端权重未知。
- 当前 v24、preview、register（含上一轮217补证）、selection/exclusion/hold、正式 active 及两个已收限定补证登记全字节未变。覆盖保持 232/256 原章、264/303 原单元，余 24 章；本次增量 0，未启动 consumer、构建预览或声称新增 MCP/Arena 读回。

`verification.json` 为真实接收回执，`scope-and-remaining.json` 保留目标闭合、全部 deferred 和独立六表分支；`review-request-boundary.json`/`selfcheck.json` 是从提交恢复的原文件；`runtime/`、候选、父稿/父审及 raw/checkpoint 均按原字节归档，Git 禁用换行转换。复验入口为 `verify-intake.mjs`；禁止执行归档中的 maker 或 audit runner。
