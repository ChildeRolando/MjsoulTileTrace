import { createHash } from "node:crypto";
import { FIVE_AXIS_FRAMEWORK, GENERIC_BRIEF_PROMPT, GENERIC_BRIEF_OUTPUT_SCHEMA } from "./blind-discard-arena-five-axis-assets.js";
import {
  ArenaBlindObservationSchema, ArenaDirectAnswerSchema, ArenaDirectSubmissionSchema, ArenaStructuredBriefAnswerSchema,
  ArenaExperimentConfigSchema, ArenaRagResultSchema, TileIdSchema,
  LIBRIICHI_RULE_NORMALIZATION_VERSION,
  type ArenaBlindObservation, type ArenaExperimentConfig,
} from "@riichi-coach/contracts";
import { z } from "zod";
import { ArenaMcpResultSchema } from "./blind-discard-arena-mcp.js";
import { ArenaBasicCalculationsSchema } from "./blind-discard-arena-basic-calculations.js";
import { ArenaHandStructureFactsSchema } from "./blind-discard-arena-hand-structure.js";
import { validateWholeUnitFacts } from "./blind-discard-arena-textbook-unit.js";
import { ArenaDefenseFactsSchema } from "./blind-discard-arena-defense.js";
import { ArenaImprovementFactsSchema } from "./blind-discard-arena-improvement.js";
import type { ArenaProviderMessage, ArenaProviderToolDefinition } from "./blind-discard-arena-provider.js";

export const ARENA_ASSEMBLY_VERSION = "arena-modular-messages/v1";
export const ARENA_HISTORY_ASSEMBLY_VERSION = "arena-modular-messages/v2-visible-history";
export const ARENA_RAW_PROMPT = [
  "Choose one riichi-mahjong discard from the visible position. Return only JSON {\"tile\":\"1m\",\"red\":false}.",
  "Tile codes: 1m..9m man, 1p..9p pin, 1s..9s sou; 1z East, 2z South, 3z West, 4z North, 5z white, 6z green, 7z red dragon. Red fives use 5m/5p/5s and red=true.",
  "Actors and all four-entry arrays use absolute seats 0..3 in turn order; selfActor identifies your seat. Winds are E/S/W/N. concealedTiles excludes currentDraw. Rivers are ordered from earliest to latest; called discards remain in the river with calledByRef. eventOrder orders the referenced river/call/riichi/current-draw events across seats. References link public events, not tile values. Unknown raw fields are null.",
].join("\n");

export function arenaDirectOutputSchema(explanation = false) {
  return {
    type: "object", additionalProperties: false,
    properties: { tile: { type: "string", enum: [...TileIdSchema.options] }, red: { type: "boolean" },
      ...(explanation ? { rationale: { type: "string", minLength: 1, maxLength: 2000 } } : {}) },
    required: explanation ? ["tile", "red", "rationale"] : ["tile", "red"],
  };
}

/** Rebuild from named raw fields. Never serialize facts, completeness, tool text or furiten. */
export function projectArenaRawObservation(raw: ArenaBlindObservation) {
  const observation = ArenaBlindObservationSchema.parse(raw), state = observation.visibleState;
  return {
    selfActor: observation.decision.selfActor, windowKind: observation.decision.windowKind,
    ...(observation.rawVisibleHistory === undefined ? {} : { ruleSet: observation.ruleSet, visibleHistory: observation.rawVisibleHistory }),
    eventOrder: observation.rawEventOrder ?? null,
    roundWind: state.roundWind, hand: state.hand, honba: state.honba, riichiSticks: state.riichiSticks,
    dealer: state.dealer, scores: state.scores, seatWinds: state.seatWinds,
    remainingDraws: state.remainingDraws, doraIndicators: state.doraIndicators,
    rivers: state.rivers.map(river => river.map(row => ({
      sourceRef: row.sourceRef, actor: row.actor, tile: row.tile, discardMode: row.discardMode,
      riichiDeclarationRef: row.riichiDeclarationRef, calledByRef: row.calledByRef,
    }))),
    melds: state.melds.map(meld => {
      const identity = { actor: meld.actor, kind: meld.kind, meldRef: meld.meldRef,
        createdEventRef: meld.createdEventRef, latestEventRef: meld.latestEventRef };
      if (meld.kind === "ankan") return { ...identity, tiles: meld.tiles };
      return { ...identity, targetActor: meld.targetActor, calledTile: meld.calledTile,
        consumedTiles: meld.consumedTiles, calledDiscardEventRef: meld.calledDiscardEventRef,
        ...(meld.kind === "kakan" ? { addedTile: meld.addedTile, upgradedPonEventRef: meld.upgradedPonEventRef } : {}) };
    }),
    riichiStates: state.riichiStates.map(row => ({ actor: row.actor, status: row.status,
      declarationEventRef: row.declarationEventRef, acceptanceEventRef: row.acceptanceEventRef })),
    self: { concealedTiles: state.self.concealedTiles, currentDraw: state.self.currentDraw === null ? null : {
      tile: state.self.currentDraw.tile, sourceRef: state.self.currentDraw.sourceRef, from: state.self.currentDraw.from,
    } },
  };
}

