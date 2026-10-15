# COAC-224 小批量验收

结论：T5 本机验收通过，支持 PR #62 合并后关闭 COAC-224。实现、验证与代码审核均在 Codex 完成；无新增 Multica 流程工单，无 Controller 接力。GitHub 合并与工单终态以平台回读为准。

## 范围

沿用 Arena CLI、desktop runner/MCP/RAG 与 archive owner；仅补知识描述、固定独立牌局数据源和验收展示分类。无新队列、服务或架构抽象，不改生产 Coach 生成、保存与重开语义。

## 不变量与回归

- 模型输入无 Mortal 标签/Q、未来动作、原记录身份；沿用 case/scorer/runner 隔离测试。
- 完整牌局按源哈希分组、不同分组不重叠；dataset/manifest 测试验证来源和完整结尾。
- 输出失败、预算、工具故障与旧归档继续保留，离线 inspect 不调用模型；archive/provider 测试及真实故障演示验证。
- 知识来源使用原课程摘要，不含验收案例答案；RAG hit/off/引用测试验证。
- 包依赖/生产隔离以现有 check-architecture、全量测试及类型/构建为准。

## 冻结版本与来源

五组实际运行均绑定干净提交 `85b9cf790cf017cc4dc2b9ec9e7a0cc5621e775a`。最后的验收报告提交仅修改文档；代码与该冻结版本相同。

- 开发集：原完整牌局，源哈希 `sha256:fe547cc2b42f0ea83230feaa0fbbdf9bab7281838a66f051cb7a8609687e1c33`。
- 验收集：新增脱敏完整 11 局牌谱，源哈希 `sha256:4df4cb710b32c4327efab6171826f2ef74a8805ac40a13e3238024d85590e968`。选择在查看标签及模型结果前冻结；选择依据、原缓存哈希和独立性限制见 `packages/mahjong-soul-source/tests/fixtures/arena-holdout-selection.json`。没有按匹配结果换题或重跑。
- 每个 Off/Local 对的案例、模型、预算与 Mortal 身份一致。开发案例 digest 为 `cb38694fab4191f9d40b8174148852aebff268c377991fc14ff85caca8d8192a`；验收案例 digest 为 `c1bfcd4774fd88d9f783b8a762b70d1675686470c138b4044f5de1e14288f280`。
- Mortal V4 revision `0cff2b52982be5b1163aa9a62fb01f03ce91e0d2`，checkpoint `Yuchen1457/mortal-582500` / `mortal-hpc@582500`，checkpoint revision `7386c9f5c751a3ea75efea99737cef5a5ef950f1`；配置 SHA-256 `1c4d2711033cbc897602655907548ba47876b356723a52efc7ab05a30f6a35df`。完整二进制、模型、规则身份保存在每组 manifest。
- 方法 `blind-discard-arena-method/v2`、协议 `arena-function-call/v1`、知识语料 `blind-discard-arena-seeds/v1`、检索器 `arena-local-terms/v1`。无案例答案写入知识库；模型自主决定是否检索。

## 实际运行结果

保持同一代码提交，模型 gpt-6-luna/high；max-provider-turns=6、max-tool-calls=4、max-provider-output-tokens=8192、max-run-ms=300000、token-warning-threshold=100000000。

| 组别 | 执行成功 | Mortal 一选匹配 / 成功案例 | helper 成功 / 调用 | RAG 命中 / 查询 | 整轮模型 tokens | 其中缓存输入 | 逐题耗时合计 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 开发 Off | 3/3 | 3/3 | 3/3 | 0/1（disabled） | 187,530 | 50,432 | 159.804s |
| 开发 Local | 3/3 | 3/3 | 3/3 | 1/1 | 186,792 | 49,408 | 165.257s |
| 开发受控故障 Local | 1/1 | 1/1 | 0/1（注入超时） | 1/1 | 65,072 | 15,104 | 61.134s |
| 独立牌局 Off | 3/3 | 1/3 | 3/3 | 0/2（disabled） | 315,217 | 158,464 | 196.370s |
| 独立牌局 Local | 3/3 | 1/3 | 3/4 | 1/1 | 262,440 | 93,952 | 181.337s |

五组共 13 次案例执行、33 轮模型调用、20 次工具调用；已报告总用量 1,017,051 tokens，其中缓存输入 367,360 tokens（输入子集，不重复相加）。五组均报告用量；工作区历史未知用量继续显示未知，不能把本次总量当作整个工作区总量。Arena 请求／响应 bytes 与模型 tokens 分开保存和展示。

所有案例终态为 completed；非法提交、缺提交、provider 不可用/错误、整题超时、取消、终态工具失败、预算停止、标签不可用/绑定失败均为 0。**这不表示工具调用没有失败**：受控组有一次 helper 超时；验收 Local 第 2 题额外查询拼错了两个 actionRef，被拒绝为 `tool_failed`，模型随后引用已成功获得的事实和知识完成提交。两个失败事件保留，不补造工具结果、不重试整题。

开发三题每组输入 125 个决策、纳入 3、排除 122：候选不足 9、含非弃牌动作 6、题量限制 107。受控组同一开发牌局纳入 1、排除 124，题量限制为 109。独立牌局每组输入 145、纳入 3、排除 142：候选不足 7、含非弃牌动作 3、题量限制 132；其他排除原因均为 0。全部纳入分母与成功案例分母都留在 summary；此次每组均完成，二者数值相同。

| 组别 | 完整运行编号 |
|---|---|
| 开发 Off | `f1bfa967-84d0-47e4-b21d-5ca7cd51adb8` |
| 开发 Local | `701ff92f-65ab-42fd-bb04-bcf78b752132` |
| 开发受控故障 | `ba244191-1a35-472d-b90e-7d8cdb19d65e` |
| 独立牌局 Off | `15089d9b-3ba8-4e32-80f1-647d35cb3ba6` |
| 独立牌局 Local | `2c519d87-7dfc-4dd1-a058-b50d6b8429a9` |

