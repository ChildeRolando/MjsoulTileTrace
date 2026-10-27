import { digestOf } from "../canonical.mjs";
import { loadResearchSubset } from "../knowledge.mjs";
import { SELF_RAG_STUDY_EXECUTION_IDENTITY, SELF_RAG_STUDY_SCENE_SLOT_PLAN } from "../prepare.mjs";
import { SELF_RAG_STUDY_SUBSET_IDS } from "../knowledge.mjs";
import { SELF_RAG_STUDY_RULE_SOURCE, resolveCorpusGameRules } from "../corpus-rules.mjs";
import { knowledgeCard, syntheticKnowledge } from "./knowledge.mjs";

export const FIXTURE_SHA = "a".repeat(40);
export const FIXTURE_SEED = "selfrag-study-fixture-seed/v1";
/** Same Tenhou GO bitfield as the real corpus (`gm-00a9`: 四麻/东南/赤牌/食断). */
export const FIXTURE_TENHOU_LOCATOR =
  "https://fixture.invalid/tenhou-houou/2009123013gm-00a9-0000-13d83447.mjai.json.zst";

export function fixtureRuleSource() {
  const resolved = resolveCorpusGameRules({
    format: "mjai",
    observations: [{ source: SELF_RAG_STUDY_RULE_SOURCE, locator: FIXTURE_TENHOU_LOCATOR }],
  });
  if (resolved.status !== "ok") throw new Error(resolved.reason);
  return resolved.ruleSource;
}

export const FIXTURE_LAYER_FACTS = Object.freeze({
  SL1: Object.freeze({ windowKind: "self_turn", meldCount: 0, riichiStates: ["none", "none", "none", "none"], remainingDraws: 60 }),
  SL2: Object.freeze({ windowKind: "post_call_discard", meldCount: 1, riichiStates: ["none", "none", "none", "none"], remainingDraws: 45 }),
  SL3: Object.freeze({ windowKind: "self_turn", meldCount: 0, riichiStates: ["none", "accepted", "none", "none"], remainingDraws: 50 }),
  SL4: Object.freeze({ windowKind: "self_turn", meldCount: 0, riichiStates: ["none", "none", "none", "none"], remainingDraws: 20 }),
  SL5: Object.freeze({ windowKind: "post_riichi_discard", meldCount: 0, riichiStates: ["accepted", "none", "none", "none"], remainingDraws: 40 }),
});

