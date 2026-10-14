import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {StructuredAnalysisPackageSchema, ReviewBoardSchema, type ReviewBoardDto, type Tile} from "@riichi-coach/contracts";
import {presentReviewBoard} from "../src/fixed-review-presenter.js";
import {meldTileSlots} from "../src/renderer/review-workspace.js";

const five:Tile={id:"5p",red:false}, red:Tile={id:"5p",red:true};
type Meld=ReviewBoardDto["melds"][number];
const pon=(sourceActor:number,actor=0):Meld=>({actor,sourceActor,kind:"pon",label:"碰",tiles:[red,five,five],calledTile:red});
describe("physical meld display",()=>{
  it.each([0,1,2,3])("uses the caller's own perspective for actor %i",actor=>{
    for(const [relative,index] of [[3,0],[2,1],[1,2]]){
      const slots=meldTileSlots(pon((actor+relative!)%4,actor));
      expect(slots.findIndex(x=>x.sideways)).toBe(index);
      expect(slots[index!]?.tile).toEqual(red);
      expect(slots).toHaveLength(3);
    }
  });
  it("places a middle chi tile on the left without losing its red identity",()=>{
    const slots=meldTileSlots({actor:0,sourceActor:3,kind:"chi",label:"吃",calledTile:red,tiles:[{id:"4p",red:false},red,{id:"6p",red:false}]});
    expect(slots.map(x=>x.tile.id)).toEqual(["5p","4p","6p"]);
    expect(slots[0]).toMatchObject({tile:red,sideways:true});
  });
  it.each([[3,0],[2,1],[1,3]])("reserves the fourth slot for a right-side open kan source %i",(source,index)=>{
    const slots=meldTileSlots({...pon(source),kind:"daiminkan",label:"明杠",tiles:[red,five,five,five]});
    expect(slots.findIndex(x=>x.sideways)).toBe(index);
    expect(slots).toHaveLength(4);
  });
  it("stacks the added red tile above the original non-red called tile",()=>{
    const slots=meldTileSlots({...pon(2),kind:"kakan",label:"加杠",tiles:[five,five,five,red],calledTile:five,addedTile:red});
    expect(slots).toHaveLength(3);
    expect(slots[1]).toMatchObject({tile:five,sideways:true,added:red});
    expect(slots.flatMap(x=>[x.tile,...(x.added?[x.added]:[])])).toHaveLength(4);
  });
  it("does not invent source positions for old records or unknown discarders",()=>{
    expect(meldTileSlots({actor:0,label:"碰",tiles:[red,five,five]}).some(x=>x.sideways)).toBe(false);
    expect(meldTileSlots({...pon(0),sourceActor:null}).some(x=>x.sideways)).toBe(false);
    const slots=meldTileSlots({...pon(2),kind:"ankan",tiles:[five,five,five,five]});
    expect(slots.map(x=>x.back)).toEqual([true,false,false,true]);
    expect(slots.some(x=>x.sideways)).toBe(false);
  });
});
describe("safe meld source projection",()=>{
  const pkg=StructuredAnalysisPackageSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/coach-package.json",import.meta.url),"utf8")));
  it("resolves original discard references for kakan while keeping source IDs private",()=>{
    const original=pkg.decisions.find(d=>d.outcome==="analysis_ready")!;
    if(original.outcome!=="analysis_ready")throw new Error("ready fixture missing");
    const decision=structuredClone(original),facts=decision.knownGameFacts;
    facts.rivers=[[],[],[{tile:five,actor:2,eventId:"called-secret",tsumogiri:false,afterRiichiEventIds:[]}],[]];
    facts.melds=[{meldRef:"meld-secret",actor:0,kind:"kakan",calledDiscardEventRef:"called-secret",tiles:[five,five,five,red]}];
    const board=presentReviewBoard(decision);
    expect(ReviewBoardSchema.parse(board).melds[0]).toMatchObject({kind:"kakan",sourceActor:2,calledTile:five,addedTile:red});
    expect(JSON.stringify(board)).not.toContain("secret");
    facts.melds[0]!.calledDiscardEventRef="missing";
    expect(presentReviewBoard(decision).melds[0]).toMatchObject({sourceActor:null,calledTile:null});
    const old={...board,melds:[{actor:0,label:"碰",tiles:[five,five,five]}]};
    expect(ReviewBoardSchema.safeParse(old).success).toBe(true);
  });
});
