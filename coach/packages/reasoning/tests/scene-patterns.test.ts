import { describe,it,expect } from 'vitest';
import { ScenePatternFactsSchema,type ScenePatternFacts } from '@riichi-coach/contracts';
import {patternFixture} from './fixtures/scene-patterns.js';
import { matchScenePatterns } from '../src/scene-patterns.js';
import { recentNonGenbutsuFacts } from '../src/scene-pattern-facts.js';

type Edit=(f:ScenePatternFacts)=>void;
const riichi:Edit=f=>{f.acceptedRiichiActors=[1];};
const examples:Array<[string,Edit,Edit,Edit]>=[
 ['P01',f=>{f.candidates[0]!.exactPairKinds=[0,1,2,3];},f=>{f.candidates[0]!.exactPairKinds=[0,1,2];},f=>{f.noMeldOrKan=null;}],
 ['P02',f=>{f.candidates[0]!.chiitoitsuShanten=2;f.candidates[0]!.standardShanten=1;},f=>{f.candidates[0]!.standardShanten=0;},f=>{f.candidates[0]!.standardShanten=null;}],
 ['P03',f=>{f.selfYakuhaiPairKinds=[31];},f=>{f.selfYakuhaiPairKinds=[];},f=>{f.selfYakuhaiPairKinds=null;}],
 ['P04',f=>{f.selfSuitCounts=[8,2,1];},f=>{f.selfSuitCounts=[8,2,2];},f=>{f.selfSuitCounts=null;}],
 ['P05',f=>{f.candidates[0]!.ukeire=11;f.candidates[1]!.dora=1;},f=>{f.candidates[0]!.ukeire=10;},f=>{f.candidates[0]!.ukeire=null;}],
 ['P06',f=>{f.candidates.forEach(c=>c.shanten=0);f.candidates[0]!.waits=[{tile34:3,unseen:4}];f.candidates[1]!.waits=[{tile34:3,unseen:3}];},f=>{f.candidates[1]!.waits=[{tile34:3,unseen:4}];},f=>{f.candidates[1]!.waits=[{tile34:3,unseen:null}];}],
 ['P07',f=>{f.candidates[0]!.shanten=0;f.candidates[0]!.furiten=true;},f=>{f.candidates[0]!.shanten=1;},f=>{f.candidates[0]!.furiten=null;}],
 ['P08',riichi,f=>{f.acceptedRiichiActors=[];},f=>{f.acceptedRiichiActors=null;}],
 ['P09',f=>{f.acceptedRiichiActors=[1,2];},riichi,f=>{f.acceptedRiichiActors=null;}],
 ['P10',f=>{f.opponents[0]!.openMeldCount=2;},f=>{f.opponents[0]!.openMeldCount=1;},f=>{f.opponents[0]!.openMeldCount=null;}],
 ['P11',f=>{f.opponents[0]!.openMeldCount=2;f.opponents[0]!.openNumericSuits=[0];},f=>{f.opponents[0]!.openNumericSuits=[0,1];},f=>{f.opponents[0]!.openNumericSuits=null;}],
 ['P12',f=>{f.recentNonGenbutsu=[{actor:2,threatActor:1,evidenceRefs:['past']}];},f=>{f.recentNonGenbutsu=[];},f=>{f.recentNonGenbutsu=null;}],
 ['P13',f=>{riichi(f);f.candidates[0]!.safety[0]!.genbutsu=true;},f=>{f.candidates[1]!.safety[0]!.genbutsu=true;},f=>{f.candidates[1]!.safety[0]!.genbutsu=null;}],
 ['P14',f=>{riichi(f);f.candidates[0]!.shanten=1;},f=>{f.candidates[0]!.shanten=2;},f=>{f.candidates[0]!.shanten=null;}],
 ['P15',f=>{riichi(f);f.candidates[0]!.shanten=1;f.candidates[1]!.safety[0]!.genbutsu=true;},f=>{f.candidates[1]!.safety[0]!.genbutsu=false;},f=>{f.candidates[1]!.safety[0]!.genbutsu=null;}],
 ['P16',f=>{f.remainingDraws=16;f.candidates[0]!.shanten=1;},f=>{f.remainingDraws=17;},f=>{f.remainingDraws=null;}],
 ['P17',f=>{f.southFourHanchan=true;},f=>{f.southFourHanchan=false;},f=>{f.scoresKnown=false;}],
 ['P18',f=>{riichi(f);f.selfDora=2;},f=>{f.selfDora=1;},f=>{f.selfDora=null;}],
];
const status=(f:ScenePatternFacts,id:string)=>matchScenePatterns(f).results.find(x=>x.patternId===id)!.status;
describe('18 scene patterns: positives, negative boundaries and missing data',()=>{
 for(const [id,yes,no,missing] of examples) for(const [name,edit,want] of [['positive',yes,'matched'],['negative boundary',(f:ScenePatternFacts)=>{yes(f);no(f);},'not_matched'],['missing',(f:ScenePatternFacts)=>{yes(f);missing(f);},'insufficient_data']] as const)it(`${id} ${name}`,()=>{const f=patternFixture();edit(f);expect(status(f,id)).toBe(want);});
 it('all patterns coexist without suppressing defense or placement',()=>{const f=patternFixture();examples.forEach(([,edit])=>edit(f));const r=matchScenePatterns(f);expect(r.results).toHaveLength(18);expect(r.text).toContain('P17');expect(r.text).toContain('P08');});
 it('closed kan and open meld both exclude chiitoitsu routes',()=>{for(const [id,yes] of examples.slice(0,2)){const f=patternFixture();yes(f);f.noMeldOrKan=false;expect(status(f,id)).toBe('not_matched');}});
 it('different ordering of identical waits does not trigger',()=>{const f=patternFixture();examples[5]![1](f);f.candidates[0]!.waits=[{tile34:1,unseen:2},{tile34:4,unseen:3}];f.candidates[1]!.waits=[...f.candidates[0]!.waits].reverse();expect(status(f,'P06')).toBe('not_matched');});
 it('red and normal copies count as one common safe tile type',()=>{const f=patternFixture();riichi(f);f.candidates[1]!.tile34=0;f.candidates.forEach(c=>c.safety[0]!.genbutsu=true);expect(status(f,'P13')).toBe('matched');});
 it('each riichi opponent has a separate safety set',()=>{const f=patternFixture();f.acceptedRiichiActors=[1,2];f.candidates.forEach(c=>c.safety[0]!.genbutsu=true);expect(status(f,'P13')).toBe('matched');f.candidates.forEach(c=>c.safety[1]!.genbutsu=true);expect(status(f,'P13')).toBe('not_matched');});
 it('one open meld can trigger via exposed yakuhai or two dora',()=>{for(const key of ['exposedYakuhai','exposedDora'] as const){const f=patternFixture();f.opponents[0]![key]=(key==='exposedDora'?2:true) as never;expect(status(f,'P10')).toBe('matched');}});
 it('strict DTO rejects future data and labels instead of forwarding them',()=>{for(const key of ['futureEvents','opponentHands','actualAction','mortalScores'])expect(()=>ScenePatternFactsSchema.parse({...patternFixture(),[key]:'CANARY'})).toThrow();});
 it('duplicates and impossible measurements are rejected',()=>{const f=patternFixture();f.candidates[0]!.exactPairKinds=[1,1,2,3];expect(()=>matchScenePatterns(f)).toThrow();f.candidates[0]!.exactPairKinds=[];f.candidates[0]!.ukeire=-1;expect(()=>matchScenePatterns(f)).toThrow();});
});

