import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import { queryCanonicalLibriichiRules } from "@riichi-coach/reasoning";
import { createGoldenFixture } from "../dist/electron-mvp-golden-fixture.js";

const bundleRoot = fileURLToPath(
  new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url),
);
const frozenFixtureUrl = new URL(
  "./fixtures/native-rule-responses-actor3.json",
  import.meta.url,
);
const mapperV8CanonicalSHA256 =
  "184524628be548d90dc04d7bba482dd40bdf58d2e1a5c4cbbd7951de617dd095";

type FrozenQuery = {
  decisionId: string;
  surface: "self" | "response";
  request: Record<string, unknown>;
};
type FrozenFixture = {
  provenance: {
    canonicalSHA256: string;
    selfActor: number;
    eventCount: number;
    selfDecisions: number;
    responseBoundaries: number;
  };
  queries: FrozenQuery[];
};

function differingPaths(expected: unknown, actual: unknown, path = ""): string[] {
  if (isDeepStrictEqual(expected, actual)) return [];
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const result: string[] = [];
    if (expected.length !== actual.length) result.push(`${path}[length]`);
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index++) {
      result.push(...differingPaths(expected[index], actual[index], `${path}[${index}]`));
    }
    return result;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return keys.flatMap((key) => differingPaths(
      left[key],
      right[key],
      path === "" ? key : `${path}.${key}`,
    ));
  }
  return [path || "$"];
}

describe("Electron MVP Golden native rule request binding", () => {
  it("binds all frozen requests to the sanitized source under the current mapper", async () => {
    const frozen = JSON.parse(
      readFileSync(frozenFixtureUrl, "utf8"),
    ) as FrozenFixture;
    expect(frozen.provenance.selfActor).toBe(3);
    expect(frozen.provenance.eventCount).toBe(26);
    expect(frozen.provenance.selfDecisions).toBe(3);
    expect(frozen.provenance.responseBoundaries).toBe(9);
    expect(frozen.provenance.canonicalSHA256).toBe(mapperV8CanonicalSHA256);
    expect(frozen.queries).toHaveLength(12);

    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const golden = createGoldenFixture(bundle);
    const mapped = golden.analysis.analyzeRecord({
      recordId: golden.fixture.recordId,
      selfActor: 3,
      recordBytes: golden.recordBytes,
      ruleEvidence: golden.fixture.ruleEvidence,
    });
    expect(mapped.status).toBe("analysis_ready");
    if (mapped.status !== "analysis_ready") return;
    expect(mapped.stream.mapperVersion).toBe("mahjong-soul-record-mapper/v8");
    expect(mapped.stream.events).toHaveLength(frozen.provenance.eventCount);

    const frozenByDecisionId = new Map(
      frozen.queries.map((query) => [query.decisionId, query]),
    );
    expect(frozenByDecisionId.size).toBe(frozen.queries.length);
    const runtime = golden.createRuntime(mapped.decisions);
    const mismatches: Array<{
      decisionId: string;
      paths: string[];
      frozenCanonicalStreamIdentity?: string;
      actualCanonicalStreamIdentity?: string;
    }> = [];
    const actualCanonicalIdentities = new Set<string>();
    const result = await queryCanonicalLibriichiRules({
      stream: mapped.stream,
      identity: runtime.ruleIdentity,
      port: {
        queryRules: async (request) => {
          const frozenQuery = frozenByDecisionId.get(request.decision.decisionId);
          if (!frozenQuery) {
            mismatches.push({ decisionId: request.decision.decisionId, paths: ["<missing-frozen-query>"] });
          } else {
            const { requestId: _requestId, identity: _identity, ...boundRequest } = request;
            const paths = differingPaths(frozenQuery.request, boundRequest);
            if (paths.length > 0) mismatches.push({
              decisionId: frozenQuery.decisionId,
              paths,
              frozenCanonicalStreamIdentity: String(frozenQuery.request.canonicalStreamIdentity),
              actualCanonicalStreamIdentity: request.canonicalStreamIdentity,
            });
          }
          actualCanonicalIdentities.add(request.canonicalStreamIdentity);
          return runtime.queryRules(request);
        },
      },
    });

    expect(result.decisions).toHaveLength(frozen.provenance.selfDecisions);
    expect(result.responseDecisions).toHaveLength(frozen.provenance.responseBoundaries);
    expect(result.rules.size).toBe(frozen.queries.length);
    const errors = [...result.rules.values()].filter((entry) => entry.response.status === "error");
    const errorCodes = errors.map((entry) => entry.response.status === "error" ? entry.response.code : "");
    expect({ mismatches, runtimeErrorCount: errors.length, errorCodes }).toEqual({
      mismatches: [],
      runtimeErrorCount: 0,
      errorCodes: [],
    });
    expect([...actualCanonicalIdentities]).toEqual([
      `sha256:${mapperV8CanonicalSHA256}`,
    ]);
    const selfActionCounts = result.decisions.map((decision) => {
      const entry = result.rules.get(decision.decisionEventRef);
      expect(entry?.response.status).toBe("ok");
      return entry?.response.status === "ok" ? entry.actions.length : 0;
    });
    expect(selfActionCounts).toEqual([13, 13, 12]);
    const responseStatuses = result.responseDecisions.map((decision) =>
      result.rules.get(decision.decisionEventRef)?.response.status,
    );
    expect(responseStatuses.filter((status) => status === "ok")).toHaveLength(1);
    expect(responseStatuses.filter((status) => status === "non_action")).toHaveLength(8);
    expect(responseStatuses.filter((status) => status === "error")).toHaveLength(0);
  });
});
