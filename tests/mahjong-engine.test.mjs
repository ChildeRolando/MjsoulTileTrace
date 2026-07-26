import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDiscards,
  effectiveTiles,
  parseCompactHand,
  remainingCopies,
  standardShanten
} from "../lib/mahjong.mjs";

test("compact notation parses suited and honor tiles", () => {
  const counts = parseCompactHand("123m456p789s12344z");
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 14);
  assert.equal(counts[0], 1);
  assert.equal(counts[12], 1);
  assert.equal(counts[26], 1);
  assert.equal(counts[27], 1);
  assert.equal(counts[30], 2);
});

test("standard shanten recognizes complete, tenpai and one-shanten hands", () => {
  assert.equal(standardShanten(parseCompactHand("123m123p123s11122z")), -1);
  assert.equal(standardShanten(parseCompactHand("123m123p123s1112z")), 0);
  assert.equal(standardShanten(parseCompactHand("123m456m23p67s55z9p")), 1);
});

test("effective tiles are exactly draws that reduce standard shanten", () => {
  const counts = parseCompactHand("123m456m23p67s55z9p");
  const ids = effectiveTiles(counts).map((item) => item.id);
  assert.deepEqual(ids, ["1p", "4p", "5s", "8s"]);
});

test("remaining copies subtract hand and visible tiles", () => {
  const hand = parseCompactHand("33s");
  const visible = parseCompactHand("3s");
  assert.equal(remainingCopies("3s", hand, visible), 1);
});

test("discard analysis prioritizes lower shanten before live ukeire", () => {
  const hand = parseCompactHand("123m456m789p23s55z9s");
  const analysis = analyzeDiscards(hand);
  assert.equal(analysis[0].discard, "9s");
  assert.equal(analysis[0].shanten, 0);
  assert.equal(analysis[0].ukeire, 8);
});
