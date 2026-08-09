import { describe, expect, it } from "vitest";
import { ActionRefSchema } from "../src/comparison.js";
import {
  DEFENSE_MATRIX_SCHEMA_VERSION,
  DefenseMatrixV1Schema,
  STRUCTURAL_RISK_SCALE_VERSION,
  defenseStructuralStateHash,
} from "../src/defense-matrix.js";

const engineIdentity = {
  engine: "mahjong-helper" as const,
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0" as const,
  adapterVersion: "0.1.0" as const,
  protocolVersion: "mahjong-facts/v1" as const,
};

const actionRef = ActionRefSchema.parse("action:v1:discard:6s:tsumogiri");
const safeTiles34 = Array<boolean>(34).fill(false);
safeTiles34[23] = true;
const leftTiles34 = Array<number>(34).fill(4);

// Invalid-input tests intentionally mutate this wire-format fixture beyond its
// inferred literal shape before handing the unknown payload to Zod.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculatedCell(actor = 2): any {
  const factSetId = "canonical-v2:sha256:source";
  const evidenceIds = ["game/0/48/0", "game/0/48/1"];
  const visibility = {
    turns: 6,
    safeTiles34,
    leftTiles34,
    doraTiles34: [4],
    roundWindTile34: 27,
    threatWindTile34: 28,
    earlyOutsideTiles34: [0, 8],
  };
  const stateHash = defenseStructuralStateHash({
    sourceStateHash: "sha256:source",
    factSetId,
    actionRef,
    threatActor: actor,
    visibility,
    evidenceIds,
  });
  return {
    actionRef,
    threat: {
      actor,
      kind: "riichi_accepted" as const,
      source: "canonical_replay" as const,
      sourceEventRefs: ["game/0/48/0", "game/0/48/2"],
      openMeldRefs: [],
      dealerStatus: "non_dealer" as const,
      riichiTurn: { status: "calculated" as const, value: 6 },
      ippatsu: { status: "calculated" as const, value: true },
    },
    deterministicSafety: {
      status: "calculated" as const,
      genbutsu: true,
      evidenceRefs: [{
        role: "threat_own_discard" as const,
        eventRef: "game/0/48/1",
      }],
    },
    structural: {
      status: "calculated" as const,
      factSetId,
      actionRef,
      threatActor: actor,
      requestId: `${factSetId}:risk:${actor}:${stateHash}`,
      stateHash,
      engineIdentity,
      scaleVersion: STRUCTURAL_RISK_SCALE_VERSION,
      helperRiskScale: 0,
      classifications: ["double_suji" as const, "wall" as const],
      honor: null,
      visibility,
      evidenceIds,
      limitations: ["helper_risk_not_mortal_probability" as const],
    },
  };
}

function matrix(cells: unknown[] = [calculatedCell()]) {
  return {
    schemaVersion: DEFENSE_MATRIX_SCHEMA_VERSION,
    source: "canonical_replay",
    factSetId: "canonical-v2:sha256:source",
    decisionEventRef: "game/0/50/0",
    sourceStateHash: "sha256:source",
    actionRef,
    candidateTile34: 23,
    cells,
  };
}

function rebindStructural(cell: any): void {
  const stateHash = defenseStructuralStateHash({
    sourceStateHash: "sha256:source",
    factSetId: cell.structural.factSetId,
    actionRef: cell.structural.actionRef,
    threatActor: cell.structural.threatActor,
    visibility: cell.structural.visibility,
    evidenceIds: cell.structural.evidenceIds,
  });
  cell.structural.stateHash = stateHash;
  cell.structural.requestId =
    `${cell.structural.factSetId}:risk:${cell.structural.threatActor}:${stateHash}`;
}

