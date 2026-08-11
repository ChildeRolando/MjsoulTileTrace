import { createCipheriv, createDecipheriv } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";

import {
  createMahjongSoulSessionVault,
  MahjongSoulSourceError,
  SecretString,
  type CapturedMahjongSoulCredential,
  type SessionKeyProtector,
  type SessionVaultStore,
} from "../src/index.js";

const TOKEN = "fake-session-token-never-log";

class MemoryStore implements SessionVaultStore {
  value: string | null = null;
  clears = 0;

  async read(): Promise<string | null> {
    return this.value;
  }

  async replace(value: string): Promise<void> {
    this.value = value;
  }

  async clear(): Promise<void> {
    this.clears += 1;
    this.value = null;
  }
}

function protector(): SessionKeyProtector {
  return {
    async wrap(keyBase64) {
      return `wrapped:${keyBase64}`;
    },
    async unwrap(wrappedKey) {
      if (!wrappedKey.startsWith("wrapped:")) {
        throw new MahjongSoulSourceError("mahjong_soul_session_invalid");
      }
      return wrappedKey.slice("wrapped:".length);
    },
  };
}

function credential(token = TOKEN): CapturedMahjongSoulCredential {
  return Object.freeze({
    region: "cn",
    loginMethod: "oauth2Login",
    authType: 7,
    accountId: 123_456,
    displayName: "测试用户",
    accessToken: SecretString.from(token),
  });
}

function create(store = new MemoryStore(), now = () => 1_786_377_600_000) {
  return {
    store,
    vault: createMahjongSoulSessionVault({
      protector: protector(),
      store,
      now,
    }),
  };
}

function rewriteAuthenticatedPayload(
  store: MemoryStore,
  mutate: (payload: Record<string, unknown>) => void,
): void {
  const envelope = JSON.parse(store.value ?? "null") as Record<string, string>;
  const key = Buffer.from(envelope.wrappedKey!.slice("wrapped:".length), "base64");
  const nonce = Buffer.from(envelope.nonce!, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from("mahjong-soul-session-vault/v1", "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.authenticationTag!, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext!, "base64")),
    decipher.final(),
  ]);
  const payload = JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>;
  mutate(payload);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("mahjong-soul-session-vault/v1", "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  store.value = JSON.stringify({
    ...envelope,
    ciphertext: ciphertext.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
  });
}

