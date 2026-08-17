# 当前开发路线图

本页是当前路线图。旧的完整构想仍可在 [`2026-08-01-llm-riichi-coach-product-roadmap.md`](../plans/2026-08-01-llm-riichi-coach-product-roadmap.md) 查阅，但其状态数字和部分缺口已经过时。

## 产品目标

用户在本机应用登录雀魂国区账号，从近期可分析的四人南风标准规则牌谱中选择一场，获得可回放、可审计、可追问的整盘教练会话。模型只提供候选动作与选择分；麻将事实和教学结论必须来自可验证的本地管线。

## 里程碑状态

| 里程碑 | 状态 | 当前交付物 | 主要剩余工作 |
|---|---|---|---|
| 静态牌效率课程 | 完成 | 18 课、训练器、掌握度与本地计算器 | 独立维护，不阻塞桌面教练 |
| M0 严格契约与候选 | 完成 | canonical 动作、比较、事实边界、模型评价与偏好契约 | 新功能继续复用，不另建宽松旁路 |
| M1 五轴 FactorPipeline | 完成 | 同构账本、差异、确定性偏好、受管 Go sidecar | 补充新分析维度时保持证据等级 |
| M2 局面事实 | 部分完成 | canonical event v2、决策快照、牌形/等待/振听、逐威胁防守矩阵 | 精确符番、顺位 EV、选择权、行为启发式 |
| M3 教学证据 | 未开始 | 仅有策略边界和占位契约 | 冻结资料、引用、版本化教学规则 |
| M4 LLM 教练 | 未开始 | 严格分析包与解释验证地基 | LLM 客户端、编排、流式输出、追问 |
| M5 雀魂国区接入 | 接近完成 | Electron 登录、加密恢复、最近 30 场、取回、canonical mapper、重放、脱敏 replay audit、H1 诊断命令 | 真实牌谱 H1 对照验收；未覆盖流局/杠枚举的 fixture 反证 |
| M6 模型生产接入 | 进行中 | M6-A1：Mortal 单决策切片（安全获取、指纹/视角绑定、比较集 + ModelEvaluation + assembly）；M6-A2：全量自摸面覆盖账本（全局二部绑定、120/113 无丢失、99 个支持对 analysis_ready）；M6-A3：行动支持扩展已落地（declare_riichi 契约与 riichi_discard 实现语义、自摸/杠/九种九牌终局 actual、post_riichi/post_call 决策面、真实 hora 形态钉死、10 分支 fail-closed coverage gate + §16 evidence manifest lift 路径、双平台验收入口（雀魂首选 + Tenhou 补充，共享验收核心）、H2 连续性复跑 125/113 全绑定 0 歧义） | 真实独立证据验收（雀魂优先、Tenhou 补充 → 10 分支矩阵补满 → manifest lift，A3 收口）；`awaiting_mortal_verification` 状态；M6-A4 响应面；Mortal 产品化工作流；Akagi（M6-B） |
| M7 会话与工作台 | 未开始 | 安全 IPC 和最小目录 UI | SQLite 任务、报告页、回放、聊天、恢复/删除 |
| M8 打包发布 | 未开始 | Electron 与 sidecar 构建基础 | 跨平台安装、升级、日志、发布验收 |

## 当前关键路径

### 1. 完成 M5 人工验收

- 运行 `npm run desktop:diagnose-mahjong-soul-replay`，对照审计文件逐项核对雀魂回放（self seat、局数/庄家/本场、初始手牌、摸切、鸣牌、立直、和牌/流局）。
- 未覆盖的流局/杠枚举（`ActionLiuJu`、`ActionAnGangAddGang`）继续保持 fail closed；真实牌谱命中时先补脱敏 fixture + RED/GREEN，再放宽。
- 发现协议差异时先补 fixture 和映射测试，再改实现。

### 2. 收口 M6-A3 真实语料验收

