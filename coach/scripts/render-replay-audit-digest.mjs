// Renders a mahjong-soul replay audit JSON into a human-readable digest for
// manual comparison against the Mahjong Soul replay viewer.
// Usage: node render-audit-digest.mjs <audit.json> [roundOrdinal...]
import { readFileSync } from "node:fs";

const audit = JSON.parse(readFileSync(process.argv[2], "utf8"));
const onlyRounds = process.argv.slice(3).map(Number);
const tile = (t) => {
  if (t === null || t === undefined) return "？";
  const suffix = t.id.slice(1);
  return (t.red ? "0" : t.id[0]) + suffix; // red five => 0m/0p/0s (majsoul style)
};
const seat = (n) => `S${n}`;
const decisionsByRef = new Map();
(audit.decisions ?? []).forEach((d, i) => decisionsByRef.set(d.decisionEventRef, { i: i + 1, d }));

let roundIndex = -1;
const lines = [];
for (const e of audit.events) {
  const src = Number(e.eventId.split("/")[2]); // sourceRecordOrdinal
  const decision = decisionsByRef.get(e.eventId);
  const dt = decision?.d;
  const ad = dt?.actualDiscard;
  const mark = decision
    ? `   ⟵ 决策#${decision.i}${ad?.tile ? ` 打${tile(ad.tile)}${ad.discardMode === "tsumogiri" ? "(摸切)" : "(手切)"}${dt.currentDraw ? ` 摸${tile(dt.currentDraw)}` : " 无摸牌"}` : ` [字段: ${Object.keys(dt).join(",")}]`}`
    : "";
  switch (e.type) {
    case "round_started": {
      roundIndex += 1;
      const r = audit.rounds[roundIndex];
      const wind = r.roundWind === "E" ? "东" : "南";
      const hand = `${r.selfHand.map(tile).join(" ")}`;
      lines.push("");
      lines.push(`── 局${roundIndex + 1}/${audit.rounds.length}: ${wind}${r.hand}局 ${r.honba}本场 供托${r.riichiSticks} | 亲=${seat(r.dealer)} 宝牌指示=${tile(r.doraIndicator)}`);
      lines.push(`   点数 ${r.scores.map((s, i) => `${seat(i)}:${s}`).join(" ")} | 我的起手(${seat(audit.selfSeat)}): ${hand}`);
      break;
    }
    case "tile_drawn":
      lines.push(`  #${src} ${seat(e.actor)} 摸 ${tile(e.tile)}${mark}`);
      break;
    case "riichi_declared":
      lines.push(`  #${src} ${seat(e.actor)} 立直宣言`);
      break;
    case "tile_discarded":
      lines.push(`  #${src} ${seat(e.actor)} 打 ${tile(e.tile)}${mark}`);
      break;
    case "chi_called":
      lines.push(`  #${src} ${seat(e.actor)} 吃 ${tile(e.tile)} ← ${seat(e.targetActor)}`);
      break;
    case "pon_called":
      lines.push(`  #${src} ${seat(e.actor)} 碰 ${tile(e.tile)} ← ${seat(e.targetActor)}`);
      break;
    case "daiminkan_called":
      lines.push(`  #${src} ${seat(e.actor)} 大明杠 ${tile(e.tile)} ← ${seat(e.targetActor)}`);
      break;
    case "ankan_declared":
      lines.push(`  #${src} ${seat(e.actor)} 暗杠 ${tile(e.tile)}`);
      break;
    case "kakan_declared":
      lines.push(`  #${src} ${seat(e.actor)} 加杠 ${tile(e.tile)}`);
      break;
    case "win_declared":
      lines.push(`  #${src} ${seat(e.winnerActor)} 和 ${tile(e.tile)} ${e.method === "tsumo" ? "自摸" : `荣(放铳 ${seat(e.targetActor)})`}`);
      break;
    case "round_ended":
      lines.push(`  #${src} ══ 局结束 ══`);
      break;
    case "game_ended":
      lines.push(`  #${src} ══ 终局 ${e.scores ? e.scores.map((s, i) => `${seat(i)}:${s}`).join(" ") : ""} ══`);
      break;
    default:
      break;
  }
}
const all = lines.join("\n");
if (onlyRounds.length === 0) {
  console.log(all);
} else {
  // print only the requested round blocks
  const blocks = all.split(/\n(?=── 局)/);
  for (const b of blocks) {
    const m = b.match(/── 局(\d+)\//);
    if (m && onlyRounds.includes(Number(m[1]))) console.log(b);
  }
}
console.error(`\n[audit] selfSeat=${audit.selfSeat} events=${audit.events.length} decisions=${audit.decisions.length} rounds=${audit.rounds.length}`);
