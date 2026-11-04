import { ActionRefSchema, ArenaCaseRefSchema, ArenaToolBindingSchema, EngineIdentitySchema, type ArenaToolBinding, type KnownGameFacts } from "@riichi-coach/contracts";
import { validateHand13Result, type MahjongFactEnginePort } from "@riichi-coach/reasoning";
import { z } from "zod";
import { prepareArenaMcpHand13Request } from "./blind-discard-arena-mcp.js";

const Tile = z.number().int().min(0).max(33), Count = z.number().int().min(0).max(4);
const WaitSet = z.array(z.tuple([Tile, Count]));
const WaitKey = z.string().regex(/^(0|[1-9][0-9]*)$/);
const Row = z.discriminatedUnion("status", [
  z.object({ actionRef: ActionRefSchema, status: z.literal("available"), improves: z.array(z.tuple([Tile, Count, WaitKey])) }).strict(),
  z.object({ actionRef: ActionRefSchema, status: z.literal("unavailable"), reason: z.enum(["missing_visibility", "self_riichi", "unknown_riichi", "projection"]) }).strict(),
  z.object({ actionRef: ActionRefSchema, status: z.literal("error") }).strict(),
]);
export const ARENA_IMPROVEMENT_SEMANTICS = "Each row binds actionRef to status. For available rows, improves entries are [drawTile34,drawUnseen,waitSetKey]; waitSets is a case-local dictionary with explicit numbered string keys. Each value is an ordered array of [tile34,count] pairs, including zeros and repeated entries. Identical arrays share the key assigned on first occurrence. Tile34 indices 0-8 are 1m-9m, 9-17 1p-9p, 18-26 1s-9s, 27-33 1z-7z; red fives share their tile type. Standard hand13 uses ordinary and applicable seven-pairs shanten, not kokushi. With complete visible counts, a non-advancing draw with unseen copies is listed when an unspecified subsequent discard preserves shanten and yields a strictly larger unseen effective count; the referenced set is one result maximizing that count. It is not a future-discard witness or a complete set of ties, a live-wall count, probability, expected return, or recommendation. Own riichi and unknown riichi are unavailable; other unavailable and error rows have no numeric values, and unknown is not zero.";
export const ArenaImprovementFactsSchema = z.object({
  version: z.literal("arena-improvement-facts/v1"), caseRef: ArenaCaseRefSchema,
  semantics: z.literal(ARENA_IMPROVEMENT_SEMANTICS), producer: EngineIdentitySchema.nullable(),
  waitSets: z.record(WaitKey, WaitSet), rows: z.array(Row).min(2).max(14),
}).strict().superRefine((packet, context) => {
  const fail = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (new Set(packet.rows.map(row => row.actionRef)).size !== packet.rows.length) fail("arena_improvement_duplicate_candidate");
  if (packet.producer === null && packet.rows.some(row => row.status === "available")) fail("arena_improvement_identity_missing");
  const keys = Object.values(packet.waitSets).map(set => JSON.stringify(set));
  if (new Set(keys).size !== keys.length) fail("arena_improvement_duplicate_wait_set");
  const seen = new Set<string>();
  for (const row of packet.rows) if (row.status === "available") for (const [, , index] of row.improves) {
    if (!Object.hasOwn(packet.waitSets, index)) { fail("arena_improvement_wait_set_reference_invalid"); continue; }
    if (!seen.has(index)) { if (index !== String(seen.size)) fail("arena_improvement_wait_set_order_invalid"); seen.add(index); }
  }
  if (seen.size !== keys.length) fail("arena_improvement_unused_wait_set");
});

export async function calculateArenaImprovementFacts(input: { binding: ArenaToolBinding; facts: KnownGameFacts; actionRefs: readonly string[]; engine: MahjongFactEnginePort; signal?: AbortSignal }) {
  const binding = ArenaToolBindingSchema.parse(input.binding), refs = input.actionRefs.map(ref => ActionRefSchema.parse(ref));
  if (JSON.stringify(refs) !== JSON.stringify(binding.candidates.map(c => c.actionRef))) throw new Error("arena_improvement_candidate_binding_mismatch");
  prepareArenaMcpHand13Request({ authorizedCase: { binding, facts: input.facts }, actionRef: refs[0]! });
  let identity: z.infer<typeof EngineIdentitySchema> | null = null;
  try { identity = EngineIdentitySchema.parse(await input.engine.identity()); } catch { /* preserved as error rows */ }
  const rows: z.infer<typeof Row>[] = [], waitSets: Record<string, z.infer<typeof WaitSet>> = {}, indices = new Map<string, string>();
  for (const candidate of binding.candidates) {
    if (input.signal?.aborted) throw new Error("arena_improvement_cancelled");
    const actionRef = candidate.actionRef;
    try {
      const projected = prepareArenaMcpHand13Request({ authorizedCase: { binding, facts: input.facts }, actionRef });
      if (!projected) { rows.push({ actionRef, status: "unavailable", reason: "projection" }); continue; }
      if (input.facts.selfRiichi || binding.decisionSnapshot.publicState.riichiStates[input.facts.actor]!.status !== "none") { rows.push({ actionRef, status: "unavailable", reason: "self_riichi" }); continue; }
      if (input.facts.handStructureYakuContext?.riichiStatus !== "inactive") { rows.push({ actionRef, status: "unavailable", reason: "unknown_riichi" }); continue; }
      if (!projected.visibleCountsComplete || projected.leftTiles34 === null) { rows.push({ actionRef, status: "unavailable", reason: "missing_visibility" }); continue; }
      if (!identity) { rows.push({ actionRef, status: "error" }); continue; }
      const { calculationMode: _mode, ...request } = projected;
      const result = validateHand13Result(request, await input.engine.analyzeHand13(request));
      if (JSON.stringify(result.identity) !== JSON.stringify(identity)) throw new Error("identity_mismatch");
      const improves: Array<[number, number, string]> = [], staged = new Map<string, { index: string; value: z.infer<typeof WaitSet> }>();
      for (const item of result.improves) {
        const waitSet = WaitSet.parse(item.bestWaits.map(x => [x.tile34, x.count]));
        const key = JSON.stringify(waitSet); let index = indices.get(key) ?? staged.get(key)?.index;
        if (index === undefined) { index = String(indices.size + staged.size); staged.set(key, { index, value: waitSet }); }
        improves.push([item.drawTile34, request.leftTiles34![item.drawTile34]!, index]);
      }
      const row = Row.parse({ actionRef, status: "available", improves });
      for (const [key, value] of staged) { indices.set(key, value.index); waitSets[value.index] = value.value; }
      rows.push(row);
    } catch { rows.push({ actionRef, status: "error" }); }
  }
  return ArenaImprovementFactsSchema.parse({ version: "arena-improvement-facts/v1", caseRef: binding.caseRef, semantics: ARENA_IMPROVEMENT_SEMANTICS, producer: identity, waitSets, rows });
}
