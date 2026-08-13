# Three-Project Repository Migration Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with strict scope checks. Each task must leave its project independently testable. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reorganize the monorepo into three explicit top-level projects—`course/`, `coach/`, and `overlay/`—with project-owned documentation and a repository-only root.

**Architecture:** Move tracked files with `git mv` so Git can preserve rename history. Keep each project's existing internal layout and runtime behavior; change only paths, navigation, working-directory assumptions, and documentation ownership. Validate each project immediately after its move, then run repository-wide link and cleanliness gates.

**Tech Stack:** Git, Markdown, Node.js built-in test runner, npm workspaces, TypeScript, Vitest, Electron, .NET solution tests, PowerShell.

**Approved design:** [`REPOSITORY-STRUCTURE.md`](REPOSITORY-STRUCTURE.md)

---

## Exact document ownership

### Course documents

Move to `course/docs/specs/`:

- `2026-07-27-modern-riichi-tile-efficiency-course-design.md`
- `2026-07-27-vector-mahjong-tile-visuals-design.md`

Move to `course/docs/plans/`:

- `2026-07-27-complete-riichi-efficiency-course.md`
- `2026-07-27-first-tile-efficiency-lesson.md`

Move root course records to `course/docs/`:

- `MISSION.md`
- `NOTES.md`
- `RESOURCES.md`
- `COMPLETION-AUDIT.md`

### Overlay documents

Move to `overlay/docs/specs/`:

- `2026-07-30-mahjong-soul-discard-overlay-design.md`

Move to `overlay/docs/plans/`:

- `2026-07-30-mahjong-soul-discard-overlay.md`

Move existing overlay records:

- `overlay/ACCEPTANCE.md` → `overlay/docs/ACCEPTANCE.md`
- `overlay/CALIBRATION.md` → `overlay/docs/CALIBRATION.md`
- `overlay/HANDOFF.md` → `overlay/docs/handoffs/HANDOFF.md`

### Coach documents

Move `docs/development/` unchanged to `coach/docs/development/`.

Move every remaining file in `docs/superpowers/specs/`, `plans/`, and `handoffs/` to the corresponding `coach/docs/specs/`, `coach/docs/plans/`, and `coach/docs/handoffs/` directory. This includes all reasoning, comparison, event-stream, FactorPipeline, defense, account, protocol, catalog, ingestion, mapper, and diagnostic documents.

After these moves, delete the empty top-level `docs/` tree.

---

### Task 1: Capture pre-migration baselines

**Files:** No file changes.

- [x] **Step 1: Verify the worktree starts clean**

Run from repository root:

```powershell
git status --short
```

Expected: no output.

- [x] **Step 2: Record the three project baselines in the terminal log**

Run the course gate from repository root:

```powershell
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
```

Expected: all current course tests pass.

Run the coach gate:

```powershell
cd coach
npm run typecheck
npm test
npm run test:package-import
npm audit --omit=dev
cd ..
```

Expected: every command exits 0.

Run the overlay gate using the repository-managed SDK:

```powershell
& .\.tools\dotnet\dotnet.exe test overlay\MahjongSoulOverlay.sln -c Release
```

Expected: all overlay tests pass. If `.tools/dotnet` is absent, check `overlay/global.json` and the installed `dotnet --info`; report the exact external runtime blocker before any move.

- [x] **Step 3: Save the tracked-path inventory for comparison**

```powershell
git ls-files | Sort-Object | Set-Content -Encoding utf8 $env:TEMP\riichi-coach-paths-before.txt
```

Expected: the file is created outside the repository and no worktree files change.

---

### Task 2: Move the static course into `course/`

**Files:**

- Move: `index.html`, `analyzer.html`, `trainer.html`, `mastery.html`
- Move: `assets/`, `lessons/`, `reference/`, `lib/`, root `tests/`, root `tools/`
- Move: `MISSION.md`, `NOTES.md`, `RESOURCES.md`, `COMPLETION-AUDIT.md`
- Create: `course/README.md`
- Move: the four course specs/plans listed above

- [x] **Step 1: Create the project and documentation directories**

```powershell
New-Item -ItemType Directory -Force course, course\docs, course\docs\specs, course\docs\plans | Out-Null
```

- [x] **Step 2: Move all course runtime files with Git**

