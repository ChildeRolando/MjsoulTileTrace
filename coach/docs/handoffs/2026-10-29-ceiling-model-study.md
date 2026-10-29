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


## 最终工程追加已批准

用户明确批准“批准最多 3 次，总上限 6144（推荐）”。新增批准在
engineering-single-response-amendment-approved.json，绑定1296次已结算账本和修订前冻结。
工程总上限154，其余阶段预算及全部正式分组不变。新独立工程局面为附加工程集第5/6/7题，
分别验证DeepSeek A/C/D；加上已通过的Terra D，当前版本门禁4/4才准入。
任一新验证失败即停止DeepSeek接入，不再自动追加，失败和未花额度均如实保留。
单响应读取改变客户端输出收集方式，首个模型请求正文不变；实际模型身份另记single-response-r4，
之前失败请求使用各自历史模型定义，账本及旧记录不重写。


## DeepSeek已按约定停止，继续已就绪的正式子集

最终三次批次的第一题A在13.9秒返回完整StructuredOutput，但call内部多出一个不允许的
字段decisionSummary，既有严格根结构校验拒绝；不删除字段、不放宽规则、不把失败改为成功。
实际后端/high均正确；未知cache细分导致本次总token仍保留未知，已知输出1717。
账本1297，工程152/154，剩余2次不再使用，不申请更多工程额度。

stop-deepseek将首次失败和已批准的停止条件绑定为model-route-stop.json，禁止DeepSeek
所有后续工程/正式请求。继续用户已经批准的Sol200题及Terra200题，各2路共4路并发；
evaluation-ready只执行这两个原分组内全部五组共2000格，不换题、不把DeepSeek题转给其他模型。
Sol沿用原49/50有效工程门禁，Terra沿用已有效的独立工程D；不得把就绪子集称为全轮完成。
追加调用1745（Sol745、Terra1000）；原255主格复用、90旧跨模型补充和全部失败保留。

子集使用独立复算ceiling-ready-validate.py；完成后权威状态为ready_subset_checked，
wholeStudyComplete=false。完整三模型报告、O/Luna/稳定性和正式800题视觉验收仍未完成。
DeepSeek路线后续如何处置需要新的明确决定，不得自行换模型、消耗预留2次或启动旧all。


## 用户要求追加调试后已跑通，恢复完整三模型并发

用户随后明确要求“追加调试，让deepseek跑通”，撤销前述DeepSeek停止安排；使用原6144
总额内未花的2个工程槽位，不增加任何预算。批准记录deepseek-debug-resume-approved.json。
只兼容call内部重复的公开decisionSummary元数据，固定保留外层总结；选牌、理由、引用及
备选参数逐字保持不变，其余非法格式仍拒绝。原失败工程题离线重放通过完整Arena校验，
旧失败不重写；原始首答、规范化字段和规范化后的响应同时归档，独立复算核查只改变这一字段。

为让新路由及时加入并发，已核对归属后受控停止Sol/Terra阶段及其检查进程；所有完成结果
保留，4个在途意图保留为interrupted并计入失败/额度，不补发。记录qa/deepseek-debug-controlled-switch.json。
停止后账本1794已结算（正式842、工程152、开发800），无悬而未决请求。
随后两个独立真实工程请求C/D均有效；C使用元数据兼容、D无需兼容，均为正确DeepSeek后端、
high、单次POST。工程154/154，总1796已结算。45项聚焦回归、架构0违规。

新冻结revision6仅切换DeepSeek传输收集/元数据适配，保留书库、模式、检索、题目、模型配额
和Sol/Terra所有输入；逐文件检查禁止改动非传输生成代码。旧冻结、停止及恢复记录全部保存。
两次Deep工程加原Terra有效提交构成3/3接口门禁，Sol仍沿用原49/50门禁；不把小样本称为
95%总体可靠性证明。正式与稳定性恢复Sol2/DeepSeek4/Terra2，完整all及独立复算继续。
总上限6144不可增加，工程额度已用完；正式失败仍按全尝试分母，不重试、不选优。


## 总结元数据不再决定弃牌提交成败；修正格式失败触发整批停机

