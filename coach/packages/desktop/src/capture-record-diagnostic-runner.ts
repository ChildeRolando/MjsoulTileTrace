import { appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseProtobuf } from "protobufjs";
import type { MahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import { createCdpRecordObserver } from "./cdp-record-observer.js";

// One-shot prototype: open the official paipu viewer in a Chromium window, ride
// its own Lobby WebSocket via CDP, and passively capture the inline
// `fetchGameRecord` response. Then decode `GameDetailRecords` to prove the
// browser-session route works. Never logs the record bytes.
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

export interface LegacyRecordProbe {
  readonly byteLength: number;
  readonly uuid: string | null;
  readonly startTime: number | null;
  readonly accountsCount: number | null;
  readonly standardRule: number | null;
  readonly hasResult: boolean;
  readonly configKeys: readonly string[];
}

export type CaptureRecordResult = Readonly<{
  readonly status: "record_captured" | "no_capture" | "error";
  readonly actionCount: number | null;
  readonly recordCount: number | null;
  readonly container: "actions" | "records" | null;
  readonly error: string | null;
  readonly legacyRecord: LegacyRecordProbe | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const debugPath = join(tmpdir(), "mahjong-soul-capture-debug.log");
function debug(message: string): void {
  try {
    appendFileSync(debugPath, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // diagnostic-only; never surface a write failure
  }
}

function probeLegacyRecord(root: ReturnType<typeof parseProtobuf>["root"], blob: Uint8Array): LegacyRecordProbe {
  try {
    const type = root.lookupType("lq.RecordGame");
    const decoded = type.toObject(type.decode(blob), {
      arrays: true,
      bytes: Uint8Array,
      defaults: true,
    }) as Record<string, unknown>;
    return Object.freeze({
      byteLength: blob.length,
      uuid: typeof decoded.uuid === "string" ? decoded.uuid : null,
      startTime: typeof decoded.start_time === "number" ? decoded.start_time : null,
      accountsCount: Array.isArray(decoded.accounts) ? decoded.accounts.length : null,
      standardRule: typeof decoded.standard_rule === "number" ? decoded.standard_rule : null,
      hasResult: decoded.result !== undefined && decoded.result !== null,
      configKeys: isRecord(decoded.config) ? Object.freeze(Object.keys(decoded.config)) : [],
    });
  } catch {
    return Object.freeze({
      byteLength: blob.length,
      uuid: null,
      startTime: null,
      accountsCount: null,
      standardRule: null,
      hasResult: false,
      configKeys: [],
    });
  }
}

function decodeResult(
  bundle: MahjongSoulProtocolBundle,
  bytes: Uint8Array,
): CaptureRecordResult {
  try {
    const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
    const type = root.lookupType("lq.GameDetailRecords");
    const decoded = type.toObject(type.decode(bytes), {
      arrays: true,
      bytes: Uint8Array,
      defaults: true,
    }) as Record<string, unknown>;
    const actions = Array.isArray(decoded.actions) ? decoded.actions : [];
    const records = Array.isArray(decoded.records) ? decoded.records : [];
    const actionCount = actions.filter((entry) =>
      isRecord(entry)
      && entry.result instanceof Uint8Array
      && entry.result.length > 0
    ).length;
    const recordCount = records.filter((entry) =>
      entry instanceof Uint8Array && entry.length > 0
    ).length;
    if (actionCount === 0 && recordCount === 0) {
      return Object.freeze({
        status: "record_captured", actionCount, recordCount, container: null,
        error: "empty_container", legacyRecord: null,
      });
    }
    const legacyBlob = records.find((entry) => entry instanceof Uint8Array && entry.length > 0);
    return Object.freeze({
      status: "record_captured",
      actionCount,
      recordCount,
      container: actionCount > 0 ? "actions" : "records",
      error: null,
      legacyRecord: legacyBlob instanceof Uint8Array
        ? probeLegacyRecord(root, legacyBlob)
        : null,
    });
  } catch (error) {
    return Object.freeze({
      status: "error",
      actionCount: null,
      recordCount: null,
      container: null,
      error: error instanceof Error ? error.message : String(error),
      legacyRecord: null,
    });
  }
}

export async function runRecordCaptureDiagnostic(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly url: string;
  readonly createWindow: () => CaptureRecordWindowPort;
  readonly timeoutMs: number;
}): Promise<CaptureRecordResult> {
  debug("runner_start");
  const window = input.createWindow();
  debug("window_created");
  const observer = createCdpRecordObserver({
    bundle: input.bundle,
    debuggerPort: window.webContents.debugger,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let resolveDone!: (value: CaptureRecordResult) => void;
  const done = new Promise<CaptureRecordResult>((resolve) => {
    resolveDone = resolve;
    timer = setTimeout(() => {
      debug("timer_fired");
      if (settled) return;
      settled = true;
      resolve(Object.freeze({
        status: "no_capture", actionCount: null, recordCount: null, container: null,
        error: null, legacyRecord: null,
      }));
    }, input.timeoutMs);
  });

  const settle = (value: CaptureRecordResult): void => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    debug(`settle_${value.status}`);
    resolveDone(value);
  };

  const onMessage = (_event: unknown, method: string, params: unknown): void => {
    debug(`cdp_${method}`);
    try {
      const result = observer.accept(method, params);
      if (result !== null) {
        debug("captured_record");
        try {
          writeFileSync(join(tmpdir(), "mahjong-soul-captured-record.pb"), result.recordBytes);
          debug("record_bytes_written");
        } catch {
          debug("record_bytes_write_failed");
        }
        settle(decodeResult(input.bundle, result.recordBytes));
      }
    } catch {
      debug("observe_error");
      settle(Object.freeze({
        status: "error", actionCount: null, recordCount: null, container: null,
        error: "observe_failed", legacyRecord: null,
      }));
    }
  };

  try {
    debug("loadURL_start");
    await window.loadURL(input.url);
    debug("loadURL_done");
    await observer.start();
    debug("observer_started");
    window.webContents.debugger.on("message", onMessage);
    debug("listener_registered");
    return await done;
  } catch (error) {
    debug(`error_${error instanceof Error ? error.message : String(error)}`);
    return Object.freeze({
      status: "error", actionCount: null, recordCount: null, container: null,
      error: error instanceof Error ? error.message : String(error), legacyRecord: null,
    });
  } finally {
    debug("finally");
    if (timer !== undefined) clearTimeout(timer);
    try { window.webContents.debugger.off("message", onMessage); } catch { /* best effort */ }
    try { observer.close(); } catch { /* best effort */ }
    try { if (!window.isDestroyed()) window.close(); } catch { /* best effort */ }
  }
}
