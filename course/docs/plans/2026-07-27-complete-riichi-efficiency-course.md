# Complete Riichi Efficiency Course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete visual, calculation-backed course that takes the learner from basic shanten/ukeire comparison to fast offensive discard decisions for standard four-mentsu-one-pair hands.

**Architecture:** A local static course uses shared CSS and JavaScript, thirty-four SVG tile assets, twelve self-contained lesson pages, printable references, and a deterministic standard-hand shanten/ukeire engine. Content is progressive and interactive; exact computation establishes truth while pattern drills compress it into fast retrieval.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript ES modules, SVG, JSON, Node.js built-in test runner.

---

## Deliverables

- `index.html`: complete course map, progress overview, and recommended sequence.
- `assets/tiles/`: thirty-four local vector tile images and manifest.
- `assets/course.css`: shared visual system for tile groups, lessons, exercises, and print.
- `assets/course.js`: shared quiz persistence and tile rendering helpers.
- `lib/mahjong.mjs`: standard-hand shanten, effective-tile and live-count functions.
- `tools/generate-tiles.mjs`: deterministic SVG asset generator.
- `tools/build-lessons.mjs`: deterministic course-page generator from complete lesson data.
- `lessons/0001-*.html` through `lessons/0012-*.html`: twelve short interactive lessons.
- `reference/glossary.html`: canonical Chinese vocabulary.
- `reference/decision-model.html`: exact-to-fast discard decision tree.
- `reference/shapes.html`: visual high-frequency shape atlas.
- `reference/effective-tiles.html`: redesigned visual ukeire reference.
- `tests/mahjong-engine.test.mjs`: exact engine test corpus.
- `tests/course-completeness.test.mjs`: asset, lesson, link, alt-text and interaction audit.

## Course sequence

1. 有效牌种与剩余枚数
2. 两面、边张、嵌张：一次进张
3. `12` 与 `13`：二次改良
4. 浮牌价值：从中张到幺九
5. 五牌块与向听数
6. 复合形 `abcd` 与 `abbc`
7. 强化搭子与 `2334`
8. 雀头、两对与复合对子
9. 六牌块：该拆哪一块
10. 可见牌、重复进张与枚数干涉
11. 完整何切词典序
12. 综合色速训练与毕业测验

### Task 1: Add failing completeness and engine tests

- [ ] Create `tests/course-completeness.test.mjs` that requires the index, thirty-four manifest entries, thirty-four SVG files, twelve numbered lessons, three printable references, Chinese alt text for every tile image, no visible compact suit notation in instructional examples, and three choices per quiz.
- [ ] Create `tests/mahjong-engine.test.mjs` with fixed complete, tenpai, one-shanten and two-shanten standard-hand cases plus effective-tile expectations.
- [ ] Run both tests and confirm failures are caused by missing course assets and engine.
- [ ] Commit with `test: specify complete efficiency course`.

### Task 2: Generate and validate vector tile assets

- [ ] Create `tools/generate-tiles.mjs` with explicit metadata for all thirty-four tiles.
- [ ] Generate white rounded SVG tiles: kanji faces for characters and honors, circle pip layouts for dots, and bamboo layouts for bamboos.
- [ ] Write `assets/tiles/manifest.json` containing internal ID, Chinese name and filename for every tile.
- [ ] Run completeness tests until all asset assertions pass.
- [ ] Commit with `feat: add complete vector tile set`.

### Task 3: Implement the exact standard-hand engine

- [ ] Implement `parseCompactHand`, `standardShanten`, `effectiveTiles`, `remainingCopies`, and `analyzeDiscards` in `lib/mahjong.mjs`.
- [ ] Use exhaustive pair selection and recursive mentsu/taatsu decomposition for standard-hand shanten only; explicitly exclude chiitoitsu and kokushi.
- [ ] Make effective tiles include only draws that strictly reduce standard shanten.
- [ ] Make discard analysis sort lexicographically by resulting shanten, then descending live ukeire.
- [ ] Run the engine tests and add regression cases for duplicate tiles and edge waits.
- [ ] Commit with `feat: add standard hand efficiency engine`.

### Task 4: Build the shared visual and interaction system

- [ ] Create `assets/course.css` with responsive tile racks, discard/effective/dead states, accessible focus, print rules, cards and progress navigation.
- [ ] Create `assets/course.js` with `renderTiles`, quiz feedback, local completion storage, and course-wide progress aggregation.
- [ ] Replace the first lesson and effective-tile reference with the shared system.
- [ ] Confirm every specific tile is shown as an SVG image with Chinese alternative text.
- [ ] Commit with `feat: add visual course system`.

### Task 5: Produce all twelve lessons

- [ ] Create `tools/build-lessons.mjs` containing the full title, objective, explanation, worked example, three balanced exercises, answer reasoning, source, previous/next links and retrieval prompt for each lesson.
- [ ] Generate twelve numbered lesson HTML files with no incomplete sections.
- [ ] Ensure lessons 2–10 each begin with a retrieval item from an earlier lesson.
- [ ] Ensure lesson 11 teaches the exact lexicographic model and lesson 12 includes mixed untimed and timed rounds.
- [ ] Run completeness tests and inspect every generated title and navigation link.
- [ ] Commit with `feat: add complete efficiency curriculum`.

### Task 6: Produce the course index and references

- [ ] Create `index.html` with the mission, four learning phases, twelve lesson links, progress state and usage instructions.
- [ ] Create `reference/glossary.html` defining canonical terms used across all lessons.
- [ ] Create `reference/decision-model.html` showing the exact five-layer comparison and its three-to-five-second compression.
- [ ] Create `reference/shapes.html` showing visual comparisons for isolated tiles, waits, `12`, `13`, `24`, `23`, `abcd`, `abbc`, `2334`, two pairs and six-block hands.
- [ ] Update `reference/effective-tiles.html` to use tile graphics and crossed-out known copies.
- [ ] Commit with `docs: add visual efficiency references`.

### Task 7: Validate learning and runtime behavior

- [ ] Run both Node test suites and `git diff --check`.
- [ ] Serve the workspace locally and inspect index plus lessons 1, 3, 6, 9, 11 and 12 at desktop width.
- [ ] Inspect index, lesson 1 and lesson 12 at 390px with no page-level horizontal overflow.
- [ ] Answer one incorrect and one correct choice, verify calculation-based feedback, refresh, and verify persistence.
- [ ] Open every local link in the index and verify no 404.
- [ ] Print-preview all reference documents and confirm tile faces and state markers remain legible.
- [ ] Fix every discovered issue and rerun the full test suite.
- [ ] Commit with `fix: verify complete efficiency course`.

### Task 8: Completion audit and handoff

- [ ] Compare every requirement in both approved design specs against current files and runtime evidence.
- [ ] Confirm the course covers standard-hand offensive efficiency without claiming to cover defense, chiitoitsu or kokushi.
- [ ] Confirm there are no learning records claiming mastery before the learner submits evidence.
- [ ] Open `index.html` in the in-app browser as the user-facing course entry.
- [ ] Report the exact artifacts, test results and recommended starting path.

