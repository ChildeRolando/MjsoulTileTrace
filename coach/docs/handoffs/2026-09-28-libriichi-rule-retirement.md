# 旧合法动作推导退出清单

本清单记录实际退出的职责；不是全部迁移完成声明。权威为 ADR-0006 和
`docs/plans/2026-09-28-libriichi-legal-action-authority-migration.md`。
旧实现仅保存在 Git 历史，不复制到可运行目录。

## 1. dama 自摸发现器

封存提交：`aa7481313d498525bfd7d2edb7c9ec698e20d686`；以下路径相对仓库根。

| 路径 | Git blob | 退出内容 |
|---|---|---|
| `coach/packages/reasoning/src/replay/dama-tsumo-discovery.ts` | `c531f0fb7958dcc370dfc2b4b5da6799257804c3` | `collectDamaTsumoWindows` 旧实现、`removePhysicalTile`；本地和牌形状预筛、副露手排除、以 helper 等待牌推断自摸资格 |
| `coach/packages/reasoning/tests/dama-tsumo-discovery.test.ts` | `796e095fd76552fdd34d0f5ad16e219586a145e4` | 旧接口专用测试及要求副露/牌形预筛跳过引擎的旧断言 |

原消费者为天凤发现 CLI、雀魂发现 CLI、bounded dama subset CLI。
三者改用同一受管 libriichi 服务；只查询规则，不调用模型评分。
新 `collectDamaTsumoWindows` 自行从 canonical 重放全部 self 边界，查询规则，
在成功结果之后筛选目标分支。失败逐窗分类，后续窗口继续；实际行动只做对应检查。
每个命中保留 ruleResultId，聚合报告保留规则身份和失败类别。

替代 owner：`analysis/libriichi-rule-collection.ts` 及现有注入的 rules port。
保留的公共函数名是语料发现能力，不再承载旧合法性推导；没有 legacy overload。
旧测试由 `packages/reasoning/tests/native-discovery.test.ts` 的行为回归替代：
实际手切/摸切、无自摸候选、错误请求绑定、引擎失败后继续、未知输入、非成和牌形
仍查询、副露自摸与 post-call 分离、立直两个阶段、七对子/国士、缺实际候选拒绝。
这些受控端口测试证明消费契约，不作为原生规则独立正确性的证据。

退出提交：`97e13313f7e1898e2e681b7a947c67d8a898f34f`；下列只读命令可核对：

```
git log --diff-filter=A --format=%H -- coach/docs/handoffs/2026-09-28-libriichi-rule-retirement.md
```

其余 `selfCandidates`、response eligibility、single-candidate proof 等尚未列为退出；
不得由本清单推断它们已经从运行、构建或默认测试移除。

## 2. 旧整局黄金测试与 v1 新包生产

封存基线：`975d329410883c000f0c876576a6249bac8a0588`。
旧 `coach/packages/reasoning/tests/structured-analysis-package-golden.test.ts`
blob 为 `e581789cac7a46bf92ea700bcdcfeb4107d10331`。
其 `wholeGameGolden` 经 partial legacy bridge 执行旧规则；该执行路径已退出默认测试。
原始 c1924 牌谱及 `golden-vertical-slice.test.ts` 教学因素回归保留。

替代为 `coach/scripts/native-whole-game-golden.test.mjs`：完整天凤 XML 经当前 mapper、
全部事件边界规则结果、完整模型候选评分、真实 helper、full-game、v2 builder/validator、
selector。四个行为回归仍覆盖完整链、缺报告行的完整性失败、重跑与生产版本身份、
真实分歧选择顺序；不将固定同源输出回放称为独立规则 oracle 或当次 CPU 验收。

`buildStructuredAnalysisPackage` 只允许携带 native 规则的 v2 新包；移除 v1 生产分支。
旧 schema/validator 保留只读兼容。selector/context-graph 的 v1 场景改用固定 JSON，
没有复制可执行旧规则。数据来源、SHA 和采集条件见
`packages/reasoning/tests/fixtures/PACKAGE_FIXTURES.md`。

退出提交为包含本节和 builder 变更的提交（避免自引用 SHA）；可通过
`git log --diff-filter=D --format=%H -- coach/packages/reasoning/tests/structured-analysis-package-golden.test.ts`
核对。full-game 的旧回退分支仍待删除，不因包生产口收紧而算全部退出。