```powershell
git mv index.html analyzer.html trainer.html mastery.html course\
git mv assets lessons reference lib tests tools course\
git mv MISSION.md NOTES.md RESOURCES.md COMPLETION-AUDIT.md course\docs\
```

Expected: root no longer contains course HTML or course code directories.

- [x] **Step 3: Move course history documents**

```powershell
git mv docs\superpowers\specs\2026-07-27-modern-riichi-tile-efficiency-course-design.md course\docs\specs\
git mv docs\superpowers\specs\2026-07-27-vector-mahjong-tile-visuals-design.md course\docs\specs\
git mv docs\superpowers\plans\2026-07-27-complete-riichi-efficiency-course.md course\docs\plans\
git mv docs\superpowers\plans\2026-07-27-first-tile-efficiency-lesson.md course\docs\plans\
```

- [x] **Step 4: Create `course/README.md`**

The README must contain:

```markdown
# 日麻教学

十八课静态牌效率课程、牌效率分析器、训练器与掌握度页面。

## 运行

直接打开 `index.html`。

## 验证

```powershell
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
```

## 文档

- [使命](docs/MISSION.md)
- [完成审计](docs/COMPLETION-AUDIT.md)
- [资料来源](docs/RESOURCES.md)
- [设计规格](docs/specs/)
- [历史计划](docs/plans/)
```

- [x] **Step 5: Run course tests from the new project root**

```powershell
cd course
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
cd ..
```

Expected: the same baseline passes without changing HTML-relative asset paths.

- [x] **Step 6: Check course hard-coded root assumptions**

```powershell
rg -n '(^|["''])/(assets|lessons|lib|reference)|\.\./course|docs/superpowers' course
```

Expected: no new repository-root dependency. Historical prose may name its old location only when explicitly described as history.

- [x] **Step 7: Commit the course move**

```powershell
git add -- course
git diff --cached --check
git commit -m "chore: move the course into its project directory"
```

---

### Task 3: Move all coach documentation into `coach/docs/`

**Files:**

- Move: `docs/development/` → `coach/docs/development/`
- Move: remaining `docs/superpowers/specs/*` → `coach/docs/specs/`
- Move: remaining `docs/superpowers/plans/*` → `coach/docs/plans/`
- Move: remaining `docs/superpowers/handoffs/*` → `coach/docs/handoffs/`
- Modify: `coach/README.md`
- Modify: all moved coach Markdown files containing old `docs/...` paths

- [x] **Step 1: Create coach documentation directories and move files**

```powershell
New-Item -ItemType Directory -Force coach\docs\specs, coach\docs\plans, coach\docs\handoffs | Out-Null
git mv docs\development coach\docs\development
Get-ChildItem docs\superpowers\specs -File |
  Where-Object Name -ne '2026-07-30-mahjong-soul-discard-overlay-design.md' |
  ForEach-Object { git mv -- $_.FullName coach\docs\specs\ }
Get-ChildItem docs\superpowers\plans -File |
  Where-Object Name -ne '2026-07-30-mahjong-soul-discard-overlay.md' |
  ForEach-Object { git mv -- $_.FullName coach\docs\plans\ }
Get-ChildItem docs\superpowers\handoffs -File | ForEach-Object { git mv -- $_.FullName coach\docs\handoffs\ }
```

Expected: only the two overlay documents remain under the top-level `docs/superpowers` before Task 4; if they were already moved by exact classification, the directories are empty.

- [x] **Step 2: Update living documentation links**

Apply these exact path rules:

```text
coach/README.md: ../docs/development/README.md → docs/development/README.md
coach/docs/development/ROADMAP.md:
  ../superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md → ../plans/2026-08-01-llm-riichi-coach-product-roadmap.md
coach/docs/development/*.md:
  docs/superpowers/specs → coach/docs/specs when describing repository-root paths
  docs/superpowers/plans → coach/docs/plans
  docs/superpowers/handoffs → coach/docs/handoffs
coach/docs/plans|handoffs/*.md:
  docs/superpowers/specs → coach/docs/specs
  docs/superpowers/plans → coach/docs/plans
  docs/superpowers/handoffs → coach/docs/handoffs
```

Do not alter dates, prior test results, or technical conclusions while changing paths.

- [x] **Step 3: Add coach documentation navigation to `coach/README.md`**

The first section must link to:

