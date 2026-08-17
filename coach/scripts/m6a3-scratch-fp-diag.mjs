// M6-A3 scratch — diagnose tenhou fingerprint_mismatch for the two failed
// acceptance pairs. Computes the LOCAL canonical fingerprint for both games,
// matches them against the two cached report fingerprints (direct + crossed),
// and on mismatch diffs the public-event reductions of both sides to locate
// the first divergence. Console output carries game hashes / tiles / actors
// only — no names, no raw URLs beyond the canonical report endpoints.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const coachRoot = "E:/文档/日麻教学/.claude/worktrees/m6-a3-completion/coach";
process.chdir(coachRoot);

const { mapTenhouRecord } = await import("@riichi-coach/tenhou-source");
const {
  computeCanonicalGameFingerprint,
  computeMortalGameFingerprint,
  parseMjaiTile,
} = await import("@riichi-coach/mortal-source");
const { sortTilesCanonical } = await import("@riichi-coach/contracts");

const CORPUS = "C:/Users/Roland/.claude/jobs/fa6fe5a3/tmp/tenhou-corpus/raw";
const GAMES = [
  { key: "A", log: "2026080915gm-00a9-0000-96188b15", gameId: "tenhou-g:02720fd29971d484", reportId: "1c5b43fb0c97afdf", reportFp: "mortal-game-fingerprint/v2:sha256:a5a12b978301db6e7ae9258d0db07f2d52551dcf9d586088ad7541c28b1e8745" },
  { key: "B", log: "2026081302gm-00a9-0000-547a4838", gameId: "tenhou-g:f7138da534e84e0b", reportId: "ced070bc137f20ab", reportFp: "mortal-game-fingerprint/v2:sha256:e69f546924739081754f7b689f6dbc52f2cad61cceb0cf89829223d351b13722" },
];

// --- clone of the report-fingerprint reductions (validated below) ---
const tFp = (t) => [t.id, t.red];
const mjaiTile = (v) => { const t = parseMjaiTile(v); return { id: t.id, red: t.red }; };
const mjaiConsumed = (a, n) => sortTilesCanonical(a.consumed.map(mjaiTile)).map(tFp);
const normActor = (v) => { if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 3) throw new Error(`actor_invalid:${JSON.stringify(v)}`); return v; };

function mjaiReduce(log) {
  const out = [];
  for (const e of log) {
    if (e === null || typeof e !== "object" || Array.isArray(e)) continue;
    switch (e.type) {
      case "start_game": out.push(["game_start"]); break;
      case "start_kyoku": out.push(["round_start", e.bakaze, normActor(e.oya), e.honba, e.kyotaku, [...e.scores], ...tFp(mjaiTile(e.dora_marker))]); break;
      case "dahai": out.push(["discard", normActor(e.actor), ...tFp(mjaiTile(e.pai)), e.tsumogiri === true]); break;
      case "chi": case "pon": case "daiminkan": out.push([e.type, normActor(e.actor), normActor(e.target), ...tFp(mjaiTile(e.pai)), mjaiConsumed(e, e.type === "daiminkan" ? 3 : 2)]); break;
      case "ankan": out.push(["ankan", normActor(e.actor), mjaiConsumed(e, 4)]); break;
      case "kakan": out.push(["kakan", normActor(e.actor), ...tFp(mjaiTile(e.pai))]); break;
      case "reach": out.push(["riichi_declared", normActor(e.actor)]); break;
      case "reach_accepted": out.push(["riichi_accepted", normActor(e.actor)]); break;
      case "hora": out.push(["win", normActor(e.actor), normActor(e.target)]); break;
      case "end_kyoku": out.push(["round_end"]); break;
      case "end_game": out.push(["game_end"]); break;
      default: break;
    }
  }
  return out;
}

function canonicalReduce(stream) {
  const out = [];
  for (const e of stream.events) {
    switch (e.type) {
      case "game_started": out.push(["game_start"]); break;
      case "round_started": out.push(["round_start", e.roundWind, e.dealer, e.honba, e.riichiSticks, [...e.scores], ...tFp(e.doraIndicator)]); break;
      case "tile_discarded": out.push(["discard", e.actor, ...tFp(e.tile), e.discardMode === "tsumogiri"]); break;
      case "chi_called": case "pon_called": case "daiminkan_called":
        out.push([e.type === "chi_called" ? "chi" : e.type === "pon_called" ? "pon" : "daiminkan", e.actor, e.targetActor, ...tFp(e.calledTile), sortTilesCanonical(e.consumedTiles).map(tFp)]); break;
      case "ankan_declared": out.push(["ankan", e.actor, sortTilesCanonical(e.tiles).map(tFp)]); break;
      case "kakan_declared": out.push(["kakan", e.actor, ...tFp(e.addedTile)]); break;
      case "riichi_declared": case "riichi_accepted": out.push([e.type, e.actor]); break;
      case "win_declared": out.push(["win", e.winnerActor, e.targetActor ?? e.winnerActor]); break;
      case "round_ended": out.push(["round_end"]); break;
      case "game_ended": out.push(["game_end"]); break;
      default: break;
    }
  }
  return out;
}

