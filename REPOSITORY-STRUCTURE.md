# 三项目单仓库整理设计

日期：2026-08-14

状态：等待实施计划

## 目标

把当前仓库明确整理为三个彼此独立、仍共享同一 Git 历史的项目：

1. `course/`：日麻教学；
2. `coach/`：日麻教练；
3. `overlay/`：雀魂手摸切插件。

整理后，开发者从仓库根 README 能进入任一项目；每个项目在自己的目录中拥有代码、测试、文档和运行说明。根目录只保留仓库级导航、Git 配置和本文件。

## 目标目录

```text
日麻教学/
├─ README.md
├─ REPOSITORY-STRUCTURE.md
├─ .gitignore
├─ .gitattributes
├─ course/
│  ├─ README.md
│  ├─ docs/
│  ├─ index.html
│  ├─ analyzer.html
│  ├─ trainer.html
│  ├─ mastery.html
│  ├─ lessons/
│  ├─ assets/
│  ├─ reference/
│  ├─ lib/
│  ├─ tests/
│  └─ tools/
├─ coach/
│  ├─ README.md
│  ├─ docs/
│  │  ├─ development/
│  │  ├─ specs/
│  │  ├─ plans/
│  │  └─ handoffs/
│  ├─ packages/
│  ├─ scripts/
│  ├─ tools/
│  └─ package.json
└─ overlay/
   ├─ README.md
   ├─ docs/
   │  ├─ specs/
   │  ├─ plans/
   │  └─ handoffs/
   ├─ src/
   ├─ tests/
   └─ MahjongSoulOverlay.sln
```

## 项目边界

### 日麻教学 `course/`

这是独立的静态教学产品。包含十八课、牌效率分析器、训练器、掌握度页面、牌图和普通形牌效率算法。

迁入：

- 根目录 `index.html`、`analyzer.html`、`trainer.html`、`mastery.html`；
- `assets/`、`lessons/`、`reference/`、`lib/`；
- 根目录课程 `tests/` 与课程生成 `tools/`；
- `MISSION.md`、`NOTES.md`、`RESOURCES.md`、`COMPLETION-AUDIT.md`。

课程内现有相对链接保持原有目录层级，因此整体移动后通常不需改 HTML。依赖当前工作目录的测试和生成脚本改为以 `course/` 为项目根运行。

### 日麻教练 `coach/`

这是 Electron/TypeScript/Go 的证据型复盘教练。包含雀魂国区账号接入、牌谱 canonical 重放、模型适配、因素账本和未来的教学报告工作台。

保留现有 `coach/` 代码结构，并迁入：

- `docs/development/` → `coach/docs/development/`；
- 所有推理核心、统一候选、canonical 事件、牌形振听、防守矩阵、雀魂账号/协议/目录/牌谱接入相关的 specs、plans、handoffs；
- 当前 `coach/README.md` 继续作为项目 README，但需压缩过时能力清单，优先导航到 `coach/docs/development/`。

`coach/docs/development/` 是教练开发人员的当前文档入口。带日期的 specs/plans/handoffs 是历史和审计材料。

### 雀魂手摸切插件 `overlay/`

这是独立的 Windows 屏幕捕获与牌河手切/摸切标记工具，不是教练的牌谱输入源。

保留现有 `overlay/` 代码、测试、fixture 和工具，并迁入：

- `2026-07-30-mahjong-soul-discard-overlay-design.md`；
- `2026-07-30-mahjong-soul-discard-overlay.md`；
- 现有 `overlay/HANDOFF.md` 移入 `overlay/docs/handoffs/`；顶级历史 handoff 中没有额外的 overlay 专属文件。

现有 `ACCEPTANCE.md`、`CALIBRATION.md`、`HANDOFF.md` 可在本次迁移中放入 `overlay/docs/`，同时从 `overlay/README.md` 链接。开发工具或测试引用这些文件时同步更新路径。

## 历史文档分类规则

文档按“主要交付产品”归属，而不是按文件名中的技术名词归属：

- 课程内容、牌图、学习路径 → `course/docs/`；
- LLM 教练、推理核心、Mortal/Akagi、雀魂账号与牌谱接入 → `coach/docs/`；
- 屏幕捕获、CV、牌河跟踪、透明遮罩 → `overlay/docs/`。

