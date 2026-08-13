# 系统架构

## 总览

```text
雀魂官方登录 / 牌谱
        │
        ▼
mahjong-soul-source ──► CanonicalEventStreamV2
        │                         │
        │                         ▼
        │                decision snapshots / KnownGameFacts
        │                         │
        └─────────────────────────┼──────────────┐
                                  ▼              ▼
                           reasoning pipeline   model adapter
                                  │              │
                                  └──── candidates + scores
                                             │
                                             ▼
                              structured comparison / ledgers
                                             │
                                             ▼
                                validated analysis package
                                             │
                                             ▼
                                  desktop renderer / LLM
```

系统刻意把“数据来源”“麻将事实”“模型选择”“教练偏好”和“自然语言表达”分开。后层可以引用前层，但不能倒写前层事实。

## Workspace 边界

### `@riichi-coach/contracts`

所有跨模块数据结构的信任边界。主要包括：

- 牌、动作、决策窗口和候选；
- canonical 事件流、轮局状态和决策快照；
- 已知事实、牌形、振听、防守矩阵和因素账本；
- 模型评价、比较、偏好和严格分析包；
- renderer-safe 雀魂会话与目录 DTO。

规则：跨包数据进入下一层前必须经过这里的严格 schema；未知字段默认拒绝。

### `@riichi-coach/mahjong-soul-source`

雀魂国区 privileged source adapter。拥有协议、网络、令牌和原始牌谱边界：

- 固定协议 bundle、RPC map 与国区 endpoint policy；
- Liqi codec、网关发现、Lobby 会话；
- 登录结果投影、加密会话恢复、目录同步；
- 牌谱取回、SHA-256/大小验证、`GameDetailRecords` 解码；
- 雀魂动作到 `CanonicalEventStreamV2` 的映射。

它可以读取秘密和原始响应，但不得把这些对象直接交给 renderer。

### `@riichi-coach/reasoning`

来源无关的麻将推理层：

- 重放 canonical stream，冻结决策快照并投影 `KnownGameFacts`；
- 归一化用户、MJAI、模型和实战动作；
- 调用固定版本 fact-engine sidecar；
- 生成五轴账本、防守矩阵、差异和确定性偏好；
- 构建并验证严格分析包；
- 渲染当前 fixture-only 命令行报告。

它不应知道账号令牌、雀魂下载 URL 或浏览器会话。

### `@riichi-coach/desktop`

Electron 组合根与本地产品边界：

- 隔离官方登录窗口和 OS-backed 加密存储；
- 生产 Lobby、目录、牌谱摄取的依赖接线；
- 安全 IPC/preload、窗口权限和本地 renderer；
- 当前在主进程内缓存 mapped/replayed record。

renderer 只能收到安全会话状态、可分析目录摘要和固定操作结果。

### `coach/tools/mahjong-facts`

固定版本 Go JSONL sidecar。它把 mahjong-helper 的计算投影为结构化事实，不输出教练推荐。应用验证二进制清单、请求身份和响应语义。

## 数据流

### 登录与恢复

1. Electron 打开隔离的雀魂国区官方页面。
2. 只捕获恢复所需的受限登录结果和上下文。
3. OS 安全后端包裹密钥；会话以 account-bound envelope 跨重启保存。
4. 重启时使用全新 Lobby 执行 OAuth2 恢复并再次核对账号。
5. 注销会先停止目录同步，再清浏览器状态、目录和凭据。

### 目录与牌谱

1. 目录服务按时间窗完整分页，权威选择最近 30 场。
2. 只保留已证明为支持规则的四人南风条目。
3. 用户点击条目后，摄取服务确认 recordId 属于当前账号目录。
4. 新 Lobby 恢复身份后取回 inline 或 allowlisted `data_url` 数据。
5. 取回层验证大小、哈希、容器和非空动作；原始字节不跨 renderer 边界。

### Canonical 重放

1. mapper 将支持的雀魂动作显式转换为 canonical 事件。
2. 未知动作、非法牌、缺失引用或最终 schema 失败均 fail closed。
3. replayer 在本人可见摸牌处冻结 `DecisionSnapshotV2`。
4. 每个快照投影 `KnownGameFacts`，并记录之后的实际舍牌。
5. 目前此处停止：没有生产模型候选时不能构造合法的自动比较。

### 比较与解释

1. 候选必须先归一化为 canonical action 与稳定 `actionRef`。
2. 模型评价只表示模型选择；事实管线独立计算麻将因素。
3. 每候选生成同构五轴账本，再生成 pairwise differences。
4. 只有 registered deterministic difference 可进入确定性偏好。
5. LLM 未来只能表达经过验证的分析包，不能增加事实或改写偏好。

## 核心设计决策

### Fail closed

输入不完整、协议漂移、证据不一致或能力未实现时，系统返回固定 blocked/unsupported 状态。它不猜字段、不降级到宽松解析，也不让上游 prose 穿透。

### Canonical event stream 是新重放工作的唯一真相

来源适配器只能映射事件，不能顺便计算教练因素。fixture-only legacy bridge 仅用于回归，不是生产 fallback。

### 确定性与启发式分离

现物等可证明事实可以进入确定性比较；筋、壁、one-chance 和 helper 风险刻度保留为版本化启发式，不得升级为确定性结论或精确概率。

### 模型和教练分离

Mortal/Akagi 的分数决定“模型偏好”；教练偏好由可审计因素和教学规则决定。删除模型评分不能改变事实账本。

### Privileged / renderer 分离

账号 ID、令牌、协议 payload、下载 URL 和牌谱字节只能存在于主进程或 source 包。IPC 使用窄方法和固定安全结果。

## 当前已知架构缺口

- canonical mapper 的部分杠/流局/荣和语义尚需真实牌谱反证；
- mapped/replayed record 当前仅存主进程内存，没有任务持久化；
- 生产 Mortal/Akagi 候选尚未接到真实 replay decisions；
- LLM、SQLite 会话、报告工作台与跨平台发布尚未实现。
