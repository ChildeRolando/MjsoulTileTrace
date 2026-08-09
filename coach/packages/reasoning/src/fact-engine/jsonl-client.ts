import {
  EngineIdentitySchema,
  FACT_ENGINE_PROTOCOL_VERSION,
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
import {
  HandStructureResultValidationError,
  validateCompletedHandResult,
  validateHand13Result,
  validateHandStructureResult,
  validateThreatRiskResult,
} from "./hand-structure-validator.js";

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

function translateValidationError<T>(validate: () => T): T {
  try {
    return validate();
  } catch (error) {
    if (error instanceof HandStructureResultValidationError) {
      throw new FactEngineClientError(error.code, error.message, {
        cause: error,
      });
    }
    throw error;
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
    return translateValidationError(() => validateHand13Result(request, raw));
  }

  async analyzeHandStructure(
    request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    const raw = parseJSONResponse(await this.requestLine(request));
    rejectStructuredEngineError(raw);
    return translateValidationError(() =>
      validateHandStructureResult(request, raw)
    );
  }

  async analyzeCompletedHand(
    request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult> {
    const raw = parseJSONResponse(await this.requestLine(request));
    rejectStructuredEngineError(raw);
    return translateValidationError(() =>
      validateCompletedHandResult(request, raw)
    );
  }

  async analyzeThreatRisk(
    request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult> {
    const raw = parseJSONResponse(await this.requestLine(request));
    rejectStructuredEngineError(raw);
    return translateValidationError(() => validateThreatRiskResult(request, raw));
  }

  async close(): Promise<void> {
    if (this.closePromise === null) {
      this.closePromise = this.enqueue(() => this.transport.close());
    }
    await this.closePromise;
  }
}
