import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { FactorEvidence } from "@riichi-coach/contracts";
import { compareDecision } from "../src/compare/action-comparator.js";
import {
  buildReplayEvidenceRegistry,
  type ReplayEvidenceRegistry,
} from "../src/evidence/evidence-registry.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function loadRegression(index: 0 | 1) {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const imported = importRegressionFixture(raw);
  const decision = imported.decisions[index]!;
  const scene = replayToDecision(imported.events, decision, imported.selfActor);
  const ledger = compareDecision(scene, decision);
  const factors = [
    ...ledger.supportsModelAction,
    ...ledger.supportsActualAction,
    ...ledger.neutralFactors,
  ];
  return { ...imported, decision, scene, factors };
}

function referencedEvidenceIds(factors: readonly FactorEvidence[]): string[] {
  return [...new Set(factors.flatMap((factor) => factor.evidenceIds))].sort();
}

describe("replay evidence registry", () => {
  it.each([0, 1] as const)(
    "resolves every factor evidence ID to a visible replay event in regression %s",
    async (index) => {
      const { events, scene, factors } = await loadRegression(index);
      const registry = buildReplayEvidenceRegistry({
        events,
        visibleEventIds: scene.eventIds,
        factors,
      });

      expect(Object.keys(registry).sort()).toEqual(
        referencedEvidenceIds(factors),
      );
      for (const evidenceId of referencedEvidenceIds(factors)) {
        expect(registry[evidenceId]).toMatchObject({
          evidenceId,
          kind: "replay_event",
          provenance: "raw_replay",
          event: { eventId: evidenceId },
        });
      }
    },
  );

  it("rejects factor evidence that points past the decision boundary", async () => {
    const { events, scene, factors } = await loadRegression(0);
    const futureFactor: FactorEvidence = {
      ...factors[0]!,
      factorId: "factor:future-event",
      evidenceIds: ["event-62"],
    };

    expect(() =>
      buildReplayEvidenceRegistry({
        events,
        visibleEventIds: scene.eventIds,
        factors: [futureFactor],
      }),
    ).toThrow(/not visible at the decision/);
  });

  it("rejects duplicate event IDs instead of choosing one silently", async () => {
    const { events, scene, factors } = await loadRegression(0);
    const duplicated = [...events, events[0]!];

    expect(() =>
      buildReplayEvidenceRegistry({
        events: duplicated,
        visibleEventIds: scene.eventIds,
        factors,
      }),
    ).toThrow(/Duplicate replay evidence ID/);
  });

  it("exposes an object registry rather than dangling factor IDs", async () => {
    const { events, scene, factors } = await loadRegression(0);
    const registry: ReplayEvidenceRegistry = buildReplayEvidenceRegistry({
      events,
      visibleEventIds: scene.eventIds,
      factors,
    });

    expect(Object.values(registry).every((node) => node.event.eventId)).toBe(
      true,
    );
  });
});
