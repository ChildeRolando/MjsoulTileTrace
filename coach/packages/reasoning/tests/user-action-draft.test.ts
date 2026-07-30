import { describe, expect, it } from "vitest";
import {
  parseCompactDraftTile,
  userActionDraftToActionDraft,
} from "../src/candidate/user-action-draft.js";

describe("constrained user action drafts", () => {
  it("keeps a suited five ambiguous unless the red marker is explicit", () => {
    expect(parseCompactDraftTile("5p")).toEqual({ id: "5p" });
    expect(parseCompactDraftTile("5pr")).toEqual({
      id: "5p",
      red: true,
    });
    expect(parseCompactDraftTile("5pn")).toEqual({
      id: "5p",
      red: false,
    });
    expect(parseCompactDraftTile("6s")).toEqual({
      id: "6s",
      red: false,
    });
  });

  it("maps Chinese discard names without inventing missing fields", () => {
    expect(userActionDraftToActionDraft({
      actionName: "切牌",
      tile: "5p",
    })).toEqual({
      kind: "discard",
      tile: { id: "5p" },
    });
    expect(userActionDraftToActionDraft({
      actionName: "立直切牌",
      tile: "5pr",
      discardMode: "tsumogiri",
    })).toEqual({
      kind: "riichi_discard",
      tile: { id: "5p", red: true },
      discardMode: "tsumogiri",
    });
  });

  it("maps call composition and response fields exactly", () => {
    expect(userActionDraftToActionDraft({
      actionName: "吃",
      calledTile: "3m",
      consumedTiles: ["1m", "2m"],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toEqual({
      kind: "chi",
      calledTile: { id: "3m", red: false },
      consumedTiles: [
        { id: "1m", red: false },
        { id: "2m", red: false },
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    });
    expect(userActionDraftToActionDraft({
      actionName: "过",
    })).toEqual({ kind: "pass" });
  });

  it("rejects free-form action names and invalid notation", () => {
    expect(() => userActionDraftToActionDraft({
      actionName: "我觉得应该防守",
    } as never)).toThrow();
    expect(() => parseCompactDraftTile("red-five-p")).toThrow();
  });
});