/** Outputs of actual main-owned modules, not a replacement scene classifier. */
export const ArenaScenarioModuleSchema = z.object({
  sourceId: z.string().min(1).max(100), version: z.string().min(1).max(100),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/), requiresHelper: z.boolean(),
  content: z.record(z.unknown()),
}).strict();
export const ArenaMaterialSelectionSchema = z.object({
  sourceId: z.string().min(1).max(100), version: z.string().min(1).max(100),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/), mode: z.enum(["fixed", "scenario"]),
  requiresHelper: z.boolean().optional(),
  query: z.string().min(1).max(400), fixedQuery: z.string().min(1).max(400),
}).strict();

export const arenaContentDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function arenaExperimentPrompt(config: ArenaExperimentConfig, hasVisibleHistory = false) {
  const directPrompt = config.structuredBrief ? ARENA_RAW_PROMPT.replace('Return only JSON {"tile":"1m","red":false}.', "Return only JSON matching the supplied output schema.") : ARENA_RAW_PROMPT;
  return [config.submission === "tool" ? ARENA_RAW_PROMPT.replace('Return only JSON {"tile":"1m","red":false}.', "Use the offered submission protocol.") : directPrompt,
    ...(hasVisibleHistory ? ["visibleHistory contains all current-round events through this decision in order; other players' draws have tile=null. Event references link calls and declarations. Rule fields may be unknown. Ankan tiles describe composition, not physical positions."] : []),
    ...(config.submission === "tool" ? ["Submit using submit_decision with an offered actionRef, observed references, public rationale, alternative and uncertainty."] : []),
    ...(config.comparison ? ["Compare the discard options before choosing."] : []),
    ...(config.fiveAxisFramework ? [FIVE_AXIS_FRAMEWORK.replace(/[\r\n]+$/u, "")] : []),
    ...(config.structuredBrief ? [GENERIC_BRIEF_PROMPT.replace(/[\r\n]+$/u, "")] : []),
    ...(config.explanation && config.submission === "tile-red" ? ["Also include a concise public rationale in the JSON."] : []),
  ].join("\n").replace(/[\r\n]+$/u, "");
}

