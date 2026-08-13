import { describe, expect, it } from "vitest";

import {
  MAHJONG_SOUL_CN_CLIENT_VERSION,
  MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
  SecretString,
  createMahjongSoulSessionController,
  type CapturedMahjongSoulRestoreCandidate,
  type MahjongSoulSessionVault,
  type StoredMahjongSoulSession,
} from "../src/index.js";

const recoveryContext = Object.freeze({
  device: Object.freeze({
    platform: "pc", hardware: "pc", os: "windows", osVersion: "10",
    isBrowser: true, software: "Chrome", salePlatform: "web",
    hardwareVendor: "fixture", modelNumber: "fixture", screenWidth: 1,
    screenHeight: 1, userAgent: "fixture", screenType: 0,
  }),
  clientVersion: Object.freeze({ resource: "0.11.252.w", package: "" }),
  currencyPlatforms: Object.freeze([2]), version: 1,
  clientVersionString: "web-0.11.252.w", tag: "chs_t",
});

const credential = (overrides: Partial<CapturedMahjongSoulRestoreCandidate> = {}) => Object.freeze({
  region: "cn" as const,
  loginMethod: "login" as const,
  authType: 0,
  accountId: 123,
  displayName: "测试用户",
  accessToken: SecretString.from("fixture-token"),
  recoveryContext,
  ...overrides,
});

const stored = (overrides: Partial<StoredMahjongSoulSession> = {}) => Object.freeze({
  ...credential(),
  adapterVersion: MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
  clientVersion: MAHJONG_SOUL_CN_CLIENT_VERSION,
  createdAt: 100,
  lastValidatedAt: 100,
  ...overrides,
});

class FakeVault implements MahjongSoulSessionVault {
  value: StoredMahjongSoulSession | null;
  readonly operations: string[] = [];
  failSave = false;
  constructor(value: StoredMahjongSoulSession | null = null) { this.value = value; }
  async save(value: CapturedMahjongSoulRestoreCandidate): Promise<void> {
    this.operations.push("save");
    if (this.failSave) throw new Error("hostile token prose");
    this.value = stored({
      ...value,
      createdAt: 200,
      lastValidatedAt: 200,
    });
  }
  async restore(): Promise<StoredMahjongSoulSession | null> {
    this.operations.push("restore");
    return this.value;
  }
  async markValidated(at: number): Promise<void> {
    this.operations.push("markValidated");
    if (this.value === null) throw new Error("missing");
    this.value = stored({ ...this.value, lastValidatedAt: at });
  }
  async clear(): Promise<void> { this.operations.push("clear"); this.value = null; }
}

type LoginResult =
  | { readonly status: "authenticated"; readonly credential: CapturedMahjongSoulRestoreCandidate }
  | { readonly status: "rejected" | "unverified" | "cancelled" };

class FakeLoginProvider {
  readonly calls: unknown[] = [];
  next: LoginResult = { status: "cancelled" };
  pending: Promise<LoginResult> | null = null;
  cancelCalls = 0;
  run(input: unknown): Promise<LoginResult> {
    this.calls.push(input);
    return this.pending ?? Promise.resolve(this.next);
  }
  cancelActive(): void { this.cancelCalls += 1; }
}

class FakeSessionRestorer {
  readonly calls: StoredMahjongSoulSession[] = [];
  next: LoginResult = { status: "unverified" };
  async restore(session: StoredMahjongSoulSession): Promise<LoginResult> {
    this.calls.push(session);
    return this.next;
  }
}

const create = (input: {
  vault?: FakeVault;
  login?: FakeLoginProvider;
  restorer?: FakeSessionRestorer;
  clear?: () => Promise<void>;
  now?: () => number;
} = {}) => {
  const vault = input.vault ?? new FakeVault();
  const login = input.login ?? new FakeLoginProvider();
  const restorer = input.restorer ?? new FakeSessionRestorer();
  const clears: string[] = [];
  const controller = createMahjongSoulSessionController({
    vault,
    loginProvider: login,
    sessionRestorer: restorer,
    clearBrowserSession: input.clear ?? (async () => { clears.push("browser"); }),
    clock: input.now ?? (() => 300),
  });
  return { controller, vault, login, restorer, clears };
};

