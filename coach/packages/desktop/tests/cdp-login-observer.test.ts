import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import {
  loadMahjongSoulProtocolBundle,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import {
  createCdpLoginObserver,
  type CdpDebuggerPort,
} from "../src/cdp-login-observer.js";

const bundleRoot = fileURLToPath(new URL(
  "../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));
const fixtureUrl = new URL(
  "../../mahjong-soul-source/tests/fixtures/official-bundle-frames.json",
  import.meta.url,
);
let bundle: MahjongSoulProtocolBundle;
let frames: Record<string, string>;

class FakeDebugger implements CdpDebuggerPort {
  attached = false;
  attachCalls: Array<string | undefined> = [];
  detachCalls = 0;
  commands: Array<{ method: string; parameters?: Record<string, unknown> }> = [];

  attach(version?: string): void {
    this.attachCalls.push(version);
    this.attached = true;
  }

  detach(): void {
    this.detachCalls += 1;
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }

  async sendCommand(
    method: string,
    parameters?: Record<string, unknown>,
  ): Promise<unknown> {
    this.commands.push({ method, ...(parameters === undefined ? {} : { parameters }) });
    return {};
  }
}

const payload = (name: string) => Buffer.from(frames[name]!, "hex").toString("base64");
const created = (url = "wss://route-2.maj-soul.com/gateway") => ({
  requestId: "socket-1",
  url,
});
const frame = (name: string, opcode = 2) => ({
  requestId: "socket-1",
  response: { opcode, mask: false, payloadData: payload(name) },
});

beforeAll(async () => {
  bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  frames = (JSON.parse(await readFile(fixtureUrl, "utf8")) as {
    readonly frames: Record<string, string>;
  }).frames;
});

describe("Electron CDP login observer", () => {
  it("attaches locally and captures one allowlisted binary login exchange", async () => {
    const debuggerPort = new FakeDebugger();
    const observer = createCdpLoginObserver({ bundle, debuggerPort });
    await observer.start();

    expect(debuggerPort.attachCalls).toEqual(["1.3"]);
    expect(debuggerPort.commands).toEqual([{ method: "Network.enable" }]);
    expect(observer.accept("Network.webSocketCreated", created())).toBeNull();
    expect(observer.accept("Network.webSocketFrameSent", frame("loginRequest")))
      .toBeNull();
    const result = observer.accept(
      "Network.webSocketFrameReceived",
      frame("loginResponse"),
    );

    expect(result?.status).toBe("authenticated");
    expect(debuggerPort.detachCalls).toBe(1);
    expect(debuggerPort.isAttached()).toBe(false);
  });

  it.each([
    ["unknown host", created("wss://route-2.maj-soul.com.attacker.invalid/gateway")],
    ["credentials", created("wss://user:pass@route-2.maj-soul.com/gateway")],
    ["https socket", created("https://route-2.maj-soul.com/gateway")],
  ])("rejects %s before decoding frames", async (_name, parameters) => {
    const observer = createCdpLoginObserver({
      bundle,
      debuggerPort: new FakeDebugger(),
    });
    await observer.start();
    expect(() => observer.accept("Network.webSocketCreated", parameters)).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
  });

  it("rejects unknown sockets, text frames and non-canonical base64", async () => {
    for (const parameters of [
      frame("loginRequest"),
      { ...frame("loginRequest", 1) },
      {
        requestId: "socket-1",
        response: { opcode: 2, mask: false, payloadData: "AA==\n" },
      },
    ]) {
      const observer = createCdpLoginObserver({
        bundle,
        debuggerPort: new FakeDebugger(),
      });
      await observer.start();
      if (parameters.response.opcode !== 2 || parameters.response.payloadData.endsWith("\n")) {
        observer.accept("Network.webSocketCreated", created());
      }
      expect(() => observer.accept("Network.webSocketFrameSent", parameters)).toThrow(
        "mahjong_soul_login_protocol_unsupported",
      );
    }
  });

  it("detaches exactly once on cancellation and fixed errors", async () => {
    const debuggerPort = new FakeDebugger();
    const observer = createCdpLoginObserver({ bundle, debuggerPort });
    await observer.start();
    observer.close();
    observer.close();
    expect(debuggerPort.detachCalls).toBe(1);
    expect(() => observer.accept("Network.webSocketCreated", created())).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
  });

  it("snapshots debugger capabilities once instead of re-reading getters", async () => {
    const target = new FakeDebugger();
    const reads = new Map<string, number>();
    const debuggerPort = Object.create(null) as CdpDebuggerPort;
    for (const method of ["attach", "detach", "isAttached", "sendCommand"] as const) {
      Object.defineProperty(debuggerPort, method, {
        enumerable: true,
        get() {
          reads.set(method, (reads.get(method) ?? 0) + 1);
          return target[method].bind(target);
        },
      });
    }

    const observer = createCdpLoginObserver({ bundle, debuggerPort });
    await observer.start();
    observer.close();

    expect(Object.fromEntries(reads)).toEqual({
      attach: 1,
      detach: 1,
      isAttached: 1,
      sendCommand: 1,
    });
  });
});
