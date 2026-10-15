import type { Hand13FactRequest } from "@riichi-coach/contracts";
import type { MahjongFactEnginePort } from "@riichi-coach/reasoning";

export const testHelperIdentity: Readonly<{
  engine: "mahjong-helper";
  upstreamCommit: string;
  adapterVersion: string;
  protocolVersion: string;
}>;

export function createArenaMcpTestEngine(options?: {
  behavior?: "normal" | "error" | "timeout" | "ukeire-edge";
  emitCloseMarker?: boolean;
}): {
  engine: MahjongFactEnginePort;
  calls: Hand13FactRequest[];
  isClosed: () => boolean;
  disposeHelper: () => Promise<void>;
};

export function createPackagedArenaMcpTestEngine(options?: {
  emitCloseMarker?: boolean;
}): {
  engine: MahjongFactEnginePort;
  disposeHelper: () => Promise<void>;
};
