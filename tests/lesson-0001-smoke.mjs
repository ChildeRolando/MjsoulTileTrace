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
