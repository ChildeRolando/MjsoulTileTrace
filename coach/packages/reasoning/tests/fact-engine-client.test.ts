import { describe, expect, it } from "vitest";
import {
  canonicalActionRef,
  type Hand13FactRequest,
  type ThreatRiskFactRequest,
} from "@riichi-coach/contracts";
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
    doraTilesComplete: true,
    selfDiscardsComplete: true,
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
    doraCountStatus: "calculated" as const,
    doraCount: 0,
    estimates: [],
    diagnostics: [],
  };
}

function validThreatRiskRequest(): ThreatRiskFactRequest {
  return {
    kind: "threat_risk",
    requestId: "risk-1",
    protocolVersion: "mahjong-facts/v1",
    actionRef,
    stateHash: "sha256:risk",
    threatActor: 2,
    turns: 6,
    safeTiles34: Array(34).fill(false) as boolean[],
    leftTiles34: Array(34).fill(4) as number[],
    doraTiles34: [4],
    roundWindTile34: 27,
    threatWindTile34: 29,
    earlyOutsideTiles34: [0, 1],
    evidenceIds: ["event-riichi", "event-safe"],
  };
}

function validThreatRiskResult() {
  const request = validThreatRiskRequest();
  return {
    kind: "threat_risk_result" as const,
    requestId: request.requestId,
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef,
    stateHash: request.stateHash,
    identity,
    threatActor: request.threatActor,
    riskScale: Array(34).fill(0),
    classifications: [],
    leftNoSujiTile34: [],
    evidenceIds: [...request.evidenceIds],
    limitations: ["versioned upstream risk scale"],
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

class ConcurrentIdentityTransport implements FactEngineTransport {
  active = 0;
  closeWhileActive: number | null = null;
  closed = false;
  generation: number;
  maxActive = 0;
  restartCount = 0;

  constructor(generation = 1) {
    this.generation = generation;
  }

  async request(line: string): Promise<string> {
    if (this.closed) {
      throw new Error("transport closed");
    }
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    const observedGeneration = this.generation;
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (observedGeneration === 0) {
        throw new Error("generation crashed");
      }
      const request = JSON.parse(line) as { requestId: string };
      return JSON.stringify({
        kind: "identity_result",
        requestId: request.requestId,
        protocolVersion: "mahjong-facts/v1",
        identity,
      });
    } finally {
      this.active--;
    }
  }

  async restart(): Promise<void> {
    this.restartCount++;
    this.generation++;
  }

  async close(): Promise<void> {
    this.closeWhileActive = this.active;
    this.closed = true;
  }
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

  it("serializes requests to the synchronous sidecar", async () => {
    const transport = new ConcurrentIdentityTransport();
    const client = new JsonlFactEngineClient(transport);

    await Promise.all([client.identity(), client.identity()]);

    expect(transport.maxActive).toBe(1);
  });

  it("performs one managed restart for concurrent callers", async () => {
    const transport = new ConcurrentIdentityTransport(0);
    const client = new JsonlFactEngineClient(transport);

    await expect(Promise.all([client.identity(), client.identity()]))
      .resolves.toHaveLength(2);

    expect(transport.restartCount).toBe(1);
    expect(transport.maxActive).toBe(1);
  });

  it("waits for queued requests before closing the transport", async () => {
    const transport = new ConcurrentIdentityTransport();
    const client = new JsonlFactEngineClient(transport);
    const first = client.identity();
    const second = client.identity();

    await Promise.all([first, second, client.close()]);

    expect(transport.closeWhileActive).toBe(0);
  });

  it("rejects prohibited extra result fields without restarting", async () => {
    const client = new JsonlFactEngineClient(new FixtureTransport({
      ...validHand13Result(),
      recommendedDiscard: 5,
    }));
    await expect(client.analyzeHand13(validHand13Request()))
      .rejects.toThrow("invalid_fact_engine_response");
  });

  it("rejects a threat actor or evidence binding mismatch", async () => {
    await expect(new JsonlFactEngineClient(new FixtureTransport({
      ...validThreatRiskResult(),
      threatActor: 1,
    })).analyzeThreatRisk(validThreatRiskRequest()))
      .rejects.toThrow("threat_actor_mismatch");
    await expect(new JsonlFactEngineClient(new FixtureTransport({
      ...validThreatRiskResult(),
      evidenceIds: ["event-riichi", "event-other"],
    })).analyzeThreatRisk(validThreatRiskRequest()))
      .rejects.toThrow("evidence_ids_mismatch");
  });

  it("resolves only the managed binary below app resources", () => {
    const resolved = resolveManagedFactEngineBinary("C:\\app\\resources");
    expect(resolved).toMatch(
      /resources[\\/]mahjong-facts[\\/]windows-x64[\\/]mahjong-facts\.exe$/,
    );
  });
});
