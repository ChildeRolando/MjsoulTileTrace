# M5-B 雀魂 Electron 会话与令牌保险库交接

更新时间：2026-08-11

当前阶段：M5-B 工程实现与自动化验收完成；真人登录冒烟尚未执行。下一产品切片是 M5-C 最近 30 场目录同步，并且界面只显示可分析的四人南风标准规则条目。总规格 H1 是 M5-E 的登录→目录→下载→重放全链路人工验收，不在 M5-B 宣称完成。

## 1. 已交付

- 私有 `@riichi-coach/desktop` Electron workspace，固定 Electron `43.3.0`；
- 隔离的雀魂国区官方登录窗口：独立持久 partition、context isolation、sandbox、无 Node integration、无 remote preload，严格限制页面、请求和 WSS 端点；
- 权限、下载、新窗口、webview、外站导航、危险 scheme 和证书绕过均不开放；
- 通过 CDP 只观察 manifest 允许的二进制 WebSocket 帧，每条 WebSocket 使用独立 Liqi codec，并将请求与 login/oauth2Login 响应精确关联；
- 登录成功后只保留 `CapturedMahjongSoulCredential` 六字段；原始帧、decoded payload、Cookie、Authorization、账号 ID 和令牌不进入 renderer、IPC、日志或错误文案；
- AES-256-GCM 会话保险库，每次保存生成随机 key/nonce；session key 由 Electron `safeStorage` 包裹，Linux 明确拒绝 `basic_text`/unknown 后端；
- 本机 session 文件使用固定目录、独占锁、staging/backup 恢复与原子切换；拒绝 symlink/junction/reparse、非普通文件和超限内容；
- 跨重启恢复时只接受相同 `loginMethod + accountId` 的相关成功响应；临时网络/加载失败保留保险库并显示 `offline_unverified`，明确拒绝或身份不匹配才清除；
- 注销先取消登录观察并清理隔离浏览器会话，再清除保险库；不触碰已经完成的本地分析结果；
- renderer 只获得安全的会话状态和三个固定操作：读取状态、打开官方登录、退出账号；没有 token/account ID 输入框，也没有通用 IPC 调用接口；
- 真实临时目录集成测试证明保存后销毁全部内存对象、重新创建服务仍能恢复，且磁盘文件不含假 token 或假账号 ID。

## 2. 明确未实现

M5-B 不是完整账号同步功能，当前没有：

- 最近 30 场牌谱目录同步；
- “仅显示可分析条目”的产品列表；
- fetchNextGameRecordList、完整牌谱数据下载或缓存；
- 牌谱 URL 生成/解析、主视角绑定；
- GameDetailRecords 到 canonical event stream 的转换；
- React 会话工作台、安装包、自动更新或生产发布；
- M5-B 真人登录冒烟结果，以及 M5-E 总规格 H1 结果。

不要把现有 fixture-only 命令行原型描述成生产雀魂导入器，也不要让 M5-C 复用 renderer/IPC 传递令牌。目录 RPC 必须继续留在 main-process 特权边界。

## 3. 提交序列

- `ec95c1c`：M5-B 逐任务实施计划；
- `94e284f`：Electron workspace 与安全会话 API；
- `d07669d`：加密会话保险库领域；
- `0721571`：OS 安全后端与可恢复文件存储；
- `06723ba`：相关雀魂登录帧观察；
- `09aadeb`：隔离官方登录窗口；
- `512b551`：恢复、登录、注销生命周期；
- `9ad4137`：IPC、preload、Electron main 与最小 renderer；
- `85baebb`：跨重启与安全边界集成门禁。

M5-A 的协议身份和可信资源仍以 `coach/docs/handoffs/2026-08-11-mahjong-soul-protocol-contracts-handoff.md` 为准。

## 4. 自动化验收

本次最终实跑：

- `coach/npm test`：82 个测试文件、863/863；
- `coach/npm run typecheck`：通过；
- `coach/npm run test:package-import`：1/1；
- `coach/npm audit --omit=dev`：0 vulnerabilities；
- 根目录课程/牌效测试：18/18；
- Go sidecar `go test ./... -count=1`：通过；
- Go sidecar `go vet ./...`：通过。

重点门禁覆盖：秘密值 coercion/inspect/JSON 脱敏、getter 快照、加密篡改、系统安全后端降级拒绝、文件事务故障注入、跨重启恢复、登录帧 correlation、多 WebSocket 隔离、导航/请求/权限/下载策略、取消竞态、单飞状态机、注销顺序、IPC sender/channel/参数绑定、renderer 输出与固定错误文案。

## 5. 真人登录冒烟状态与唯一外部阻塞

M5-B 真人登录冒烟尚未执行，不能记为通过；这也不等于总规格 H1。M5-C/D 可继续使用脱敏 fixture transport 开发，M5-E 才执行唯一一次登录→目录→下载→重放全链路 H1。

`electron@43.3.0` 的 npm 包和类型已经安装，但本机缺少 `coach/node_modules/electron/dist/electron.exe`。2026-08-11 再次运行官方 `install-electron` 下载约 90 秒仍无任何输出或完成，已主动终止；没有使用第三方镜像，也没有降级 Electron 版本。因此当前无法启动可见登录窗口让用户本人完成官方登录。

网络恢复后，从 `coach` 目录按以下顺序继续：

```powershell
npx install-electron --no
Test-Path node_modules/electron/dist/electron.exe
npm run desktop
```

只有第二条返回 `True` 才启动应用。用户本人只在雀魂官方页面输入账号、密码与验证码；不得要求用户提供 token、Cookie、localStorage、开发者工具截图或原始网络帧。

M5-B 真人登录冒烟逐项确认：

1. 官方国区页面在隔离窗口中成功登录；
2. 主窗口只显示安全昵称和状态；
3. 完全退出并重启后，状态变为 `valid` 或保守的 `offline_unverified`；
4. 注销后官方页面会话和加密保险库均被清除；
5. 再次打开登录窗口需要重新完成官方认证；
6. 已完成的本地分析资产不受影响。

若登录需要的 CAPTCHA/身份资源被端点策略阻断，只记录被阻断的官方 origin 与用途后停止；必须另开协议更新任务，以可复现来源、精确 host 和 RED→GREEN 门禁扩展策略，禁止添加通配 host 或关闭证书检查。

## 6. M5-C 接续边界

M5-C 不必等待真人登录冒烟，可以按总规格用 fixture transport 实现：

1. main process 使用已恢复的 `loginMethod + SecretString` 和 M5-A safe RPC allowlist 建立受限会话；
2. 用 `fetchGameRecordListV2`/`fetchNextGameRecordList` 取得最近 30 场元数据，严格绑定 iterator、分页、账号视角和响应身份；
3. 在特权边界内投影为 renderer-safe catalog DTO；
4. 只保留四人南风、标准规则、当前协议可解码且玩家视角可唯一确定的条目；
5. 界面只显示这些可分析条目，不显示“不可分析但灰掉”的条目；
6. 不在目录同步阶段下载完整记录；用户选择条目后再由 M5-D 按需下载并转换。

## 7. 工作区保护

以下均是用户或其他任务的既有改动，M5-B 没有暂存或提交：

- `.gitignore`；
- `coach/docs/plans/2026-08-08-hand-structure-furiten.md`；
- `overlay/HANDOFF.md`；
- 删除的 `overlay/cv重做.md`；
- untracked `overlay/.ai-bridge/`、`overlay/bridge/`。

每次提交前继续只暂存明确目标文件，并运行 `git diff --cached --name-only` 与 `git diff --cached --check`。
