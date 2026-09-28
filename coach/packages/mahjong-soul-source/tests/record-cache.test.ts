import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeMahjongSoulRecordCache, encodeMahjongSoulRecordCache, fetchMahjongSoulRecord, loadMahjongSoulProtocolBundle } from "../src/index.js";

async function material() {
  const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
  const fixture = JSON.parse(readFileSync(new URL("fixtures/real-supported-round.json", import.meta.url), "utf8")) as { recordId: string; wire: string };
  const record = await fetchMahjongSoulRecord({ bundle, recordId: fixture.recordId, clientVersionString: "web-0.11.252.w",
    session: { async authenticate() {}, async close() {}, async call() { return {
      data: Buffer.from(fixture.wire, "hex"), head: { uuid: fixture.recordId, standard_rule: 2,
        config: { category: 2, mode: { mode: 2 }, meta: { mode_id: 12 } } },
    }; } }, fetchImpl: async () => { throw new Error("unused"); } });
  return { bundle, record };
}

describe("versioned Mahjong Soul raw cache content", () => {
  it("reads a self-describing diagnostic capture with the same strict byte binding", async () => {
    const { bundle, record } = await material();
    const reopened = decodeMahjongSoulRecordCache({ bundle, cacheBytes: encodeMahjongSoulRecordCache({ bundle, ...record }) });
    expect(reopened).toEqual(record);
  });

  it("round trips the bytes and immutable rule evidence", async () => {
    const { bundle, record } = await material();
    const cacheBytes = encodeMahjongSoulRecordCache({ bundle, ...record });
    const reopened = decodeMahjongSoulRecordCache({ bundle, recordId: record.recordId, cacheBytes });
    expect(reopened).toEqual(record);
    expect(reopened.recordBytes).not.toBe(record.recordBytes);
    expect(Object.isFrozen(reopened.ruleEvidence)).toBe(true);
  });

  it.each(["wrong-record", "wrong-byte-binding", "extra-field", "invalid-base64", "v1", "null-evidence"] as const)("rejects corrupted or unbound cache: %s", async variant => {
    const { bundle, record } = await material();
    const envelope = JSON.parse(Buffer.from(encodeMahjongSoulRecordCache({ bundle, ...record })).toString("utf8"));
    if (variant === "wrong-record") envelope.recordId = record.recordId.replace(/1$/u, "2");
    if (variant === "wrong-byte-binding") envelope.ruleEvidence.recordSha256 = `sha256:${"0".repeat(64)}`;
    if (variant === "extra-field") envelope.extra = 1;
    if (variant === "invalid-base64") envelope.recordBase64 += "?";
    if (variant === "v1") envelope.schemaVersion = "game-detail-records/v1";
    if (variant === "null-evidence") envelope.ruleEvidence = null;
    expect(() => decodeMahjongSoulRecordCache({ bundle, recordId: record.recordId, cacheBytes: Buffer.from(JSON.stringify(envelope)) }))
      .toThrow(variant.startsWith("wrong-") ? "mahjong_soul_record_identity_mismatch" : "mahjong_soul_record_fetch_failed");
  });

  it("retains explicit absence of metadata without filling a profile", async () => {
    const { bundle, record } = await material();
    const withoutMetadata = { bundle, recordId: record.recordId, recordBytes: record.recordBytes };
    const reopened = decodeMahjongSoulRecordCache({ bundle, recordId: record.recordId, cacheBytes: encodeMahjongSoulRecordCache(withoutMetadata) });
    expect(reopened.ruleEvidence).toBeUndefined();
    expect(reopened.recordBytes).toEqual(record.recordBytes);
  });
});
