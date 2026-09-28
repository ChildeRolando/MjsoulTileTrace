import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMahjongSoulProtocolBundle, mapMahjongSoulRecord, unwrapGameDetailRecords } from "../src/index.js";
import { extractRecordRuleEvidence, projectRecordRules, validateRecordRuleEvidence } from "../src/record-rule-evidence.js";

const bundleRoot = fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("fixtures/real-supported-round.json", import.meta.url), "utf8")) as { recordId: string; wire: string };
const standardHead = () => ({ uuid: fixture.recordId, standard_rule: 2,
  config: { category: 2, mode: { mode: 2 }, meta: { mode_id: 12 } } });

describe("same-record Mahjong Soul rule evidence", () => {
  it("projects attested standard rules and binds evidence into canonical source identity", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
    const ruleEvidence = extractRecordRuleEvidence({ bundle, head: standardHead(), recordId: fixture.recordId, recordBytes })!;
    const input = { gameId: "rule-metadata", selfActor: 2, recordId: fixture.recordId, recordBytes, bundle };
    const mapped = mapMahjongSoulRecord({ ...input, ...{ ruleEvidence } });
    const noHeader = mapMahjongSoulRecord(input);
    expect(mapped.status).toBe("ready");
    expect(noHeader.status).toBe("ready");
    if (mapped.status !== "ready" || noHeader.status !== "ready") throw new Error("fixture");
    expect(mapped.stream.ruleSet).toEqual({ length: "south", redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true, atamahane: "unknown", westExtension: "sudden_death", ippatsuCancelledByAnkan: true });
    expect(mapped.stream.completeness.ruleSet).toBe("partial");
    expect(mapped.stream.sourceRecordHash).not.toBe(noHeader.stream.sourceRecordHash);
    expect(mapped.stream.events).toEqual(noHeader.stream.events);
    expect(noHeader.stream.ruleSet.redFives).toEqual({ man: "unknown", pin: "unknown", sou: "unknown" });
  });

  it.each(["record", "bytes"] as const)("rejects evidence reused across different %s", async variant => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
    const ruleEvidence = extractRecordRuleEvidence({ bundle, head: standardHead(), recordId: fixture.recordId, recordBytes })!;
    const wrong = { ...ruleEvidence, ...(variant === "record" ? { recordId: fixture.recordId + "-other" }
      : { recordSha256: `sha256:${"0".repeat(64)}` }) };
    expect(mapMahjongSoulRecord({ gameId: "rule-metadata", selfActor: 2, recordId: fixture.recordId,
      recordBytes, bundle, ...{ ruleEvidence: wrong } })).toEqual({ status: "invalid", code: "mahjong_soul_canonical_mapping_failed" });
  });

  it("binds configuration changes even when the projected rule values remain equal", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
    const streams = [9, 12].map(mode_id => {
      const head = standardHead(); head.config.meta.mode_id = mode_id;
      const ruleEvidence = extractRecordRuleEvidence({ bundle, head, recordId: fixture.recordId, recordBytes })!;
      const mapped = mapMahjongSoulRecord({ gameId: "same-game", selfActor: 2, recordId: fixture.recordId, recordBytes, bundle, ruleEvidence });
      if (mapped.status !== "ready") throw new Error("fixture");
      return mapped.stream;
    });
    expect(streams[0]!.ruleSet).toEqual(streams[1]!.ruleSet);
    expect(streams[0]!.sourceRecordHash).not.toBe(streams[1]!.sourceRecordHash);
  });

  it.each([undefined, 0, 1, 3])("leaves unrecognized standard_rule=%s unknown", async standard_rule => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const { standard_rule: _ignored, ...head } = standardHead();
    const evidence = extractRecordRuleEvidence({ bundle, head: { ...head, ...(standard_rule === undefined ? {} : { standard_rule }) },
      recordId: fixture.recordId, recordBytes: Uint8Array.of(1) });
    expect(projectRecordRules(evidence).length).toBe("unknown");
  });

  it.each([3, 6, 9, 12, 16])("recognizes the source-locked four-player South ranked mode %s", async matchModeId => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = Uint8Array.of(1, 2, 3);
    const head = standardHead(); head.config.meta.mode_id = matchModeId;
    const evidence = extractRecordRuleEvidence({ bundle, head, recordId: fixture.recordId, recordBytes })!;
    expect(projectRecordRules(evidence).redFives).toEqual({ man: 1, pin: 1, sou: 1 });
    expect(evidence.recordSha256).toBe(`sha256:${createHash("sha256").update(recordBytes).digest("hex")}`);
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it.each([
    { category: 1, mode: { mode: 2 }, meta: { room_id: 55 } },
    { category: 2, mode: { mode: 1 }, meta: { mode_id: 11 } },
    { category: 2, mode: { mode: 2, detail_rule: {} }, meta: { mode_id: 12 } },
    { category: 2, mode: { mode: 2, ai: true }, meta: { mode_id: 12 } },
    { category: 2, mode: { mode: 2, extendinfo: "custom" }, meta: { mode_id: 12 } },
    { category: 2, mode: { mode: 2, testing_environment: {} }, meta: { mode_id: 12 } },
    { category: 2, mode: { mode: 2 }, meta: { mode_id: 999 } },
    { category: 2, mode: { mode: 2 } },
  ])("does not fill a standard profile for custom or unknown metadata: %j", async config => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const evidence = extractRecordRuleEvidence({ bundle, head: { ...standardHead(), config }, recordId: fixture.recordId, recordBytes: Uint8Array.of(1) });
    expect(projectRecordRules(evidence).openTanyao).toBe("unknown");
    expect(projectRecordRules(evidence).redFives).toEqual({ man: "unknown", pin: "unknown", sou: "unknown" });
  });

  it("rejects executable or unknown evidence fields before consuming them", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = Uint8Array.of(1);
    const evidence = extractRecordRuleEvidence({ bundle, head: standardHead(), recordId: fixture.recordId, recordBytes })!;
    let called = false;
    const getter = { ...evidence };
    Object.defineProperty(getter, "mode", { enumerable: true, get() { called = true; return 2; } });
    expect(() => validateRecordRuleEvidence(getter, fixture.recordId, recordBytes)).toThrow("mahjong_soul_record_fetch_failed");
    expect(called).toBe(false);
    expect(() => validateRecordRuleEvidence({ ...evidence, extra: 1 }, fixture.recordId, recordBytes)).toThrow("mahjong_soul_record_fetch_failed");
  });
});
