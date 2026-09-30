import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CanonicalEventStreamSchema, LIBRIICHI_RULE_NORMALIZATION_VERSION, libriichiRuleCanonicalJson, type LibriichiRuleRequest, type LibriichiRuleResponse } from "@riichi-coach/contracts";
import * as mortalSource from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "@riichi-coach/reasoning";
import {
  buildMortalFullGameResultPath,
  formatMortalFullGameConsoleLine,
  serializeMortalFullGameDiagnosticResult,
  runMortalFullGameDiagnostic,
} from "../src/mortal-full-game-diagnostic-runner.js";

const SYNTHETIC_REPORT_ID = "0123456789abcdef";
const SYNTHETIC_RECORD_ID = "260810-00000000-0000-0000-0000-000000000000";

function fakeCoverageReview() {
  return {
    status: "coverage_ready",
    summary: {
      replayDecisionCount: 2,
      responseWindowCount: 0,
      mortalSelfEntryCount: 1,
      responseEntryCount: 0,
      localConservation: 2,
      sourceConservation: 1,
      outcomes: {
        analysis_ready: 1,
        unsupported_action: 0,
        source_row_not_expected: 0,
        no_mortal_entry: 1,
        binding_mismatch: 0,
        model_output_incomplete: 0,
        analysis_blocked: 0,
      },
      binding: { bound: 1, noMortalEntry: 1, ambiguous: 0 },
      supportedPairCount: 1,
      unsupportedReasons: {},
      modelIncompleteReasons: {},
      analysisBlockedReasons: {},
    },
    sourceCoverage: {
      mortalSelfEntryCount: 1,
      responseEntryCount: 0,
      boundMortalEntryCount: 1,
      unboundMortalEntryCount: 0,
      ambiguousMortalEntryCount: 0,
      entries: [],
      responseEntries: [],
      responseBoundEntryCount: 0,
      responseUnboundEntryCount: 0,
      responseAmbiguousEntryCount: 0,
    },
    decisions: [{
      decisionOrdinal: 0,
      roundOrdinal: 0,
      surface: "self",
      binding: "bound",
      support: "supported",
      outcome: "analysis_ready",
      reason: null,
      sourceEntryRef: `sha256:${SYNTHETIC_REPORT_ID}`,
      sourceOrdinal: 0,
      modelSummary: {
        actualActionRef: "action:v1:actual",
        preferredActions: ["action:v1:actual"],
        topModelProbabilityPercent: 100,
        errorGap: 0,
        detailClass: "not_error",
        factorAnalysisMode: "v2",
        deterministicPreference: null,
      },
    }],
  };
}

describe("mortal-full-game diagnostic privacy", () => {
  it("never serializes raw report/record identifiers or internal refs", () => {
    const serialized = serializeMortalFullGameDiagnosticResult(
      { status: "acquired", selfSeat: 1 } as never,
      fakeCoverageReview() as never,
    );
    expect(serialized).not.toContain(SYNTHETIC_REPORT_ID);
    expect(serialized).not.toContain(SYNTHETIC_RECORD_ID);
    expect(serialized).not.toContain("decisionEventRef");
    expect(serialized).not.toContain("comparisonSetId");
    expect(serialized).not.toContain("evaluationId");
    expect(serialized).not.toContain("https://");
  });

  it("prints aggregate console output only", () => {
    const line = formatMortalFullGameConsoleLine({
      replayDecisionCount: 120,
      mortalSelfEntryCount: 113,
      responseEntryCount: 37,
      bound: 100,
      ready: 90,
      unsupported: 5,
      missing: 3,
      sourceRowNotExpected: 12,
      bindingMismatch: 0,
      modelIncomplete: 0,
      blocked: 0,
    });
    expect(line).toContain("replay=120");
    expect(line).toContain("mortal=113");
    expect(line).toContain("response=37");
    expect(line).toContain("notExpected=12");
    expect(line).not.toContain(SYNTHETIC_REPORT_ID);
    expect(line).not.toContain("https://");
    expect(line).not.toContain("action:v1");
  });

  it("never embeds identifiers in the result path", () => {
    const path = buildMortalFullGameResultPath("C:\\temp\\results", 1234567890);
    expect(path).not.toContain(SYNTHETIC_REPORT_ID);
    expect(path).not.toContain(SYNTHETIC_RECORD_ID);
    expect(path).toContain("mortal-full-game-result-1234567890.json");
  });
});

