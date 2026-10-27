本轮由 COAC-244 短协调派发，B 线（COAC-269 Ticket executor）下一批只有 1 章，已用当前冻结 runtime 的 verifyWebRevisionContent 做过零调用入口核验并通过。这不是放宽入口：多目标文本修订本来就被现有入口支持，直接复用即可。

先读本目录 dispatch-B-coac269.json（章、父候选路径+SHA、父审路径、源 SHA、4 个 textBlockId、suggestedRepair、预算）。要点：

1. 只做 nemata-jp-chapter-089-1 的多文本块修订：textBlockIds 恰好这 4 块（b0042/b0084/b0102/b0153），figureIds 必须为空，body.mode 保持 translated。这 4 块父审都已有 error issue 和 suggestedRepair（把“值得考虑的选择”恢复为原文的“有力选择”），逐块按原文判断力度改，其余文本、75 个 figure、DOM 顺序不变。
2. 预算：本章 1 次制作 + 1 次首次独审；failed/void/传输错误都占次数，不重试、不循环。认领与派发前各重跑一次三源联合排除；active preview pointer 可能因 250 入库而移动，移动后必须按新指针重跑，不得复用旧预检。
3. PR #71 的平台代码评审继续正常进行，但它是否 merge 不是本批前置；不要为此等待、不要改评审结论。仍由你（既有 Ticket executor）修订，不新建 ChatGPTWork/Codex、不克隆角色。
4. 候选就绪后写显式 target 配置并交 COAC-249 独审，同时给 COAC-249 建 --kind at --after 1m --agent-id b144c077-cadd-4749-a53d-4b9cb98191b8 的唤醒；不要自审、不要自己判 passed。
5. 不要改任何质量门禁或 runtime；不碰共享 selection/pointer/register；不新建宽泛豁免。
6. 089-1 交付后可接 dispatch-B-coac269.json 里的 nextInQueue（nemata-jp-chapter-060-1，2 个 textBlockId，同一入口、同样已核 PASS），仍以 2 章为限。
7. 交付注明：章 ID、目标块、实际改动、候选 SHA、实际调用与 tokens/耗时、真实占槽时段、交 249 的路径+SHA。
