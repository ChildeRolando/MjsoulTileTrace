import { appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import {
  decodeStoredRecordActions,
  MahjongSoulSourceError,
  type MahjongSoulCanonicalMapperResult,
  type MahjongSoulMapperDiagnostic,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import type { ReplayedDecision } from "@riichi-coach/reasoning";
import { createCdpRecordObserver } from "./cdp-record-observer.js";

// One-shot diagnostic: open the official paipu viewer in a Chromium window,
// ride its own Lobby WebSocket via CDP, and passively capture the inline
// `fetchGameRecord` response. The capture ALREADY performed the strict outer
// unwrap, so `result.recordBytes` is the INNER GameDetailRecords bytes — the
// unified recordBytes boundary shared with the HTTP fetcher. There is no
// second unwrap here; the bytes go straight into the canonical pipeline:
//
//   CDP frame -> createMahjongSoulRecordCapture (outer unwrap done)
//             -> recordBytes (INNER GameDetailRecords)
//             -> decodeStoredRecordActions (diagnostic counts only)
//             -> mapMahjongSoulRecord -> replayCanonicalStream
//             -> buildMahjongSoulReplayAudit -> serializeMahjongSoulReplayAudit
//
// A record the mapper cannot fully interpret (e.g. RecordAnGangAddGang /
// RecordLiuJu) is reported as record_not_replayable with the fixed mapping
// code; no partial stream is ever passed off as a complete replay. The result
// object and the debug log never contain the record bytes themselves.
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

export type CaptureRecordMappingStatus =
  | "ready"
  | "unsupported_semantics"
  | "mapping_failed"
  | "validation_failed";

export type CaptureRecordDiagnosticStatus =
  | "replay_audit_written"
  | "record_not_replayable"
  | "record_decode_failed"
  | "no_capture"
  | "error";

export type CaptureRecordResult = Readonly<{
  readonly status: CaptureRecordDiagnosticStatus;
  readonly storedActionCount: number | null;
  readonly mappingStatus: CaptureRecordMappingStatus | null;
  readonly mappingCode: string | null;
  readonly canonicalEventCount: number | null;
  readonly replayDecisionCount: number | null;
  readonly auditPath: string | null;
  readonly recordBytesPath: string | null;
  readonly errorCode: string | null;
}>;

export interface CaptureRecordPipeline {
  readonly mapRecord: (input: {
    readonly gameId: string;
    readonly selfActor: number;
    readonly recordId: string;
    readonly recordBytes: Uint8Array;
  }) => MahjongSoulCanonicalMapperResult;
  readonly replay: (stream: CanonicalEventStream) => readonly ReplayedDecision[];
  readonly serializeAudit: (input: {
    readonly stream: CanonicalEventStream;
    readonly decisions: readonly ReplayedDecision[];
  }) => string;
  readonly writeAudit: (serialized: string) => Promise<string>;
}

export function captureRecordDiagnosticExitCode(
  status: CaptureRecordDiagnosticStatus,
): number {
  switch (status) {
    case "replay_audit_written": return 0;
    case "record_not_replayable": return 1;
    case "record_decode_failed": return 2;
    case "no_capture": return 3;
    case "error": return 4;
  }
}

const defaultDebugPath = join(tmpdir(), "mahjong-soul-capture-debug.log");
function makeDebug(debugFile: string): (message: string) => void {
  return (message: string) => {
    try {
      appendFileSync(debugFile, `${new Date().toISOString()} ${message}\n`);
    } catch {
      // diagnostic-only; never surface a write failure
    }
  };
}

function result(fields: {
  readonly status: CaptureRecordDiagnosticStatus;
  readonly storedActionCount?: number | null;
  readonly mappingStatus?: CaptureRecordMappingStatus | null;
  readonly mappingCode?: string | null;
  readonly canonicalEventCount?: number | null;
  readonly replayDecisionCount?: number | null;
  readonly auditPath?: string | null;
  readonly recordBytesPath?: string | null;
  readonly errorCode?: string | null;
}): CaptureRecordResult {
  return Object.freeze({
    status: fields.status,
    storedActionCount: fields.storedActionCount ?? null,
    mappingStatus: fields.mappingStatus ?? null,
    mappingCode: fields.mappingCode ?? null,
    canonicalEventCount: fields.canonicalEventCount ?? null,
    replayDecisionCount: fields.replayDecisionCount ?? null,
    auditPath: fields.auditPath ?? null,
    recordBytesPath: fields.recordBytesPath ?? null,
    errorCode: fields.errorCode ?? null,
  });
}

function mappingStatusOf(
  code: MahjongSoulMapperDiagnostic,
): CaptureRecordMappingStatus {
  switch (code) {
    case "mahjong_soul_canonical_unsupported_semantics": return "unsupported_semantics";
    case "mahjong_soul_canonical_validation_failed": return "validation_failed";
    default: return "mapping_failed";
  }
}

// The post-capture chain. `recordBytes` is the INNER GameDetailRecords bytes;
// decodeStoredRecordActions runs only for the diagnostic counts (the mapper
// decodes internally — this must not become a second mapper API).
async function evaluateCapturedRecord(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly recordBytes: Uint8Array;
  readonly recordId: string;
  readonly selfActor: number;
  readonly pipeline: CaptureRecordPipeline;
  readonly recordBytesPath: string | null;
}): Promise<CaptureRecordResult> {
  let storedActionCount: number;
  try {
    storedActionCount = decodeStoredRecordActions(
      input.bundle,
      input.recordBytes,
    ).length;
  } catch (error) {
    const errorCode = error instanceof MahjongSoulSourceError
      ? error.code
      : "mahjong_soul_record_container_invalid";
    return result({
      status: "record_decode_failed",
      errorCode,
      recordBytesPath: input.recordBytesPath,
    });
  }

  let mapped: MahjongSoulCanonicalMapperResult;
  try {
    mapped = input.pipeline.mapRecord({
      gameId: `majsoul:${input.recordId}`,
      selfActor: input.selfActor,
      recordId: input.recordId,
      recordBytes: input.recordBytes,
    });
  } catch {
    return result({
      status: "error",
      storedActionCount,
      mappingStatus: "mapping_failed",
      mappingCode: "mahjong_soul_canonical_mapping_failed",
      errorCode: "capture_mapping_failed",
      recordBytesPath: input.recordBytesPath,
    });
  }

  if (mapped.status !== "ready") {
    return result({
      status: "record_not_replayable",
      storedActionCount,
      mappingStatus: mappingStatusOf(mapped.code),
      mappingCode: mapped.code,
      recordBytesPath: input.recordBytesPath,
    });
  }

  const canonicalEventCount = mapped.stream.events.length;
  let decisions: readonly ReplayedDecision[];
  try {
    decisions = input.pipeline.replay(mapped.stream);
  } catch {
    return result({
      status: "error",
      storedActionCount,
      mappingStatus: "ready",
      mappingCode: null,
      canonicalEventCount,
      errorCode: "capture_replay_failed",
      recordBytesPath: input.recordBytesPath,
    });
  }

  let serialized: string;
  try {
    serialized = input.pipeline.serializeAudit({
      stream: mapped.stream,
      decisions,
    });
  } catch {
    return result({
      status: "error",
      storedActionCount,
      mappingStatus: "ready",
      canonicalEventCount,
      replayDecisionCount: decisions.length,
      errorCode: "capture_audit_serialize_failed",
      recordBytesPath: input.recordBytesPath,
    });
  }

  let auditPath: string;
  try {
    auditPath = await input.pipeline.writeAudit(serialized);
  } catch {
    return result({
      status: "error",
      storedActionCount,
      mappingStatus: "ready",
      canonicalEventCount,
      replayDecisionCount: decisions.length,
      errorCode: "capture_audit_write_failed",
      recordBytesPath: input.recordBytesPath,
    });
  }

  return result({
    status: "replay_audit_written",
    storedActionCount,
    mappingStatus: "ready",
    canonicalEventCount,
    replayDecisionCount: decisions.length,
    auditPath,
    recordBytesPath: input.recordBytesPath,
  });
}

export async function runRecordCaptureDiagnostic(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly url: string;
  readonly recordId: string;
  readonly selfActor: number;
  readonly createWindow: () => CaptureRecordWindowPort;
  readonly timeoutMs: number;
  readonly pipeline: CaptureRecordPipeline;
  readonly recordBytesFile?: string;
  readonly debugFile?: string;
}): Promise<CaptureRecordResult> {
  const debug = makeDebug(input.debugFile ?? defaultDebugPath);
  debug("runner_start");
  if (
    typeof input.recordId !== "string"
    || input.recordId.length === 0
    || !Number.isInteger(input.selfActor)
    || input.selfActor < 0
    || input.selfActor > 3
  ) {
    // Identity never defaults: a missing seat or record id would silently
    // misattribute the whole canonical stream.
    return result({ status: "error", errorCode: "capture_identity_invalid" });
  }
  const recordBytesFile = input.recordBytesFile
    ?? join(tmpdir(), "mahjong-soul-captured-record.pb");

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
      resolveDone(result({ status: "no_capture" }));
    }, input.timeoutMs);
  });

  const settle = (value: Promise<CaptureRecordResult> | CaptureRecordResult): void => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    debug("settle_started");
    void Promise.resolve(value).then((resolved) => {
      debug(`settle_${resolved.status}`);
      resolveDone(resolved);
    });
  };

  const onMessage = (_event: unknown, method: string, params: unknown): void => {
    debug(`cdp_${method}`);
    try {
      const captured = observer.accept(method, params);
      if (captured !== null) {
        debug("captured_record");
        // The generator's input contract: INNER GameDetailRecords bytes. The
        // write is best-effort; the outcome is reported via recordBytesPath.
        let recordBytesPath: string | null = null;
        try {
          writeFileSync(recordBytesFile, captured.recordBytes);
          recordBytesPath = recordBytesFile;
          debug("record_bytes_written");
        } catch {
          debug("record_bytes_write_failed");
        }
        settle(evaluateCapturedRecord({
          bundle: input.bundle,
          recordBytes: captured.recordBytes,
          recordId: input.recordId,
          selfActor: input.selfActor,
          pipeline: input.pipeline,
          recordBytesPath,
        }));
      }
    } catch {
      debug("observe_error");
      settle(result({ status: "error", errorCode: "capture_observe_failed" }));
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
    return result({ status: "error", errorCode: "capture_window_failed" });
  } finally {
    debug("finally");
    if (timer !== undefined) clearTimeout(timer);
    try { window.webContents.debugger.off("message", onMessage); } catch { /* best effort */ }
    try { observer.close(); } catch { /* best effort */ }
    try { if (!window.isDestroyed()) window.close(); } catch { /* best effort */ }
  }
}