没有同时复制一份文档到多个项目。跨项目关系通过相对链接表达。仓库级结构说明只保留本文件。

## 根目录职责

根 `README.md` 只包含：

- 三项目列表与一句话用途；
- 各项目 README/开发文档入口；
- 三项目彼此独立、共享 Git 历史的说明；
- 仓库级目录约定。

根目录不再承担某一个项目的运行入口，也不放项目专属 roadmap、handoff 或测试。

## 迁移策略

### 保留历史

使用 `git mv` 移动已跟踪文件。虽然 Git 在存储层按内容识别重命名，显式移动仍让 diff 和复审更清晰。

### 分阶段迁移

1. 建立 `course/` 并整体移动课程代码与资料；
2. 把教练开发文档和历史资料移入 `coach/docs/`；
3. 把 overlay 文档收拢到 `overlay/docs/`；
4. 重写根 README 与三个项目 README 的导航；
5. 更新 `.gitignore`、文档链接、脚本工作目录和测试假设；
6. 分项目运行门禁。

每个阶段形成独立提交。若某阶段回归，问题范围可直接定位和回退。

### 不提供旧路径兼容层

本仓库没有对外发布的旧文件路径 API。迁移后直接更新内部链接与命令，不保留重复文件、目录 junction 或长期 redirect stub。Git 历史提供旧位置追溯。

## 路径更新原则

- 课程 HTML 内部相对路径因目录整体搬迁而保持不变；
- 课程 Node 测试从 `course/` 运行，代码中以项目根为基准的相对路径保持不变；
- `coach` npm scripts 仍从 `coach/` 运行，不因仓库整理改变；
- overlay 的 `dotnet` 命令从 `overlay/` 运行；
- Markdown 链接全部重新解析验证；
- 根 `.gitignore` 中项目路径更新为新位置，不放宽 secrets、录屏和构建产物忽略规则。

## 文档入口

迁移后必须保证：

- 根 README 一次点击可到三个项目 README；
- 每个项目 README 一次点击可到其开发/验收文档；
- 教练所有 living docs 位于 `coach/docs/development/`；
- 历史文档在对应项目 README 或文档索引中可发现；
- 不再存在顶级 `docs/development/` 或混合三个项目的 `docs/superpowers/`。

## 验收

### 仓库结构

- 根目录只剩仓库级文件和 `course/`、`coach/`、`overlay/`；
- 不存在遗留的课程 HTML/代码目录；
- 不存在顶级混合项目文档目录；
- `git status` 干净，重命名范围可审计。

### 日麻教学

在 `course/` 运行：

```powershell
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
```

并验证 `index.html`、课程、分析器、训练器、掌握度页面的本地链接与资源。

### 日麻教练

在 `coach/` 运行：

```powershell
npm run typecheck
npm test
npm run test:package-import
npm audit --omit=dev
```

### 雀魂手摸切插件

在 `overlay/` 使用仓库已固定的 .NET SDK 运行 solution tests，并确认 README 中的实际命令。若环境缺少所需 runtime，必须报告为外部门禁阻塞，不能误报通过。

### 文档

- 所有本地 Markdown 链接存在；
- 所有示例命令的工作目录正确；
- 根 README 和三个项目 README 描述的完成状态与代码一致；
- `git diff --check` 通过。

## 风险与缓解

### 静态课程路径回归

风险来自脚本以进程 cwd 而非文件位置解析资源。通过从 `course/` 运行原门禁、检查所有硬编码路径并做浏览器 smoke 缓解。

### 历史文档链接断裂

批量移动会破坏相对链接。迁移后用脚本解析全部 Markdown 本地链接，不靠抽查。

### 无关用户文件被带入

迁移只操作已跟踪、已分类文件；提交前精确暂存并核对路径。录屏、私有截图、overlay diagnostics 和构建产物继续由 `.gitignore` 排除。

### 项目边界再次模糊

根 README 与本文件明确三项目边界；新文档必须进入目标项目目录。共享代码若未来出现，应经过明确设计再建立 `shared/`，本次不预建空的共享层。
