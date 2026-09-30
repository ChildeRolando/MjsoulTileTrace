import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { LIBRIICHI_RULE_NORMALIZATION_VERSION, libriichiRuleCanonicalJson, type LibriichiRuleRequest, type LibriichiRuleResponse } from "@riichi-coach/contracts";
import { computeCanonicalGameFingerprint, type MortalReportCandidate } from "@riichi-coach/mortal-source";
import { runMortalAcceptanceEvidence } from "../src/analysis/acceptance-core.js";
import { buildLocalMortalReportEntry } from "../src/analysis/local-mortal-report.js";
import { JsonlFactEngineClient } from "../src/fact-engine/jsonl-client.js";
import { ManagedFactEngineTransport } from "../src/fact-engine/managed-sidecar.js";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import { canonicalStream, canonicalSelfDrawDiscardEvents } from "./fixtures/canonical-stream.js";

const identity = {implementation:"Equim-chan/Mortal/libriichi" as const,revision:"0".repeat(40),
  nativeArtifactSha256:"1".repeat(64),wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
const actions = [
  {runtimeAction:{index:0,variant:null},mjaiActionJson:'{"type":"dahai","actor":0,"pai":"1m","tsumogiri":false}'},
  {runtimeAction:{index:13,variant:null},mjaiActionJson:'{"type":"dahai","actor":0,"pai":"5p","tsumogiri":true}'},
  {runtimeAction:{index:37,variant:null},mjaiActionJson:'{"type":"reach","actor":0}'},
];
const digest = (value:unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

it.each(["complete", "missing-unchosen", "rules-error"])("remote acceptance consumes the complete controlled rule result: %s", async mode => {
  // Controlled three-action port tests the consumer contract, not native legality.
  const stream = {...canonicalStream(canonicalSelfDrawDiscardEvents()),sourceKind:"tenhou" as const};
  const decision = replayCanonicalStream(stream)[0]!;
  const queryRules = vi.fn(async (request:LibriichiRuleRequest):Promise<LibriichiRuleResponse> => {
    if (mode === "rules-error") return {protocolVersion:request.protocolVersion,requestId:request.requestId,status:"error",code:"rules_runtime_failed"};
    const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity,status:"ok" as const,actions};
    return {...content,resultId:digest(content)};
  });
  const details: MortalReportCandidate[] = actions.map((row,index)=>({action:JSON.parse(row.mjaiActionJson),probability:[0.2,0.5,0.3][index]!,qValue:[0,2,1][index]!}));
  const entry = buildLocalMortalReportEntry({decision,details,actualIndex:1,preferredIndex:1,
    decisionIdentity:{decisionId:decision.decisionEventRef,surface:"self",windowKind:"self_turn",triggerEventRef:decision.decisionEventRef,selfActor:0}});
  const report = {reportId:"controlled-native-acceptance",adapterVersion:"mortal-source/2" as const,engine:"Mortal" as const,version:"1.5.10",modelTag:"fixture",playerId:0,
    gameFingerprint:computeCanonicalGameFingerprint(stream),kyokus:[{roundOrdinal:0,roundWind:"E" as const,dealer:0,kyoku:0,honba:0,
      entries:[mode === "missing-unchosen" ? {...entry,details:[{...details[1]!,probability:0.625},{...details[2]!,probability:0.375}],actualIndex:0} : entry]}]};
  const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/",import.meta.url))));
  const analyze = vi.spyOn(engine,"analyzeHandStructure");
  try {
    const input = {local:{sourceKind:"tenhou" as const,opaqueGameId:stream.gameId,selfActor:0,canonicalStream:stream,
      // Stale caller-owned window lists must not suppress the canonical census.
      replayedDecisions:[],replayedResponseWindows:[]},report,engine,rules:{identity,port:{queryRules}},evidenceVersion:"controlled-test/v1"};
    const run = await runMortalAcceptanceEvidence(input);
    expect(queryRules).toHaveBeenCalledTimes(1);
    expect(queryRules.mock.calls[0]![0].decision.triggerEventRef).toBe(decision.decisionEventRef);
    if (mode === "complete") {
      expect(run.status).toBe("accepted");
      if (run.status !== "accepted") throw new Error("acceptance failed");
      expect(run.review.decisions.map(row=>row.outcome)).toEqual(["analysis_ready"]);
      expect(run.review.retainedAnalyses[0]!.modelEvaluation.candidates).toHaveLength(3);
      expect(run.evidence.branches).toEqual(["dama_with_riichi_candidate"]);
      expect(run.artifact.schemaVersion).toBe("mortal-acceptance-artifact/v2");
      expect(run.artifact.legalActionRules).toEqual(identity);
      expect(analyze).toHaveBeenCalled();
    } else {
      expect(run).toEqual({status:"no_analysis_ready_branch_evidence",analysisReadyRowCount:0});
      expect(analyze).not.toHaveBeenCalled();
    }
  } finally {await engine.close();}
});
