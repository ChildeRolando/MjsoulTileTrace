import {
  CompletedHandFactResultSchema,
  EngineIdentitySchema,
  FACT_ENGINE_PROTOCOL_VERSION,
  Hand13FactResultSchema,
  HandStructureResultV2Schema,
  ThreatRiskFactResultSchema,
  type CompletedHandFactRequest,
  type CompletedHandFactResult,
  type EngineIdentity,
  type Hand13FactRequest,
  type Hand13FactResult,
  type HandStructureRequestV2,
  type HandStructureResultV2,
  type ThreatRiskFactRequest,
  type ThreatRiskFactResult,
} from "@riichi-coach/contracts";
import { z } from "zod";
import type {
  FactEngineTransport,
  MahjongFactEnginePort,
} from "./port.js";

const FactEngineErrorResultSchema = z.object({
  kind: z.literal("error"),
  requestId: z.string().optional(),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
  code: z.enum([
    "invalid_request",
    "protocol_mismatch",
    "internal_error",
    "unknown_kind",
  ]),
}).strict();

const engineErrorMessages = {
  invalid_request: "fact engine rejected the structured request",
  protocol_mismatch: "fact engine protocol version does not match",
  internal_error: "fact engine failed internally",
  unknown_kind: "fact engine does not support this request kind",
} as const;

const IdentityResultSchema = z.object({
  kind: z.literal("identity_result"),
  requestId: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
  identity: EngineIdentitySchema,
}).strict();

interface BoundRequest {
  requestId: string;
  actionRef: string;
  stateHash: string;
}

interface BoundResult extends BoundRequest {
  identity: EngineIdentity;
}

