import { ScenePatternFactsSchema, ScenePatternPacketSchema, SCENE_PATTERN_VERSION, type ScenePatternFacts, type ScenePatternResult, type KnowledgeTopic } from "@riichi-coach/contracts";

type Truth = boolean | null;
const any = (xs: Truth[]): Truth => xs.includes(true) ? true : xs.includes(null) ? null : false;
const and = (...xs: Truth[]): Truth => xs.includes(false) ? false : xs.includes(null) ? null : true;
const compare = (x:number|null, p:(v:number)=>boolean):Truth => x===null?null:p(x);
const unique = <T>(xs:T[]) => [...new Set(xs)];
/** Retrieval hypotheses only. This module neither chooses an action nor reads a model label. */
export function matchScenePatterns(raw: unknown) {
  const f=ScenePatternFactsSchema.parse(raw), rows:ScenePatternResult[]=[];
  type C=ScenePatternFacts["candidates"][number];
  const add=(id:ScenePatternResult["patternId"],title:string,question:string,topics:KnowledgeTopic[],tests: Array<{value:Truth; cs?:C[]; actors?:number[]; obs?:string; refs?:string[]}> ) => {
    const hits=tests.filter(x=>x.value===true), value=any(tests.map(x=>x.value));
    rows.push({patternId:id,ruleVersion:SCENE_PATTERN_VERSION,status:value===null?"insufficient_data":value?"matched":"not_matched",title,question,topics,
      observations:unique(hits.map(x=>x.obs??title)),actors:unique(hits.flatMap(x=>x.actors??[])),actionRefs:unique(hits.flatMap(x=>x.cs?.map(c=>c.actionRef)??[])),
      evidenceRefs:unique(hits.flatMap(x=>[...f.evidenceRefs,...(x.refs??[]),...(x.cs?.flatMap(c=>c.evidenceRefs)??[])]))});
  };
  const candidates=(predicate:(c:C)=>Truth, describe:(c:C)=>string) => f.candidates.map(c=>({value:predicate(c),cs:[c],obs:describe(c)}));
  const pairs=f.candidates.flatMap((a,i)=>f.candidates.slice(i+1).map(b=>[a,b] as const));
  const waitsDiffer=(a:C,b:C):Truth=>{
    if(a.waits===null||b.waits===null)return null;
    const left=[...a.waits].sort((x,y)=>x.tile34-y.tile34),right=[...b.waits].sort((x,y)=>x.tile34-y.tile34);
    if(JSON.stringify(left.map(x=>x.tile34))!==JSON.stringify(right.map(x=>x.tile34)))return true;
    return any(left.map((x,i)=>x.unseen===null||right[i]!.unseen===null?null:x.unseen!==right[i]!.unseen));
  };
  add("P01","对子手路线","七对子、对对和与面子手如何比较？",["pairs","chiitoitsu"],candidates(c=>and(f.noMeldOrKan,c.exactPairKinds===null?null:c.exactPairKinds.length>=4),c=>`${c.actionRef}：保留${c.exactPairKinds?.length}种恰好两枚的对子。`));
  add("P02","七对子进度接近","是否保留七对子路线，代价是什么？",["chiitoitsu","efficiency"],candidates(c=>and(f.noMeldOrKan,c.chiitoitsuShanten===null||c.standardShanten===null?null:c.chiitoitsuShanten<=2&&c.chiitoitsuShanten<=c.standardShanten+1),c=>`${c.actionRef}：七对子${c.chiitoitsuShanten}向听，一般形${c.standardShanten}向听。`));
  add("P03","役牌对子","役牌对子与其他牌形如何取舍？",["yakuhai"],[{value:f.selfYakuhaiPairKinds===null?null:f.selfYakuhaiPairKinds.length>0,obs:`当前手牌役牌对子34索引：${f.selfYakuhaiPairKinds}。`}]);
  add("P04","自家花色集中","染手路线的速度、打点和限制是什么？",["flush","efficiency"],[{value:f.selfSuitCounts===null?null:f.selfSuitCounts.some(n=>n>=8&&f.selfSuitCounts!.reduce((a,b)=>a+b,0)-n<=3),obs:`当前持有万筒索枚数分别为${f.selfSuitCounts}，含自家副露；不是已确认染手。`}]);
  add("P05","进张与保宝取舍","同向听时怎样权衡进张与宝牌？",["efficiency","dora"],pairs.map(([a,b])=>({value:[a.shanten,b.shanten,a.ukeire,b.ukeire,a.dora,b.dora].includes(null)?null:a.shanten===b.shanten&&(a.ukeire!-b.ukeire!)*(a.dora!-b.dora!)<0,cs:[a,b],obs:`${a.actionRef} / ${b.actionRef}：向听${a.shanten}/${b.shanten}，进张${a.ukeire}/${b.ukeire}，宝牌${a.dora}/${b.dora}。`} )));
  add("P06","听牌等待不同","如何比较等待、剩余未见枚数与改良？",["waits"],pairs.map(([a,b])=>({value:and(compare(a.shanten,n=>n===0),compare(b.shanten,n=>n===0),waitsDiffer(a,b)),cs:[a,b]})));
  add("P07","候选涉及振听","振听怎样影响该候选的和牌途径？",["furiten","waits"],candidates(c=>and(compare(c.shanten,n=>n===0),c.furiten),c=>`${c.actionRef}：候选等待涉及已确认振听。`));
  const riichi:Truth=f.acceptedRiichiActors===null?null:f.acceptedRiichiActors.length>0;
  add("P08","对手立直","应检索哪些对立直防守与押引条件？",["riichi-defense","push-fold"],[{value:riichi,actors:f.acceptedRiichiActors??[],obs:`已受理立直的对手座位：${f.acceptedRiichiActors}。`}]);
  add("P09","多家立直","如何同时评估多家威胁和共同安全牌？",["multi-defense","safe-tiles"],[{value:f.acceptedRiichiActors===null?null:f.acceptedRiichiActors.length>=2,actors:f.acceptedRiichiActors??[]}]);
  const open=f.opponents.map(o=>({value:any([compare(o.openMeldCount,n=>n>=2),o.exposedYakuhai,compare(o.exposedDora,n=>n>=2)]),actors:[o.actor],refs:o.evidenceRefs,obs:`座位${o.actor}：公开副露${o.openMeldCount}次，公开役牌刻子${o.exposedYakuhai}，公开宝牌${o.exposedDora}。不据此确认听牌。`}));
  add("P10","副露关注","如何评估副露手的速度与打点线索？",["open-defense","push-fold"],open);
  add("P11","对手副露花色集中","是否值得研究染手可能性及其例外？",["flush","reading","open-defense"],f.opponents.map(o=>({value:and(compare(o.openMeldCount,n=>n>=2),o.openNumericSuits===null?null:o.openNumericSuits.length===1),actors:[o.actor],refs:o.evidenceRefs,obs:`座位${o.actor}公开副露的数牌仅涉及花色${o.openNumericSuits}；未确认染手或听牌。`} )));
  add("P12","立直后仍切非现物","他家是否继续推进？还缺哪些押引和读牌依据？",["reading","push-fold"],f.recentNonGenbutsu===null?[{value:null}]:[{value:f.recentNonGenbutsu.length>0,actors:unique(f.recentNonGenbutsu.flatMap(x=>[x.actor,x.threatActor])),refs:f.recentNonGenbutsu.flatMap(x=>x.evidenceRefs),obs:"他家最近舍牌在另一家立直后，且不是舍牌前该家的现物。非现物不等于确定危险。"}]);
  const safeness=(c:C,actor:number):Truth=>c.safety.find(s=>s.actor===actor)?.genbutsu??null;
  const common=f.candidates.map(c=>({c,safe:f.acceptedRiichiActors===null?null:and(...f.acceptedRiichiActors.map(a=>safeness(c,a)))}));
  const knownCommon=unique(common.filter(x=>x.safe===true).map(x=>x.c.tile34)).length;
  const possibleCommon=unique(common.filter(x=>x.safe!==false).map(x=>x.c.tile34)).length;
  add("P13","共同现物不足","安牌不足时如何安排防守顺序？",["safe-tiles","multi-defense"],[{value:and(riichi,knownCommon>1?false:possibleCommon<=1?true:null),actors:f.acceptedRiichiActors??[],obs:`确认共同现物牌种${knownCommon}，可能共同现物牌种上限${possibleCommon}。`}]);
  const threat=any([riichi,any(open.map(x=>x.value))]);
  add("P14","接近听牌且有威胁","自家进度与他家威胁如何影响押引？",["push-fold"],candidates(c=>and(threat,compare(c.shanten,n=>n>=0&&n<=1)),c=>`${c.actionRef}：${c.shanten}向听，同时存在公开威胁线索。`));
  const efficiency=(a:C,b:C):Truth=>a.shanten===null||b.shanten===null?null:a.shanten!==b.shanten?a.shanten<b.shanten:a.ukeire===null||b.ukeire===null?null:a.ukeire>b.ukeire;
  add("P15","安牌与效率取舍","如何比较较快的非现物选择和较慢的现物选择？",["safe-tiles","push-fold"],f.acceptedRiichiActors===null?[{value:null}]:f.acceptedRiichiActors.flatMap(actor=>pairs.flatMap(([a,b])=>[[a,b],[b,a]].map(([fast,slow])=>({value:and(efficiency(fast!,slow!),safeness(fast!,actor)===null?null:!safeness(fast!,actor),safeness(slow!,actor)),cs:[fast!,slow!],actors:[actor]})))));
  add("P16","终盘听牌机会","如何权衡流局听牌价值与终盘风险？",["endgame","push-fold"],candidates(c=>and(compare(f.remainingDraws,n=>n<=16),compare(c.shanten,n=>n>=0&&n<=1)),c=>`剩余摸牌${f.remainingDraws}；${c.actionRef}为${c.shanten}向听。`));
  add("P17","南四点况","顺位与点差怎样改变本局目标？",["placement"],[{value:and(f.southFourHanchan,f.scoresKnown?true:null),obs:"半庄南四，四家点数信息完整；不假定必定在本局结束。"}]);
  add("P18","保有宝牌且有威胁","打点潜力与防守需求怎样取舍？",["dora","push-fold"],[{value:and(compare(f.selfDora,n=>n>=2),threat),obs:`自家当前保有${f.selfDora}枚宝牌，同时存在公开威胁线索；宝牌数不等于已确定打点。`}]);
  const groups=new Map<string,string[]>();
  for(const r of rows.filter(r=>r.status==="matched")) {const key=r.topics.join("/");groups.set(key,[...(groups.get(key)??[]),`[${r.patternId}] ${r.title}。关联座位：${r.actors.join(",")||"自家"}；涉及候选${r.actionRefs.length}个，具体数值见完整事实补充。研究问题：${r.question}`]);}
  return ScenePatternPacketSchema.parse({version:SCENE_PATTERN_VERSION,caseRef:f.caseRef,results:rows,text:["以下是检索关注点，不是打法结论；可自主补充主题、改写查询或不采纳。",...[...groups].map(([k,v])=>`${k}\n${v.join("\n")}`)].join("\n")});
}
