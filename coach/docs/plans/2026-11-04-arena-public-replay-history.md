# Arena 公开牌谱与可见历史：有界接线

真实公开牌谱研究数据使用独立 `blind-discard-public-replay-v1` / `public_replay_corpus`；不把多局摘要冒充单局 `sourceRecordHash`，也不伪称脱敏 fixture、合成 bank 或封存验收。每批仍最多 128，采用 complete-game development-only；公开批次绑定原样本清单、批次清单和私有来源映射摘要。私有映射绑定每题游戏、源摘要、座位、窗口、源位置、触发引用、候选集合和批内顺序；`verifyArenaPublicReplayPrivateMapping` 验证摘要及与已选题的对应，源内容与跨批隔离由研究 driver 在读取时验证。原有 archive 结构及检查不变；200 题研究由两个 100 题批次及一个全批顺序/预算协调清单组成。

当前局历史仅显式 opt-in；现有 `createArenaBlindObservation` 用 canonical 流重新冻结并验证选定快照，截取局起点之后到决策触发（含触发）的事件。事件引用使用 Arena opaque alias，自己过去摸牌保留牌值，其他家摸牌值为 null；公开弃牌、吃碰杠、宝牌指示和立直有严格事件类型及引用。暗杠沿用 canonical 已公开四牌构成，不表示实物位置。消息组装仅对该 opt-in 投影 ruleSet 和完整历史，旧无历史模式与归档仍保持可读。未知配置维持 unknown；标签/Q/future 等额外字段 schema 拒绝。组合前必须使用可信完整来源和冻结决策，不能单靠任意构造的观察对象证明历史真实。

控制维度：涉及 contracts（严格观察 DTO）、desktop Arena 的观察构造/模块组装/runner 版本和 archive 契约；无新模型通道或规则引擎。INV-001/003/004/005/009 的事实来源、规则身份与标签隔离依旧依赖 canonical 验证、现有原生规则绑定、Arena 投影及独立私有映射，历史字段额外执行 strict schema 与前缀验证。公开批次与 private mapping 的摘要绑定防止意外错配，不是抗恶意来源签名。失败时拒绝组合，保留旧默认。具体测试、原200题对照、模型调用与未完成的真实CLI隔离见研究收据；不会仅凭此文声称通道验收。
