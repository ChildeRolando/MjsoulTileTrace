# 定向局面生成与模式边界研究

本地批处理入口：配置条件 → 合法构造 → 固定 Mortal 标注 → SVM 边界 → 合法补样 → 离线牌面报告。
研究产物独立存储，不写入生产复盘会话。Mortal 偏好是研究标签，不是模型内部思考的证明。

## 牌效率与保宝配对实验（v2）

```powershell
npm run question-lab -- validate packages/question-lab/examples/efficiency-dora-pairs.yaml
npm run question-lab -- run packages/question-lab/examples/efficiency-dora-pairs.yaml --out reports/efficiency-dora-study
npm run question-lab -- resume packages/question-lab/examples/efficiency-dora-pairs.yaml --out reports/efficiency-dora-study
```

这是独立的 `question-lab-pairs-config/v2` 实验。既有 v1 配置、主张集合不同的冲突定义及 SVM
档案保持原义。v2 只接受普通弃牌事实完整、效率主张 E 与保宝主张 D **没有交集**的局面；
E 按向听小、有效牌多依次选优，D 按保留宝牌多、向听小、有效牌多依次选优，保留最终全部并列。
归档每个 E×D 配对，不按模型分数挑代表。完整 Mortal 合法动作集合继续包括立直、杠和和牌。

标准模板固定种子 20261020，初始目标 500 同向听与 500 跨向听；巡目 3–10，东一／东四／南一／南四，
座位等权，起始点数各 25000、本场供托零、无副露立直。80% 提议从效率弃牌反选指示牌，20% 随机提议，
均重新分配实体牌与原生重放。两个工作单元共享 40000 次构造、60 分钟预算，末 5 分钟预留评估与报告。
这不是合法局面的均匀采样，配额不足、不可达目标、预算不足均如实保存。

模板的 `developmentArchives` 指向本机旧研究档案；移到新机器时删除该项即可只研究新样本。
旧目录只读，引用绑定档案、样本、见证哈希；新实验重新原生验证并用锁定的 Mortal 重标。
看过的旧来源组全部排除于新独立测试来源；新初始来源约 20% 在首次标注前冻结。

标签为原始 Q 差 `Q(E弃牌)−Q(D弃牌)`，正值支持效率侧。四项差值为有效牌 E−D、向听 D−E、
保宝 D−E、启发式估值 D−E；同时保留两侧绝对事实、估值缺失／双零标记、牌种独热、赤牌、摸切和现物。
同向听要求有效牌差为正；跨向听不能把有效牌差单独解释成效率优势。双方估值为零表示 helper 无区分度。
局面集合最高分差、完整最优集合和第三选择另外归档，配对胜负不等于最终选择。

学习为统一的标准化线性／RBF SVR：训练内三折分组验证，C∈{0.1,1,10}、epsilon∈{0.01,0.05}、
RBF gamma=scale，来源组加权 MAE 选参，线性距最优不超过 0.01 Q 时优先线性。
每组权重相同，组内局面与配对均分；超过 6000 训练配对时确定性按组与局面分配，共用消融抽样。
比较全局、全局＋四差值、完整配对三个版本；不按测试集挑版本。训练配对不足 10 或来源组不足 5 时不拟合。
报告分层展示双侧来源不足 10 组的证据限制。敏感区为 |y|≤0.01 Q，精确零另报，均不是概率或显著性。

`scan` 先封存最多 24 个训练反例锚点及见证身份，再从同一物理构造交换库存或补齐历史，
每锚点最多 48 个目标：可见余枚 12、宝牌 8、点数 8、时间 8、邻点／联合 12。
无法保持声明条件的变体失败，不重抽近似局面替代。粗扫描完整落盘后才冻结细化计划。
配对按弃牌牌种、赤牌、摸切身份对应并复核主张归属；固定配对变号与最终侧翻转分开统计。
最终侧翻转要求两端侧外优势均大于 0.05 Q；竞争消失、第三选择与敏感翻转单列。

