import {
  SourceActionAdaptationResultSchema,
  SourceAdapterContextSchema,
  TileSchema,
  sortTilesCanonical,
  type SourceActionAdaptationResult,
  type SourceAdapterContext,
  type Tile,
} from "@riichi-coach/contracts";

const honors: Record<string, Tile["id"]> = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
  P: "5z",
  F: "6z",
  C: "7z",
};

export type MjaiActionEnvelope = {
  eventRef: string;
  action: Record<string, unknown> & { type: string };
};

function ready(
  draft: unknown,
  factRefs: string[],
): SourceActionAdaptationResult {
  return SourceActionAdaptationResultSchema.parse({
    status: "ready",
    sourceType: "mjai",
    draft,
    factRefs,
  });
}

function actor(action: Record<string, unknown>): number {
  if (
    typeof action.actor !== "number" ||
    !Number.isInteger(action.actor) ||
    action.actor < 0 ||
    action.actor > 3
  ) {
    throw new Error("MJAI action requires actor 0..3");
  }
  return action.actor;
}

function stringField(
  action: Record<string, unknown>,
  field: string,
): string {
  const value = action[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`MJAI action requires ${field}`);
  }
  return value;
}

function booleanField(
  action: Record<string, unknown>,
  field: string,
): boolean {
  const value = action[field];
  if (typeof value !== "boolean") {
    throw new Error(`MJAI action requires boolean ${field}`);
  }
  return value;
}

function tile(value: string): Tile {
  const red = value.endsWith("r");
  const base = red ? value.slice(0, -1) : value;
  const id = honors[base] ?? base;
  return TileSchema.parse({
    id,
    red,
  });
}

function tileArray(
  action: Record<string, unknown>,
  expectedLength: number,
): Tile[] {
  const values = action.consumed;
  if (!Array.isArray(values) || values.length !== expectedLength) {
    throw new Error(
      `MJAI ${action.type as string} requires ${expectedLength} consumed tiles`,
    );
  }
  return sortTilesCanonical(
    values.map((value) => {
      if (typeof value !== "string") {
        throw new Error("MJAI consumed tiles must be strings");
      }
      return tile(value);
    }),
  );
}

function target(action: Record<string, unknown>): number {
  const value = action.target;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 3
  ) {
    throw new Error("MJAI action requires target 0..3");
  }
  return value;
}

function requiredFields(type: string): string[] {
  switch (type) {
    case "reach":
      return ["actor"];
    case "none":
      // M6-A4.2 (real-evidence pin, H2 response rows): the response pass
      // serializes as `{"type":"none"}` with NO actor — the A4.0 perspective
      // invariant only constrains actor-CARRYING actions. `none` is the
      // reviewed player's own pass in a response window; the case body never
      // reads the actor. Mirrors the bare `ryukyoku` handling below.
      return [];
    case "dahai":
      return ["actor", "pai", "tsumogiri"];
    case "chi":
    case "pon":
    case "daiminkan":
      return ["actor", "target", "pai", "consumed"];
    case "ankan":
      return ["actor", "consumed"];
    case "kakan":
      return ["actor", "pai"];
    case "hora":
    case "agari":
      // Real Mortal reports serialize the win alternative without `pai`
      // (actor/target only); the winning tile is locally authoritative for
      // self-turn windows (context.currentDrawTile) and source-carried for
      // response windows, checked in the case body below.
      return ["actor", "target"];
    case "ryukyoku":
      // Real-evidence pin (ekyu report, 2026-08-17): the scored kyuushu
      // alternative carries NEITHER field — validation lives in the case
      // body (reason-carrying shapes must name kyuushu; bare shapes are
      // admissible only as the self-turn abort alternative).
      return [];
    default:
      return [];
  }
}

function fieldPresent(
  action: Record<string, unknown>,
  field: string,
): boolean {
  const value = action[field];
  if (field === "actor" || field === "target") {
    return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 3;
  }
  if (field === "tsumogiri") {
    return typeof value === "boolean";
  }
  if (field === "consumed") {
    const expectedLength =
      action.type === "chi" || action.type === "pon"
        ? 2
        : action.type === "daiminkan"
          ? 3
          : action.type === "ankan"
            ? 4
            : 0;
    return Array.isArray(value) &&
      value.length === expectedLength &&
      value.every((item) => typeof item === "string" && item.length > 0);
  }
  return typeof value === "string" && value.length > 0;
}

