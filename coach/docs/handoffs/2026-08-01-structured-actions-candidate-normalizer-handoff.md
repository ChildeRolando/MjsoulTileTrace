# 结构化日麻动作与 CandidateNormalizer 交接

日期：2026-08-01
状态：Slice 2 已完成、已测试、已独立复审；当前没有必须由用户决策的阻塞项。

## 1. 本切片完成了什么

本切片把“模型候选、实战动作、用户提问动作”统一到同一条确定性管线：

```text
用户受约束草稿 / MJAI 动作序列 / Akagi typed adapter
                         ↓
               ActionDraft + KnownActionFacts
                         ↓
                 CandidateNormalizer
                         ↓
 ready / structurally_invalid_action / needs_clarification
      / inconsistent_with_known_facts / unsupported_source_action
                         ↓
       同窗口候选合并 + StructuredComparisonSet
                         ↓
          Mortal 分数绑定到 canonical actionRef
```

已覆盖 11 种动作：普通弃牌、立直弃牌、吃、碰、大明杠、暗杠、加杠、自摸、荣和、九种九牌、pass。

已覆盖 4 种决策窗口：`self_turn`、`discard_response`、`kan_response`、`post_call_discard`。`pass` 表示放弃整个响应窗口；抢杠明确区分加杠与暗杠响应。

核心性质：

- canonical action codec 只有 contracts 中一套权威实现；
- `ready` 结果绑定产生它的 `decisionWindow`，集合构建器不能重新给候选贴窗口；
- 结构非法动作返回显式结果，不向上抛未声明的 Zod 异常；
- 完整动作的结构非法优先于事实冲突，已知事实冲突优先于对不完整草稿的追问；
- 缺事实只标为 `unknown_due_to_missing_facts`，不得称为非法；
- 同一动作的 model / actual / user 来源可以合并，跨窗口候选拒绝比较；
- Mortal 的 probability / Q 与 canonical `actionRef` 绑定；实际动作必须位于模型已评分候选中；
- Akagi 目前只定义 typed adapter port，不猜测其私有原始 JSON；
- 旧 `ActionId` 严格回归管线通过独立 legacy discard bridge 保留，等待 Slice 3 迁移。

## 2. 产品不可退让约束

- `modelReason` 永远是 `unknown`；教练只能从牌局事实、确定性计算和证据账本中选择与模型偏好一致的解释，不能替模型脑补理由。
- 模型偏好与教练/经验偏好必须分离。
- 无模型提问与有模型分析走同一条“事实 → 计算 → 五轴账本 → 决定性理由”管线；区别只是有没有候选动作评分。
- 已知条件不足时跳过对应分析，不默认追问；只有用户给出的结论与已知平面结论冲突、且缺失事实可能改变结论时才校准信息。
- 默认详解阈值为 10；低于阈值也必须给具体麻将理由，禁止“差距很小、可以理解”一类空话。
- 不向教练枚举所有合法动作，只比较模型给出的候选或用户明确提出的动作。
- 首版牌谱分析只支持雀魂四人南风局；牌谱 URL 无需登录。
- Mortal 与 Akagi Native 是平级模型选项；Mortal 可执行文件、配置和模型默认集成，不要求普通用户填写路径。
- 东一局 6 巡回归必须保持：牌效支持切 2p，防守支持摸切立直者现物 6s；不能把 6s 解释成牌效冗余。
- 东一局 7 巡回归必须保持：牌效支持切 7p，防守支持切现物 8p；这是攻守判断，不是“保留 7p 对子”的牌效解释。

## 3. 规格、计划与主要代码入口

- 规格：`docs/superpowers/specs/2026-07-30-structured-actions-candidate-normalizer-design.md`
- 实施计划：`docs/superpowers/plans/2026-07-30-structured-actions-candidate-normalizer.md`
- 动作、窗口与约束：`coach/packages/contracts/src/actions.ts`
- canonical codec：`coach/packages/contracts/src/action-codec.ts`
- 候选/结果 contracts：`coach/packages/contracts/src/candidate-contracts.ts`
- 结构化比较集合：`coach/packages/contracts/src/structured-comparison.ts`
- 用户草稿解析：`coach/packages/reasoning/src/candidate/user-action-draft.ts`
- 确定性归一化：`coach/packages/reasoning/src/candidate/candidate-normalizer.ts`
- 候选合并与可比性：`coach/packages/reasoning/src/candidate/comparison-set-builder.ts`
- MJAI 适配：`coach/packages/reasoning/src/import/mjai-action.ts`
- Akagi typed port：`coach/packages/reasoning/src/import/action-adapter-port.ts`
- legacy bridge：`coach/packages/reasoning/src/candidate/legacy-action-bridge.ts`
- Mortal 结构化导入：`coach/packages/reasoning/src/import/structured-mortal.ts`

