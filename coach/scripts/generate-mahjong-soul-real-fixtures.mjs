import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "protobufjs";

// Derives the sanitized real-record fixtures from the raw capture written by
// --diagnose-mahjong-soul-capture-record (%TEMP%/mahjong-soul-captured-record.pb).
//
// INPUT CONTRACT: the CURRENT capture writes the INNER `GameDetailRecords`
// bytes — record-capture.ts already performed the strict outer Wrapper unwrap
// before the file is written, and `result.recordBytes` IS those inner bytes.
// The default input format is therefore "inner": the file is fed straight to
// GDR.decode with no second unwrap. `--input-format outer` is the explicit
// legacy path for pre-unwrap captures and applies the same strict unwrap
// exactly once. There is no "try Wrapper, then GDR" heuristic: feeding outer
// bytes with the default format fails (GDR field 2 is a varint, the Wrapper
// data field is length-delimited).
//
// OUTPUT CONTRACT: the sanitized GameDetailRecords are re-encoded wrapped in
// the outer Wrapper(".lq.GameDetailRecords"), so the committed fixtures keep
// exercising the outer unwrap boundary (unwrapGameDetailRecords) in tests.
//
// Sanitization keeps the wire structure (GameAction.result Wrapper, empty
// results and their ordinals) and only the fields the mapper consumes.
// Everything that can fingerprint the original game is dropped: the real
// record id, md5, paishan, sha256, salt, opens, operations, zhenting,
// tile_states, muyu, the full hule hands, and every other unused field.
//
// Usage: node scripts/generate-mahjong-soul-real-fixtures.mjs [raw.pb]
//          [--input-format inner|outer]   (default: inner)

// P0-2: fixtures never carry the real replay identifier. The synthetic id is
// schema-shaped (MahjongSoulRecordIdSchema) so the full chain — including the
// replay audit, which parses the id strictly — keeps working, while the
// all-zero body makes it visibly non-real. Tests assert against this constant,
// so the real id cannot re-enter silently.
export const SANITIZED_REAL_RECORD_ID = "000000-00000000-0000-0000-0000-000000000001";

const PROTO_RELATIVE_PATH = "vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto";

export function loadProtoRoot(protoPath) {
  return parse(readFileSync(protoPath, "utf8"), { keepCase: true }).root;
}

// Normalize a capture file to the inner GameDetailRecords bytes. `inner` is the
// no-op default (the capture already unwrapped); `outer` strictly unwraps a
// legacy pre-unwrap capture exactly once. Anything else is an error.
export function toInnerBytes(root, raw, inputFormat) {
  if (inputFormat === "inner") {
    if (!(raw instanceof Uint8Array) || raw.length === 0) {
      throw new Error("empty capture input");
    }
    return raw;
  }
  if (inputFormat === "outer") {
    const Wrapper = root.lookupType("lq.Wrapper");
    const outer = Wrapper.toObject(Wrapper.decode(raw), { bytes: Uint8Array, defaults: true });
    if (
      outer.name !== ".lq.GameDetailRecords"
      || !(outer.data instanceof Uint8Array)
      || outer.data.length === 0
    ) {
      throw new Error(`bad outer wrapper ${outer.name}`);
    }
    return outer.data;
  }
  throw new Error(`unknown input format ${inputFormat}`);
}

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

// The fixture pipeline, separated from argv/file IO so the regression test can
// drive it: inner bytes -> sanitized fixtures (identical bytes in, identical
// fixtures out; committed fixtures must regenerate from a fresh capture).
export function deriveSanitizedFixtures(root, innerBytes) {
  const GDR = root.lookupType("lq.GameDetailRecords");
  const Wrapper = root.lookupType("lq.Wrapper");
  const GameAction = root.lookupType("lq.GameAction");
  const gdr = GDR.toObject(GDR.decode(innerBytes), { arrays: true, bytes: Uint8Array, defaults: true });
  const version = gdr.version;
  const actions = gdr.actions ?? [];
  if (!Array.isArray(actions)) throw new Error("missing actions");

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
    // Re-wrap for the repository fixture so tests keep hitting the outer
    // unwrap boundary. The version field is preserved from the capture.
    const gdrBytes = GDR.encode(GDR.fromObject({ version, actions: gameActions })).finish();
    return Wrapper.encode(Wrapper.fromObject({ name: ".lq.GameDetailRecords", data: gdrBytes })).finish();
  }

  const decodedCount = sanitized.filter((entry) => entry !== null).length;
  const emptyCount = sanitized.length - decodedCount;
  const angangCount = sanitized.filter((entry) =>
    entry !== null && entry.name === ".lq.RecordAnGangAddGang"
  ).length;
  const fixtureA = {
    fixtureVersion: "mahjong-soul-real-record-wire/v1",
    description: `sanitized full ${sanitized.length}-action stored record; ${emptyCount} empty results, ${decodedCount} Record* actions, ${angangCount} RecordAnGangAddGang`,
    recordId: SANITIZED_REAL_RECORD_ID,
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
    recordId: SANITIZED_REAL_RECORD_ID,
    wire: Buffer.from(encodeActions(chosen.slice)).toString("hex"),
  };

  return {
    fixtureA,
    fixtureB,
    stats: {
      roundStarts,
      chosenRound: chosen.roundIndex,
      chosenStart: chosen.start,
      chosenEnd: chosen.end,
      totalActions: sanitized.length,
      decodedCount,
      emptyCount,
    },
  };
}

function main() {
  const positional = [];
  let inputFormat = "inner";
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--input-format") {
      const next = process.argv[index + 1];
      if (next !== "inner" && next !== "outer") {
        throw new Error("--input-format must be inner or outer");
      }
      inputFormat = next;
      index += 1;
    } else {
      positional.push(arg);
    }
  }
  const rawPath = positional[0] ?? join(tmpdir(), "mahjong-soul-captured-record.pb");
  const root = loadProtoRoot(resolve(PROTO_RELATIVE_PATH));
  const fixturesDir = resolve("packages/mahjong-soul-source/tests/fixtures");
  const innerBytes = toInnerBytes(root, readFileSync(rawPath), inputFormat);
  const { fixtureA, fixtureB, stats } = deriveSanitizedFixtures(root, innerBytes);
  writeFileSync(join(fixturesDir, "real-record-wire.json"), JSON.stringify(fixtureA, null, 2) + "\n");
  writeFileSync(join(fixturesDir, "real-supported-round.json"), JSON.stringify(fixtureB, null, 2) + "\n");
  console.log(`inputFormat=${inputFormat} raw=${rawPath}`);
  console.log(`roundStarts=${stats.roundStarts.join(",")}`);
  console.log(`chosen round ${stats.chosenRound}: actions ${stats.chosenStart}..${stats.chosenEnd - 1}`);
  console.log(`fixtureA actions=${stats.totalActions}, empty=${stats.emptyCount}, decoded=${stats.decodedCount}, wireBytes=${fixtureA.wire.length / 2}`);
  console.log(`fixtureB actions=${stats.chosenEnd - stats.chosenStart}, wireBytes=${fixtureB.wire.length / 2}`);
}

if (
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
