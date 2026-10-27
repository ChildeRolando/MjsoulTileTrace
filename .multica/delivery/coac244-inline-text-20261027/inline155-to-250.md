本次仅增量集成新真实passed的79-cn-chapter-155-4/cv1751265，不等待Ticket两章或整书。主票用户触发01a17e4c-8ec2-73f3-8c59-92bb3f8910db授权；当前227/256原章、259/303原单元及235展示单元（已含205）都保留，选择v18为上一已确认版。若实时状态更新，以实际已验选择为准。先核现有250 run/wakeup和唯一写者锁，不重复consumer，不删锁。

完整交接 E:/AgentData/Coach/knowledge/processing/integration/coac244-reviewed-inline155-20261027.json，SHA256=d22e3fbf5487b54081d65e964996f8ed7706b8c3aa9259ce6c8d5240e5899f04。唯一候选 web-production/v1/candidates/79-bilibili-cn/cv1751265.coac244inline20261027.display.json，文件SHA54aa5eea94a36252b4b255153a901aef76300c34b398587c2b89ccca630af0db；源aee2ec6c75983ee81447d08298a1fb1dd6cbd9e3ddd4753b0f6894223a630b22；独审audit/web/articles/79-bilibili-cn/cv1751265.54aa5eea94a36252b4b255153a901aef76300c34b398587c2b89ccca630af0db.json，SHAeca2eb38636be8b3fa1d82703bbe01b22a0c065163dfc7f68d15405838e03359。新独审call465f3d13-e7ff-4ca1-8f62-3b93c441f44e，passed/无issues。

本次修复的是旧中文来源figure-only/verbatim入口兼容，不是放宽源或质量门禁。源/父/原raw完全未改，仅b0008日文引语翻为“没关系，没问题！”，其它正文及全部10图语义字段原样继承。真实制作call676d346d-772e-4662-8fa9-02b236073167输出额外**被白名单拒绝，随后只为该call和原raw58e78682增加确定性重复strong格式解析；原raw/ledger摘要未变，新增制作0。候选provenance.outputNormalization有精确派生证明，完整由冻结v2验证器独立重算。累计155恰1制作+1首审，总2次，0模型重试，不能称重新制作。独审方法是新目标文字审查+未改范围真实完整父审继承，不声称本次新审图。

必须使用冻结审校验证器 E:/AgentData/Coach/knowledge/processing/audit/runtimes/coac244-inline-japanese-v2-20261027/textbook-audit-web.mjs 的 verifyAuditForWebCandidate。先重算交接包runtime全部15文件摘要。旧验证器不识别这个显式inline计划，不能绕旧门禁或直接套旧收据。

展示时必须保留译句强标记及源文其它强调，不可直接对原日文sourceSegments按新中文位置切片（会丢强调）。已经提供确定性展示适配：读取 web-production/v1/runs/coac244-inline-japanese-20261027/display-stage-manifest.json；该manifest绑定原stage SHA、未覆盖原文件的新影子stager及inline-display helper。新stager仍调用真正verify gate、同字节源核验，唯一区别是在已验证inline span内派生displaySegments，原候选/sourceSegments不改，文本逐字符等于新候选，marks/href逐段保留。对155/162/234的零调用展示回归均通过，155实际译句strong已验。

将manifest.module.path指定的新stageWebTextbook与上述verify一起用于本次暂存；不修改共享原stage文件。把display manifest/源段派生证明纳入本次入库回执与注记。源正文32贡献块（22文本+10图）、10次图片出现都须整章对照；发布压缩后的块数以实际为准。真实MCP分页读全、图字节、译句及强调、Arena全文与引用核验后才提升覆盖；新preview保留原235展示单元/已接受选择逐对象一致，原v18回滚档保留，正式active不切。

后续Ticket只处理162/234各最多1制作+1首审；若其新SHA真pass，沿同一冻结v2/限定displaySegments链逐章增量接入。当前不要把未收到pass的162/234提前入库；182 uncertain、157图争议与276不派，205已通过不重审。集成新增模型预算0，不改provider/模型/门禁，不重新全书审校。完成在250回一条实际覆盖和回读结果，保持主书未完。
