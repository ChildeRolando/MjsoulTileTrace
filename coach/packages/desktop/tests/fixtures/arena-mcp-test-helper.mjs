import { resolve } from "node:path";
import { JsonlFactEngineClient, ManagedFactEngineTransport } from "@riichi-coach/reasoning";
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  Hand13FactResultSchema,
  MAHJONG_HELPER_COMMIT,
} from "@riichi-coach/contracts";

export const testHelperIdentity = Object.freeze({
  engine: "mahjong-helper",
  upstreamCommit: MAHJONG_HELPER_COMMIT,
  adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
  protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
});

export function createArenaMcpTestEngine(options = {}) {
  const calls = [];
  let closed = false;
  const engine = {
    async identity() {
      return testHelperIdentity;
    },
    async analyzeHand13(request) {
      calls.push(request);
      if (options.behavior === "error") {
        throw new Error("helper failed for gameId-CANARY-blind-arena");
      }
      if (options.behavior === "timeout") {
        return await new Promise(() => {});
      }
      return Hand13FactResultSchema.parse({
        kind: "hand13_result",
        requestId: request.requestId,
        protocolVersion: request.protocolVersion,
        actionRef: request.actionRef,
        stateHash: request.stateHash,
        calculationMode: request.calculationMode,
        identity: testHelperIdentity,
        shanten: 2,
        effectiveTile34: [3, 4],
        waitsRemainingStatus: "blocked_missing_facts",
        waitsRemaining: [],
        improves: [],
        doraCountStatus: "blocked_missing_facts",
        doraCount: null,
        estimates: [],
        diagnostics: [],
      });
    },
    async analyzeCompletedHand() {
      throw new Error("unsupported_test_helper_operation");
    },
    async analyzeThreatRisk() {
      throw new Error("unsupported_test_helper_operation");
    },
    async close() {
      closed = true;
      if (options.emitCloseMarker === true) process.stderr.write("ARENA_TEST_HELPER_CLOSED\n");
    },
  };
  return {
    engine,
    calls,
    isClosed: () => closed,
    disposeHelper: () => engine.close(),
  };
}

export function createPackagedArenaMcpTestEngine(options = {}) {
  const transport = new ManagedFactEngineTransport(resolve(process.cwd(), "resources"));
  const client = new JsonlFactEngineClient(
    transport,
  );
  return {
    engine: {
      identity: () => client.identity(),
      analyzeHand13: (request) => client.analyzeHand13(request),
      analyzeCompletedHand: (request) => client.analyzeCompletedHand(request),
      analyzeThreatRisk: (request) => client.analyzeThreatRisk(request),
      async close() {
        await client.close();
        if (options.emitCloseMarker === true) process.stderr.write("ARENA_TEST_HELPER_CLOSED\n");
      },
    },
    async disposeHelper() {
      await transport.close();
      await client.close();
      if (options.emitCloseMarker === true) process.stderr.write("ARENA_TEST_HELPER_CLOSED\n");
    },
  };
}
