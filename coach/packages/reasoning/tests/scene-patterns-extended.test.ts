import {describe,it,expect} from "vitest";
import {matchExtendedScenePatterns} from "../src/scene-patterns-extended.js";
import {matchScenePatterns} from "../src/scene-patterns.js";
import {patternFixture} from "./fixtures/scene-patterns.js";
import type {ScenePatternFacts} from "@riichi-coach/contracts";
type Edit=(f:ScenePatternFacts)=>void;
const cases:Array<[string,Edit,Edit,Edit]>=[
 ["P19",f=>{f.candidates[0]!.shanten=1;f.candidates[0]!.dora=0;f.candidates[1]!.shanten=2;f.candidates[1]!.dora=1;},f=>{f.candidates[1]!.dora=0;},f=>{f.candidates[1]!.dora=null;}],
 ["P20",f=>{f.candidates[0]!.shanten=0;f.candidates[0]!.waits=[{tile34:0,unseen:0}];},f=>{f.candidates[0]!.waits=[{tile34:0,unseen:1}];},f=>{f.candidates[0]!.waits=[{tile34:0,unseen:null}];}],
 ["P21",f=>{f.acceptedRiichiActors=[1];f.candidates.forEach(c=>c.shanten=2);},f=>{f.candidates[1]!.shanten=1;},f=>{f.candidates[1]!.shanten=null;}],
 ["P22",f=>{f.selfYakuhaiPairKinds=[31];f.candidates[0]!.yakuhaiPairKinds=[31];},f=>{f.candidates[1]!.yakuhaiPairKinds=[31];},f=>{f.candidates[1]!.yakuhaiPairKinds=null;}],
];
describe("optional textbook coverage patterns",()=>{
 for(const [id,yes,no,missing] of cases)for(const [name,edit,status] of [["positive",yes,"matched"],["negative boundary",(f:ScenePatternFacts)=>{yes(f);no(f);},"not_matched"],["missing",(f:ScenePatternFacts)=>{yes(f);missing(f);},"insufficient_data"]] as const)it(`${id} ${name}`,()=>{const f=patternFixture();edit(f);expect(matchExtendedScenePatterns(f,{completeLegalActionRefs:f.candidates.map(c=>c.actionRef)}).results.find(r=>r.patternId===id)!.status).toBe(status);});
 it("does not compare raw ukeire across shanten levels or mutate the original packet",()=>{const f=patternFixture(),original=matchScenePatterns(f);f.candidates[1]!.shanten=4;f.candidates[1]!.ukeire=40;expect(matchExtendedScenePatterns(f).results[0]!.status).toBe("not_matched");expect(original.results).toHaveLength(18);expect(original.version).toBe("scene-patterns/v1");});
 it("reports insufficient data when the candidate set is only a subset or has no completeness proof",()=>{const f=patternFixture();f.acceptedRiichiActors=[1];expect(matchExtendedScenePatterns(f).results[2]!.status).toBe("insufficient_data");expect(matchExtendedScenePatterns(f,{completeLegalActionRefs:[...f.candidates.map(c=>c.actionRef),"another-action"]}).results[2]!.status).toBe("insufficient_data");});
 it("does not call cutting a yakuhai triplet to a pair a broken original pair",()=>{const f=patternFixture();f.candidates[0]!.yakuhaiPairKinds=[31];expect(matchExtendedScenePatterns(f).results[3]!.status).toBe("not_matched");f.selfYakuhaiPairKinds=null;expect(matchExtendedScenePatterns(f).results[3]!.status).toBe("insufficient_data");});
 it("does not infer a dead wait from an empty wait set",()=>{const f=patternFixture();f.candidates[0]!.shanten=0;f.candidates[0]!.waits=[];expect(matchExtendedScenePatterns(f).results[1]!.status).toBe("not_matched");});
 it("rejects future, hidden, chosen and label input",()=>{for(const key of ["futureEvents","opponentHands","actualAction","mortalScores"])expect(()=>matchExtendedScenePatterns({...patternFixture(),[key]:"CANARY"})).toThrow();});
});
