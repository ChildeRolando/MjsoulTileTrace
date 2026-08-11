import { describe, expect, it } from "vitest";

import {
  createElectronSessionKeyProtector,
  type SafeStoragePort,
} from "../src/electron-safe-storage.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

function fakeSafeStorage(input: {
  available?: boolean;
  backend?: string;
  shouldReEncrypt?: boolean;
} = {}): SafeStoragePort {
  return {
    async isAsyncEncryptionAvailable() {
      return input.available ?? true;
    },
    getSelectedStorageBackend() {
      return input.backend ?? "unknown";
    },
    async encryptStringAsync(value) {
      return Buffer.from(`sealed:${value}`, "utf8");
    },
    async decryptStringAsync(value) {
      const text = value.toString("utf8");
      if (!text.startsWith("sealed:")) throw new Error("hostile decrypt prose");
      return {
        result: text.slice("sealed:".length),
        shouldReEncrypt: input.shouldReEncrypt ?? false,
      };
    },
  };
}

describe("Electron safeStorage session-key protector", () => {
  it.each(["win32", "darwin"] as const)(
    "round-trips a canonical key on %s",
    async (platform) => {
      const protector = createElectronSessionKeyProtector({
        safeStorage: fakeSafeStorage(),
        platform,
      });

      const wrapped = await protector.wrap(KEY);

      expect(Buffer.from(wrapped, "base64").toString("utf8")).toBe(`sealed:${KEY}`);
      await expect(protector.unwrap(wrapped)).resolves.toBe(KEY);
    },
  );

  it.each(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"])(
    "accepts secure Linux backend %s",
    async (backend) => {
      const protector = createElectronSessionKeyProtector({
        safeStorage: fakeSafeStorage({ backend }),
        platform: "linux",
      });

      await expect(protector.unwrap(await protector.wrap(KEY))).resolves.toBe(KEY);
    },
  );

  it.each(["basic_text", "unknown"])(
    "rejects insecure Linux backend %s",
    async (backend) => {
      const protector = createElectronSessionKeyProtector({
        safeStorage: fakeSafeStorage({ backend }),
        platform: "linux",
      });

      await expect(protector.wrap(KEY)).rejects.toThrow(
        "mahjong_soul_session_storage_unavailable",
      );
    },
  );

  it("rejects unavailable async encryption on every platform", async () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      const protector = createElectronSessionKeyProtector({
        safeStorage: fakeSafeStorage({ available: false, backend: "gnome_libsecret" }),
        platform,
      });
      await expect(protector.wrap(KEY)).rejects.toThrow(
        "mahjong_soul_session_storage_unavailable",
      );
    }
  });

  it.each([
    "not-base64",
    "AA==\n",
    Buffer.from("unsealed", "utf8").toString("base64"),
  ])("rejects malformed wrapped input without reflecting it", async (wrapped) => {
    const protector = createElectronSessionKeyProtector({
      safeStorage: fakeSafeStorage(),
      platform: "win32",
    });

    await expect(protector.unwrap(wrapped)).rejects.toMatchObject({
      message: "mahjong_soul_session_storage_unavailable",
    });
  });

  it("accepts a rotation-marked result for immediate vault rewrap", async () => {
    const protector = createElectronSessionKeyProtector({
      safeStorage: fakeSafeStorage({ shouldReEncrypt: true }),
      platform: "darwin",
    });

    await expect(protector.unwrap(await protector.wrap(KEY))).resolves.toBe(KEY);
  });

  it("maps hostile backend failures to a fixed project error", async () => {
    const protector = createElectronSessionKeyProtector({
      safeStorage: {
        ...fakeSafeStorage(),
        async encryptStringAsync() {
          throw new Error("hostile token=secret backend prose");
        },
      },
      platform: "win32",
    });

    await expect(protector.wrap(KEY)).rejects.toMatchObject({
      name: "MahjongSoulSourceError",
      message: "mahjong_soul_session_storage_unavailable",
    });
  });
});
