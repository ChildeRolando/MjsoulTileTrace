import { DecisionSnapshotV2Schema, KnownGameFactsSchema, ScenePatternFactsSchema, compareCanonicalEventPositions, parseCanonicalEventRef, type DecisionSnapshotV2, type KnownGameFacts, type StructuredComparisonCandidate, type ScenePatternCandidate } from "@riichi-coach/contracts";
import { projectCandidate } from "./factors/candidate-projector.js";
import { buildDeterministicDefenseMatrix, deterministicSafety } from "./factors/defense-matrix.js";
import { doraFromIndicator, tileIdTo34 } from "./factors/tile34.js";
import { validateHand13Result, validateHandStructureResult } from "./fact-engine/hand-structure-validator.js";
import type { MahjongFactEnginePort } from "./fact-engine/port.js";

const before=(a:string,b:string) => {const x=parseCanonicalEventRef(a),y=parseCanonicalEventRef(b);if(!x||!y) throw new Error("pattern_event_order_unknown");return compareCanonicalEventPositions(x.position,y.position)<0;};
const yakuhai=(wind:string,seat:string)=>new Set([31,32,33,27+["E","S","W","N"].indexOf(wind),27+["E","S","W","N"].indexOf(seat)]);

/** Current held shape, before choosing a discard (P03/P04). */
export function currentHandPatternFacts(raw:DecisionSnapshotV2) {
  const s=DecisionSnapshotV2Schema.parse(raw),p=s.publicState,v=s.privateState;
  const tiles=[...v.concealedTiles,...(v.currentDraw?[v.currentDraw.tile]:[])];
  const n=Array<number>(34).fill(0);for(const t of tiles)n[tileIdTo34(t.id)]!++;
  const pairKinds=n.flatMap((count,i)=>count===2&&yakuhai(p.roundWind,p.seatWinds[s.selfActor]!).has(i)?[i]:[]);
  const meldTiles=p.melds.filter(m=>m.actor===s.selfActor).flatMap(m=>m.kind==='ankan'?m.tiles:m.kind==='kakan'?[m.calledTile,...m.consumedTiles,m.addedTile]:[m.calledTile,...m.consumedTiles]);
  const suits:[number,number,number]=[0,0,0];for(const t of [...tiles,...meldTiles]){const i=tileIdTo34(t.id);if(i<27)suits[Math.floor(i/9)]!++;}
  const known=v.fields.concealedTiles==='complete'&&v.fields.currentDraw==='complete';
  return {selfYakuhaiPairKinds:known&&p.fields.roundContext==='complete'?pairKinds:null,selfSuitCounts:known&&p.fields.melds==='complete'?suits:null};
}

/** Historical river cut is deliberately made BEFORE the observed discard. */
export function recentNonGenbutsuFacts(snapshot:DecisionSnapshotV2,facts:KnownGameFacts) {
  if(!facts.completeness.eventSequence||!facts.completeness.rivers||!facts.completeness.responseOpportunities) return null;
  const out:Array<{actor:number;threatActor:number;evidenceRefs:string[]}>=[];
  for(const river of facts.rivers) {
    const latest=river.at(-1); if(!latest||latest.actor===facts.actor)continue;
    for(const r of snapshot.publicState.riichiStates) {
      if(r.actor===latest.actor||r.actor===facts.actor||r.status!=="accepted"||!r.acceptanceEventRef||!before(r.acceptanceEventRef,latest.eventId))continue;
      const historical={completeness:facts.completeness,rivers:facts.rivers.map(xs=>xs.filter(x=>before(x.eventId,latest.eventId)))};
      const threat=facts.defenseThreats.find(t=>t.actor===r.actor);
      if(!threat)return null;
      const s=deterministicSafety(latest.tile,threat,historical);
      if(s?.status==="calculated"&&!s.genbutsu)out.push({actor:latest.actor,threatActor:r.actor,evidenceRefs:[latest.eventId,r.acceptanceEventRef]});
    }
  }
  return out;
}

