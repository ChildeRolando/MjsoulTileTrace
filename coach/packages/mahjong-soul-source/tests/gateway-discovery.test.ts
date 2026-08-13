import { describe, expect, test, vi } from "vitest";

import {
  discoverMahjongSoulCnLobbyUrl,
  type GatewayDiscoveryFetch,
} from "../src/gateway-discovery.js";
import type { MahjongSoulProtocolBundle } from "../src/protocol-bundle.js";

const fixedCode = "mahjong_soul_catalog_sync_failed";

function bundle(): MahjongSoulProtocolBundle {
  return {
    manifest: {} as never,
    protoText: "",
    rpcMap: {},
    endpoints: {
      loginPageOrigins: ["https://game.maj-soul.com"],
      staticAssetOrigins: ["https://game.maj-soul.com"],
      gatewayDiscoveryOrigins: [
        "https://route-2.maj-soul.com",
        "https://route-3.maj-soul.com:8443",
        "https://route-4.maj-soul.com",
        "https://route-5.maj-soul.com",
        "https://route-6.maj-soul.com",
      ],
      lobbyWebSocketOrigins: [
        "wss://route-2.maj-soul.com",
        "wss://route-3.maj-soul.com:8443",
        "wss://route-4.maj-soul.com",
        "wss://route-5.maj-soul.com",
        "wss://route-6.maj-soul.com",
      ],
      recordDataPrefixes: [],
    },
  };
}

function response(body: unknown, overrides: Partial<{
  ok: boolean;
  status: number;
  redirected: boolean;
  url: string;
}> = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    redirected: overrides.redirected ?? false,
    url: overrides.url
      ?? "https://route-2.maj-soul.com/api/clientgate/routes?platform=Web&version=4.0.46&lang=chs_t",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

describe("restricted Mahjong Soul CN gateway discovery", () => {
  test("accepts the native fetch Response shape without trusting its prototype", async () => {
    const requestUrl = "https://route-2.maj-soul.com/api/clientgate/routes?platform=Web&version=4.0.46&lang=chs_t";
    const native = new Response(JSON.stringify({
      data: { routes: [{ domain: "route-2.maj-soul.com:443", ssl: true, state: "idle" }] },
    }), { status: 200 });
    Object.defineProperty(native, "url", { value: requestUrl });

    await expect(discoverMahjongSoulCnLobbyUrl({
      bundle: bundle(),
      fetchImpl: async () => native,
    })).resolves.toBe("wss://route-2.maj-soul.com/gateway");
  });
  test("uses only the manifest-owned discovery origin and narrows to an allowed wss URL", async () => {
    const calls: string[] = [];
    const fetchImpl: GatewayDiscoveryFetch = async (url) => {
      calls.push(url);
      return response({
        data: {
          routes: [
            { domain: "route-2.maj-soul.com:443", ssl: true, state: "busy" },
            { domain: "route-3.maj-soul.com:8443", ssl: true, state: "idle" },
          ],
        },
      });
    };
    await expect(discoverMahjongSoulCnLobbyUrl({
      bundle: bundle(),
      fetchImpl,
    })).resolves.toBe("wss://route-3.maj-soul.com:8443/gateway");
    expect(calls).toEqual([
      "https://route-2.maj-soul.com/api/clientgate/routes?platform=Web&version=4.0.46&lang=chs_t",
    ]);
  });

  test.each([
    [{ data: { routes: [{ domain: "attacker.example:443", ssl: true, state: "idle" }] } }],
    [{ data: { routes: [{ domain: "route-2.maj-soul.com:80", ssl: false, state: "idle" }] } }],
    [{ data: { routes: [{ domain: "user:pass@route-2.maj-soul.com", ssl: true, state: "idle" }] } }],
    [{ data: { routes: [{ domain: "route-2.maj-soul.com/gateway", ssl: true, state: "idle" }] } }],
    [{ data: { routes: [{ domain: "route-2.maj-soul.com:443#x", ssl: true, state: "idle" }] } }],
    [{ data: { routes: [] } }],
    [{ data: { routes: "not-an-array" } }],
  ])("rejects hostile or unsupported route data %#", async (body) => {
    await expect(discoverMahjongSoulCnLobbyUrl({
      bundle: bundle(),
      fetchImpl: async () => response(body),
    })).rejects.toThrow(fixedCode);
  });

  test.each([
    { ok: false, status: 500 },
    { redirected: true },
    { url: "https://attacker.example/result" },
  ])("rejects response envelope %#", async (overrides) => {
    await expect(discoverMahjongSoulCnLobbyUrl({
      bundle: bundle(),
      fetchImpl: async () => response({}, overrides),
    })).rejects.toThrow(fixedCode);
  });

  test("rejects an oversized body and never reflects upstream prose", async () => {
    const hostile = "hostile-gateway-prose";
    let caught: unknown;
    try {
      await discoverMahjongSoulCnLobbyUrl({
        bundle: bundle(),
        fetchImpl: async () => response({ value: hostile.repeat(20_000) }),
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe(fixedCode);
    expect(String(caught)).not.toContain(hostile);
  });

  test("times out a discovery fetch that never settles", async () => {
    vi.useFakeTimers();
    const pending = discoverMahjongSoulCnLobbyUrl({
      bundle: bundle(),
      fetchImpl: async () => await new Promise<never>(() => undefined),
      timeoutMs: 20,
    });
    const assertion = expect(pending).rejects.toThrow(fixedCode);
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    vi.useRealTimers();
  });

  test("times out and aborts a discovery response body that never settles", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | null = null;
    const cancel = vi.fn();
    const hanging = response({});
    const pending = discoverMahjongSoulCnLobbyUrl({
      bundle: bundle(),
      fetchImpl: async (_url, init) => {
        capturedSignal = init?.signal as AbortSignal;
        return {
          ...hanging,
          body: new ReadableStream<Uint8Array>({
            pull: async () => await new Promise<never>(() => undefined),
            cancel,
          }),
        };
      },
      timeoutMs: 20,
    });
    const assertion = expect(pending).rejects.toThrow(fixedCode);
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(capturedSignal).not.toBeNull();
    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
