import { summarizeMastery } from "../lib/training.mjs";

const lessonIds = Array.from({length:18}, (_,index) => `lesson-${String(index + 1).padStart(4,"0")}`);
let lessonCount = 0;
for (const lessonId of lessonIds) {
  try {
    const completed = new Set(JSON.parse(localStorage.getItem(`riichi-${lessonId}`) || "[]"));
    if (completed.size === 3) lessonCount += 1;
  } catch {
    continue;
  }
}

let attempts = [];
try {
  attempts = JSON.parse(localStorage.getItem("riichi-trainer-attempts") || "[]");
  if (!Array.isArray(attempts)) attempts = [];
} catch {
  attempts = [];
}

const summary = summarizeMastery(attempts);
const lessonPassed = lessonCount === 18;
const volumePassed = summary.attempts >= 100;
const accuracyPassed = summary.last100Count >= 100 && summary.last100Accuracy >= 0.9;
const speedPassed = summary.last50Count >= 50 && summary.last50MedianMs !== null && summary.last50MedianMs <= 5000;
const allPassed = lessonPassed && volumePassed && accuracyPassed && speedPassed;

document.getElementById("stat-lessons").textContent = `${lessonCount} / 18`;
document.getElementById("stat-attempts").textContent = String(summary.attempts);
document.getElementById("stat-accuracy").textContent = `${Math.round(summary.last100Accuracy * 100)}%`;
document.getElementById("stat-speed").textContent = summary.last50MedianMs === null ? "—" : `${(summary.last50MedianMs / 1000).toFixed(1)} 秒`;
document.getElementById("error-shanten").textContent = `${summary.errors.shanten || 0} 次`;
document.getElementById("error-ukeire").textContent = `${summary.errors.ukeire || 0} 次`;

for (const [id,passed] of [
  ["criterion-lessons",lessonPassed],
  ["criterion-volume",volumePassed],
  ["criterion-accuracy",accuracyPassed],
  ["criterion-speed",speedPassed]
]) {
  document.getElementById(id).classList.toggle("passed",passed);
}

const passedCount = [lessonPassed,volumePassed,accuracyPassed,speedPassed].filter(Boolean).length;
document.getElementById("mastery-meter").style.setProperty("--progress", `${passedCount * 25}%`);
document.getElementById("mastery-verdict").textContent = allPassed
  ? "数据毕业线已达成：现在用真实牌谱继续检验复杂破平能力。"
  : `已通过 ${passedCount} / 4 道门；继续完成未亮起的指标。`;
