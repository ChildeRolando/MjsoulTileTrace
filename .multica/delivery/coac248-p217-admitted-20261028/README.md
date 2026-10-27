217确定性字段装配，模型调用0次。

`page-0217.rev6.json` 是rev5的外部确定性派生稿，不是新模型输出。父稿、原raw、四次历史整页审及三个独立单点/影响证据均保留。实际准入入口仍为 `runtime/textbook-audit-pdf-native-corrections.mjs` 的 `loadNativeInlineCorrection`，仅217转交候选SHA固定的最小分支；原8个页面的准入及数组替换语义不变。旧逐块PDF表示不改标为native-inline。

目标字段仅图中北家第一张转录、两个坐标unknown，以及独立非原文校注。北家第二张9m、全部作者正文、图注、其它字段及顺序保持。校注在218-b3完整论证后映射为独立非原文segment，原source-text段拼接逐字复原；没有冒充218完整页面候选。`assembled-display.json` 是实际生成的该限定展示投影，交接时必须与候选一同消费，不得丢弃校注。

执行（Node，无网络、无模型）：

```powershell
& E:/IDE/NodeJS/node.exe ./verify.mjs E:/AgentData/Coach/knowledge/processing
& E:/IDE/NodeJS/node.exe --test ./correction.test.mjs
```

运行时先验证固定准入文件，再验证候选及29项输入SHA，核原始响应/独审结果一致、完整父审正文覆盖、canonical/ownership、精确字段白名单和218注释锚点。`verify.mjs`另将仅批准的序列化字段修改反向撤销，要求完整文件字节恢复为父稿SHA。无新passed回执；旧审仍为needs-repair。COAC249下一步仅零调用核证据一致性；通过后将限定字段证明与展示投影交250。PDF218–220完整生产/验收、整章覆盖与网页变体仍是各自原有scope，不能凭本包放行整章。西家教学影响已独立验明，不再当作识图待办。