export class FactEngineClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${code}: ${message}`, options);
    this.name = "FactEngineClientError";
  }
}

function parseJSONResponse(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw new FactEngineClientError(
      "invalid_fact_engine_response",
      "response is not valid JSON",
      { cause: error },
    );
  }
}

function rejectStructuredEngineError(value: unknown): void {
  const parsed = FactEngineErrorResultSchema.safeParse(value);
  if (parsed.success) {
    throw new FactEngineClientError(
      `fact_engine_${parsed.data.code}`,
      engineErrorMessages[parsed.data.code],
    );
  }
}

function validateBindings(request: BoundRequest, result: BoundResult): void {
  if (result.requestId !== request.requestId) {
    throw new FactEngineClientError(
      "request_id_mismatch",
      "fact engine response request ID does not match the bound request",
    );
  }
  if (result.actionRef !== request.actionRef) {
    throw new FactEngineClientError(
      "action_ref_mismatch",
      "fact engine response action reference does not match the bound request",
    );
  }
  if (result.stateHash !== request.stateHash) {
    throw new FactEngineClientError(
      "state_hash_mismatch",
      "fact engine response state hash does not match the bound request",
    );
  }
}

function validateThreatBindings(
  request: ThreatRiskFactRequest,
  result: ThreatRiskFactResult,
): void {
  if (result.threatActor !== request.threatActor) {
    throw new FactEngineClientError(
      "threat_actor_mismatch",
      `expected ${request.threatActor}, received ${result.threatActor}`,
    );
  }
  if (
    result.evidenceIds.length !== request.evidenceIds.length ||
    result.evidenceIds.some((id, index) => id !== request.evidenceIds[index])
  ) {
    throw new FactEngineClientError(
      "evidence_ids_mismatch",
      "threat result evidence IDs do not match the bound request",
    );
  }
}

function rejectHandStructureResultMismatch(): never {
  throw new FactEngineClientError(
    "hand_structure_result_mismatch",
    "hand structure result does not match the bound request",
  );
}

interface ResultShapeGroup {
  kind: string;
  tiles34: number[];
}

function shapeGroupKey(group: ResultShapeGroup): string {
  return JSON.stringify([group.kind, group.tiles34]);
}

function countShapeGroups(
  groups: ResultShapeGroup[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const key = shapeGroupKey(group);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function validateHandStructureBindings(
  request: HandStructureRequestV2,
  result: HandStructureResultV2,
): void {
  const isClosed = request.melds.length === 0;
  for (const family of result.families) {
    const expectedApplicable = family.family === "standard" || isClosed;
    if (
      (family.applicability === "applicable") !== expectedApplicable ||
      (family.shanten !== null) !== expectedApplicable
    ) {
      rejectHandStructureResultMismatch();
    }

    for (const effective of family.effectiveTiles) {
      if (request.visibleCountsComplete) {
        if (
          effective.remainingStatus !== "calculated" ||
          effective.remaining !== request.leftTiles34?.[effective.tile34]
        ) {
          rejectHandStructureResultMismatch();
        }
      } else if (
        effective.remainingStatus !== "blocked_missing_facts" ||
        effective.remaining !== null
      ) {
        rejectHandStructureResultMismatch();
      }
    }
  }

  for (const decomposition of result.decompositions.items) {
    const represented = Array<number>(34).fill(0);
    for (const group of decomposition.groups) {
      for (const tile34 of group.tiles34) {
        represented[tile34] = represented[tile34]! + 1;
      }
    }
    if (represented.some(
      (count, tile34) => count !== request.handTiles34[tile34]!,
    )) {
      rejectHandStructureResultMismatch();
    }
  }

  if (result.decompositions.status === "calculated") {
    if (result.decompositions.totalNonDominated === 0) {
      rejectHandStructureResultMismatch();
    }
    for (const family of result.bestFamilies) {
      if (!result.decompositions.items.some(
        (item) => item.family === family,
      )) {
        rejectHandStructureResultMismatch();
      }
    }
    for (const item of result.decompositions.items) {
      if (
        !result.bestFamilies.includes(item.family) ||
        item.shanten !== result.overallShanten
      ) {
        rejectHandStructureResultMismatch();
      }
    }

    const countsByRef = new Map(
      result.decompositions.items.map((item) => [
        item.decompositionRef,
        countShapeGroups(item.groups),
      ]),
    );
    const invariantCounts = countShapeGroups(
      result.decompositions.invariantClaims,
    );
    for (const [key, occurrenceCount] of invariantCounts) {
      if ([...countsByRef.values()].some(
        (counts) => (counts.get(key) ?? 0) < occurrenceCount,
      )) {
        rejectHandStructureResultMismatch();
      }
    }

    const alternativesByKey = new Map<
      string,
      typeof result.decompositions.alternativeClaims
    >();
    for (const claim of result.decompositions.alternativeClaims) {
      const key = shapeGroupKey(claim);
      const alternatives = alternativesByKey.get(key) ?? [];
      alternatives.push(claim);
      alternativesByKey.set(key, alternatives);
    }
    const allClaimKeys = new Set<string>([
      ...invariantCounts.keys(),
      ...alternativesByKey.keys(),
      ...[...countsByRef.values()].flatMap((counts) => [...counts.keys()]),
    ]);
    for (const key of allClaimKeys) {
      const invariantCount = invariantCounts.get(key) ?? 0;
      if (!result.decompositions.truncated) {
        const minimumReturned = Math.min(
          ...[...countsByRef.values()].map(
            (counts) => counts.get(key) ?? 0,
          ),
        );
        if (invariantCount !== minimumReturned) {
          rejectHandStructureResultMismatch();
        }
      }
      const maximumReturned = Math.max(
        0,
        ...[...countsByRef.values()].map((counts) => counts.get(key) ?? 0),
      );
      const alternatives = alternativesByKey.get(key) ?? [];
      if (alternatives.length !== maximumReturned - invariantCount) {
        rejectHandStructureResultMismatch();
      }
      alternatives.forEach((claim, index) => {
        const occurrence = invariantCount + index + 1;
        const expectedRefs = [...countsByRef.entries()]
          .filter(([, counts]) => (counts.get(key) ?? 0) >= occurrence)
          .map(([ref]) => ref)
          .sort();
        const claimedRefs = [...claim.decompositionRefs].sort();
        if (
          expectedRefs.length !== claimedRefs.length ||
          expectedRefs.some((ref, refIndex) => ref !== claimedRefs[refIndex])
        ) {
          rejectHandStructureResultMismatch();
        }
      });
    }
  }

  const waitByTile = new Map(
    result.waits.map((wait) => [wait.tile34, wait]),
  );
  for (const wait of result.waits) {
    for (const familyName of wait.families) {
      const family = result.families.find(
        (candidate) => candidate.family === familyName,
      );
      const effective = family?.effectiveTiles.find(
        (candidate) => candidate.tile34 === wait.tile34,
      );
      if (
        effective === undefined ||
        wait.remainingStatus !== effective.remainingStatus ||
        wait.remaining !== effective.remaining
      ) {
        rejectHandStructureResultMismatch();
      }
    }
  }
  for (const family of result.families) {
    if (family.shanten !== 0) continue;
    for (const effective of family.effectiveTiles) {
      if (!waitByTile.get(effective.tile34)?.families.includes(family.family)) {
        rejectHandStructureResultMismatch();
      }
    }
  }
}

export class JsonlFactEngineClient implements MahjongFactEnginePort {
  private closePromise: Promise<void> | null = null;
  private identityRequestSequence = 0;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly transport: FactEngineTransport,
    private readonly timeoutMs = 10_000,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("fact engine timeout must be positive and finite");
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async requestLineUnqueued(payload: unknown): Promise<string> {
    const line = JSON.stringify(payload);
    try {
      return await this.transport.request(line, this.timeoutMs);
    } catch (firstError) {
      try {
        await this.transport.restart();
        return await this.transport.request(line, this.timeoutMs);
      } catch (secondError) {
        throw new FactEngineClientError(
          "fact_engine_unavailable",
          "transport failed after one managed restart",
          { cause: secondError ?? firstError },
        );
      }
    }
  }

  private async requestLine(payload: unknown): Promise<string> {
    if (this.closePromise !== null) {
      throw new FactEngineClientError(
        "fact_engine_closed",
        "client is already closing or closed",
      );
    }
    return await this.enqueue(() => this.requestLineUnqueued(payload));
  }

  async identity(): Promise<EngineIdentity> {
    this.identityRequestSequence++;
    const requestId = `identity:${this.identityRequestSequence}`;
    const raw = parseJSONResponse(await this.requestLine({
      kind: "identity",
      requestId,
      protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
    }));
    rejectStructuredEngineError(raw);
    const parsed = IdentityResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new FactEngineClientError(
        "invalid_fact_engine_response",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    if (parsed.data.requestId !== requestId) {
      throw new FactEngineClientError(
        "request_id_mismatch",
        `expected ${requestId}, received ${parsed.data.requestId}`,
      );
    }
    return parsed.data.identity;
  }

  async analyzeHand13(request: Hand13FactRequest): Promise<Hand13FactResult> {
    const raw = parseJSONResponse(await this.requestLine(request));
    rejectStructuredEngineError(raw);
    const parsed = Hand13FactResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new FactEngineClientError(
        "invalid_fact_engine_response",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    validateBindings(request, parsed.data);
    return parsed.data;
  }

  async analyzeHandStructure(
    request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    const raw = parseJSONResponse(await this.requestLine(request));
    rejectStructuredEngineError(raw);
    const parsed = HandStructureResultV2Schema.safeParse(raw);
    if (!parsed.success) {
      throw new FactEngineClientError(
        "invalid_fact_engine_response",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    validateBindings(request, parsed.data);
    validateHandStructureBindings(request, parsed.data);
    return parsed.data;
  }

  async analyzeCompletedHand(
    request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult> {
    const raw = parseJSONResponse(await this.requestLine(request));
    rejectStructuredEngineError(raw);
    const parsed = CompletedHandFactResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new FactEngineClientError(
        "invalid_fact_engine_response",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    validateBindings(request, parsed.data);
    return parsed.data;
  }

  async analyzeThreatRisk(
    request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult> {
    const raw = parseJSONResponse(await this.requestLine(request));
    rejectStructuredEngineError(raw);
    const parsed = ThreatRiskFactResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new FactEngineClientError(
        "invalid_fact_engine_response",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      );
    }
    validateBindings(request, parsed.data);
    validateThreatBindings(request, parsed.data);
    return parsed.data;
  }

  async close(): Promise<void> {
    if (this.closePromise === null) {
      this.closePromise = this.enqueue(() => this.transport.close());
    }
    await this.closePromise;
  }
}
