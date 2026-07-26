import { analyzeDiscards, parseCompactHand, TILE_IDS } from "../lib/mahjong.mjs";

const NAMES = {
  "1m":"一万","2m":"二万","3m":"三万","4m":"四万","5m":"五万","6m":"六万","7m":"七万","8m":"八万","9m":"九万",
  "1p":"一筒","2p":"二筒","3p":"三筒","4p":"四筒","5p":"五筒","6p":"六筒","7p":"七筒","8p":"八筒","9p":"九筒",
  "1s":"一索","2s":"二索","3s":"三索","4s":"四索","5s":"五索","6s":"六索","7s":"七索","8s":"八索","9s":"九索",
  "1z":"东","2z":"南","3z":"西","4z":"北","5z":"白","6z":"发","7z":"中"
};

const drills = [
  { hand:"123456m789p23s55z9s" },
  { hand:"234567m1345p46s66z" },
  { hand:"12324m4569p789s55z" },
  { hand:"3459m12678p123s77z" },
  { hand:"123456m1239p67s55z" },
  { hand:"1334m5567p6789s44z" },
  { hand:"24m123456p3459s66z" },
  { hand:"1456789m234p13s22z" },
  { hand:"12234m345p567s77z9p" },
  { hand:"12368m1789p345s55z" },
  { hand:"123456m1234p67s55z" },
  { hand:"2345m234567p78s66z" },
  { hand:"1349m46p345678s77z" },
  { hand:"12335m234p5679s66z" },
  { hand:"1456m6789p1234s55z" },
  { hand:"1789m12234p456s77z" },
  { hand:"123345m1567p79s22z" },
  { hand:"13m234456p6789s55z" },
  { hand:"1345m24567p789s66z" },
  { hand:"1456m13678p123s55z" }
];

const handElement = document.getElementById("drill-hand");
const feedback = document.getElementById("drill-feedback");
const nextButton = document.getElementById("next-drill");
const numberElement = document.getElementById("drill-number");
const scoreElement = document.getElementById("drill-score");
const timerElement = document.getElementById("drill-timer");
let current = 0;
let correctCount = 0;
let answeredCount = 0;
let locked = false;
let startedAt = Date.now();
let timerHandle;

function image(id) {
  return `<img class="tile" src="assets/tiles/${id}.svg" alt="${NAMES[id]}">`;
}

function idsFromHand(text) {
  const counts = parseCompactHand(text);
  const ids = [];
  counts.forEach((count,index) => { for (let copy = 0; copy < count; copy += 1) ids.push(TILE_IDS[index]); });
  if (ids.length !== 14) throw new Error(`drill hand must contain fourteen tiles: ${text}`);
  return { counts, ids };
}

function renderDrill() {
  locked = false;
  nextButton.disabled = true;
  feedback.textContent = "点击一张牌作答。";
  feedback.dataset.state = "";
  numberElement.textContent = `第 ${current + 1} / ${drills.length} 题`;
  const { ids } = idsFromHand(drills[current].hand);
  handElement.innerHTML = ids.map((id,index) => `<button class="tile-button" data-index="${index}" data-id="${id}" aria-label="舍${NAMES[id]}">${image(id)}</button>`).join("");
  handElement.querySelectorAll("[data-index]").forEach((button) => button.addEventListener("click", () => answer(button.dataset.id)));
  startedAt = Date.now();
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    timerElement.textContent = `${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`;
  }, 100);
}

function answer(discardId) {
  if (locked) return;
  locked = true;
  clearInterval(timerHandle);
  const { counts } = idsFromHand(drills[current].hand);
  const analysis = analyzeDiscards(counts);
  const bestShanten = analysis[0].shanten;
  const bestUkeire = analysis[0].ukeire;
  const best = analysis.filter((item) => item.shanten === bestShanten && item.ukeire === bestUkeire);
  const chosen = analysis.find((item) => item.discard === discardId);
  const correct = best.some((item) => item.discard === discardId);
  answeredCount += 1;
  if (correct) correctCount += 1;
  scoreElement.textContent = `正确 ${correctCount} / ${answeredCount}`;
  const bestNames = best.map((item) => NAMES[item.discard]).join("、");
  const chosenText = chosen ? `${chosen.shanten === 0 ? "听牌" : `${chosen.shanten} 向听`}，直接进张 ${chosen.ukeire} 枚` : "不可分析";
  feedback.textContent = `${correct ? "正确。" : "错误。"}你选择${NAMES[discardId]}：${chosenText}。本题直接层最优舍牌：${bestNames}；最优进张 ${bestUkeire} 枚。`;
  feedback.dataset.state = correct ? "correct" : "wrong";
  nextButton.disabled = false;
}

nextButton.addEventListener("click", () => {
  current = (current + 1) % drills.length;
  renderDrill();
});
document.getElementById("restart-drills").addEventListener("click", () => {
  current = 0;
  correctCount = 0;
  answeredCount = 0;
  scoreElement.textContent = "正确 0 / 0";
  renderDrill();
});

renderDrill();
