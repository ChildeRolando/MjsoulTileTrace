import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSplit,clusterInterval,hash } from './common.mjs';
import { boundedRetriever,validateGold } from './study.mjs';
import { mechanicalCitationCheck } from './evaluate.mjs';
import { arenaCorpus } from './knowledge.mjs';
import { createArenaRagRetriever } from '@riichi-coach/desktop/blind-discard-arena-rag';
import { ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { mapMjaiRecord } from '../replay-corpus/canonical.mjs';
import { replayCanonicalStream,buildScenePatternFacts,matchScenePatterns,JsonlFactEngineClient,ManagedFactEngineTransport } from '@riichi-coach/reasoning';
import { canonicalActionRef } from '@riichi-coach/contracts';
const knowledge=JSON.parse(await readFile(new URL('./knowledge.json',import.meta.url),'utf8'));
test('40 independent sourced cards with conditions, exceptions and no unverified diagrams',()=>{assert.equal(knowledge.cards.length,40);for(const c of knowledge.cards){assert.ok(c.content.length>=200&&c.content.length<=400);assert.match(c.source.htmlSha256,/^[a-f0-9]{64}$/);assert.equal(c.tileExamples.length,0);assert.ok(c.conditions&&c.exceptions);assert.equal(c.source.chapter,new URL(c.source.url).pathname);}assert.equal(new Set(knowledge.cards.map(c=>c.id)).size,40);});
test('existing lexical retriever searches expanded corpus with the same budget and dedup',async()=>{const aliases=new ArenaRunAliasVault(),caseRef=aliases.caseRef('test'),corpus=arenaCorpus(knowledge),map={};for(const c of knowledge.cards)map[aliases.reference(`blind-discard-arena-rag/v1\u0000${c.source.system}\u0000${c.id}`)]=c.id;const trace=[],r=boundedRetriever(createArenaRagRetriever({mode:'local',caseRef,aliases,loadCorpus:async()=>corpus}),trace,map);const a=await r.query({query:'七对子 面子手 对子',limit:5});assert.ok(a.passages.length>0&&a.passages.length<=3);const b=await r.query({query:'七对子 面子手 对子',limit:3});assert.equal(b.passages.length,0);await assert.rejects(r.query({query:'防守'}),/study_retrieval_budget/);assert.ok(trace[0].cardIds.every(Boolean));});
test('no hits creates no source; citation check refuses invented references',async()=>{const aliases=new ArenaRunAliasVault(),caseRef=aliases.caseRef('empty');const r=createArenaRagRetriever({mode:'local',caseRef,aliases,loadCorpus:async()=>arenaCorpus(knowledge)});const result=await r.query({query:'xyzunknownzz',limit:3});assert.equal(result.status,'no_hits');assert.deepEqual(result.sourceRefs,[]);const check=mechanicalCitationCheck({result:{events:[{type:'submission_locked',submission:{sourceRefs:['invented'],rationale:'x'}}]},retrieval:[],sourceMap:{}},knowledge);assert.equal(check.status,'invalid_reference');});
test('cluster interval respects games and reports insufficient groups',()=>{assert.deepEqual(clusterInterval([{gameId:'one',v:1}],x=>x[0].v),{estimate:1,low:null,high:null,games:1});const r=clusterInterval([{gameId:'a',v:1},{gameId:'b',v:1}],x=>x.reduce((n,y)=>n+y.v,0)/x.length);assert.equal(r.low,1);assert.equal(r.high,1);});
test('split rejects duplicate rounds and source games crossing groups',()=>{const c={gameId:'a',roundOrdinal:0,selfActor:0,split:'development'};assert.throws(()=>assertSplit([c,c]),/duplicate_round/);assert.throws(()=>assertSplit([c,{...c,split:'evaluation',roundOrdinal:1}]),/game_split/);});
test('gold cannot be replaced by an empty automated template',()=>{assert.throws(()=>validateGold({datasetHash:hash({}),knowledgeHash:hash(knowledge),reviewer:'',cases:[]},{},knowledge),/reviewer/);});
test('real mapper/replay prefix is invariant to opponent hidden hands and future actual discard',async()=>{
  const hand=['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p'];
  const rows=[{type:'start_game',names:['a','b','c','d']},{type:'start_kyoku',bakaze:'E',kyoku:1,honba:0,kyotaku:0,oya:0,scores:[25000,25000,25000,25000],dora_marker:'1s',tehais:[hand,hand,hand,hand]},{type:'tsumo',actor:0,pai:'5p'},{type:'dahai',actor:0,pai:'5p',tsumogiri:true},{type:'ryukyoku',reason:'yao9',scores:[25000,25000,25000,25000]},{type:'end_kyoku'},{type:'end_game',scores:[25000,25000,25000,25000]}];
  const changed=structuredClone(rows);changed[1].tehais[1]=['2s','2s','3s','3s','4s','4s','5s','5s','6s','6s','7s','7s','8s'];changed[3]={type:'dahai',actor:0,pai:'1m',tsumogiri:false};changed[0].mortalScores=[-999,999];
  const rules={length:'south',redFives:{man:1,pin:1,sou:1},openTanyao:true,atamahane:false,westExtension:'unknown',ippatsuCancelledByAnkan:'unknown'};
  const project=rs=>replayCanonicalStream(mapMjaiRecord(Buffer.from(rs.map(r=>JSON.stringify(r)).join('\n')),'test-prefix',0,rules))[0];
  const a=project(rows),b=project(changed);
  // Private archive fingerprints may change; they must never become a pattern or prompt field.
  const {factSetId:privateHashA,...visibleA}=a.facts,{factSetId:privateHashB,...visibleB}=b.facts;
  assert.notEqual(privateHashA,privateHashB);assert.deepEqual(visibleA,visibleB);
  const candidates=['1m','2m'].map(id=>{const action={kind:'discard',tile:{id,red:false},discardMode:'tedashi'};return {action,actionRef:canonicalActionRef(action),origins:['model']};});
  const engine=new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL('../../resources',import.meta.url))));
  try {const build=d=>buildScenePatternFacts({caseRef:'test-case',snapshot:d.snapshot,facts:d.facts,candidates,engine,reference:r=>r});const x=await build(a),y=await build(b);assert.deepEqual(x,y);assert.deepEqual(matchScenePatterns(x),matchScenePatterns(y));}finally{await engine.close();}
});