describe('P12 historical information boundary',()=>{
 const ref=(n:number)=>`game:history/0/${n}/0`;
 const discard=(actor:number,n:number,id='5m')=>({actor,eventId:ref(n),tile:{id,red:false},tsumogiri:false,afterRiichiEventIds:n>3?[ref(3)]:[]});
 function input(){return {snapshot:{publicState:{riichiStates:[{actor:1,status:'accepted',declarationEventRef:ref(3),acceptanceEventRef:ref(4)}]}},facts:{actor:0,completeness:{eventSequence:true,rivers:true,responseOpportunities:true},rivers:[[],[discard(1,3,'1m')],[discard(2,8)],[]],defenseThreats:[{actor:1,kind:'riichi',sourceEventRefs:[ref(3)]}]}};}
 it('discard itself and later same tile do not become historical genbutsu',()=>{const x=input();x.facts.rivers[1]!.push(discard(1,10));const out=recentNonGenbutsuFacts(x.snapshot as never,x.facts as never);expect(out).toEqual([{actor:2,threatActor:1,evidenceRefs:[ref(8),ref(4)]}]);});
 it('earlier own river and earlier post-riichi pass make actor 2 genbutsu',()=>{for(const actor of [1,3]){const x=input();x.facts.rivers[actor]!.unshift(discard(actor,6));expect(recentNonGenbutsuFacts(x.snapshot as never,x.facts as never)?.filter(r=>r.actor===2)).toEqual([]);}});
 it('unaccepted riichi and pre-riichi latest discard do not trigger',()=>{const x=input();x.snapshot.publicState.riichiStates[0]!.status='declared';expect(recentNonGenbutsuFacts(x.snapshot as never,x.facts as never)).toEqual([]);x.snapshot.publicState.riichiStates[0]!.status='accepted';x.facts.rivers[2]=[discard(2,2)];expect(recentNonGenbutsuFacts(x.snapshot as never,x.facts as never)).toEqual([]);});
 it('unknown chronology is explicitly insufficient',()=>{const x=input();x.facts.completeness.eventSequence=false;expect(recentNonGenbutsuFacts(x.snapshot as never,x.facts as never)).toBeNull();});
});