首批53次DeepSeek正式尝试37次有效、16次格式错误。16项中8项只有call内总结、缺外层总结；
6项没有公开文本、1项工具内容缺失、1项响应JSON本身损坏。用户明确询问能否丢弃总结而保留
其他内容不判失败，现依据既有Arena结果契约（decisionSummary本就是可选展示字段）忽略外层
和call内的总结元数据。实际call.name/arguments须完整JSON、工具名有效；弃牌、理由、引用及
备选参数仍按原Arena规则校验，未知字段、多次提交、空回答、损坏JSON仍拒绝。

不改变任何模型请求正文、教材、模式或规则；只调整客户端解析。47项聚焦回归、架构0违规。
完整53项零模型重放保留原37有效，另外8项可解析出合法提交，证据qa/deepseek-protocol-v6-replay.json。
原8项失败记录不重写、不重发，新增兼容信息仅作诊断；主统计仍保留原全尝试失败。后续调用
不因总结位置/重复/缺失/类型错误被拒绝。公开rationale作为随实际决策提交的解释保留。

修正停机判断：HTTP200且已核对后端的claude_invalid_model_response属于模型输出失败，
计入失败分母但不当作服务断线触发全局暂停；真实未知传输失败、超时/额度等仍保留停止保护。
旧原始服务异常判断触发的暂停和校验未完成记录归档，未重复已派发槽位。

新冻结revision7/transportRevision=metadata-location-v6；逻辑模型配置与首次请求正文不变，
实际传输实现由冻结源码摘要和每次proof.protocolCompatibility区分。保留revision6及旧工程证据，
通过53项公开输入逐一相同、实际候选和引用校验不变及非传输生成源码未改的检查后恢复8并发。
工程已154/154，不再产生工程模型调用；总硬上限仍6144。


## 恢复时旧502记录不得反复触发停机

一次DeepSeek HTTP502没有返回模型内容，被记作claude_backend_not_verified。恢复遍历缓存时，
路由身份保护没有检查fresh，错误地被同一条已归档失败反复触发；旧请求没有重发。
修复仅使身份保护作用于新派发请求，并将明确HTTP错误按服务失败处理；成功HTTP返回错误
后端、实际代理切换及客户端内容变化仍立即停止，连续3次真实服务异常仍停止。
旧502及所有其他失败保留；模型请求、解析、候选、标签、教材、检索均不变。
48项聚焦回归、架构0违规；新冻结revision8单独绑定执行保护修复，预算仍6144/工程154。

用户另授权：Codex剩余严格低于2%且实验未完成时使用现有重置卡；本机只读查询目前已用91%、
剩余9%，CC Switch可见存下的重置剩余1次。只在条件满足时使用，并核对结果；额度重置不改变
实验模型请求次数上限。策略与零模型用量快照在主档案quota-reset-policy.json及qa/quota-check-*。


## 最后交接：不依赖DeepSeek的部分已全部完成，等待用户更新过期密钥

权威状态见主档案STATUS.md。当前冻结revision8/hash bd3d7b9ae4ea4bbef8c4f67654bfc6d96dbbc93ef2f002b613f9e3856754b400，
生成源码提交5446592；以后文档提交不改变该源码身份。调用4869/6144、全部结算、无在途。
Sol1000/Terra1000正式齐；DeepSeek934/2000（679有效，255其他失败）后因Command Code密钥过期停止。
200题选材163成功37失败；可运行O93=74有效+19选材失败；Luna400=379有效+21选材失败；
Sol/Terra重复42均有效。90旧补充保留。余Deep正式1066、O107、重复58，不重发既有失败。

非敏感错误证据command-code-auth-pause.json：服务401明确提示API key expired。
已异步请用户在CC Switch更新有效凭据，不索要聊天中的密钥；配置仅有这一个Command Code连接，
尚未找到已有其他有效凭据。当前凭据哈希与过期凭据相同，禁止继续试发DeepSeek。
用户更新后，核对provider ID67b25f76-26ac-4318-b10f-27438a518ad3/后端DeepSeek/effort high，
再恢复新bin/scene-pattern-models.mjs all；当前helper已正常结束，不要重启无用的ready helper。
如有新helper在途，先写qa/auth-resume-drain.json让它停止接新题并等结束，别杀在途调用。

辅助coordinator qa/continue-ready-while-auth.mjs通过同一冻结owner/预算账本执行上述可运行部分，
没有改模型请求、书库、候选、模式或检索。原版快照和每次协调器源码哈希、进程及退出日志均归档。
选材阶段按连续3次真实服务错误才暂停，单次失败写入原失败文件后继续新题，不重试。

