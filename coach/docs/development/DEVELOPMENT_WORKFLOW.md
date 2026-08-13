# 开发工作流

## 先确定改动属于哪一层

| 需求 | 首选位置 |
|---|---|
| 新跨模块数据或状态 | `coach/packages/contracts` |
| 雀魂协议、账号、目录、原始牌谱 | `coach/packages/mahjong-soul-source` |
| 重放、事实、候选、比较、解释 | `coach/packages/reasoning` |
| Electron 生命周期、存储、IPC、UI | `coach/packages/desktop` |
| helper/牌形算法适配 | `coach/tools/mahjong-facts` 与 reasoning fact-engine port |
| 静态课程/训练器 | 根目录 `lessons/`、`lib/`、`tests/` |

不要在 renderer 里解析协议，不要在 source adapter 里计算教练偏好，也不要为了一个新来源复制 reasoning 管线。

## 标准执行循环

### 1. 读取当前文档和代码

先读本目录的 roadmap/architecture，再读目标模块的 source、tests、最近相关 handoff。handoff 是线索，代码和测试才是当前事实。

### 2. 写一个窄规格

说明：

- 用户可观察结果；
- 输入、输出和身份绑定；
- 明确不做什么；
- 失败状态和隐私边界；
- 自动测试不能证明时所需的人类验收。

跨多个包或超过一个小提交的改动，在 `docs/superpowers/specs/` 和 `plans/` 留版本化文档；单点 bug 可以直接用测试描述契约。

### 3. RED → GREEN

1. 先添加会因缺失目标行为而失败的测试；
2. 实际运行并确认失败原因正确；
3. 写最小生产实现；
4. 跑 focused 测试与 typecheck；
5. 再补信任边界、并发和错误路径测试。

不要先写一大段实现再回填测试。测试 fixture 必须通过同一个生产 schema，避免测试自造宽松协议。

### 4. 逐层接线

一个能力存在于 helper 不代表产品已交付。完整接线通常依次是：

```text
contract → producer/source → validator → consumer → composition root → IPC/UI
```

每次宣称完成前，检查生产 composition root（当前主要是 `desktop/src/electron-entry.ts`）是否真的调用了新能力。

### 5. 分级验证

- focused：目标模块正反例；
- package：目标 workspace 全部测试；
- integration：跨包真实构建产物；
- full：`npm test`、typecheck、package import；
- external/H1：只有真实账号、第三方模型或桌面交互才能证明的能力。

具体命令见 [测试与发布门禁](VERIFICATION.md)。

### 6. 小提交

每个提交只完成一个可解释结果。推荐顺序：contract、producer、consumer/接线、docs/handoff。精确暂存目标文件，不把无关工作树改动带入提交。

### 7. 更新 living docs 和 handoff

- 状态变化：更新 `ROADMAP.md`；
- 边界或数据流变化：更新 `ARCHITECTURE.md`；
- 命令变化：更新 `GETTING_STARTED.md` / `VERIFICATION.md`；
- 接力时：新增 handoff，记录提交、真实门禁、待核实项和下一步。

## 信任边界清单

### 外部输入

- 使用严格 schema；
- 绑定 requestId/actionRef/stateHash/accountId/recordId 等实际上下文；
- 不信任数组顺序、上游错误文本、可变 URL 或类型声明；
- 未知字段、未知 action、部分分页和协议漂移 fail closed。

### 秘密与原始数据

- `SecretString` 不得被日志、JSON、inspect 或异常 prose 泄漏；
- renderer 不得收到 token、account ID、cookie、endpoint、原始 frame/record；
- fixed project error 替代上游异常文本；
- 真人 fixture 必须脱敏，真实凭据不得进入仓库。

### 证据与结论

- 模型评价不生成麻将事实；
- 启发式不进入确定性偏好；
- LLM 不创建 factors、不修改 preference；
- 不支持或缺事实时保留 blocked/unknown，不补写“合理猜测”。

## 并发与生命周期

涉及登录、同步、摄取和注销时，测试至少覆盖：

- 同操作 single-flight；
- 不同身份/recordId 不共享结果；
- logout 与在途操作的 drain/quiesce；
- timeout 后 pending/correlation 释放或整个会话 fail-close；
- 所有成功/失败路径关闭 Lobby、文件句柄和临时浏览器状态。

## Code review 重点

按优先级检查：

1. 是否能产生错误的法律状态、教学结论或身份绑定；
2. 是否泄漏令牌、原始响应、下载位置或上游 prose；
3. 是否存在 direct schema bypass、旧 fallback 或第二套 truth；
4. 并发、超时、注销和跨重启是否会提交陈旧结果；
5. 文档是否把 fixture、骨架或诊断误写成生产完成。
