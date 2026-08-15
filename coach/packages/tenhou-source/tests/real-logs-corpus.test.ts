/**
 * Pinned real Tenhou mjloggm corpus (tests/fixtures/real-logs, sourced from
 * the public dnovikiff/tenhou test data) — §13 real-evidence policy.
 *
 * These fixtures ESTABLISH the supported event semantics; synthetic tests may
 * only exercise malformed inputs, never new external semantics. Every game
 * here is mapped for ALL FOUR selfActor seats (§14 census scans every seat)
 * and validated end to end through the reasoning canonical state machine:
 *
 *   map → CanonicalEventStreamSchema → validateCanonicalEventStream
 *
 * Replay is measured at roughly 1s per decision window on a full game (the
 * M6-A2 desktop real-record-replay precedent), so the decision/audit stage is
 * covered once on a single-round slice instead of per seat per game.
 *
 * Negative fixtures (disconnect/reconnect) pin the fail-closed diagnostic
 * codes with NO seat-dependent behavior.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CanonicalEventStreamSchema, type CanonicalGameEvent } from "@riichi-coach/contracts";
import {
  replayCanonicalStream,
  validateCanonicalEventStream,
} from "@riichi-coach/reasoning";
import { mapTenhouRecord } from "../src/index.js";

const fixtureDir = fileURLToPath(new URL("./fixtures/real-logs/", import.meta.url));

/** Full clean games: must map ready for every seat and validate end to end. */
const READY_FIXTURES = new Set([
  "bug1.xml",
  "bug2.xml",
  "bug3.xml",
  "bug4.xml",
  "bug5.xml",
  "bug6.xml",
  "bug8.xml",
  "bug9.xml",
  "example.xml",
  "pao.xml",
  "shuffle.xml",
]);

/** Disconnect (BYE precedes any reconnect UN in all three) → fail closed. */
const DISCONNECT_FIXTURES = new Set(["bug7.xml", "bye.xml", "newattr2023.xml"]);

function loadRaw(name: string): string {
  return readFileSync(`${fixtureDir}${name}`, "utf8");
}

describe("pinned real Tenhou corpus", () => {
  const names = readdirSync(fixtureDir).filter((name) => name.endsWith(".xml"));
  it("covers exactly the pinned fixture set", () => {
    expect(names.length).toBe(
      READY_FIXTURES.size + DISCONNECT_FIXTURES.size,
    );
    for (const name of names) {
      expect(READY_FIXTURES.has(name) || DISCONNECT_FIXTURES.has(name)).toBe(true);
    }
  });

  for (const name of names) {
    if (READY_FIXTURES.has(name)) {
      describe(`${name}: maps and validates for all four seats`, () => {
        const raw = loadRaw(name);
        for (const selfActor of [0, 1, 2, 3] as const) {
          it(`selfActor=${selfActor}`, () => {
            const mapped = mapTenhouRecord({
              raw,
              gameId: `tenhou-fixture:${name}`,
              selfActor,
            });
            if (mapped.status !== "ready") {
              throw new Error(`expected ready, got ${mapped.code}`);
            }
            const stream = mapped.stream;

            // The mapper's own schema parse is re-asserted from the outside:
            // canonical contracts must hold regardless of producer.
            expect(CanonicalEventStreamSchema.safeParse(stream).success).toBe(true);

            const validation = validateCanonicalEventStream(stream);
            if (validation.status !== "valid") {
              throw new Error(
                `validator rejected at ${validation.eventRef}: ${validation.code}`,
              );
            }

            // EOF closing invariant: a complete record ends at game_ended and
            // every started round is closed exactly once.
            const types = stream.events.map((event) => event.type);
            const started = types.filter((type) => type === "round_started").length;
            const ended = types.filter((type) => type === "round_ended").length;
            expect(ended).toBe(started);
            expect(types.filter((type) => type === "game_started").length).toBe(1);
            expect(types.filter((type) => type === "game_ended").length).toBe(1);
            expect(types.at(-1)).toBe("game_ended");
          });
        }
      });
    } else {
      it(`${name}: fails closed with the disconnect diagnostic`, () => {
        for (const selfActor of [0, 1, 2, 3] as const) {
          const mapped = mapTenhouRecord({
            raw: loadRaw(name),
            gameId: `tenhou-fixture:${name}`,
            selfActor,
          });
          expect(mapped).toEqual({
            status: "invalid",
            code: "tenhou_record_disconnect_unsupported",
          });
        }
      });
    }
  }

  // Single-round replay proof (M6-A2 precedent: full-game replay is ~1s per
  // decision, so one slice carries the decision-stage evidence). Round 0 of
  // bug1 includes a riichi declaration and a ron settlement — enough surface
  // to prove a mapped Tenhou stream is re-playable into the fact layer.
  it("bug1 round 0 replays into self-turn decision windows", () => {
    const mapped = mapTenhouRecord({
      raw: loadRaw("bug1.xml"),
      gameId: "tenhou-fixture:bug1-replay",
      selfActor: 0,
    });
    if (mapped.status !== "ready") {
      throw new Error(`expected ready, got ${mapped.code}`);
    }
    const events = mapped.stream.events;
    const end = events.findIndex(
      (event, index) => index > 0 && event.type === "round_ended",
    );
    // game_started + round 0 through its settlement; all refs stay internal.
    const sliced = { ...mapped.stream, events: [...events.slice(0, end + 1)] };
    const decisions = replayCanonicalStream(sliced);
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.every((decision) =>
      decision.snapshot.privateState.decisionWindow.actor === 0
    )).toBe(true);
    // Every self-turn window is resolved by a self action (discard) in round
    // 0 of this real game: no unresolved windows.
    expect(
      decisions.filter((decision) => decision.actualAction === null).length,
    ).toBe(0);
  });
});
