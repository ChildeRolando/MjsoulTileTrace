import { ActionRefSchema, ArenaCaseRefSchema, ArenaToolBindingSchema, EngineIdentitySchema, type ArenaToolBinding, type KnownGameFacts } from "@riichi-coach/contracts";
import { projectCandidate, validateHandStructureResult, type HandStructureFactEnginePort } from "@riichi-coach/reasoning";
import { z } from "zod";
import { prepareArenaMcpHand13Request } from "./blind-discard-arena-mcp.js";

const FAMILY = z.enum(["standard", "chiitoitsu", "kokushi"]);
const GROUP = z.enum(["sequence", "triplet", "pair_candidate", "ryanmen_taatsu", "kanchan_taatsu", "penchan_taatsu", "floating"]);
const TILES = z.array(z.number().int().min(0).max(33)).min(1).max(3);
const GROUP_VALUE = z.tuple([GROUP, TILES]);
const ALT = z.tuple([GROUP, TILES, z.array(z.number().int().min(0).max(63)).min(1).max(64)]);
const FAMILY_VALUE = z.tuple([z.enum(["applicable", "not_applicable_open_hand"]), z.number().int().min(-1).max(13).nullable()]);
const AVAILABLE = z.tuple([z.literal("ok"), z.tuple([FAMILY_VALUE, FAMILY_VALUE, FAMILY_VALUE]), z.literal("calculated"), z.number().int().nonnegative(), z.boolean(), z.array(FAMILY).max(64), z.array(GROUP_VALUE), z.array(ALT)]);
const ROW = z.union([AVAILABLE, z.tuple([z.literal("unavailable")]), z.tuple([z.literal("error")])]);
export const ARENA_HAND_STRUCTURE_SEMANTICS = "Rows follow candidateRefs order. An ok row is [status,families,decompositionStatus,total,truncated,returnedFamilies,invariants,alternatives]. Families are [applicability,shanten] in order standard, chiitoitsu, kokushi; null means not applicable, including any own meld. Tile34 indices 0-8 are 1m-9m, 9-17 are 1p-9p, 18-26 are 1s-9s, 27-33 are 1z-7z; tile34 does not distinguish red fives. Returned decompositions use local indices 0 onward in returnedFamilies order. Groups are [kind,tile34s]; alternatives are [kind,tile34s,indices]. A returned decomposition consists of all invariants plus alternatives containing its index; repeated groups are distinct occurrences. Alternatives need not coexist unless they share an index. Invariants hold across all non-dominated minimum-shanten family decompositions. If truncated, omitted decompositions and their alternatives are not represented. Unavailable and error rows have no calculated values.";
export const ArenaHandStructureFactsSchema = z.object({
  version: z.literal("arena-hand-structure-facts/v1"), caseRef: ArenaCaseRefSchema,
  semantics: z.literal(ARENA_HAND_STRUCTURE_SEMANTICS), producer: EngineIdentitySchema.nullable(),
  candidateRefs: z.array(ActionRefSchema).min(2).max(14), rows: z.array(ROW).min(2).max(14),
}).strict().superRefine((packet, context) => {
  const fail = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (packet.rows.length !== packet.candidateRefs.length || new Set(packet.candidateRefs).size !== packet.candidateRefs.length) fail("arena_structure_candidate_count_invalid");
  if (packet.producer === null && packet.rows.some(row => row[0] === "ok")) fail("arena_structure_identity_missing");
  for (const row of packet.rows) if (row[0] === "ok") {
    const [, families, , total, truncated, returnedFamilies, , alternatives] = row;
    if (families.some(([a, n]) => (a === "applicable") !== (n !== null)) || families[0][0] !== "applicable") fail("arena_structure_family_invalid");
    if (total < returnedFamilies.length || truncated !== (total > returnedFamilies.length) || total === 0 || returnedFamilies.length === 0) fail("arena_structure_decomposition_invalid");
    const minimum = Math.min(...families.flatMap(f => f[1] === null ? [] : [f[1]]));
    for (const family of returnedFamilies) if (families[["standard", "chiitoitsu", "kokushi"].indexOf(family)]![1] !== minimum) fail("arena_structure_decomposition_family_invalid");
    for (const [, , indices] of alternatives) if (new Set(indices).size !== indices.length || indices.some(i => i >= returnedFamilies.length)) fail("arena_structure_alternative_ref_invalid");
  }
});

/** Encode one already validated engine result without changing group multiplicity. */
export function mapArenaHandStructureResult(hand: ReturnType<typeof validateHandStructureResult>) {
  const d = hand.decompositions, refsToIndex = new Map(d.items.map((item, i) => [item.decompositionRef, i]));
  const families = hand.families.map(f => [f.applicability, f.shanten]);
  const invariants = d.invariantClaims.map(g => [g.kind, g.tiles34]);
  const alternatives = d.alternativeClaims.map(g => [g.kind, g.tiles34, g.decompositionRefs.map(ref => { const i = refsToIndex.get(ref); if (i === undefined) throw new Error("unknown_decomposition_ref"); return i; })]);
  return AVAILABLE.parse(["ok", families, d.status, d.totalNonDominated, d.truncated, d.items.map(item => item.family), invariants, alternatives]);
}

export async function calculateArenaHandStructureFacts(input: { binding: ArenaToolBinding; facts: KnownGameFacts; actionRefs: readonly string[]; engine: HandStructureFactEnginePort; signal?: AbortSignal }) {
  const binding = ArenaToolBindingSchema.parse(input.binding), refs = input.actionRefs.map(ref => ActionRefSchema.parse(ref));
  if (JSON.stringify(refs) !== JSON.stringify(binding.candidates.map(c => c.actionRef))) throw new Error("arena_structure_candidate_binding_mismatch");
  prepareArenaMcpHand13Request({ authorizedCase: { binding, facts: input.facts }, actionRef: refs[0]! });
  let identity: z.infer<typeof EngineIdentitySchema> | null = null;
  try { identity = EngineIdentitySchema.parse(await input.engine.identity()); } catch { /* each candidate remains error */ }
  const rows: z.infer<typeof ROW>[] = [];
  for (const candidate of binding.candidates) {
    if (input.signal?.aborted) throw new Error("arena_structure_cancelled");
    if (!identity) { rows.push(["error"]); continue; }
    try {
      if (!prepareArenaMcpHand13Request({ authorizedCase: { binding, facts: input.facts }, actionRef: candidate.actionRef })) { rows.push(["unavailable"]); continue; }
      const projection = projectCandidate({ actionRef: candidate.actionRef, action: candidate.action, origins: ["model"] }, input.facts);
      if (projection.status !== "ready" || !projection.handStructureRequest) { rows.push(["unavailable"]); continue; }
      const hand = validateHandStructureResult(projection.handStructureRequest, await input.engine.analyzeHandStructure(projection.handStructureRequest));
      if (JSON.stringify(hand.identity) !== JSON.stringify(identity)) throw new Error("identity_mismatch");
      rows.push(mapArenaHandStructureResult(hand));
    } catch { rows.push(["error"]); }
  }
  return ArenaHandStructureFactsSchema.parse({ version: "arena-hand-structure-facts/v1", caseRef: binding.caseRef, semantics: ARENA_HAND_STRUCTURE_SEMANTICS, producer: identity, candidateRefs: refs, rows });
}
