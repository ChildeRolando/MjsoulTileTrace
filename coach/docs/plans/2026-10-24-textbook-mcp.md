# 四章教材的 MCP 检索工具

用户已确认文本提取基本无问题，要求把这四章加工成 Coach/Arena 可调用的教材检索工具。
本次实现独立只读 MCP 服务、可装配的 Arena 适配器，以及本机实际教材验证。不运行模型实验、
自动标注或 Mortal，不改变生产 Coach 默认工具配置。

## 现在可以做什么

|操作|输入|返回|
|---|---|---|
|`search_textbook`|中文问题、可选章节 ID、最多 5 条结果|定位预览、命中段落 ID、完整论证单元 ID 和实际章节目录；空问题可浏览|
|`read_textbook`|论证单元 ID|完整中文论证、条件、例外、牌例引用、来源页、译文状态和前后单元 ID|
|`view_textbook_figure`|登记的图表 ID|MCP 原生 PNG 图片，以及已核对的牌编码/图注/表格转录（若有）|

四章分成 **13 个完整论证单元**，覆盖 **123 个正文块、33 幅图表**。切分位置只保存在索引；
正文不再压缩成卡片，不加入模式触发阈值。五组对子段落跨 PDF 115–116 页的条件、例外和牌例
在同一次读取中完整返回。超出预算时拒绝构建，不截掉条件凑长度。

来源使用当前 `textbook-bodies.json` 及现有 PNG，构建结果覆盖 `textbook-corpus.json`。
源文件身份、正文身份、单元和图像身份均可回查；正文或图片改变后，重新构建再启动服务。
文本提取已获用户认可，教材正确性与新译文仍标为待审，没有把提取认可升级为知识正确性背书。

## 启动与装配

在 `E:\AgentWorkspaces\Coach\mortal-rag-ablation\coach`：

```powershell
npm run build -w @riichi-coach/contracts
npm run build -w @riichi-coach/desktop
npm run textbook:prepare -- E:/AgentData/Coach/knowledge/review
npm run textbook:mcp -- E:/AgentData/Coach/knowledge/review
```

服务通过标准输入输出通信。配置其他 MCP 客户端时使用生成的
`E:\AgentData\Coach\knowledge\review\mcp-config.json`，直接启动 `node` 和服务入口，避免 npm 的
普通输出混入 MCP 通道。没有修改用户全局 MCP 配置，也没有常驻启动后台进程。

Arena 可按每次运行装配：

```js
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TextbookMcpClient } from '@riichi-coach/desktop/textbook-mcp';
import { createArenaTextbookTools } from '@riichi-coach/desktop/arena-textbook-tools';

const client = new TextbookMcpClient();
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [serverPath, libraryDirectory],
  stderr: 'pipe',
}));
const tools = createArenaTextbookTools({
  caseRef: observation.caseRef,
  aliases,
  knowledge: client,
  dispose: () => client.close(),
});
// 将 tools 传给既有 runBlindCoachCase；此示例不创建模型或执行试验。
```

也可通过 `loadTextbookKnowledge(directory).port` 直接本地装配相同查询接口。MCP 与直接本地调用
共用一个正文检索实现，没有第二套匹配逻辑。模型主动决定查询、改写查询及继续读相邻单元，
不会因命中某条场景模式就强制打开某章。

## 牌图与引用的明确边界

原生 MCP 客户端能收到全部 33 幅 PNG。Arena 当前 provider 协议只支持文字，本次没有扩展
模型多模态协议，也没有把 Base64 伪装成正文。Arena 的所有教材结果明确返回
`imageDelivery: not-delivered-text-only`。33 幅图表现在均有完整文字表达：10 个现代麻将牌例
保留已有牌编码，1 张等待表保留文字转录，另外 22 幅图补齐结构化 `diagram`。这 22 幅均由
本次助手逐图查看原图、再对照编码及相邻正文复核，不冒充另行人工专家审核。

`diagram` 分开记录暗手、单独摸牌、吃碰、横置牌位置、宝牌栏和未知暗手张数。7 幅图中背面
朝上的暗手保留为未知；两幅展示可能暗手的图明确标注教材假设，不推定对手实际暗手。宝牌栏
不是宝牌指示牌或手牌；原图重复画出的宝牌图标原样保留并解释，不按重复图标加倍算宝牌。
普通五索中央红色纹样不编码成赤五。牌编码约定：m/p/s/z=万/饼/索/字，1–7z=东南西北白发中，
0=赤五；副露数组与组内编码保持原图顺序，`calledIndex` 是横置牌的零基序号。

