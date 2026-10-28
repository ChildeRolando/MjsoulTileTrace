v43本机只读检视入口已实际启动并核验：

- 主入口：http://127.0.0.1:8766/knowledge.html
- 日文232四注：http://127.0.0.1:8766/knowledge.html#limited232-1
- PDF257六注：http://127.0.0.1:8766/knowledge.html#p257-human20-limit-1
- PDF261问题17摸入3m：http://127.0.0.1:8766/knowledge.html#nemata-jp-p261-r50
- 中文311曲线说明：http://127.0.0.1:8766/knowledge.html#limited311-original-1
- 中文311手牌A限制：http://127.0.0.1:8766/knowledge.html#limited311-required-9

现有Arena实验控制台没有教材阅读路由，未启动实验控制台。使用现有已生成中文教材审阅页，不改页面、教材、v43指针或正式active。左侧目录切章；锚点自动选中所属章并定位段落。牌图可点击放大；257第五条说明中的两个来源ID可打开原始截图。页内审核意见仅保存于本机浏览器，可从左侧导出，不写教材。

服务由Python标准库http.server提供，只绑定127.0.0.1，固定目录为v43实际output，不随正式库变化。HTTP页面和语料文件逐字节与原v43匹配；全258章导航存在，五个浏览器定位目标及相应图片/校注实际可见，两个原截图链接HTTP200且SHA一致。检查没有运行模型、编校、制作或重建。临时检视浏览器已经退出，仅保留用户明确要求的只读服务。

服务启动于2026-10-28T17:28:36Z，PID43868。持久记录与日志：共享integration/coac250-v43-local-inspection-20261029/service.json、stdout.log、stderr.log。没有守护器，存活为best-effort；退出/重启后按start.ps1恢复，先排除端口占用，不重复启动。停止前确认43868的命令行为本次python http.server8766，再执行Stop-Process -Id43868；不按进程名杀服务。

inspection.json仅保存URL、版本、HTTP/SHA和浏览器可见性元数据。完整运行检查记录在同一共享服务目录；教材正文和图片未复制进本目录或Git。
