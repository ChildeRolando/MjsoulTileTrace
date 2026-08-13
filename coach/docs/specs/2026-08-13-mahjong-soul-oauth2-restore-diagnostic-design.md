# 雀魂国区 OAuth2 Lobby 恢复诊断设计

日期：2026-08-13

## 1. 目的

验证账号密码首次登录返回的 `ResLogin.access_token`，能否在一个全新的国区 Lobby
WebSocket 上按官方客户端的自动登录序列重新建立已认证会话。

本切片只回答这个协议问题，不预先决定生产架构，也不把一次失败解释为必须常驻
隐藏页面。

## 2. 已知事实与待验证假设

已知事实：

- 官方密码登录请求设置 `gen_access_token = true`；
- 固定版本官方客户端存在 `oauth2Check` 与 `oauth2Login` 自动登录路径；
- 旧实验只验证了 `prepareLogin` 成功后目录 RPC 返回 `ERR_NOT_LOGIN`；
- `prepareLogin` 失败不能证明 `access_token` 不能用于 `oauth2Login`；
- 当前产品仍把真实目录同步入口隐藏，因此诊断失败不会影响用户数据。

待验证假设：密码登录返回的访问令牌可以通过
`oauth2Check → oauth2Login → fetchInfo → fetchGameRecordListV2` 在新连接上恢复 Lobby
身份。

## 3. 安全边界

- 密码、验证码、Cookie、LocalStorage、IndexedDB 和完整登录请求不得被读取或持久化；
- 只使用已关联成功响应中现有的 `SecretString` 访问令牌、账号 ID、显示名和认证类型；
- 网关发现 URL 与 WebSocket authority 必须来自已验证的国区 endpoint manifest；
- 服务端返回的 route 不得扩大 allowlist，不允许 `ws:`、任意域名、任意端口或重定向；
- 诊断 RPC 固定为 `oauth2Check`、`oauth2Login`、`fetchInfo`、
  `fetchGameRecordListV2`；调用方不能扩展；
- 日志和 UI 只允许固定阶段与固定项目错误码，不得包含令牌、原始请求、原始响应、
  URL、账号 ID、昵称或服务端 prose；
- 任一步失败立即关闭新 Lobby、codec 和 transport；不得尝试 `prepareLogin`、密码重放
  或另一种猜测性登录；
- 诊断成功前不写入“可独立恢复”能力、不开放目录同步按钮。
- 本次一次性诊断始终要求一次新的可见官方登录；既有 v1 保险库不含恢复上下文，
  不读取它并伪称可恢复，也不在结论未知时迁移保险库格式。

## 4. 数据流

1. 用户在隔离的官方 Electron 窗口完成一次正常登录；
2. 现有观察器产出 `CapturedMahjongSoulCredential`；
3. 诊断器通过固定国区发现端点取得候选 route，并严格映射到 manifest 中已有的
   `wss` origin；
4. 诊断器建立全新 Lobby 连接；
5. 发送 `oauth2Check {type, access_token}`，要求无错误且账号存在；
6. 发送与固定客户端版本匹配的 `oauth2Login`，要求无错误且 `account_id` 与捕获值
   相同；
7. 调用 `fetchInfo`，要求无错误，用于证明登录后的 Lobby 只读能力；账号身份只由
   `oauth2Login.account_id` 与捕获账号的精确比较绑定，因为固定协议中的
   `ResFetchInfo` 不返回账号 ID；
8. 调用一个有明确时间窗、最多一条记录的 `fetchGameRecordListV2`，只证明目录权限，
   不保存目录内容；
9. 关闭诊断连接；成功返回固定 `independent_restore_verified`，失败返回固定阶段码；
10. 本切片的真人结果写入脱敏 handoff，只记录阶段、客户端/适配器版本和成功/失败。

## 5. 结果解释

- 四步全成功：批准后续正式实现独立 Lobby 恢复，登录窗口可以在成功捕获后销毁；
- `oauth2Check` 明确拒绝：令牌不具备该恢复能力，进入按需官方页面方案设计；
- `oauth2Check` 成功但 `oauth2Login` 失败：先核对完整请求字段与官方固定版本，不得
  直接宣判令牌无效；
- 登录成功但身份不匹配：安全失败并清除本次诊断结果；
- 网络/超时/服务端未知错误：结果为 `inconclusive`，不改生产设计；
- 目录权限失败：说明 Lobby 身份或目录权限仍未闭环，不开放同步。

## 6. 自动测试与真人测试

自动测试先用完全虚构令牌和固定 protobuf 帧覆盖：

- 精确 RPC 顺序、请求字段和身份绑定；
- 每个阶段的失败关闭与资源释放；
- 任意 gateway、`ws:`、未知端口、重定向和恶意 prose 拒绝；
- 日志/错误/inspect/JSON 不出现虚构令牌；
- 诊断不写 vault、不写 catalog、不改变 renderer capability；
- 超时后 codec correlation 与 transport 全部关闭。

自动门禁全绿后，才启动一次可见官方登录窗口。用户只在官方页面输入账号信息与
验证码；应用输出固定阶段结果。真人测试不提交真实帧、账号、UUID 或令牌。

## 7. 非目标

- 不实现完整 M5-E 产品接线；
- 不实现 M5-D 牌谱下载与映射；
- 不保留或注入官方页面 WebSocket；
- 不长期运行隐藏窗口；
- 不改变已批准的退出、加密保险库和本地目录语义；
- 不把 fixture transport 作为生产 fallback。