```markdown
- [开发文档首页](docs/development/README.md)
- [当前路线图](docs/development/ROADMAP.md)
- [系统架构](docs/development/ARCHITECTURE.md)
- [规格档案](docs/specs/)
- [实施计划档案](docs/plans/)
- [交接档案](docs/handoffs/)
```

- [x] **Step 4: Verify all coach Markdown links**

Run a PowerShell link checker that resolves local Markdown destinations relative to each document:

```powershell
$broken = @()
Get-ChildItem coach -Recurse -Filter *.md | ForEach-Object {
  $doc = $_
  $content = Get-Content -Raw -LiteralPath $doc.FullName
  foreach ($match in [regex]::Matches($content, '\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)')) {
    $target = $match.Groups[1].Value
    if ($target -notmatch '^(https?:|mailto:)' -and -not (Test-Path -LiteralPath (Join-Path $doc.DirectoryName $target))) {
      $broken += "$($doc.FullName) -> $target"
    }
  }
}
if ($broken.Count) { $broken; exit 1 }
```

Expected: exit 0 with no broken links.

- [x] **Step 5: Run the coach gates**

```powershell
cd coach
npm run typecheck
npm test
npm run test:package-import
cd ..
```

Expected: all commands exit 0; code behavior is unchanged by documentation movement.

- [x] **Step 6: Commit coach documentation ownership**

```powershell
git add -- coach\README.md coach\docs docs
git diff --cached --check
git commit -m "docs: move coach documentation into the coach project"
```

Only stage `docs` here to record deletions of moved coach paths; verify no overlay document was accidentally included.

---

### Task 4: Consolidate overlay documentation

**Files:**

- Move: overlay spec/plan listed in the ownership section
- Move: `overlay/ACCEPTANCE.md`, `CALIBRATION.md`, `HANDOFF.md`
- Modify: `overlay/README.md`
- Modify: `overlay/fixtures/recordings/README.md`
- Modify: moved overlay documentation command examples

- [x] **Step 1: Create overlay documentation directories and move files**

```powershell
New-Item -ItemType Directory -Force overlay\docs\specs, overlay\docs\plans, overlay\docs\handoffs | Out-Null
git mv docs\superpowers\specs\2026-07-30-mahjong-soul-discard-overlay-design.md overlay\docs\specs\
git mv docs\superpowers\plans\2026-07-30-mahjong-soul-discard-overlay.md overlay\docs\plans\
git mv overlay\ACCEPTANCE.md overlay\docs\ACCEPTANCE.md
git mv overlay\CALIBRATION.md overlay\docs\CALIBRATION.md
git mv overlay\HANDOFF.md overlay\docs\handoffs\HANDOFF.md
```

If Task 3 already left the overlay spec/plan in place, these commands succeed. If not, stop and correct the Task 3 classification before continuing.

- [x] **Step 2: Convert overlay developer commands to the overlay project root**

Use these command forms in `overlay/README.md`, moved acceptance/handoff docs, and `fixtures/recordings/README.md`:

```powershell
cd overlay
& ..\.tools\dotnet\dotnet.exe test .\MahjongSoulOverlay.sln -c Release
& ..\.tools\dotnet\dotnet.exe publish .\src\MahjongSoulOverlay.Windows -c Release -r win-x64 --self-contained true -o .\artifacts\win-x64
& ..\.tools\dotnet\dotnet.exe publish .\src\MahjongSoulOverlay.Replay -c Release -r win-x64 --self-contained true -o .\artifacts\replay-win-x64
```

Remove leading `overlay/` from artifact, fixture, profile, solution, and source paths in commands that now run from `overlay/`.

- [x] **Step 3: Add documentation navigation to `overlay/README.md`**

Add links to:

```markdown
- [验收状态](docs/ACCEPTANCE.md)
- [校准说明](docs/CALIBRATION.md)
- [当前交接](docs/handoffs/HANDOFF.md)
- [设计规格](docs/specs/2026-07-30-mahjong-soul-discard-overlay-design.md)
- [实施计划](docs/plans/2026-07-30-mahjong-soul-discard-overlay.md)
```

- [x] **Step 4: Run overlay tests from the project root**

```powershell
cd overlay
& ..\.tools\dotnet\dotnet.exe test .\MahjongSoulOverlay.sln -c Release
cd ..
```

Expected: the baseline suite passes.

