import { describe, expect, it } from "vitest";
import type {
  TypedActionAdapterPort,
} from "@riichi-coach/contracts";
import {
  normalizeCandidate,
  runTypedActionAdapter,
} from "../src/index.js";
import {
  adaptMjaiActionSequence,
} from "../src/import/mjai-action.js";

const context = {
  decisionWindow: {
    kind: "self_turn" as const,
    actor: 3,
    triggerEventRef: "event:draw",
  },
};

describe("typed action adapter port", () => {
  it("makes an Akagi fixture conform without defining private JSON", () => {
    type AkagiConformanceFixture = {
      tile: { id: "6s"; red: false };
      mode: "tsumogiri";
    };
    const akagiPort: TypedActionAdapterPort<AkagiConformanceFixture> = {
      sourceType: "akagi_native",
      adapt: (fixture) => ({
        status: "ready",
        sourceType: "akagi_native",
        draft: {
          kind: "discard",
          tile: fixture.tile,
          discardMode: fixture.mode,
        },
        factRefs: ["akagi-fixture:discard"],
      }),
    };
    const akagi = runTypedActionAdapter(
      akagiPort,
      {
        tile: { id: "6s", red: false },
        mode: "tsumogiri",
      },
      context,
    );
    const mjai = adaptMjaiActionSequence([
      {
        eventRef: "event:dahai",
        action: {
          type: "dahai",
          actor: 3,
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], context);
    if (akagi.status !== "ready" || mjai.status !== "ready") {
      throw new Error("conformance adapters did not return drafts");
    }
    const facts = {
      decisionWindow: context.decisionWindow,
      concealedTiles: [],
      currentDraw: {
        tile: { id: "6s" as const, red: false },
        eventRef: "event:draw",
      },
    };
    const akagiCandidate = normalizeCandidate({
      draft: akagi.draft,
      origin: "model",
      facts,
    });
    const mjaiCandidate = normalizeCandidate({
      draft: mjai.draft,
      origin: "model",
      facts,
    });
    if (
      akagiCandidate.status !== "ready" ||
      mjaiCandidate.status !== "ready"
    ) {
      throw new Error("conformance drafts did not normalize");
    }

    expect(akagiCandidate.candidate.action).toEqual(
      mjaiCandidate.candidate.action,
    );
    expect(akagiCandidate.candidate.actionRef).toBe(
      mjaiCandidate.candidate.actionRef,
    );
  });

  it("rejects a port that returns a different source identity", () => {
    const forged: TypedActionAdapterPort<null> = {
      sourceType: "akagi_native",
      adapt: () => ({
        status: "unsupported",
        sourceType: "mjai",
      }),
    };
    expect(() => runTypedActionAdapter(forged, null, context)).toThrow(
      /source identity/,
    );
  });
});
