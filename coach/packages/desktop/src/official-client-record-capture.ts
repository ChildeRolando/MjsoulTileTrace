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
//   - Ordering proven by accf970: the observer must be fully ready BEFORE
//     navigation, because the official client opens its Lobby WebSocket while
//     the paipu page loads.
//       debugger.attach -> Network.enable -> message listener -> loadURL -> wait
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
    // The observer must be fully ready BEFORE navigation. The official client
    // opens its Lobby WebSocket while the paipu page loads, so attaching or
    // listening after loadURL would miss those frames:
    //   attach -> Network.enable -> message listener -> loadURL -> wait
    await observer.start();
    window.webContents.debugger.on("message", onMessage);
    await window.loadURL(input.url);
    return await done;
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