- [x] **Step 5: Verify overlay Markdown links and obsolete command prefixes**

```powershell
rg -n '\.\\\.tools\\dotnet|dotnet\.exe test overlay/|overlay/(src|tests|artifacts|fixtures)' overlay -g '*.md'
```

Expected: no obsolete root-oriented command remains. Prose may still say “overlay” as the product name.

- [x] **Step 6: Commit overlay documentation ownership**

```powershell
git add -- overlay docs
git diff --cached --check
git commit -m "docs: consolidate overlay documentation"
```

Expected: top-level `docs/` is now empty and removed by Git.

---

### Task 5: Rewrite repository navigation and path policy

**Files:**

- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `REPOSITORY-STRUCTURE.md`
- Retain: `.gitattributes`

- [x] **Step 1: Replace root README with repository navigation**

Use this structure:

```markdown
# 日麻项目仓库

本仓库包含三个独立项目，共享 Git 历史，但各自拥有代码、测试和文档。

| 项目 | 用途 | 入口 |
|---|---|---|
| 日麻教学 | 十八课牌效率课程、分析器和训练器 | [course/README.md](course/README.md) |
| 日麻教练 | Electron 复盘教练、雀魂牌谱重放与证据型分析 | [coach/README.md](coach/README.md) |
| 雀魂手摸切插件 | Windows 屏幕捕获与牌河手切/摸切标记 | [overlay/README.md](overlay/README.md) |

仓库结构和文档归属见 [REPOSITORY-STRUCTURE.md](REPOSITORY-STRUCTURE.md)。运行、测试和路线图请进入对应项目，不要从仓库根猜测命令。
```

- [x] **Step 2: Update ignore paths without widening them**

Keep these repository-relative rules:

```gitignore
.superpowers/
.tools/
**/bin/
!coach/bin/
**/obj/
*.csproj.user
TestResults/
coach/reports/
overlay/fixtures/recordings/*.mp4
overlay/fixtures/recordings/*.mkv
overlay/fixtures/recordings/*.jsonl
overlay/fixtures/private-stills/
overlay/diagnostics/
overlay/artifacts/
coach/node_modules/
coach/**/dist/
coach/coverage/
```

Course migration requires no new generated-output ignore rule.

- [x] **Step 3: Update the structure design from future tense to implemented state**

In `REPOSITORY-STRUCTURE.md`:

- set status to `已实施`;
- add the exact migration commit hashes returned by `git log --oneline -3` after Tasks 2–4;
- keep the target tree, boundary rationale, and gates as enduring reference;
- remove wording that tells readers to approve the migration.

- [x] **Step 4: Assert the root contains no project-owned files**

```powershell
$allowedFiles = @('.gitattributes', '.gitignore', 'README.md', 'REPOSITORY-STRUCTURE.md', 'REPOSITORY-MIGRATION-PLAN.md')
$unexpected = Get-ChildItem -File | Where-Object { $_.Name -notin $allowedFiles }
if ($unexpected) { $unexpected.FullName; exit 1 }
$allowedDirectories = @('course', 'coach', 'overlay')
$unexpectedDirectories = Get-ChildItem -Directory -Force | Where-Object {
  $_.Name -notin $allowedDirectories -and $_.Name -notin @('.git', '.tools', '.superpowers')
}
if ($unexpectedDirectories) { $unexpectedDirectories.FullName; exit 1 }
```

Expected: exit 0.

- [x] **Step 5: Commit repository navigation**

```powershell
git add -- README.md .gitignore REPOSITORY-STRUCTURE.md
git diff --cached --check
git commit -m "docs: define the three-project repository entry point"
```

---

### Task 6: Run final cross-project acceptance

**Files:**

- Modify: `REPOSITORY-MIGRATION-PLAN.md` only to check completed boxes and record actual gate results.

- [x] **Step 1: Verify every tracked path belongs to an allowed root**

```powershell
$allowedRootFiles = @('.gitattributes', '.gitignore', 'README.md', 'REPOSITORY-STRUCTURE.md', 'REPOSITORY-MIGRATION-PLAN.md')
$bad = git ls-files | Where-Object {
  $top = ($_ -split '/')[0]
  $_ -notin $allowedRootFiles -and $top -notin @('course', 'coach', 'overlay')
}
if ($bad) { $bad; exit 1 }
```

