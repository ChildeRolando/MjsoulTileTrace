import { describe, expect, test, vi } from "vitest";

import {
  createWebSocketLobbyTransport,
  type LobbyWebSocketLike,
} from "../src/lobby-transport.js";

const fixedCode = "mahjong_soul_catalog_sync_failed";

class FakeSocket implements LobbyWebSocketLike {
  binaryType = "";
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  sent: Uint8Array[] = [];
  closeCalls = 0;
  constructor(readonly url: string) {}
  send(data: Uint8Array): void { this.sent.push(new Uint8Array(data)); }
  close(): void { this.closeCalls += 1; this.readyState = 3; }
}

describe("bounded Lobby WebSocket transport", () => {
  test("waits for open, copies frames and surfaces only binary messages", async () => {
    let socket!: FakeSocket;
    const transport = createWebSocketLobbyTransport({
      url: "wss://route-2.maj-soul.com/gateway",
      WebSocketImpl: class extends FakeSocket {
        constructor(url: string) { super(url); socket = this; }
      },
      connectTimeoutMs: 100,
    });
    const received: Uint8Array[] = [];
    transport.onFrame((frame) => received.push(frame));
    const input = Uint8Array.of(1, 2, 3);
    const pending = transport.sendFrame(input);
    expect(socket.sent).toEqual([]);
    socket.readyState = 1;
    socket.onopen?.({});
    await pending;
    input[0] = 9;
    expect(socket.sent).toEqual([Uint8Array.of(1, 2, 3)]);
    socket.onmessage?.({ data: Uint8Array.of(4, 5) });
    expect(received).toEqual([Uint8Array.of(4, 5)]);
    await transport.close();
    expect(socket.closeCalls).toBe(1);
  });

  test("times out connect, closes and rejects without event prose", async () => {
    vi.useFakeTimers();
    let socket!: FakeSocket;
    const transport = createWebSocketLobbyTransport({
      url: "wss://route-2.maj-soul.com/gateway",
      WebSocketImpl: class extends FakeSocket {
        constructor(url: string) { super(url); socket = this; }
      },
      connectTimeoutMs: 20,
    });
    const pending = transport.sendFrame(Uint8Array.of(1));
    const assertion = expect(pending).rejects.toThrow(fixedCode);
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(socket.closeCalls).toBe(1);
    vi.useRealTimers();
  });

  test("rejects close-before-open and future sends", async () => {
    let socket!: FakeSocket;
    const transport = createWebSocketLobbyTransport({
      url: "wss://route-2.maj-soul.com/gateway",
      WebSocketImpl: class extends FakeSocket {
        constructor(url: string) { super(url); socket = this; }
      },
    });
    const pending = transport.sendFrame(Uint8Array.of(1));
    socket.readyState = 3;
    socket.onclose?.({ hostile: "upstream prose" });
    await expect(pending).rejects.toThrow(fixedCode);
    await expect(transport.sendFrame(Uint8Array.of(2))).rejects.toThrow(fixedCode);
  });

  test.each([
    "ws://route-2.maj-soul.com/gateway",
    "wss://attacker.example/gateway",
    "wss://user:pass@route-2.maj-soul.com/gateway",
    "wss://route-2.maj-soul.com/gateway#x",
  ])("rejects a non-manifest-safe URL %s before constructing", (url) => {
    let constructed = false;
    expect(() => createWebSocketLobbyTransport({
      url,
      WebSocketImpl: class extends FakeSocket {
        constructor(value: string) { super(value); constructed = true; }
      },
    })).toThrow(fixedCode);
    expect(constructed).toBe(false);
  });
});