export function assembleArenaExperiment(input: {
  observation: ArenaBlindObservation; config: ArenaExperimentConfig;
  tools?: readonly ArenaProviderToolDefinition[]; helper?: unknown; basicCalculations?: unknown; handStructureFacts?: unknown; improvementFacts?: unknown; defenseFacts?: unknown; wholeUnitFacts?: unknown; textbookLibrary?: unknown; material?: unknown; materialBaseline?: unknown;
  scenario?: unknown; selection?: unknown;
}) {
  const config = ArenaExperimentConfigSchema.parse(input.config);
  const observation = ArenaBlindObservationSchema.parse(input.observation);
  const tools = structuredClone([...(input.tools ?? [])]);
  const actualTools = tools.map(t => t.function.name).sort();
  if (JSON.stringify(actualTools) !== JSON.stringify([...config.callableTools].sort())) throw new Error("arena_module_tool_mismatch");
  if (config.helperFacts !== (input.helper !== undefined)) throw new Error("arena_module_helper_mismatch");
  if (Boolean(config.basicCalculations) !== (input.basicCalculations !== undefined)) throw new Error("arena_basic_calculations_mismatch");
  const basicCalculations = input.basicCalculations === undefined ? undefined : ArenaBasicCalculationsSchema.parse(structuredClone(input.basicCalculations));
  if (basicCalculations && (basicCalculations.caseRef !== observation.caseRef || JSON.stringify(basicCalculations.candidates.map(row => row.actionRef)) !== JSON.stringify(observation.candidates.map(row => row.actionRef)))) throw new Error("arena_basic_calculations_candidates_mismatch");
  if (Boolean(config.handStructureFacts) !== (input.handStructureFacts !== undefined)) throw new Error("arena_hand_structure_mismatch");
  const handStructureFacts = input.handStructureFacts === undefined ? undefined : ArenaHandStructureFactsSchema.parse(structuredClone(input.handStructureFacts));
  if (handStructureFacts && (handStructureFacts.caseRef !== observation.caseRef || JSON.stringify(handStructureFacts.rows.map(row => row.actionRef)) !== JSON.stringify(observation.candidates.map(row => row.actionRef)))) throw new Error("arena_hand_structure_candidates_mismatch");
  if (Boolean(config.improvementFacts) !== (input.improvementFacts !== undefined)) throw new Error("arena_improvement_mismatch");
  const improvementFacts = input.improvementFacts === undefined ? undefined : ArenaImprovementFactsSchema.parse(structuredClone(input.improvementFacts));
  if (improvementFacts && (improvementFacts.caseRef !== observation.caseRef || JSON.stringify(improvementFacts.rows.map(row => row.actionRef)) !== JSON.stringify(observation.candidates.map(row => row.actionRef)))) throw new Error("arena_improvement_candidates_mismatch");
  if (Boolean(config.defenseFacts) !== (input.defenseFacts !== undefined)) throw new Error("arena_defense_mismatch");
  const defenseFacts = input.defenseFacts === undefined ? undefined : ArenaDefenseFactsSchema.parse(structuredClone(input.defenseFacts));
  if (defenseFacts && (defenseFacts.caseRef !== observation.caseRef || JSON.stringify(defenseFacts.rows.map(row => row.actionRef)) !== JSON.stringify(observation.candidates.map(row => row.actionRef)))) throw new Error("arena_defense_candidates_mismatch");
  if (defenseFacts) {
    const actual = defenseFacts.threats.filter(t => t.kind !== "user_marked_open").map(t => [t.actor, t.kind]);
    const expected = observation.visibleState.riichiStates.filter(t => t.actor !== observation.decision.selfActor && t.status !== "none").map(t => [t.actor, t.status === "accepted" ? "riichi_accepted" : "riichi_declared"]);
    if (JSON.stringify(actual) !== JSON.stringify(expected) || defenseFacts.threats.some(t => t.actor === observation.decision.selfActor)) throw new Error("arena_defense_threat_binding_mismatch");
  }
  if (Boolean(config.wholeUnitFacts) !== (input.wholeUnitFacts !== undefined)) throw new Error("arena_textbook_facts_mismatch");
  if (!config.wholeUnitFacts && input.textbookLibrary !== undefined) throw new Error("arena_textbook_library_unexpected");
  const wholeUnitFacts = input.wholeUnitFacts === undefined ? undefined : validateWholeUnitFacts({ library: input.textbookLibrary, caseRef: observation.caseRef, packet: structuredClone(input.wholeUnitFacts) });
  if ((config.teaching === "on") !== (input.material !== undefined)) throw new Error("arena_module_material_mismatch");
  if (config.teaching === "off" && input.materialBaseline !== undefined) throw new Error("arena_module_material_mismatch");
  const helper = input.helper === undefined ? undefined : ArenaMcpResultSchema.parse(structuredClone(input.helper));
  const material = input.material === undefined ? undefined : ArenaRagResultSchema.parse(input.material);
  if (helper && (helper.caseRef !== observation.caseRef || helper.facts.some(f => f.caseRef !== observation.caseRef || !observation.candidates.some(c => c.actionRef === f.actionRef)))) throw new Error("arena_module_helper_binding_mismatch");
  const raw = projectArenaRawObservation(observation), rawDigest = arenaContentDigest(raw);
  if (config.scenarioHint !== (input.scenario !== undefined)) throw new Error("arena_scenario_source_required");
  const scenario = input.scenario === undefined ? undefined : ArenaScenarioModuleSchema.parse(structuredClone(input.scenario));
  if (scenario && (scenario.requiresHelper && !helper || scenario.inputDigest !== arenaContentDigest(scenario.requiresHelper ? { raw, helper } : raw))) throw new Error("arena_scenario_dependency_mismatch");
  if ((config.teaching === "on") !== (input.selection !== undefined)) throw new Error("arena_material_selection_required");
  const selection = input.selection === undefined ? undefined : ArenaMaterialSelectionSchema.parse(input.selection);
  if (selection && (selection.mode !== config.materialRouting || (selection.requiresHelper && !helper) ||
      selection.inputDigest !== (selection.requiresHelper ? arenaContentDigest({ raw, helper }) : rawDigest) ||
      (selection.mode === "fixed" && (selection.requiresHelper || selection.query !== selection.fixedQuery)))) throw new Error("arena_material_selection_mismatch");
  if (material && (material.caseRef !== observation.caseRef || material.mode !== "local" || material.retrieval.query !== selection!.query)) throw new Error("arena_module_material_binding_mismatch");
  const baseline = input.materialBaseline === undefined ? (selection?.query === selection?.fixedQuery ? material : undefined) : ArenaRagResultSchema.parse(input.materialBaseline);
  if (material && (!baseline || baseline.caseRef !== observation.caseRef || baseline.mode !== "local" || baseline.retrieval.query !== selection!.fixedQuery || baseline.corpusVersion !== material.corpusVersion)) throw new Error("arena_module_material_baseline_required");
  const passageDigest = (result: NonNullable<typeof material>) => arenaContentDigest(result.passages.map(p => ({ title: p.sourceTitle, location: p.documentLocation, content: p.content })));
  const modules = {
    raw,
    ...(config.legalCandidates ? { legalCandidates: observation.candidates } : {}),
    ...(helper ? { helper } : {}),
    ...(basicCalculations ? { basicCalculations } : {}),
    ...(handStructureFacts ? { handStructureFacts } : {}),
    ...(improvementFacts ? { improvementFacts } : {}),
    ...(defenseFacts ? { defenseFacts } : {}),
    ...(wholeUnitFacts ? { wholeUnitFacts } : {}),
    ...(scenario ? { scenarioHint: scenario } : {}),
    ...(material ? { material } : {}),
  };
  const version = observation.rawVisibleHistory === undefined ? ARENA_ASSEMBLY_VERSION : ARENA_HISTORY_ASSEMBLY_VERSION;
  const prompt = arenaExperimentPrompt(config, observation.rawVisibleHistory !== undefined);
  const messages: ArenaProviderMessage[] = [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(modules) }];
  const sources = {
    raw: { sourceId: "arena-visible-observation", version: observation.schemaVersion,
      ...(observation.rawVisibleHistory === undefined ? {} : { projectionVersion: version }) },
    ...(config.legalCandidates ? { legalCandidates: { sourceId: "libriichi-canonical-candidates", version: LIBRIICHI_RULE_NORMALIZATION_VERSION } } : {}),
    ...(helper ? { helper: { sourceId: "arena-mcp", version: helper.schemaVersion, producers: helper.facts.map(f => f.producer) } } : {}),
    ...(basicCalculations ? { basicCalculations: { sourceId: "mahjong-helper-hand13", version: basicCalculations.version, producer: basicCalculations.producer } } : {}),
    ...(handStructureFacts ? { handStructureFacts: { sourceId: "mahjong-hand-structure", version: handStructureFacts.version, producer: handStructureFacts.producer } } : {}),
    ...(wholeUnitFacts ? { wholeUnitFacts: { sourceId: "textbook-whole-unit-index", version: "ceiling-whole-unit-index/v1", indexSha256: wholeUnitFacts.indexSha256, corpusId: wholeUnitFacts.corpusId, ...(wholeUnitFacts.status === "selected" ? { unitId: wholeUnitFacts.unit.id, contentDigest: wholeUnitFacts.unit.contentDigest } : {}) } } : {}),
    ...(defenseFacts ? { defenseFacts: { sourceId: "mahjong-helper-defense", version: defenseFacts.version, producer: defenseFacts.producer } } : {}),
    ...(improvementFacts ? { improvementFacts: { sourceId: "mahjong-helper-hand13-improves", version: improvementFacts.version, producer: improvementFacts.producer } } : {}),
    ...(scenario ? { scenario: { sourceId: scenario.sourceId, version: scenario.version, inputDigest: scenario.inputDigest } } : {}),
    ...(material ? { material: { sourceId: "arena-local-retriever", version: material.retrieverVersion, corpusVersion: material.corpusVersion }, selection } : {}),
    ...((config.fiveAxisFramework || config.structuredBrief) ? { promptExperiment: { sourceId: "arena-five-axis-study", version: "v1", ...(config.fiveAxisFramework ? { frameworkSha256: "29c588517c28ec483b435343eef925caa30715b0c1806bc9f56476f201058cee" } : {}), ...(config.structuredBrief ? { briefPromptSha256: "e0bde17d9ff3f6bd808fc41bd637e0d03bf51ec99410bacec35fe7ab3d412b3a", briefSchemaSha256: "b49c26f6bae80fbcd9a5b4f8bf489488cd54c27f1061dea05d0a6c33b965cdec" } : {}) } } : {}),
    ...((config.comparison || config.explanation) ? { responseInstructions: { sourceId: "arena-experiment-prompt", version } } : {}),
    ...(tools.length ? { tools: { sourceId: "arena-runner-tools", version: "arena-function-call/v1" } } : {}),
  };
  return { version, config, modules, messages, tools, sources,
    outputSchema: config.structuredBrief ? structuredClone(GENERIC_BRIEF_OUTPUT_SCHEMA) : arenaDirectOutputSchema(config.explanation),
    routing: material ? { ...selection,
      passageDigest: passageDigest(material), fixedPassageDigest: passageDigest(baseline!),
      changedFromFixed: passageDigest(material) !== passageDigest(baseline!), fixedMaterial: baseline,
      mechanismTested: passageDigest(material) === passageDigest(baseline!) ? "no_material_change" as const : "material_changed" as const } : null,
    digest: arenaContentDigest({ config, messages, tools, sources }),
  };
}

