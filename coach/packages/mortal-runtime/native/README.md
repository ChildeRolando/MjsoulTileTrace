# libriichi 规则配置兼容补丁

上游：Equim-chan/Mortal，固定提交
`0cff2b52982be5b1163aa9a62fb01f03ce91e0d2`，AGPL-3.0-or-later。
`coach-rule-config.patch` 是该源码的衍生修改；原仓库许可和署名继续适用。
发行前的源码提供、NOTICE 和模型再分发检查仍按 VERIFICATION 执行。

目的：复用同一个 libriichi 规则实现，同时让原产品已支持的规则配置可以显式传入。
补丁只做以下扩展：

- 在原生役判定中配置食断；沿用原有全部分解搜索，不另写役/牌形算法。
- 在原生重放中配置暗杠是否取消一发。
- 杠动作序列化读取实际赤牌和已有碰牌，避免无赤规则凭空输出赤五。
- PlayerState 与 Bot 暴露同一个 `configure_rules` 入口。

规则查询与 Bot 格式转换使用相同配置；不运行神经网络。
食断/一发配置 unknown 时，只有全部可能配置产生完全相同的原生结果才返回成功，
否则返回 `rules_input_incomplete`；不取候选交集。赤牌数量 unknown 当前明确失败。
这是一条新的规则操作；迁移完成前旧生产消费者仍存在，不能据此宣布重构完成。

## 构建与验证

从 coach/ 运行 `node scripts/build-libriichi-rule-native.mjs`。
脚本从本机已有的固定 Git 对象创建新源码目录，应用本补丁，使用 Cargo 离线缓存构建。
不会改写上游 checkout、旧 `.pyd`、历史回执或下载模型权重。输出目录在
`RIICHI_LOCAL_MORTAL_ROOT`（默认 LOCALAPPDATA/RiichiCoach/local-mortal-spike）下。
回执绑定上游提交、补丁哈希、源码归档哈希与新 native 哈希。

将输出 `receipt.json` 的绝对路径设为 `RIICHI_LIBRIICHI_NATIVE_RECEIPT`，然后运行
`node scripts/libriichi-rules-probe.mjs`。这会核验新资产并以不存在的模型/权重路径
执行真实规则查询；结果写入源码目录之外的新证据目录。

完整原生边界回归：将新 `.pyd` 的绝对路径设为 `COACH_LIBRIICHI_NATIVE_MODULE`，
使用已有 spike Python 运行 `packages/mortal-runtime/tests/runtime_rules_native_test.py`。
这是原生能力验证，不替代生产 full-game/package 回归或最终提交的 CPU spike。