独立部分验收ready-parts-validation.json通过4869请求/响应链及3559条已有记录合法性/引用核查；
wholeStudyComplete=false，没有提前汇总Mortal胜负。完整复算及800题视觉验收仍未完成。

用户明确授权Codex低于2%且未完成时用卡。已于22:17UTC在剩余1%时通过官方CLI重置接口用1张，
验证100%、ordinaryUsageAllowed=true、卡0；最新78%。工具qa/check-or-reset-codex.py经过8项零副作用
条件检查，账户哈希/阈值/幂等键/实验状态均有保护；意图及成功回执在quota-reset-*.json/qa/quota-action-*。
不购买新卡、不增加模型调用上限。quota-reset-policy.json.experimentComplete仍false，整体实验未完成。

Goal工具当前显示blocked；等待用户恢复凭据。可用模型工作已全部做完，停止重复空轮询以节省token；
用户回复已更新后恢复15分钟监控。既有批准、失败、旧冻结和当前原始统计不可抹除。


## 2026-10-29 重启后档案恢复

06:13:42 UTC 电脑重启。旧主/复算进程均消失，账本5034次已派发，其中4次在途按 interrupted 结算，未重发。v9续跑未新增调用，因一个全零派生结果安全停止。

对 calls5034/runs4674/requests5034/oracle200 逐文件解析，发现恰好3个全零文件：DeepSeek 5902a03b4b38950093f44330 C 的原始响应及派生结果，另14e9a1dc3215c7a1a50eae24 B 的请求。原文件原样备份，详见权威档案 qa/reboot-file-integrity-scan.json、archive-recovery.json 与摘要绑定。

损坏请求用冻结的相同事实、模式、教材和模型重建，摘要逐字绑定到原派发记录。丢失的响应原账本虽记ready，但无法验证其实际决策，故在原分母内显式按档案丢失失败计；不重试、不换题、不推测答案。原账本及原call摘要均不改。报告读取和独立复算仅对这一固定键核对显式更正与备份，不放宽其他响应摘要检查。

生成源码仍5446592、freeze revision8 / hash9c32df9dc6c29c49c01499ef1caef696e2b75379786d38cd406fa6f753f55ce7。仅更新报告、独立复算及本交接文档；旧报告源已保存在report-revisions。真实调用预算仍6144、工程154满额。恢复脚本及验证均零模型请求。3项本地验收覆盖真实恢复、篡改回答拒绝及篡改原损坏证据拒绝。

报告另明确披露凭据更新后服务回显1017变1017-cm，不断言权重相同。最终须在独立复算外完成800题页面视觉验收。


## 最终收口

全部生成已结束：账本6082/6144，无在途；正式4000格＋旧Sol补充90、O200、Luna400、稳定性100齐全。独立数值复算通过，修正了本地链接检查未去掉URL查询参数的问题；真实牌图文件存在，未放宽文件存在校验。800页在隐藏IAB逐页渲染检查，38019个图片元素，坏的已加载图片/横向溢出/核心信息缺失均0；代表截图目视检查覆盖三模型、手牌、Mortal选择、实际资料展开、失败、Luna、重复与旧补充。QA回执明确区分全量渲染检查和代表截图目视检查。

正式自然集：Sol A109/150、D102/150；DeepSeek A140/300、D144/300；Terra A105/150、D98/150。均未满足预设投入线。D的全正式运行成功率为99%、75.5%、99%。Luna D65/100对A64/100，token比1.23464，区间仍不确定。开发三候选未胜V0。

完成后检查实际请求发现：C/D在800题实际交付完全相同资料，D主要增加模式提示，不能把本轮结果称为有效场景路由上限。自然600题只检索19个不同单元，最高频单元558题；仅为描述性诊断，不认定为偏差原因。O选材37失败（31超材料预算、6服务），有效提交条件下O−D仍有宽区间，不能判教材无用。详见REPORT.md、qa/post-run-diagnostics.json、qa/actual-material-equality.json、qa/retrieval-concentration.json。

数值可复算及报告再生成均零模型请求：先运行scripts/mortal-ablation/ceiling-diagnostics.mjs <out>，再bin/scene-pattern-models.mjs report --out <out>，最后python -B scripts/mortal-ablation/ceiling-model-validate.py <out>。生产默认与正式教材库没有切换。用户取消15分钟限频后，已删除监控15，继续在本聊天完成归档。图形预览为只读本机18974端口、后台进程11736，不占桌面窗口。