## 4. 相关提交

设计与计划：

- `2ee4490 docs: specify structured action normalization`
- `745a872 docs: locate canonical action codec`
- `eebba64 docs: plan structured candidate normalization`

Task 1–10：

- `ef64c74 feat: define structured riichi actions`
- `45baa86 feat: bind canonical structured actions`
- `0a0547c feat: define candidate normalization boundaries`
- `3ebc73a feat: constrain user action drafts`
- `7e88f4a feat: normalize candidates against known facts`
- `bc70b16 feat: merge comparable action candidates`
- `f328f41 feat: adapt typed engine actions`
- `a15f2ae feat: bridge legacy discard actions`
- `163ad70 feat: import structured Mortal comparisons`
- `926080a docs: expose structured candidate normalization`

最终审查修正：

- `11a80c4` 包含首轮四项审查修正：结构非法结果、部分事实可证伪、响应自指约束、窗口绑定。
- `782e72b fix: preserve normalization result precedence` 修正结构非法与事实冲突的结果优先级，并补齐审查边界测试和规格。

重要的仓库历史说明：由于同一工作区的 overlay 工作流并发暂存并提交，`11a80c4` 是混合提交，既包含上述 10 个 coach 文件，也包含 `RESOURCES.md` 与 overlay 文件。不要为“拆干净”而重写共享历史；按文件和后续提交理解即可。

## 5. 最终验证证据

2026-08-01 在 `782e72b` 提交前完成：

- `cd coach && npm test`：30 个测试文件，209/209 通过；
- `cd coach && npm run typecheck`：通过；
- `cd coach && npm run test:package-import`：1/1 通过；
- `cd coach && npm audit`：0 vulnerabilities；
- 东一局严格回归：17/17 通过；
- `node --test tests/*.test.mjs`：18/18 通过；
- Slice 2 forbidden scope scan：0 hits；
- `git diff --check`：通过；
- 两轮独立代码审查最终结论：Critical 0，Important 0，ready to commit。

最终优先级回归明确覆盖：一个碰动作同时“牌种结构错误”且“手牌中缺少消费牌”时，结果必须是 `structurally_invalid_action:pon_tile_id_mismatch`，不能依赖事实恰好返回 `consumed_tiles_missing`。

## 6. 当前工作区保护事项

完成本切片时仍存在其他工作流/用户所有的未提交文件：

- `overlay/cv重做.md`（modified）
- `overlay/prompt.md`（untracked）

本切片没有修改或提交它们。后续继续使用路径限定的 `git add -- <files>`，并在每次提交前检查：

```powershell
git diff --cached --name-only
git diff --cached --check
```

不要 reset、checkout 或清理 overlay / `RESOURCES.md` 的历史与工作区状态。

## 7. 下一步

下一工程切片应把现有严格分析的因子管线从旧 `ActionId` 逐步迁移到 `StructuredComparisonSet`，同时保持 legacy bridge 和东一局 6/7 巡回归。建议顺序：

1. 让五轴账本与因子证据以 canonical `actionRef` 为键，而不是仅支持弃牌字符串；
2. 在不改变现有教练输出语义的前提下，让 Mortal 结构化比较进入正式 strict-analysis package；
3. 取得真实且版本固定的 Akagi Native typed 输出后实现其私有 adapter；没有真实 schema 前继续 fail closed；
4. 再接入牌谱会话、中央牌桌控制器和右侧教练对话，使每条用户消息隐式携带当时的局面快照；
5. 完成端到端牌谱导入、模型运行、错误阈值筛选、解释与整盘总结。

目前无需用户选择。下一位开发者可以直接为 Slice 3 写迁移规格与 TDD 计划；真正需要用户参与的下一个节点，应是能用一份真实雀魂南风牌谱跑通端到端后，对教练输出做产品验收，而不是工程参数确认。
