import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type Type } from "protobufjs";
import { describe, expect, it } from "vitest";
import {
  decodeStoredRecordActions,
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
  type MahjongSoulCanonicalMapperResult,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import {
  buildMahjongSoulReplayAudit,
  replayCanonicalStream,
  serializeMahjongSoulReplayAudit,
} from "@riichi-coach/reasoning";
import {
  captureRecordDiagnosticExitCode,
  runRecordCaptureDiagnostic,
  type CaptureRecordWindowPort,
} from "../src/capture-record-diagnostic-runner.js";

// Drives the capture diagnostic end to end with the REAL bundle, the REAL
// canonical pipeline and scripted CDP frames carrying the sanitized fixtures.
// This pins the P2 boundary: the CDP observer's result.recordBytes is already
// the INNER GameDetailRecords bytes and goes straight to the mapper — a double
// unwrap anywhere in this chain would fail closed instead of going green.

const bundleRoot = fileURLToPath(new URL(
  "../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));
const fixtureDir = fileURLToPath(new URL(
  "../../mahjong-soul-source/tests/fixtures/",
  import.meta.url,
));

function loadFixtureWire(name: string): {
  readonly recordId: string;
  readonly wire: Uint8Array;
} {
  const fixture = JSON.parse(
    readFileSync(join(fixtureDir, `${name}.json`), "utf8"),
  ) as { readonly recordId: string; readonly wire: string };
  return { recordId: fixture.recordId, wire: Uint8Array.from(Buffer.from(fixture.wire, "hex")) };
}

class FakeDebugger {
  attached = false;
  detachCalls = 0;
  commands: string[] = [];
  readonly script: Array<[string, unknown]> = [];

  attach(): void {
    this.attached = true;
  }

  detach(): void {
    this.detachCalls += 1;
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }

  async sendCommand(method: string): Promise<unknown> {
    this.commands.push(method);
    return {};
  }

  on(
    _event: "message",
    listener: (event: unknown, method: string, params: unknown) => void,
  ): void {
    for (const [method, params] of this.script) {
      listener(undefined, method, params);
    }
  }

  off(): void {
    // nothing registered beyond the run scope
  }
}

class FakeWindow {
  readonly webContents = { debugger: new FakeDebugger() };
  closed = false;
  loadedUrl: string | null = null;

  loadURL(url: string): Promise<void> {
    this.loadedUrl = url;
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }

  isDestroyed(): boolean {
    return this.closed;
  }
}

function encode(type: Type, value: Record<string, unknown>): Uint8Array {
  const message = type.fromObject(value);
  const error = type.verify(message);
  if (error !== null) throw new Error(error);
  return type.encode(message).finish();
}

interface FrameBuilders {
  readonly request: (requestId: number, method: string, payload: Record<string, unknown>) => Uint8Array;
  readonly response: (requestId: number, responseType: string, payload: Record<string, unknown>) => Uint8Array;
}

function frameBuilders(bundle: MahjongSoulProtocolBundle): FrameBuilders {
  const root = parse(bundle.protoText, { keepCase: true }).root;
  const wrapperType = root.lookupType("lq.Wrapper");
  const wrap = (requestId: number, kind: number, name: string, body: Uint8Array): Uint8Array => {
    const wrapped = encode(wrapperType, { name, data: body });
    const output = new Uint8Array(3 + wrapped.length);
    output[0] = kind;
    output[1] = requestId & 0xff;
    output[2] = requestId >>> 8;
    output.set(wrapped, 3);
    return output;
  };
  return {
    request: (requestId, method, payload) => wrap(
      requestId,
      2,
      method,
      encode(root.lookupType(bundle.rpcMap[method]!.req), payload),
    ),
    response: (requestId, responseType, payload) => wrap(
      requestId,
      3,
      "",
      encode(root.lookupType(responseType), payload),
    ),
  };
}

const cdpCreated = { requestId: "socket-1", url: "wss://route-2.maj-soul.com/gateway" };
const cdpFrame = (payload: Uint8Array) => ({
  requestId: "socket-1",
  response: { opcode: 2, mask: false, payloadData: Buffer.from(payload).toString("base64") },
});

interface ScriptedCapture {
  readonly window: FakeWindow;
  readonly createWindow: () => CaptureRecordWindowPort;
}

function scriptedCapture(
  bundle: MahjongSoulProtocolBundle,
  responsePayload: Record<string, unknown>,
): ScriptedCapture {
  const window = new FakeWindow();
  const { request, response } = frameBuilders(bundle);
  window.webContents.debugger.script.push(
    ["Network.webSocketCreated", cdpCreated],
    ["Network.webSocketFrameSent", cdpFrame(request(
      7,
      ".lq.Lobby.fetchGameRecord",
      { game_uuid: "000000-00000000-0000-0000-0000-000000000001" },
    ))],
    ["Network.webSocketFrameReceived", cdpFrame(response(
      7,
      bundle.rpcMap[".lq.Lobby.fetchGameRecord"]!.resp,
      responsePayload,
    ))],
  );
  return { window, createWindow: () => window };
}

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
      url: "https://game.maj-soul.com/1/?paipu=000000-00000000-0000-0000-0000-000000000001_a123456",
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

  it("reports a full real game containing AnGangAddGang as unsupported, with no audit", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-record-wire");
    const workDir = await mkdtemp(join(tmpdir(), "majsoul-capture-test-"));
    let auditsWritten = 0;
    const { createWindow } = scriptedCapture(bundle, { data: fixture.wire });

    const result = await runRecordCaptureDiagnostic({
      bundle,
      url: "https://game.maj-soul.com/1/?paipu=000000-00000000-0000-0000-0000-000000000001_a123456",
      recordId: fixture.recordId,
      selfActor: 0,
      createWindow,
      timeoutMs: 5_000,
      recordBytesFile: join(workDir, "captured-record.pb"),
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
        writeAudit: async () => {
          auditsWritten += 1;
          return "unexpected";
        },
      },
    });

    // The honest outcome for the live full game: every action decoded, the
    // mapper refused the ankan/kakan semantics, nothing passed off as a
    // complete replay.
    expect(result.status).toBe("record_not_replayable");
    expect(result.mappingStatus).toBe("unsupported_semantics");
    expect(result.mappingCode).toBe("mahjong_soul_canonical_unsupported_semantics");
    expect(result.storedActionCount).toBe(978);
    expect(result.canonicalEventCount).toBeNull();
    expect(result.replayDecisionCount).toBeNull();
    expect(result.auditPath).toBeNull();
    expect(auditsWritten).toBe(0);
    expect(captureRecordDiagnosticExitCode(result.status)).toBe(1);
    await rm(workDir, { recursive: true, force: true });
  });

  it("times out as no_capture when no record exchange is observed", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const window = new FakeWindow();
    const result = await runRecordCaptureDiagnostic({
      bundle,
      url: "https://game.maj-soul.com/1/?paipu=000000-00000000-0000-0000-0000-000000000001_a123456",
      recordId: "000000-00000000-0000-0000-0000-000000000001",
      selfActor: 0,
      createWindow: () => window,
      timeoutMs: 100,
      pipeline: {
        mapRecord: (): MahjongSoulCanonicalMapperResult => ({ status: "invalid", code: "mahjong_soul_canonical_mapping_failed" }),
        replay: () => [],
        serializeAudit: () => "",
        writeAudit: async () => "unused",
      },
    });
    expect(result.status).toBe("no_capture");
    expect(window.closed).toBe(true);
    expect(captureRecordDiagnosticExitCode("no_capture")).toBe(3);
  });

  it("fails closed when the response data is not a GameDetailRecords wrapper", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const root = parse(bundle.protoText, { keepCase: true }).root;
    const wrongData = encode(root.lookupType("lq.Wrapper"), {
      name: ".lq.WrongType",
      data: Uint8Array.of(1),
    });
    const { createWindow } = scriptedCapture(bundle, { data: wrongData });

    const result = await runRecordCaptureDiagnostic({
      bundle,
      url: "https://game.maj-soul.com/1/?paipu=000000-00000000-0000-0000-0000-000000000001_a123456",
      recordId: "000000-00000000-0000-0000-0000-000000000001",
      selfActor: 0,
      createWindow,
      timeoutMs: 5_000,
      pipeline: {
        mapRecord: (): MahjongSoulCanonicalMapperResult => ({ status: "invalid", code: "mahjong_soul_canonical_mapping_failed" }),
        replay: () => [],
        serializeAudit: () => "",
        writeAudit: async () => "unused",
      },
    });
    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("capture_observe_failed");
  });

  it("rejects a missing seat or record id before opening any window", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    let windowsCreated = 0;
    const base = {
      bundle,
      url: "https://game.maj-soul.com/1/?paipu=000000-00000000-0000-0000-0000-000000000001_a123456",
      timeoutMs: 5_000,
      createWindow: () => {
        windowsCreated += 1;
        return new FakeWindow();
      },
      pipeline: {
        mapRecord: (): MahjongSoulCanonicalMapperResult => ({ status: "invalid", code: "mahjong_soul_canonical_mapping_failed" }),
        replay: () => [],
        serializeAudit: () => "",
        writeAudit: async () => "unused",
      },
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
  });
});
