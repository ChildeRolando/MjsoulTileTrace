import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type Type } from "protobufjs";
import type { MahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import type { CaptureRecordWindowPort } from "../../src/official-client-record-capture.js";

// Shared harness for driving the official-client CDP capture boundary with
// REAL liqi frames built from the real bundle: a FakeDebugger that only
// delivers events to an already-registered listener (like the real debugger
// port) and a FakeWindow that fires scripted frames DURING loadURL — the
// moment the official client opens its Lobby WebSocket.

export const bundleRoot = fileURLToPath(new URL(
  "../../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));

export const fixtureDir = fileURLToPath(new URL(
  "../../../mahjong-soul-source/tests/fixtures/",
  import.meta.url,
));

export function loadFixtureWire(name: string): {
  readonly recordId: string;
  readonly wire: Uint8Array;
} {
  const fixture = JSON.parse(
    readFileSync(join(fixtureDir, `${name}.json`), "utf8"),
  ) as { readonly recordId: string; readonly wire: string };
  return { recordId: fixture.recordId, wire: Uint8Array.from(Buffer.from(fixture.wire, "hex")) };
}

export class FakeDebugger {
  attached = false;
  detachCalls = 0;
  commands: string[] = [];
  readonly script: Array<[string, unknown]> = [];
  readonly order: string[] = [];
  #listener: ((event: unknown, method: string, params: unknown) => void) | null = null;

  attach(): void {
    this.attached = true;
    this.order.push("attach");
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
    this.order.push(`command:${method}`);
    return {};
  }

  on(
    _event: "message",
    listener: (event: unknown, method: string, params: unknown) => void,
  ): void {
    this.#listener = listener;
    this.order.push("listener");
  }

  off(): void {
    this.#listener = null;
  }

  // Delivers a CDP event exactly like a real debugger port: the listener
  // only hears it if it was registered beforehand.
  fire(method: string, params: unknown): void {
    this.order.push(`event:${method}`);
    if (this.#listener !== null) this.#listener(undefined, method, params);
  }
}

export class FakeWindow {
  readonly webContents: {
    readonly debugger: FakeDebugger;
    readonly onDidNavigateCommit: (listener: () => void) => void;
  };
  closed = false;
  loadedUrl: string | null = null;
  /**
   * Worst-case framing: the websocket opens inside the commit stack itself
   * (frames DURING loadURL, before any post-commit microtask can run). Only
   * used to demonstrate why the listener must predate navigation.
   */
  syncScript = false;
  #commitListener: (() => void) | null = null;

  constructor(debuggerPort?: FakeDebugger) {
    const fake = this;
    this.webContents = {
      debugger: debuggerPort ?? new FakeDebugger(),
      onDidNavigateCommit(listener: () => void) {
        fake.#commitListener = listener;
      },
    };
  }

  loadURL(url: string): Promise<void> {
    this.loadedUrl = url;
    this.webContents.debugger.order.push("loadURL");
    // The main frame commits during navigation — the earliest working
    // Network.enable point per the live probe (the current client does not
    // open its Lobby WebSocket before enable completes there).
    this.#commitListener?.();
    this.webContents.debugger.order.push("commit");
    // The page's JavaScript (which opens the Lobby WebSocket) runs only
    // AFTER the commit settles through the observer's enable microtasks —
    // never synchronously inside the commit stack.
    const fireScript = () => {
      for (const [method, params] of this.webContents.debugger.script) {
        this.webContents.debugger.fire(method, params);
      }
    };
    if (this.syncScript) fireScript();
    else setTimeout(fireScript, 0);
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

export interface FrameBuilders {
  readonly request: (requestId: number, method: string, payload: Record<string, unknown>) => Uint8Array;
  readonly response: (requestId: number, responseType: string, payload: Record<string, unknown>) => Uint8Array;
}

export function frameBuilders(bundle: MahjongSoulProtocolBundle): FrameBuilders {
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

// Builds a synthetic outer-wrapped GameDetailRecords for records the mapper
// must refuse (unattested kan semantics): the fixture set has no such game.
export function encodeSyntheticRecord(
  bundle: MahjongSoulProtocolBundle,
  actions: ReadonlyArray<{ name: string; data: Record<string, unknown> }>,
): Uint8Array {
  const root = parse(bundle.protoText, { keepCase: true }).root;
  const wrapperType = root.lookupType("lq.Wrapper");
  const gameActionType = root.lookupType("lq.GameAction");
  const recordsType = root.lookupType("lq.GameDetailRecords");
  const gameActions = actions.map(({ name, data }) => {
    const actionType = root.lookupType(`lq.${name}`);
    const actionBytes = actionType.encode(actionType.fromObject(data)).finish();
    const wrapperBytes = wrapperType.encode(
      wrapperType.fromObject({ name: `.lq.${name}`, data: actionBytes }),
    ).finish();
    return gameActionType.fromObject({ result: wrapperBytes });
  });
  const inner = recordsType.encode(recordsType.fromObject({
    version: 210715,
    actions: gameActions,
  })).finish();
  return wrapperType.encode(
    wrapperType.fromObject({ name: ".lq.GameDetailRecords", data: inner }),
  ).finish();
}

const cdpCreated = { requestId: "socket-1", url: "wss://route-2.maj-soul.com/gateway" };
const cdpFrame = (payload: Uint8Array) => ({
  requestId: "socket-1",
  response: { opcode: 2, mask: false, payloadData: Buffer.from(payload).toString("base64") },
});

export interface ScriptedCapture {
  readonly window: FakeWindow;
  readonly createWindow: () => CaptureRecordWindowPort;
}

// Scripts the real wire shape: webSocketCreated, the client's
// fetchGameRecord request, and the server response carrying `payload` as the
// inline `data` bytes (an OUTER Wrapper on the real wire).
export function scriptedCapture(
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
