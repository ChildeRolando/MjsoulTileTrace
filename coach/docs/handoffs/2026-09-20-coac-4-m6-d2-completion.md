# COAC-4：M6-D2 端到端生成收口与验收回执

日期：2026-09-20

## 结果

M6-D2 的 production 路径已收敛为一条：desktop main 读取并验证 package，调用既有
selector 与 graph projector，随后只通过 reasoning 包根的 `generateReviewReport`
生成报告。该入口内部完成 slice、provider 调用、grounding、overlay append 与
ReviewReport read-back validation。

自动传输重试由 OpenAI-compatible provider 单点拥有：一次初始发送加至多一次重试。
编排层、service、IPC 与 assembler 均不重试。`assembleReviewReport` 和 provider-result
映射已从 reasoning 包根公共面移除。

## 归档提交审计

| 提交 | 处置 | 审计说明 |
|---|---|---|
| `54ba270` | 复用并加固 | contracts、grounding、ReviewReport assembly 与相关测试已通过 COAC-2 正常合入；COAC-4 沿用这些权威实现，不复制第二套 validator。 |
| `bb36320` | 重写后复用 | provider/BYOK/IPC 能力已由 COAC-3 正常合入并完成 P2 修复；COAC-4 保留 provider 与安全边界，但把临时由编排层持有的 retry 改为 provider 单点所有。 |
| `eec9791` | 拒绝直接合入，选择性吸收测试意图 | 该尝试的组合根与测试覆盖提供了审计线索，但其重复生成职责、公开 assembler 与旧 seam 边界不满足冻结所有权；COAC-4 重新实现唯一 seam 与架构门禁，不依赖 archive 分支。 |

## Change Control Report

**Scope / Locality**：必要改动限定在 contracts provider-result 审计元数据、reasoning
生成 seam、desktop provider/组合根、架构检查与 M6-D2 living docs。未修改 selector
策略、M6-C/D1 数据语义、UI 或持久化。

**Invariants**：INV-001、INV-002、INV-005、INV-006、INV-007、INV-011 受影响。
contracts strict schema、grounding/read-back tests、provider/IPC tests 与
`review_report_generation_seam` 共同机械保护；无 enforcement 降级。

**Traceability / Replaceability**：selection 只来自 DeterministicReviewSelector；报告
引用 package/graph evidence。reasoning 只依赖 contracts 的 `LlmCoachProvider` 端口，
未绑定具体 HTTP 实现。

**Recoverability**：传输故障首先在 provider focused tests 失败；越权 draft 首先在
grounding tests 失败；编排绕过首先在 architecture checker 失败；读回篡改首先在
`validateReviewReport` adversarial tests 失败。

**Semantic Load**：未新增架构级抽象；COAC-3 临时窄 seam 折叠进既有
`generateReviewReport`，assembler 保持内部实现细节。

## 非目标

M7-A UI、M7-B 持久化、真实账号/真实 LLM 人工验收、后台任务与重生成策略仍不在本次
范围内。
