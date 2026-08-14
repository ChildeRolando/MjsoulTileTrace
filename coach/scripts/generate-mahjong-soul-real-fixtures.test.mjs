import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveSanitizedFixtures,
  loadProtoRoot,
  SANITIZED_REAL_RECORD_ID,
  toInnerBytes,
} from "./generate-mahjong-soul-real-fixtures.mjs";

const registerTest = process.env.VITEST === "true"
  ? (await import("vitest")).test
  : (await import("node:test")).test;

const coachRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const protoPath = path.join(
  coachRoot,
  "vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto",
);
const fixturesDir = path.join(
  coachRoot,
  "packages/mahjong-soul-source/tests/fixtures",
);

function readFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"));
}

// The committed fixtures are outer-wrapped: they double as a stand-in for the
// bytes a CURRENT capture hands to the generator once unwrapped, without
// depending on any legacy %TEMP% capture file.
const committedA = readFixture("real-record-wire");
const committedB = readFixture("real-supported-round");
const root = loadProtoRoot(protoPath);
const innerBytes = toInnerBytes(
  root,
  Uint8Array.from(Buffer.from(committedA.wire, "hex")),
  "outer",
);

registerTest("generator regenerates the committed fixtures from inner bytes", () => {
  const { fixtureA, fixtureB, stats } = deriveSanitizedFixtures(root, innerBytes);

  assert.equal(fixtureA.wire, committedA.wire);
  assert.equal(fixtureB.wire, committedB.wire);
  assert.equal(fixtureA.description, committedA.description);
  assert.equal(fixtureB.description, committedB.description);
  assert.equal(fixtureA.recordId, SANITIZED_REAL_RECORD_ID);
  assert.equal(fixtureB.recordId, SANITIZED_REAL_RECORD_ID);

  assert.equal(stats.totalActions, 1616);
  assert.equal(stats.emptyCount, 638);
  assert.equal(stats.decodedCount, 978);
  assert.equal(stats.chosenRound, 0);
  assert.equal(stats.chosenStart, 9);
  assert.equal(stats.chosenEnd, 123);
});

registerTest("inner and outer input formats converge on identical fixtures", () => {
  // Current contract: a fresh capture already unwrapped, bytes go straight in.
  const viaInner = deriveSanitizedFixtures(root, innerBytes);
  // Legacy contract: a pre-unwrap capture, unwrapped exactly once via --input-format outer.
  const viaLegacyOuter = deriveSanitizedFixtures(
    root,
    toInnerBytes(root, Uint8Array.from(Buffer.from(committedA.wire, "hex")), "outer"),
  );
  assert.deepEqual(viaInner, viaLegacyOuter);
});

registerTest("outer bytes fed as inner fail instead of heuristic-decoding", () => {
  const outerBytes = Uint8Array.from(Buffer.from(committedA.wire, "hex"));
  // toInnerBytes(inner) is a no-op passthrough; the failure must come from
  // GDR.decode refusing the Wrapper layout (field 2 wire-type mismatch).
  const passedThrough = toInnerBytes(root, outerBytes, "inner");
  assert.throws(() => deriveSanitizedFixtures(root, passedThrough));
});

registerTest("unknown input format is rejected", () => {
  assert.throws(() => toInnerBytes(root, innerBytes, "auto"));
});
