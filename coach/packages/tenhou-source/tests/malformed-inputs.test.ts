/**
 * Synthetic malformed-input tests — §13 real-evidence policy.
 *
 * These tests may ONLY cover malformed documents, missing fields, impossible
 * actors, invalid tiles, and unsupported events/positions. They never
 * establish new external semantics: every supported semantic comes from the
 * pinned real corpus (real-logs-corpus.test.ts).
 */
import { describe, expect, it } from "vitest";
import {
  decodeTenhouMeld,
  isRedCode,
  mapTenhouRecord,
  tenhouTileCode,
  tenhouTileList,
  tokenizeMjlog,
  TenhouSourceError,
} from "../src/index.js";

function doc(body: string): string {
  return `<mjloggm ver="2.3">${body}</mjloggm>`;
}

const GO = `<GO type="1"/>`;
const SANMA_GO = `<GO type="17"/>`;
const DEMO_GO = `<GO type="0"/>`;
const UN = `<UN n0="A" n1="B" n2="C" n3="D"/>`;
const RECONNECT_UN = `<UN n1="B"/>`;
const TAIKYOKU = `<TAIKYOKU oya="0"/>`;
const HAI = `hai0="0,1,2,3,4,5,6,7,8,9,10,11,12" hai1="16,17,18,19,20,21,22,23,24,25,26,27,28" hai2="32,33,34,35,36,37,38,39,40,41,42,43,44" hai3="48,49,50,51,52,53,54,55,56,57,58,59,60"`;
const INIT = `<INIT seed="0,0,0,0,0,100" ten="250,250,250,250" oya="0" ${HAI}/>`;
// A minimal well-formed dealer tsumo round: draw 1m (code 0…— code 100 is
// 5s? no: 100 = 36*2+4*(4-1) → 4s), then a dealer tsumo win settled by owari.
const T0 = `<T100/>`;
const AGARI = `<AGARI who="0" fromWho="0" machi="100" ten="30,1000,1" yaku="1,1" sc="250,13,250,0,250,0,250,0" owari="263,10,250,0,250,0,250,0"/>`;
const AGARI_NO_OWARI = `<AGARI who="0" fromWho="0" machi="100" ten="30,1000,1" yaku="1,1" sc="250,13,250,0,250,0,250,0"/>`;

function map(raw: string): { status: string; code?: string } {
  const result = mapTenhouRecord({ raw, gameId: "synthetic", selfActor: 0 });
  return result.status === "invalid"
    ? { status: result.status, code: result.code }
    : { status: result.status };
}

