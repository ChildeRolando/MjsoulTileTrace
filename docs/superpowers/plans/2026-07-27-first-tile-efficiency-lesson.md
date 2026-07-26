# First Tile-Efficiency Lesson Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the persistent teaching workspace and a short interactive first lesson that teaches the learner to compare discard candidates by shanten-preserving effective-tile sets and live tile counts.

**Architecture:** Markdown files hold stable learning state and curated sources; a standalone HTML reference sheet holds the reusable algorithm; a standalone HTML lesson embeds explanations, mahjong tile notation, interactive exercises, immediate feedback, and progress stored locally in the browser. A small Node script performs structural and behavioral smoke tests without adding a framework.

**Tech Stack:** Markdown, semantic HTML, CSS, vanilla JavaScript, Node.js built-ins.

---

## File map

- `MISSION.md`: stable objective, success criteria, constraints, and exclusions.
- `RESOURCES.md`: annotated high-trust sources used to substantiate definitions and algorithms.
- `NOTES.md`: teaching preferences and unresolved observations.
- `reference/effective-tiles.html`: printable algorithm for shanten-first discard comparison.
- `lessons/0001-effective-tiles-and-live-counts.html`: first interactive lesson.
- `tests/lesson-0001-smoke.mjs`: structural, content, and interaction smoke checks.

### Task 1: Establish persistent learning state

**Files:**
- Create: `MISSION.md`
- Create: `NOTES.md`

- [ ] **Step 1: Create the mission**

Write `MISSION.md` with exactly these sections and commitments:

```markdown
# Mission: 科学日麻牌效率

## Why
在暂不考虑防守的牌局中，以概率、组合和可复核的牌形计算快速找到普通四面子一雀头手牌的最优舍牌，把粗略牌感升级为稳定的实战决策能力。

## Success looks like
- 判断候选舍牌是否改变向听数
- 不重不漏地列出一次有效牌，并按已知牌扣除剩余枚数
- 用二次改良解释直接进张相近牌形之间的差异
- 用同一模型解释常见复合牌形，而不是孤立背诵结论
- 在常见牌形中于三至五秒内筛除明显劣势舍牌

## Constraints
- 当前水平介于“理解向听数”与“能系统比较进张”之间
- 保留浮牌、搭子、强化搭子、强化刻子等已有牌块语言
- 理论必须可计算、可复核，实战流程必须足够快速
- 先保证正确，再逐步加入限时训练

## Out of scope
- 防守、读牌与危险度
- 点数状况、顺位与押引
- 七对子与国士无双
- 复杂打点最大化
```

- [ ] **Step 2: Record teaching preferences**

Write `NOTES.md`:

```markdown
# Notes

- 学习者偏好：先看到组合计算依据，再把结论压缩成实战口诀。
- 已有语言：浮牌、搭子、强化搭子、强化刻子；课程应映射到这些概念。
- 当前疑问：如何形式化比较单张舍牌收益，以及如何理解 `12`、`13` 等愚形的价值。
- 计时策略：不限时正确率稳定后，再训练三至五秒判断。
```

- [ ] **Step 3: Verify state files**

Run:

```powershell
rg -n "^# Mission|^## Why|^## Success looks like|^## Constraints|^## Out of scope" MISSION.md
rg -n "组合计算依据|浮牌、搭子|12.*13|三至五秒" NOTES.md
```

Expected: all mission headings and all four preference concepts are found.

- [ ] **Step 4: Commit**

```powershell
git add -- MISSION.md NOTES.md
git commit -m "docs: establish riichi learning mission"
```

### Task 2: Curate the knowledge base

**Files:**
- Create: `RESOURCES.md`

- [ ] **Step 1: Research candidate sources**

Use the in-app browser or direct HTTP access to inspect primary pages rather than search-result snippets. For each candidate, verify author/publisher identity, whether the material defines shanten or effective tiles, and whether it explains counting rather than merely giving answers. Prefer:

- official Tenhou documentation or a directly inspectable Tenhou calculation page;
- an inspectable open-source shanten/ukeire implementation with tests;
- a recognized modern riichi textbook or author page;
- one well-moderated community for real-hand discussion.

Reject pages whose claims cannot be traced to an author, algorithm, test corpus, or established publication.

- [ ] **Step 2: Write annotated resources**

Create `RESOURCES.md` with the headings below. Under `Knowledge`, add exactly three verified entries in this order: a rules/calculation source, an inspectable implementation, and a recognized textbook. Each entry must be a Markdown link whose label names the item and author or institution, followed by one annotation line beginning with `用于：` and one clause beginning with `可信依据：`. Under `Wisdom`, add exactly one verified community entry followed by clauses beginning with `用于：` and `质量控制：`. Do not add an entry when Step 1 cannot verify its identity and trust basis; instead explain the missing category under `Gaps`.

```markdown
# 科学日麻牌效率 Resources

## Knowledge

三条经过核验并带注释的知识来源。

## Wisdom (Communities)

一条经过核验并带注释的实践社区。

## Gaps

- 尚缺一份可公开访问、同时严格讨论一次进张与二次改良权重的统一中文资料；课程将把两者分层呈现，不伪造单一万能分数。
```