扫描后最多三轮补样，每轮 100 个预测 |Q差|≤`learning.boundaryGap`（默认 0.05）的合法局面与 100 个原分布探索；
每轮封存输入和模型快照，缺模型时仅探索。最后冻结主研究，追加每锚点最多四种威胁历史，
再一次性评估独立集。威胁变体不回流调参；结果只是声明分布中的模型偏好，合法扫描不能证明内部原因。

v2 的 `fit` 只做训练内选择；`run`／`resume` 串联全部阶段及最终测试。`generate`、`label`、`scan`、
`refine` 可分段运行，`report` 重建自包含 HTML。已冻结的主研究不能继续生成／扫描／补样。
HTML 沿用 Coach/Arena 共享牌面，可直接离线打开；重建 v2 报告需本机受管资源以校验生产者身份。
归档另含 `pairs/`、`pair-labels/`、完整构造缓存、`sources/`、`scan-plans/`、`scan-results/`、
`scan-flips.json`、`acquisition/`、`pair-weights*.json`、训练／最终拟合及 `research-frozen.json`。
配对权重记录为均值 1，与 Python 拟合一致；全部成功样本、完整数据评估与失败目标保留。
代码、模型、事实引擎、配置或源档案身份变化必须使用新目录，不能在旧研究中替换生产者。

设计、边界和本次执行证据见 [配对研究变更记录](../../docs/plans/2026-10-16-efficiency-dora-pairs.md)。

## 快速使用

从 `coach/` 执行：

```powershell
npm install
npm run build
node scripts/build-libriichi-rule-native.mjs
npm run question-lab -- setup
npm run question-lab -- validate packages/question-lab/examples/smoke.yaml
npm run question-lab -- run packages/question-lab/examples/smoke.yaml --out reports/my-experiment
```

需要本机已准备的固定 Mortal 权重与 helper 二进制。native 构建复用已有源码与 Cargo 缓存，
不下载模型或改写旧回执。工具自动寻找与本次补丁哈希一致的新 native 回执；也可以设置
`RIICHI_LIBRIICHI_NATIVE_RECEIPT`。`RIICHI_LOCAL_MORTAL_ROOT` 可指定已有 Mortal 资产目录。
`setup` 只向独立学习虚拟环境安装锁定依赖，不修改 Mortal 或系统 Python。
自定义环境分别用 `RIICHI_QUESTION_LAB_BASE_PYTHON`、`RIICHI_QUESTION_LAB_PYTHON`。

`run` 跑完整流程，`resume` 在相同配置与生产者身份下接着运行；已保存标签不会重复推理。
`generate`、`label` 可以分段运行。`fit` 执行最终测试集评估；`refine` 执行受限补样再评估。
最终测试集揭示后不能继续补样；新研究应使用新目录与种子，避免反复观察测试结果调参。
`report` 从档案离线重建 HTML，不启动 Mortal。所有命令都接受 `--out`。

示例：`efficiency-value.yaml` 为百题及三轮补样；`conflict.yaml` 要求有效牌与宝牌主张不同；
`contrast-dora.yaml` 保持手牌与牌河等背景，改变宝牌；`open-threat.yaml` 包含立直与碰牌背景。
`forced-riichi.yaml` 验证本人立直后的扣点、供托联动与唯一行动的真实 Q。

## 配置语义

每个场景输入使用 `{fixed: 值}`、`{oneOf: [值…], weights: [权重…]}`，数值还支持
`{range: [下限, 上限], step: 步长}`，默认步长 1。列表和对象作为一个值整体固定或采样，
因此可以形式化配置手牌、牌河顺序、四家副露与事件组合。未知字段、谓词和操作数形状直接拒绝。

