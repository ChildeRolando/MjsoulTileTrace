本轮新模型/制作/独审/候选0。原222制作失败仍计1次，原候选不动，原剩1次只供独立首审。

原始错误（完整raw和旧失败回执均附）：

```json
{"message":"Invalid schema for response_format 'codex_output_schema'. Please ensure it is a valid JSON Schema.","type":"invalid_request_error","param":"text.format.schema","code":"invalid_json_schema"}
```

这是服务端请求schema拒绝。此前出现routing timeout、HTTPS回落及高负载诊断；终态是turn.failed/exit1，rawLastMessage、parsedOutput、usage均null，没有turn.completed，本地timedOut和outputOverflow均false。因此不是“模型已输出但不符schema”，也不是“完整结果仅被传输截断”；无完整输出可按现有机制恢复。远端请求次数/费用未知，不能因usage=null说免费，失败额度照计。

失败入口为248 commit2606f3e的自定义run.mjs，非标准web producer。它将unknowns/sourceNotes的整个数组作为enum值（包括`enum:[[]]`），并发出minLength/count约束。服务端错误没给具体叶节点，因此没有证实某一个关键字是唯一原因，也不把合法JSON Schema等同服务器支持的子集。官方文档说明Structured Outputs仅支持子集且对象需required全键/additionalProperties:false；本修复使用更保守的线格式。参考：https://developers.openai.com/api/docs/guides/structured-outputs

实际修复在新冻结快照 `coac244-vision-production-schema-v2-20261028`，原27文件快照12a058d4不改：

- production-schema.mjs：仅对象/数组/字符串、required全键、禁止额外字段、标量字符串enum；不发数组值enum、字符串长度/数组数目约束。对应语义约束仍在本地严格执行，没删内容门禁。
- run222-fixed.mjs：修真实222 schema构造，保留原来源/父审/raw/像素验证；仅容许两处2m→1m，kind/caption/unknowns/sourceNotes逐字段完全相等，正文和其他九图保持。写候选前拒绝越界。新run目录r3保留旧r2失败，联合排除账含b702fbf7失败。
- textbook-production-web.mjs：标准web figure-target/纯文复用同一保守schema和本地覆盖/非空/结构校验，既有source/parent/原raw/独审契约不变。纯文字构造测试不替换183/236已冻结exact-v2请求契约。
- textbook-production-cli.mjs：抽取prepareTextbookCliRequest，真实invoke与离线测试共用同一argv/stdin/output.schema.json和图片SHA构造。含图仍gpt-6.1-terra/max，纯文仍gpt-6.1-sol/high；不改provider、凭据、网关或主控配置。

25个具名检查在verification.json，三份*-real-request-construction.json附真实构造的schema文件、stdin、argv、图片路径与SHA。真正222修订入口preflight也已零调用通过原父/独审/像素/联合排除/槽检查。回归包含：固定数组/图注/其他牌变化、目标ID错误、额外图、中文重写、缺字段均拒绝；纯文缺目标/空文本/错ID拒绝；terra/max和sol/high分流、禁止非法model/effort回退；原错误由旧parser维持失败，不新写ledger。正例仅合成校验输入，不保存为模型候选。

证据边界：这里只完成离线真实请求构造和门禁测试，未新调远端；不能宣称修复后制作已被服务端接受，更不能用157含图独审首件代替制作首件。下一次有预算的真实222制作才是制作验活，计入该批，不额外跑收费测试。

预算：需明确追加1maker，原余1首次独审保留；未来最多2次、本阶段累计最多3次，失败void计、0自动重试。不调用、不自动循环，不把剩余独审改作制作。若制作成功，逐新SHA独审后再交250；失败完整留raw报真实分类，不能重复无限生成。
