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

// The PRODUCTION capture primitive boundary. These tests pin the invariants
// every consumer depends on:
//   1. the debugger is attached and the message listener registered BEFORE
//      navigation, and Network.enable is dispatched at the FIRST main-frame
//      commit — never to the uncommitted about:blank target (Electron 43's
//      sendCommand hangs there; verified live 2026-08-15), and always before
//      the page's JavaScript can open the Lobby WebSocket;
//   2. the captured bytes are the INNER GameDetailRecords — the outer
//      Wrapper unwrap happened exactly once, inside the capture;
//   3. timeoutMs bounds the WHOLE capture: a page that never commits (or a
//      loadURL that never settles) resolves no_capture at the deadline.

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

  it("attaches + listens before navigation, enables Network only at the first commit", async () => {
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
    const listenerIndex = order.indexOf("listener");
    const loadIndex = order.indexOf("loadURL");
    const commitIndex = order.indexOf("commit");
    const enableIndex = order.indexOf("command:Network.enable");
    expect(attachIndex).toBeGreaterThanOrEqual(0);
    // No frame can be missed: the listener predates navigation...
    expect(listenerIndex).toBeGreaterThan(attachIndex);
    expect(loadIndex).toBeGreaterThan(listenerIndex);
    // ...and Network.enable happens at the commit — never on about:blank
    // (the live-verified Electron 43 hang) — still before any page JS runs.
    expect(commitIndex).toBeGreaterThan(loadIndex);
    expect(enableIndex).toBeGreaterThan(commitIndex);
    // The frames fired during loadURL (after enable) were heard.
    expect(order.indexOf("event:Network.webSocketCreated")).toBeGreaterThan(enableIndex);
    expect(window.closed).toBe(true);
  });

  it("the legacy order (listener/enable after loadURL) misses navigation-time frames", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixtureWire("real-supported-round");
    // Move the scripted frames onto a window driven by hand with the
    // OBSOLETE ordering: navigate first, only then prepare the observer.
    // syncScript models the worst case accf970 guarded against — the
    // websocket opening inside the navigation itself.
    const scripted = scriptedCapture(bundle, { data: fixture.wire }).window;
    const window = new FakeWindow();
    window.syncScript = true;
    window.webContents.debugger.script.push(...scripted.webContents.debugger.script);
    const debuggerPort = window.webContents.debugger;

    const observer = createCdpRecordObserver({ bundle, debuggerPort });
    let capturedAfterLoad = false;
    await observer.attach();
    await window.loadURL(url); // frames fired here — no listener was registered
    debuggerPort.on("message", (_event, method, params) => {
      if (observer.accept(method, params) !== null) capturedAfterLoad = true;
    });
    expect(capturedAfterLoad).toBe(false);
    observer.close();
  });

  it("resolves no_capture at the deadline when the page never commits", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const window = new FakeWindow();
    // A loadURL that neither commits nor settles (e.g. a stalled network
    // request): the deadline must still end the capture.
    window.loadURL = (): Promise<void> => new Promise(() => undefined);
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

  it("resolves no_capture at the deadline when navigation stalls before any frame", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const window = new FakeWindow();
    // Commits but never opens a websocket (script empty).
    const result = await captureRecordViaOfficialClient({
      bundle,
      url,
      createWindow: () => window,
      timeoutMs: 20,
    });
    expect(result).toEqual({ status: "no_capture" });
    expect(window.closed).toBe(true);
    // Network.enable WAS dispatched (the commit happened) and the debugger
    // was detached on the way out.
    expect(window.webContents.debugger.commands).toContain("Network.enable");
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