| 字段 | 语义 |
|---|---|
| `selfActor` / `round` | 本人绝对座位 0–3；局次 0–7（东一至南四），庄家由局次确定，自风派生 |
| `scores` / `honba` / `riichiSticks` | 本局开始时点数、本场、供托；点数与供托总计守恒 100000 |
| `turn` | 停在本人第 N 次自摸后；鸣牌额外弃牌不算一次摸牌。报告另展示当时牌河推导的巡目 |
| `hand` / `draw` | 目标决策时的暗手（不含当前摸牌）与摸牌；副露后暗手张数相应减少 |
| `doraIndicators` | 目标时点已公开的宝牌指示牌，按公开顺序配置 |
| `remainingDraws` | 目标时点剩余摸牌数约束，不直接改写计数 |
| `players` | 按 `actor` 指定起手 `initialHand`、目标暗手 `concealed`、有序 `river`、有序 `melds`、`riichi` |
| `melds` | `{kind, tiles, target?}`；吃碰杠的 `tiles[0]` 是被叫牌，加杠的第四项是加杠牌；暗杠没有 target |
| `history` | `{after:{type,actor?,occurrence}, action:{type,actor,pai?,target?,consumed?,tsumogiri?}}` 的原生动作脚本 |
| `wall` / `rinshan` / `uraIndicators` | 按消耗顺序的 70／4／5 张构造提示；数组内 `null` 留给库存分配 |

牌用 MJAI 字符串配置，例如 `1m`、`5pr`、`E`、`P`。报告用牌面图片展示。
他家目标暗手与牌山仅进入私有构造见证；不会进入题面、模型请求或学习特征。
`players.concealed` 对本人同样不含当前摸牌。默认使用固定标准四人半庄规则、一种赤五各一枚。

无约束时 `random` 模式按实体牌洗牌提议暗手；其他模式默认从三组顺子、一个搭子和一对出发，
再随机替换 0–5 张牌，覆盖多种向听。两者都是明确的提议分布，不是所有合法局面的均匀分布。
指定暗手、起手或历史优先于提议模板。对手默认从原生合法集合选择摸切，鸣牌后无摸牌的弃牌
由记录种子的合法选取完成。实战自然度没有做频率校准，不能用该数据估算真实对局出现率。

副露／立直目标会编译为持牌预留与动作脚本；复杂组合可提供明确起手、牌山和历史提示。
搜索只在给定预算内尝试；稀有的、互相影响的完整历史可能命中率很低。所有条件均在重放后复核，
不能放宽条件凑足题数。`budget_exhausted` 不等于已证明无解；库存／点数的直接矛盾单独计数。

## 谓词与模式

全局谓词用 `all`／`any`／`not` 组合 `{field, op, value}`；比较支持 `eq/ne/lt/lte/gt/gte/in`。
全局字段来自 `LAB_FEATURES`（contracts）：向听与有效牌的候选极值、宝牌、巡目、局况、点差、
威胁、合法动作数、可见形状计数及显式的估值可用性。`candidate.*` 仅能用于主张内的 `within`。

每个假设包含 `id/name`、可选 `when`、`recommend:{metric,direction,within?,tieBreak?}`、重点解释维度
`explain`。主张从完整规则集合中的可分析弃牌选择最小／最大指标；多个同优行动全部保留。
`tieBreak` 为向听时取小，其余指标取大。未知指标不会作为可用证据参与主张。
helper 打点仍为版本化启发式；牌形实例计数仅描述可见牌，不声称是不重叠的最优分解。
原始 helper 输出不改写，并保存独立证据哈希。研究用启发式数值采用 12 位有效数字（版本化指标），
消除上游无序浮点累加产生的末位差异；题目身份绑定局面、规则和研究特征，不把无关估计末位作为新题。

`conflict` 通过 `requireHypotheses` 要求多个假设适用且主张集合不同，不按 Mortal 结果预筛。
`contrast` 指定 `variantsPerGroup`、`vary` 与 `hold`；变体继承基础构造，优先从不可见库存交换实体牌。
`strategy: scan` 按各变量既有的有限选择／数值范围组成网格，逐项扫描；默认 `sample` 按声明分布采样。
扫描要求 `vary` 指向有限 selector；四家对象与任意脚本组合可用原有整体值选择与采样配置。
档案保存实际变化，包括必要的牌山调整；显式要求固定的组分变化时，该提议被拒绝。
条件过滤和去重可能使某些对照组不完整，报告与档案只展示实际生成的样本，不补造配对。