describe("Mahjong Soul session lifecycle", () => {
  it("starts logged out when no encrypted session exists", async () => {
    const { controller } = create();
    await expect(controller.initialize()).resolves.toEqual({
      region: "cn",
      status: "logged_out",
    });
    expect(Object.isFrozen(controller.getStatus())).toBe(true);
  });

  it("saves one interactive capture before reporting valid", async () => {
    const login = new FakeLoginProvider();
    login.next = { status: "authenticated", credential: credential() };
    const { controller, vault } = create({ login });

    await expect(controller.openLogin()).resolves.toEqual({
      region: "cn",
      status: "valid",
      displayName: "测试用户",
      lastValidatedAt: 300,
    });
    expect(vault.operations).toEqual(["save"]);
  });

  it("validates a restored session only against the same method and account", async () => {
    const vault = new FakeVault(stored());
    const login = new FakeLoginProvider();
    login.next = { status: "authenticated", credential: credential() };
    const restorer = new FakeSessionRestorer();
    restorer.next = { status: "authenticated", credential: credential() };
    const { controller } = create({ vault, login, restorer });

    const pending = controller.initialize();
    expect(controller.getStatus().status).toBe("session_validating");
    await expect(pending).resolves.toEqual({
      region: "cn",
      status: "valid",
      displayName: "测试用户",
      lastValidatedAt: 300,
    });
    expect(login.calls).toEqual([]);
    expect(restorer.calls).toEqual([stored()]);
    expect(vault.operations).toEqual(["restore", "markValidated"]);
  });

  it("preserves the vault as offline-unverified on restore network failure", async () => {
    const vault = new FakeVault(stored());
    const login = new FakeLoginProvider();
    login.next = { status: "unverified" };
    const restorer = new FakeSessionRestorer();
    restorer.next = { status: "unverified" };
    const { controller } = create({ vault, login, restorer });

    await expect(controller.initialize()).resolves.toEqual({
      region: "cn",
      status: "offline_unverified",
      displayName: "测试用户",
      lastValidatedAt: 100,
    });
    expect(vault.value).not.toBeNull();
  });

  it.each([
    { status: "rejected" as const },
    { status: "authenticated" as const, credential: credential({ accountId: 456 }) },
  ])("clears a restored session on rejection or identity mismatch", async (result) => {
    const vault = new FakeVault(stored());
    const login = new FakeLoginProvider();
    login.next = result;
    const restorer = new FakeSessionRestorer();
    restorer.next = result;
    const { controller } = create({ vault, login, restorer });

    await expect(controller.initialize()).resolves.toEqual({
      region: "cn",
      status: "logged_out",
    });
    expect(vault.operations.at(-1)).toBe("clear");
  });

  it("does not report valid when encrypted persistence fails", async () => {
    const vault = new FakeVault();
    vault.failSave = true;
    const login = new FakeLoginProvider();
    login.next = { status: "authenticated", credential: credential() };
    const { controller } = create({ vault, login });

    await expect(controller.openLogin()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    expect(controller.getStatus().status).toBe("logged_out");
  });

  it("coalesces duplicate login calls and keeps the prior status on cancel", async () => {
    const login = new FakeLoginProvider();
    let resolve!: (value: LoginResult) => void;
    login.pending = new Promise((done) => { resolve = done; });
    const { controller } = create({ login });

    const first = controller.openLogin();
    const second = controller.openLogin();
    expect(controller.getStatus().status).toBe("authenticating");
    expect(login.calls).toHaveLength(1);
    resolve({ status: "cancelled" });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { region: "cn", status: "logged_out" },
      { region: "cn", status: "logged_out" },
    ]);
  });

  it("cancels login, clears browser data, then clears the vault on logout", async () => {
    const operations: string[] = [];
    const vault = new FakeVault(stored());
    vault.clear = async () => { operations.push("vault"); vault.value = null; };
    const login = new FakeLoginProvider();
    login.cancelActive = () => { operations.push("cancel"); login.cancelCalls += 1; };
    const { controller } = create({
      vault,
      login,
      clear: async () => { operations.push("browser"); },
    });

    await expect(controller.logout()).resolves.toEqual({
      region: "cn",
      status: "logged_out",
    });
    expect(operations).toEqual(["cancel", "browser", "vault"]);
  });

  it("preserves the vault and prior status when browser clearing fails", async () => {
    const vault = new FakeVault(stored());
    const { controller } = create({
      vault,
      clear: async () => { throw new Error("hostile partition prose"); },
    });
    await controller.initialize();

    await expect(controller.logout()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    expect(vault.value).not.toBeNull();
    expect(vault.operations).not.toContain("clear");
  });

  it("snapshots vault and login capabilities once", async () => {
    const vaultTarget = new FakeVault();
    const loginTarget = new FakeLoginProvider();
    const reads = new Map<string, number>();
    const vault = Object.create(null) as MahjongSoulSessionVault;
    for (const method of ["save", "restore", "markValidated", "clear"] as const) {
      Object.defineProperty(vault, method, {
        get() {
          const key = `vault.${method}`;
          reads.set(key, (reads.get(key) ?? 0) + 1);
          return vaultTarget[method].bind(vaultTarget);
        },
      });
    }
    const login = Object.create(null) as FakeLoginProvider;
    for (const method of ["run", "cancelActive"] as const) {
      Object.defineProperty(login, method, {
        get() {
          const key = `login.${method}`;
          reads.set(key, (reads.get(key) ?? 0) + 1);
          return loginTarget[method].bind(loginTarget);
        },
      });
    }

    const controller = createMahjongSoulSessionController({
      vault,
      loginProvider: login,
      sessionRestorer: new FakeSessionRestorer(),
      clearBrowserSession: async () => {},
      clock: () => 300,
    });
    await controller.initialize();

    expect(Object.fromEntries(reads)).toEqual({
      "vault.save": 1,
      "vault.restore": 1,
      "vault.markValidated": 1,
      "vault.clear": 1,
      "login.run": 1,
      "login.cancelActive": 1,
    });
  });

  it("does not open a restore window after logout begins during vault read", async () => {
    const vault = new FakeVault(stored());
    let releaseRestore!: (value: StoredMahjongSoulSession | null) => void;
    vault.restore = async () => await new Promise((resolve) => {
      releaseRestore = resolve;
    });
    const login = new FakeLoginProvider();
    const { controller } = create({ vault, login });

    const initialization = controller.initialize();
    const logout = controller.logout();
    releaseRestore(stored());
    await Promise.all([initialization, logout]);

    expect(login.calls).toEqual([]);
    expect(controller.getStatus().status).toBe("logged_out");
  });

  it("rolls back transient states and hides clock or cancellation prose", async () => {
    const login = new FakeLoginProvider();
    login.next = { status: "authenticated", credential: credential() };
    const clockFailure = create({
      login,
      now: () => { throw new Error("hostile clock prose"); },
    }).controller;
    await expect(clockFailure.openLogin()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    expect(clockFailure.getStatus().status).toBe("logged_out");

    const cancelLogin = new FakeLoginProvider();
    cancelLogin.cancelActive = () => { throw new Error("hostile cancel prose"); };
    const cancelFailure = create({ login: cancelLogin }).controller;
    await expect(cancelFailure.logout()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    expect(cancelFailure.getStatus().status).toBe("logged_out");
  });
});
