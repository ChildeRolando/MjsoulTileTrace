import type {
  CompletedHandFactRequest,
  CompletedHandFactResult,
  EngineIdentity,
  Hand13FactRequest,
  Hand13FactResult,
  HandStructureRequestV2,
  HandStructureResultV2,
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
  analyzeHandStructure?(
    request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2>;
  analyzeCompletedHand(
    request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult>;
  analyzeThreatRisk(
    request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult>;
  close(): Promise<void>;
}

export interface HandStructureFactEnginePort extends MahjongFactEnginePort {
  analyzeHandStructure(
    request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2>;
}
