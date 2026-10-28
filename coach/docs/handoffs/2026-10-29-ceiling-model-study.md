# 三模型修订执行交接

正式任务仍是完成全实验和交付，不是只实现接入。预算与分组以用户最新批准为准。

- 工作树：`E:/AgentWorkspaces/Coach/scene-pattern-ceiling/coach`。
- 主档案：`E:/AgentData/Coach/scene-pattern-ceiling-restart2-20261028`。
- 批准：`model-amendment-approved.json`，总6140；四个200题块均150自然/50挑战。
- 分组：`qa/model-amendment-proposal.json`，Sol200题、DeepSeek400题、Terra200题。
  旧345个Sol正式请求中255进主样本，90作跨模型同题同组补充，不删除或重新生成。
- 旧进程35184已按用户改版要求停止，旧343完成（339有效/4错误）及2在途中断均保留。
  两个中断已从归档call物化为失败run，未再调用模型；现有345条完整run均通过新上下文
  摘要一致性核验，证明可以直接复用。此前所说的323次也都包含在内。
- 旧总1292次全部结算，账本、旧freeze和选版均不改写；此前中断轮2748次仍另档。
  旧代码及账本前缀见`model-revisions/before-model-amendment-1292`。

## 新入口与冻结

仅用`node bin/scene-pattern-models.mjs ... --out <主档案>`。
命令为freeze、status、recover、run --phase smoke/evaluation/oracle/practical/stability、all、report。
**禁止恢复旧scene-pattern-ceiling.mjs all**；旧单模型冻结不能代表新三模型条件。
新身份为model-freeze.json及model-freeze-binding.json，引用旧freeze/selection/账本边界，
单独绑定新代码、分组、预算、CLI与并发。生成代码冻结后禁止编辑；报告/复算修复须等生产
进程退出再归档旧源码，最终针对真实产物重做复算和视觉检查。

正式与稳定性总并发8：Sol2、DeepSeek4、Terra2；选材阶段2并发，Luna复验4并发。
三次工程验证串行，使用旧工程150上限剩余3次（已用147）：DeepSeek A、Terra D、DeepSeek D。
全部有效才可进入正式，失败不重试或自动加额。正式调用上限4090，含旧90次补充；
其中Sol至多1090，DeepSeek2000，Terra1000。其余阶段总预算保持原值，合计6140。

## 路由与单次请求

Claude Code实际二进制为npm包bin/claude.exe，版本2.1.312。opus/high是客户端别名，
实际目标为Command Code的deepseek/deepseek-v4.1-flash系列；成功记录已有-1017回显。
**providers.is_current不是代理实时路由**：本机该字段仍显示Codex，而/status的
current_provider_id及成功请求记录已经是Command Code。优先读实时代理状态/关联记录。
新适配只用已有本地代理，不切全局设置；隔离子进程config/CWD、禁用真实工具/MCP/hooks，
只放行一次模型POST，禁止CLI辅助调用/重试造成额外模型turn。记录实际回显、高档参数、
num_turns和原始token计数，不保存stderr或隐藏思考。代理内部网络重试仍有可观测性边界，
不能把实验provider派发意图上限说成上游所有HTTP次数的精确上限。

## 已验证与仍待完成

41项聚焦回归通过，架构0违规；真实安装的Claude CLI对本地确定性响应夹具通过，
证明high、单次POST、num_turns=1、空真实工具及JSON提交，未发生真实模型调用。
证据为qa/claude-local-transport-check.json。345旧Sol上下文复用验证见
qa/model-legacy-reuse-validation.json；800题配额及255/90守恒已按盲分组规则重算通过。

接下来：提交推送、冻结新身份、三次真实工程验证，再启动新all与
`python -B scripts/mortal-ablation/ceiling-model-validate.py <主档案> --wait-pid <主进程>`。
进程编号与日志以后始终读最新pipeline-process.json / validation-process.json，
不能把旧PID或last-error历史文件当作当前状态。只有真实进程不存在/终端失败才可恢复。

最终须完成4000主评分、90补充、O200、Luna400、稳定性100、按模型自然集150/300/150
的独立复算，以及800题页面视觉验收和中文结论。D与V0同配置，差异不是优化收益；
DeepSeek/Terra使用Sol选出的V0，只能称迁移验证，不能称各自优化上限。模型间分组不同且
Sol优先复用历史，绝对一致率差异不能直接归因于权重；旧90补充也有时段/中断限制。
每题图形入口同时保留主实验、O、Luna、稳定性及旧补充。成本、选材成功情况、教材43个
超预算单元及未查看图片等限制，仍必须写进最终中文报告。技术实现通过不构成任务完成。
