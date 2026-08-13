# 雀魂国区内联牌谱真人冒烟规格

日期：2026-08-13

## 目标

在已经真人验证通过的独立 OAuth2 Lobby 会话上，确认登录后确实能取得一场可分析牌谱的完整内联录像，并解码出非空动作容器。

## 范围

一次性 Electron 诊断执行以下步骤：

1. 用户在可见、非持久化的雀魂国区官方窗口登录；
2. 建立新的独立 Lobby 会话并完成 `oauth2Check` 与 `oauth2Login`；
3. 复用现有 M5-C 目录同步，取得最近 30 场并筛选可分析的四人南风标准局；
4. 选择第一条可分析记录，调用 `fetchGameRecordsDetail`；
5. 只接受响应中的内联 `data`；若只有 `data_url`，返回固定 `record_data_url_not_supported`；
6. 用已固定的 liqi protobuf bundle 解码 `GameDetailRecords`，接受当前 `actions` 或旧 `records` 容器；
7. 容器至少包含一个动作时返回 `inline_record_verified`。

## 输出与隐私

诊断只输出固定结果码。不得保存或输出账号、昵称、令牌、Cookie、牌谱 UUID、牌谱正文、动作内容或服务端错误原文。窗口关闭后清除一次性浏览器存储，Lobby 始终关闭。

## 明确不做

- 不支持 `data_url` 下载；
- 不把录像写入本地；
- 不接 renderer 或开放同步按钮；
- 不迁移 v1 凭据；
- 不把动作映射为 canonical 流或启动分析引擎；
- 不建设通用 M5-D 下载器。

## 固定结果

- `inline_record_verified`；
- `no_analyzable_record`；
- `record_data_url_not_supported`；
- `record_detail_rejected`；
- `record_container_unsupported`；
- `record_actions_empty`；
- 既有登录、会话和目录阶段码。

账号最近 30 场没有可分析条目只说明测试样本不足，不算协议失败。

## 验收

- 自动测试使用假令牌与脱敏内联 protobuf fixture，先 RED 后 GREEN；
- 全量测试、类型检查和独立只读复审通过；
- 真人诊断返回 `inline_record_verified`，才可声称“登录后能获取并解码完整内联牌谱”；
- 若返回 `no_analyzable_record` 或 `record_data_url_not_supported`，记录真实边界后再决定下一小步。
