import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "protobufjs";
import { describe, expect, it } from "vitest";
import {
  decodeStoredRecordActions,
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
  type MahjongSoulCanonicalMapperResult,
} from "@riichi-coach/mahjong-soul-source";
import {
  buildMahjongSoulReplayAudit,
  replayCanonicalStream,
  serializeMahjongSoulReplayAudit,
} from "@riichi-coach/reasoning";
import {
  captureRecordDiagnosticExitCode,
  runRecordCaptureDiagnostic,
} from "../src/capture-record-diagnostic-runner.js";
import {
  bundleRoot,
  encodeSyntheticRecord,
  FakeWindow,
  loadFixtureWire,
  scriptedCapture,
} from "./helpers/cdp-capture-harness.js";

// Drives the capture diagnostic end to end with the REAL bundle, the REAL
// canonical pipeline and scripted CDP frames carrying the sanitized fixtures.
// This pins the P2 boundary: the CDP observer's result.recordBytes is already
// the INNER GameDetailRecords bytes and goes straight to the mapper — a double
// unwrap anywhere in this chain would fail closed instead of going green.

const url = "https://game.maj-soul.com/1/?paipu=000000-00000000-0000-0000-0000-000000000001_a123456";

const inertPipeline = {
  mapRecord: (): MahjongSoulCanonicalMapperResult =>
    ({ status: "invalid", code: "mahjong_soul_canonical_mapping_failed" }),
  replay: () => [],
  serializeAudit: () => "",
  writeAudit: async () => "unused",
} as const;

