# 雀魂国区账号同步与完整牌谱重放设计规格

日期：2026-08-11
状态：已确认，待书面复核

本规格取代既有文档中“匿名获取雀魂分享 URL”“不保存雀魂账户状态”的前提。
它只定义 M5 的生产牌谱来源、账号会话、本地目录、完整记录解码与 canonical
映射；Mortal/Akagi 推理、LLM 教练和最终工作台仍遵守各自既有规格。

## 1. 目标

交付一个跨平台 Electron 桌面入口，让用户在产品内通过雀魂国区官方页面登录，
由本机应用安全持有会话令牌，自动同步账号最近 30 场牌谱，只向界面暴露当前
确实可分析的四人南风牌谱。用户选择一场后，应用按需取得完整记录，将其转换成
现有 `CanonicalEventStreamV2`，再交给已经完成的局面验证、事实账本和教练管线。

本切片解决的是“真实牌谱如何可靠进入系统”，不是重写麻将分析引擎。

## 2. 已有能力与新增能力

### 2.1 直接复用

- `CanonicalEventStreamV2`、事件身份、校验器、round reducer 和 decision snapshot；
- 完整结构化动作、候选归一化和决策窗口；
- 手牌结构、等待、振听、五轴账本与逐威胁防守矩阵；
- Mortal/Akagi typed adapter 边界和模型评分删除不变性；
- 打包的本地事实 sidecar。

### 2.2 本规格新增

- Electron 跨平台应用壳及隔离登录窗口；
- 雀魂国区登录协议适配器；
- 跨重启的本机会话保险库；
- 最近 30 场牌谱目录、增量同步和可分析性过滤；
- 牌谱 UUID 与国区分享 URL 的严格解析和生成；
- 完整牌谱按需获取与可信下载；
- 版本固定的 protobuf 解码器；
- 雀魂源记录到 canonical 事件流的生产 mapper；
- 加密原始记录与 canonical 产物的本地保存；
- H1 真实账号人工验收。

### 2.3 不得冒充新增能力

现有 `riichi-coach` CLI 只消费 `source + 截断 mjaiLog + decisions` 回归夹具。
它不是账号同步、分享 URL 下载、完整 MJAI 导入或完整雀魂记录 mapper，不得作为
M5 的运行时 fallback。

## 3. 首版范围

### 3.1 支持

- 雀魂国区 `game.maj-soul.com/1`；
- 官方登录页面内完成登录；
- 本机应用持有并跨重启保存登录令牌；
- 自动同步最近 30 场牌谱元数据；
- 四人南风、当前适配器明确支持的标准规则；
- 只显示通过可分析性过滤的条目；
- 选择条目后按需获取完整牌谱；
- 已登录状态下解析用户粘贴的国区分享 URL，并走相同校验和下载流程；
- Windows x64、macOS x64/arm64、Linux x64 的同一 Electron 架构；
- 已分析牌谱和报告跨退出账号、跨应用重启保留。

### 3.2 首版不支持

- 雀魂国际服、日服或其他区域；
- 三人麻将、东风局和特殊赛事规则；
- 云端账号代理、远程 token broker 或任何第三方代持令牌；
- 自制用户名、密码、验证码输入框；
- 浏览器扩展、远程调试用户日常浏览器或手工复制 token；
- 未登录状态下承诺匿名下载完整牌谱；
- 对未知 protobuf 版本、未知事件或未知规则做猜测式兼容；
- 把对手当时不可见的暗牌泄漏给分析管线；
- 云同步牌谱、账号或报告。

## 4. 采用 Electron 的理由与边界

系统浏览器自动回调适用于服务方提供正式 OAuth/OIDC authorization-code 流程的
场景。雀魂当前公开网页客户端使用内部登录 RPC，没有面向本产品的第三方 OAuth
client、redirect URI 和授权码交换协议。系统浏览器的 Cookie、IndexedDB、WASM
状态和 WebSocket 帧也与本地应用隔离；若强行读取，只能依赖扩展、远程调试或
手工复制 token。

Electron 允许应用控制一个只用于雀魂登录的浏览器上下文，并在本机主进程的
版本化协议适配器中观察登录成功响应。首版使用仅绑定该登录窗口的 Chrome
DevTools Protocol `Network` 事件读取 allowlist WebSocket 登录响应；不得开启远程
调试端口，也不得连接用户日常浏览器。官方页面仍独占密码、验证码和人机验证；
应用只提取成功响应中的账号身份和会话凭据。

