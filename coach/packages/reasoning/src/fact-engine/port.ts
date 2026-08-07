import type {
  CompletedHandFactRequest,
  CompletedHandFactResult,
  EngineIdentity,
  Hand13FactRequest,
  Hand13FactResult,
  ThreatRiskFactRequest,
  ThreatRiskFactResult,
} from "@riichi-coach/contracts";

export interface FactEngineTransport {
  request(line: string, timeoutMs: number): Promise<string>;
  restart(): Promise<void>;
  close(): Promise<void>;
}

export interface MahjongFactEnginePort {
  identity(): Promise<EngineIdentity>;
  analyzeHand13(request: Hand13FactRequest): Promise<Hand13FactResult>;
  analyzeCompletedHand(
    request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult>;
  analyzeThreatRisk(
    request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult>;
  close(): Promise<void>;
}
