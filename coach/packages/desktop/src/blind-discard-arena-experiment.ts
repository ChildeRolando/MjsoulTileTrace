import { createHash } from "node:crypto";
import {
  ArenaBlindObservationSchema, ArenaDirectAnswerSchema, ArenaDirectSubmissionSchema,
  ArenaExperimentConfigSchema, ArenaRagResultSchema, TileIdSchema,
  type ArenaBlindObservation, type ArenaExperimentConfig,
} from "@riichi-coach/contracts";
import { z } from "zod";
import { ArenaMcpResultSchema } from "./blind-discard-arena-mcp.js";
import type { ArenaProviderMessage, ArenaProviderToolDefinition } from "./blind-discard-arena-provider.js";

export const ARENA_ASSEMBLY_VERSION = "arena-modular-messages/v1";
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

export function arenaMaterialQuery(config: ArenaExperimentConfig, observation: ArenaBlindObservation) {
  // Routing uses only observed calls/riichi; it never consults helper or labels.
  const scenario = observation.visibleState.melds.length > 0 || observation.visibleState.riichiStates.some(r => r.status !== "none") ? "public_calls_or_riichi" : "no_calls_or_riichi";
  return { scenario, query: config.materialRouting === "fixed" || scenario === "no_calls_or_riichi" ? "进张计数" : "复合牌形" };
}

export const arenaContentDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function arenaExperimentPrompt(config: ArenaExperimentConfig) {
  return [config.submission === "tool" ? ARENA_RAW_PROMPT.replace('Return only JSON {"tile":"1m","red":false}.', "Use the offered submission protocol.") : ARENA_RAW_PROMPT,
    ...(config.submission === "tool" ? ["Submit using submit_decision with an offered actionRef, observed references, public rationale, alternative and uncertainty."] : []),
    ...(config.comparison ? ["Compare the discard options before choosing."] : []),
    ...(config.explanation && config.submission === "tile-red" ? ["Also include a concise public rationale in the JSON."] : []),
  ].join("\n");
}

export function assembleArenaExperiment(input: {
  observation: ArenaBlindObservation; config: ArenaExperimentConfig;
  tools?: readonly ArenaProviderToolDefinition[]; helper?: unknown; material?: unknown; materialBaseline?: unknown;
}) {
  const config = ArenaExperimentConfigSchema.parse(input.config);
  const observation = ArenaBlindObservationSchema.parse(input.observation);
  const tools = [...(input.tools ?? [])];
  const actualTools = tools.map(t => t.function.name).sort();
  if (JSON.stringify(actualTools) !== JSON.stringify([...config.callableTools].sort())) throw new Error("arena_module_tool_mismatch");
  if (config.helperFacts !== (input.helper !== undefined)) throw new Error("arena_module_helper_mismatch");
  if ((config.teaching === "on") !== (input.material !== undefined)) throw new Error("arena_module_material_mismatch");
  if (config.teaching === "off" && input.materialBaseline !== undefined) throw new Error("arena_module_material_mismatch");
  const helper = input.helper === undefined ? undefined : ArenaMcpResultSchema.parse(input.helper);
  const material = input.material === undefined ? undefined : ArenaRagResultSchema.parse(input.material);
  if (helper && (helper.caseRef !== observation.caseRef || helper.facts.some(f => f.caseRef !== observation.caseRef || !observation.candidates.some(c => c.actionRef === f.actionRef)))) throw new Error("arena_module_helper_binding_mismatch");
  const route = arenaMaterialQuery(config, observation);
  if (material && (material.caseRef !== observation.caseRef || material.mode !== "local" || material.retrieval.query !== route.query)) throw new Error("arena_module_material_binding_mismatch");
  const baseline = input.materialBaseline === undefined ? (route.query === "进张计数" ? material : undefined) : ArenaRagResultSchema.parse(input.materialBaseline);
  if (material && (!baseline || baseline.caseRef !== observation.caseRef || baseline.mode !== "local" || baseline.retrieval.query !== "进张计数" || baseline.corpusVersion !== material.corpusVersion)) throw new Error("arena_module_material_baseline_required");
  const passageDigest = (result: NonNullable<typeof material>) => arenaContentDigest(result.passages.map(p => ({ title: p.sourceTitle, location: p.documentLocation, content: p.content })));
  const modules = {
    raw: projectArenaRawObservation(observation),
    ...(config.legalCandidates ? { legalCandidates: observation.candidates } : {}),
    ...(helper ? { helper } : {}),
    ...(config.scenarioHint ? { scenarioHint: route.scenario } : {}),
    ...(material ? { material } : {}),
  };
  const prompt = arenaExperimentPrompt(config);
  const messages: ArenaProviderMessage[] = [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(modules) }];
  return { version: ARENA_ASSEMBLY_VERSION, config, modules, messages, tools,
    outputSchema: arenaDirectOutputSchema(config.explanation),
    routing: material ? { mode: config.materialRouting, query: route.query,
      passageDigest: passageDigest(material), fixedPassageDigest: passageDigest(baseline!),
      changedFromFixed: passageDigest(material) !== passageDigest(baseline!), fixedMaterial: baseline,
      mechanismTested: passageDigest(material) === passageDigest(baseline!) ? "no_material_change" as const : "material_changed" as const } : null,
    digest: arenaContentDigest({ config, messages, tools }),
  };
}

export function mapArenaDirectAnswer(raw: unknown, observation: ArenaBlindObservation, explanation = false) {
  const schema = explanation ? z.object({ tile: TileIdSchema, red: z.boolean(), rationale: z.string().trim().min(1).max(2000) }).strict() : ArenaDirectAnswerSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success || !ArenaDirectAnswerSchema.safeParse({ tile: parsed.data.tile, red: parsed.data.red }).success) return { status: "invalid" as const, reason: "schema_invalid" as const };
  const answer = parsed.data;
  // Each canonical candidate already represents the libriichi physical-realization equivalence class.
  const matches = observation.candidates.filter(c => c.tile.id === answer.tile && c.tile.red === answer.red);
  if (matches.length !== 1) return { status: "invalid" as const, reason: "action_not_offered" as const };
  return { status: "valid" as const, submission: ArenaDirectSubmissionSchema.parse({ format: "tile-red/v1", caseRef: observation.caseRef,
    actionRef: matches[0]!.actionRef, tile: answer.tile, red: answer.red,
    ...("rationale" in answer ? { rationale: answer.rationale } : {}) }) };
}