describe("Mahjong Soul encrypted session vault", () => {
  it("round-trips the exact credential and versioned metadata", async () => {
    const { store, vault } = create();

    await vault.save(credential());
    const restored = await vault.restore();

    expect(restored).toMatchObject({
      region: "cn",
      loginMethod: "oauth2Login",
      authType: 7,
      accountId: 123_456,
      displayName: "测试用户",
      adapterVersion: "0.1.0",
      clientVersion: "0.11.252.w",
      createdAt: 1_786_377_600_000,
      lastValidatedAt: 1_786_377_600_000,
    });
    expect(restored?.accessToken.reveal()).toBe(TOKEN);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(store.value).not.toContain(TOKEN);
    expect(JSON.stringify(restored)).not.toContain(TOKEN);
    expect(inspect(restored)).not.toContain(TOKEN);
  });

  it("uses fresh AES-GCM material for identical credentials", async () => {
    const { store, vault } = create();

    await vault.save(credential());
    const first = store.value;
    await vault.save(credential());
    const second = store.value;

    expect(second).not.toBe(first);
    expect(JSON.parse(second ?? "null")).toEqual(expect.objectContaining({
      version: "mahjong-soul-session-vault/v1",
      wrappedKey: expect.any(String),
      nonce: expect.any(String),
      ciphertext: expect.any(String),
      authenticationTag: expect.any(String),
    }));
    expect(Object.keys(JSON.parse(second ?? "null"))).toEqual([
      "version",
      "wrappedKey",
      "nonce",
      "ciphertext",
      "authenticationTag",
    ]);
  });

  it.each([
    ["version", "mahjong-soul-session-vault/v0"],
    ["wrappedKey", "invalid"],
    ["nonce", "AA=="],
    ["ciphertext", "AA=="],
    ["authenticationTag", "AA=="],
  ])("rejects a tampered envelope field %s with a fixed error", async (field, value) => {
    const { store, vault } = create();
    await vault.save(credential());
    store.value = JSON.stringify({
      ...JSON.parse(store.value ?? "null"),
      [field]: value,
    });

    await expect(vault.restore()).rejects.toMatchObject({
      name: "MahjongSoulSourceError",
      message: "mahjong_soul_session_invalid",
    });
  });

  it("rejects unknown envelope keys and non-canonical base64", async () => {
    const { store, vault } = create();
    await vault.save(credential());
    const envelope = JSON.parse(store.value ?? "null");
    store.value = JSON.stringify({ ...envelope, rawToken: TOKEN });
    await expect(vault.restore()).rejects.toThrow("mahjong_soul_session_invalid");

    store.value = JSON.stringify({ ...envelope, nonce: `${envelope.nonce}\n` });
    await expect(vault.restore()).rejects.toThrow("mahjong_soul_session_invalid");
  });

  it.each([
    ["adapterVersion", "0.0.0"],
    ["clientVersion", "0.11.attacker.w"],
    ["unknownPayloadKey", TOKEN],
  ])("rejects authenticated payload drift in %s", async (field, value) => {
    const { store, vault } = create();
    await vault.save(credential());
    rewriteAuthenticatedPayload(store, (payload) => {
      payload[field] = value;
    });

    await expect(vault.restore()).rejects.toThrow("mahjong_soul_session_invalid");
  });

  it("updates validation time through a new authenticated envelope", async () => {
    const times = [100, 200];
    const { store, vault } = create(new MemoryStore(), () => times.shift() ?? 300);
    await vault.save(credential());
    const before = store.value;

    await vault.markValidated(500);
    const restored = await vault.restore();

    expect(store.value).not.toBe(before);
    expect(restored).toMatchObject({ createdAt: 100, lastValidatedAt: 500 });
    expect(restored?.accessToken.reveal()).toBe(TOKEN);
  });

  it("clears the store and restores null when no session exists", async () => {
    const { store, vault } = create();
    expect(await vault.restore()).toBeNull();

    await vault.save(credential());
    await vault.clear();

    expect(store.clears).toBe(1);
    expect(store.value).toBeNull();
    expect(await vault.restore()).toBeNull();
  });

  it("maps unavailable key protection without leaking secret or prose", async () => {
    const store = new MemoryStore();
    const vault = createMahjongSoulSessionVault({
      protector: {
        async wrap() {
          throw new MahjongSoulSourceError(
            "mahjong_soul_session_storage_unavailable",
          );
        },
        async unwrap() {
          throw new Error(`hostile ${TOKEN}`);
        },
      },
      store,
      now: () => 1,
    });

    await expect(vault.save(credential())).rejects.toMatchObject({
      message: "mahjong_soul_session_storage_unavailable",
    });
    await expect(vault.save(credential())).rejects.not.toThrow(TOKEN);
  });

  it("snapshots credential properties once and never coerces attacker values", async () => {
    const { vault } = create();
    const accesses = new Map<string, number>();
    const target = credential();
    const guarded = new Proxy(target, {
      get(object, property, receiver) {
        const key = String(property);
        accesses.set(key, (accesses.get(key) ?? 0) + 1);
        return Reflect.get(object, property, receiver);
      },
    });

    await vault.save(guarded);
    for (const key of [
      "region",
      "loginMethod",
      "authType",
      "accountId",
      "displayName",
      "accessToken",
    ]) {
      expect(accesses.get(key), key).toBe(1);
    }

    const hostile = {
      ...target,
      accessToken: {
        toString() {
          throw new Error(TOKEN);
        },
      },
    };
    await expect(vault.save(hostile as never)).rejects.toThrow(
      "mahjong_soul_session_invalid",
    );
  });
});
