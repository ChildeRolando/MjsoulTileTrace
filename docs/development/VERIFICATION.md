# 测试与发布门禁

## 日常门禁

在 `coach/` 运行：

```powershell
npm run typecheck
npm test
npm run test:package-import
npm audit --omit=dev
```

`npm test` 已包含 workspace build、全部 Vitest、协议 updater 测试和协议 compatibility 测试。

## 按改动范围选择门禁

| 改动范围 | 最低 focused 门禁 | 合并前门禁 |
|---|---|---|
| contracts | 对应 contracts test + 所有直接消费者 test | typecheck、full、package-import |
| mahjong-soul-source | 对应 source test；协议改动额外 updater/compatibility | typecheck、full、package-import、audit |
| reasoning | 对应 factor/replay/assembly tests | typecheck、full、package-import |
| desktop IPC/UI | desktop focused、preload、security boundary | typecheck、full、package-import |
| Go sidecar | Go focused + TS client/semantic tests | `go test ./...`、`go vet ./...`、full、重新打包/清单验证 |
| 静态课程 | 相关 Node test 与浏览器 smoke | 根目录完整课程门禁 |
| 文档 | 链接、命令和当前状态核对 | `git diff --check`；必要时实际运行示例 |

## Sidecar 门禁

修改 `coach/tools/mahjong-facts` 或其协议时：

```powershell
cd coach
npm run test:fact-engine
npm run build:fact-engine
npm run package:fact-engine
npm test
```

提交前核对 packaged binary 的 size/SHA-256、manifest、adapter identity 和真实 golden 一致。不要只跑 Go 单测。

## 雀魂协议门禁

```powershell
cd coach
node scripts/update-mahjong-soul-protocol.mjs --check
node scripts/update-mahjong-soul-protocol.mjs --check-current
node --test scripts/mahjong-soul-protocol-compatibility.test.mjs
```

协议更新必须同时验证 official JSON、vendored proto、runtime RPC map、endpoint policy 和 compatibility report。网络失败、重定向、超限正文或字段漂移不得自动降级。

## 静态课程门禁

在仓库根目录：

```powershell
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
```

视觉或交互改动还需浏览器检查首页、课程、训练器和掌握度页面，并检查移动视口与控制台。

## 人类验收矩阵

自动测试不能代替以下外部事实：

| 能力 | 人类验收 |
|---|---|
| 雀魂首次登录 | 在官方国区页面由用户本人完成；确认应用只显示安全状态 |
| 跨重启恢复 | 关闭并重新启动应用，不打开登录窗即可恢复；身份错配必须清除 |
| 最近 30 场 | 与雀魂账号近期记录对照数量、顺序和规则过滤 |
| canonical mapper | 用脱敏真实牌谱逐事件对照雀魂回放，特别核对杠、荣和、流局 |
| 生产模型 | 对照固定模型版本的原始候选/分数，确认适配后排序与身份 |
| 完整 H1 | 登录 → 选牌谱 → 重放 → 模型比较 → 结构化报告，全程无秘密/原始数据泄漏 |

验收结果必须记录日期、版本/提交、固定状态、发现的问题和是否允许宣称完成；不要记录真实令牌或完整牌谱。

## 发布前检查

1. 工作树只含目标改动，`git diff --check` 通过；
2. living docs 与当前状态一致；
3. full/typecheck/package-import/audit 全绿；
4. sidecar、协议或 Electron 资源发生变化时，重新验证打包产物；
5. 所有外部依赖身份、许可和 hash 已固定；
6. 需要人类验收的能力已经验收，或 UI/文档明确标为未完成；
7. handoff 记录下一步，而不是用“后续完善”掩盖关键阻塞。

## 如何描述测试结果

优先写命令和通过/失败，不把测试数量当长期常量。数量只应写入带日期的 handoff；living docs 不锁定会迅速过期的测试总数。