- [ ] **Step 3: Verify links and annotations**

Run a read-only link check for every `https://` URL and confirm a successful response or a documented redirect. Then run:

```powershell
rg -n "^## Knowledge|^## Wisdom|^## Gaps|用于：|可信依据：|质量控制：" RESOURCES.md
```

Expected: all three sections exist, every resource is annotated, and no placeholder braces remain.

- [ ] **Step 4: Commit**

```powershell
git add -- RESOURCES.md
git commit -m "docs: curate tile efficiency sources"
```

### Task 3: Specify lesson behavior with a failing smoke test

**Files:**
- Create: `tests/lesson-0001-smoke.mjs`
- Test: `lessons/0001-effective-tiles-and-live-counts.html`
- Test: `reference/effective-tiles.html`

- [ ] **Step 1: Write the smoke test**

Create `tests/lesson-0001-smoke.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const lessonPath = "lessons/0001-effective-tiles-and-live-counts.html";
const referencePath = "reference/effective-tiles.html";

assert.ok(fs.existsSync(lessonPath), "lesson HTML is missing");
assert.ok(fs.existsSync(referencePath), "reference HTML is missing");

const lesson = fs.readFileSync(lessonPath, "utf8");
const reference = fs.readFileSync(referencePath, "utf8");

for (const text of ["向听数", "有效牌", "剩余枚数", "先向听，后枚数", "继续追问"]) {
  assert.ok(lesson.includes(text), `lesson must contain: ${text}`);
}
for (const id of ["worked-example", "practice-1", "practice-2", "practice-3", "lesson-status"]) {
  assert.ok(lesson.includes(`id="${id}"`), `lesson must expose #${id}`);
}
for (const text of ["第一步：枚举候选舍牌", "第二步：保持最低向听", "第三步：列出有效牌", "第四步：扣除已知牌"]) {
  assert.ok(reference.includes(text), `reference must contain: ${text}`);
}
assert.ok(lesson.includes("../reference/effective-tiles.html"), "lesson must link to reference");
assert.ok(/https:\/\/[^"' <]+/.test(lesson), "lesson must cite an external primary source");

const scriptMatch = lesson.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "lesson must contain inline interaction script");

const saved = new Map();
const elements = new Map();
const document = {
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        textContent: "",
        dataset: {},
        classList: { add() {}, remove() {} },
        addEventListener() {}
      });
    }
    return elements.get(id);
  }
};
const localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value))
};
vm.runInNewContext(scriptMatch[1], { document, localStorage, console });