登录实现必须抽象为 `LoginProvider`。若雀魂未来提供正式 OAuth，替换 provider
即可，目录同步、牌谱获取和分析接口不变。

## 5. 进程与权限架构

### 5.1 Electron 主进程

主进程是唯一允许接触下列数据的进程：

- 雀魂会话令牌；
- 登录窗口的专用 session；
- 雀魂 RPC 连接；
- 未解密的本地保险库文件和解密密钥；
- 完整原始牌谱。

主进程负责登录、会话验证、同步、下载、解密、protobuf 解码和 mapper 调度。

### 5.2 登录窗口

- 使用独立持久化 partition，不复用产品主窗口 session；
- 只允许国区官方 HTTPS 页面和版本清单中列出的官方静态/RPC 主机；
- 禁止任意新窗口、外部导航、文件下载、权限请求和非白名单 scheme；
- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`；
- 不注入读取用户名、密码、验证码或键盘输入的脚本；
- 登录完成并保存凭据后立即移除协议观察器并销毁窗口。

登录协议适配器只接受白名单 RPC 的已关联成功响应，验证协议版本、响应种类、
账号 ID 和凭据形状。未知帧、重复响应、无法关联的响应或版本漂移全部失败关闭。

### 5.3 Preload 与渲染进程

渲染进程只获得窄化的 typed API：

- `getSessionStatus()`；
- `openMahjongSoulLogin()`；
- `logoutMahjongSoul()`；
- `syncAnalyzableRecords()`；
- `listAnalyzableRecords()`；
- `startRecordAnalysis(recordId)`。

IPC 结果不得包含 token、Cookie、授权头、原始 RPC 帧或完整原始牌谱。渲染进程
只接收状态、无秘密目录 DTO、任务进度和已经验证的报告数据。

## 6. 登录协议与会话生命周期

### 6.1 登录结果

会话保存的最小内容为：

- region：固定 `cn`；
- account ID；
- 登录方法（`login` 或 `oauth2Login`）与该方法的认证类型：从已关联登录请求中
  只提取的非秘密判别量，不得为取得它们而保留完整登录请求；
- opaque session token；
- 协议适配器版本；
- 首次取得时间和最近验证时间；
- 当前国区客户端版本；
- 非秘密的账号显示摘要。

不保存密码、验证码答案、登录表单内容或完整网络流量。

两种登录方法取得的 token 不默认等价。M5-B 必须按持久化的登录方法选择对应的
恢复适配器，并分别用协议证据证明恢复路径；若某种 token 无法安全恢复，则该方法
只能用于当前进程，会话跨重启状态必须明确降级为重新登录，不能猜测改走
`oauth2Login`。

### 6.2 启动恢复

应用重启后：

1. 解锁本机会话保险库；
2. 读取令牌但不发送给渲染进程；
3. 调用轻量账号身份接口验证会话；
4. 成功则进入已登录状态并开始增量同步；
5. 明确失效时只做一次受控恢复；
6. 恢复仍失败则删除会话并要求重新登录。

网络暂时不可用不能删除仍可能有效的令牌，只进入 `offline_unverified` 状态。

### 6.3 退出账号

退出时原子完成：

- 清除加密 token 与账号会话元数据；
- 清除登录窗口 partition 的 Cookie、缓存和本地存储；
- 断开仍存活的雀魂 RPC；
- 删除未分析的近期目录缓存；
- 保留已完成的本地分析资产和教练报告。

## 7. 本地加密保险库

### 7.1 两把独立数据密钥

应用使用两个随机 256 位数据密钥：

- session key：加密 token、登录元数据和近期未分析目录；
- analysis key：加密已分析牌谱的原始记录、canonical 流和报告资产。

数据采用 AES-256-GCM，每个对象使用随机 nonce 并验证认证标签。数据密钥由操作
系统安全存储包装后保存在应用私有目录；令牌本身不直接写入系统凭据条目。

Electron `safeStorage` 只有在确认使用真实系统安全后端时才可用。Linux 若回退到
`basic_text` 或系统安全存储不可用，应用不得明文降级，必须提示无法安全保存会话。

### 7.2 本机持有

令牌只存在于用户本机应用和雀魂国区官方服务之间。不得发送给 LLM、Mortal、
Akagi、遥测、崩溃收集、远程日志或任何独立代理服务。

### 7.3 删除语义

- 退出账号销毁 session key 包装和全部 session 数据；
- 删除一份报告会删除该牌谱的原始记录、canonical 流、模型结果、讲解和对话；
- “删除全部本地分析”销毁 analysis key 包装，使遗留密文不可恢复；
- 所有写入采用临时文件、同步落盘和原子替换，避免半写保险库。

## 8. 近期牌谱目录

### 8.1 同步策略

- 首次登录拉取最近 30 场元数据；
- 后续按稳定牌谱 UUID 去重并增量更新；
- 应用启动、用户主动刷新和完成一场新牌局后可触发同步；
- 同一账号同一 UUID 不重复创建条目或下载完整记录；
- 分页或服务端顺序变化不得改变本地身份。

### 8.2 可分析性过滤

目录进入渲染进程前必须满足：

- 四名玩家；
- 南风局；
- 规则组合在当前 allowlist；
- 牌谱记录版本在当前 decoder 支持范围；
- 本人账号可以唯一映射到一个座位；
- UUID 和分享 URL 可以严格往返；
- 没有已知损坏、撤回或权限错误。

不满足的条目完全不出现在产品列表中。因为过滤发生在最近 30 场内，列表可以少于
30 项。完整记录下载后若发现元数据未能暴露的不兼容，条目从可分析列表移除，并
显示应用自有的“牌谱暂时无法解析”通知。

### 8.3 渲染 DTO

`AnalyzableRecordSummary` 只包含：

- stable record ID；
- 国区分享 URL；
- 对局时间；
- 四名玩家的显示名、最终点数和顺位；
- 本人座位；
- 规则摘要；
- 本地分析状态；
- 最后同步时间。

DTO 不包含账号 ID 原值、token、原始 RPC、下载地址或未验证服务端文本。

## 9. 完整记录获取

用户选择分析后，主进程才请求完整记录。获取器必须：

- 使用当前已验证会话调用国区官方记录接口；
- 绑定请求 UUID、账号和预期服务器；
- 同时处理内联 `data` 与受信 `data_url` 两种结果；
- 对 URL 强制 HTTPS、主机 allowlist、禁止降级重定向；
- 限制响应大小、超时和重试次数；
- 计算并保存内容 SHA-256；
- 验证实际记录 UUID 与请求一致；
- 在进入 decoder 前把网络错误映射成固定项目错误码。

原始响应、服务端错误 prose 和授权数据不得进入教练上下文。

## 10. Protobuf 版本边界

仓库保存经审计的国区协议描述 bundle 及 manifest：

- 国区客户端版本；
- descriptor 内容哈希；
- 支持的记录容器版本；
- 允许的消息类型；
- 适配器版本；
- 来源与许可证记录；
- 生成器版本和可复现生成命令。

decoder 支持当前 `actions` 容器和 manifest 明确列出的旧 `records` 容器。支持不是
“字段存在就试一下”，而是每个容器版本拥有独立 typed adapter 和 golden fixture。

未知 action 名称、未知枚举、必要字段缺失、重复序号、无法解释的结算或 descriptor
不匹配，都返回 `unsupported_mahjong_soul_record_version` 或更精确的固定错误码，
不得跳过后继续分析。

## 11. 雀魂记录到 canonical 事件流

### 11.1 单一事实来源

生产 mapper 只做源格式翻译，输出 `CanonicalEventStreamV2`。它不得复制 round
reducer、牌数守恒、立直状态机、振听或防守计算。输出必须先通过现有 canonical
validator，再冻结任何决策。

事件 ID 使用：

```text
gameId / roundOrdinal / sourceRecordOrdinal / subEventOrdinal
```

`roundOrdinal` 按实际局发生顺序递增，连庄也递增；一个雀魂复合 action 拆成多个
canonical 事件时，`subEventOrdinal` 从 0 连续递增。

### 11.2 完整映射范围

必须映射并测试：

- 游戏开始与结束；
- 每局开始、初始点数、场风、局序、本场、供托、庄家和首张宝牌；
- 四家初始手牌的可见性，其中只暴露当时主视角可见的暗牌；
- 普通摸牌、岭上摸牌；
- 手切、摸切、立直弃牌；
- 立直宣言和成立；
- 吃、碰、大明杠、暗杠、加杠；
- 鸣牌后弃牌；
- 杠后宝牌指示牌；
- 自摸、荣和、多家荣和；
- 荒牌流局及协议中明确支持的途中流局；
- 点数变化、结算、局结束和整场结束。

首版过滤掉三麻，因此北拔等三麻专属事件不得被静默解释为普通动作。

### 11.3 主视角与可见性

主视角来自已验证登录账号 ID 与牌谱玩家列表的唯一匹配。若无匹配或多匹配，牌谱
不可分析。mapper 即使能看到服务端记录中的额外暗牌，也只能把当时合法可见数据
写入 snapshot；对手暗牌继续为 unknown。

完整度字段来自源记录和映射覆盖证明，不得因为下载到了完整文件就统一标记
`complete`。

### 11.4 决策冻结

为主视角的每个实际选择冻结：

- `self_turn`；
- `discard_response`；
- `kan_response`；
- `post_call_discard`。

每个窗口绑定触发事件、局面 prefix hash、实际动作和完整来源证据。实战动作必须是
当前窗口合法动作；若源记录缺少区分动作所需的字段，窗口 blocked，不能猜测。

M5 不生成模型候选或模型评分。M6 对同一冻结局面调用 Mortal/Akagi 后，才产生
`StructuredComparisonSet + ModelEvaluation` 并进入现有解释管线。

## 12. 分享 URL

分享 URL 不是信任根。解析器只接受国区 HTTPS 主机、固定路径和严格参数，提取
record UUID 与视角提示；实际主视角仍以登录账号和记录玩家表为准。

目录生成的 URL 必须经过同一个 parser round-trip，且不得嵌入 token、Cookie 或
本机会话标识。粘贴外部 URL 时仍需要已登录会话取得完整记录，并执行与近期目录
相同的规则、权限、版本和身份校验。

## 13. 状态机与错误处理

分析前置状态为：

```text
logged_out
→ authenticating
→ session_validating
→ catalog_syncing
→ catalog_ready
→ record_fetching
→ record_decoding
→ canonical_mapping
→ canonical_validating
→ ready_for_model_analysis
```

任一阶段失败只暴露项目拥有的稳定码：

- `mahjong_soul_login_protocol_unsupported`；
- `mahjong_soul_session_invalid`；
- `mahjong_soul_session_storage_unavailable`；
- `mahjong_soul_catalog_sync_failed`；
- `mahjong_soul_record_not_analyzable`；
- `mahjong_soul_record_fetch_failed`；
- `unsupported_mahjong_soul_record_version`；
- `mahjong_soul_record_identity_mismatch`；
- `mahjong_soul_canonical_mapping_failed`；
- `mahjong_soul_canonical_validation_failed`。

网络瞬断可以指数退避重试；认证失败、身份不匹配、协议不支持和 canonical 不变量
失败不得自动重试成另一种解释。日志只记录错误码、阶段、脱敏 record ID 和本地
correlation ID。

## 14. 本地资产保留

近期目录只保存加密元数据，不批量保存完整牌谱。用户选择分析后保存：

- 加密的原始 protobuf bytes；
- descriptor/adapter manifest identity；
- 原始内容 SHA-256；
- canonical event stream；
- decision snapshots；
- 后续模型输出、账本和教练报告。

保留原始记录是为了 mapper 审计、协议升级后重建和缺陷修复，不允许将其作为
LLM 输入。退出账号保留这些资产；删除报告将整组删除。

## 15. 测试策略

### 15.1 无真实凭据的自动测试

- 登录窗口 host/scheme/navigation/permission allowlist；
- 版本化登录成功帧、错误帧、重复帧和恶意 prose；
- 保险库加密、认证失败、原子写、重启恢复和安全后端不可用；
- logout 清除 session 层但保留 analysis 层；
- 最近 30 场分页、去重、增量同步和顺序变化；
- 三麻、东风、特殊规则、未知版本完全不进入渲染目录；
- 分享 URL 解析/生成 round-trip 和恶意 URL；
- `data`/`data_url`、重定向、大小限制、UUID 错绑和内容 hash；
- 每个支持 protobuf 版本的真实脱敏 golden；
- 全事件 mapper 单测和复合事件 sub-ordinal；
- 牌数守恒、立直、杠后宝牌、多家荣和、流局与结算负例；
- 可见性属性测试，证明对手暗牌不进入 snapshot；
- 每个决策窗口的 actual action 绑定；
- mapper 输出通过现有 canonical validator/reducer；
- 删除或扰动源事件会改变对应 prefix hash，旧证据不得残留；
- token、Cookie、原始帧和服务端 prose 不出现在 IPC、日志、报告和测试快照。

自动测试不得提交真实账号 token、Cookie、用户名、牌谱私密标识或未脱敏原始响应。

### 15.2 打包与平台测试

- Electron 主进程、preload 和 renderer 的构建与 import surface；
- Windows x64、macOS x64/arm64、Linux x64 安装包 smoke；
- 各平台真实安全存储后端检测；
- 离线启动、token 恢复和升级迁移；
- 卸载/重装时明确的数据保留语义；
- CSP、sandbox、context isolation 和无 Node renderer 权限检查。

### 15.3 H1 人工验收

自动门禁通过后才需要用户介入一次：

1. 在 Electron 官方雀魂窗口登录国区账号；
2. 关闭并重开应用，确认会话恢复；
3. 核对近期列表只显示可分析四人南风牌谱；
4. 选择一份熟悉牌谱；
5. 对照雀魂回放核对本人座位、局序、手牌、牌河、副露、宝牌、点数和实际动作；
6. 核对至少一个自摸回合、一个响应窗口、一次立直或副露及最终结算；
7. 退出账号后确认近期缓存消失、已生成报告仍可打开。

H1 前不得要求用户提供 token、开发者工具截图或手工导出协议数据。

## 16. 完成判据

M5 只有在以下条件同时满足时才完成：

1. Electron 国区官方登录可用，密码与验证码不经过产品代码；
2. token 只由本机主进程持有，加密跨重启恢复且无明文降级；
3. 最近 30 场增量同步，只向 renderer 返回可分析条目；
4. 每个条目有稳定 UUID 和无凭据分享 URL；
5. 完整记录按需取得并通过版本、身份、大小和 hash 校验；
6. 支持范围内所有源事件完整映射到 `CanonicalEventStreamV2`；
7. 每个主视角决策窗口和实际动作可冻结、可重放、可审计；
8. 对手暗牌、token 和原始服务端 prose 不进入分析或报告；
9. 退出、删除、离线、会话失效和协议漂移行为符合本规格；
10. 自动门禁和 H1 真实账号验收均通过。

## 17. 后续扩展

国区稳定后才考虑：

- 国际服/日服 `LoginProvider` 与 endpoint manifest；
- 雀魂正式 OAuth（若未来提供）；
- 超过最近 30 场的分页历史；
- 云同步和移动端；
- 新规则、三麻或比赛模式。

这些扩展不得放宽首版的令牌隔离、协议固定、可见性和 canonical 验证边界。

## 18. 实施切片

本规格是 M5 的总设计，实施必须拆成可独立验收的切片，不能用一个巨大提交同时
引入登录、网络、解码和 mapper：

1. **M5-A 协议与契约地基**：国区 endpoint/版本 manifest、登录/目录/记录 DTO、
   固定错误码、脱敏协议夹具和 protobuf 生成链；不接触真实 token。
2. **M5-B Electron 会话与保险库**：应用壳、隔离登录窗口、模拟登录帧捕获、
   envelope encryption、重启恢复和 logout；用假官方端点完成自动测试。
3. **M5-C 近期目录与记录获取**：最近 30 场、过滤、URL、增量同步、按需下载、
   哈希与本地资产仓库；仍可用 fixture transport 验收。
4. **M5-D 完整记录 decoder 与 mapper**：所有支持事件到
   `CanonicalEventStreamV2`、可见性、决策窗口、actual action 和 golden 回放。
5. **M5-E 产品贯通与 H1**：使用 M5-A 固定的国区 endpoint manifest 做真实端点贯通、跨平台打包 smoke、
   登录→目录→下载→重放全链路，以及唯一需要用户实际登录的 H1。

每个切片都必须先有独立实施计划、严格 RED→GREEN、只读复审和完整回归；任何
前置切片的 fixture transport 不得在 M5-E 中成为静默生产 fallback。
