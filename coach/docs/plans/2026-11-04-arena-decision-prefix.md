# Arena 当前局来源前缀（研究入口）

## 范围和责任

`DecisionPrefixEvidence` 是 contracts 所有的来源无关证据：原始来源和规范流摘要、当前局来源与规范前缀摘要、起点和触发引用、有序的来源 ordinal 到不透明 canonical 引用映射、起局点数和供托。它不是签名，也不能抵御恶意来源适配器。

现有 MJAI corpus adapter 复用已有解析和 canonical 映射，核验原始起局四分数和连续源事件后生成证据。当前实现只接受一条原始事件对应一条 canonical 事件的当前局前缀；不满足者拒绝。它不生成合法动作或判断。reasoning 明确以来源适配器为可信边界，校验证据与 canonical 流、事件序列、触发和当前局分数回放一致，并用现有规则事件投影。引用按不透明值比较，reasoning 不解析来源协议位置编码。

该研究入口需显式调用；原全场保守规则投影不变，原 canonical 的 `partial` 不变，来源摘要仅后台保存。全场 metadata 的分数完整性仍保持原值，因此局部证明不能伪装成全场完整。本入口不改变模型提交、候选归一化或评分职责。原始资料缺分、映射不连续或证据不匹配时失败关闭。

## 变更控制

- Locality：contracts 中加入证明，现有 corpus source adapter 生成，reasoning 校验并连接既有规则投影；未新增解析器、规则引擎或模型通道。
- Invariants：INV-003/009 的来源与 canonical 边界保持；INV-004 的决策与规则绑定由现有验证、局部位置/摘要校验及测试保护；原全场门禁未降低。
- Traceability：源摘要、原始与 canonical 当前局摘要、源位置及引用绑定可在私有研究证据回读；适配器是明确的信任根。
- Replaceability：reasoning 只消费 contracts 证据和 canonical 事件，不依赖 corpus 脚本或 MJAI 字符串格式；native 操作仍由既有 runtime 注入。
- Recoverability：来源缺失、非一对一、摘要或重放不一致在规则查询前失败；既有路径可继续使用。
- Semantic load：新增的局部证明用于隔离“当前局已知分数”和“未来全场结算缺失”，现有全场完整性无法安全表达这一独立状态；将证明放来源适配器及现有规则投影是最小归属。
- Verification：具体运行次数、反例和未解决事项以独立研究目录的最终收据为准；不要将文档或静态检查等同真实对照通过。