const cloneFp = (events) => `mortal-game-fingerprint/v3:sha256:${createHash("sha256").update(JSON.stringify(events)).digest("hex")}`;

// --- local side ---
const locals = [];
for (const g of GAMES) {
  const raw = await readFile(`${CORPUS}/${g.log}.xml`, "utf8");
  const digest = createHash("sha256").update(raw, "utf8").digest("hex");
  const gameId = `tenhou-g:${digest.slice(0, 16)}`;
  const mapped = mapTenhouRecord({ raw, gameId, selfActor: 0 });
  if (mapped.status !== "ready") { console.log(`${g.key} MAP FAIL ${mapped.status}`); process.exit(1); }
  const pkgFp = computeCanonicalGameFingerprint(mapped.stream);
  const events = canonicalReduce(mapped.stream);
  const myFp = cloneFp(events);
  console.log(`${g.key} local: gameId=${gameId} (expect ${g.gameId}) pkgFp=${pkgFp.slice(-16)} cloneMatchesPkg=${myFp === pkgFp} events=${events.length}`);
  locals.push({ ...g, events, fp: pkgFp });
}

// --- report side ---
for (const l of locals) {
  const res = await fetch(`https://mjai.ekyu.moe/report/${l.reportId}.json`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36", Accept: "application/json" } });
  if (!res.ok) { console.log(`${l.key} report fetch FAIL ${res.status}`); process.exit(1); }
  const body = await res.json();
  const pkgFp = computeMortalGameFingerprint(body.mjai_log);
  const events = mjaiReduce(body.mjai_log);
  const myFp = cloneFp(events);
  console.log(`${l.key} report ${l.reportId}: pkgFp=${pkgFp.slice(-16)} cloneMatchesPkg=${myFp === pkgFp} cachedFpMatch=${pkgFp === l.reportFp} playerId=${body.player_id} events=${events.length}`);
  l.reportEvents = events;
  l.reportPkgFp = pkgFp;
}

// --- match matrix ---
console.log("\n=== match matrix (local vs report pkgFp tail) ===");
for (const l of locals) {
  for (const r of locals) {
    console.log(`local ${l.key}(${l.fp.slice(-12)}) vs report ${r.key}(${r.reportPkgFp.slice(-12)}): ${l.fp === r.reportPkgFp ? "MATCH" : "no"}`);
  }
}

// --- first divergence per aligned pairing (same-letter first, then crossed) ---
function diff(label, localEv, reportEv) {
  const n = Math.max(localEv.length, reportEv.length);
  for (let i = 0; i < n; i++) {
    const a = JSON.stringify(localEv[i]); const b = JSON.stringify(reportEv[i]);
    if (a !== b) {
      console.log(`\n=== ${label} first divergence at index ${i} ===`);
      for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) {
        console.log(`  [${j}] local : ${JSON.stringify(localEv[j])}`);
        console.log(`  [${j}] report: ${JSON.stringify(reportEv[j])}`);
      }
      return;
    }
  }
  if (localEv.length !== reportEv.length) {
    console.log(`\n=== ${label}: prefix identical, lengths differ local=${localEv.length} report=${reportEv.length} ===`);
    const i = Math.min(localEv.length, reportEv.length);
    for (let j = Math.max(0, i - 2); j < Math.min(n, i + 3); j++) {
      console.log(`  [${j}] local : ${JSON.stringify(localEv[j])}`);
      console.log(`  [${j}] report: ${JSON.stringify(reportEv[j])}`);
    }
  } else {
    console.log(`\n=== ${label}: IDENTICAL ===`);
  }
}
for (const l of locals) diff(`${l.key}local vs ${l.key}report`, l.events, l.reportEvents);
for (const l of locals) for (const r of locals) if (l !== r) diff(`${l.key}local vs ${r.key}report`, l.events, r.reportEvents);