describe("synthetic malformed inputs fail closed with explicit codes", () => {
  it("tokenizer rejects malformed documents", () => {
    expect(() => tokenizeMjlog("")).toThrow(TenhouSourceError);
    expect(() => tokenizeMjlog("<GO type=\"1\"/>")).toThrow(TenhouSourceError);
    expect(() => tokenizeMjlog("<mjloggm ver=\"2.3\"/>")).toThrow(TenhouSourceError);
    expect(() => tokenizeMjlog(doc("text content"))).toThrow(TenhouSourceError);
    expect(() => tokenizeMjlog(`${doc(GO)}trailing`)).toThrow(TenhouSourceError);
    expect(() => tokenizeMjlog(doc("<T12 foo/>"))).toThrow(TenhouSourceError);
  });

  it("mapper rejects malformed documents with invalid_xml", () => {
    expect(map("")).toEqual({ status: "invalid", code: "tenhou_record_invalid_xml" });
    expect(map("<mjloggm ver=\"2.3\"/>")).toEqual({
      status: "invalid",
      code: "tenhou_record_invalid_xml",
    });
    expect(map(doc("text"))).toEqual({
      status: "invalid",
      code: "tenhou_record_invalid_xml",
    });
  });

  it("unsupported mjloggm version", () => {
    expect(map(`<mjloggm ver="2.4">${GO}${UN}</mjloggm>`)).toEqual({
      status: "invalid",
      code: "tenhou_record_unsupported_version",
    });
  });

  it("unsupported game shapes", () => {
    expect(map(doc(`${UN}${INIT}`))).toEqual({
      status: "invalid",
 code: "tenhou_record_unsupported_game",
    });
    expect(map(doc(`${SANMA_GO}${UN}`))).toEqual({
      status: "invalid",
      code: "tenhou_record_unsupported_game",
    });
    expect(map(doc(`${DEMO_GO}${UN}`))).toEqual({
      status: "invalid",
      code: "tenhou_record_unsupported_game",
    });
    expect(map(doc(`${GO}${UN}<TAIKYOKU oya="1"/>${INIT}`))).toEqual({
      status: "invalid",
      code: "tenhou_record_unsupported_game",
    });
    expect(map(doc(`${GO}${UN}${TAIKYOKU}<INIT seed="0,0,0,0,0,100" ten="250,250,250,250" oya="0" hai1="0,1,2,3,4,5,6,7,8,9,10,11,12" hai2="16,17,18,19,20,21,22,23,24,25,26,27,28" hai3="32,33,34,35,36,37,38,39,40,41,42,43,44"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_record_unsupported_game",
    });
  });

  it("disconnect and reconnect records fail closed", () => {
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}<BYE who="2"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_record_disconnect_unsupported",
    });
    expect(map(doc(`${GO}${RECONNECT_UN}${TAIKYOKU}${INIT}`))).toEqual({
      status: "invalid",
      code: "tenhou_record_reconnect_unsupported",
    });
    expect(map(doc(`${GO}${UN}${UN}${TAIKYOKU}${INIT}`))).toEqual({
      status: "invalid",
      code: "tenhou_record_reconnect_unsupported",
    });
  });

  it("unsupported event positions", () => {
    // SHUFFLE is header-only: mid-game SHUFFLE fails closed.
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}<SHUFFLE seed="x"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_record_unsupported_event",
    });
    // Unknown body tag inside a round.
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}<NAME/>`))).toEqual({
      status: "invalid",
      code: "tenhou_record_unsupported_event",
    });
    // Draw after a terminal: the round is already closed by the win, so this
    // is a state-machine inconsistency inside an otherwise valid document.
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}${AGARI_NO_OWARI}${T0}`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
  });

  it("invalid tiles fail with the tile diagnostic", () => {
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}<T136/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_tile",
    });
    expect(() => tenhouTileCode(136, true)).toThrow(TenhouSourceError);
    expect(() => tenhouTileCode(-1, true)).toThrow(TenhouSourceError);
    // 0..135 cannot express 8z+ (honors max out at 7z=135): the codec-level
    // guard is unreachable from document tiles and is covered by range checks.
    expect(() => tenhouTileList("11,zz", true)).toThrow(TenhouSourceError);
    expect(() => tenhouTileList("", true)).toThrow(TenhouSourceError);
  });

  it("event-order and state inconsistencies fail closed", () => {
    const base = `${GO}${UN}${TAIKYOKU}${INIT}`;
    // Non-dealer first draw.
    expect(map(doc(`${base}<U14/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // REACH step 2 without a step-1 declaration.
    expect(map(doc(`${base}<REACH who="0" step="2"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // REACH step 1 twice.
    expect(map(doc(`${base}<REACH who="0" step="1"/><REACH who="0" step="1"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // Pon (7z, m=50763 → target seat 0) with no discard to call.
    expect(map(doc(`${base}<N who="1" m="50763"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // Kakan (50763 | 0x10) without a prior pon.
    expect(map(doc(`${base}<N who="1" m="50779"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // DORA without a pending kan.
    expect(map(doc(`${base}<DORA hai="100"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // Exhaustive draw with zero draws (must be exactly 70).
    expect(map(doc(`${base}<RYUUKYOKU sc="250,0,250,0,250,0,250,0"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // Ron without a prior discard.
    expect(map(doc(`${base}<AGARI who="1" fromWho="0" machi="100" sc="250,0,250,5,250,0,250,-5"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // Tsumo without a draw.
    expect(map(doc(`${base}<AGARI who="0" fromWho="0" machi="100" sc="250,13,250,0,250,0,250,0"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // Round index beyond the supported East/South window.
    expect(map(doc(`${GO}${UN}${TAIKYOKU}<INIT seed="12,0,0,0,0,100" ten="250,250,250,250" oya="0" ${HAI}/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
  });

  it("settlement inconsistencies fail closed", () => {
    // owari even indices disagree with the mapped final scores.
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}<AGARI who="0" fromWho="0" machi="100" ten="30,1000,1" yaku="1,1" sc="250,13,250,0,250,0,250,0" owari="262,10,250,0,250,0,250,0"/>`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
    // The next INIT ten must chain from the previous round's final scores.
    const secondInit = `<INIT seed="1,0,0,0,0,100" ten="251,250,250,250" oya="1" ${HAI}/>`;
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}${AGARI_NO_OWARI}${secondInit}`))).toEqual({
      status: "invalid",
      code: "tenhou_mapper_invalid_event",
    });
  });

  it("a minimal well-formed synthetic round maps ready (harness soundness)", () => {
    // This is a harness soundness control, not new semantics: it proves the
    // fail-closed cases above fail for the stated reason and not because the
    // synthetic scaffolding is broken.
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}${AGARI}`))).toEqual({
      status: "ready",
    });
    // Two closed rounds with the score chain intact (round 2: dealer seat 1
    // draws and tsumos; round 1's final 26300 chains into INIT ten).
    const secondInit = `<INIT seed="1,0,0,0,0,100" ten="263,250,250,250" oya="1" ${HAI}/>`;
    const round2 = `<U101/><AGARI who="1" fromWho="1" machi="101" ten="30,1000,1" yaku="1,1" sc="263,0,266,13,250,0,250,0" owari="263,0,279,10,250,0,250,0"/>`;
    expect(map(doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}${AGARI_NO_OWARI}${secondInit}${round2}`))).toEqual({
      status: "ready",
    });
  });

  it("impossible selfActor fails input validation", () => {
    const result = mapTenhouRecord({
      raw: doc(`${GO}${UN}${TAIKYOKU}${INIT}${T0}${AGARI}`),
      gameId: "synthetic",
      selfActor: 4,
    });
    expect(result).toEqual({ status: "invalid", code: "tenhou_record_invalid_xml" });
  });
});

describe("tenhou tile and meld codecs", () => {
  it("decodes tile codes with red-five awareness", () => {
    expect(tenhouTileCode(0, true)).toEqual({ id: "1m", red: false });
    expect(tenhouTileCode(16, true)).toEqual({ id: "5m", red: true });
    expect(tenhouTileCode(16, false)).toEqual({ id: "5m", red: false });
    expect(tenhouTileCode(52, true)).toEqual({ id: "5p", red: true });
    expect(tenhouTileCode(88, true)).toEqual({ id: "5s", red: true });
    expect(tenhouTileCode(135, true)).toEqual({ id: "7z", red: false });
    expect(isRedCode(20, true)).toBe(false); // 5m non-first copy
    expect(tenhouTileList("0,1,2", true)).toHaveLength(3);
  });

  it("decodes a pinned corpus meld (pon 7z from relative seat +3)", () => {
    // m=50763 from bug2.xml: pon of 7z by seat 1 calling seat 0's discard.
    expect(decodeTenhouMeld(50763, true)).toEqual({
      flavor: "pon",
      relativeSeat: 3,
      calledSlot: 0,
      tiles: [
        { id: "7z", red: false },
        { id: "7z", red: false },
        { id: "7z", red: false },
      ],
    });
  });

  it("rejects undecodable meld bit patterns", () => {
    // Chi run crossing 9 (constructed: n+2 > 9).
    expect(() => decodeTenhouMeld((3 * (7 * 3 + 6) + 0) << 10 | 4 | 1, true)).toThrow(
      TenhouSourceError,
    );
    expect(() => decodeTenhouMeld(-1, true)).toThrow(TenhouSourceError);
    expect(() => decodeTenhouMeld(0x10000, true)).toThrow(TenhouSourceError);
  });
});
