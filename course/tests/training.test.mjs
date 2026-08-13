import assert from "node:assert/strict";
import test from "node:test";
import { generateTrainingVariants, median, summarizeMastery } from "../lib/training.mjs";
import { parseCompactHand } from "../lib/mahjong.mjs";

const baseHands = [
  "123456m789p23s55z9s",
  "234567m1345p46s66z",
  "12324m4569p789s55z",
  "3459m12678p123s77z",
  "123456m1239p67s55z",
  "1334m5567p6789s44z",
  "24m123456p3459s66z",
  "1456789m234p13s22z",
  "12234m345p567s77z9p",
  "12368m1789p345s55z",
  "123456m1234p67s55z",
  "2345m234567p78s66z",
  "1349m46p345678s77z",
  "12335m234p5679s66z",
  "1456m6789p1234s55z",
  "1789m12234p456s77z",
  "123345m1567p79s22z",
  "13m234456p6789s55z",
  "1345m24567p789s66z",
  "1456m13678p123s55z"
];

test("twenty base hands expand to two hundred forty valid variants", () => {
  const variants = generateTrainingVariants(baseHands);
  assert.equal(variants.length, 240);
  assert.deepEqual(variants.slice(0,20).map((variant) => variant.baseIndex), Array.from({length:20},(_,index) => index));
  assert.equal(variants[20].baseIndex, 0, "same structure should return after twenty interleaved questions");
  for (const variant of variants) {
    assert.equal(variant.counts.reduce((sum,count) => sum + count, 0), 14);
    assert.equal(parseCompactHand(variant.compact).reduce((sum,count) => sum + count, 0), 14);
  }
});

test("median handles odd and even samples", () => {
  assert.equal(median([9,1,5]), 5);
  assert.equal(median([8,2,4,6]), 5);
  assert.equal(median([]), null);
});

test("mastery requires volume, accuracy and speed together", () => {
  const passing = Array.from({length:100}, (_,index) => ({
    correct: index >= 8,
    elapsedMs: index < 50 ? 6200 : 4400
  }));
  const passSummary = summarizeMastery(passing);
  assert.equal(passSummary.last100Accuracy, 0.92);
  assert.equal(passSummary.last50MedianMs, 4400);
  assert.equal(passSummary.graduated, true);

  const tooFew = summarizeMastery(passing.slice(0,80));
  assert.equal(tooFew.graduated, false);
});
