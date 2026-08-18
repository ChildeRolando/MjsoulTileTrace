# ADR-0005：Workspace 依赖方向与 renderer 安全边界——reasoning 允许依赖 mortal-source 报告格式，来源包不得依赖 reasoning，renderer 不得直接导入特权包

日期：2026-08-19
状态：已采纳（docs + 机械强制）

## Context

`docs/development/ARCHITECTURE.md` 把 `@riichi-coach/reasoning` 描述为
"来源无关的麻将推理层"，但 M6-A 真实语料验收需要把 Mortal 报告解析进推理层的
验收证据机制（`acceptance-core` / `acceptance-evidence` / `mortal-full-game-
review`），因此代码中 `reasoning → @riichi-coach/mortal-source` 已是事实依赖。
`mortal-source` 只做**报告格式解析**（schema、URL 校验、指纹、mjai tile），
不含任何雀魂账号/协议能力——"来源无关"在此的准确含义是"无关特权来源与协议细节"，
而不是"零来源格式依赖"。

同时以下边界此前只是约定与散落测试，无单一裁决文档：

- 来源包（mahjong-soul-source / tenhou-source / mortal-source）不得依赖
  reasoning（来源只能映射，不能计算教练因素）；
- 除 desktop 组合根外，任何包不得依赖 desktop；
- renderer 代码与 preload 不得直接导入特权包（含 reasoning），只接收安全 DTO；
- 跨包导入只能走包根 exports 面。

## Decision

固定以下依赖方向表（riichi-coach 内部边）：

| 包 | 允许依赖 |
|---|---|
| `@riichi-coach/contracts` | （无） |
| `@riichi-coach/mahjong-soul-source` | contracts |
| `@riichi-coach/tenhou-source` | contracts |
| `@riichi-coach/mortal-source` | contracts |
| `@riichi-coach/reasoning` | contracts、mortal-source（仅报告格式解析） |
| `@riichi-coach/desktop` | 全部（组合根） |

- renderer 安全集合（`desktop/src/renderer/**`、`preload.ts`、`preload-entry.ts`）
  的直接导入只允许 contracts 与桌面安全 API 模块；禁止 mahjong-soul-source、
  mortal-source、tenhou-source、reasoning。
- 跨包导入必须使用包根 exports 面（desktop 的 `./session-api` 是已声明的公共
  子路径例外）；深导入只允许 `scripts/` 的 allowlisted 工具
  （`generate-factor-regression-golden.mjs` 需要刻意不公开的 legacy bridge）。
- 以上由 `coach/scripts/check-architecture.mjs` 机械强制，接入 `npm test` 门禁。

## Alternatives considered

- **A. reasoning 零来源格式依赖**（把 Mortal 报告解析拆到独立包）：多一个包与
  间接层，而验收证据机制本来就属于推理层；不解决任何真实失败。
- **B. 允许来源包依赖 reasoning**（来源可计算因素/偏好）：直接违反
  "canonical 事件流是唯一真相、来源只映射"（INV-009），会让来源替换变成全链改动。
- **C. 仅文档约定、不机械强制**：单个维护者 + 多个 AI 会话的场景下无法防回归；
  依赖方向违规往往在 typecheck 与测试中不可见（如来源悄悄 import 了 reasoning
  的纯函数）。

三案均拒绝；采用依赖方向表 + 机械检查。

## Consequences

- reasoning 可解析 Mortal 报告格式，但不得读取雀魂/天凤来源格式；新来源包只需
  依赖 contracts 即可接入 canonical 重放。
- ARCHITECTURE.md "来源无关" 的表述按本 ADR 解释：无关特权来源与协议细节，
  不禁止报告格式适配器依赖。
- `npm run check:architecture` 成为日常门禁；改动依赖方向或 renderer 表面时必须
  同步更新 `scripts/check-architecture.mjs` 的规则表与测试。
- renderer 边界的机械规则只覆盖**直接导入**；传递泄漏仍由 preload /
  security-boundary 行为测试覆盖（INV-005 的残余缺口记录在
  [INVARIANTS.md](../development/INVARIANTS.md)）。

## Supersedes

无正式先例文档。本 ADR 将既存代码事实边界钉死为权威裁决，取代任何把 reasoning
理解为"完全零来源依赖"或允许来源计算教练因素的说法。
