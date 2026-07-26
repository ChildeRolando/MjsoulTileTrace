import { analyzeDiscards, parseCompactHand, TILE_IDS } from "../lib/mahjong.mjs";

const NAMES = {
  "1m":"一万","2m":"二万","3m":"三万","4m":"四万","5m":"五万","6m":"六万","7m":"七万","8m":"八万","9m":"九万",
  "1p":"一筒","2p":"二筒","3p":"三筒","4p":"四筒","5p":"五筒","6p":"六筒","7p":"七筒","8p":"八筒","9p":"九筒",
  "1s":"一索","2s":"二索","3s":"三索","4s":"四索","5s":"五索","6s":"六索","7s":"七索","8s":"八索","9s":"九索",
  "1z":"东","2z":"南","3z":"西","4z":"北","5z":"白","6z":"发","7z":"中"
};
const selected = [];
const palette = document.getElementById("tile-palette");
const hand = document.getElementById("selected-hand");
const handCount = document.getElementById("hand-count");
const results = document.getElementById("analysis-results");

function image(id, className = "tile") {
  return `<img class="${className}" src="assets/tiles/${id}.svg" alt="${NAMES[id]}">`;
}

function renderPalette() {
  palette.innerHTML = TILE_IDS.map((id) => `<button class="tile-button" data-add="${id}" aria-label="加入${NAMES[id]}">${image(id)}</button>`).join("");
  palette.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.add;
      if (selected.length >= 14 || selected.filter((tile) => tile === id).length >= 4) return;
      selected.push(id);
      selected.sort((left,right) => TILE_IDS.indexOf(left) - TILE_IDS.indexOf(right));
      renderHand();
    });
  });
}

function renderHand() {
  hand.innerHTML = selected.map((id,index) => `<button class="tile-button" data-remove="${index}" aria-label="移除${NAMES[id]}">${image(id)}</button>`).join("");
  handCount.textContent = `${selected.length} / 14`;
  hand.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      selected.splice(Number(button.dataset.remove),1);
      renderHand();
    });
  });
  results.innerHTML = selected.length === 14 ? "<p>手牌已满，可以开始分析。</p>" : "<p>点满十四张牌后开始分析。</p>";
}

function countsFromSelected() {
  const counts = Array(34).fill(0);
  selected.forEach((id) => { counts[TILE_IDS.indexOf(id)] += 1; });
  return counts;
}

function renderAnalysis() {
  if (selected.length !== 14) {
    results.innerHTML = '<p class="note">请先点满十四张牌。</p>';
    return;
  }
  const analysis = analyzeDiscards(countsFromSelected());
  const bestShanten = analysis[0].shanten;
  const bestUkeire = analysis[0].ukeire;
  const rows = analysis.map((item,index) => {
    const effective = item.effective.filter((tile) => tile.remaining > 0)
      .map((tile) => `<span title="${NAMES[tile.id]}剩${tile.remaining}枚">${image(tile.id)}<small>×${tile.remaining}</small></span>`).join("");
    const label = item.shanten === -1 ? "已和牌" : item.shanten === 0 ? "听牌" : `${item.shanten} 向听`;
    const best = item.shanten === bestShanten && item.ukeire === bestUkeire;
    return `<tr${best ? ' class="best-row"' : ""}><td>${index + 1}${best ? " · 最优层" : ""}</td><td><span class="mini-tiles">${image(item.discard)}</span></td><td>${label}</td><td>${item.ukeire} 枚</td><td><span class="mini-tiles">${effective || "无"}</span></td></tr>`;
  }).join("");
  results.innerHTML = `<table class="analysis-table"><thead><tr><th>序</th><th>舍牌</th><th>舍后</th><th>直接进张</th><th>有效牌与剩余</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">同向听、同枚数的并列项，需要回到课程第十一课继续比较进张质量、二次改良与最终形。</p>`;
}

document.getElementById("analyze-button").addEventListener("click", renderAnalysis);
document.getElementById("clear-button").addEventListener("click", () => { selected.splice(0); renderHand(); });
document.getElementById("sample-button").addEventListener("click", () => {
  selected.splice(0);
  const sample = parseCompactHand("123456m789p23s55z9s");
  sample.forEach((count,index) => { for (let copy = 0; copy < count; copy += 1) selected.push(TILE_IDS[index]); });
  renderHand();
});

renderPalette();
renderHand();
