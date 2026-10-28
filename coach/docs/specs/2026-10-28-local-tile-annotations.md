# 本机牌面人工标注（COAC-270）

本工具把教材加工过程中尚未确定的可见牌面、牌序与方位交给人工确认。它是独立编校辅助页，
不进入 Electron 牌谱分析、模型制作或正式教材准入路径。无新依赖、模型调用或外部网络请求。
界面使用中文，桌面两列、窄屏上下排列，原图与像素放大图同时保留；机器候选默认折叠。

## 输入与身份

`scripts/tile-annotations/build-queue.mjs` 只读 processing 的当前 accepted preview、web/PDF
selection、unified/continuation/closure register、对应候选、源映射、独审及已有 raw。
已覆盖章消费实际已准入的新候选，不重挂旧父稿错误；283 消费 effective issue register
与精确靶点继承记录。翻译、统计曲线、作者姓名、未展示的隐手等不进入队列。

源 asset 必须与图块/occurrence、SHA 对应；同一 SHA + 源块 + 局部未知靶点去重。
多源块组成的 PDF 场景使用已有完整区域图，并保留原图块 SHA 列表；不临时制作图片。
已有的原嵌图像素坐标才画框，PDF 区域坐标另外显示；没有单牌坐标仅给文字定位。
缺失文件保留身份并允许人工记录“原图缺失”。SHA 不一致直接拒绝加载和普通标注保存。
队列为生成时快照，更新源材料后显式重建并重启；旧队列按 SHA 留存于 `queues/`。

## 输出与写边界

服务固定绑定 `127.0.0.1`。固定路由映射，不接受文件路径参数；解析实际路径以拒绝
目录穿越、符号链接/junction 越界。Host/Origin 校验和每次启动随机写令牌限制跨站请求。
仅 `human-annotations/events.jsonl` 追加人工结果，写后 fsync，确认成功才显示已保存。
有效输入自动保存，非法牌码显示错误且不写入；1–9 m/p/s、1–7 z、中文字牌以及显式
赤五（0m/0p/0s 或 赤5m/赤5p/赤5s）转为明确码，不自动拆分压缩牌序或猜牌。

事件包含 target ID、图 SHA、原图块 SHA、canonical、位置、时间、递增 revision、结果及
queue SHA。修改、跳过、看不清、原图缺失与撤回均追加历史，不删除旧值。每数据目录
单写者锁、revision 检查拒绝双服务及陈旧页面覆盖；历史损坏拒绝启动并保留文件供恢复。
浏览器仅记上次位置，人工结果始终在文件中；`/api/export` 导出队列和完整历史。

不写候选正文、raw、旧 uncertain/独审、accepted register 或 active，不持有制作/审校 guard。
人工结果不构成整章 passed 或独立审校 PASS。

## 编校读取接口

```js
import { readJson, readAnnotations } from './scripts/tile-annotations/server.mjs';
const queue = readJson(queuePath);
const { annotations, events } = readAnnotations(dataDir, queue);
// annotations[id] 为该靶点最后一条、ID/图SHA/靶点/canonical均匹配的事件。
// 只把 result.status === 'answered' 的 result.tiles / orientation 作为人工输入。
// withdrawn、skipped、unclear、missing 都不是已确定牌码；保留 events 作为来源。
// 消费者还须核对现有源SHA、人工位置与自身靶点，再走原有修订和独审流程。
```

此接口只读取，不执行返修。队列变更后可用事件的 queue SHA 查 `queues/<sha>.json`
解释原标注，不能把旧源图结果直接绑定到新图片。

## 运行与验证

从 coach 目录：

```powershell
node scripts/tile-annotations/build-queue.mjs
node scripts/tile-annotations/server.mjs
node --test scripts/tile-annotations/annotations.test.mjs scripts/tile-annotations/build-queue.test.mjs
```

默认 processing：`E:/AgentData/Coach/knowledge/processing`；独立数据：
`E:/AgentData/Coach/knowledge/human-annotations`；URL：`http://127.0.0.1:8765/`。
server 支持 `--root --queue --data --port`，不提供公网 host 参数。
Windows 短路径交付把此脚本目录复制到 `E:/CoachLabel`，双击 `start.cmd`（或
`& E:/CoachLabel/start.cmd`）可在后台启动并验证就绪；`stop.ps1` 校验 PID 对应本目录
node 脚本后停止。PID、stdout/stderr 位于同目录 `server.pid/server.log/server.err.log`。
没有 supervisor，常驻为 best-effort；系统重启后重新运行启动入口，文件数据继续保留。

浏览器回归使用本机已有 Playwright/浏览器，不安装依赖：设置 `COACH_PLAYWRIGHT_MODULE`
为其 `index.mjs` 路径、`COACH_BROWSER` 为浏览器 exe，再执行
`node scripts/tile-annotations/browser-check.mjs`。测试仅写独立临时目录，结束删除，
不写真实用户记录。覆盖自动保存、非法码拒绝、刷新、修改、撤回、导出、网络失败、
快捷键、待办筛选及 1440/800/390 窗宽。

当前本机自验队列 54 项（26 阻塞、28 非阻塞）；图片可用性与绑定以交付时实际 HTTP
逐项核验为准。该数量是队列靶点数，不是完整教材章数或已完成人工标注数。
