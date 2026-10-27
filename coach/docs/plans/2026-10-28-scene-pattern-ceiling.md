# 场景模式上限评测实施与变更控制

## Scope / Locality

在既有 `scripts/mortal-ablation` owner扩展固定的一次性离线研究；新增CLI、教材适配、筛选、
调用账本、单次生成、选版及报告。复用现有 contracts/reasoning/native runtime/Arena scorer；
生产包及默认生成流程不变，无新架构层或通用实验框架。

## Invariants / Traceability

INV-001/002：硬事实继续由引擎产生，模式只提出关注点，Mortal仅在私有标注与评分路径消费。
INV-004/013：完整候选与原生标签绑定，生成显式投影公开DTO；canary测试覆盖私有字段不外发，
引用越界拒绝。INV-006/007：来源去重/配额、完整教材内容哈希、执行代码摘要、调用前持久化、
恢复不重发及失败分母均有聚焦回归。报告从请求/原始结构化返回重建提交并复核评分。

## Replaceability / Recoverability / Semantic Load

传输复用现有Arena provider公开接口，测试以providerFactory注入；不另造提供商接口。
所有状态限于独立研究目录，原教材与生产会话不修改。冻结内容漂移拒绝续跑，中断请求保留。
新增架构级抽象：无。预算账本和教材索引是此既有离线研究owner的内部模块。

## 执行

构建后：`npm run scene-ceiling -- all`。默认档案目录为
`E:/AgentData/Coach/scene-pattern-ceiling-20261028`。
分步命令：prepare、freeze、label、run --phase smoke1、run --phase dev-A、dev-V0、dev-r1、
dev-r2、dev-r3、select、run --phase evaluation、oracle、practical、stability、report。
status只给进度，不提前揭示正式胜负。recover只处理已退出的运行进程。

## Verification

聚焦测试先因缺少实现而失败，随后实现。最终实测、门禁和任何阻断写入此文档的执行回执，
不把静态检查或工程实现完成写成6000调用实验完成。

## 当前执行回执

- 独立工作树 `E:/AgentWorkspaces/Coach/scene-pattern-ceiling`，保留原教材工作树的全部未提交修改。
- 完整build、typecheck、architecture（0违规）、package-import（2项）通过；受影响8个测试文件共127项通过。
- 用两场真实牌谱各重复3次核对按需快照：快照/事实/规则请求哈希全部相同；原路径中位耗时
  501/2182ms，按需共享context为234/1000ms。证据为研究档案`sampling-parity.json`；
  可用 `node --expose-gc scripts/mortal-ablation/ceiling-benchmark.mjs` 复算并保留独立latest回执。
  点数完整性预筛复用现有mapper字段，原生规则入口仍完整核验；不在研究脚本建立第二合法动作来源。
- 教材副本232章、240单元、6339块、5128图片均已复制并绑定；当前43个完整单元超出6000字符，3个导航单元。
- 数据准备正在进行，尚未发布Mortal效果结论；真实调用及最终状态以档案读回为准。
- 加速后复核发现西入对局的整场排除语义需要显式保留。正式冻结和生成前已统一排除，
  原931个准备记录及7个西入来源完整归档至sampling-revisions；复用734个未看标签的自然样本事实缓存，
  按同一种子从头重建配额及挑战选择。相关源域回归进入聚焦测试，未消耗生成模型额度。