function missingFields(action: Record<string, unknown>): string[] {
  return requiredFields(action.type as string)
    .filter((field) => !fieldPresent(action, field));
}

function incompleteFields(
  sequence: readonly MjaiActionEnvelope[],
  fields: string[],
): SourceActionAdaptationResult {
  return SourceActionAdaptationResultSchema.parse({
    status: "incomplete",
    sourceType: "mjai",
    diagnosticCode: "missing_action_fields",
    missingFields: fields,
    factRefs: sequence.map((entry) => entry.eventRef),
  });
}

function unsupported(sourceType: string): SourceActionAdaptationResult {
  return SourceActionAdaptationResultSchema.parse({
    status: "unsupported",
    sourceType,
  });
}

export function adaptMjaiActionSequence(
  rawSequence: readonly MjaiActionEnvelope[],
  rawContext: SourceAdapterContext,
): SourceActionAdaptationResult {
  const context = SourceAdapterContextSchema.parse(rawContext);
  if (rawSequence.length === 0) {
    return unsupported("empty_mjai_sequence");
  }
  const first = rawSequence[0]!;
  const action = first.action;
  const firstMissing = missingFields(action);
  if (firstMissing.length > 0) {
    return incompleteFields(rawSequence, firstMissing);
  }

  if (action.type === "reach") {
    const reachActor = actor(action);
    if (
      context.decisionWindow.actor !== null &&
      reachActor !== context.decisionWindow.actor
    ) {
      return unsupported("mjai_actor_mismatch");
    }
    const second = rawSequence[1];
    if (second === undefined) {
      // M6-A3 (ADR-0001): an isolated reach is the model-side riichi
      // alternative. Mortal's action space has a single riichi index and the
      // mjai reach event carries no tile, so the discard realization is
      // structurally unrecoverable — the candidate stays tile-less wherever
      // riichi can still be declared.
      if (context.decisionWindow.kind === "self_turn") {
        return ready({ kind: "declare_riichi" }, [first.eventRef]);
      }
      return unsupported("mjai_reach_window_mismatch");
    }
    if (second.action.type !== "dahai") {
      return unsupported("mjai_sequence");
    }
    if (rawSequence.length !== 2) {
      return unsupported("mjai_sequence");
    }
    const secondMissing = missingFields(second.action);
    if (secondMissing.length > 0) {
      return incompleteFields(rawSequence, secondMissing);
    }
    const dahaiActor = actor(second.action);
    if (
      context.decisionWindow.actor !== null &&
      dahaiActor !== context.decisionWindow.actor
    ) {
      return unsupported("mjai_actor_mismatch");
    }
    if (dahaiActor !== reachActor) {
      return SourceActionAdaptationResultSchema.parse({
        status: "incomplete",
        sourceType: "mjai",
        diagnosticCode: "reach_without_dahai",
        missingFields: ["tile", "discardMode"],
        factRefs: rawSequence.map((entry) => entry.eventRef),
      });
    }
    return ready({
      kind: "riichi_discard",
      tile: tile(stringField(second.action, "pai")),
      discardMode: booleanField(second.action, "tsumogiri")
        ? "tsumogiri"
        : "tedashi",
    }, [first.eventRef, second.eventRef]);
  }
  if (rawSequence.length !== 1) {
    return unsupported("mjai_sequence");
  }

  const knownTypes = new Set([
    "dahai",
    "chi",
    "pon",
    "daiminkan",
    "ankan",
    "kakan",
    // Mortal's serialized win action has been seen as both "hora" (mjai
    // event vocabulary) and "agari" (ACTION_SPACE vocabulary, per the M6-A3
    // mapping table). Both are accepted and mapped identically; live corpus
    // data will show which serialization the reports actually carry.
    "hora",
    "agari",
    "ryukyoku",
    "none",
  ]);
  if (!knownTypes.has(action.type)) {
    return unsupported(action.type);
  }
  // Real-evidence pins: the kyuushu alternative is one actor-less single-action
  // shape (a bare `{"type":"ryukyoku"}`), and the response pass serializes as
  // `{"type":"none"}` with no actor (M6-A4.2 H2). For `none`, an ABSENT actor
  // is admissible (the reviewed player's implicit pass), but a PRESENT actor
  // must still equal the window actor — a foreign actor is a mismatch.
  const carriedKyuushuReason =
    typeof action.reason === "string" && action.reason.length > 0;
  const bareKyuushuAlternative = action.type === "ryukyoku" && !carriedKyuushuReason;
  const actionActor = bareKyuushuAlternative
    ? null
    : action.type === "none"
      ? (typeof action.actor === "number" &&
          Number.isInteger(action.actor) &&
          action.actor >= 0 &&
          action.actor <= 3
        ? action.actor
        : null)
      : actor(action);
  if (
    actionActor !== null &&
    context.decisionWindow.actor !== null &&
    actionActor !== context.decisionWindow.actor
  ) {
    return unsupported("mjai_actor_mismatch");
  }
  switch (action.type) {
    case "dahai":
      return ready({
        kind: "discard",
        tile: tile(stringField(action, "pai")),
        discardMode: booleanField(action, "tsumogiri")
          ? "tsumogiri"
          : "tedashi",
      }, [first.eventRef]);
    case "chi":
    case "pon": {
      const targetActor = target(action);
      if (targetActor === actionActor) {
        return unsupported("mjai_target_mismatch");
      }
      return ready({
        kind: action.type,
        calledTile: tile(stringField(action, "pai")),
        consumedTiles: tileArray(action, 2),
        targetActor,
        responseEventRef: context.decisionWindow.triggerEventRef,
      }, [first.eventRef, context.decisionWindow.triggerEventRef]);
    }
    case "daiminkan": {
      const targetActor = target(action);
      if (targetActor === actionActor) {
        return unsupported("mjai_target_mismatch");
      }
      return ready({
        kind: "daiminkan",
        calledTile: tile(stringField(action, "pai")),
        consumedTiles: tileArray(action, 3),
        targetActor,
        responseEventRef: context.decisionWindow.triggerEventRef,
      }, [first.eventRef, context.decisionWindow.triggerEventRef]);
    }
    case "ankan": {
      // M6-A4.2 (real-evidence pin, H2 response rows): on a discard_response
      // window Mortal serializes the daiminkan candidate as an ankan whose
      // four consumed tiles are all copies of the OFFERED tile (the offered
      // copy + the concealed triplet) — the same pin family as the A3
      // kakan-as-ankan finding. Bridge it to a daiminkan draft on the offered
      // tile, targeting the source actor, so the candidate normalizer accepts
      // it in the response window.
      if (context.decisionWindow.kind === "discard_response") {
        const consumed = tileArray(action, 4);
        const offered = context.decisionWindow.offeredTile;
        if (
          offered !== undefined &&
          consumed.every((t) => t.id === offered.id)
        ) {
          const sourceActor = context.decisionWindow.sourceActor;
          if (sourceActor !== null && sourceActor !== context.decisionWindow.actor) {
            return ready({
              kind: "daiminkan",
              calledTile: { ...offered },
              consumedTiles: [
                { ...offered },
                { ...offered },
                { ...offered },
              ],
              targetActor: sourceActor,
              responseEventRef: context.decisionWindow.triggerEventRef,
            }, [first.eventRef, context.decisionWindow.triggerEventRef]);
          }
        }
      }
      return ready({
        kind: "ankan",
        tiles: tileArray(action, 4),
      }, [first.eventRef]);
    }
    case "kakan":
      return ready({
        kind: "kakan",
        addedTile: tile(stringField(action, "pai")),
        ...(typeof action.existingMeldRef === "string"
          ? { existingMeldRef: action.existingMeldRef }
          : context.existingMeldRef === undefined
            ? {}
            : { existingMeldRef: context.existingMeldRef }),
      }, [first.eventRef]);
    case "hora":
    case "agari": {
      const targetActor = target(action);
      // The winning tile: `pai` when the source carries it; on self-turn the
      // locally authoritative drawn tile otherwise (real Mortal reports omit
      // `pai` on the win alternative; the drawn tile is a local fact).
      const sourcePai = typeof action.pai === "string" && action.pai.length > 0
        ? action.pai
        : null;
      if (context.decisionWindow.kind === "self_turn") {
        if (targetActor !== actionActor) {
          return unsupported("hora_context_mismatch");
        }
        if (sourcePai !== null) {
          return ready({
            kind: "tsumo",
            winningTile: tile(sourcePai),
            drawEventRef: context.decisionWindow.triggerEventRef,
          }, [first.eventRef, context.decisionWindow.triggerEventRef]);
        }
        if (context.currentDrawTile === undefined) {
          return incompleteFields(rawSequence, ["pai"]);
        }
        return ready({
          kind: "tsumo",
          winningTile: context.currentDrawTile,
          drawEventRef: context.decisionWindow.triggerEventRef,
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      if (
        context.decisionWindow.kind === "discard_response" ||
        context.decisionWindow.kind === "kan_response"
      ) {
        if (targetActor === actionActor) {
          return unsupported("hora_context_mismatch");
        }
        // Response surfaces (M6-A4): the winning tile is the claimed discard.
        // Real Mortal response reports omit `pai` on the win alternative (same
        // pin as the self-turn hora), so fall back to the window's offered
        // tile — the local-authoritative winning tile (ADR-0001), exactly as
        // self-turn falls back to the drawn tile.
        if (sourcePai === null) {
          const offered = context.decisionWindow.offeredTile;
          if (offered === undefined) {
            return incompleteFields(rawSequence, ["pai"]);
          }
          return ready({
            kind: "ron",
            winningTile: { ...offered },
            targetActor,
            responseEventRef: context.decisionWindow.triggerEventRef,
            winContext: context.decisionWindow.kind === "discard_response"
              ? "discard"
              : context.decisionWindow.kanKind,
          }, [first.eventRef, context.decisionWindow.triggerEventRef]);
        }
        return ready({
          kind: "ron",
          winningTile: tile(sourcePai),
          targetActor,
          responseEventRef: context.decisionWindow.triggerEventRef,
          winContext: context.decisionWindow.kind === "discard_response"
            ? "discard"
            : context.decisionWindow.kanKind,
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      return unsupported("hora_in_post_call_discard");
    }
    case "ryukyoku": {
      const reason = action.reason;
      if (typeof reason === "string" && reason.length > 0) {
        if (reason !== "kyuushu_kyuuhai" && reason !== "kyushukyuhai") {
          return unsupported(`ryukyoku:${reason}`);
        }
      } else {
        // Real-evidence pin (ekyu report, 2026-08-17): the scored kyuushu
        // alternative serializes as a bare `{"type":"ryukyoku"}` — no actor,
        // no reason. The abort is a player choice only on the self turn, so
        // the bare shape is admissible exactly there; an attributed or
        // off-turn round-abort row stays unsupported.
        if (
          context.decisionWindow.kind !== "self_turn"
          || action.actor !== undefined
        ) {
          return unsupported("ryukyoku:unattributed");
        }
      }
      return ready({
        kind: "kyuushu_kyuuhai",
        drawEventRef: context.decisionWindow.triggerEventRef,
      }, [first.eventRef, context.decisionWindow.triggerEventRef]);
    }
    case "none":
      if (context.decisionWindow.kind === "discard_response") {
        return ready({
          kind: "pass",
          responseEventRef: context.decisionWindow.triggerEventRef,
          responseKind: "discard",
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      if (context.decisionWindow.kind === "kan_response") {
        return ready({
          kind: "pass",
          responseEventRef: context.decisionWindow.triggerEventRef,
          responseKind: context.decisionWindow.kanKind,
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      return unsupported("none_outside_response");
    default:
      return unsupported(action.type);
  }
}