所有运行保存 manifest/events/summary、case-trace、Mortal 评分，位于 `coach/reports/blind-discard-arena/<runId>/`。五组均实际执行 `node bin/blind-discard-arena.mjs inspect <runId>` 并复算一致，不初始化模型或工具；复查前后 summary 字节哈希不变。另有 15 份旧完整归档同样通过离线复算与不改写检查。五组实时 trace 与最终 case_run.events 完全一致，13 个案例均有 Mortal 展示评分。完整日志仅留在本机，不提交隐藏推理或凭据。

真实知识链：开发 Local 第 2 题查询“进张计数 有效牌数”，验收 Local 第 2 题查询“进张计数与有效牌”，返回第 1 课“有效牌，不只是‘有几种’”与第 6 课“四连形与中膨形不要早拆”的有位置教学摘要；两个案例的最终提交各实际引用 1 条返回来源。受控组引用 2 条知识来源。重新从初始观察和先前成功工具结果核验全部 **111 个证据/来源引用**，均可追溯；只做机械引用检查，不据此宣称论证正确。

首次 RAG 开发验证：代码 6ed0499，run 29b4c4b3-6cd5-4068-8b35-4e60fe28423c，1/1 成功且匹配；helper 1/1，RAG 1 次查询命中、2 条来源，78,089 已报告 tokens。这是方法开发证据，不能替代冻结版本验收。

## 复现与离线查看

在干净的冻结提交、已有固定 Mortal/helper 环境和本机 Codex 登录下，从 `coach/` 执行：

```powershell
node bin/blind-discard-arena.mjs run --dataset blind-discard-smoke-v1 --max-cases 3 --rag off --provider codex-cli --model gpt-6-luna --reasoning-effort high --max-provider-turns 6 --max-tool-calls 4 --max-provider-output-tokens 8192 --max-run-ms 300000 --token-warning-threshold 100000000
```

开发 Local 将 `--rag off` 改为 `local`；独立牌局两组将 dataset 改为 `blind-discard-holdout-v1`；受控组使用 `blind-discard-dev-v1`、`--max-cases 1 --rag local --fault first-helper-timeout`。配置和案例可复现，模型输出不保证确定性；selectionSeed 为 null。

```powershell
node bin/blind-discard-arena.mjs inspect 2c519d87-7dfc-4dd1-a058-b50d6b8429a9
./bin/arena-console-control.ps1 -Action start -NodePath E:/IDE/NodeJS/node.exe
```

在控制台“统计与结果类型”选择“独立牌局验收”；开发数据不会混入该看板。详情提供案例折叠、Mortal Top 10、公开摘要、工具参数/返回、引用与用量。浏览器已验证独立分类、Off/Local 各 3/3 成功与 1/3 匹配、Local 的一次工具失败、案例评分、模型配置 v2；控制台已用既有 restart 钩子切换新版。页面凭据为本机证据目录中的 `arena-t5-holdout-acceptance-20261016.png`。

## 回归、初始失败与审核

- `npm run typecheck`、`npm run build` 均通过；`node scripts/check-architecture.mjs`：7 packages / 525 files / 2567 imports / 0 violations。生产 Coach provider 分支、保存/重开路径未改变；牌面更新来自本 PR 先前明确授权的 UI 工作。
- `node --test smoke/package-import-smoke.mjs`：2/2；Arena 三个 Node 脚本：11/11；archive focused suite：10/10；RAG/runner focused suites：30/30。
- 首次全量 Vitest（`run --maxWorkers=1 --no-file-parallelism`）不是全绿：222/226 文件通过，2825/2826 测试通过。三个 Arena `.test.mjs` 仅注册 Node 测试，Vitest 报没有测试套件；已按仓库模式兼容两种入口，三文件在 Vitest 与 Node 下分别 11/11 通过。另一处 Electron 首次下载后的 5 秒超时，原文件不改断言、不加时限重跑 **31/31** 通过。保留全量初始日志和定向复查日志，不把初次结果改写为 PASS。
- `node --test scripts/update-mahjong-soul-protocol.test.mjs scripts/mahjong-soul-protocol-compatibility.test.mjs scripts/generate-mahjong-soul-real-fixtures.test.mjs`：36/36。
- 第一次冻结运行入口在未开始模型调用时拒绝脏工作树，原错误回执保留；最终五组在测试完成后的干净 `85b9cf7` 上运行。
- Codex 代码审核覆盖实际 PR 差异、完整牌局分组、选择先于标签、工具/来源绑定、provider 生产隔离、归档及显示口径。发现的测试入口问题已修复；未发现未解决的 P1/P2。工具拒绝模型非法参数属于预期处理，匹配偏低属于如实记录的实验结果，均不伪造为通过内容质量验收。
- 本机证据目录：工作区根目录下 `review-loop-closeout-artifacts/2026-10-15-coac224-codex/`；关键文件为 `t5-frozen-suite-20261016.json`、`t5-acceptance-audit-20261016.json`、`t5-final-vitest-20261016.log`、`t5-renderer-rerun-20261016.log`、`t5-node-protocol-checks-20261016.log`。文档和证据更新完成后按当前 PR head 复用本次验收，经既有 delivery 发布检查、正常合并并回读后关票。

## 边界

独立牌局曾用于生产解析回归，但未用于 Arena 方法调参；仅声明 Arena 分组隔离。验收结果披露后转为回归资料，不继续称未见样本。不设 Mortal 匹配率门槛，不以机械引用校验代替专家正确性审查。
