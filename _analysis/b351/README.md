本阶段顺序完成 283、201、109 的真实限定合库，零新增模型、制作、独审和识字调用。当前 v35；保留 v34 回滚选择。正式 active 未切换，其它 hold 和原有 255 个展示单元逐对象不变。

原章覆盖 248/256，原单元 280/303；剩余 8 章、23 原单元，主书未完成。当前展示库为 250 章、258 单元、7585 块、5893 图。`final.json` 是完整结果，`readback.json` 是实际 stdio MCP 分页/逐图及 Arena 验证，`package.json` 绑定三个可解压预览包及来源。

283 仅接受 ff3b1f36… 的限定作者论证呈现。1195 个来源贡献块逐一覆盖，524 个原候选 figure、六表、Q8、batch010 与完整顺序保留；另展示一张明确标记为来源补充的 Q8 原 JPEG。Q48 图前实际显示四条非原文编者限制，全部 figure sourceNotes、Q8 图源冲突和未明项亦实际展示。原 b0785 targetPassed=false、uncertain、旧审/raw 均未改，不宣称普通整章模型 passed。有效原问题账为 16 项既有独审补证、1 项有限未知在本次限制呈现后接受、2 条 source-note。

201 原 SHA de5da828…、109 原 SHA 3cfe3a27… 分别在本章专用精确合同和原父审/生产/独立靶审链下准入。201 的 7 个来源块、1 图和 5 条限制，以及 109 的 17 个来源块、7 图和 6 条限制，均完整 MCP/Arena 读回。109 repairPassed=true 与 limitedUnknownOkay=false 分开保留，未知牌未补。非原文说明没有写入作者正文。

`admit.mjs` / `stage.mjs` / `stage-base.mjs` / `builder.mjs` 只路由三个精确 SHA，不改变共享全库 gate，也不借用其它章节合同。`manifest.json`、`binding.json` 与 `additions.json` 绑定持久重建依赖；`tests.json` 记录本次 21 项拒绝检查及 3 个实际持久路由检查。上游 283 的 23 项反向检查属于原包证据，已核哈希，本阶段没有声称重新执行其模型审核。

283 多原图呈现复用冻结的原 PNG renderer；完整转录/顺序/figure 对象与已审来源逐字段核对，原生 presentation verifier 核全部像素。Q8 JPEG 原字节与 SHA 保留，展示 PNG 是既有 Pillow 路径的无损 RGBA 解码衍生，源 JPEG、衍生 PNG 和像素一致证据分列，不冒充源 PNG。

`archive.json` 的 e000 等短名文件保留原始路径/SHA 与原字节。201/109 原 scope 引用中，仅已删除私有工作树中的 preview/register 观测快照无法读回；它们是历史 live 状态观察，不是语义、生产或模型输入依赖。精确原引用保留于各 owner 合同，未猜造快照；全部实际候选、源、父审、生产、raw、冻结运行时与实际请求链已验真。

执行记录保留两处已修复的本地验证问题：第一次反向测试对巨大对象做 deep diff 导致内存膨胀，已仅停止自己启动的测试 PID，改为严格 JSON SHA 比较后在 1536MB 上限内全过；首次自定义图回读只识别独立 figure 节点、漏识编译后的 inline figureId，改为同时覆盖两种真实结构后全图读回通过。标准全库 MCP/Arena/来源去重在此前已经通过。未删除锁、未强清工作树、未重复模型或重建已完成的全库；`publish.mjs` 复用已有完整读回产物才提升指针。

剩余原章：79 的 167-4、234-12、311-18；nemata 的 193-1、213-1、224-1、232-1、250-1。各现有 owner 的具体后续仍在 `final.json`，本阶段未新增授权或消费者。
