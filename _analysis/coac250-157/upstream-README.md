157-11 首次 terra/max 含图独审通过，确定性复验通过。

授权：COAC-249当前description及COAC-244统一冻结交接`audit/vision-runtime-current.json`。唯一候选`1807377c…`，调用`eff9a0e4-5072-4f54-ad15-8d065c9b98dd`；1审、0制作、0重试。耗时84,709ms，24,497 input / 0 cache / 5,990 output tokens，费用未知。18源块、7图、7次出现全覆盖，issues为空。

`precheck.mjs`复用原43项零调用核验，`intake.json`保留该中间阶段的pending标签；实际冻结配置放行以随后`admission.json`为准。27个冻结文件SHA全部匹配。`run.mjs`只使用现有有限显式驱动、max-targets=1，不修改共享驱动或冻结脚本；正常以wx取得原finite-current-driver.lock.json并在finally只释放自己的guard。`collect.mjs`不派模型，核实际requestExecution、原图/放大图payload、结果、终态去重及输入不变。复验不新增模型调用。

完整实际CLI argv和10张图的有序SHA/字节在attestation及原raw。子进程实际使用gpt-6.1-terra/max；返回事件只有thread/usage，没有模型或effort字段。远端实际模型/effort与权重未知，不能从请求字段推断。原收据method仍带历史sol-high名称，未改原件；实际模型以call/requestExecution为准。制作940cf63b保持原sol/high，不重标。

审前该候选0次审校，审后1次、1个结果行；select-only从selected1变为selected0/terminalSkips1。所有原输入和冻结依赖审前后SHA一致。这里仅声明本候选无重复；不将历史18项去重统计写成历史零重复，chapter06-exercise003等旧重复/失败记录未改。

`process-after.json`证明runner9800、driver64172、codex38624均结束，guard不存在，CLI临时目录已清除。当前Multica顶层run的终态及平台目录租约释放只能在退出后由平台观察，本证据不提前宣称。无后台工作、无强删锁。

完整首件证据同步至`audit/coac244-terra-first-live157.json`；给250的单章交接为`integration/coac249-reviewed-157-11-terra-20261028.json`，其SHA为`ba00d7d34366431e5e7fca4b52f6356e699cdcd49946545d870e4562cd5ebfd6`。通过仅覆盖157-11，不外推276或其它未审章。全量编校尚未完成，工单保持in_progress。

本轮仅新增业务证据和可复核的有限执行脚本，无产品代码或共享执行入口变化，无需PR。

平台交付受阻：创建250一次性唤醒失败，后续读取其唤醒列表也失败；结果评论（附attestation、原收据及raw）发布失败，未确认有任何新评论或唤醒写入。CLI诊断为GET https://api.multica.ai/api/issues/01a17471-1595-79d5-bdfa-6feaa65172c0: EOF，network_offline。未反复执行不确定的写操作；仅CLI进程临时尝试http2client=0同样失败，环境已恢复，没有改全局配置。共享交接文件与244首件记录均已真实落盘，不能声称250已接收或合库。恢复连接后先查交接SHA是否已登记、评论是否已发布，仅补缺失写入，不重跑模型。
