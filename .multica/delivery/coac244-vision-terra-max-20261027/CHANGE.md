用户授权：主票触发01a17e76-a0e3-7cdc-a555-5f856576e671，仅教材实际含图请求切gpt-6.1-terra/max，纯文字批保持sol/high。

新运行目录：`audit/runtimes/coac244-vision-terra-max-v1-20261027`。独立于所有旧snapshot；manifest SHA256 `12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6`。27文件逐字节核验，原B文字inline-v2的15依赖均未变。

实际变更：

- `textbook-production-cli.mjs`：按images.length选择实际CLI参数；含图强制terra/max，无图sol/high。模型与effort组合不支持则报错，无模型回落；原STOP/工具能力限制保留。返回requestExecution完整argv、图片顺序/SHA/字节及证据边界。
- `textbook-production-web.mjs`、`textbook-production-web-dictionary.mjs`：真实call和候选provenance取实际requestExecution，不沿用旧标签；原始raw完整保留请求证据。
- `textbook-audit-web.mjs`、`textbook-audit.mjs`、`textbook-audit-tile-dictionary.mjs`、`textbook-audit-legacy.mjs`：真实独审记录实际请求模型/effort。验证旧sol/high历史链不改证据，terra/max记录必须具备有序图片和参数证明；其它source/parent/raw/质量验证条件保留。
- `textbook-audit-web-batches.mjs`：兼容上述真实生产模型记录，保留每组完整性及ledger去重绑定。
- `textbook-production.mjs`：新PDF生产使用terra/max；新run需显式--model gpt-6.1-terra、独立--run-id和--attempts 1，不在旧PDF manifest上恢复为新配置。PDF制作/审核的repo数据路径固定到原仓库，native/范围/布局等原模块全部按依赖manifest继承。
- 其它快照文件为原依赖的未改副本。旧快照、raw、manifest、provider/凭据/网关及Multica主控配置均未改。

验证：13项纯mock CLI参数/图片顺序/非法组合/STOP检查，41项原网页与图片绑定语义门禁回归通过。157原候选及新r1的真实生产/父审/10幅原图与补充图链均由新验证器零模型验证通过。测试没有收费模型调用。

激活：唯一阶段交接`audit/vision-runtime-current.json`及A/B/249/主票description前缀。不是修改共享旧脚本令历史快照摘要失效。首个真实教材验活由249消费157已有首次独审额度1，失败/void照计、0重试；276制作等待新入口。B162/234沿原纯文字入口。

证据边界：本机模型目录列出terra支持image/max；真实CLI argv和图片文件证明客户端要求及输入绑定，thread/终态/usage证明返回的会话及调用结果。若响应不暴露模型/effort，记unknown；它们不能证明网关后方的模型权重。

该工作交付冻结脚本与执行证据，未修改产品代码，不新增PR。正式active不切。
