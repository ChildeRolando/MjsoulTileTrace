import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SecretString,
  createMahjongSoulSessionVault,
  type CapturedMahjongSoulCredential,
  type MahjongSoulLoginProviderResult,
  type SessionKeyProtector,
} from "@riichi-coach/mahjong-soul-source";
import { createMahjongSoulSessionService } from "../src/mahjong-soul-session-service.js";
import { createRecoverableSessionFile } from "../src/recoverable-session-file.js";

const TOKEN = "restart-fixture-token-never-real";
const credential: CapturedMahjongSoulCredential = Object.freeze({
  region: "cn",
  loginMethod: "login",
  authType: 0,
  accountId: 123_456_789,
  displayName: "重启测试",
  accessToken: SecretString.from(TOKEN),
});

const protector: SessionKeyProtector = Object.freeze({
  async wrap(value: string) { return Buffer.from(`wrapped:${value}`, "utf8").toString("base64"); },
  async unwrap(value: string) {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (!decoded.startsWith("wrapped:")) throw new Error("invalid");
    return decoded.slice("wrapped:".length);
  },
});

const provider = (result: MahjongSoulLoginProviderResult) => ({
  calls: [] as unknown[],
  async run(input: unknown) { this.calls.push(input); return result; },
  cancelActive() {},
});

describe("cross-restart encrypted Mahjong Soul session", () => {
  it("restores only the same identity and removes the vault on logout", async () => {
    const root = await mkdtemp(join(tmpdir(), "riichi-session-restart-"));
    try {
      let now = 100;
      const firstVault = createMahjongSoulSessionVault({
        protector,
        store: createRecoverableSessionFile({ root }),
        now: () => now,
      });
      const firstProvider = provider({ status: "authenticated", credential });
      const first = createMahjongSoulSessionService({
        vault: firstVault,
        loginProvider: firstProvider,
        browserSession: { clearStorageData: async () => {}, clearCache: async () => {} },
        clock: () => now,
      });
      await expect(first.openLogin()).resolves.toMatchObject({ status: "valid" });

      const serialized = (await Promise.all(
        (await readdir(root)).map(async (name) => await readFile(join(root, name), "utf8").catch(() => "")),
      )).join("\n");
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain("123456789");

      now = 200;
      const secondVault = createMahjongSoulSessionVault({
        protector,
        store: createRecoverableSessionFile({ root }),
        now: () => now,
      });
      const secondProvider = provider({ status: "authenticated", credential });
      const second = createMahjongSoulSessionService({
        vault: secondVault,
        loginProvider: secondProvider,
        browserSession: { clearStorageData: async () => {}, clearCache: async () => {} },
        clock: () => now,
      });
      await expect(second.initialize()).resolves.toEqual({
        region: "cn",
        status: "valid",
        displayName: "重启测试",
        lastValidatedAt: 200,
      });
      expect(secondProvider.calls).toEqual([{
        mode: "restore",
        expected: { loginMethod: "login", accountId: 123_456_789 },
      }]);
      await second.logout();
      expect(await readdir(root)).not.toContain("session.vault.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
