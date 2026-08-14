# 雀魂登录路线调查交接（裸 WebSocket 判死）

日期：2026-08-14

## 结论

对产品而言，主进程自己开裸 WebSocket（Node/undici）连 Lobby 网关的路线**不可行**。
官方浏览器（Chromium）里的 WebSocket 正常工作，而 coach 主进程的裸 WebSocket 对**任意**
Lobby RPC 都收到错误码 151。这不是 token、账号或某个具体 RPC 的问题，而是**连接级**的
风控/限流（TLS 指纹或连接特征不同所致）。

可行的自动化路线只有一条：**骑官方客户端的浏览器会话，用 CDP 被动捕获它自己的牌谱流量**。

## 实验证据（全程未保存 token / 账号 / 牌谱 / 响应正文）

| 场景 | 结果 |
| --- | --- |
| 裸 WebSocket 直接 `fetchGameRecord`（零登录） | `1004 ERR_NOT_LOGIN` |
| 裸 WebSocket `oauth2Check` + `oauth2Login`（已存 token 恢复） | `151` |
| 裸 WebSocket `fastLogin`（无凭证，仅 `client_version_string`） | `151` |
| 官方浏览器查看分享牌谱 | 正常（连 `route-*.maj-soul.com/gateway` 后取回牌谱） |
| 8/13 同款裸 WebSocket 恢复诊断 | `independent_restore_verified`（曾成功一次） |

关键推论：

- `fastLogin` 不带 token、不指向任何账号，仍返回 151 → 151 与凭证无关，是连接级拒绝；
- 8/13 裸 WebSocket 曾完整跑通 → 不是结构性不兼容，是"现在被风控"；
- 官方浏览器（同一 IP）正常而裸 WebSocket 被拒 → 差异在连接指纹
  （Chromium vs Node/undici 的 TLS/头部/cookie），不在 IP。

## 决策

- **放弃**：主进程裸 WebSocket「登录 → 取谱」路线（产品不能依赖"等冷却"，无论 151 是限流
  还是指纹风控，这条路一律判死）。
- **采用**：复用登录窗口的 Chromium 会话 + CDP 被动捕获（与 Akagi 的 proxy/rewrite 同思路，
  但用 CDP 观察而非 MITM 证书重写）。
- **兜底**：Majsoul Plus 手动导出 → 导入（零风控风险，但每局需手动一步）。

## 复用的零件与缺口

复用（已存在）：

- 登录窗口（`persist:riichi-coach-mahjong-soul-cn` partition，Chromium WebSocket）；
- `cdp-login-observer.ts`（CDP 抓 WebSocket 帧，现只盯 login/oauth2Login）；
- `liqi-codec.ts`（解码 Liqi 帧）；
- `mapMahjongSoulRecord` / `replayCanonicalStream`（牌谱 → canonical 重放，已验收）。

缺口：把 CDP 观察器从"只抓 login/oauth2Login 帧"扩展成"也抓 `fetchGameRecordListV2` /
`fetchGameRecord` 的请求或响应帧并解码出 `GameDetailRecords`"。这是下一步的最小闭环原型：
用户登录 → 在官方客户端点开一局牌谱 → coach 抓到并 decode，证明路线成立。

## 附带发现：牌谱数据端点 DNS

`record-old.maj-soul.com` 当前 CNAME 到阿里云抗 DDoS 域名（`*.aliyunddos0018.com`），
部分网络（尤其境外）解析不到 A 记录。coach 的 `fetchMahjongSoulRecord` 在 `data_url` 分支
依赖该端点，即使登录成功也可能因该 DNS 不可达而下载失败。后续取谱应优先内联 `data`，并把
`data_url` 可达性纳入考量。

## 未验证项

151 到底是 IP 级限流（冷却可解）还是 TLS 指纹风控（冷却无解）尚未区分；但这不影响上面的
产品决策——产品不能依赖"等冷却"，故裸 WebSocket 路线一律判死。

## 工作区说明

本交接前的实验性代码已清理：`guest-fetch-diagnostic-runner.ts`、`guest-observe-runner.ts`、
以及 `fastLogin` 白名单扩展均已移除。保留的是恢复/重放诊断的可复用加固（`--probe-rejection`
默认关闭、恢复阶段细分状态码、单请求拒绝码投影）。