Expected: exit 0.

- [x] **Step 2: Verify all local Markdown links across all three projects**

Run the relative-link checker from Task 3 over `README.md`, `REPOSITORY-STRUCTURE.md`, `course/`, `coach/`, and `overlay/`.

Expected: no broken link.

- [x] **Step 3: Run the final course gate**

```powershell
cd course
node --test tests/training.test.mjs tests/course-completeness.test.mjs tests/mahjong-engine.test.mjs
node tests/lesson-0001-smoke.mjs
cd ..
```

- [x] **Step 4: Run the final coach gate**

```powershell
cd coach
npm run typecheck
npm test
npm run test:package-import
npm audit --omit=dev
cd ..
```

- [x] **Step 5: Run the final overlay gate**

```powershell
cd overlay
& ..\.tools\dotnet\dotnet.exe test .\MahjongSoulOverlay.sln -c Release
cd ..
```

- [x] **Step 6: Verify formatting and a clean worktree**

```powershell
git diff --check
git status --short
```

Expected before the final plan update: only `REPOSITORY-MIGRATION-PLAN.md` is modified.

- [x] **Step 7: Record actual results and commit the completed migration plan**

Replace expected counts with the actual output from Tasks 3–5, check completed boxes, then run:

```powershell
git add -- REPOSITORY-MIGRATION-PLAN.md
git diff --cached --check
git commit -m "docs: record repository migration acceptance"
```

Expected final state: `git status --short` produces no output.

---

## 验收结果记录

迁移于 2026-08-14 在独立工作树执行（分支 codex/m5e-oauth2-restore-diagnostic），各阶段独立提交：

- 2f54cfd chore: move the course into its project directory
- 63530c8 fix: retarget the reasoning analyzer to the course engine
- 669d3c6 docs: move coach documentation into the coach project
- 68381d6 docs: consolidate overlay documentation
- 62a05d1 docs: define the three-project repository entry point

门禁实测（迁移前基线与迁移后最终验收一致）：

- 课程：node --test 18/18 通过；tests/lesson-0001-smoke.mjs 通过。
- 教练：typecheck、npm test、test:package-import、npm audit --omit=dev（0 漏洞）全部退出 0。
- overlay：dotnet test .\MahjongSoulOverlay.sln -c Release 409 通过（Core 208 / Vision 134 / Windows 67），0 失败。

验收断言：

- 根目录仅保留仓库级文件与 course/、coach/、overlay/；无遗留课程代码目录与顶级混合文档目录。
- 全部 534 个已跟踪路径位于允许根之下；git diff --check 通过；工作树干净。
- 59 个 Markdown 文件的本地链接全部解析成功。

实施说明与偏差：

- 仓库级 .tools/dotnet 为 gitignore 本地运行时，迁移工作树中不存在；overlay 门禁改用系统 SDK 8.0.423，满足 overlay/global.json（8.0.100，rollForward latestFeature）。
- 教练 packages/reasoning/src/analysis/efficiency-analyzer.ts 原直接引用仓库根 lib/mahjong.mjs（课程共享引擎）。迁移将该文件移入 course/lib/ 后，单独提交 63530c8 将 import 重定向到 course/lib/mahjong.mjs。三项目之间仍存在这一代码级耦合，未来如需可经明确设计提升为 shared/。
- overlay/docs/plans/2026-07-30-mahjong-soul-discard-overlay.md 为历史实施计划，其中 overlay/src|tests|artifacts|fixtures 记录路径指向未移动的代码，故保留原文；存活文档（README/ACCEPTANCE/HANDOFF/fixtures README）的命令已转换为 overlay/ 项目根视角。
- 计划模板的 publish 示例为 --self-contained true；为不改变发布行为（README 要求安装 .NET 8 Desktop Runtime），实际保留 --self-contained false -p:PublishSingleFile=true。

## Stop conditions

Stop the migration and report the exact blocker instead of improvising when:

- a course test only passes from the old repository root;
- a document cannot be assigned to exactly one product;
- an overlay test or build script requires paths outside `overlay/` other than the shared ignored `.tools/` runtime;
- a coach test reads top-level `docs/` at runtime;
- a move would include ignored private recordings, credentials, diagnostics, build outputs, or another worktree's changes;
- any post-move baseline fails for a reason not explained solely by the intended path change.
