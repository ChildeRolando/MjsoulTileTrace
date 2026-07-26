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

test("edge-wait ukeire does not double-count a tile already used elsewhere", () => {
  const counts = parseCompactHand("123m123p123s12s55z");
  assert.equal(standardShanten(counts), 0);
  assert.deepEqual(effectiveTiles(counts).map((item) => [item.id, item.remaining]), [["3s", 3]]);
});

test("a single honor waiting to become the pair has three live copies", () => {
  const counts = parseCompactHand("123m123p123s111z2z");
  assert.equal(standardShanten(counts), 0);
  assert.deepEqual(effectiveTiles(counts).map((item) => [item.id, item.remaining]), [["2z", 3]]);
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

test("advanced one-shanten families have the documented effective sets", () => {
  const standard = parseCompactHand("123m456m23p67s55z9p");
  assert.equal(standardShanten(standard), 1);
  assert.deepEqual(effectiveTiles(standard).map((tile) => tile.id), ["1p","4p","5s","8s"]);

  const headless = parseCompactHand("123m456m789p23s67s");
  assert.equal(standardShanten(headless), 1);
  assert.deepEqual(effectiveTiles(headless).map((tile) => tile.id), ["1s","2s","3s","4s","5s","6s","7s","8s"]);

  const kuttsuki = parseCompactHand("123m456m789p55z3s7s");
  assert.equal(standardShanten(kuttsuki), 1);
  assert.deepEqual(effectiveTiles(kuttsuki).map((tile) => tile.id), ["1s","2s","3s","4s","5s","6s","7s","8s","9s","5z"]);
});

test("complex wait examples enumerate all legal standard-hand waits", () => {
  const nobetan = parseCompactHand("123p456p789s3456m");
  assert.equal(standardShanten(nobetan), 0);
  assert.deepEqual(effectiveTiles(nobetan).map((tile) => tile.id), ["3m","6m"]);

  const sanmenchan = parseCompactHand("123m456p55z23456s");
  assert.equal(standardShanten(sanmenchan), 0);
  assert.deepEqual(effectiveTiles(sanmenchan).map((tile) => tile.id), ["1s","4s","7s"]);

  const entotsu = parseCompactHand("123m456p789s2333m");
  assert.equal(standardShanten(entotsu), 0);
  assert.deepEqual(effectiveTiles(entotsu).map((tile) => tile.id), ["1m","2m","4m"]);
});
