import { describe, expect, it } from "vitest";
import type { AnalyzableRecordSummary } from "@riichi-coach/contracts";
import {
  createMahjongSoulCatalogStore,
  type CatalogKeyProtector,
  type CatalogVaultStore,
} from "../src/catalog-store.js";

const identityProtector: CatalogKeyProtector = {
  async wrap(keyBase64) {
    return keyBase64;
  },
  async unwrap(wrappedKey) {
    return wrappedKey;
  },
};

class FakeStore implements CatalogVaultStore {
  value: string | null = null;

  async read(): Promise<string | null> {
    return this.value;
  }

  async replace(value: string): Promise<void> {
    this.value = value;
  }

  async clear(): Promise<void> {
    this.value = null;
  }
}

function summary(id: string, startedAt: number): AnalyzableRecordSummary {
  return {
    recordId: id,
    shareUrl: `https://game.maj-soul.com/1/?paipu=${id}_a1`,
    startedAt,
    players: [
      { seat: 0, displayName: "A", finalScore: 32_000, rank: 1 },
      { seat: 1, displayName: "B", finalScore: 27_000, rank: 2 },
      { seat: 2, displayName: "C", finalScore: 23_000, rank: 3 },
      { seat: 3, displayName: "D", finalScore: 18_000, rank: 4 },
    ],
    selfSeat: 2,
    rule: {
      playerCount: 4,
      length: "south",
      modeId: 2,
      detailRuleHash: "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c",
      displayLabel: "四人南风",
    },
    analysisStatus: "not_analyzed",
    lastSyncedAt: startedAt + 100,
  };
}

const firstId = "260811-00000000-0000-0000-0000-000000000001";
const secondId = "260811-00000000-0000-0000-0000-000000000002";

describe("encrypted Mahjong Soul catalog store", () => {
  it("merges by record id and round-trips through encryption", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({
      protector: identityProtector,
      store,
    });

    await catalog.replaceSummaries(103, [
      summary(firstId, 1_000),
      summary(secondId, 2_000),
    ]);
    const first = await catalog.list(103);
    expect(first.map((entry) => entry.recordId)).toEqual([secondId, firstId]);

    // A re-sync with a fresher timestamp replaces, never duplicates.
    await catalog.replaceSummaries(103, [summary(firstId, 3_000)]);
    const merged = await catalog.list(103);
    expect(merged.map((entry) => entry.recordId)).toEqual([firstId]);
    expect(merged.find((entry) => entry.recordId === firstId)?.startedAt).toBe(3_000);
  });

  it("encrypts with a fresh key and nonce so ciphertext never repeats", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({
      protector: identityProtector,
      store,
    });

    await catalog.replaceSummaries(103, [summary(firstId, 1_000)]);
    const first = store.value;
    await catalog.replaceSummaries(103, [summary(firstId, 2_000)]);
    const second = store.value;
    expect(first).not.toBe(second);
    expect(first).not.toContain(firstId);
    expect(second).not.toContain(firstId);
  });

  it("rejects a tampered ciphertext with a fixed invalid code", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({
      protector: identityProtector,
      store,
    });
    await catalog.replaceSummaries(103, [summary(firstId, 1_000)]);

    const envelope = JSON.parse(store.value!) as Record<string, unknown>;
    const ciphertext = Buffer.from(envelope.ciphertext as string, "base64");
    ciphertext[0] = ciphertext[0]! ^ 0xff;
    envelope.ciphertext = ciphertext.toString("base64");
    store.value = JSON.stringify(envelope);

    await expect(catalog.list(103)).rejects.toThrow("mahjong_soul_session_invalid");
  });

  it("rejects malformed or unknown envelope keys", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({
      protector: identityProtector,
      store,
    });
    store.value = JSON.stringify({ version: "evil", extra: "secret" });
    await expect(catalog.list(103)).rejects.toThrow("mahjong_soul_session_invalid");
  });

  it("clears the store and returns an empty catalog", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({
      protector: identityProtector,
      store,
    });
    await catalog.replaceSummaries(103, [summary(firstId, 1_000)]);
    await catalog.clear();
    expect(store.value).toBeNull();
    expect(await catalog.list(103)).toEqual([]);
  });

  it("rejects a non-summary entry instead of persisting it", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({
      protector: identityProtector,
      store,
    });
    await expect(catalog.replaceSummaries(103, [
      { ...summary(firstId, 1_000), token: "secret" } as unknown as AnalyzableRecordSummary,
    ])).rejects.toThrow("mahjong_soul_session_invalid");
    expect(store.value).toBeNull();
  });

  it("caps the catalog at the most recent entries instead of growing unbounded", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({
      protector: identityProtector,
      store,
    });

    const ids = Array.from({ length: 40 }, (_, index) =>
      `260811-00000000-0000-0000-0000-${String(index).padStart(12, "0")}`
    );
    await catalog.replaceSummaries(103, ids.map((id, index) => summary(id, 1_000 + index)));

    const listed = await catalog.list(103);
    expect(listed).toHaveLength(30);
    // The 30 newest survive; the 10 oldest are pruned.
    expect(listed.every((entry) => entry.startedAt >= 1_010)).toBe(true);
    expect(listed.some((entry) => entry.startedAt < 1_010)).toBe(false);
  });

  it("binds the encrypted catalog to one account and authoritatively replaces it", async () => {
    const store = new FakeStore();
    const catalog = createMahjongSoulCatalogStore({ protector: identityProtector, store });
    await catalog.replaceSummaries(103, [summary(firstId, 1_000)]);
    expect(await catalog.list(104)).toEqual([]);
    await catalog.replaceSummaries(103, []);
    expect(await catalog.list(103)).toEqual([]);
  });
});
