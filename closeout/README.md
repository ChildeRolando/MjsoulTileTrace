本目录记录 COAC-244 教材项目的现场收尾。清理范围仅为本批教材工单；不涉及 Review Loop、其他 Coach 业务、远端分支或平台历史记录。

正式交付为 v43，corpus `bd7a83525edb8cb69f27d8aa050dcb010047f79ae318748bdbe448d5b797836d`。原章覆盖256/256、原单元303/303；实际展示258章、266单元、8274块、6288图。用户接受的精确限定/unknown及原始独审记录继续保留，未改成普通模型全章passed。

本机入口：

- 正式阅读：`http://127.0.0.1:8767/knowledge.html`
- v43检视预览：`http://127.0.0.1:8766/knowledge.html`
- 人工标注与历史：`http://127.0.0.1:8765/`
- 正式MCP配置：`E:/AgentData/Coach/knowledge/review/mcp-config.json`

三个HTTP服务均仅监听loopback。它们是已交付的持久服务，清理不停止、不重启；无守护器，存活属于尽力保持。服务PID及启动/停止说明分别保存在原交付记录中，停止前必须复核PID命令行，不能按进程名称批量结束。

正式切换原始证据：`processing/integration/coac250-formal-v43-20261029/`，包含 `final.json`、真实MCP/Arena与浏览器读回、`release-inputs.json`、精确构建脚本及原正式库字节/缺失状态基线。正式切换提交为 `e8ecec1a93bc4ecd273a813c18e54fce3873da29`，包含原整书验收及772处分隔符显示修复。

可靠回滚点是实际切换前的正式corpus `3f44d5dcaf8dfadf64dc0225e40e5f97773da659bf4a6cc3ba18569c642b6129`（13单元/33图），不是凭版本号猜测的v42。仅在明确需要回滚时执行：

```powershell
node E:/AgentData/Coach/knowledge/processing/integration/coac250-formal-v43-20261029/code/rollback.mjs
```

不要为检查而执行回滚。基线及旧正式资产都保留。正式重建使用同目录 `code/rebuild.mjs` 与冻结 `release-inputs.json`；原作者内容、来源、原图、人工历史、审计raw和限定准入依赖未清理。

清理凭据与恢复：

- `runtime-inventory.json` / `retained-inventory.json`：路径、归属、逻辑大小、Git状态及保留原因。
- `live-reference-closure.json`：从当前v43精确绑定到达的文件及保守保留的旧预览。
- `cache-plan.json` / `preview-plan.json`：限定回收清单。旧会话、数据库、凭据、原始调用和唯一文件不在清单内。
- `recycle-*-receipts.jsonl`：实际回收结果、原路径、逻辑字节和失败原因。可通过Windows回收站按原路径恢复；回收站不清空，因此这些逻辑字节不等于磁盘已释放空间。
- `health-before.json` / `health-after.json`：正式/预览教材及两批人工文件逐字节保留、HTTP入口检查。
- `post-consumer/`：清理后的真实MCP/Arena复验。

`legacy-uncommitted.patch` 只保全旧依赖代码树的未提交差异，不是整个仓库备份。该旧树及其中未跟踪/忽略的唯一文件继续原位保留，没有 reset、clean、强制注销、改分支或丢弃改动。

没有为清理创建PR或执行PR批准；没有新模型、制作、识图或语义复审调用。
