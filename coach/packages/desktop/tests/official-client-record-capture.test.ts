import { describe, expect, it } from "vitest";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
import {
  captureRecordViaOfficialClient,
  OfficialClientCaptureError,
} from "../src/official-client-record-capture.js";
import { createCdpRecordObserver } from "../src/cdp-record-observer.js";
import {
  bundleRoot,
  FakeWindow,
  loadFixtureWire,
  scriptedCapture,
} from "./helpers/cdp-capture-harness.js";

// The PRODUCTION capture primitive boundary. These tests pin the two
// invariants every consumer depends on:
//   1. the observer is fully ready BEFORE navigation (ordering proven by
//      accf970), so frames flowing during loadURL cannot be missed;
//   2. the captured bytes are the INNER GameDetailRecords — the outer
//      Wrapper unwrap happened exactly once, inside the capture.

const url = "https://game.maj-soul.com/1/?paipu=000000-00000000-0000-0000-0000-000000000001_a123456";

describe("official-client record capture primitive", () => {
  it("captures the record with INNER bytes while frames flow during loadURL", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    const { window, createWindow } = scriptedCapture(bundle, { data: fixture.wire });

    const captured = await captureRecordViaOfficialClient({
      bundle,
      url,
      createWindow,
      timeoutMs: 5_000,
    });

    expect(captured.status).toBe("captured");
    if (captured.status !== "captured") return;
    // Exactly one unwrap: INNER bytes, not the outer Wrapper wire — and the
    // exact URL the caller validated is the URL that was navigated.
    const inner = unwrapGameDetailRecords(bundle, fixture.wire);
    expect(captured.recordBytes).toEqual(inner);
    expect(captured.recordBytes.length).not.toBe(fixture.wire.length);
    expect(window.loadedUrl).toBe(url);

    // The INNER bytes map directly; a double unwrap would fail closed here.
    const mapped = mapMahjongSoulRecord({
      gameId: "majsoul:test",
      selfActor: 0,
      recordId: fixture.recordId,
      recordBytes: captured.recordBytes,
      bundle,
    });
    expect(mapped.status).toBe("ready");
  });

  it("is fully ready before navigation: attach -> Network.enable -> listener -> loadURL", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    const { window, createWindow } = scriptedCapture(bundle, { data: fixture.wire });

    await captureRecordViaOfficialClient({
      bundle,
      url,
      createWindow,
      timeoutMs: 5_000,
    });

    const order = window.webContents.debugger.order;
    const attachIndex = order.indexOf("attach");
    const enableIndex = order.indexOf("command:Network.enable");
    const listenerIndex = order.indexOf("listener");
    const loadIndex = order.indexOf("loadURL");
    expect(attachIndex).toBeGreaterThanOrEqual(0);
    expect(enableIndex).toBeGreaterThan(attachIndex);
    expect(listenerIndex).toBeGreaterThan(enableIndex);
    expect(loadIndex).toBeGreaterThan(listenerIndex);
    // The frames fired during loadURL were heard (the old order loses them).
    expect(order.indexOf("event:Network.webSocketCreated")).toBeGreaterThan(loadIndex);
    expect(window.closed).toBe(true);
  });

  it("the legacy order (listener after loadURL) misses the frames entirely", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    // Move the scripted frames onto a window driven by hand with the
    // OBSOLETE ordering: attach + Network.enable + navigate first, only then
    // register the message listener.
    const scripted = scriptedCapture(bundle, { data: fixture.wire }).window;
    const window = new FakeWindow();
    window.webContents.debugger.script.push(...scripted.webContents.debugger.script);
    const debuggerPort = window.webContents.debugger;

    const observer = createCdpRecordObserver({ bundle, debuggerPort });
    let capturedDuringLoad = false;
    await observer.start();
    await window.loadURL(url); // frames fire here — no listener registered yet
    debuggerPort.on("message", (_event, method, params) => {
      if (observer.accept(method, params) !== null) capturedDuringLoad = true;
    });
    expect(capturedDuringLoad).toBe(false);
    observer.close();
  });

  it("times out as no_capture, closing the window and detaching the debugger", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const window = new FakeWindow();
    const result = await captureRecordViaOfficialClient({
      bundle,
      url,
      createWindow: () => window,
      timeoutMs: 20,
    });
    expect(result).toEqual({ status: "no_capture" });
    expect(window.closed).toBe(true);
    expect(window.webContents.debugger.detachCalls).toBeGreaterThan(0);
    expect(window.webContents.debugger.attached).toBe(false);
  });

  it("fails closed with a fixed observe error when the wire violates the protocol", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    // A response whose data is NOT a .lq.GameDetailRecords Wrapper: the
    // strict unwrap inside the capture refuses it and the observer fails.
    const { window, createWindow } = scriptedCapture(bundle, {
      data: Uint8Array.of(1, 2, 3),
    });
    let observed: unknown = null;
    try {
      await captureRecordViaOfficialClient({
        bundle,
        url,
        createWindow,
        timeoutMs: 5_000,
      });
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(OfficialClientCaptureError);
    expect((observed as OfficialClientCaptureError).code)
      .toBe("official_client_capture_observe_failed");
    expect(window.closed).toBe(true);
  });

  it("fails closed with a fixed window error when navigation itself fails", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const window = new FakeWindow();
    window.loadURL = () => Promise.reject(new Error("navigation refused"));
    await expect(captureRecordViaOfficialClient({
      bundle,
      url,
      createWindow: () => window,
      timeoutMs: 5_000,
    })).rejects.toMatchObject({
      code: "official_client_capture_window_failed",
    });
    expect(window.closed).toBe(true);
  });
});
