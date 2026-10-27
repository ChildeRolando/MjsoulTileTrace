# COAC-244 下一互斥批次：分类 + 入口核验 + 派发

记录时间 2026-10-27T11:35Z 左右；全程零模型调用（modelCalls=0）。

## 事实基线
- 当前 preview：corpusId `5eebf4df…`，214 章 / 222 单元 / 5900 block / 4657 图。
- `nemata-jp-chapter-215-4` 已 covered-effective（rev2 09:32:50 passed 且已入 214），不再列阻塞。
  `79-cn-chapter-215-4` 是另一原章（防守11—扣牌(1)），仍缺 PDF p217，属 A 的 PDF 项。
- register 的 `produced-passed-not-staged: 0` 口径已过时：以下 4 章有真实 passed 独立回执、源 SHA 仍绑定，但既不在 selectedWeb 也不在 pendingWeb：
  199-1（10:01:30）、142-1（11:25:33）、127-1（11:27:18）、027-1（11:27:18）。
  它们应走 250 入库，不需要任何新制作。

## 入口核验（零调用，非声明）
用当前冻结 runtime `audit/runtimes/e89dcffe…/textbook-audit-web.mjs` 的 `verifyWebRevisionContent(candidate,parent,notes)`，对每章按父审已声明的 target 构造同内容 revision 视图后实跑：

- 通过（可执行）：`text-multi-block` 089-1（4 块）、060-1（2 块）；`figure-targeted` 081-8、090-6、128-14、145-4、157-11、205-5、222-5、246-3、256-18、276-4（共 12 章）。
- 门禁本身的三个硬约束（本轮实测得出，不是推测）：
  1. 多目标文本修订**本来就支持**（textBlockIds 数组不限 1 个）——B 的“普通单块池已空”只在 modern scope 成立，不是入口缺失。
  2. 文本与 figure 不能混在同一次修订（`ids.length&&texts.length` → `web_revision_changed_body_or_scope`）。
  3. 文本修订要求父稿 `body.mode=translated`，figure 修订要求 `verbatim`。所以 79-cn（verbatim）的文本修订、modern（translated）的 figure 修订目前都不成立，除非做最小门禁补充（本轮未做、未擅自改 runtime）。

## 分类（剩余 38 章：42 − 4 章 passed-not-staged）
- `text-multi-block-executable`：2（089-1、060-1）
- `figure-targeted-executable`：10（081-8、090-6、128-14、145-4、157-11、205-5、222-5、246-3、256-18、276-4）
- `parent-evidence-or-adjudication`：21
  - 父审无 error target：159-9、193-4、208-4、242-3、100-1、183-1、236-1
  - 父审有 uncertain issue 或 imageCheck 未 represented：167-4、109-4、311-18、217-4
  - 父审记录字段缺失：347-1（无 completeArticleCompared/domOrder）
  - 文本+figure 混合、不能一次修订：201-6、193-1、213-1、232-1
  - 模式不匹配：155-4、162-3、182-5、234-12（verbatim 文本）、224-1（translated figure）
- `source-recapture-or-pdf`：5（79-cn-215-4 p217、001-64 封面目录、250-1 p257/261、317-51、283-1）

## 本批（互斥 2 章）
- A（COAC-248）：79-cn-chapter-081-8，figureIds 4 个，父候选 `50b62ce5…`，入口 PASS。
- B（COAC-269）：nemata-jp-chapter-089-1，textBlockIds 4 个，父候选 `9fa0255f…`，入口 PASS。
- B 的下一章已预核：060-1（2 块，PASS），不并入本批。

## 文件
- `classification-remaining-38.json`：逐章分类 + 入口结果 + 基线。
- `entry-verification-raw.json`：逐章实跑 attempts 原文。
- `dispatch-A-coac248.json` / `dispatch-B-coac269.json`：派发规格（父稿/父审/源 SHA、scope、预算、已知修正）。
- `staging-ready-4.json`：250 的零调用入库清单（含候选与回执 SHA）。
- `instruction-*.md`：唤醒各票时携带的指令。
