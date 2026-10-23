import {ScenePatternFactsSchema,ExtendedScenePatternPacketSchema,EXTENDED_SCENE_PATTERN_VERSION,type ExtendedScenePatternResult,type ScenePatternFacts,type KnowledgeTopic} from "@riichi-coach/contracts";
type Truth=boolean|null;
const any=(xs:Truth[]):Truth=>xs.includes(true)?true:xs.includes(null)?null:false;
const every=(xs:Truth[]):Truth=>xs.includes(false)?false:xs.includes(null)?null:true;
const unique=<T>(xs:T[])=>[...new Set(xs)];
/** Optional retrieval questions only; the original eighteen-pattern packet stays unchanged. */
export function matchExtendedScenePatterns(raw:unknown,coverage?:{completeLegalActionRefs:readonly string[]}){
 const f=ScenePatternFactsSchema.parse(raw),results:ExtendedScenePatternResult[]=[];
 type C=ScenePatternFacts["candidates"][number];
 const pairs=f.candidates.flatMap((a,i)=>f.candidates.slice(i+1).map(b=>[a,b] as const));
 const add=(patternId:ExtendedScenePatternResult["patternId"],title:string,question:string,topics:KnowledgeTopic[],tests:{value:Truth;cs:C[];observation:string;actors?:number[]}[])=>{
  const value=any(tests.map(x=>x.value)),hits=tests.filter(x=>x.value===true);
  results.push({patternId,ruleVersion:EXTENDED_SCENE_PATTERN_VERSION,status:value===null?"insufficient_data":value?"matched":"not_matched",title,question,topics,observations:unique(hits.map(x=>x.observation)),actors:unique(hits.flatMap(x=>x.actors??[])),actionRefs:unique(hits.flatMap(x=>x.cs.map(c=>c.actionRef))),evidenceRefs:unique(hits.flatMap(x=>[...f.evidenceRefs,...x.cs.flatMap(c=>c.evidenceRefs)]))});
 };
 add("P19","向听与保宝取舍","降低向听与保留宝牌发生取舍时，退向听保宝需要哪些价值和速度条件？",["efficiency","dora"],pairs.map(([a,b])=>({value:a.shanten===null||b.shanten===null||a.dora===null||b.dora===null?null:(a.shanten-b.shanten)*(a.dora-b.dora)>0,cs:[a,b],observation:`${a.actionRef}/${b.actionRef}：向听${a.shanten}/${b.shanten}，保有宝牌${a.dora}/${b.dora}；宝牌数不是确定打点。`})));
 add("P20","等待未见牌耗尽","等待牌未见枚数合计为零时，如何研究换听和手牌改良？",["waits","efficiency"],f.candidates.map(c=>({value:c.shanten===null?null:c.shanten!==0?false:c.waits===null?null:c.waits.length===0?false:every(c.waits.map(w=>w.unseen===null?null:w.unseen===0)),cs:[c],observation:`${c.actionRef}：听牌等待的未见枚数合计为0；未见枚数不是活牌山枚数。`})));
 const completeCandidates=coverage&&coverage.completeLegalActionRefs.length===f.candidates.length&&new Set(coverage.completeLegalActionRefs).size===f.candidates.length&&f.candidates.every(c=>coverage.completeLegalActionRefs.includes(c.actionRef))?true:null;
 const threat=any([f.acceptedRiichiActors===null?null:f.acceptedRiichiActors.length>0,...f.opponents.map(o=>any([o.openMeldCount===null?null:o.openMeldCount>=2,o.exposedYakuhai,o.exposedDora===null?null:o.exposedDora>=2]))]);
 add("P21","慢手面对公开威胁","全部合法弃牌候选均离听牌至少两步时，如何研究慢手押引与弃和？",["push-fold","safe-tiles"],[{value:every([completeCandidates,threat,...f.candidates.map(c=>c.shanten===null?null:c.shanten>=2)]),cs:f.candidates,actors:unique([...(f.acceptedRiichiActors??[]),...f.opponents.filter(o=>(o.openMeldCount??0)>=2||o.exposedYakuhai||(o.exposedDora??0)>=2).map(o=>o.actor)]),observation:"所有合法弃牌候选均至少二向听，且存在立直或公开副露威胁线索；副露不等于已听牌。"}]);
 add("P22","役牌对子拆留","拆掉役牌对子与保留役牌对子时，应比较哪些速度、役和防守条件？",["yakuhai","efficiency"],pairs.map(([a,b])=>({value:a.yakuhaiPairKinds===null||b.yakuhaiPairKinds===null||f.selfYakuhaiPairKinds===null?null:f.selfYakuhaiPairKinds.some(t=>a.yakuhaiPairKinds!.includes(t)!==b.yakuhaiPairKinds!.includes(t)),cs:[a,b],observation:`${a.actionRef}/${b.actionRef}：保留役牌对子34索引${a.yakuhaiPairKinds}/${b.yakuhaiPairKinds}；不由此推断必须碰牌。`})));
 return ExtendedScenePatternPacketSchema.parse({version:EXTENDED_SCENE_PATTERN_VERSION,caseRef:f.caseRef,results,text:["补充检索关注点，不是行动推荐或教材适用边界。",...results.filter(r=>r.status==="matched").map(r=>`[${r.patternId}] ${r.title}。${r.observations.join(" ")}研究问题：${r.question}`)].join("\n")});
}
