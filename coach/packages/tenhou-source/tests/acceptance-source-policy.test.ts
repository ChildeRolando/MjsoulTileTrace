/**
 * Source-policy correction §13 tests: acceptance pair identity is
 * source-aware — (sourceType, gameId, seat) — so a Mahjong Soul sample and a
 * Tenhou sample with the SAME content digest are two distinct pairs, and
 * legacy (pre-correction) Tenhou-only checkpoints still resume.
 */
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_LOCAL_SOURCE_TYPES,
  createEmptyAcceptanceCheckpoint,
  findAcceptancePair,
  MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
  parseAcceptanceCheckpointFile,
  planAcceptanceRun,
  updateCheckpoint,
  upsertAcceptancePair,
  type MortalAcceptancePairRecord,
} from "../src/index.js";
import { MORTAL_COVERAGE_LOCAL_SOURCE_TYPES } from "@riichi-coach/reasoning";

function pair(overrides: Partial<MortalAcceptancePairRecord>): MortalAcceptancePairRecord {
  return {
    gameId: "digest-abc123",
    seat: 0,
    sourceType: "tenhou",
    state: "local_ready",
    attempts: 0,
    failureReason: null,
    evidenceHash: null,
    evidenceVersion: null,
    branches: [],
    updatedAt: null,
    ...overrides,
  };
}

describe("source-aware checkpoint identity (§13)", () => {
  it("the approved-source union matches the manifest schema's authority", () => {
    // The reasoning manifest schema is the authority; this package's local
    // union must never drift from it.
    expect([...ACCEPTANCE_LOCAL_SOURCE_TYPES]).toEqual([
      ...MORTAL_COVERAGE_LOCAL_SOURCE_TYPES,
    ]);
  });

  it("same digest from two platforms is TWO pairs, never a collision", () => {
    let checkpoint = createEmptyAcceptanceCheckpoint();
    checkpoint = upsertAcceptancePair(checkpoint, pair({ sourceType: "tenhou" }));
    checkpoint = upsertAcceptancePair(
      checkpoint,
      pair({
        sourceType: "mahjong_soul",
        state: "accepted",
        evidenceHash: "sha256:abc",
        evidenceVersion: "m6-a3-acceptance/v1",
        branches: ["riichi_window"],
      }),
    );
    expect(checkpoint.pairs).toHaveLength(2);
    expect(
      findAcceptancePair(checkpoint, "digest-abc123", 0, "tenhou")?.state,
    ).toBe("local_ready");
    expect(
      findAcceptancePair(checkpoint, "digest-abc123", 0, "mahjong_soul")?.state,
    ).toBe("accepted");
    // The tenhou lookup must not see the majsoul record even at the same
    // (gameId, seat) — its own evidence stays null.
    const tenhouView = findAcceptancePair(checkpoint, "digest-abc123", 0);
    expect(tenhouView?.state).toBe("local_ready");
    expect(tenhouView?.evidenceHash).toBeNull();
  });

  it("an unknown sourceType fails closed at validation", () => {
    expect(() =>
      upsertAcceptancePair(
        createEmptyAcceptanceCheckpoint(),
        // @ts-expect-error deliberately unknown provenance
        pair({ sourceType: "mortal_mjai" }),
      ),
    ).toThrowError("acceptance_checkpoint_invalid:source_type_unknown");
  });

  it("legacy checkpoints without sourceType parse as tenhou (resumability)", () => {
    const legacyJson = {
      schemaVersion: MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
      budget: null,
      pairs: [{
        gameId: "tenhou-g:old",
        seat: 2,
        state: "mortal_submission_pending",
        attempts: 1,
        failureReason: null,
        evidenceHash: null,
        evidenceVersion: null,
        branches: [],
        updatedAt: null,
      }],
    };
    const parsed = parseAcceptanceCheckpointFile(legacyJson);
    expect(parsed.pairs[0]!.sourceType).toBe("tenhou");
  });

  it("plan identity and checkpoint updates are source-aware too", () => {
    const budget = {
      maxRequestsPerRun: 2,
      baseDelayMs: 1000,
      jitterMs: 500,
      seed: 42,
    };
    // Same (gameId, seat) from both platforms: both get submit slots —
    // one pair must not dedupe the other away.
    const plan = planAcceptanceRun({
      selection: [
        { gameId: "g", seat: 0 },
        { gameId: "g", seat: 0, sourceType: "mahjong_soul" },
      ],
      budget,
    });
    expect(plan.map((item) => item.reason)).toEqual(["submit", "submit"]);
    expect(new Set(plan.map((item) => item.sourceType))).toEqual(
      new Set(["tenhou", "mahjong_soul"]),
    );

    const checkpoint = updateCheckpoint([], "g", 0, "in_flight", 1, "mahjong_soul");
    // A tenhou transition on the same (gameId, seat) is a DIFFERENT pair.
    const both = updateCheckpoint(checkpoint, "g", 0, "failed", 1);
    expect(both).toHaveLength(2);
    expect(both.find((entry) => entry.sourceType === "mahjong_soul")?.status).toBe("in_flight");
    expect(both.find((entry) => entry.sourceType === "tenhou")?.status).toBe("failed");
  });
});
