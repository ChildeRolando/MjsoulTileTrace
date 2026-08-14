import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "protobufjs";

// Derives the sanitized real-record fixtures from the raw 86KB capture written
// by --diagnose-mahjong-soul-capture-record (%TEMP%/mahjong-soul-captured-record.pb).
//
// Sanitization keeps the wire structure (outer Wrapper, GameAction.result
// Wrapper, empty results and their ordinals) and only the fields the mapper
// consumes. Everything that can fingerprint the original game is dropped:
// md5, paishan, sha256, salt, opens, operations, zhenting, tile_states, muyu,
// the full hule hands, and every other unused field.
//
// Usage: node scripts/generate-mahjong-soul-real-fixtures.mjs [raw.pb]

const protoPath = resolve(
  "vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto",
);
const rawPath = process.argv[2] ?? join(tmpdir(), "mahjong-soul-captured-record.pb");
const fixturesDir = resolve("packages/mahjong-soul-source/tests/fixtures");

const root = parse(readFileSync(protoPath, "utf8"), { keepCase: true }).root;
const Wrapper = root.lookupType("lq.Wrapper");
const GameAction = root.lookupType("lq.GameAction");
const GDR = root.lookupType("lq.GameDetailRecords");

const raw = readFileSync(rawPath);
const outer = Wrapper.toObject(Wrapper.decode(raw), { bytes: Uint8Array, defaults: true });
if (outer.name !== ".lq.GameDetailRecords") throw new Error(`bad outer wrapper ${outer.name}`);
const gdr = GDR.toObject(GDR.decode(outer.data), { arrays: true, bytes: Uint8Array, defaults: true });
const actions = gdr.actions ?? [];
if (!Array.isArray(actions)) throw new Error("missing actions");

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function sanitize(name, data) {
  switch (name) {
    case ".lq.RecordNewRound":
      return pick(data, ["chang", "ju", "ben", "scores", "liqibang", "doras", "tiles0", "tiles1", "tiles2", "tiles3", "left_tile_count"]);
    case ".lq.RecordDealTile":
      return pick(data, ["seat", "tile", "left_tile_count"]);
    case ".lq.RecordDiscardTile":
      return pick(data, ["seat", "tile", "is_liqi", "moqie"]);
    case ".lq.RecordChiPengGang":
      return pick(data, ["seat", "type", "tiles", "froms"]);
    case ".lq.RecordAnGangAddGang":
      return pick(data, ["seat", "type", "tiles"]);
    case ".lq.RecordHule":
      return {
        ...pick(data, ["delta_scores"]),
        ...(data.hules !== undefined
          ? { hules: data.hules.map((h) => pick(h, ["seat", "zimo", "hu_tile"])) }
          : {}),
      };
    case ".lq.RecordNoTile":
      return data.players !== undefined
        ? { players: data.players.map((p) => pick(p, ["tingpai"])) }
        : {};
    case ".lq.RecordLiuJu":
      return pick(data, ["type"]);
    default:
      throw new Error(`unsanitized action ${name}`);
  }
}

const sanitized = [];
const roundStarts = [];
for (let index = 0; index < actions.length; index += 1) {
  const action = actions[index];
  const result = action?.result;
  if (!(result instanceof Uint8Array) || result.length === 0) {
    sanitized.push(null); // empty result, ordinal preserved
    continue;
  }
  const inner = Wrapper.toObject(Wrapper.decode(result), { bytes: Uint8Array, defaults: true });
  const name = inner.name;
  const type = root.lookupType(name);
  const data = type.toObject(type.decode(inner.data), {
    arrays: true, bytes: Uint8Array, defaults: false,
  });
  const clean = sanitize(name, data);
  if (name === ".lq.RecordNewRound") roundStarts.push(index);
  sanitized.push({ name, data: clean });
}

function encodeActions(list) {
  const gameActions = list.map((entry) => {
    if (entry === null) return GameAction.fromObject({ result: new Uint8Array() });
    const type = root.lookupType(entry.name);
    const bytes = type.encode(type.fromObject(entry.data)).finish();
    const wrapper = Wrapper.encode(Wrapper.fromObject({ name: entry.name, data: bytes })).finish();
    return GameAction.fromObject({ result: wrapper });
  });
  const gdrBytes = GDR.encode(GDR.fromObject({ version: 210715, actions: gameActions })).finish();
  return Wrapper.encode(Wrapper.fromObject({ name: ".lq.GameDetailRecords", data: gdrBytes })).finish();
}

const recordId = "260810-862a740f-2741-45e3-8635-0820fc416f78";
const fixtureA = {
  fixtureVersion: "mahjong-soul-real-record-wire/v1",
  description: "sanitized full 1616-action stored record; 638 empty results, 978 Record* actions, 2 RecordAnGangAddGang",
  recordId,
  wire: Buffer.from(encodeActions(sanitized)).toString("hex"),
};

// Fixture B: the first round without RecordAnGangAddGang / RecordLiuJu.
const boundaries = [...roundStarts, sanitized.length];
let chosen = null;
for (let r = 0; r < roundStarts.length; r += 1) {
  const start = roundStarts[r];
  const end = boundaries[r + 1];
  const slice = sanitized.slice(start, end);
  const unsupported = slice.some((entry) =>
    entry !== null && (entry.name === ".lq.RecordAnGangAddGang" || entry.name === ".lq.RecordLiuJu"));
  if (!unsupported) {
    chosen = { roundIndex: r, start, end, slice };
    break;
  }
}
if (chosen === null) throw new Error("no fully supported round found");

const fixtureB = {
  fixtureVersion: "mahjong-soul-real-supported-round/v1",
  description: `sanitized round ${chosen.roundIndex} (source actions ${chosen.start}..${chosen.end - 1}) with no unsupported action`,
  recordId,
  wire: Buffer.from(encodeActions(chosen.slice)).toString("hex"),
};

writeFileSync(join(fixturesDir, "real-record-wire.json"), JSON.stringify(fixtureA, null, 2) + "\n");
writeFileSync(join(fixturesDir, "real-supported-round.json"), JSON.stringify(fixtureB, null, 2) + "\n");
console.log(`roundStarts=${roundStarts.join(",")}`);
console.log(`chosen round ${chosen.roundIndex}: actions ${chosen.start}..${chosen.end - 1} (${chosen.slice.length} entries)`);
console.log(`fixtureA actions=${sanitized.length}, wireBytes=${fixtureA.wire.length / 2}`);
console.log(`fixtureB actions=${chosen.slice.length}, wireBytes=${fixtureB.wire.length / 2}`);