it.each([false, true])("diagnostic replays all boundaries and records controlled native failures=%s", async failing => {
  const tile = (id: string) => ({id,red:false});
  const stream = CanonicalEventStreamSchema.parse({
    schemaVersion:"canonical-riichi-events/v2",mapperVersion:"test/v1",gameId:"game:diagnostic",sourceKind:"tenhou",sourceRecordHash:"sha256:test",
    playerCount:4,selfActor:0,
    completeness:{eventSequence:"complete",ruleSet:"complete",scores:"complete",doraIndicators:"complete",rivers:"complete",
      calledDiscardMarkers:"complete",melds:"complete",remainingDraws:"complete",settlement:"complete",responseOpportunities:"complete"},
    ruleSet:{length:"south",redFives:{man:1,pin:1,sou:1},openTanyao:true,atamahane:false,westExtension:"sudden_death",ippatsuCancelledByAnkan:true},
    events:[
      {type:"game_started"},
      {type:"round_started",roundOrdinal:0,roundWind:"E",hand:1,honba:0,riichiSticks:0,dealer:3,scores:[25000,25000,25000,25000],
        doraIndicator:tile("1s"),selfHand:["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p","3p","4p"].map(tile),remainingDraws:70},
      {type:"tile_drawn",actor:3,tile:{visibility:"hidden"},from:"live_wall"},
      {type:"tile_discarded",actor:3,tile:tile("7z"),discardMode:"tsumogiri",riichiDeclarationEventRef:null},
      {type:"tile_drawn",actor:0,tile:{visibility:"visible",tile:tile("5p")},from:"live_wall"},
      {type:"tile_discarded",actor:0,tile:tile("5p"),discardMode:"tsumogiri",riichiDeclarationEventRef:null},
    ].map((event,index)=>({...event,eventId:`game:diagnostic/0/${index}/0`,sourceRecordRef:`record:${index}`})),
  });
  const identity={implementation:"Equim-chan/Mortal/libriichi" as const,revision:"0".repeat(40),nativeArtifactSha256:"1".repeat(64),
    wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
  // Controlled port exercises routing/proofs; it is not a native legality oracle.
  const queryRules=vi.fn(async (request:LibriichiRuleRequest):Promise<LibriichiRuleResponse>=>{
    if(failing) return {protocolVersion:request.protocolVersion,requestId:request.requestId,status:"error",code:"rules_runtime_failed"};
    const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity,
      ...(request.decision.surface === "response" ? {status:"non_action" as const,reason:"native_cannot_act" as const}
        : {status:"ok" as const,actions:[{runtimeAction:{index:13,variant:null},mjaiActionJson:'{"type":"dahai","actor":0,"pai":"5p","tsumogiri":true}'}]})};
    return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
  });
  const fetchReport=vi.spyOn(mortalSource,"fetchMortalReport").mockResolvedValue({reportId:"test",adapterVersion:"mortal-source/2",engine:"Mortal",
    version:"1.5.10",modelTag:"controlled-test",playerId:0,gameFingerprint:mortalSource.computeCanonicalGameFingerprint(stream),kyokus:[]});
  const directory=await mkdtemp(join(tmpdir(),"native-diagnostic-"));
  const writeResult=vi.fn(async (_serialized:string)=>join(directory,"result.json"));
  const consoleLine=vi.spyOn(console,"log").mockImplementation(()=>{});
  try {
    const resultUrlFilePath=join(directory,"url.txt");
    await writeFile(resultUrlFilePath,"https://mjai.ekyu.moe/report/test.html");
    const result=await runMortalFullGameDiagnostic({resultUrlFilePath,
      acquisition:{status:"acquired",stream,decisions:[],recordId:"test",selfSeat:0},
      engine:{} as HandStructureFactEnginePort,rules:{identity,port:{queryRules}},writeResult});
    expect(result.status).toBe("coverage_ready");
    expect(queryRules.mock.calls.map(([request])=>request.decision.triggerEventRef).sort()).toEqual(["game:diagnostic/0/3/0","game:diagnostic/0/4/0"]);
    const artifact=JSON.parse(writeResult.mock.calls[0]![0]);
    expect(artifact.legalActionRules).toEqual(identity);
    expect(artifact.decisions.map((row:{outcome:string})=>row.outcome)).toEqual(failing
      ? ["analysis_blocked","analysis_blocked"] : ["source_row_not_expected"]);
    if(!failing) expect(artifact.decisions[0].singleCandidateProof).toMatchObject({shape:"libriichi_single_candidate",candidateCount:1});
  } finally {
    fetchReport.mockRestore(); consoleLine.mockRestore();
    await rm(directory,{recursive:true,force:true});
  }
});
