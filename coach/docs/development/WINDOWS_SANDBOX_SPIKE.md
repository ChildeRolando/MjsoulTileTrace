# Windows Sandbox 禁网 Local Mortal spike

日期：2026-09-26。用途：执行冻结 production spike 的网络隔离条件。

## 隔离范围

只关闭 Windows Sandbox 内的网络；宿主机、编辑器和 agent 保持正常联网。
使用 Windows 自带 Sandbox，不增加产品能力，不修改全机防火墙。
`.wsb` 的 `Networking=Disable` 是隔离配置；离线环境变量或无效代理不是替代品。
微软配置参考：[Windows Sandbox configuration](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file)。

## 前置条件

- Windows Sandbox 已启用；若启用时返回 `RestartNeeded=true`，先完成系统重启。
- 已按 [VERIFICATION.md](VERIFICATION.md) 准备受管 Windows x64 资产及 preparation receipt。
- 本机可用 Node/npm、Git、Python base installation；现有 venv 及 CPU PyTorch 已准备。
- 目标提交的 tracked tree 干净，已运行 `npm run build`。
- 宿主可提供约 16 GiB 沙箱内存及复制依赖、venv、checkpoint 所需临时磁盘空间。

准备操作只复制本地文件；不执行准备资产下载命令，不安装模型、不下载权重。
Node/npm、Git、Python base、模型资产和代码快照只读映射；仅独立 evidence 目录可写回宿主。
沙箱内重建 workspace junctions，并把 venv 的 `home` 改为已映射的 Python base。
runtime/model/engine/native/checkpoint 的既有 SHA 验证仍由原 production spike 执行。

## 操作

在干净提交的 `coach/` 运行：

```powershell
npm run build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/prepare-windows-sandbox-spike.ps1
```

脚本默认在 `%LOCALAPPDATA%\RiichiCoach\sandbox-spike\<timestamp>` 创建独立快照、
`local-mortal-offline.wsb` 和 `evidence/`，输出配置的完整路径。
可用 `-OutputRoot` 指定一个尚不存在的新目录；`-AssetRoot` 指定已有受管资产目录。
不接受覆盖历史运行目录。代码快照为独立 Git clone，不依赖原 worktree 的外部 `.git` 指针。

启用功能并重启完成后，打开生成的 `.wsb` 文件。其 LogonCommand 自动启动
`run-windows-sandbox-spike.ps1`，在沙箱内执行原命令：

```powershell
npm run test:local-mortal-production-spike
```

保留 Sandbox 窗口直到 evidence 出现 `result.json`。失败时先查看该文件和
`sandbox-transcript.log` / `spike.log`，不要关闭窗口前丢失诊断，不把配置准备成功记作验收 PASS。
结束后可关闭 Sandbox；沙箱内临时副本随之销毁，宿主 evidence 保留。

## 验收回读

必须同时核对：

1. `host-preparation.json` 的完整 commit 与目标 HEAD 一致，configuration SHA 对应实际 `.wsb`。
2. `.wsb` 明确禁网；`network-before.json`、`network-after.json` 没有 Up 网卡或 IPv4/IPv6 默认路由。
3. `result.json` 的 environment 为 Windows Sandbox、networking 为 Disable、exitCode 为 0。
4. `production-spike-receipt.json` 的 commit 与上面一致、exitCode 为 0，满足原 fixture、资产和 wave-1 门。

网络断言或任何执行步骤失败时，runner 写失败 result，不签发禁网 PASS。
Python smoke、网络断言、真实推理完成与候选双射是不同证据，不能相互替代。
日志、configuration、模型和本机路径留在非源码输出目录；不提交 checkpoint 或 receipt 原始本机路径。
配置或源码提交发生变化后，重新 build、准备新快照和运行，不能沿用旧 HEAD receipt。

## 本机配置状态（2026-09-26）

Windows 11 专业版；固件虚拟化已启用，hypervisor 存在。用户授权 Windows Sandbox 路线后，
管理员功能启用返回成功和 `RestartNeeded=true`。未自动重启。
功能启用日志在 `%LOCALAPPDATA%\RiichiCoach\windows-sandbox-setup/`。

当前只确认功能启用与配置准备；**重启后的 Sandbox 启动、Python relocation smoke 和禁网
production spike 尚未执行**。普通环境 `a5ec1b1` 的 716 次推理不能代替上述禁网回读。