转录清单保存在 `scripts/scene-study/textbook-figure-transcriptions.json`，每幅绑定原图 SHA256。
重新提取正文时自动附加；已有正文可运行 `apply-textbook-figure-transcriptions.mjs` 后重新构建索引。
图像身份改变会拒绝套用旧转录。构建检查张数、重复牌上限与吃碰合法性；这些检查辅助发现录入错误，
不能代替视觉核对。Arena 的正文读取和牌图工具均返回完整转录，仍不会声称文字模型看过 PNG。

搜索预览不授予可引用的 `sourceRefs`；读取完整单元后才给本次运行的 opaque 引用。
未转录图片在文字 Arena 单独读取时也不授予图片引用。教材来源只能支持教材主张，不能当作
当前牌局的计算事实，`evidenceRefs` 始终为空。案例身份由宿主绑定，不接受模型传入牌谱或标签。

## 轻量实现与验证

本轮仍用已有中文二字分词/关键词匹配，按命中段落定位父单元，无向量库、Graph、重排模型或
额外模型调用。适配层归一化筒/饼、七对/七对子及数字与汉字边界，不修改教材正文。
首次开发探针中“第10巡”未匹配印刷版的“第 10 巡”；修复查询和正文的等价分词后复核通过。
原 40 卡检索器仅导出已有分词函数，其排序和文本行为保持不变。

同时移除 Arena 提示里写死的 `search_knowledge` 和两类种子知识覆盖范围，改由实际装配工具
及返回目录说明能力；明确搜索预览需展开正文、图像引用不等于已看图片。提示版本更新为
`blind-discard-arena-method/v3`，场景试验提示为 `arena-scene-study/v2`；已结束实验请求与成绩不改写。

验证入口：

```powershell
npm run test:textbook-mcp
node scripts/scene-study/verify-textbook-mcp.mjs E:/AgentData/Coach/knowledge/review
node scripts/scene-study/verify-textbook-diagrams.mjs E:/AgentData/Coach/knowledge/review
```

验证包含严格请求、未知 ID/路径拒绝、图片与正文变更拒绝、跨页完整性、取消、引用权限、
真实 stdio 原图返回、真实 MCP→Arena 搜索/读取/提交链路。Arena 测试用脚本化测试替身，
不调用外部模型。实际教材验证逐项读取所有单元和原图，并保存中文查询示例。
8 条手写开发查询只作检索诊断，不是独立检索质量评测，不报告“有效率 100%”。
本轮模型实验调用和对应 token 消耗均为 0；工具响应记录字节数，不能将字节数冒充 token。
补齐转录后最大正文响应从 4453 增至 5563 字节（约 +24.9%），低于现有 16 KiB 工具预算；
未进行真实模型调用，因此没有实测模型 token 增量。`arena-figure-validation.json` 记录真实
stdio MCP→Arena 适配器逐一读取 33 份转录的结果，无模型调用。

## Change Control Report

- Scope/locality：contracts 增加教材读取 DTO；desktop 内实现正文查询、MCP 传输和既有
  `ArenaRunnerTool` 适配；CLI/离线脚本负责启动、索引构建和实物验证。没有新增包、生产 IPC 或生成入口。
- Invariants：沿用 INV-013 的宿主绑定、来源/事实分离和本次运行引用；原教材只作数据，不提供
  工具权限。固定根目录仅由宿主配置，模型只能传登记 ID；真实路径、文件哈希及预算检查由加载器执行。
- Traceability：来源为用户本机四章正文和 33 幅图；每个引用绑定 corpusId/正文身份/单元及页码。
  读取接口不接收牌谱、实际动作、Mortal 标签或隐藏信息。测试和实际档案验证这些边界。
- Replaceability：`TextbookKnowledgePort` 是相同搜索/完整读取/牌图元信息的本地与 MCP 接口。
  不能塞进旧 `ArenaRagRetriever` 的 1000 字卡片返回契约，否则会裁断论证且失去图像读取能力；
  此接口仅隔离教材查询与传输，不扩展成通用检索框架，仍由 desktop 现有工具边界拥有。
- Recoverability：源文/图片变更、越界路径、失配 ID、过长单元在构建或加载时失败；保留完整正文，
  重新构建后重启。没有写教材的 MCP 工具，无远端服务依赖。
- Verification：最终实测结果见当前教材目录的 `mcp-validation.json`、`mcp-build.json` 和交付记录。
  初次 MCP 交付的 144 项回归全部通过。本次转录追加验证见 `mcp-delivery.json`；
  实际 13 单元正文、33 幅 PNG 和 33 份 Arena 文字牌例逐项一致。
  不声称生产已启用或模型效果已验证。
