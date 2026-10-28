已实际修复v43派生预览中的长ASCII横线分隔符，预览URL仍为 http://127.0.0.1:8766/knowledge.html 。刷新页面（必要时Ctrl+F5）。正式active、v43指针、语料与正文JSON、源映射、人工标注和全部原始证据不变。

可复用脚本：isolate-ascii-separators.py。运行：

    python isolate-ascii-separators.py <现有预览目录> --report <结果.json>

目录须已有knowledge.html及textbook-bodies.json。核心正则为 `(?<!-)-{64,}(?!-)`，只匹配完整的至少64个连续ASCII减号；不改变横线组长度。阈值来自实际长组分布：84个×766组、79个×5组、69个×1组。较短的3/5/15个横线不处理。

脚本用HTMLParser定位已知作者正文p/h2/list块里的文本节点，并排除非作者校注、源表格、链接、属性、code/pre、图/图注/转录、脚本/样式、URL、代码围栏、行内代码、Markdown表格行和ASCII标识符上下文。不会对整个JSON或HTML做替换。实际命中全部属于541个p正文块、101章，共772组；没有图注或表格命中。

每组在派生HTML中加前后换行并包裹ascii-separator-line，唯一新增CSS为display:block、white-space:pre、max-width:100%、overflow-x:auto。独占行且组内不折断；狭窄屏幕可横向查看，不把减号改成hr或删短。原作者正文数据和来源分段不改。

已从原冻结renderer重建相同HTML，并保留封面来源说明、193跨版本补文、257两个原图链接三个现有hook；重建前HTML SHA与原预览完全一致。处理后只原子更新当前派生knowledge.html。源renderer本身不改，避免使旧冻结审计失效。同一处理命令及其SHA守卫已接入现有integration/build-accepted-preview.mjs的post-build流程，代码部署到integration/coac250-ascii-divider-layout-20261029/isolate-ascii-separators.py。

11项回归通过，覆盖行内、多组、原已独立成行、CRLF/LF、短横线/负号、URL/属性/代码/表格、非作者校注、原标签/强调/实体与幂等。完整HTML不变量核对证明：所有原标签/属性/链接一致，全部非空白内容一致，横线长度和顺序一致。对当前预览第二次实跑命中0处，HTML字节不变；builder的node --check通过。

真实Chromium在以下两段实际测量六组：

- http://127.0.0.1:8766/knowledge.html#79-bilibili-cn-cv1689302-b3
- http://127.0.0.1:8766/knowledge.html#79-bilibili-cn-cv1689331-b3

browser.json记录实际display:block/white-space:pre、每组一个文字矩形，以及横线前后正文各自在上一行/下一行的坐标；两章正常图注存在，实际图片HTTP200。所有受保护正文/语料、选择和正式active文件SHA保持。未运行模型、编校、制作或新的MCP/Arena语义验收；复用未变内容的既有验收。

当前派生HTML SHA：f59bed9ed30b739bf7ea231b1150b177141d1066d2ca7db8b3762dd21b4b165d。
回滚备份、完整应用报告、重建目录和第二次应用记录在共享integration/coac250-ascii-divider-layout-20261029；该HTML备份及教材正文/图片未复制进Git或附件。v43原验收/浏览器历史收据不改，新视觉格式报告单列。
