// Extract H2 game fingerprint (final scores + rules) from the captured .pb
// for matching against amae-koromo's public game list. Private scratch —
// prints only numbers/rules, no identifiers.
import { readFile } from "node:fs/promises";

const coachRoot = "E:/文档/日麻教学/.claude/worktrees/m6-a3-completion/coach";
process.chdir(coachRoot);

const { loadMahjongSoulProtocolBundle, mapMahjongSoulRecord } = await import(
  "@riichi-coach/mahjong-soul-source"
);

const bundle = await loadMahjongSoulProtocolBundle(
  `${coachRoot}/vendor/mahjong-soul-protocol/`,
);
const recordBytes = new Uint8Array(
  await readFile("C:/Users/Roland/AppData/Local/Temp/mahjong-soul-captured-record.pb"),
);
const mapped = mapMahjongSoulRecord({
  gameId: "majsoul-g:44bdd035c352a850",
  selfActor: 1,
  recordId: "majsoul-opaque:44bdd035c352a850",
  recordBytes,
  bundle,
});
if (mapped.status !== "ready") {
  console.log(JSON.stringify({ status: "map_failed", code: mapped.code }));
  process.exit(1);
}

const scoreEvents = [];
for (const event of mapped.stream.events) {
  if (event.type === "game_started" || event.type === "game_ended" || event.type === "round_ended") {
    const json = JSON.stringify(event);
    if (json.includes("score") || json.includes("Score")) {
      scoreEvents.push(event);
    }
  }
}
const last = scoreEvents[scoreEvents.length - 1];
console.log(JSON.stringify({
  status: "ok",
  eventCount: mapped.stream.events.length,
  ruleSet: mapped.stream.ruleSet,
  playerCount: mapped.stream.playerCount,
  scoreEventCount: scoreEvents.length,
  lastScoreEvent: last ?? null,
}, null, 2));
