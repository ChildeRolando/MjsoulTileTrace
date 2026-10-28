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
当前技术版本的接口验证全部有效才可进入正式，失败不重试或自动加额。正式调用上限4090，含旧90次补充；
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
证明high、单次模型POST、空真实操作工具及JSON提交，未发生真实模型调用。
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

## 首次真实工程请求与有界格式修复

初始新冻结50951b81...以提交022853a执行首个DeepSeek A工程请求：HTTP200、high正确、
后端deepseek/deepseek-v4.1-flash-1017，但严格JSON提交未通过，已停止该技术版本。
此请求完整计费/失败记录保留，账本增至1293、工程148；无新正式请求。

修复版给Claude Code增加与Arena相同的输出schema，使用StructuredOutput收尾；
真实CLI对本地确定性夹具显示SDK计2步，但仅一次模型POST，第二步为本地结构化工具收尾。
不可用num_turns=2推断两次模型生成；仍需单POST、至多一个StructuredOutput且无其他工具。
仅规范化独立JSON围栏，候选、字段、引用和严格参数对象验证不放宽。
4900个现有输入的最大schema参数4254字符，通过Windows命令参数上限预检。

新命令repair-engineering仅允许上述唯一格式失败、没有新正式请求且仍剩2次工程额度时使用；
归档初始新冻结，固定相同数据/分组/预算/并发/模型后修订代码身份，历史模型定义另存。
剩余两个独立请求为Terra D、DeepSeek D，当前技术版本两者均有效才准入；
最初失败不抹除、不重发，不再增加工程调用。该最小接口检查不证明长期95%可靠性，
95%运行线仍由正式D全尝试结果判断。真实生成尚未通过门禁前不得启动正式。

## 修改时间误报修复（尚未追加工程额度）

修复版的Terra D真实提交成功。随后DeepSeek D在模型请求前13ms内返回
claude_runtime_changed，transportProof.forwardedModelRequests=0；没有发出模型POST。
冻结与当前Claude二进制大小相同、SHA256同为6099672ebe5dcb518b67d1d32dde1e3360bc6bee1dae7f8d28a69c49acc7c865，
仅修改时间不同。工程检查原先错误地把修改时间当作内容身份，现改为内容摘要核验，
按路径、大小、修改/创建时间及预期摘要缓存验证，真实文件内容改变仍拒绝。
42项聚焦回归、架构0违规及真实CLI纯本地夹具通过；未产生新模型请求。
本地证据qa/claude-runtime-touch-local-check.json不代表真实DeepSeek生成成功。

现有保守账本将此零模型POST的派发意图也计入额度：1295个已结算、工程150。
为保持所有历史账本不变，不自行释放该额度、不重发同一个键、不绕过门禁。
正式批量仍停止；8路并发代码已经完成并验证。
若追加一次工程复验，将在另一个独立工程局面上验证DeepSeek D；总上限由6140变6141，
工程上限150变151，正式4090、开发800、O600、Luna400、稳定性100及全部样本规模不变。
此追加尚未获批，当前冻结和运行门禁未改。


## 已批准的单次工程追加

用户明确批准“批准追加 1 次，总上限 6141（推荐）”。工程上限151，其他阶段与全部分组、
样本不变。新增批准保存在engineering-runtime-amendment-approved.json并绑定修订前冻结与
1295次已结算账本头。repair-runtime仅允许明确的零模型请求时间戳误报、Terra已有效提交、
没有新增正式请求且二进制内容摘要相同的状态；历史失败不删除，不重发旧键。

修订后复用Terra有效工程结果，在第四个独立工程局面仅发起一次DeepSeek D验证；
通过后8路并发继续，未通过不自动追加。原6140批准、旧冻结和历史模型身份全部保留。
此批准覆盖新增1次派发意图的保守预算，不能理解为允许额外重试或改变正式题目。


## 单响应读取修复（尚未追加新验证额度）

追加1次工程请求仍未通过：实际DeepSeek响应HTTP200、high正确，Claude Code随后自动尝试
第二次推理以整理结构化输出。单POST代理拒绝了第二次，因此保留为claude_cli_failed。
本次实际转发1次，14707 tokens，191634ms；历史失败不重发，账本1296/6141、工程151。

修复改为读取首个真实模型响应中的公开文本或唯一StructuredOutput参数，验证完整终止标记
与既有严格JSON/候选/引用协议后停止CLI。仅第一次完整响应可用，不允许模型纠正或重复挑选。
不改变首次模型请求正文，不强制工具选择或降低high，不接受前缀文字、截断答案或多次提交。
模型公开首答单独归档；隐藏思考仍不保存。是否SDK正常退出不再替代真实响应完整性的检查。

43项聚焦回归通过；真实安装CLI纯本地夹具验证结构化、纯文本、非法格式、截断四种路径，
每项恰好1次本地转发、0真实模型调用。qa/claude-first-response-*-local-check.json为本地证据，
不代表DeepSeek真实输出有效。后续新冻结必须区分此次协议实现与之前失败身份。
当前未追加额度、未修改正式分组、未启动正式生成。若获批最多3次独立真实验证，要求全部
有效才启动批量；任何失败即停，不再自动申请循环追加。
