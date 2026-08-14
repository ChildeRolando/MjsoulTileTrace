import type { MahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import { createCdpRecordObserver } from "./cdp-record-observer.js";

// The PRODUCTION capture primitive shared by every official-client record
// route (the paipu URL import and the one-shot capture diagnostic). It owns
// exactly one thing: ride a Chromium window rendering the official Mahjong
// Soul client, observe its own Lobby WebSocket via CDP, and surface the
// INNER GameDetailRecords bytes captured from the client's own
// `fetchGameRecord` exchange.
//
// Boundary contract (do not break):
//   - createMahjongSoulRecordCapture already performed the strict OUTER
//     Wrapper unwrap, so a "captured" result carries INNER GameDetailRecords
//     bytes — the unified recordBytes/sha256 boundary. NEVER unwrap again.
//   - Readiness ordering (the invariant behind accf970, reshaped by a live
//     finding on 2026-08-15): the debugger is attached and the message
//     listener registered BEFORE navigation, but Network.enable is only
//     dispatched once the main frame has COMMITTED — Electron 43's debugger
//     sendCommand hangs forever on an uncommitted about:blank target. The
//     commit fires before any page JavaScript runs, so the official client
//     cannot open its Lobby WebSocket before the observer is fully ready:
//
//       debugger.attach -> message listener -> loadURL -> (main-frame commit)
//         -> Network.enable -> frames -> capture
//
//   - timeoutMs bounds the WHOLE capture, navigation included: a page that
//     never commits (or a loadURL that never settles) resolves no_capture at
//     the deadline instead of hanging forever.
//
// This module deliberately knows nothing about TEMP files, debug logs, the
// canonical mapper, replay, audits, selfActor, or any catalog/vault state —
// callers own all of that. Failures surface as OfficialClientCaptureError
// with a fixed code; no raw bytes or credentials ever appear in errors.

export interface CaptureRecordWindowPort {
  readonly webContents: {
    readonly debugger: {
      attach(version: string): void | Promise<void>;
      detach(): void;
      isAttached(): boolean;
      sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>;
      on(event: "message", listener: (event: unknown, method: string, params: unknown) => void): void;
      off(event: "message", listener: (event: unknown, method: string, params: unknown) => void): void;
    };
    /**
     * Invoked on the FIRST main-frame commit after subscription (Electron's
     * did-navigate). Required because Network.enable must not be sent to an
     * uncommitted about:blank target (see CdpRecordObserver.enableNetwork).
     */
    onDidNavigateCommit(listener: () => void): void;
  };
  loadURL(url: string): Promise<void>;
  close(): void;
  isDestroyed(): boolean;
}

export type OfficialClientCaptureResult =
  | {
    readonly status: "captured";
    /** INNER GameDetailRecords bytes — already unwrapped from the outer Wrapper. */
    readonly recordBytes: Uint8Array;
  }
  | {
    readonly status: "no_capture";
  };

export type OfficialClientCaptureErrorCode =
  | "official_client_capture_observe_failed"
  | "official_client_capture_window_failed";

export class OfficialClientCaptureError extends Error {
  readonly code: OfficialClientCaptureErrorCode;

  constructor(code: OfficialClientCaptureErrorCode) {
    super(code);
    this.code = code;
  }
}

export async function captureRecordViaOfficialClient(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly url: string;
  readonly createWindow: () => CaptureRecordWindowPort;
  readonly timeoutMs: number;
}): Promise<OfficialClientCaptureResult> {
  const window = input.createWindow();
  const observer = createCdpRecordObserver({
    bundle: input.bundle,
    debuggerPort: window.webContents.debugger,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let resolveDone!: (value: OfficialClientCaptureResult) => void;
  let rejectDone!: (error: OfficialClientCaptureError) => void;
  const done = new Promise<OfficialClientCaptureResult>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolveDone({ status: "no_capture" });
    }, input.timeoutMs);
  });

  const settle = (value: OfficialClientCaptureResult): void => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    resolveDone(value);
  };

  const fail = (code: OfficialClientCaptureErrorCode): void => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    rejectDone(new OfficialClientCaptureError(code));
  };

  const onMessage = (_event: unknown, method: string, params: unknown): void => {
    try {
      const captured = observer.accept(method, params);
      if (captured !== null) {
        settle({
          status: "captured",
          recordBytes: Uint8Array.from(captured.recordBytes),
        });
      }
    } catch {
      fail("official_client_capture_observe_failed");
    }
  };

  try {
    // Attach and register the listener BEFORE navigation so no frame can be
    // missed — attach itself is safe on the uncommitted about:blank target.
    await observer.attach();
    window.webContents.debugger.on("message", onMessage);

    // The main-frame commit is the earliest moment Network.enable can be
    // dispatched without hanging Electron 43's debugger sendCommand, and it
    // strictly precedes any page JavaScript (which is what opens the Lobby
    // WebSocket).
    const committed = new Promise<void>((resolveCommit) => {
      window.webContents.onDidNavigateCommit(() => { resolveCommit(); });
    });

    // Navigation failures fail fast, but a hanging page load must NOT block
    // the capture deadline — timeoutMs bounds the whole operation.
    void Promise.resolve(window.loadURL(input.url)).then(
      () => undefined,
      () => { fail("official_client_capture_window_failed"); },
    );

    const ready = (async () => {
      await committed;
      await observer.enableNetwork();
    })();

    // done settles by capture or by the deadline; `ready` only gates when we
    // START waiting for done after full observer readiness. Racing done
    // directly keeps the deadline authoritative even if enable were to hang.
    return await Promise.race([
      ready.then(() => done),
      done,
    ]);
  } catch (error) {
    if (error instanceof OfficialClientCaptureError) throw error;
    throw new OfficialClientCaptureError("official_client_capture_window_failed");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try { window.webContents.debugger.off("message", onMessage); } catch { /* best effort */ }
    try { observer.close(); } catch { /* best effort */ }
    try { if (!window.isDestroyed()) window.close(); } catch { /* best effort */ }
  }
}