describe("capture-record diagnostic runner", () => {
  it("runs the supported real round through capture -> map -> replay -> audit", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    const workDir = await mkdtemp(join(tmpdir(), "majsoul-capture-test-"));
    const recordBytesFile = join(workDir, "captured-record.pb");
    const auditPath = join(workDir, "audit.json");
    const { window, createWindow } = scriptedCapture(bundle, { data: fixture.wire });

    const result = await runRecordCaptureDiagnostic({
      bundle,
      url,
      recordId: fixture.recordId,
      selfActor: 0,
      createWindow,
      timeoutMs: 5_000,
      recordBytesFile,
      pipeline: {
        mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
        replay: replayCanonicalStream,
        serializeAudit: ({ stream, decisions }) => serializeMahjongSoulReplayAudit(
          buildMahjongSoulReplayAudit({
            stream,
            decisions,
            recordId: fixture.recordId,
            protocolVersion: "fixture",
            appVersion: "fixture",
            now: () => 1_700_000_000_000,
          }),
        ),
        writeAudit: async (serialized) => {
          await writeFile(auditPath, serialized);
          return auditPath;
        },
      },
    });

    // Full chain: the inner bytes reached the mapper directly (no second
    // unwrap) and produced a real replay + audit file.
    expect(result.status).toBe("replay_audit_written");
    expect(result.mappingStatus).toBe("ready");
    expect(result.storedActionCount).toBe(
      decodeStoredRecordActions(bundle, unwrapGameDetailRecords(bundle, fixture.wire)).length,
    );
    expect(result.canonicalEventCount).toBeGreaterThan(0);
    expect(result.replayDecisionCount).toBeGreaterThan(0);
    expect(result.auditPath).toBe(auditPath);
    expect(result.errorCode).toBeNull();

    // The ordering invariant lives in the shared production primitive; it is
    // directly pinned in official-client-record-capture.test.ts, and here the
    // diagnostic route inherits it (frames during loadURL were heard).
    const order = window.webContents.debugger.order;
    expect(order.indexOf("event:Network.webSocketCreated"))
      .toBeGreaterThan(order.indexOf("loadURL"));

    // The TEMP file holds the INNER GameDetailRecords bytes — the exact
    // generator input contract — not another Wrapper layer.
    const written = await readFile(recordBytesFile);
    expect(Uint8Array.from(written)).toEqual(
      unwrapGameDetailRecords(bundle, fixture.wire),
    );

    const audit = JSON.parse(await readFile(auditPath, "utf8")) as { recordId: string };
    expect(audit.recordId).toBe(fixture.recordId);
    expect(window.closed).toBe(true);
    await rm(workDir, { recursive: true, force: true });
  });

  it("reports a record with unattested kan semantics as unsupported, with no audit", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const synthetic = encodeSyntheticRecord(bundle, [
      {
        name: "RecordNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, doras: ["1z"], scores: [25000, 25000, 25000, 25000],
          liqibang: 0, left_tile_count: 69,
          tiles0: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
          tiles1: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
          tiles2: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
          tiles3: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "5p"],
        },
      },
      // Type 9 is not attested by any real fixture; the mapper must refuse it
      // instead of guessing an enum meaning.
      { name: "RecordAnGangAddGang", data: { seat: 3, type: 9, tiles: "3s" } },
    ]);
    const workDir = await mkdtemp(join(tmpdir(), "majsoul-capture-test-"));
    let auditsWritten = 0;
    const { createWindow } = scriptedCapture(bundle, { data: synthetic });

    const result = await runRecordCaptureDiagnostic({
      bundle,
      url,
      recordId: "000000-00000000-0000-0000-0000-000000000001",
      selfActor: 0,
      createWindow,
      timeoutMs: 5_000,
      recordBytesFile: join(workDir, "captured-record.pb"),
      debugFile: join(workDir, "debug.log"),
      pipeline: {
        mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
        replay: replayCanonicalStream,
        serializeAudit: ({ stream, decisions }) => serializeMahjongSoulReplayAudit(
          buildMahjongSoulReplayAudit({
            stream,
            decisions,
            recordId: "000000-00000000-0000-0000-0000-000000000001",
            protocolVersion: "fixture",
            appVersion: "fixture",
            now: () => 1_700_000_000_000,
          }),
        ),
        writeAudit: async () => {
          auditsWritten += 1;
          return "unexpected";
        },
      },
    });

    // The honest outcome: everything decoded, the mapper refused the
    // unattested semantics, nothing passed off as a complete replay.
    expect(result.status).toBe("record_not_replayable");
    expect(result.mappingStatus).toBe("unsupported_semantics");
    expect(result.mappingCode).toBe("mahjong_soul_canonical_unsupported_semantics");
    expect(result.storedActionCount).toBe(2);
    expect(result.canonicalEventCount).toBeNull();
    expect(result.replayDecisionCount).toBeNull();
    expect(result.auditPath).toBeNull();
    expect(auditsWritten).toBe(0);
    expect(captureRecordDiagnosticExitCode(result.status)).toBe(1);
    await rm(workDir, { recursive: true, force: true });
  });

  it("times out as no_capture when no record exchange is observed", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const workDir = await mkdtemp(join(tmpdir(), "majsoul-capture-test-"));
    const window = new FakeWindow();
    const result = await runRecordCaptureDiagnostic({
      bundle,
      url,
      recordId: "000000-00000000-0000-0000-0000-000000000001",
      selfActor: 0,
      createWindow: () => window,
      timeoutMs: 100,
      debugFile: join(workDir, "debug.log"),
      pipeline: inertPipeline,
    });
    expect(result.status).toBe("no_capture");
    expect(window.closed).toBe(true);
    expect(captureRecordDiagnosticExitCode("no_capture")).toBe(3);
    await rm(workDir, { recursive: true, force: true });
  });

  it("fails closed when the response data is not a GameDetailRecords wrapper", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const root = parse(bundle.protoText, { keepCase: true }).root;
    const wrongData = encodeWrapper(root.lookupType("lq.Wrapper"), {
      name: ".lq.WrongType",
      data: Uint8Array.of(1),
    });
    const { createWindow } = scriptedCapture(bundle, { data: wrongData });
    const workDir = await mkdtemp(join(tmpdir(), "majsoul-capture-test-"));

    const result = await runRecordCaptureDiagnostic({
      bundle,
      url,
      recordId: "000000-00000000-0000-0000-0000-000000000001",
      selfActor: 0,
      createWindow,
      timeoutMs: 5_000,
      debugFile: join(workDir, "debug.log"),
      pipeline: inertPipeline,
    });
    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("capture_observe_failed");
    await rm(workDir, { recursive: true, force: true });
  });

  it("rejects a missing seat or record id before opening any window", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const workDir = await mkdtemp(join(tmpdir(), "majsoul-capture-test-"));
    let windowsCreated = 0;
    const base = {
      bundle,
      url,
      timeoutMs: 5_000,
      debugFile: join(workDir, "debug.log"),
      createWindow: () => {
        windowsCreated += 1;
        return new FakeWindow();
      },
      pipeline: inertPipeline,
    } as const;

    const badSeat = await runRecordCaptureDiagnostic({
      ...base,
      recordId: "000000-00000000-0000-0000-0000-000000000001",
      selfActor: 9,
    });
    expect(badSeat.status).toBe("error");
    expect(badSeat.errorCode).toBe("capture_identity_invalid");

    const badId = await runRecordCaptureDiagnostic({
      ...base,
      recordId: "",
      selfActor: 0,
    });
    expect(badId.errorCode).toBe("capture_identity_invalid");
    expect(windowsCreated).toBe(0);
    await rm(workDir, { recursive: true, force: true });
  });
});

// Local helper: encode a protobuf message via fromObject (the wrong-name
// Wrapper case needs bytes, not a validated message).
function encodeWrapper(
  type: import("protobufjs").Type,
  value: Record<string, unknown>,
): Uint8Array {
  return type.encode(type.fromObject(value)).finish();
}
