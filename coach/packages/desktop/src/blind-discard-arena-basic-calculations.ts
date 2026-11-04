import { ActionRefSchema, ArenaCaseRefSchema, EngineIdentitySchema, TileIdSchema, type ArenaToolBinding, type KnownGameFacts } from "@riichi-coach/contracts";
import { validateHand13Result, type MahjongFactEnginePort } from "@riichi-coach/reasoning";
import { z } from "zod";
import { prepareArenaMcpHand13Request } from "./blind-discard-arena-mcp.js";

const TileEntry = z.object({ tile: TileIdSchema, unseen: z.number().int().min(0).max(4).nullable() }).strict();
const SEMANTICS = "Unseen copies include tiles in unknown locations; they are not live-wall counts or win probabilities. Null means unavailable, not zero.";
const Row = z.discriminatedUnion("status", [
  z.object({ actionRef: ActionRefSchema, status: z.literal("available"), shanten: z.number().int(), effectiveTiles: z.array(TileEntry).max(34), unseenTotal: z.number().int().nonnegative().nullable(), doraCount: z.number().int().nonnegative().nullable() }).strict(),
  z.object({ actionRef: ActionRefSchema, status: z.enum(["unavailable", "error"]) }).strict(),
]);
export const ArenaBasicCalculationsSchema = z.object({
  version: z.literal("arena-basic-calculations/v1"),
  caseRef: ArenaCaseRefSchema,
  semantics: z.literal(SEMANTICS),
  producer: EngineIdentitySchema.nullable(),
  candidates: z.array(Row).min(1).max(14),
}).strict();

export async function calculateArenaBasicFacts(input: { binding: ArenaToolBinding; facts: KnownGameFacts; actionRefs: readonly string[]; engine: MahjongFactEnginePort; signal?: AbortSignal }) {
  const rows: z.infer<typeof Row>[] = [];
  let identity: z.infer<typeof EngineIdentitySchema> | null = null;
  try { identity = EngineIdentitySchema.parse(await input.engine.identity()); } catch { /* represented on each row */ }
  for (const rawRef of input.actionRefs) {
    if (input.signal?.aborted) throw new Error("arena_basic_calculations_cancelled");
    const actionRef = ActionRefSchema.parse(rawRef);
    if (!identity) { rows.push({ actionRef, status: "error" }); continue; }
    try {
      const projected = prepareArenaMcpHand13Request({ authorizedCase: { binding: input.binding, facts: input.facts }, actionRef });
      if (!projected) { rows.push({ actionRef, status: "unavailable" }); continue; }
      const { calculationMode: _mode, ...fullRequest } = projected;
      const request = fullRequest;
      const result = validateHand13Result(request, await input.engine.analyzeHand13(request));
      if (JSON.stringify(result.identity) !== JSON.stringify(identity)) throw new Error("identity_mismatch");
      const counts = new Map(result.waitsRemaining.map(row => [row.tile34, row.count]));
      if (result.waitsRemainingStatus === "calculated" && (counts.size !== result.effectiveTile34.length || result.effectiveTile34.some(tile => !counts.has(tile)))) throw new Error("incomplete_counts");
      const effectiveTiles = result.effectiveTile34.map(tile => ({ tile: TileIdSchema.options[tile]!, unseen: result.waitsRemainingStatus === "calculated" ? counts.get(tile)! : null }));
      rows.push({ actionRef, status: "available", shanten: result.shanten, effectiveTiles,
        unseenTotal: result.waitsRemainingStatus === "calculated" ? result.waitsRemaining.reduce((sum, row) => sum + row.count, 0) : null,
        doraCount: result.doraCountStatus === "calculated" ? result.doraCount : null });
    } catch { rows.push({ actionRef, status: "error" }); }
  }
  return ArenaBasicCalculationsSchema.parse({ version: "arena-basic-calculations/v1", caseRef: input.binding.caseRef, semantics: SEMANTICS, producer: identity, candidates: rows });
}