console.log("lesson 0001 smoke test passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node tests/lesson-0001-smoke.mjs
```

Expected: FAIL with `lesson HTML is missing`.

- [ ] **Step 3: Commit the failing specification**

```powershell
git add -- tests/lesson-0001-smoke.mjs
git commit -m "test: specify first efficiency lesson"
```

### Task 4: Build the printable effective-tile reference

**Files:**
- Create: `reference/effective-tiles.html`
- Test: `tests/lesson-0001-smoke.mjs`

- [ ] **Step 1: Create the semantic document**

Write a standalone Chinese HTML document with:

- title `有效牌与剩余枚数｜实战速查`;
- four numbered sections containing the exact phrases asserted by the smoke test;
- the formula `剩余枚数 = 4 − 手牌中的同种牌 − 已公开的同种牌`;
- a warning that distinct tile kinds and live tile copies are different quantities;
- a compact worked row showing that a tile already held twice has at most two unseen copies;
- a footer link back to `../lessons/0001-effective-tiles-and-live-counts.html`.

Use print-safe CSS: white background, near-black text, one restrained accent color, maximum content width around 900px, no gradients, no external fonts, and `@media print` rules that remove navigation.

- [ ] **Step 2: Validate the reference**

Run:

```powershell
node tests/lesson-0001-smoke.mjs
```

Expected: FAIL with `lesson HTML is missing`; there must be no reference-related assertion failure before it.

- [ ] **Step 3: Commit**

```powershell
git add -- reference/effective-tiles.html
git commit -m "docs: add effective tile quick reference"
```

### Task 5: Build the first interactive lesson

**Files:**
- Create: `lessons/0001-effective-tiles-and-live-counts.html`
- Modify: `tests/lesson-0001-smoke.mjs`

- [ ] **Step 1: Create the lesson shell**

Create a standalone Chinese HTML document with:

- a concise mission banner;
- learning objective: compare only candidates that preserve the lowest shanten;
- definitions of effective tile kind and live tile count;
- `id="worked-example"` containing one fully enumerated example;
- three exercises with IDs `practice-1`, `practice-2`, and `practice-3`;
- a visible progress element with `id="lesson-status"`;
- a link to `../reference/effective-tiles.html`;
- one primary-source link drawn from `RESOURCES.md`;
- the reminder `有任何一步不清楚，继续追问你的教师。`.

The worked example must explicitly show:

```text
候选舍牌 → 舍牌后向听数 → 有效牌集合 → 扣除已知牌 → 总剩余枚数
```

Do not introduce two-step improvement in the exercises; mention it only as the reason the next lesson will compare `12` and `13`.

- [ ] **Step 2: Add balanced retrieval exercises**

Add three multiple-choice exercises whose visible answer labels are similar in length:

1. distinguish “three effective tile kinds” from “ten live copies”;
2. subtract copies already present in the hand;
3. reject a discard with more nominal effective tiles when it increases shanten.

Each option button must carry `data-question`, `data-answer`, and `data-correct`. Feedback must explain the calculation, not merely say correct/incorrect.

- [ ] **Step 3: Add immediate feedback and persistence**

In one inline `<script>`, attach click handlers to all `[data-question]` buttons. On answer:

- show the matching explanation;
- mark the question complete after a correct answer;
- store the set of completed question IDs under `riichi-lesson-0001`;
- update `#lesson-status` to `已掌握 X / 3`;
- restore progress on reload.

Keep all state local; do not use network calls or user tracking.

- [ ] **Step 4: Extend the test for exercise parity**

Append these assertions before the VM execution in `tests/lesson-0001-smoke.mjs`:

```js
const questions = [...lesson.matchAll(/data-question="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(questions).size, 3, "lesson must contain three question groups");
for (const id of new Set(questions)) {
  const optionCount = questions.filter((question) => question === id).length;
  assert.ok(optionCount >= 3, `${id} must offer at least three choices`);
}
assert.ok(lesson.includes('localStorage.setItem("riichi-lesson-0001"'), "progress must persist locally");
```

- [ ] **Step 5: Run the automated test**

Run:

```powershell
node tests/lesson-0001-smoke.mjs
```

Expected: `lesson 0001 smoke test passed`.

- [ ] **Step 6: Commit**

```powershell
git add -- lessons/0001-effective-tiles-and-live-counts.html tests/lesson-0001-smoke.mjs
git commit -m "feat: add first interactive efficiency lesson"
```

### Task 6: Visual and pedagogical verification

**Files:**
- Modify if needed: `lessons/0001-effective-tiles-and-live-counts.html`
- Modify if needed: `reference/effective-tiles.html`
- Modify if needed: `tests/lesson-0001-smoke.mjs`

- [ ] **Step 1: Open the lesson locally**

Open the absolute path `E:\文档\日麻教学\lessons\0001-effective-tiles-and-live-counts.html` in the in-app browser.

- [ ] **Step 2: Test the interaction manually**

Verify:

- an incorrect choice produces a calculation-based explanation;
- a correct choice changes progress exactly once;
- refreshing preserves correct-answer progress;
- keyboard focus is visible and every answer is reachable with Tab and Enter/Space;
- the reference link resolves locally;
- the external citation opens the intended source.

- [ ] **Step 3: Inspect desktop and narrow layouts**

At a desktop width and approximately 390px width, check that tile notation, formulas, answer buttons, and feedback remain readable without horizontal scrolling. Print-preview the reference and confirm navigation is hidden and no algorithm step is split illegibly.

- [ ] **Step 4: Perform a content audit**

Manually recompute every effective-tile set and live-copy total in the lesson. Confirm:

- no tile kind is counted twice because it completes overlapping blocks;
- all copies already in the hand are deducted;
- visible/discarded copies are deducted where the exercise specifies them;
- comparisons never prioritize ukeire over a lower shanten number;
- lesson terminology matches `MISSION.md` and `reference/effective-tiles.html`.

- [ ] **Step 5: Run final checks**

Run:

```powershell
node tests/lesson-0001-smoke.mjs
git diff --check
git status --short
```

Expected: smoke test passes, `git diff --check` is silent, and only intentional files are modified.

- [ ] **Step 6: Commit visual or content fixes**

If verification required changes:

```powershell
git add -- lessons/0001-effective-tiles-and-live-counts.html reference/effective-tiles.html tests/lesson-0001-smoke.mjs
git commit -m "fix: polish first efficiency lesson"
```

### Task 7: Deliver the lesson and wait for evidence

**Files:**
- Do not create a learning record yet.

- [ ] **Step 1: Open the finished lesson**

Open `E:\文档\日麻教学\lessons\0001-effective-tiles-and-live-counts.html` for the learner.

- [ ] **Step 2: Ask the learner to complete all three exercises**

Explain that a learning record will be created only after their answers demonstrate that they can distinguish tile kinds, live copies, and shanten priority.

- [ ] **Step 3: Record demonstrated learning in a later turn**

After the learner reports answers or shares results that prove mastery, create:

```markdown
# 能按向听优先比较一次有效牌

学习者已能先排除退向听候选，再区分有效牌种类与扣除已知牌后的剩余枚数。这使后续课程可以把一次进张相同的 `12` 与 `13` 放入二次改良层比较。

## Evidence

第一课三类练习均能给出正确答案和可复核的枚数理由。
```

Save it as `learning-records/0001-shanten-first-and-live-ukeire.md`, then commit:

```powershell
git add -- learning-records/0001-shanten-first-and-live-ukeire.md
git commit -m "docs: record effective tile mastery"
```
