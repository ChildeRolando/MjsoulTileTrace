# Arena 会话调用瀑布图

在实验结果的「调用过程」中，使用 vis-timeline 8.5.6 展示模型请求、工具调用和
提交事件；工具详情使用 affectUI 免费 MIT Tool Call Card。既有事件明细保留在
折叠区。没有引入追踪服务器、付费 Pro 组件、Multica 工单或 Controller。

控制台启动实验时即分配 run ID，通过环境变量传递给 CLI，显示「实时过程」入口。
CLI 校验 ID 并独占创建归档目录。准备阶段尚未生成 manifest 时，结果页每三秒重试。
真正发起模型调用前记录 `provider_turn_started`；提交事件也记录 elapsedMs。
服务端仅为自己持有的活动进程报告 traceLive，终止、历史残缺记录不会无限计时。

纯数据适配器、开源视图、现有归档轮询分开实现。整轮模型用量和 Arena bytes
保持不同统计范围，缓存输入单列。旧模型记录使用带标记的开始边界估算；工具没有
时间戳时显示未知。公开决策摘要与已记录工具参数/结果可展开，不声称观察到
Codex CLI 内部每个网络请求或私有推理。来源、许可证和构建说明见
`arena-console/trace/README.md`。

## 验证

- `npm run build`：通过，包括新增 UI bundle。
- Node 测试：trace / console / mistakes / presentation / dataset / question-bank，25 项通过。
- Vitest：runner 28 项、archive 13 项通过。增加提交时间戳后，第一次完整回归有
  1 项旧事件精确比较失败；将期望同步为包含数值 elapsedMs，保留引用错误拒绝断言，
  runner 28 项复跑通过。
- 浏览器：真实历史归档，1920×1080 下工具卡和时间轴同屏，无页面滚动；1366×768
  下无横向溢出。检查筛选、缩放/完整会话、参数/返回展开、独立缓存输入和旧记录标记。
- 隔离的本机测试夹具：通过实际 console 子进程与归档接口检查实时开始、暂停计时、
  恢复后追加事件、失败显示、停止后结果未知、13 条调用分页。使用独立 reports
  目录及 4321 端口，没有调用模型或污染实际实验结果；完成后关闭测试进程及服务。
- adapter 测试覆盖丢失心跳停止延长、历史未知时间、最终归档优先、案例隔离。
- 浏览器未发现新增脚本错误或 CSP 错误。保持原 CSP，将 affectUI 内联 CSS 在构建时
  提取为本机样式表；修复既有全局 pre 样式导致工具卡展开内容越界的问题。

截图及验收记录在工作区外的
`review-loop-closeout-artifacts/2026-11-04-arena-live-trace/`。
本次未进行付费模型端到端实验；新的开始/结束埋点由真实 runner 的测试验证。
