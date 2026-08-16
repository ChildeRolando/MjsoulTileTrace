import { describe, expect, it } from "vitest";
import {
  canTransitionAcceptance,
  createEmptyAcceptanceCheckpoint,
  findAcceptancePair,
  isTerminalAcceptanceState,
  MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
  MORTAL_ACCEPTANCE_PIPELINE_STATES,
  parseAcceptanceCheckpointFile,
  transitionAcceptanceState,
  upsertAcceptancePair,
  type MortalAcceptanceState,
} from "../src/acceptance-state.js";

function pairRecord(overrides: Partial<Parameters<typeof upsertAcceptancePair>[1]> = {}) {
  return {
    gameId: "tenhou-g:abc123",
    seat: 2,
    state: "local_ready" as const,
    attempts: 0,
    failureReason: null,
    evidenceHash: null,
    evidenceVersion: null,
    branches: [] as string[],
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("acceptance transition legality (§5)", () => {
  it("walks the full pipeline in order", () => {
    let state: MortalAcceptanceState = "local_ready";
    for (const [event, expected] of [
      ["select_for_submission", "mortal_submission_pending"],
      ["submission_confirmed", "mortal_submitted"],
      ["poll_started", "report_pending"],
      ["report_fetched", "report_ready"],
      ["review_finished", "review_complete"],
      ["evidence_recorded", "accepted"],
    ] as const) {
      state = transitionAcceptanceState(state, event);
      expect(state).toBe(expected);
    }
  });

  it("rejects skipping a stage (accepted straight from report_ready)", () => {
    expect(() =>
      transitionAcceptanceState("report_ready", "evidence_recorded"),
    ).toThrow("acceptance_transition_invalid:report_ready:evidence_recorded");
  });

  it("rejects going backwards", () => {
    expect(() =>
      transitionAcceptanceState("mortal_submitted", "select_for_submission"),
    ).toThrow();
    expect(() =>
      transitionAcceptanceState("accepted", "retry"),
    ).toThrow("acceptance_transition_invalid:accepted:retry");
  });

  it("allows fail from every live state and retry only from failed", () => {
    for (const state of MORTAL_ACCEPTANCE_PIPELINE_STATES) {
      if (state === "accepted") continue; // terminal — evidence is durable
      expect(canTransitionAcceptance(state, "fail")).toBe(true);
    }
    expect(canTransitionAcceptance("accepted", "fail")).toBe(false);
    expect(transitionAcceptanceState("report_pending", "fail")).toBe("failed");
    expect(transitionAcceptanceState("failed", "retry")).toBe("local_ready");
    expect(canTransitionAcceptance("local_ready", "retry")).toBe(false);
  });

  it("treats accepted and failed as terminal", () => {
    expect(isTerminalAcceptanceState("accepted")).toBe(true);
    expect(isTerminalAcceptanceState("failed")).toBe(true);
    expect(isTerminalAcceptanceState("report_pending")).toBe(false);
  });
});

describe("acceptance checkpoint records", () => {
  it("upserts keyed by (gameId, seat) and finds back", () => {
    let file = createEmptyAcceptanceCheckpoint();
    file = upsertAcceptancePair(file, pairRecord());
    file = upsertAcceptancePair(
      file,
      pairRecord({ state: "failed", failureReason: "poll_exhausted", attempts: 1 }),
    );
    expect(file.pairs).toHaveLength(1);
    const found = findAcceptancePair(file, "tenhou-g:abc123", 2);
    expect(found?.state).toBe("failed");
    expect(findAcceptancePair(file, "tenhou-g:abc123", 0)).toBeNull();
  });

  it("fails closed on impossible records", () => {
    expect(() =>
      upsertAcceptancePair(
        createEmptyAcceptanceCheckpoint(),
        pairRecord({ state: "accepted", evidenceHash: null, evidenceVersion: null }),
      ),
    ).toThrow("acceptance_checkpoint_invalid:accepted_without_evidence");
    expect(() =>
      upsertAcceptancePair(
        createEmptyAcceptanceCheckpoint(),
        pairRecord({ state: "failed", failureReason: null }),
      ),
    ).toThrow("acceptance_checkpoint_invalid:failed_without_reason");
    expect(() =>
      upsertAcceptancePair(
        createEmptyAcceptanceCheckpoint(),
        pairRecord({ evidenceHash: "sha256:x", evidenceVersion: "v1" }),
      ),
    ).toThrow("acceptance_checkpoint_invalid:evidence_on_unaccepted_pair");
    expect(() =>
      upsertAcceptancePair(
        createEmptyAcceptanceCheckpoint(),
        pairRecord({ seat: 9 }),
      ),
    ).toThrow("acceptance_checkpoint_invalid:seat_out_of_range");
  });

  it("round-trips through parseAcceptanceCheckpointFile", () => {
    let file = createEmptyAcceptanceCheckpoint();
    file = upsertAcceptancePair(
      file,
      pairRecord({
        state: "accepted",
        evidenceHash: "sha256:abc",
        evidenceVersion: "m6-a3-acceptance/v1",
        branches: ["riichi_window", "post_call_chi"],
      }),
    );
    const parsed = parseAcceptanceCheckpointFile(
      JSON.parse(JSON.stringify(file)),
    );
    expect(parsed.schemaVersion).toBe(MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION);
    expect(parsed.pairs[0]?.branches).toEqual(["riichi_window", "post_call_chi"]);
  });

  it("rejects a foreign or corrupt checkpoint file", () => {
    expect(() => parseAcceptanceCheckpointFile({ schemaVersion: "other/v9" })).toThrow(
      "acceptance_checkpoint_invalid:schema_version",
    );
    expect(() =>
      parseAcceptanceCheckpointFile({
        schemaVersion: MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
        pairs: { not: "an array" },
      }),
    ).toThrow("acceptance_checkpoint_invalid:pairs_not_array");
  });
});
