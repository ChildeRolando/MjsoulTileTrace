import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeStoredRecordActions, loadMahjongSoulProtocolBundle, mapMahjongSoulRecord, unwrapGameDetailRecords } from "../src/index.js";
import { extractRecordRuleEvidence, projectRecordRules, validateRecordRuleEvidence } from "../src/record-rule-evidence.js";

const bundleRoot = fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("fixtures/real-supported-round.json", import.meta.url), "utf8")) as { recordId: string; wire: string };
const standardHead = () => ({ uuid: fixture.recordId, standard_rule: 2,
  config: { category: 2, mode: { mode: 2 }, meta: { mode_id: 12 } } });
const realRanked = JSON.parse(readFileSync(new URL("fixtures/real-ranked-rule-config.json", import.meta.url), "utf8"));
const fullRecord = JSON.parse(readFileSync(new URL("fixtures/real-record-complete.json", import.meta.url), "utf8"));

describe("same-record Mahjong Soul rule evidence", () => {
  it.each([0, 1, 2, 3])("preserves the complete freshly captured nine-round source for actor %s", async selfActor => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = unwrapGameDetailRecords(bundle, Buffer.from(fullRecord.wire, "hex"));
    const evidence = extractRecordRuleEvidence({ bundle, recordId: fullRecord.recordId, recordBytes,
      head: { uuid: fullRecord.recordId, standard_rule: realRanked.standardRule, config: realRanked.configuration } })!;
    expect(evidence).toEqual(fullRecord.ruleEvidence);
    const mapped = mapMahjongSoulRecord({ bundle, recordId: fullRecord.recordId, recordBytes,
      ruleEvidence: evidence, selfActor, gameId: `real-ranked:${selfActor}` });
    if (mapped.status !== "ready") throw new Error(mapped.code);
    expect(mapped.stream.events).toHaveLength(1026);
    expect(mapped.stream.events.filter(event => event.type === "round_started")).toHaveLength(9);
    expect(mapped.stream.completeness.doraIndicators).toBe("complete");
    expect(mapped.stream.completeness.responseOpportunities).toBe("complete");
    expect(mapped.stream.completeness.remainingDraws).toBe("complete");
    expect(mapped.stream.ruleSet).toEqual({ length: "south", redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true, atamahane: "unknown", westExtension: "sudden_death", ippatsuCancelledByAnkan: true });
  });

  it("retains every original stored action and ordinal while restoring discarded dora evidence", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const oldRecord = JSON.parse(readFileSync(new URL("fixtures/real-record-wire.json", import.meta.url), "utf8"));
    const decode = (wire: string) => decodeStoredRecordActions(bundle, unwrapGameDetailRecords(bundle, Buffer.from(wire, "hex")));
    const oldActions = decode(oldRecord.wire), newActions = decode(fullRecord.wire);
    const withoutDoras = (actions: ReturnType<typeof decode>) => actions.map(action => {
      const { doras: _doras, ...data } = action.data;
      return { ...action, data };
    });
    expect(newActions).toHaveLength(978);
    expect(withoutDoras(newActions)).toEqual(withoutDoras(oldActions));
    expect(newActions.filter(action => Array.isArray(action.data.doras) && action.data.doras.length > 1).length).toBeGreaterThan(0);
  });

  it("recognizes the captured ranked profile with an explicit default detail message", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
    const evidence = extractRecordRuleEvidence({ bundle, recordId: fixture.recordId, recordBytes,
      head: { uuid: fixture.recordId, standard_rule: realRanked.standardRule, config: realRanked.configuration } })!;
    expect(evidence.hasCustomRules).toBe(false);
    expect(projectRecordRules(evidence)).toEqual({ length: "south", redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true, atamahane: "unknown", westExtension: "sudden_death", ippatsuCancelledByAnkan: true });
  });

  it.each([{}, { dora_count: 0, shiduan: 0 }])("treats explicit proto defaults as an empty ranked detail message: %j", async detail_rule => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const evidence = extractRecordRuleEvidence({ bundle, recordId: fixture.recordId, recordBytes: Uint8Array.of(1),
      head: { ...standardHead(), config: { category: 2, mode: { mode: 2, detail_rule }, meta: { mode_id: 12 } } } })!;
    expect(evidence.hasCustomRules).toBe(false);
    expect(projectRecordRules(evidence).length).toBe("south");
  });

  it.each([{ dora_count: 4 }, { shiduan: 1 }, { have_yifa: true }, { amusement_switches: [1] }])(
    "still rejects an actual non-default detail rule: %j", async detail_rule => {
      const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
      const config = structuredClone(realRanked.configuration);
      Object.assign(config.mode.detail_rule, detail_rule);
      const evidence = extractRecordRuleEvidence({ bundle, recordId: fixture.recordId, recordBytes: Uint8Array.of(1),
        head: { uuid: fixture.recordId, standard_rule: realRanked.standardRule, config } })!;
      expect(evidence.hasCustomRules).toBe(true);
      expect(projectRecordRules(evidence).length).toBe("unknown");
    });

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

  it.each([undefined, 0, 3])("leaves unrecognized standard_rule=%s unknown", async standard_rule => {
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
    { category: 2, mode: { mode: 2, detail_rule: { dora_count: 4 } }, meta: { mode_id: 12 } },
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
