import {
  MahjongSoulSourceError,
  type CapturedMahjongSoulRestoreCandidate,
  type LoginCaptureResult,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import {
  createCdpLoginObserver,
  type CdpDebuggerPort,
  type CdpLoginObserver,
} from "./cdp-login-observer.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;
const LOGIN_URL = "https://game.maj-soul.com/1/";
const PARTITION = "persist:riichi-coach-mahjong-soul-cn";
const DIAGNOSTIC_PARTITION = "riichi-coach-mahjong-soul-diagnostic";
const DEFAULT_RESTORE_TIMEOUT_MS = 30_000;

type Listener = (...args: unknown[]) => void;
type PermissionCallback = (allowed: boolean) => void;
type RequestCallback = (result: { readonly cancel: boolean }) => void;

export interface ElectronLoginWindowOptions {
  readonly show: boolean;
  readonly webPreferences: Readonly<{
    partition: string;
    contextIsolation: true;
    sandbox: true;
    nodeIntegration: false;
    webviewTag: false;
    navigateOnDragDrop: false;
  }>;
}

interface ElectronDebuggerPort extends CdpDebuggerPort {
  on(event: "message", listener: Listener): void;
  off(event: "message", listener: Listener): void;
}

interface ElectronSessionPort {
  readonly webRequest: {
    onBeforeRequest(
      filter: { readonly urls: readonly string[] },
      listener: ((details: { readonly url: string }, callback: RequestCallback) => void) | null,
    ): void;
  };
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: PermissionCallback,
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (webContents: unknown, permission: string) => boolean,
  ): void;
  on(event: "will-download", listener: Listener): void;
  off(event: "will-download", listener: Listener): void;
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

interface ElectronLoginWebContentsPort {
  readonly debugger: ElectronDebuggerPort;
  readonly session: ElectronSessionPort;
  setWindowOpenHandler(handler: () => { readonly action: "deny" }): void;
  on(event: string, listener: Listener): void;
  off(event: string, listener: Listener): void;
}

export interface ElectronLoginWindowPort {
  readonly webContents: ElectronLoginWebContentsPort;
  loadURL(url: string): Promise<void>;
  close(): void;
  isDestroyed(): boolean;
  on(event: "closed", listener: Listener): void;
  off(event: "closed", listener: Listener): void;
}

export type ElectronLoginProviderResult = Readonly<
  | { status: "authenticated"; credential: CapturedMahjongSoulRestoreCandidate }
  | { status: "rejected" }
  | { status: "unverified" }
  | { status: "cancelled" }
>;

export interface ElectronMahjongSoulLoginProvider {
  run(input: {
    readonly mode: "interactive" | "restore" | "diagnostic";
    readonly expected?: {
      readonly loginMethod: "login" | "oauth2Login";
      readonly accountId: number;
    };
  }): Promise<ElectronLoginProviderResult>;
  cancelActive(): void;
}

interface TimerPort {
  readonly set: (callback: () => void, milliseconds: number) => unknown;
  readonly clear: (handle: unknown) => void;
}

function unsupported(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(PROTOCOL_ERROR);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseRunInput(value: unknown): {
  readonly mode: "interactive" | "restore" | "diagnostic";
  readonly expected?: {
    readonly loginMethod: "login" | "oauth2Login";
    readonly accountId: number;
  };
} {
  if (!isRecord(value)) throw unsupported();
  const keys = Object.keys(value);
  const mode = value.mode;
  if (
    (mode !== "interactive" && mode !== "restore" && mode !== "diagnostic")
    || !keys.includes("mode")
    || keys.some((key) => key !== "mode" && key !== "expected")
  ) {
    throw unsupported();
  }
  const expected = value.expected;
  if (expected === undefined) return Object.freeze({ mode });
  if (!isRecord(expected)) throw unsupported();
  const expectedKeys = Object.keys(expected);
  const loginMethod = expected.loginMethod;
  const accountId = expected.accountId;
  if (
    expectedKeys.length !== 2
    || !expectedKeys.includes("loginMethod")
    || !expectedKeys.includes("accountId")
    || (loginMethod !== "login" && loginMethod !== "oauth2Login")
    || typeof accountId !== "number"
    || !Number.isInteger(accountId)
    || accountId < 1
    || accountId > 0xffff_ffff
  ) {
    throw unsupported();
  }
  return Object.freeze({
    mode,
    expected: Object.freeze({ loginMethod, accountId }),
  });
}

function safeUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 8192) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hasSafeIdentity(url: URL): boolean {
  return url.username === "" && url.password === "" && url.hash === "";
}

function createUrlPolicy(bundle: MahjongSoulProtocolBundle): {
  readonly allowsNavigation: (value: unknown) => boolean;
  readonly allowsRequest: (value: unknown) => boolean;
} {
  const loginOrigins = new Set<string>(bundle.endpoints.loginPageOrigins);
  const httpsOrigins = new Set<string>([
    ...bundle.endpoints.loginPageOrigins,
    ...bundle.endpoints.staticAssetOrigins,
    ...bundle.endpoints.gatewayDiscoveryOrigins,
  ]);
  const websocketOrigins = new Set<string>(bundle.endpoints.lobbyWebSocketOrigins);
  const officialLoginOrigin = bundle.endpoints.loginPageOrigins[0];

  return Object.freeze({
    allowsNavigation(value: unknown): boolean {
      const url = safeUrl(value);
      return url !== null
        && url.protocol === "https:"
        && hasSafeIdentity(url)
        && loginOrigins.has(url.origin);
    },
    allowsRequest(value: unknown): boolean {
      const url = safeUrl(value);
      if (url === null || !hasSafeIdentity(url)) return false;
      if (url.protocol === "https:") return httpsOrigins.has(url.origin);
      if (url.protocol === "wss:") return websocketOrigins.has(url.origin);
      return url.protocol === "blob:"
        && url.origin === officialLoginOrigin
        && typeof value === "string"
        && value.startsWith(`blob:${officialLoginOrigin}/`);
    },
  });
}

function prevent(event: unknown): void {
  if (
    event !== null
    && typeof event === "object"
    && typeof (event as { preventDefault?: unknown }).preventDefault === "function"
  ) {
    (event as { preventDefault(): void }).preventDefault();
  }
}

function fixedStatus(
  status: "rejected" | "unverified" | "cancelled",
): ElectronLoginProviderResult {
  return Object.freeze({ status });
}

class StatefulElectronLoginProvider implements ElectronMahjongSoulLoginProvider {
  readonly #bundle: MahjongSoulProtocolBundle;
  readonly #createWindow: (options: ElectronLoginWindowOptions) => ElectronLoginWindowPort;
  readonly #timer: TimerPort;
  readonly #restoreTimeoutMs: number;
  #active = false;
  #cancelActive: (() => void) | null = null;

  constructor(
    bundle: MahjongSoulProtocolBundle,
    createWindow: (options: ElectronLoginWindowOptions) => ElectronLoginWindowPort,
    timer: TimerPort,
    restoreTimeoutMs: number,
  ) {
    this.#bundle = bundle;
    this.#createWindow = createWindow;
    this.#timer = timer;
    this.#restoreTimeoutMs = restoreTimeoutMs;
  }

  async run(rawInput: {
    readonly mode: "interactive" | "restore" | "diagnostic";
    readonly expected?: {
      readonly loginMethod: "login" | "oauth2Login";
      readonly accountId: number;
    };
  }): Promise<ElectronLoginProviderResult> {
    const input = parseRunInput(rawInput);
    if (this.#active) throw unsupported();
    this.#active = true;

    return await new Promise<ElectronLoginProviderResult>((resolve) => {
      let window: ElectronLoginWindowPort | null = null;
      let observer: CdpLoginObserver | null = null;
      let timerHandle: unknown;
      let settled = false;
      let session: ElectronSessionPort | null = null;

      const onDebuggerMessage: Listener = (_event, method, parameters) => {
        try {
          if (typeof method !== "string" || observer === null) throw unsupported();
          const result = observer.accept(method, parameters);
          if (result !== null) settle(result, true);
        } catch {
          settle(fixedStatus("unverified"), true);
        }
      };
      const onClosed: Listener = () => {
        settle(fixedStatus(input.mode === "restore" ? "unverified" : "cancelled"), false);
      };
      const onLoadFailure: Listener = () => {
        settle(fixedStatus("unverified"), true);
      };
      const onWillNavigate: Listener = (event, url) => {
        if (!urlPolicy.allowsNavigation(url)) prevent(event);
      };
      const onWillFrameNavigate: Listener = (event, details) => {
        const url = isRecord(details) ? details.url : undefined;
        if (!urlPolicy.allowsNavigation(url)) prevent(event);
      };
      const onWillDownload: Listener = (_event, item) => {
        if (
          item !== null
          && typeof item === "object"
          && typeof (item as { cancel?: unknown }).cancel === "function"
        ) {
          (item as { cancel(): void }).cancel();
        }
      };

      const cleanup = async (): Promise<void> => {
        if (timerHandle !== undefined) this.#timer.clear(timerHandle);
        if (window !== null) {
          window.off("closed", onClosed);
          window.webContents.off("did-fail-load", onLoadFailure);
          window.webContents.off("will-navigate", onWillNavigate);
          window.webContents.off("will-frame-navigate", onWillFrameNavigate);
          window.webContents.debugger.off("message", onDebuggerMessage);
        }
        session?.off("will-download", onWillDownload);
        observer?.close();
        if (input.mode === "diagnostic" && session !== null) {
          try {
            await session.clearStorageData();
            await session.clearCache();
          } catch {
            // Diagnostic cleanup failure changes the result to unverified below.
            throw unsupported();
          }
        }
      };
      const settle = (
        result: LoginCaptureResult | ElectronLoginProviderResult,
        closeWindow: boolean,
      ): void => {
        if (settled) return;
        settled = true;
        void (async () => {
          let safeResult = result;
          try {
            await cleanup();
          } catch {
            safeResult = fixedStatus("unverified");
          }
          this.#active = false;
          if (this.#cancelActive === cancellation) this.#cancelActive = null;
          if (closeWindow && window !== null && !window.isDestroyed()) window.close();
          resolve(safeResult);
        })();
      };
      const cancellation = (): void => {
        settle(fixedStatus(input.mode === "restore" ? "unverified" : "cancelled"), true);
      };
      this.#cancelActive = cancellation;

      const urlPolicy = createUrlPolicy(this.#bundle);
      void (async () => {
        try {
          const options: ElectronLoginWindowOptions = Object.freeze({
            show: input.mode !== "restore",
            webPreferences: Object.freeze({
              partition: input.mode === "diagnostic" ? DIAGNOSTIC_PARTITION : PARTITION,
              contextIsolation: true,
              sandbox: true,
              nodeIntegration: false,
              webviewTag: false,
              navigateOnDragDrop: false,
            }),
          });
          window = this.#createWindow(options);
          session = window.webContents.session;
          observer = createCdpLoginObserver({
            bundle: this.#bundle,
            debuggerPort: window.webContents.debugger,
            ...(input.expected === undefined ? {} : { expected: input.expected }),
          });

          window.on("closed", onClosed);
          window.webContents.on("did-fail-load", onLoadFailure);
          window.webContents.on("will-navigate", onWillNavigate);
          window.webContents.on("will-frame-navigate", onWillFrameNavigate);
          window.webContents.debugger.on("message", onDebuggerMessage);
          window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
          session.webRequest.onBeforeRequest(
            { urls: ["<all_urls>"] },
            (details, callback) => callback({
              cancel: !urlPolicy.allowsRequest(details.url),
            }),
          );
          session.setPermissionRequestHandler((_contents, _permission, callback) => {
            callback(false);
          });
          session.setPermissionCheckHandler(() => false);
          session.on("will-download", onWillDownload);

          await window.loadURL(LOGIN_URL);
          if (settled) return;
          await observer.start();
          if (settled) return;
          if (input.mode === "restore" && !settled) {
            timerHandle = this.#timer.set(() => {
              settle(fixedStatus("unverified"), true);
            }, this.#restoreTimeoutMs);
          }
        } catch {
          settle(fixedStatus("unverified"), true);
        }
      })();
    });
  }

  cancelActive(): void {
    this.#cancelActive?.();
  }
}

export function createElectronMahjongSoulLoginProvider(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly createWindow: (options: ElectronLoginWindowOptions) => ElectronLoginWindowPort;
  readonly setTimer?: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly restoreTimeoutMs?: number;
}): ElectronMahjongSoulLoginProvider {
  try {
    if (!isRecord(input)) throw unsupported();
    const keys = Object.keys(input);
    if (
      !keys.includes("bundle")
      || !keys.includes("createWindow")
      || keys.some((key) => ![
        "bundle",
        "createWindow",
        "setTimer",
        "clearTimer",
        "restoreTimeoutMs",
      ].includes(key))
      || typeof input.createWindow !== "function"
    ) {
      throw unsupported();
    }
    const setTimer = input.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    const clearTimer = input.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const timeout = input.restoreTimeoutMs ?? DEFAULT_RESTORE_TIMEOUT_MS;
    if (
      typeof setTimer !== "function"
      || typeof clearTimer !== "function"
      || typeof timeout !== "number"
      || !Number.isInteger(timeout)
      || timeout < 1
      || timeout > 300_000
    ) {
      throw unsupported();
    }
    return new StatefulElectronLoginProvider(
      input.bundle,
      input.createWindow,
      Object.freeze({ set: setTimer, clear: clearTimer }),
      timeout,
    );
  } catch {
    throw unsupported();
  }
}
