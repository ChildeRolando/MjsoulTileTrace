import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import {
  loadMahjongSoulProtocolBundle,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import {
  createElectronMahjongSoulLoginProvider,
  type ElectronLoginWindowOptions,
  type ElectronLoginWindowPort,
} from "../src/mahjong-soul-login-window.js";

const bundleRoot = fileURLToPath(new URL(
  "../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));
const fixtureUrl = new URL(
  "../../mahjong-soul-source/tests/fixtures/official-bundle-frames.json",
  import.meta.url,
);
let bundle: MahjongSoulProtocolBundle;
let frames: Record<string, string>;

type Listener = (...args: unknown[]) => void;

class FakeDebugger {
  attached = false;
  detachCalls = 0;
  commands: string[] = [];
  readonly listeners = new Set<Listener>();

  attach(): void { this.attached = true; }
  detach(): void { this.detachCalls += 1; this.attached = false; }
  isAttached(): boolean { return this.attached; }
  async sendCommand(method: string): Promise<unknown> {
    this.commands.push(method);
    return {};
  }
  on(event: "message", listener: Listener): void {
    if (event === "message") this.listeners.add(listener);
  }
  off(event: "message", listener: Listener): void {
    if (event === "message") this.listeners.delete(listener);
  }
  emit(method: string, parameters: unknown): void {
    for (const listener of this.listeners) listener({}, method, parameters);
  }
}

class FakeSession {
  beforeRequest: ((details: { url: string }, callback: (result: { cancel: boolean }) => void) => void) | null = null;
  permissionRequest: ((webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void) | null = null;
  permissionCheck: ((webContents: unknown, permission: string) => boolean) | null = null;
  readonly downloadListeners = new Set<Listener>();
  clearStorageCalls = 0;
  clearCacheCalls = 0;
  readonly webRequest = {
    onBeforeRequest: (
      _filter: { urls: string[] },
      listener: FakeSession["beforeRequest"],
    ) => { this.beforeRequest = listener; },
  };

  setPermissionRequestHandler(handler: FakeSession["permissionRequest"]): void {
    this.permissionRequest = handler;
  }
  setPermissionCheckHandler(handler: FakeSession["permissionCheck"]): void {
    this.permissionCheck = handler;
  }
  on(event: "will-download", listener: Listener): void {
    if (event === "will-download") this.downloadListeners.add(listener);
  }
  off(event: "will-download", listener: Listener): void {
    if (event === "will-download") this.downloadListeners.delete(listener);
  }
  async clearStorageData(): Promise<void> { this.clearStorageCalls += 1; }
  async clearCache(): Promise<void> { this.clearCacheCalls += 1; }
  request(url: string): boolean {
    let cancelled = true;
    this.beforeRequest?.({ url }, (result) => { cancelled = result.cancel; });
    return !cancelled;
  }
}

class FakeWebContents {
  readonly debugger = new FakeDebugger();
  readonly session = new FakeSession();
  readonly listeners = new Map<string, Set<Listener>>();
  windowOpenHandler: (() => { action: string }) | null = null;

  setWindowOpenHandler(handler: () => { action: string }): void {
    this.windowOpenHandler = handler;
  }
  on(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }
  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

class FakeWindow implements ElectronLoginWindowPort {
  readonly webContents = new FakeWebContents();
  readonly listeners = new Map<string, Set<Listener>>();
  loadedUrls: string[] = [];
  destroyed = false;

  async loadURL(url: string): Promise<void> { this.loadedUrls.push(url); }
  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("closed");
  }
  isDestroyed(): boolean { return this.destroyed; }
  on(event: "closed", listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }
  off(event: "closed", listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

class FakeWindows {
  options: ElectronLoginWindowOptions[] = [];
  windows: FakeWindow[] = [];
  create = (options: ElectronLoginWindowOptions): ElectronLoginWindowPort => {
    const window = new FakeWindow();
    this.options.push(structuredClone(options));
    this.windows.push(window);
    return window;
  };
}

const created = (url = "wss://route-2.maj-soul.com/gateway") => ({
  requestId: "socket-1",
  url,
});
const frame = (name: string) => ({
  requestId: "socket-1",
  response: {
    opcode: 2,
    mask: false,
    payloadData: Buffer.from(frames[name]!, "hex").toString("base64"),
  },
});

const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };

beforeAll(async () => {
  bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  frames = (JSON.parse(await readFile(fixtureUrl, "utf8")) as {
    readonly frames: Record<string, string>;
  }).frames;
});

describe("isolated Mahjong Soul login window", () => {
  it.each([
    ["interactive", true, "cancelled"],
    ["restore", false, "unverified"],
  ] as const)("uses one hardened partition in %s mode", async (mode, show, status) => {
    const windows = new FakeWindows();
    const provider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: windows.create,
      restoreTimeoutMs: 60_000,
    });
    const pending = provider.run({ mode });
    await flush();

    expect(windows.options).toEqual([{
      show,
      webPreferences: {
        partition: "persist:riichi-coach-mahjong-soul-cn",
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        navigateOnDragDrop: false,
      },
    }]);
    expect(windows.windows[0]!.loadedUrls).toEqual(["https://game.maj-soul.com/1/"]);
    windows.windows[0]!.close();
    await expect(pending).resolves.toEqual({ status });
  });

  it("uses and clears a non-persistent partition in diagnostic mode", async () => {
    const windows = new FakeWindows();
    const provider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: windows.create,
    });
    const pending = provider.run({ mode: "diagnostic" });
    await flush();
    const window = windows.windows[0]!;
    expect(windows.options[0]!.show).toBe(true);
    expect(windows.options[0]!.webPreferences.partition.startsWith("persist:")).toBe(false);
    window.close();
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    expect(window.webContents.session.clearStorageCalls).toBe(1);
    expect(window.webContents.session.clearCacheCalls).toBe(1);
  });

  it("allows only manifest-owned resource origins and official blobs", async () => {
    const windows = new FakeWindows();
    const provider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: windows.create,
    });
    const pending = provider.run({ mode: "interactive" });
    await flush();
    const session = windows.windows[0]!.webContents.session;

    for (const url of [
      "https://game.maj-soul.com/1/",
      "https://route-3.maj-soul.com:8443/route",
      "wss://route-6.maj-soul.com/gateway",
      "blob:https://game.maj-soul.com/00000000-0000-0000-0000-000000000000",
    ]) expect(session.request(url), url).toBe(true);
    for (const url of [
      "data:text/html,attack",
      "file:///tmp/attack",
      "javascript:alert(1)",
      "https://evil.invalid/",
      "https://game.maj-soul.com.attacker.invalid/1/",
      "https://user:pass@game.maj-soul.com/1/",
      "wss://route-2.maj-soul.com.attacker.invalid/gateway",
      "blob:https://evil.invalid/id",
      "https://game.maj-soul.com/1/#changed",
    ]) expect(session.request(url), url).toBe(false);
    windows.windows[0]!.close();
    await pending;
  });

  it("denies navigation, windows, permissions and downloads outside the page", async () => {
    const windows = new FakeWindows();
    const provider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: windows.create,
    });
    const pending = provider.run({ mode: "interactive" });
    await flush();
    const window = windows.windows[0]!;
    const prevented: string[] = [];
    const event = { preventDefault: () => prevented.push("blocked") };

    window.webContents.emit("will-navigate", event, "https://evil.invalid/");
    window.webContents.emit("will-frame-navigate", event, {
      url: "https://evil.invalid/frame",
    });
    expect(prevented).toEqual(["blocked", "blocked"]);
    expect(window.webContents.windowOpenHandler?.()).toEqual({ action: "deny" });
    let permissionAllowed = true;
    window.webContents.session.permissionRequest?.({}, "camera", (allowed) => {
      permissionAllowed = allowed;
    });
    expect(permissionAllowed).toBe(false);
    expect(window.webContents.session.permissionCheck?.({}, "geolocation")).toBe(false);
    let cancelled = false;
    for (const listener of window.webContents.session.downloadListeners) {
      listener({}, { cancel: () => { cancelled = true; } });
    }
    expect(cancelled).toBe(true);
    window.close();
    await pending;
  });

  it("resolves one correlated success and closes the observer/window once", async () => {
    const windows = new FakeWindows();
    const provider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: windows.create,
    });
    const pending = provider.run({ mode: "interactive" });
    await flush();
    const window = windows.windows[0]!;
    window.webContents.debugger.emit("Network.webSocketCreated", created());
    window.webContents.debugger.emit("Network.webSocketFrameSent", frame("loginRequest"));
    window.webContents.debugger.emit("Network.webSocketFrameReceived", frame("loginResponse"));

    const result = await pending;
    expect(result.status).toBe("authenticated");
    expect(window.destroyed).toBe(true);
    expect(window.webContents.debugger.detachCalls).toBe(1);
  });

  it("distinguishes explicit rejection, load failure and restore timeout", async () => {
    const rejectedWindows = new FakeWindows();
    const rejectedProvider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: rejectedWindows.create,
    });
    const rejected = rejectedProvider.run({ mode: "interactive" });
    await flush();
    const rejectedWindow = rejectedWindows.windows[0]!;
    rejectedWindow.webContents.debugger.emit("Network.webSocketCreated", created());
    rejectedWindow.webContents.debugger.emit("Network.webSocketFrameSent", frame("hostileLoginRequest"));
    rejectedWindow.webContents.debugger.emit("Network.webSocketFrameReceived", frame("hostileLoginResponse"));
    await expect(rejected).resolves.toEqual({ status: "rejected" });

    const failedWindows = new FakeWindows();
    failedWindows.create = (options) => {
      const window = new FakeWindow();
      window.loadURL = async () => { throw new Error("hostile network prose"); };
      failedWindows.options.push(structuredClone(options));
      failedWindows.windows.push(window);
      return window;
    };
    const failedProvider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: failedWindows.create,
    });
    await expect(failedProvider.run({ mode: "interactive" })).resolves.toEqual({
      status: "unverified",
    });

    let timeout: (() => void) | undefined;
    const timeoutWindows = new FakeWindows();
    const timeoutProvider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: timeoutWindows.create,
      setTimer: (callback) => { timeout = callback; return 1; },
      clearTimer: () => {},
      restoreTimeoutMs: 100,
    });
    const timed = timeoutProvider.run({ mode: "restore" });
    await flush();
    timeout?.();
    await expect(timed).resolves.toEqual({ status: "unverified" });
  });

  it("cancels cleanly when the debugger startup is still pending", async () => {
    const windows = new FakeWindows();
    let releaseDebugger: (() => void) | undefined;
    windows.create = (options) => {
      const window = new FakeWindow();
      window.webContents.debugger.sendCommand = async () => await new Promise<void>(
        (resolve) => { releaseDebugger = resolve; },
      );
      windows.options.push(structuredClone(options));
      windows.windows.push(window);
      return window;
    };
    const provider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: windows.create,
    });

    const pending = provider.run({ mode: "interactive" });
    await flush();
    // The page is loaded before the debugger attaches, so it stays navigated
    // even though the debugger startup is still pending at cancellation.
    expect(windows.windows[0]!.loadedUrls).toEqual(["https://game.maj-soul.com/1/"]);
    windows.windows[0]!.close();
    releaseDebugger?.();
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    await flush();
  });

  it("allows logout to cancel the active window without exposing a handle", async () => {
    const windows = new FakeWindows();
    const provider = createElectronMahjongSoulLoginProvider({
      bundle,
      createWindow: windows.create,
    });
    const pending = provider.run({ mode: "interactive" });
    await flush();

    provider.cancelActive();

    await expect(pending).resolves.toEqual({ status: "cancelled" });
    expect(windows.windows[0]!.destroyed).toBe(true);
    expect(windows.windows[0]!.webContents.debugger.detachCalls).toBe(1);
  });
});
