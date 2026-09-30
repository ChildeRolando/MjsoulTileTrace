import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { CanonicalEventStreamSchema, LIBRIICHI_RULE_NORMALIZATION_VERSION, libriichiRuleCanonicalJson,
  type LibriichiRuleRequest, type LibriichiRuleResponse } from "@riichi-coach/contracts";
import * as mortalSource from "@riichi-coach/mortal-source";
import { JsonlFactEngineClient, ManagedFactEngineTransport } from "@riichi-coach/reasoning";
import { runMortalDecisionDiagnostic } from "../src/mortal-decision-diagnostic-runner.js";

it.each(["complete","rules-error","missing-unchosen"])("single diagnostic derives its decision and rules from canonical input: %s",async mode=>{
  const tile=(id:string)=>({id,red:false});
  const hand=["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p","3p","4p"];
  const stream=CanonicalEventStreamSchema.parse({
    schemaVersion:"canonical-riichi-events/v2",mapperVersion:"test/v1",gameId:"game:diagnostic",sourceKind:"tenhou",sourceRecordHash:"sha256:test",
    playerCount:4,selfActor:0,completeness:{eventSequence:"complete",ruleSet:"complete",scores:"complete",doraIndicators:"complete",rivers:"complete",
      calledDiscardMarkers:"complete",melds:"complete",remainingDraws:"complete",settlement:"complete",responseOpportunities:"complete"},
    ruleSet:{length:"south",redFives:{man:1,pin:1,sou:1},openTanyao:true,atamahane:false,westExtension:"sudden_death",ippatsuCancelledByAnkan:true},
    events:[{type:"game_started"},
      {type:"round_started",roundOrdinal:0,roundWind:"E",hand:1,honba:0,riichiSticks:0,dealer:3,scores:[25000,25000,25000,25000],
        doraIndicator:tile("1s"),selfHand:hand.map(tile),remainingDraws:70},
      {type:"tile_drawn",actor:3,tile:{visibility:"hidden"},from:"live_wall"},
      {type:"tile_discarded",actor:3,tile:tile("7z"),discardMode:"tsumogiri",riichiDeclarationEventRef:null},
      {type:"tile_drawn",actor:0,tile:{visibility:"visible",tile:tile("5p")},from:"live_wall"},
      {type:"tile_discarded",actor:0,tile:tile("5p"),discardMode:"tsumogiri",riichiDeclarationEventRef:null},
    ].map((event,index)=>({...event,eventId:`game:diagnostic/0/${index}/0`,sourceRecordRef:`record:${index}`})),
  });
  const identity={implementation:"Equim-chan/Mortal/libriichi" as const,revision:"0".repeat(40),nativeArtifactSha256:"1".repeat(64),
    wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
  const actions=[{type:"dahai",actor:0,pai:"1m",tsumogiri:false},{type:"dahai",actor:0,pai:"5p",tsumogiri:true},{type:"reach",actor:0}];
  const queryRules=vi.fn(async(request:LibriichiRuleRequest):Promise<LibriichiRuleResponse>=>{
    if(mode==="rules-error") return {protocolVersion:request.protocolVersion,requestId:request.requestId,status:"error",code:"rules_runtime_failed"};
    const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity,status:"ok" as const,
      actions:actions.map((action,i)=>({runtimeAction:{index:[0,13,37][i]!,variant:null},mjaiActionJson:JSON.stringify(action)}))};
    return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
  });
  const details=actions.map((action,i)=>({action,probability:[0.2,0.5,0.3][i]!,qValue:[0,2,1][i]!}));
  const fetchReport=vi.spyOn(mortalSource,"fetchMortalReport").mockResolvedValue({reportId:"controlled-test",adapterVersion:"mortal-source/2",engine:"Mortal",
    version:"1.5.10",modelTag:"controlled-test",playerId:0,gameFingerprint:mortalSource.computeCanonicalGameFingerprint(stream),
    kyokus:[{roundOrdinal:0,roundWind:"E",dealer:3,kyoku:0,honba:0,entries:[{
      roundOrdinal:0,roundWind:"E",dealer:3,kyoku:0,honba:0,junme:1,tilesLeft:68,lastActor:0,tile:"5p",tehai:[...hand,"5p"],fuuros:[],
      atSelfChiPon:false,atSelfRiichi:false,atOpponentKakan:false,expected:actions[1]!,actual:actions[1]!,isEqual:true,
      details:mode==="missing-unchosen"?[{...details[1]!,probability:0.625},{...details[2]!,probability:0.375}]:details,
      actualIndex:mode==="missing-unchosen"?0:1,shanten:1,atFuriten:false,
    }]}]});
  const engine=new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/",import.meta.url))));
  const analyze=vi.spyOn(engine,"analyzeHandStructure");
  const directory=await mkdtemp(join(tmpdir(),"native-single-diagnostic-"));
  const writeResult=vi.fn(async(_serialized:string)=>join(directory,"result.json"));
  const consoleLine=vi.spyOn(console,"log").mockImplementation(()=>{});
  try {
    const resultUrlFilePath=join(directory,"url.txt");
    await writeFile(resultUrlFilePath,"https://mjai.ekyu.moe/report/test.html");
    const input={resultUrlFilePath,acquisition:{status:"acquired" as const,stream,decisions:[],recordId:"test",selfSeat:0},
      engine,rules:{identity,port:{queryRules}},writeResult};
    const result=await runMortalDecisionDiagnostic(input);
    expect(queryRules).toHaveBeenCalledTimes(1);
    if(mode==="complete") {
      expect(result.status).toBe("review_ready");
      const artifact=JSON.parse(writeResult.mock.calls[0]![0]);
      expect(artifact).toMatchObject({schemaVersion:"mortal-decision-diagnostic/v2",candidateCount:3,
        legalActionRules:{identity,requestId:queryRules.mock.calls[0]![0].requestId}});
      expect(analyze).toHaveBeenCalled();
    } else {
      expect(result.status).toBe(mode==="rules-error"?"review_failed":"mortal_report_rejected");
      expect(writeResult).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
    }
  } finally {
    fetchReport.mockRestore();consoleLine.mockRestore();
    await engine.close();await rm(directory,{recursive:true,force:true});
  }
});
