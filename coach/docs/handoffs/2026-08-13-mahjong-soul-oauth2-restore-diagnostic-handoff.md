# 雀魂国区 OAuth2 独立恢复真人诊断交接

日期：2026-08-13
分支：`codex/m5e-oauth2-restore-diagnostic`

## 结论

真人诊断固定结果为 `independent_restore_verified`，进程退出码为 `0`。

这证明在用户本人于一次性、可见的雀魂国区官方窗口完成登录后，应用捕获的受限恢复上下文可以在一个全新的 Lobby 会话中完成：

1. 国区网关发现；
2. 新 WebSocket/Liqi 会话创建；
3. `oauth2Check`；
4. `oauth2Login`；
5. 登录账号 ID 与捕获账号 ID 一致性校验；
6. `fetchInfo` 已认证能力探针；
7. `fetchGameRecordListV2` 有界目录探针；
8. 连接与一次性浏览器存储清理。

诊断没有读取或写入现有 v1 凭据库、目录缓存、renderer IPC 或正常产品持久浏览器分区。仓库未保存真实账号、昵称、令牌、Cookie、UUID、牌谱、响应正文或原始网络帧。

## 真人测试期间发现并修复的问题

原实现把真实运行时的原生 `fetch Response` 当成不受支持的对象，因为自动测试只使用了普通对象替身。这会在任何 OAuth2 RPC 发出前固定失败。修复后仅对 `ok/status/redirected/url/body` 做单次快照，正文仍受 64 KiB 上限、严格 JSON 结构和 manifest-owned 国区域名约束。

诊断结果同时改为诚实的固定阶段码：会话构造与各 RPC 调用失败不再被过度描述为特定传输错误；只有明确的非零服务端错误码才标为拒绝，畸形或缺失字段保持 `inconclusive`。

## 自动门禁

- 全量：95 个测试文件，998 项测试通过；
- 协议更新器：26/26；
- 协议兼容性：4/4；
- TypeScript 类型检查通过；
- emitted package import 通过；
- 生产依赖审计 0 vulnerabilities；
- 最终独立复审：Critical 0 / Important 0。

## 边界与下一步

本结果只关闭“账号密码首次登录得到的访问令牌能否在独立 Lobby 中恢复”的能力假设。它不等于完整 M5-E 产品接线完成，也不等于 H1 的登录→最近 30 场→详情下载→解码→回放全链路完成。

下一步可以实现生产 M5-E：把已经验收的独立 Lobby factory 接入现有 catalog service，设计加密持久化 recovery context 的版本迁移、注销/换号/跨重启生命周期，并在入口开放前完成目录同步与完整 H1 验收。
