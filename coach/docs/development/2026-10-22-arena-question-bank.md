# Arena 题库生成接入

## 实现范围

控制台新增生成、保存批次选择、无答案题面预览和未发布批次恢复；评测沿用 Arena runner、MCP、RAG 和 Mortal grader。
三种预设：随机平面何切、单家立直加另一家役牌副露、效率/保宝有序主张严格冲突。
独立的 Question Lab 自定义配置、SVR、扫描与研究报告继续走原 CLI，本次没有复制研究流程到控制台。

## 变更控制

- Locality：仅 Arena 离线组合脚本、控制台 UI、既有归档 DTO 以及 Question Lab 公共 native receipt 入口。
  不新增包、队列或 ReviewSession 写入；生产 desktop 没有 Question Lab 依赖。
- Invariants：INV-003/005 依赖边界；INV-004 原生合法行动；INV-013 盲测标签隔离；INV-014 合成来源和构造见证绑定。
  `check:architecture`、既有 Arena case/scorer/runner 测试与新增 question-bank/console 测试保护这些边界。
- Traceability：原生 Board 是合法性来源，helper 提供事实，Mortal 仅在评测时评分。
  归档保存配置、种子、代码身份、生产者、见证、可见前缀、逐次尝试、失败、事实、样本集合及无答案目录。
  合成题显式使用 question_lab 来源与 synthetic_source_group 分组，不能声明独立牌局验收。
- Replaceability：离线 bin 只调用包公开接口。现有真实牌谱读取及评分保持原路径与冻结身份。
- Recoverability：题目逐条落盘；中断后同身份继续；已发布目录不可追加。
  目录预览、源清单与样本均做内容绑定；运行重新查询完整 native 候选并拒绝集合变化。
- Semantic Load：不新增领域抽象；生成批次只为既有 Question Lab 归档增加 Arena 选择和无答案预览索引。

## 验证记录

- 定向回归：17 个测试文件、96 项通过；原生/学习环境专用的 22 项按原套件设置未启用。
- 单独启用真实原生接入回归：Arena 四个脚本合计 14 项通过，三种预设各生成 2 题；
  真实 Mortal 完整评分、同种子复现、重复发布不重新构造、已保存样本恢复、内容篡改拒绝均通过。
- 初次验证发现两个测试夹具问题：盲测的公开 wallRemaining 被误当作私有牌山，随机 opaque 引用被误要求跨批次相同。
  改为检查私有 wall 字段、比较完整样本身份；不改变产品隔离规则。
- 控制台停止测试最初在子进程退出前清理临时目录，Windows 返回 EBUSY；现等待 stopped 并断言后清理。
- 视觉检测器报告旧页面已有的低对比、微小字、装饰标签等问题。本次继承既有样式和共享 SVG 牌面，未扩大为整体重设计。

## 全量回归与真实控制台验收

- 全量 Vitest 首跑：236 个文件通过、5 个专用环境文件跳过，2,857 项通过；
  fixed-review-renderer 的 9 项因 Windows `spawn EBUSY` 失败，非断言失败。
  单独重跑该文件 31/31 通过；保留初跑与复跑日志，不修改断言或超时。
  归并结果为 237 个文件、2,866 项通过，22 项专用环境测试未启用。
- 另行完成 npm test 后续的协议更新器 26 项、协议兼容 4 项、fixture 生成 6 项。
  全包 typecheck 与 architecture（8 包、564 文件、2,829 imports、0 violations）通过。
- 干净代码 `91fe18d6fdd943c5124042a582ad70b5c8b9ab90` 的真实控制台运行：
  批次 `9d0f855c-c78f-4f6c-acbd-9aa50d170cd7`，严格冲突、种子 20261022、目标 3 题、60 秒预算；
  实际 3/3，92 次尝试，89 次条件筛除，3 个来源组。没有宣称随机均匀分布。
- 从该批次取第 1 题，实际运行 `gpt-6-luna / high / RAG off`：
  run `71db5321-d488-41fa-9332-b295e5f6636d`，1/1 成功提交，helper 调用 1 次成功，完整 10 候选 Mortal 评分与归档完成。
  本次与 Mortal 一选相同仅是管线冒烟结果，不作为模型质量结论。
  模型报告输入 88,375（其中缓存 43,264）、输出 2,726、合计 91,101 tokens；2 次 provider turn。
- 浏览器实测生成、完成批次选择、预览、启动单题评测、刷新恢复当前批次。
  1280px 与 648px 均无横向溢出；44 张共享 SVG 牌面全部加载；四家场面未分页或默认折叠。
  修复新生成表单的内边距/控件对齐、预览重复标题，以及运行中刷新后错误恢复旧题库分类的问题。
  后续 UI 修补不改变上述生成、规则或评测后端。
- 证据保存在本工作树 `coach/reports/arena-question-lab-validation/`（初跑日志、复跑日志、桌面/窄屏/牌面截图）
  与 `coach/reports/blind-discard-arena/`（完整实验档案）。这些是本机验证资料，不提交私有研究见证或运行日志。

