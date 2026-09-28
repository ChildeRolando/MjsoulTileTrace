# 分析包回归输入

## native-daiminkan-golden.json

路径：`local-mortal/native-daiminkan-golden.json`。
SHA-256：`586dc12abb7cde9b8b81a7b44be25ba238fa25b5005478fa854fa1d8f0b6d453`。

2026-09-28 在 `f5be17f5d75991455d0d2689b05ddfdf5c22324b` 的开发工作树上重新运行已有
native 与 `mortal-582500` CPU 权重采集；修改为 R16 终局缺宝牌证据修复，采集时
dirty=true。Tenhou mapper 为 v3，保留 DORA 发布时间，并核验终局未揭示的杠。
没有下载资产；网络开启，无隔离声明；不是最终提交全语料验收回执。
原生版本、补丁 SHA、模型身份、源 XML SHA、采集时间均保存在文件 provenance/identity。

源为既有 `tenhou-daiminkan-2026080803.xml`、actor 1。65 个规则边界中 22 个为有选择
的决策，43 个为非行动；全部 22 个完成 CPU 评分。只保存 canonical 与原始规则/评分
响应，不保存已算好的教学因素作为测试答案。测试重新映射 XML、校验源哈希、重建每份
请求并核对响应绑定，再运行真实 packaged helper 和下游完整管线。默认测试无需模型
权重/native 资产或网络；它检验消费者与身份传递，不提供独立麻将规则正确性证明。

本次真实采集脚本和日志在源码外 `LOCALAPPDATA/RiichiCoach/spike-runs/r16-terminal-dora-20260928/`
的 `capture-native-golden-v3.mjs`、`native-golden-v3-capture.log`。
上次 v2 SHA `af0d71384d148b6748ca53903cba8456a71652fa7d378be4ecf82ad0714c535d`
保存在 Git 历史和本目录 `native-daiminkan-golden-before.json`；原采集记录仍在
`dora-timing-20260928/`。
旧 SHA `190ee80a957863ac2ccbc4875a5467179b2e284406d7e03bb1e9df4d576f59f3` 的样本
保存在 Git 历史和 `dora-timing-20260928/native-daiminkan-golden-before.json`；旧采集脚本/日志仍在
`libriichi-migration-dafb76f/`，没有覆盖历史回执。

## legacy-package-ready.json / legacy-package-missing.json

这两份是旧 v1 producer 的固定**数据**，用于只读兼容及派生 selector/context-graph 场景：

| 文件 | SHA-256 |
|---|---|
| `legacy-package-ready.json` | `3a14fc7d63a2530260f5654d9cc3b6e065b8f2db06c73a4904a559ae0e97f7d6` |
| `legacy-package-missing.json` | `8adf062f7160a09acb1a7409a070bbe99c1c707053b82361d1988d45b7fa3949` |

生成时通过 `git show 975d329...` 读取原 `structured-review.ts`（blob
`339e60f77ffbad68be2cd375c1ea945e6e6ea05b`）及其 canonical fixture，使用该提交的
已构建旧 full-game/builder，分别输入固定两项报告和空报告，再执行生产 validator。
它们是合成协议夹具，不是实战牌谱或 native 来源。没有将 v2 包抹去来源伪装成旧包。
采集脚本 `capture-legacy-package-fixture.mjs` 留在上述源码外目录；默认测试只读 JSON，
不携带或执行旧合法动作算法。新的生产包只走 v2，见 `structured-review.ts` 和原生黄金测试。