## 学习与证据

学习只读白名单可见事实。单模式做是否获支持分类，两模式做 A／B／共同支持／均未支持分类。
并列最优保留完整集合；`sensitiveGap` 只标记小分差，默认 0.01 个原始 Q 单位，不代表校准阈值。
SVM 的距离不是概率。非弃牌最优被记录为其他选择，不裁剪完整动作集合。
研究使用显式 `score_research_actions` 操作：唯一合法行动也调用 Mortal 并保存 Q；没有第二行动时
不标记为分差敏感。生产复盘原有 `score_actions` 仍要求至少两个行动，继续使用其单行动规则证明。

基础组、同源变体、实际暗手的花色置换与镜像归并后，约 20% 整组一次性留出。
训练内三折分组交叉验证选择线性／RBF 与 C∈{0.1,1,10}，分数差 0.01 以内优先线性。
小类别默认至少 10 题、训练至少 10 个来源组，否则明确证据不足。
解释树只拟合训练集上的小模型输出，最终独立集用于报告拟合表现与解释忠实度。

补样默认三轮，每轮一半筛选在 SVM 边界附近的合法新局面，一半按原分布探索。
每轮开始前将选题模型及输入身份固定到 `refinement-acquisition/round-N.json`；
中断恢复读取同一模型，不用已补入的当前轮样本重新训练。没有可用模型时明确退回探索采样，不声称已经找到边界。新样本不得来自已留出的牌形来源。
总时限和搜索次数贯穿本次研究及恢复，模型进程常驻，默认两个隔离工作单元。

档案包含 `manifest.json`、逐题 `samples/`、独立 `labels/`、私有 `witnesses/`、逐次 `attempts/`、
固定 `split.json`、SVM 参数与边界牌例、阶段计时、失败统计和自包含 `report.html`。
输出目录只允许单写者；过期写锁回收也串行执行，成功记录原子替换。
若进程恰在回收锁期间崩溃，残留 `.writer-recovery` 会拒绝继续写入；确认其中 PID 已退出、
没有其他回收进程后才能人工移除该回收标记，不能删除仍存活进程的写锁。配置、代码、引擎或模型身份变化时不能复用原目录；单独 `fit` 也核对当前学习代码身份。
未生成题目或标注不完整时不允许拟合，不冻结空测试集。
HTML 牌面嵌入 Coach / Arena 共享的 37 张 SVG 原始素材，包含赤五与原版一索鸟；每种素材只嵌入一次，
许可随报告保留，报告仍可离线查看。
`pipeline-summary.json` 的 activeWallMs 从受管资源准备完毕后的批次开始计时，包含档案重验与报告；
各 WorkMs 是累计工作量，两个工作单元并发时不能相加当作实际总时长。报告单独保存生成耗时。
同一进程可复用已验证题目，缓存最多容纳 256 MiB 原始文件内容对应的结果；每次读取仍核验
整个文件内容哈希，外部修改必须重验，消费者只得到副本。缓存不跨档案或生产者身份。
`node scripts/question-lab-readback-benchmark.mjs <已有档案目录>` 在相同代码、语料和进程内比较
完整重验与内容绑定复用，两者均先暖文件缓存，并要求返回样本的完整语义哈希一致。

## 验证

```powershell
npm run test:question-lab -- --maxWorkers=1 --no-file-parallelism
$env:COACH_QUESTION_LAB_NATIVE='1'
npm run test:question-lab -- --maxWorkers=1 --no-file-parallelism
& "$env:LOCALAPPDATA\RiichiCoach\question-lab\learning-python\Scripts\python.exe" packages/question-lab/python/test_learn.py
```

真实 native 测试包含吃碰三类杠、立直、指定副露后的暗手、全候选真实 Mortal 评分、隐藏信息不变性，
以及中断恢复不重复推理。Python 测试使用已知边界验证拟合、解释和留出标签隔离。
本次真实批次、失败保留与限制见 [本地验收](../../docs/plans/2026-10-16-question-lab-verification.md)。
