import { describe, expect, it } from "vitest";
import { canonicalActionRef, type Hand13FactRequest } from "@riichi-coach/contracts";
import type {
  FactEngineTransport,
} from "../src/fact-engine/port.js";
import {
  JsonlFactEngineClient,
} from "../src/fact-engine/jsonl-client.js";
import {
  resolveManagedFactEngineBinary,
} from "../src/fact-engine/managed-sidecar.js";

const identity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.1.0",
  protocolVersion: "mahjong-facts/v1",
} as const;

const actionRef = canonicalActionRef({
  kind: "discard",
  tile: { id: "1m", red: false },
  discardMode: "tedashi",
});

function validHand13Request(): Hand13FactRequest {
  return {
    kind: "hand13" as const,
    requestId: "req-1",
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef,
    stateHash: "sha256:test",
    melds: [],
    doraTiles34: [],
    redFiveCounts: [0, 0, 0] as [number, number, number],
    roundWindTile34: 27,
    selfWindTile34: 28,
    dealer: false,
    riichi: false,
    selfDiscards34: [],
    handTiles34: Array(34).fill(0) as number[],
    leftTiles34: null,
    visibleCountsComplete: false,
    remainingDraws: null,
  };
}

function validHand13Result() {
  return {
    kind: "hand13_result" as const,
    requestId: "req-1",
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef,
    stateHash: "sha256:test",
    identity,
    shanten: 1,
    effectiveTile34: [2],
    waitsRemainingStatus: "blocked_missing_facts" as const,
    waitsRemaining: [],
    improves: [],
    doraCount: 0,
    estimates: [],
    diagnostics: [],
  };
}

class FixtureTransport implements FactEngineTransport {
  constructor(private readonly result: unknown) {}

  async request(): Promise<string> {
    return JSON.stringify(this.result);
  }

  async restart(): Promise<void> {}

  async close(): Promise<void> {}
}

class RestartCountingTransport implements FactEngineTransport {
  restartCount = 0;

  constructor(private readonly failures: Error[]) {}

  async request(): Promise<string> {
    throw this.failures.shift() ?? new Error("unexpected request");
  }

  async restart(): Promise<void> {
    this.restartCount++;
  }

  async close(): Promise<void> {}
}

describe("JSONL fact engine client", () => {
  it("validates result bindings", async () => {
    const client = new JsonlFactEngineClient(
      new FixtureTransport(validHand13Result()),
    );
    await expect(client.analyzeHand13(validHand13Request()))
      .resolves.toMatchObject({ kind: "hand13_result", shanten: 1 });
  });

  it("rejects a state hash mismatch without restarting", async () => {
    const transport = new FixtureTransport({
      ...validHand13Result(),
      stateHash: "sha256:wrong",
    });
    const client = new JsonlFactEngineClient(transport);
    await expect(client.analyzeHand13(validHand13Request()))
      .rejects.toThrow("state_hash_mismatch");
  });

  it("restarts once after transport failure", async () => {
    const transport = new RestartCountingTransport([
      new Error("crash"),
      new Error("crash"),
    ]);
    await expect(new JsonlFactEngineClient(transport)
      .analyzeHand13(validHand13Request()))
      .rejects.toThrow("fact_engine_unavailable");
    expect(transport.restartCount).toBe(1);
  });

  it("rejects prohibited extra result fields without restarting", async () => {
    const client = new JsonlFactEngineClient(new FixtureTransport({
      ...validHand13Result(),
      recommendedDiscard: 5,
    }));
    await expect(client.analyzeHand13(validHand13Request()))
      .rejects.toThrow("invalid_fact_engine_response");
  });

  it("resolves only the managed binary below app resources", () => {
    const resolved = resolveManagedFactEngineBinary("C:\\app\\resources");
    expect(resolved).toMatch(
      /resources[\\/]mahjong-facts[\\/]windows-x64[\\/]mahjong-facts\.exe$/,
    );
  });
});
