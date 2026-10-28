正式教材库已按用户2026-10-28T18:07:54Z授权切换到已检视v43，包含分隔符修复45d78562与整书验收2133c68c。没有GitHub PR approve、模型/制作/编校调用，也没有扩展生产推理、Mortal或RAG功能。

正式阅读入口：http://127.0.0.1:8767/knowledge.html 。旧8766仍为预览，目录/文本相同，服务器根目录不同；8767已实际读取knowledge/review，不是把预览地址换名。原正式MCP配置knowledge/review/mcp-config.json及其command/args字节未改，重新启动的真实正式消费者已返回v43。没有独立active指针文件；原正式入口是固定review目录下的正文/语料清单。

切换前实际正式corpusId：3f44d5dcaf8dfadf64dc0225e40e5f97773da659bf4a6cc3ba18569c642b6129，4展示章、13单元、33图，corpus文件SHA9836ee5b7043a1f9d9b13bc36e2dcb653d16b883ccb1975d71945365bc759af2。
切换后正式corpusId：bd7a83525edb8cb69f27d8aa050dcb010047f79ae318748bdbe448d5b797836d，原章256/256、原单元303/303，21212原来源位置有明确版本/所有权映射；展示258章、266单元、8274块、6288图。版本对应不等于PDF/网页逐字相同，也不把来源说明和补充单元增加到原章分母。

使用既有publish-textbooks.mjs的resumeTextbookPublication七文件发布日志流程：完整stage先验证，按内容SHA预置资源，再以原子文件替换提交，并验证已安装清单。原始目录、原清单/配置字节、原文件缺失状态及资源均先归档，原始源/人工标注/raw/历史审计包不改。未将限定证据改成普通全章模型passed。

正式实际验证：

- 从原正式MCP配置起真实stdio消费者：258目录项、266单元全文、6288原图片字节全部与已验收内容一致；正式Arena逐页全文相等、16384字节边界、先读尾部不得取得引用、完整读取后才可引用，navigation仍不授教学引用。
- 232四注、9m/3s；257六注、两原截图链接、20人标及第一批九位的既有应用；261 3m；311八图说明及手牌A限制；772处分隔符显示修复全部保留。原unknown、源注、原false/uncertain不改。
- 从正式8767用真实Chromium核验七个锚点；图片/所有目标注可见、两原截图HTTP200，两个实际正文段的六组分隔符仍display:block/white-space:pre。
- 切换前后各一次从固定SHA输入重建完整258章/266单元/8274块/6288图，编译语料与HTML字节精确恢复；重建保留三项既有链接hook及分隔符post-build处理，不依赖已被替换的旧正式目录内容。两项新增回滚机械测试通过；复用同代码v43工程/教材/Arena验收，不重复编校。

固定输入和实际运行证据在共享integration/coac250-formal-v43-20261029。最初启动只读服务时，继承的输出管道使启动包装未退出；只调整了该自有HTTP服务启动方式，发布事务没有重复，后续正式验证全部通过。最终服务PID63672，只监听127.0.0.1:8767，日志reader.restart.stdout.log、reader.restart.stderr.log。无守护器，存活为best-effort；停止前核对该PID命令为本次python http.server8767，再Stop-Process -Id63672。8766服务未改。

可靠回滚（拒绝覆盖其它新版本，先取同一写锁）：

    node E:/AgentData/Coach/knowledge/processing/integration/coac250-formal-v43-20261029/code/rollback.mjs

该命令从before.json绑定的rollback/formal-before恢复旧正式清单/正文/页面及原文件存在状态；保留原33图和全部旧读者资源，新增但未引用的内容寻址资产无需删除。完整旧目录另存rollback/reader-before。若本次切换后的验证失败，activate.mjs会调用同一恢复过程；本次所有验证通过，未触发回滚。

正式重建（目的地必须全新）：

    node E:/AgentData/Coach/knowledge/processing/integration/coac250-formal-v43-20261029/code/rebuild.mjs E:/AgentData/Coach/knowledge/processing/integration/coac250-formal-v43-20261029/release-inputs.json <全新输出目录>

历史257门禁所用旧source-library模板knowledge-index字节已单独归档并按3a1a8e5b…绑定。旧路径现在属于正式v43；正式重建使用已验收且SHA封存的正文、定义、代码与资源，不把活动库路径当成旧模板重新套源制作流程，不改历史门禁结论。

本Git/附件仅代码、SHA/来源绑定、独立结论及摘要，不含教材全文/图像、人标事件或完整raw。publication.json/final.json为本次正式发布收据，原预览与旧审计收据未写回新判定。