/** Project ONLY visible state and engine-derived facts. Never accepts a report or scoring result. */
export async function buildScenePatternFacts(input:{
  caseRef:string; snapshot:DecisionSnapshotV2; facts:KnownGameFacts; candidates:readonly StructuredComparisonCandidate[];
  engine:MahjongFactEnginePort; reference:(ref:string)=>string;
}) {
  const snapshot=DecisionSnapshotV2Schema.parse(input.snapshot),f=KnownGameFactsSchema.parse(input.facts),p=snapshot.publicState;
  if(snapshot.selfActor!==f.actor||snapshot.decisionEventRef!==f.decisionEventRef||JSON.stringify(snapshot.privateState.concealedTiles)!==JSON.stringify(f.concealedTiles))throw new Error("pattern_facts_snapshot_mismatch");
  const refs=[input.reference(`scene-pattern-facts:${input.caseRef}`)], melds=f.melds.filter(m=>m.actor===f.actor);
  const doraTiles=f.doraIndicators.map(t=>doraFromIndicator(t));
  const dora=(tiles:KnownGameFacts["concealedTiles"])=>f.completeness.doraIndicators?tiles.reduce((n,t)=>n+Number(t.red)+doraTiles.filter(d=>d===tileIdTo34(t.id)).length,0):null;
  const selfAll=[...f.concealedTiles,...(f.currentDraw?[f.currentDraw.tile]:[]),...melds.flatMap(m=>m.tiles)];
  const candidates:ScenePatternCandidate[]=[];
  for(const c of input.candidates) {
    if(c.action.kind!=="discard")throw new Error("pattern_requires_discard_only");
    const ref=input.reference(`scene-pattern-fact:${input.caseRef}:${c.actionRef}`);
    const row:ScenePatternCandidate={actionRef:c.actionRef,tile34:tileIdTo34(c.action.tile.id),exactPairKinds:null,yakuhaiPairKinds:null,suitCounts:null,shanten:null,standardShanten:null,chiitoitsuShanten:null,ukeire:null,dora:null,waits:null,furiten:null,safety:[],evidenceRefs:[ref]};
    const projection=projectCandidate(c,f);
    const matrix=buildDeterministicDefenseMatrix({candidate:c,facts:f});
    row.safety=matrix.cells.map(cell=>({actor:cell.threat.actor,genbutsu:cell.deterministicSafety.status==="calculated"?cell.deterministicSafety.genbutsu:null}));
    if(projection.status==="ready"&&projection.hand13Request) {
      const req={...projection.hand13Request,calculationMode:"efficiency-v1" as const};
      const result=validateHand13Result(req,await input.engine.analyzeHand13(req));
      const n=req.handTiles34;
      row.exactPairKinds=n.flatMap((v,i)=>v===2?[i]:[]);
      const y=yakuhai(f.roundWind,f.seatWind);row.yakuhaiPairKinds=row.exactPairKinds.filter(t=>y.has(t));
      const ns=[...n];for(const m of melds)for(const t of m.tiles)ns[tileIdTo34(t.id)]!++;
      row.suitCounts=[ns.slice(0,9).reduce((a,b)=>a+b,0),ns.slice(9,18).reduce((a,b)=>a+b,0),ns.slice(18,27).reduce((a,b)=>a+b,0)];
      row.shanten=result.shanten;
      // efficiency-v1 deliberately omits dora estimates. Count the projected
      // physical ownership using the existing projector's indicator/red context.
      row.dora=req.doraTilesComplete?req.doraTiles34.reduce((sum,t)=>sum+req.handTiles34[t]!+req.melds.reduce((n,m)=>n+m.tiles34.filter(i=>i===t).length,0),0)+req.redFiveCounts.reduce((a,b)=>a+b,0):null;
      row.ukeire=req.leftTiles34===null?null:result.effectiveTile34.reduce((sum,t)=>sum+req.leftTiles34![t]!,0);
      if(projection.handStructureRequest&&input.engine.analyzeHandStructure) {
        const hand=validateHandStructureResult(projection.handStructureRequest,await input.engine.analyzeHandStructure(projection.handStructureRequest));
        row.standardShanten=hand.families.find(x=>x.family==="standard")!.shanten;
        row.chiitoitsuShanten=hand.families.find(x=>x.family==="chiitoitsu")!.shanten;
        row.waits=hand.waits.map(w=>({tile34:w.tile34,unseen:w.remaining}));
        // Existing engine supplies the structural waits; compare with the exact self river plus this candidate.
        const ownRiver=new Set([...f.rivers[f.actor]!.map(x=>tileIdTo34(x.tile.id)),row.tile34]);
        const components=[snapshot.privateState.furiten.temporary,snapshot.privateState.furiten.riichi];
        row.furiten=hand.waits.some(w=>ownRiver.has(w.tile34))||components.some(x=>x.status==="confirmed")?true:
          f.completeness.rivers&&components.every(x=>x.status==="clear")?false:null;
      }
    }
    candidates.push(row);
  }
  return ScenePatternFactsSchema.parse({version:"scene-pattern-facts/v1",caseRef:input.caseRef,selfActor:f.actor,
    noMeldOrKan:f.completeness.melds?melds.length===0:null,selfDora:f.completeness.concealedTiles&&f.completeness.melds?dora(selfAll):null,
    ...currentHandPatternFacts(snapshot),
    acceptedRiichiActors:f.completeness.eventSequence?p.riichiStates.filter(r=>r.actor!==f.actor&&r.status==="accepted").map(r=>r.actor):null,
    opponents:[0,1,2,3].filter(a=>a!==f.actor).map(actor=>{const ms=f.melds.filter(m=>m.actor===actor&&m.kind!=="ankan"),tiles=ms.flatMap(m=>m.tiles),y=yakuhai(p.roundWind,p.seatWinds[actor]!);return {actor,
      openMeldCount:f.completeness.melds?ms.length:null,
      exposedYakuhai:f.completeness.melds&&f.completeness.roundContext?ms.some(m=>m.kind!=="chi"&&y.has(tileIdTo34(m.tiles[0]!.id))):null,
      exposedDora:f.completeness.melds?dora(tiles):null,
      openNumericSuits:f.completeness.melds?[...new Set(tiles.map(t=>tileIdTo34(t.id)).filter(t=>t<27).map(t=>Math.floor(t/9)))].sort():null,
      evidenceRefs:refs};}),
    recentNonGenbutsu:recentNonGenbutsuFacts(snapshot,f)?.map(x=>({...x,evidenceRefs:x.evidenceRefs.map(input.reference)}))??null,
    remainingDraws:f.completeness.remainingDraws?f.remainingDraws:null,
    southFourHanchan:p.fields.roundContext==="complete"&&p.ruleSet.length!=="unknown"?p.ruleSet.length==="south"&&p.roundWind==="S"&&p.hand===4:null,
    scoresKnown:p.fields.scores==="complete",candidates,evidenceRefs:refs});
}
