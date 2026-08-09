import type { SceneSnapshot } from "@riichi-coach/contracts";

export type RiichiThreat = {
  actor: number;
  declarationEventId: string;
  ippatsuAlive: boolean | null;
};

export function riichiThreats(scene: SceneSnapshot): RiichiThreat[] {
  return scene.threats.flatMap((threat) =>
    threat.riichi && threat.declarationEventId
      ? [{
          actor: threat.actor,
          declarationEventId: threat.declarationEventId,
          ippatsuAlive: threat.ippatsuAlive,
        }]
      : []
  );
}
