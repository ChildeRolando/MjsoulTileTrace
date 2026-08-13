# 雀魂国区牌谱取回接线交接

日期：2026-08-14

分支：`codex/m5e-oauth2-restore-diagnostic`

工作树：`E:\文档\日麻教学-m5c-integration`

## 当前结论

国区账号链路已从“登录与目录同步”推进到“用户在可分析列表点击一场对局，主进程恢复账号会话并安全取回、校验、基础解码牌谱”。

必须准确区分以下三件事：

1. **真人能力验证已通过**：一次真实登录曾完整跑通独立 Lobby 恢复、最近目录、详情请求、inline 牌谱取得，以及非空 `GameDetailRecords` 解码；诊断退出码为 0。仓库未保存真人令牌、账号、牌谱或响应正文。
2. **产品接线已完成到取回层**：列表新增“分析”按钮，经严格 preload/IPC 边界调用主进程；主进程只允许当前加密账号目录中的 recordId，恢复并核对账号后取回牌谱。渲染层只收到固定 `{status:"record_fetched"}`，拿不到令牌、下载地址或原始字节。
3. **教学分析尚未接上**：取得的雀魂 `GameDetailRecords` 还没有转换为项目的 canonical replay，也没有进入既有 structured factor pipeline。因此目前按钮成功文案是“牌谱已取得并完成基础解码”，不是“分析完成”。

## 本轮提交

- `b17416f feat: persist Mahjong Soul restore context`
  - 凭据库 v2 加密保存完整 OAuth2 恢复上下文，支持跨重启。
- `bf413da feat: restore Mahjong Soul sessions headlessly`
  - 初始化只做无窗口恢复；生产目录同步使用真实独立 Lobby；身份不匹配会清理凭据。
- `9916f68 docs: plan Mahjong Soul record ingestion`
  - 记录牌谱摄取分步计划。
- `9b8606e feat: fetch trusted Mahjong Soul records`
  - 支持 inline 与 manifest 允许来源的 `data_url`，做大小、SHA-256、协议容器和非空动作校验；原始字节只存在 privileged source 包。
- `eae4e74 feat: connect catalog records to ingestion`
  - 加入 account-bound ingestion service、生产接线、窄 IPC/preload API 和列表按钮。
  - 同一 recordId 的并发请求合并；不同 recordId 相互隔离，避免把第一场结果误回给第二场。

## 关键文件

- `coach/packages/mahjong-soul-source/src/record-fetcher.ts`：可信牌谱取回与基础解码。
- `coach/packages/desktop/src/record-ingestion-service.ts`：账号/目录绑定、会话恢复与生命周期。
- `coach/packages/desktop/src/electron-entry.ts`：生产依赖接线。
- `coach/packages/desktop/src/ipc.ts`、`preload-entry.ts`：renderer 安全边界。
- `coach/packages/desktop/src/renderer/app.ts`：可分析列表与“分析”按钮。
- `coach/docs/plans/2026-08-14-mahjong-soul-record-ingestion.md`：后续执行计划。

## 已锁定的不变量

- 只接受国区当前账号目录中已被筛为可分析的 recordId。
- 每次取回前重新恢复并认证保存的账号；未认证或身份错配不取牌谱。
- Lobby 在成功、失败时均关闭。
- 渲染层不接触账号 ID、令牌、恢复上下文、下载 URL、原始响应或牌谱字节。
- IPC 只接受一个字符串 recordId，只返回固定成功状态；异常被映射为固定项目错误。
- 同一牌谱可 single-flight，不同牌谱绝不共享结果。

## 验收

- focused：3 files / 20 tests；
- TypeScript typecheck：通过；
- full suite：见本交接提交前最终运行结果（预期 99 files / 1022 tests）；
- protocol updater：26/26；
- protocol compatibility：4/4；
- `git diff --check`：通过（仅本机 LF/CRLF 提示）。

## 下一步（接力者从这里开始）

最短下一步不是再改登录或目录，而是完成计划中的 canonical mapper：

1. 从真实协议的 `GameDetailRecords.actions` / legacy `records` 读取动作 payload；
2. 显式支持已知动作联合，未知动作固定 fail closed；
3. 生成项目 canonical event stream，并经过现有 event-stream schema/reducer 验证；
4. 将 canonical replay 接入现有 structured analysis assembly；
5. 只有生成了真实分析结果后，才把按钮成功态从 `record_fetched` 升级为分析完成/报告页面。

建议继续小步提交：先用脱敏 fixture 做一局 mapper RED→GREEN，再接 ingestion service；不要把 mapper、完整 UI 报告和批量后台分析揉成一个任务。

## 非目标与注意事项

- 当前仅支持雀魂国区。
- 当前没有后台批量下载，也没有把原始牌谱持久化到 renderer 或普通目录。
- 不要把真人诊断成功误写成 canonical replay/教学分析已经完成。
- 原工作树 `E:\文档\日麻教学` 的用户改动未被读取、修改或提交。