describe("DefenseMatrixV1Schema", () => {
  it("rejects a legacy row presented under canonical top provenance", () => {
    const legacy = calculatedCell();
    legacy.threat.source = "legacy_regression_bridge_only";

    expect(() => DefenseMatrixV1Schema.parse(matrix([legacy]))).toThrow();
  });

  it("rejects mixed canonical and legacy replay rows", () => {
    const canonical = calculatedCell(1);
    const legacy = calculatedCell(2);
    legacy.threat.source = "legacy_regression_bridge_only";

    expect(() => DefenseMatrixV1Schema.parse(matrix([canonical, legacy])))
      .toThrow();
  });

  it("binds an empty canonical matrix to its declared source state", () => {
    expect(() => DefenseMatrixV1Schema.parse({
      ...matrix([]),
      factSetId: "arbitrary",
    })).toThrow();
  });

  it("allows a pure user-asserted matrix without a fake canonical decision", () => {
    const open = calculatedCell(3);
    open.threat = {
      actor: 3,
      kind: "user_marked_open",
      source: "user_asserted",
      sourceEventRefs: ["user/threat/3"],
      openMeldRefs: ["user/meld/3/0"],
      dealerStatus: "unknown",
      riichiTurn: { status: "not_applicable" },
      ippatsu: { status: "not_applicable" },
    };
    open.deterministicSafety = { status: "not_applicable" };
    open.structural = {
      status: "unsupported_threat_kind",
      kind: "user_marked_open",
    };

    expect(() => DefenseMatrixV1Schema.parse({
      ...matrix([open]),
      source: "user_asserted",
      factSetId: "user-asserted:sha256:source",
      decisionEventRef: "user/question/1",
    })).not.toThrow();
  });

  it("computes a stable structural state hash from all scene inputs", () => {
    const input = {
      sourceStateHash: "sha256:source",
      factSetId: "canonical-v2:sha256:source",
      actionRef,
      threatActor: 2,
      visibility: calculatedCell().structural.visibility,
      evidenceIds: ["game/0/48/0", "game/0/48/1"],
    };
    const hash = defenseStructuralStateHash(input);

    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(defenseStructuralStateHash(structuredClone(input))).toBe(hash);
    expect(defenseStructuralStateHash({
      ...input,
      threatActor: 1,
    })).not.toBe(hash);
  });

  it("requires a canonical decision ref and source-state scene binding", () => {
    const unbound = matrix() as Record<string, unknown>;
    delete unbound.decisionEventRef;
    delete unbound.sourceStateHash;
    expect(() => DefenseMatrixV1Schema.parse(unbound)).toThrow();
  });

  it("binds replay evidence and canonical fact identity to the decision scene", () => {
    const invalidDecision = { ...matrix(), decisionEventRef: "not-an-event" };
    expect(() => DefenseMatrixV1Schema.parse(invalidDecision)).toThrow();

    const otherGame = { ...matrix(), decisionEventRef: "other/0/50/0" };
    expect(() => DefenseMatrixV1Schema.parse(otherGame)).toThrow();

    const evidenceAfterDecision = calculatedCell();
    evidenceAfterDecision.structural.evidenceIds = [
      "game/0/48/0",
      "game/0/51/0",
    ];
    rebindStructural(evidenceAfterDecision);
    expect(() => DefenseMatrixV1Schema.parse(
      { ...matrix([evidenceAfterDecision]), decisionEventRef: "game/0/50/0" },
    )).toThrow();

    const mismatchedFactSet = {
      ...matrix(),
      sourceStateHash: "sha256:other-source",
    };
    expect(() => DefenseMatrixV1Schema.parse(mismatchedFactSet)).toThrow();
  });

  it("retains an explicit legacy-regression fact identity branch", () => {
    const legacy = calculatedCell();
    legacy.threat.source = "legacy_regression_bridge_only";
    legacy.structural.factSetId = "legacy-regression:e1:t6";
    rebindStructural(legacy);

    expect(() => DefenseMatrixV1Schema.parse({
      ...matrix([legacy]),
      source: "legacy_regression_bridge_only",
      factSetId: "legacy-regression:e1:t6",
    })).not.toThrow();
  });

  it("accepts a strictly bound per-threat defense matrix", () => {
    const parsed = DefenseMatrixV1Schema.parse(matrix());

    expect(parsed.cells[0]!.threat.actor).toBe(2);
    expect(parsed.cells[0]!.actionRef).toBe(parsed.actionRef);
  });

  it("rejects duplicate or non-canonical threat actor rows", () => {
    expect(() => DefenseMatrixV1Schema.parse(matrix([
      calculatedCell(2),
      calculatedCell(2),
    ]))).toThrow();
    expect(() => DefenseMatrixV1Schema.parse(matrix([
      calculatedCell(2),
      calculatedCell(1),
    ]))).toThrow();
  });

  it("rejects a cell bound to another candidate action", () => {
    const cell = calculatedCell();
    cell.actionRef = "action:v1:discard:2p:tedashi";

    expect(() => DefenseMatrixV1Schema.parse(matrix([cell]))).toThrow();
  });

  it("rejects unknown fields at top-level and nested boundaries", () => {
    expect(() => DefenseMatrixV1Schema.parse({
      ...matrix(),
      hostile: true,
    })).toThrow();
    expect(() => DefenseMatrixV1Schema.parse(matrix([{
      ...calculatedCell(),
      threat: { ...calculatedCell().threat, hostile: true },
    }]))).toThrow();
  });

  it("rejects structural labels outside the complete allowlist", () => {
    const genbutsu = calculatedCell();
    genbutsu.structural.classifications = ["genbutsu" as never];
    expect(() => DefenseMatrixV1Schema.parse(matrix([genbutsu]))).toThrow();

    const honorCount = calculatedCell();
    honorCount.structural.classifications = ["honor_count" as never];
    expect(() => DefenseMatrixV1Schema.parse(matrix([honorCount]))).toThrow();

    const unknown = calculatedCell();
    unknown.structural.classifications = ["behavioral_read" as never];
    expect(() => DefenseMatrixV1Schema.parse(matrix([unknown]))).toThrow();
  });

  it("requires canonical unique structural labels and evidence", () => {
    const unsorted = calculatedCell();
    unsorted.structural.classifications = ["wall", "double_suji"];
    expect(() => DefenseMatrixV1Schema.parse(matrix([unsorted]))).toThrow();

    const duplicateEvidence = calculatedCell();
    duplicateEvidence.structural.evidenceIds = [
      "game/0/48/0",
      "game/0/48/0",
    ];
    rebindStructural(duplicateEvidence);
    expect(() => DefenseMatrixV1Schema.parse(matrix([duplicateEvidence])))
      .toThrow();
  });

  it("requires engine identity and fixed scale semantics for calculated structure", () => {
    const missingIdentity = calculatedCell() as Record<string, unknown>;
    delete (missingIdentity.structural as Record<string, unknown>).engineIdentity;
    expect(() => DefenseMatrixV1Schema.parse(matrix([missingIdentity])))
      .toThrow();

    const wrongScale = calculatedCell();
    wrongScale.structural.scaleVersion = "mahjong-helper-risk/latest" as never;
    expect(() => DefenseMatrixV1Schema.parse(matrix([wrongScale]))).toThrow();
  });

  it("requires explicit fact, action, actor, and request identity bindings", () => {
    const missingBindings = calculatedCell();
    delete missingBindings.structural.factSetId;
    delete missingBindings.structural.actionRef;
    delete missingBindings.structural.threatActor;
    expect(() => DefenseMatrixV1Schema.parse(matrix([missingBindings])))
      .toThrow();

    for (const [field, forged] of [
      ["factSetId", "facts:foreign"],
      ["actionRef", "action:v1:discard:2p:tedashi"],
      ["threatActor", 1],
      ["requestId", "canonical-v2:sha256:source:risk:2"],
    ] as const) {
      const cell = calculatedCell();
      cell.structural[field] = forged;
      expect(() => DefenseMatrixV1Schema.parse(matrix([cell])), field)
        .toThrow();
    }
  });

  it("recomputes structural state hash instead of trusting a self-consistent pair", () => {
    const forged = calculatedCell();
    forged.structural.stateHash = "sha256:forged";
    forged.structural.requestId =
      `${forged.structural.factSetId}:risk:2:sha256:forged`;

    expect(() => DefenseMatrixV1Schema.parse(matrix([forged]))).toThrow();
  });

  it("requires canonical replay refs, exact riichi ref counts, and one round scope", () => {
    const invalidRef = calculatedCell();
    invalidRef.threat.sourceEventRefs = ["not/an/event", "game/0/48/2"];
    expect(() => DefenseMatrixV1Schema.parse(matrix([invalidRef]))).toThrow();

    const nonCanonicalOrder = calculatedCell();
    nonCanonicalOrder.threat.sourceEventRefs = [
      "game/0/10/0",
      "game/0/2/0",
    ];
    expect(() => DefenseMatrixV1Schema.parse(matrix([nonCanonicalOrder])))
      .toThrow();

    const acceptedMissingRef = calculatedCell();
    acceptedMissingRef.threat.sourceEventRefs = ["game/0/48/0"];
    expect(() => DefenseMatrixV1Schema.parse(matrix([acceptedMissingRef])))
      .toThrow();

    const declaredExtraRef = calculatedCell();
    declaredExtraRef.threat.kind = "riichi_declared";
    expect(() => DefenseMatrixV1Schema.parse(matrix([declaredExtraRef])))
      .toThrow();

    const crossRound = calculatedCell();
    crossRound.structural.evidenceIds = ["game/0/48/0", "game/1/48/1"];
    rebindStructural(crossRound);
    expect(() => DefenseMatrixV1Schema.parse(matrix([crossRound]))).toThrow();
  });

  it("orders deterministic evidence by canonical event position before role", () => {
    const roleOrderedButTimeReversed = calculatedCell();
    roleOrderedButTimeReversed.deterministicSafety.evidenceRefs = [
      { role: "threat_own_discard", eventRef: "game/0/10/0" },
      { role: "post_riichi_pass", eventRef: "game/0/2/0" },
    ];
    expect(() => DefenseMatrixV1Schema.parse(
      matrix([roleOrderedButTimeReversed]),
    )).toThrow();

    const chronologicallyOrdered = calculatedCell();
    chronologicallyOrdered.deterministicSafety.evidenceRefs = [
      { role: "post_riichi_pass", eventRef: "game/0/2/0" },
      { role: "threat_own_discard", eventRef: "game/0/10/0" },
    ];
    chronologicallyOrdered.structural.evidenceIds = [
      "game/0/2/0",
      "game/0/10/0",
    ];
    chronologicallyOrdered.threat.sourceEventRefs = [
      "game/0/1/0",
      "game/0/1/1",
    ];
    rebindStructural(chronologicallyOrdered);
    expect(() => DefenseMatrixV1Schema.parse(
      matrix([chronologicallyOrdered]),
    )).not.toThrow();
  });

  it("rejects one deterministic event reused under two evidence roles", () => {
    const duplicateEvent = calculatedCell();
    duplicateEvent.deterministicSafety.evidenceRefs = [
      { role: "threat_own_discard", eventRef: "game/0/48/1" },
      { role: "post_riichi_pass", eventRef: "game/0/48/1" },
    ];

    expect(() => DefenseMatrixV1Schema.parse(matrix([duplicateEvent])))
      .toThrow();
  });

  it("requires post-riichi-pass evidence to follow the threat source boundary", () => {
    const earlyPass = calculatedCell();
    earlyPass.deterministicSafety.evidenceRefs = [{
      role: "post_riichi_pass",
      eventRef: "game/0/47/0",
    }];
    expect(() => DefenseMatrixV1Schema.parse(matrix([earlyPass]))).toThrow();

    const laterPass = calculatedCell();
    laterPass.deterministicSafety.evidenceRefs = [{
      role: "post_riichi_pass",
      eventRef: "game/0/49/0",
    }];
    expect(() => DefenseMatrixV1Schema.parse(matrix([laterPass])))
      .not.toThrow();
  });

  it("binds structural safe tiles and zero helper risk to deterministic genbutsu", () => {
    const mismatchedSafeTile = calculatedCell();
    mismatchedSafeTile.structural.visibility.safeTiles34 =
      Array<boolean>(34).fill(false);
    rebindStructural(mismatchedSafeTile);
    expect(() => DefenseMatrixV1Schema.parse(matrix([mismatchedSafeTile])))
      .toThrow();

    const nonzeroSafeRisk = calculatedCell();
    nonzeroSafeRisk.structural.helperRiskScale = 1;
    expect(() => DefenseMatrixV1Schema.parse(matrix([nonzeroSafeRisk])))
      .toThrow();
  });

  it("binds honor remaining count to candidate visibility", () => {
    const honor = calculatedCell();
    honor.structural.visibility.safeTiles34 = Array<boolean>(34).fill(false);
    honor.structural.honor = { remainingCount: 2, category: "yakuhai" };
    rebindStructural(honor);
    const honorMatrix = {
      ...matrix([honor]),
      candidateTile34: 27,
    };

    expect(() => DefenseMatrixV1Schema.parse(honorMatrix)).toThrow();
  });

  it("rejects calculated values on blocked structural and safety branches", () => {
    const blocked = calculatedCell() as Record<string, unknown>;
    blocked.deterministicSafety = {
      status: "blocked_missing_facts",
      evidenceRefs: [],
      genbutsu: true,
    };
    blocked.structural = {
      status: "blocked_missing_facts",
      missing: ["visibility"],
      helperRiskScale: 0,
    };
    expect(() => DefenseMatrixV1Schema.parse(matrix([blocked]))).toThrow();
  });

  it("requires positive calculated riichi turns and fail-closed datum branches", () => {
    const zeroTurn = calculatedCell();
    zeroTurn.threat.riichiTurn.value = 0;
    expect(() => DefenseMatrixV1Schema.parse(matrix([zeroTurn]))).toThrow();

    const blockedWithValue = calculatedCell() as Record<string, unknown>;
    (blockedWithValue.threat as Record<string, unknown>).ippatsu = {
      status: "blocked_missing_facts",
      value: false,
    };
    expect(() => DefenseMatrixV1Schema.parse(matrix([blockedWithValue])))
      .toThrow();
  });

  it("binds open threats to user assertions and open meld evidence", () => {
    const open = calculatedCell(3) as Record<string, unknown>;
    open.threat = {
      actor: 3,
      kind: "user_marked_open",
      source: "user_asserted",
      sourceEventRefs: ["user/threat/3"],
      openMeldRefs: ["game/0/32/0"],
      dealerStatus: "unknown",
      riichiTurn: { status: "not_applicable" },
      ippatsu: { status: "not_applicable" },
    };
    open.deterministicSafety = { status: "not_applicable" };
    open.structural = {
      status: "unsupported_threat_kind",
      kind: "user_marked_open",
    };
    expect(() => DefenseMatrixV1Schema.parse(matrix([open]))).not.toThrow();

    const wrongSource = structuredClone(open) as Record<string, unknown>;
    (wrongSource.threat as Record<string, unknown>).source = "canonical_replay";
    expect(() => DefenseMatrixV1Schema.parse(matrix([wrongSource]))).toThrow();

    const missingMeld = structuredClone(open) as Record<string, unknown>;
    (missingMeld.threat as Record<string, unknown>).openMeldRefs = [];
    expect(() => DefenseMatrixV1Schema.parse(matrix([missingMeld]))).toThrow();
  });

  it("rejects riichi threats backed by user assertions or open melds", () => {
    const userSource = calculatedCell();
    userSource.threat.source = "user_asserted" as never;
    expect(() => DefenseMatrixV1Schema.parse(matrix([userSource]))).toThrow();

    const openMeld = calculatedCell();
    openMeld.threat.openMeldRefs = ["game/0/32/0"];
    expect(() => DefenseMatrixV1Schema.parse(matrix([openMeld]))).toThrow();
  });

  it("requires deterministic genbutsu proof and canonical evidence order", () => {
    const noProof = calculatedCell();
    noProof.deterministicSafety.evidenceRefs = [];
    expect(() => DefenseMatrixV1Schema.parse(matrix([noProof]))).toThrow();

    const unsorted = calculatedCell();
    unsorted.deterministicSafety.evidenceRefs = [
      { role: "post_riichi_pass", eventRef: "game/0/49/2" },
      { role: "threat_own_discard", eventRef: "game/0/48/1" },
    ];
    expect(() => DefenseMatrixV1Schema.parse(matrix([unsorted]))).toThrow();
  });
});
