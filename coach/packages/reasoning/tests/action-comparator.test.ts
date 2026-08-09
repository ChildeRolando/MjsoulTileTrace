import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  NormalizedDecision,
  SceneSnapshot,
} from "@riichi-coach/contracts";
import {
  DIMENSION_CATALOG,
  DIMENSION_CATALOG_VERSION,
} from "../src/coverage/dimension-catalog.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { compareDecision } from "../src/compare/action-comparator.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function loadRegression(index: 0 | 1): Promise<{
  decision: NormalizedDecision;
  scene: SceneSnapshot;
}> {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const { events, decisions, selfActor } = importRegressionFixture(raw);
  const decision = decisions[index]!;
  return {
    decision,
    scene: replayToDecision(events, decision, selfActor),
  };
}

function replaceActorDiscard(
  scene: SceneSnapshot,
  actor: number,
  eventId: string,
  tileId: "2p" | "6s",
): SceneSnapshot {
  return {
    ...scene,
    rivers: scene.rivers.map((river, riverActor) =>
      river.map((discard) =>
        riverActor === actor && discard.eventId === eventId
          ? {
              ...discard,
              tile: { id: tileId, red: false },
            }
          : discard,
      ),
    ),
  };
}

describe("versioned five-axis dimension coverage", () => {
  it("reports every catalog dimension exactly once with a decision-specific reason", async () => {
    const { decision, scene } = await loadRegression(0);
    const ledger = compareDecision(scene, decision);
    const catalogIds = DIMENSION_CATALOG.map((entry) => entry.id);
    const coverageIds = ledger.coverage.map((entry) => entry.dimension);

    expect(DIMENSION_CATALOG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(new Set(coverageIds)).toEqual(new Set(catalogIds));
    expect(ledger.coverage).toHaveLength(DIMENSION_CATALOG.length);
    expect(ledger.coverage.every((entry) => entry.reason.length > 0)).toBe(true);
    expect(new Set(ledger.coverage.map((entry) => entry.axis))).toEqual(
      new Set(["efficiency", "value", "defense", "placement", "option_value"]),
    );
    expect(catalogIds).toContain("defense.calibrated_dealin_probability");
  });

  it("uses stable catalog dimension IDs for every unknown or unmeasured item", async () => {
    const { decision, scene } = await loadRegression(0);
    const ledger = compareDecision(scene, decision);
    const catalogIds = new Set(DIMENSION_CATALOG.map((entry) => entry.id));
    const expectedUnknowns = ledger.coverage
      .filter(
        (entry) =>
          entry.status === "unsupported" ||
          entry.status === "blocked_by_missing_data",
      )
      .map((entry) => entry.dimension);

    expect(ledger.unknownOrUnmeasured).toEqual(expectedUnknowns);
    expect(
      ledger.unknownOrUnmeasured.every((dimensionId) =>
        catalogIds.has(dimensionId),
      ),
    ).toBe(true);
  });
});

describe("candidate ledgers", () => {
  it.each([0, 1] as const)(
    "records real per-action efficiency and per-threat genbutsu consequences in regression %s",
    async (index) => {
      const { decision, scene } = await loadRegression(index);
      const ledger = compareDecision(scene, decision);

      expect(ledger.candidateLedgers).toHaveLength(decision.candidates.length);
      for (const candidate of ledger.candidateLedgers) {
        expect(Object.keys(candidate.axes)).toEqual([
          "efficiency",
          "value",
          "defense",
          "placement",
          "option_value",
        ]);
        expect(candidate.axes.efficiency.status).toBe("implemented");
        expect(candidate.axes.efficiency.consequence?.shanten).toEqual(
          expect.any(Number),
        );
        expect(candidate.axes.defense.status).toBe("implemented");
        expect(candidate.axes.defense.byThreat.map((item) => item.actor)).toEqual([
          2,
        ]);
        expect(candidate.axes.value).toEqual({
          status: "unsupported",
          consequence: null,
        });
        expect(candidate.axes.placement).toEqual({
          status: "unsupported",
          consequence: null,
        });
        expect(candidate.axes.option_value).toEqual({
          status: "unsupported",
          consequence: null,
        });
      }
    },
  );

  it.each([
    [0, "riichi_ippatsu_alive"],
    [1, "riichi_established"],
  ] as const)(
    "emits replay-grounded neutral riichi state for regression %s",
    async (index, expectedState) => {
      const { decision, scene } = await loadRegression(index);
      const ledger = compareDecision(scene, decision);
      const threatFactors = ledger.neutralFactors.filter(
        (factor) => factor.dimension === "defense.riichi_threat_state",
      );

      expect(threatFactors).toHaveLength(1);
      expect(threatFactors[0]).toMatchObject({
        axis: "defense",
        direction: "neutral",
        magnitude: { kind: "ordinal", value: expectedState },
        provenance: "raw_replay",
        confidence: "certain",
        actors: [2],
      });
      expect(threatFactors[0]?.statement).toContain("actor 2");
      expect(threatFactors[0]?.evidenceIds).toContain("event-47");
      expect(threatFactors[0]?.evidenceIds.at(-1)).toBe(
        scene.decisionEventId,
      );
      if (index === 1) {
        expect(threatFactors[0]?.evidenceIds).toContain("event-58");
      }
    },
  );

  it("keeps an unknown-ippatsu riichi threat without inventing a not-alive statement", async () => {
    const { decision, scene } = await loadRegression(0);
    const unknownIppatsu: SceneSnapshot = {
      ...scene,
      threats: scene.threats.map((threat) => threat.actor === 2
        ? { ...threat, ippatsuAlive: null }
        : threat),
    };
    const ledger = compareDecision(unknownIppatsu, decision);

    expect(ledger.candidateLedgers.every((candidate) =>
      candidate.axes.defense.byThreat.some((threat) => threat.actor === 2)
    )).toBe(true);
    expect([
      ...ledger.supportsModelAction,
      ...ledger.supportsActualAction,
    ].some((factor) => factor.dimension === "defense.per_threat_genbutsu"))
      .toBe(true);
    expect(ledger.neutralFactors.some((factor) =>
      factor.dimension === "defense.riichi_threat_state"
    )).toBe(false);
    expect(ledger.neutralFactors.some((factor) =>
      factor.statement.includes("not alive")
    )).toBe(false);
  });
});

describe("bilateral per-threat comparison", () => {
  it("places deterministic safety on the actual-action side when the actual discard is genbutsu", async () => {
    const { decision, scene } = await loadRegression(0);
    const actualSafeScene = replaceActorDiscard(scene, 2, "event-48", "2p");
    const ledger = compareDecision(actualSafeScene, decision);
    const actualDefense = ledger.supportsActualAction.filter(
      (factor) => factor.axis === "defense",
    );

    expect(actualDefense).toHaveLength(1);
    expect(actualDefense[0]).toMatchObject({
      subjectAction: decision.actualAction,
      comparisonAction: decision.modelAction,
      direction: "supports_subject",
      dimension: "defense.per_threat_genbutsu",
    });
    expect(actualDefense[0]?.statement).toContain("actor 2");
    expect(
      ledger.supportsModelAction.some((factor) => factor.axis === "defense"),
    ).toBe(false);
  });

  it("keeps opposing safety evidence separate for different riichi threats", async () => {
    const { decision, scene } = await loadRegression(0);
    const actorOneDiscard = {
      tile: { id: "2p" as const, red: false },
      actor: 1,
      tsumogiri: false,
      eventId: "event-actor1-2p",
      afterRiichiEventIds: [] as string[],
    };
    const multiThreatScene: SceneSnapshot = {
      ...scene,
      eventIds: [
        ...scene.eventIds.slice(0, -1),
        "event-actor1-reach",
        scene.decisionEventId,
      ],
      threats: scene.threats.map((threat) =>
        threat.actor === 1
          ? {
              actor: 1,
              riichi: true,
              declarationEventId: "event-actor1-reach",
              ippatsuAlive: false,
            }
          : threat,
      ),
      rivers: scene.rivers.map((river, actor) =>
        actor === 1 ? [...river, actorOneDiscard] : river,
      ),
    };
    const ledger = compareDecision(multiThreatScene, decision);
    const modelDefense = ledger.supportsModelAction.filter(
      (factor) => factor.axis === "defense",
    );
    const actualDefense = ledger.supportsActualAction.filter(
      (factor) => factor.axis === "defense",
    );

    expect(modelDefense).toHaveLength(1);
    expect(actualDefense).toHaveLength(1);
    expect(modelDefense[0]?.statement).toContain("actor 2");
    expect(modelDefense[0]?.statement).not.toContain("actor 1");
    expect(actualDefense[0]?.statement).toContain("actor 1");
    expect(actualDefense[0]?.statement).not.toContain("actor 2");
    expect(modelDefense[0]?.magnitude.value).not.toBe("decisive");
    expect(actualDefense[0]?.magnitude.value).not.toBe("decisive");
  });
});
