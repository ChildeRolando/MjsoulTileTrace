import { describe, expect, it } from "vitest";
import { encodeSharedPackageStorage, decodeSharedPackageStorage } from "../src/shared-package-storage.js";
import { createHash } from "node:crypto";
import { cloneWithSharedPackageEvidence, writeCanonicalJson } from "@riichi-coach/reasoning";
const digest = (value: unknown) => { const hash = createHash("sha256"); writeCanonicalJson(value, part => hash.update(part)); return hash.digest("hex"); };

function fixture() {
  const event = (n: number) => ({ eventRef: `event:${n}`, json: JSON.stringify({ type: "draw", n }) });
  return { analysisKey: "test", evidenceRegistry: {}, decisions: [
    { evidenceIds: ["一", "二"], fact: { evidenceIds: ["一", "二"] }, request: { events: [event(0), event(1)] } },
    { evidenceIds: ["二", "一"], request: { events: [event(0), event(1), event(2)] } },
  ], payload: { events: { storageReference: ["history", 0] }, evidenceIds: { storageReference: ["evidence", 0] } } };
}

describe("shared package representation", () => {
  it("preserves exact logical values/order/Unicode and owns immutable-shareable arrays", () => {
    const input = fixture(); const clone = cloneWithSharedPackageEvidence(input);
    expect(clone).toEqual(input);
    expect(clone.decisions[0]!.evidenceIds).toBe(clone.decisions[0]!.fact!.evidenceIds);
    expect(clone.decisions[0]!.evidenceIds).not.toBe(input.decisions[0]!.evidenceIds);
    expect(clone.decisions[0]!.request.events[0]).toBe(clone.decisions[1]!.request.events[0]);
    expect(digest(clone)).toBe(digest(input));
    expect(JSON.stringify(clone)).toBe(JSON.stringify(input));
  });
  it("stores sets and branched event prefixes once and decodes direct shared references", () => {
    const input = fixture(); const encoded = encodeSharedPackageStorage(input) as any;
    expect(encoded.storageReferences.evidenceSets).toHaveLength(2);
    expect(encoded.storageReferences.events).toHaveLength(3);
    expect(encoded.storageReferences.histories).toHaveLength(3);
    const decoded = decodeSharedPackageStorage(encoded) as typeof input;
    expect(decoded).toEqual(input);
    expect(decoded.decisions[0]!.evidenceIds).toBe(decoded.decisions[0]!.fact!.evidenceIds);
    expect(decoded.decisions[0]!.request.events[0]).toBe(decoded.decisions[1]!.request.events[0]);
    const branched = { requests: [{ events: [{ eventRef: "a", json: "{}" }] }, { events: [{ eventRef: "a", json: "[]" }] }] };
    expect(decodeSharedPackageStorage(encodeSharedPackageStorage(branched))).toEqual(branched);
  });
  it("does not rewrite a shared array used in an ordinary payload position", () => {
    const ids = ["a", "b"];
    const input = { evidenceIds: ids, payload: ids };
    expect(decodeSharedPackageStorage(encodeSharedPackageStorage(input))).toEqual(input);
  });
  it.each(["missing", "out-of-range", "forward-history", "bad-event", "wrong-kind"])("rejects malformed references: %s", kind => {
    const encoded = encodeSharedPackageStorage(fixture()) as any;
    if (kind === "missing") delete encoded.storageReferences;
    if (kind === "out-of-range") encoded.decisions[0].evidenceIds.storageReference[1] = 999;
    if (kind === "forward-history") encoded.storageReferences.histories[0][0] = 0;
    if (kind === "bad-event") encoded.storageReferences.events[0].extra = true;
    if (kind === "wrong-kind") encoded.decisions[0].evidenceIds.storageReference[0] = "history";
    expect(() => decodeSharedPackageStorage(encoded)).toThrow("package_storage_references_invalid");
  });
});
