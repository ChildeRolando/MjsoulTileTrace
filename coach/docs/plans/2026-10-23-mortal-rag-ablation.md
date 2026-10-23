# Mortal 一选标签的轻量消融实验

用户批准先验证 18 条模式提示整体，控制成本；样本由 12 扩至 **20 场独立牌谱，每场一手**。
本实验独立于先前 60 局知识需求标注及专家讲解评价。Mortal 是模型偏好标签，不是教材、
规则或讲解正确性的权威。不改生产 Coach 开关。

## 冻结设计

|组|18 条提示|检索|
|---|---|---|
|A|关|无|
|B|开|无|
|C|关|原检索，主题枚举已修复|
|D|开|原检索，主题枚举已修复|
|E|关|small-to-big + context enrichment|
|F|开|small-to-big + context enrichment|

这些字母仅用于本六组实验，与先前四组 A–D 命名没有对应关系。
12 场随机 + 8 场挑战，另有一场独立试跑；正式 120 次、试跑 6 次，不自动重试。
排除早期 180 局、全部已扫描准备池及上一轮上下文检索试验的牌谱与同哈希来源。
固定种子决定牌谱、座位、决策和组别顺序。随机样本取首个合格弃牌窗口；挑战样本从
每场前 12 个合格窗口中优先选补足尚未命中的模式，其次命中总数，再按 id 决胜。
未完整绑定规则输入的牌谱明确排除；这种筛选限制外推范围，排除日志随档案保留。

选样冻结后才运行 Mortal，沿用完整 libriichi 合法动作、原生 preferredRuntimeAction、
绑定校验和 Arena 独立评分器。主指标只比较原生一选对应的规范候选，原始 Q 并列数量
另报，不把所有并列项悄悄扩展为正确标签；摸切/手切等价沿用已验证 physicalRealizations。
标签、完整分数及运行身份只存 private-labels。生成程序不读该目录，始终用 unavailable
占位评分，最终提交锁定后由独立 report 命令重评分。

六组完整公开局面、事实补充、合法候选、模型与参数一致。B/D/F 只多一个确定性模式提示
消息。C/E、D/F 的初始请求逐字相同；检索组件差异直到检索结果返回才出现。
模型可不检索；不检索也是处理组效果的一部分，禁止只留下实际检索的成功案例。
检索最多 2 次，每次 3 卡，共 6 张去重父卡，父卡最多 1000 字符；原/增强共享知识卡 v2。
固定调用模型为运行时 Coach 设置（本机默认 gpt-6-luna/max），并发 2；每次最多 4 轮、
2 工具调用、32768 输出 token、300 秒。CLI 单轮 120 秒上限仍有效，超时不补跑。

## 统计与成本

主指标为每组匹配数 / **20 次计划尝试**，失败及不可评分样本留在主分母。
另报可评分提交的条件一致率、失败种类、原始 Q regret（辅助）、检索次数和无结果率。
随机和挑战分别报告；混合总体只是这 12:8 固定样本的描述，不能解释成人群真实发生率。
比例给 Wilson 95% 区间；五个主差值 B−A、D−C、F−E、E−C、F−D 按牌谱配对重采样
2000 次，并用精确配对不一致数检验及 Holm 校正。交互差 (F−E)−(D−C) 只描述。
18 个命中分层有共现与小样本问题，不作为逐条因果效应，也不用于调参后重报。

记录 provider 实报 input/cached input/output/total token、耗时、失败和每轮请求/响应。
缓存输入已包含在 input 内，不能再次相加；未报告用量保持未知。
整体列已知总量和未知次数；相对成本只在双方用量完整的配对上计算，报告配对数量与区间。
1.3 倍是成本目标，不是统计显著性标准。一致率区间不能排除无收益时不宣称验证成功。
无论一致率是否改善，都不能替代讲解事实、引用适用性与专家盲评。

## 运行和恢复

```powershell
npm run build
npm run mortal-ablation -- prepare --out DIR --database CORPUS.sqlite --previous OLD_SCENE_DIR --prior-context OLD_CONTEXT_DIR
npm run mortal-ablation -- freeze --out DIR
npm run mortal-ablation -- label --out DIR --database CORPUS.sqlite
npm run mortal-ablation -- run --out DIR --split pilot
npm run mortal-ablation -- run --out DIR --split evaluation
npm run mortal-ablation -- report --out DIR
```

异常退出后先 `recover --out DIR`，它确认原进程不在、保留已开始但未完成的尝试为 interrupted，
然后再 run；不重复已开始的付费请求。冻结输入或执行代码变动时拒绝续跑，必须开新目录。
报告代码独立留 hash；更正统计/展示不会修改已冻结模型输入、标签或生成结果。
本轮档案：`E:\AgentData\Coach\mortal-rag-ablation-20261023`。

## Change Control Report

- 所有者：Arena 已有 desktop 模型执行/工具装配/评分边界；脚本只协调独立离线研究。
- 复用：contracts 严格 DTO、reasoning 模式/事实引擎、mortal-runtime 固定运行时、Arena
  原/增强检索组件、完整候选绑定、评分器、图形牌局及知识阅读器。
- 无新生产领域模型、包、通用实验框架、分类器、向量库或 Graph RAG；不改生产默认行为。
- 可执行约束：六组初始请求公平性、私有标签/实际选择/隐藏手牌/未来事件隔离、挑战选样
  不读分数、全分母与未知成本、精确配对统计、原生候选对应；扩展现有测试，未放宽边界。
- 验证：构建、类型检查、架构检查、受影响 Arena/模式/事实/检索回归；最终实测数据和
  试跑失败见独立档案，不把单元测试通过或 Mortal 一致率当作专家质量验收。
- 旧版本保留在 `codex/arena-context-rag` 及原数据目录，本轮位于 `codex/mortal-rag-ablation`。
  未合并、部署或启用生产。
