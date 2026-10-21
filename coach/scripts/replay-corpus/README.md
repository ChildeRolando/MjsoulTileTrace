# 公开牌谱语料工具

替换 `m6a3-scratch-tenhou-collect.mjs` 的一次性队列。Node **24.5+**，在 `coach/`
运行 `npm ci`、`npm run build` 后使用。独立 CLI，不调用 Mortal/LLM，不操作用户复盘库。

## 已核实的来源

核实日期：2026-10-22。来源能力如实区分，不能把“有公开分享页面”当作“有可批量枚举的完整牌谱”。

| 来源 | 获取方式 | 内容/日期/段位 |
|---|---|---|
| [NikkeTryHard 雀魂年度分片](https://huggingface.co/datasets/nikketryhard/tenhou-houou-mjai) | `nikke-majsoul`，完整年度 TAR 分片；内含 Zstd MJAI | 玉间/王座间；日期取自文件名并标为日精度，房间不冒充段位；上游未提供的段位保持未知 |
| 同仓天凤年度分片 | `nikke-tenhou`，完整年度 TAR 分片 | 2009 起的凤南；日期取自官方 ID，精度为小时；原始头含段位时保留 |
| [hhim8826 天凤整库](https://huggingface.co/datasets/hhim8826/tenhou-houou-mjai) | `hhim-tenhou`，完整 Parquet 分片，逐 row group 解码 | 上游删除了原始 ID、段位与日期，不能还原；保留已有原始列 |
| [天凤官方索引](https://tenhou.net/sc/raw/) | 历史年度索引 ZIP，其后 `tenhou-live` 增量；scc/sce/scf，四人东风/半庄 | XML 的原始 `dan` 编码、rating；索引有分钟时优先保存分钟时间 |
| 其他公开镜像/归档 | `manifest` URL 清单或本地目录；XML/MJAI、TAR、TAR.GZ、TAR.ZST、ZIP、Parquet | 统一去重与元数据保存，可从 manifest 传入来源已有元数据 |

雀魂牌谱屋 amae-koromo 是公开对局/段位**索引**，不是完整摸打数据；本轮完整历史
使用上述数据集，不用用户账号补抓。麻雀一番街、天月等没有在本轮核实到可公开枚举的
整库入口；其已公开导出的四人 MJAI 可以通过通用导入接入，尚不宣称有平台专用爬虫。
Tenhou6 JSON、私有登录接口、三麻和视频牌谱识别不属于已实现输入格式。

天凤官方要求单会话，FileIndex 刷新间隔至少 20 分钟、跳过未改变大小的索引。
程序遵守这些限制；429/临时错误停止该会话，任务留待重试，不轮换代理绕过限制。
官网还限制再分发及一般麻将用途；镜像的数据卡没有授予额外数据许可。采集结果只留本地，
代码许可证不代表牌谱授权；实际使用范围以这些上游页面为准。

## 使用

```powershell
# 列出来源（不会下载数据）
npm run corpus -- sources

# 查询完整分片列表，固定上游 commit、大小、校验值
npm run corpus -- plan --sources nikke-majsoul,hhim-tenhou,nikke-tenhou --out E:/AgentData/Coach/plan.json

# 可删选 plan.json 的 jobs，保留想要的完整年份/分片，再启动
npm run corpus -- sync --state-dir E:/AgentData/Coach/public-replays --manifest E:/AgentData/Coach/plan.json --max-gb 10

# 本地文件、目录、压缩包和镜像使用同一个入库入口
npm run corpus -- import --state-dir E:/AgentData/Coach/public-replays --input E:/MyPublicLogs --source my-public-mirror
npm run corpus -- status --state-dir E:/AgentData/Coach/public-replays

# 导出项目既有 canonical 格式（先通过现有重放校验）；另附来源元数据文件
npm run corpus -- export --state-dir E:/AgentData/Coach/public-replays --id rc1_... --seat 0 --out E:/AgentData/Coach/game.json
# --format raw 导出原始 XML/MJAI；--hash 可选指定原始转换版本
```

`--live` 表示已选整包处理完后才补天凤增量；`--max-logs` 默认 1000、`--max-index`
默认 10，下一次执行会继续未下载任务。`--old` 选旧索引。
`plan --tenhou-year 2025` 在整包之后加入官方年度索引 ZIP，配合 `sync --live` 下载其排队牌谱。
原 scratch 命令仍是兼容入口，参数保持可用，但实际走持久化队列。

`--max-gb 10` 是状态目录累计成功接收并保存的数据下载预算，**重启不重新给额度**；
`--max-storage-gb` 默认同为 10 GB，独立约束数据库、WAL 与下载缓存。预算不足以装下
某完整分片时跳过该分片并报告原因；不会将半包标为完成。HTTP 续传需要校验 Range
和对象版本；下载完成核对已知大小与 SHA-256，才允许导入。
SIGINT/SIGTERM 保留已提交批次与 `.part`，重启继续。锁文件只回收已退出进程的锁。
`--max-records N` 可做每分片小规模验证，剩余部分仍为 paused；`--retry-failed` 明确重试失败记录。

预算不包括 HTTP/TLS 协议头及少量分片发现元数据，也不是整机磁盘配额。临时基准测试
目录另行生成，不计入生产 corpus 配额。生成的原始数据、SQLite、分片、plan 和 receipt
都应放在仓库外。

## ID 与元数据

`rc1_<SHA-256>` 是 `replay-content/v1` 的**同盘身份**，不是原始文件校验值：
固定字段顺序编码整盘起手、各轮初始分数、摸打、鸣牌、立直、胜者及宝牌序列。
起手/副露内部排列归一化，赤牌仍区分；整体座位循环旋转统一到首庄，事件顺序仍保留。
不同来源的名字、源编号、日期、段位、JSON 键顺序/排版不进入 ID。
第三方转换器的宝牌发布时间不同、缺失终局附加字段时仍可归为同盘；宝牌自身顺序保留。
历史超北四局按公开 MJAI 的 N 风表示归一化，不扩大 canonical 的可分析规则范围。
因此该 ID 不能当作“所有字段相同”的证明，也不用于覆盖历史分析档案。

原始表示另有完整 SHA-256。`games` 一盘一行，`variants` 留下不同原始表示，
`observations` 留下每个来源的定位和元数据；完全相同的表示只保存一份压缩数据。
发生同盘不同表示时不会覆盖已有事件时序。不存在 LSH 阈值、相似局面误合并或全库两两比对。
身份算法版本保存在库内，不兼容版本拒绝混写；SQLite 主键查重，不将全库 ID 装进内存。

日期为 `{value, precision, sourceField}`，时区仅在来源确定时附带。段位保留原始编码和
体系，不把天凤 7 段与雀魂魂天编号混成同一个数字；房间信息独立保存。来源缺失保留 null。
不同来源的元数据分别保存，冲突可以追溯。

## 转换与质量

入库热路径只做结构解析和内容身份，不在每次导入运行整盘推理。XML 导出复用
`tenhou-source`；MJAI 导出映射到 `CanonicalEventStream`，隐藏他家暗牌、绑定鸣牌/立直/
杠/和牌引用并保存来源顺序。原始 MJAI 可直接导出给使用此格式的研究工具。

公开 MJAI 经常没有完整规则设置、流局原因或听牌者。规则保持 unknown，可用
`export --rules rules.json` 提供**该数据源真实规则**；缺失流局原因/听牌者分别为
`unknown`/`null`，settlement 必须标 partial，不补猜成荒牌、未听牌或完整结算。
旧来源的完整语义不改变。入库成功不等于完整教学分析已通过：canonical 导出还执行
项目现有重放校验；牌张溢出、错误时序及不支持的历史超长规则会明确拒绝，原始记录仍在库内。

## 验证与测量

```powershell
npm run test:corpus
npm run bench:corpus -- E:/PublicData/shard.tar
node scripts/replay-corpus/scale-benchmark.mjs E:/PublicData/shard.parquet E:/AgentData/Coach/evidence
```

28 项专项测试覆盖跨格式/座位去重、赤牌差异、元数据、原始版本、来源合并、归档中断、
损坏记录、限额、Range 被忽略、续传、429/永久错误行为和完整 body 的崩溃恢复。
失败重试覆盖 paused 任务，成功之前保留失败位置；Parquet 64 位元数据按十进制字符串
保存，不损失精度；没有清单大小的续传仍核对 Content-Range 总长度。
缓存复用绑定已验证校验值；同 URL 的新清单版本不匹配时明确报错，不能把旧包当成新包。
实测和完整变更控制记录见 [实施记录](../../docs/plans/2026-10-22-public-replay-corpus.md)。