/** Deterministic uuid-shaped opaque ref derived from a label. */
export function opaqueRef(prefix, label) {
  const hex = digestOf({ prefix, label });
  return `${prefix}${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function fixtureObservation(caseId, layer) {
  const facts = FIXTURE_LAYER_FACTS[layer];
  return {
    schemaVersion: "blind-discard-arena-observation/v1",
    caseRef: opaqueRef("arena-case:v1:", caseId),
    decision: { selfActor: 0, windowKind: facts.windowKind, roundOrdinal: 3 },
    visibleState: {
      remainingDraws: facts.remainingDraws,
      riichiStates: facts.riichiStates.map((status, actor) => ({ actor, status })),
      self: { meldRefs: new Array(facts.meldCount).fill(0).map((_, index) => opaqueRef("arena-ref:v1:", `${caseId}:meld:${index}`)) },
    },
    candidates: [],
    tools: { description: "fixture", supportedCapabilities: [] },
  };
}

export function fixtureResearch() {
  const cards = SELF_RAG_STUDY_SUBSET_IDS.map((id) => knowledgeCard({ id }));
  const { bytes } = syntheticKnowledge(cards);
  return loadResearchSubset(bytes, {
    knowledgePath: "E:/fixture/knowledge.json",
    expectedIdentity: null,
    subsetIds: [...SELF_RAG_STUDY_SUBSET_IDS],
  });
}

export function fixtureExclusions() {
  const artifact = {
    schemaVersion: "selfrag-study-exclusions/v1",
    sources: [{ name: "fixture", caseCount: 2, unverifiableEntries: 0, files: [] }],
    gameIds: ["rc1_fixture_excluded"],
    sourceHashes: ["e".repeat(64)],
  };
  return { ...artifact, digest: digestOf(artifact) };
}

/**
 * Full dependency set for prepare/verify tests. `verdict` decides the prejudge
 * shape per passage index; `layerless` removes a layer from every game.
 */
export function fixtureStudyDeps(options = {}) {
  const research = options.research ?? fixtureResearch();
  const exclusions = options.exclusions ?? fixtureExclusions();
  const games = Array.from({ length: 30 }, (_, index) => {
    const layers = {};
    for (const slot of SELF_RAG_STUDY_SCENE_SLOT_PLAN) {
      if (options.layerless === slot.layer) continue;
      layers[slot.layer] = 10 + index;
    }
    return {
      gameId: `rc1_fixture_${String(index).padStart(2, "0")}`,
      sourceHash: digestOf({ index }).slice(0, 64),
      format: "mjai",
      layers,
    };
  });
  games.push({ gameId: "rc1_fixture_excluded", sourceHash: "e".repeat(64), format: "mjai", layers: { SL1: 1 } });

  const prejudgeCalls = [];
  const retrieverCalls = [];
  const writeOrder = [];
  const ruleSource = options.ruleSource ?? fixtureRuleSource();
  const deps = {
    gitHead: async () => ({ sha: FIXTURE_SHA, clean: options.clean ?? true }),
    loadResearchSubset: async () => research,
    loadExclusions: async () => exclusions,
    openCorpus: async () => ({
      listGames: ({ limit = 1000, offset = 0 } = {}) => games.slice(offset, offset + limit),
      readRecord: () => ({ raw: Buffer.from("{}") }),
      close: async () => {},
    }),
    analyzeGame: async ({ game }) => ({ status: "ok", layers: game.layers, ruleSource }),
    buildCase: async ({ selected }) => ({
      observation: fixtureObservation(selected.caseId, selected.layer),
      aliases: { reference: (value) => opaqueRef("arena-ref:v1:", value) },
      ruleSource,
    }),
    createRetriever: async ({ caseRef, researchCorpus }) => {
      const retriever = {
        async query(request) {
          retrieverCalls.push({ caseRef, request });
          const passages = researchCorpus.subset.slice(0, 2).map((card) => ({
            sourceRef: opaqueRef("arena-ref:v1:", `${caseRef}:${card.id}`),
            sourceTitle: card.convertedPassage.sourceTitle,
            documentLocation: card.convertedPassage.documentLocation,
            content: card.convertedPassage.content,
            applicableWhen: card.convertedPassage.applicableWhen,
            corpusVersion: "selfrag-research-scene-kb-v2/v1",
            retrieverVersion: "arena-local-terms/v1",
          }));
          const sourceRefs = passages.map((passage) => passage.sourceRef);
          return {
            schemaVersion: "blind-discard-arena-rag-result/v1",
            caseRef, mode: "local", status: passages.length === 0 ? "no_hits" : "hits",
            passages, sourceRefs,
            retrieval: { query: request.query, context: null, filter: null, limit: request.limit, resultRefs: sourceRefs },
            corpusVersion: "selfrag-research-scene-kb-v2/v1",
            retrieverVersion: "arena-local-terms/v1",
          };
        },
      };
      return retriever;
    },
    retrieverVersion: "arena-local-terms/v1",
    prejudge: async ({ caseId, passages }) => {
      prejudgeCalls.push({ caseId, passages: passages.length });
      const verdict = options.verdict ?? ((index) => (index === 0 ? "irrelevant" : index === 1 ? "uncertain" : "useful"));
      return {
        verdicts: passages.map((passage, index) => ({
          sourceRef: passage.sourceRef,
          verdict: verdict(index),
          reason: `fixture reason ${index}`,
        })),
        judge: { providerId: "codex-cli", model: "gpt-6-luna" },
        usage: { inputTokens: 10, outputTokens: 5 },
        elapsedMs: 7,
      };
    },
    providerIdentity: async () => ({ ...SELF_RAG_STUDY_EXECUTION_IDENTITY }),
    gateIdentity: async () => ({
      available: true,
      gateVersion: SELF_RAG_STUDY_EXECUTION_IDENTITY.gateVersion,
      promptVersion: SELF_RAG_STUDY_EXECUTION_IDENTITY.promptVersions.selector,
    }),
    writeJson: async (path, value) => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(path), { recursive: true });
      writeOrder.push(path);
      await writeFile(path, `${JSON.stringify(value, null, 2)}
`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    },
    readJson: async (path) => {
      const { readFile } = await import("node:fs/promises");
      return JSON.parse(await readFile(path, "utf8"));
    },
  };
  return { deps, games, research, exclusions, prejudgeCalls, retrieverCalls, writeOrder };
}