export function mapArenaDirectAnswer(raw: unknown, observation: ArenaBlindObservation, explanation = false, structuredBrief = false) {
  const schema = structuredBrief ? ArenaStructuredBriefAnswerSchema : explanation ? z.object({ tile: TileIdSchema, red: z.boolean(), rationale: z.string().trim().min(1).max(2000) }).strict() : ArenaDirectAnswerSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !ArenaDirectAnswerSchema.safeParse({ tile: parsed.data.tile, red: parsed.data.red }).success) return { status: "invalid" as const, reason: "schema_invalid" as const };
  const answer = parsed.data;
  // Each canonical candidate already represents the libriichi physical-realization equivalence class.
  const matches = observation.candidates.filter(c => c.tile.id === answer.tile && c.tile.red === answer.red);
  if (matches.length !== 1) return { status: "invalid" as const, reason: "action_not_offered" as const };
  const brief = structuredBrief ? ArenaStructuredBriefAnswerSchema.parse(raw).decisionBrief : undefined;
  const keys = brief?.alternatives.map(alt => `${alt.tile}:${alt.red}`) ?? [];
  const quality = brief === undefined ? undefined : { duplicateAlternatives: keys.length - new Set(keys).size,
    illegalAlternatives: brief.alternatives.filter(alt => !observation.candidates.some(candidate => candidate.tile.id === alt.tile && candidate.tile.red === alt.red)).length,
    claimsGrounding: "not_evaluated" as const };
  return { status: "valid" as const, submission: ArenaDirectSubmissionSchema.parse({ format: "tile-red/v1", caseRef: observation.caseRef,
    actionRef: matches[0]!.actionRef, tile: answer.tile, red: answer.red,
    ...("rationale" in answer ? { rationale: answer.rationale } : {}),
    ...(brief === undefined ? {} : { decisionBrief: brief, decisionBriefQuality: quality }) }) };
}
