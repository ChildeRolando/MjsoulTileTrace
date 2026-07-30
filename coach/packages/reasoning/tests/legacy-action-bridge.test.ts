import { describe, expect, it } from "vitest";
import {
  actionToLegacyDiscardActionId,
  legacyDiscardActionIdToAction,
} from "../src/candidate/legacy-action-bridge.js";

const regressionActions = [
  "discard:6s:tsumogiri",
  "discard:2p:tedashi",
  "discard:8p:tsumogiri",
  "discard:7p:tedashi",
] as const;

describe("legacy discard action bridge", () => {
  it("maps the four East 1 regression actions to structured discards", () => {
    expect(regressionActions.map((actionId) =>
      legacyDiscardActionIdToAction(actionId)
    )).toEqual([
      {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tsumogiri",
      },
      {
        kind: "discard",
        tile: { id: "2p", red: false },
        discardMode: "tedashi",
      },
      {
        kind: "discard",
        tile: { id: "8p", red: false },
        discardMode: "tsumogiri",
      },
      {
        kind: "discard",
        tile: { id: "7p", red: false },
        discardMode: "tedashi",
      },
    ]);
  });

  it("round-trips ordinary red and non-red legacy discards", () => {
    for (const actionId of [
      ...regressionActions,
      "discard:5pr:tedashi",
      "discard:5p:tedashi",
    ] as const) {
      expect(actionToLegacyDiscardActionId(
        legacyDiscardActionIdToAction(actionId),
      )).toEqual({ status: "ready", actionId });
    }
  });

  it("does not pretend non-ordinary-discard actions are legacy IDs", () => {
    expect(actionToLegacyDiscardActionId({
      kind: "riichi_discard",
      tile: { id: "5p", red: false },
      discardMode: "tedashi",
    })).toEqual({
      status: "unsupported",
      actionKind: "riichi_discard",
    });
    expect(actionToLegacyDiscardActionId({
      kind: "pass",
      responseEventRef: "event:discard",
      responseKind: "discard",
    })).toEqual({
      status: "unsupported",
      actionKind: "pass",
    });
  });
});
