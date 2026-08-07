import {
  CompletedHandFactResultSchema,
  EngineIdentitySchema,
  FACT_ENGINE_PROTOCOL_VERSION,
  Hand13FactResultSchema,
  ThreatRiskFactResultSchema,
  type CompletedHandFactRequest,
  type CompletedHandFactResult,
  type EngineIdentity,
  type Hand13FactRequest,
  type Hand13FactResult,
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
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

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
      parsed.data.message,
    );
  }
}

function validateBindings(request: BoundRequest, result: BoundResult): void {
  if (result.requestId !== request.requestId) {
    throw new FactEngineClientError(
      "request_id_mismatch",
      `expected ${request.requestId}, received ${result.requestId}`,
    );
  }
  if (result.actionRef !== request.actionRef) {
    throw new FactEngineClientError(
      "action_ref_mismatch",
      `expected ${request.actionRef}, received ${result.actionRef}`,
    );
  }
  if (result.stateHash !== request.stateHash) {
    throw new FactEngineClientError(
      "state_hash_mismatch",
      `expected ${request.stateHash}, received ${result.stateHash}`,
    );
  }
}

export class JsonlFactEngineClient implements MahjongFactEnginePort {
  private identityRequestSequence = 0;

  constructor(
    private readonly transport: FactEngineTransport,
    private readonly timeoutMs = 10_000,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("fact engine timeout must be positive and finite");
    }
  }

  private async requestLine(payload: unknown): Promise<string> {
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
    return parsed.data;
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
