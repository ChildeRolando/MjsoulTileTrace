# M5-A 雀魂国区协议与契约交接

更新时间：2026-08-11

当前阶段：M5-A 完成；下一步是 M5-B 隔离 Electron 官方登录窗口与本机加密令牌保险库。M5 整体、真实账号登录、近期牌谱目录和完整记录映射尚未完成。

## 1. 已交付

- renderer-safe 雀魂国区 DTO，只允许安全牌谱引用、目录元数据、玩家/座位与会话状态；秘密形字段、下载地址、原始记录和未知字段均拒绝；
- 独立特权包 `@riichi-coach/mahjong-soul-source`，`SecretString` 对字符串、JSON 和 Node inspect 默认脱敏，只有显式 `reveal()` 能在特权边界读取；
- 固定且可复现的国区协议 bundle，包含 Akagi Apache-2.0 LICENSE/NOTICE、`liqi.proto`、RPC map 和从官方 config 生成的窄端点策略；更新器用 sibling staging/backup 事务切换，并在下次启动恢复被中断的切换；
- 运行时按路径、文件类型、大小、SHA-256、manifest、端点策略和兼容报告加载 bundle；使用单一文件句柄、有限读取和读后复验收窄普通文件替换竞态，内容信任最终由精确 SHA-256 保证；
- Liqi request/response/notify 帧编解码与精确 correlation；调用能力被 package-owned 安全 RPC allowlist 限制，未知/破坏性 route 不能由调用方扩大；
- 登录结果立即投影为六个允许字段：`region`、`loginMethod`、`authType`、`accountId`、`displayName`、`accessToken`；令牌仍是 `SecretString`，原始 payload 和上游错误文案不会外泄；
- official schema、vendored proto service、vendored RPC map 的三方必需协议面比较；兼容报告的六个字段和三份哈希同时绑定更新器、manifest 与运行时；
- 固定 lowercase-hex 脱敏帧夹具，通过真实 vendored bundle 覆盖 login/oauth2Login、V2 目录 iterator/next、牌谱 inline data/data_url 和恶意 error；不进行网络连接。

## 2. 可信边界与明确未实现

M5-A 是协议/契约地基，不是可用账号同步功能。当前没有：

- Electron 窗口或真实雀魂登录；
- 网络 transport、WebSocket 连接或牌谱下载；
- 系统钥匙串/凭据库、跨重启令牌恢复或注销清理；
- 近期 30 场同步与“仅显示可分析条目”筛选；
- 完整记录解码到 canonical 事件流；
- 任何默认 token、真实账号 ID、真实牌谱或生产 fallback。

现有 `npm run coach` 仍是 `legacy_regression_bridge_only` 的截断 fixture 原型，不是通用 MJAI/Mortal/雀魂导入器。

## 3. 固定协议身份

- bundle：`mahjong-soul-cn-protocol/v1`；adapter：`0.1.0`；region：`cn`；
- 雀魂国区客户端：`0.11.252.w`；
- Akagi commit：`27e994ad8bacd87833856b3b36b146ebb7cccbbc`；license：Apache-2.0；
- official schema SHA-256：`f2955c3d10cf2d42bee9309f672c062540941ea0cffe1bd62e3f436c7afc404c`；
- vendored proto SHA-256：`ccfa3f7b39c205e9d4690f61bc1b333df415edfdf8d1e325cd5fc8a5ac30cbb7`；
- vendored RPC map SHA-256：`15f44eecb654e3b5cfca7682cf00f3a0a16ae3c76d0450b0257a9e89aa44be80`；
- required surface：`mahjong-soul-required-surface/v2`（包含登录投影实际解引用的 `Error.code` 与 `Account.nickname`）。

端点策略只允许：

- `https://game.maj-soul.com` 登录与静态资源；
- route-2 至 route-6 的固定 HTTPS discovery 与对应 WSS authorities（route-3 使用 8443）；
- `https://record-old.maj-soul.com:9443/majsoul/game_record` 牌谱数据前缀。

tracker、支付、聊天、广告以及配置文件中的任意其他 URL 均未进入信任面。

## 4. 提交序列

- `8d28848`：M5-A 书面实施计划；
- `b3de8f1`：renderer-safe 雀魂契约；
- `3ef1515`：特权源包与 `SecretString`；
- `be6d628`、`df69fae`：修正 raw Git 字节与 vendored byte-preservation 计划；
- `be7a792`：固定国区协议 bundle、端点策略与原子更新器；
- `25bdba9`：运行时 bundle 验证；
- `b63a1ff`：Liqi 帧编解码；
- `4ebdd5d`：明确 protobuf absent login error；
- `4e45275`：登录结果安全投影；
- `6f1b0f3`：三方协议兼容与真实 bundle 脱敏帧集成。

## 5. 更新与验证

从 `coach` 目录运行：

```powershell
npm test
npm run typecheck
npm run test:package-import
npm audit --omit=dev
node scripts/update-mahjong-soul-protocol.mjs
node scripts/update-mahjong-soul-protocol.mjs --check
node scripts/update-mahjong-soul-protocol.mjs --check-current
node --test scripts/mahjong-soul-protocol-compatibility.test.mjs
```

默认生成与 `--check` 不读取 mutable current version；只有 `--check-current` 联网验证官方当前版本。M5-A 最终验收时必须记录实际测试数量，并确认更新器运行后工作树没有新增差异。

还需从仓库根目录运行 `node --test tests/*.mjs`，并在 `coach/tools/mahjong-facts` 用配置的 Go 1.24.13 执行 `go test ./... -count=1` 与 `go vet ./...`。

本次最终实跑结果：

- `npm test`：68 个文件、772/772；
- protocol updater：26/26；compatibility：4/4；
- `npm run typecheck`、`npm run test:package-import`：通过；
- `npm audit --omit=dev`：0 vulnerabilities；
- updater write、`--check`、`--check-current`：全部通过且没有生成额外 diff；
- 根目录测试：19/19；
- Go sidecar `go test ./... -count=1` 与 `go vet ./...`：通过。

## 6. M5-B 接续要求

M5-B 应只消费本交接中的公开特权包边界，不复制协议解析或秘密处理：

1. Electron BrowserWindow 必须使用隔离 session/partition，只允许 endpoint policy 中的官方页面与明确所需的辅助登录能力；产品不读取密码、验证码或表单字段；
2. 只在明确观察到的 login/oauth2Login 成功响应中调用登录投影，不把 decoded payload 送入 renderer；
3. `loginMethod` 必须随凭据保存，不能假设 login 与 oauth2Login token 恢复语义相同；
4. 令牌只在本机凭据库/系统钥匙串中加密保存，并能跨重启验证恢复；第三方、LLM、日志、错误文案和 renderer 均不得持有令牌；
5. 注销清除令牌、会话和未分析目录，保留已完成分析报告；
6. M5-B 不应提前实现近期目录或完整牌谱下载；这些属于后续 M5-C/M5-D；
7. 第一个真实账号验证节点 H1 仍需用户本人在官方页面登录，并核对恢复/注销行为。此前所有测试继续只用假 token 与假账号。

## 7. 工作区保护

以下均为用户或其他任务的既有改动，本阶段没有暂存或提交：

- `.gitignore`；
- `docs/superpowers/plans/2026-08-08-hand-structure-furiten.md`；
- `overlay/HANDOFF.md`；
- 删除的 `overlay/cv重做.md`；
- untracked `overlay/.ai-bridge/`、`overlay/bridge/`。

每次提交前继续运行：

```powershell
git diff --cached --name-only
git diff --cached --check
```
