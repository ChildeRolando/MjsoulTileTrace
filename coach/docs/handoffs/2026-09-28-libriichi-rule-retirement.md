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

## 3. 整局及已绑定决策入口的旧回退

封存基线：`518524d17bc3583ab9aba839c38c728aa7c80052`。

| 路径（仓库根目录起） | 基线 blob | 退出部分 |
|---|---|---|
| `coach/packages/reasoning/src/analysis/mortal-full-game-review.ts` | `981b87c3288987c38432fe96dbdd4d9a7b0a5918` | `runMortalFullGameReview` 中可选规则输入、旧 self/response 单候选证明与 ron 资格计算 |
| `coach/packages/reasoning/src/analysis/mortal-review-service.ts` | `f1400c70e47f5a02c3444d28af5bea1675c76f62` | `runBoundMortalDecisionReview` 无规则结果时跳过候选全集验证的分支 |
| `coach/packages/reasoning/tests/mortal-full-game-review.test.ts` | `882dd6d5fb2293558050984c45b825f83a9b800c` | partial legacy bridge 生产路径、`TenpaiPredicateEngine` 驱动的旧单候选算法测试 |

替代入口仍为上述同名生产函数，规则结果改为必需。未提供结果的无类型调用也明确失败。
整局窗口先重新绑定规则结果，再检查实际行动和单候选；helper 不生产该判断。
消费测试使用与报告无关的受控规则答案；历史手牌/评分用于显式合成完整回合，
原始 partial fixture 没有改造或补造来源历史。这些测试不充当原生规则合法性 oracle。

退出提交为包含本节及对应函数变更的提交，可用本节标题和 `git log -S` 定位。
本节只封存上述分支；旧枚举函数本体、导出及其剩余默认测试仍待退出，不能宣称整体完成。

## 4. 枚举、资格预筛及旧实现专用测试

封存基线：`57a41f8cdb25797d1e1ac15833b90374d7624787`。路径相对仓库根。

| 路径 | 基线 blob | 退出内容 |
|---|---|---|
| `coach/packages/reasoning/src/analysis/local-mortal-adapter.ts` | `be500e79ec9d68c3d3a47f55a6b66e975b02ef56` | 整文件；selfCandidates、enumerateSelfDiscards、四种 collectLocalMortal 资格推导、responseCandidates、旧请求/响应转换 |
| `coach/packages/reasoning/src/analysis/single-candidate-proof.ts` | `225188b41aacca752cbbeefbbef69e5294ce9f2d` | 整文件；helper 驱动的 self/response 单候选反证和立直资格枚举 |
| `coach/packages/reasoning/src/analysis/response-candidate-enumeration.ts` | `0eff989dbd9cf3aa3e641b67d832f3dcf3090da0` | 整文件；独立吃碰杠和/pass 枚举与物理消费推导 |
| `coach/packages/reasoning/src/replay/response-eligibility.ts` | `3a7d914dae0e4a75d87867e7fa5a0eaaacf879bb` | 整文件；canChi/canPon/canDaiminkan/canRon/seatDistance |
| `coach/packages/reasoning/src/factors/win-shape.ts` | `ce8b5d944b0049736e606113d37182c53190c996` | 整文件；只供旧资格预筛的和牌形状计算 |
| `coach/packages/reasoning/src/replay/stream-replayer.ts` | `f11e52c84f9d766c35b66594ea73b5b3e60c33db` | responseWindowEligible、replayCanonicalResponseWindows、legacyEligibility 条件及实际行动回填；其余 replay 保留 |
| `coach/packages/reasoning/tests/local-mortal-adapter.test.ts` | `a0bc8564cf7bb08db4f83294bac8d051f8273478` | 整个旧接口测试文件；行为案例迁往下述原生/消费者回归 |
| `coach/packages/reasoning/tests/win-shape.test.ts` | `99572785120b80e55bf72c5549ee4c6406863985` | 旧形状预筛测试；牌型正反例迁往真实 native |
| `coach/packages/reasoning/tests/response-binding.test.ts` | `b6822b47938b19308a0fd99c4fb49d1fdace7855` | 仅旧 response local candidate enumeration describe；身份、覆盖和守恒部分保留 |
| `coach/packages/desktop/tests/electron-persistence-smoke.cjs` | `0ff1abfa30d3dff97f675a26993d957ae2cef176` | realProductionPackage 的 partial legacy bridge 与旧 full-game 调用；持久化/重开断言保留 |

替代关系：

- `scanCanonicalResponseBoundaries` 扫描完整 opponent discard/kakan 边界；
  `response-replay.test.ts` 每例先核对全部事件引用，再检查身份与实际结果。
- 原生 `runtime_rules_native_test.py` 覆盖已立直强制弃牌/合法杠/禁杠、字牌与多分解数牌、
  自摸并存、喰替后能否弃牌、post-call 单/多候选、桌面四杠、海底暗杠/加杠、河底荣和、
  多杠选择、赤牌、九种九牌、临时/立直振听和标准/七对/国士正反例。
- `native-action-regressions.test.ts` 的显式规则答案验证完整集合进入评分、full-game、
  v2 包以及单候选来源；立直暗杠与开放三暗刻均更换实际选择。答案不由旧枚举或报告生成，
  不把该受控端口测试当成独立规则正确性证明。请求绑定、异常输入和错分负例继续由
  `libriichi-rule-projection`、`local-mortal-rule-scoring`、`libriichi-full-game` suites 保护。
- `scripts/fixtures/native-whole-game.mjs` 共享完整真实来源/捕获回答/真实 helper，供黄金
  测试和 Electron 保存重开测试使用；65 边界/22 评分全部保留，不截断 package。
- 架构 R5 防止上述五个整文件原路径或静态导入回流；package-import 拒绝旧 dist 文件
  和公共导出。不会识别任意改名复制，仍须代码审查。dama discovery 同路径保留的是
  第 1 节已迁移的新实现，不属于路径禁用清单。

退出提交为包含本节和上述删除的提交；可由
`git log --diff-filter=D --format=%H -- coach/packages/reasoning/src/analysis/local-mortal-adapter.ts`
精确定位，无自引用 SHA。原 R10–R14 评审和运行回执均保留，不由此清单改写。