- **验收来源政策已修正（2026-08-16 source-policy correction）**：验收不变量 = 真实 + 独立本地权威 + 全 E2E，**不是“仅天凤”**。获批独立本地来源 = 雀魂官方原始牌谱（**首选**，最终产品入口）与天凤权威原始牌谱（补充：discovery/稀有事件语料/第二验收来源）。同一原始对局的两侧数据只要各自独立获取与解析即合法；严禁用 Mortal 报告内嵌的 `mjai_log`/`split_logs`/任何从报告重建的数据充当本地侧。
- 工作流（按序）：
  1. **固化 H2 雀魂证据**：`scripts/majsoul-acceptance.mjs`（INNER record bytes + selfActor → 既有生产 mapper → 重放 → 共享验收核心 → 脱敏 artifact → manifest）。报告可用本地缓存的真实 raw body（经注入 fetch 走完整生产解析路径，零网络）或操作者提供的 result URL（真实抓取；提交仍由操作者浏览器过 Turnstile，脚本永不自动提交）。
  2. **扫描更多雀魂牌谱**补充分支覆盖（雀魂为产品主入口）。
  3. 仅对仍缺的分支用 Tenhou 语料补：`scripts/tenhou-acceptance.mjs`（断点续跑；mjai.ekyu.moe 无 API、Turnstile 门禁 → operator-assisted：操作者把**自己牌局**的可达天凤 log URL 放入 `<state-dir>/inbox/<fileKey>.url`，错误 URL↔pair 对在报告绑定校验处 fail-closed；钉死语料 dnovikoff mjloggm 内嵌无归档 log id，永远不能做验收提交）。
  4. 只有在某分支**确实无其他来源**时才要求用户提供天凤牌谱。
- 目标不变：10 个语义分支每个至少 1 个独立真实 E2E 接受命中（来自任一获批来源）；证据只进 §16 版本化 manifest（记录 `localSourceType: "mahjong_soul" | "tenhou"`），registry lift 只能由 manifest 派生。
- 语料缺口状态（2026-08-17 全量终局）：`dama_with_tsumo_candidate` 全 3000 局天凤语料扫描命中 **3**（555,403 窗口、引擎提升、0 失败；发现层零缺口关闭，验收待 operator 提交，见 handoff §14）；`self_turn_kyuushu` 已由 `8ffcebe9#3` 真实验收 lift（§13）。
- 矩阵补满前，未覆盖分支保持 `coverage_branch_uncovered` fail-closed，不得手工放宽。

### 3. M6-A4 响应面

- 覆盖 `discard_response`/`kan_response` 决策面（荣和、过、抢杠）。
- 沿用 A3 的真实形态钉死方法：先固定真实 Mortal 报告形态，再写适配与校验。

### 4. Mortal 产品化工作流

- 把全量复盘的固定报告接入 UI；UI 状态推进到“分析完成”。
- 输出结构化分析包，再渲染固定报告；不要先做聊天。

### 5. M6-B Akagi 备选来源

- 在 Mortal 管线稳定后评估 Akagi 作为第二模型来源，复用同一契约与绑定层。

### 6. 建立会话工作台

- 持久化任务状态、输入哈希、模型身份、分析包和解释版本。
- 增加牌桌回放、候选对比与证据面板。
- 最后加入受约束 LLM 对话和追问。

## 明确不应提前做的事

- 不把单个实际动作伪装成候选比较；比较契约要求至少两个候选。
- 不从模型分数推断模型“为什么”选择某动作。
- 不把 helper 风险刻度称为放铳概率。
- 不在 renderer 暴露令牌、账号 ID、牌谱下载 URL 或原始字节。
- 不在缺少生产模型候选时宣称真实牌谱教学分析已经完成。

## 完成定义

每个里程碑只有同时满足以下条件才可标为完成：

1. 生产入口已接线，而不只是 fixture/helper 存在；
2. 正向、失败和信任边界测试均存在；
3. 对应全量门禁通过；
4. 真实外部能力若无法自动证明，已完成明确的人类验收；
5. 本页、架构页和相关 handoff 与代码一致。
