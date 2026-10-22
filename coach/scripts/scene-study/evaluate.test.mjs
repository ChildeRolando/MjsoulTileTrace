import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KNOWLEDGE_TOPICS,canonicalActionRef } from '@riichi-coach/contracts';
import { hash,save,read } from './common.mjs';
import { codeDigest } from './study.mjs';
import { report } from './evaluate.mjs';

test('synthetic report fixtures exercise missing gold, grouped benefits, cost and blind failure gates',async()=>{
  const out=await mkdtemp(join(tmpdir(),'scene-study-evaluation-test-'));
  try{
    const knowledge=await read(new URL('./knowledge.json',import.meta.url));
    const candidates=['1m','2m'].map((id,i)=>({actionRef:canonicalActionRef({kind:'discard',tile:{id,red:false},discardMode:'tedashi'}),tile34:i,exactPairKinds:[],yakuhaiPairKinds:[],suitCounts:[4,4,4],shanten:3,standardShanten:3,chiitoitsuShanten:4,ukeire:10,dora:0,waits:[],furiten:false,safety:[{actor:1,genbutsu:false}],evidenceRefs:['fact']}));
    const facts={version:'scene-pattern-facts/v1',caseRef:'synthetic',selfActor:0,noMeldOrKan:true,selfDora:0,selfYakuhaiPairKinds:[],selfSuitCounts:[4,4,4],acceptedRiichiActors:[1],opponents:[1,2,3].map(actor=>({actor,openMeldCount:0,exposedYakuhai:false,exposedDora:0,openNumericSuits:[],evidenceRefs:['fact']})),recentNonGenbutsu:[],remainingDraws:40,southFourHanchan:false,scoresKnown:true,candidates,evidenceRefs:['fact']};
    const cases=Array.from({length:180},(_,i)=>({id:'synthetic-'+i,gameId:'game-'+Math.floor(i/6),roundOrdinal:i%6,selfActor:0,split:i<120?'development':'evaluation',stratum:i<120?'development':i%6<4?'random':'challenge',facts}));
    const evaluation=cases.slice(120),blindIds=[...evaluation.filter(c=>c.stratum==='random').slice(0,32),...evaluation.filter(c=>c.stratum==='challenge').slice(0,16)].map(c=>c.id),dataset={cases,blindIds};
    const config={datasetHash:hash(dataset),knowledgeHash:hash(knowledge),codeHash:await codeDigest(),provider:{modelName:'synthetic-test-only'}};
    await save(join(out,'dataset.json'),dataset);await save(join(out,'knowledge.json'),knowledge);await save(join(out,'freeze.json'),config);
    let result=await report(out);assert.equal(result.recognition,null);assert.match(result.decision,/尚未验证/);
    const gold={datasetHash:hash(dataset),knowledgeHash:hash(knowledge),reviewer:'synthetic fixture, not an expert',reviewedAt:new Date().toISOString(),cases:evaluation.map(c=>({caseId:c.id,topics:KNOWLEDGE_TOPICS.map(topic=>({topic,need:topic==='push-fold'?'required':'optional',gap:false,chapters:topic==='push-fold'?['b19']:[]}))}))};
    await save(join(out,'gold.json'),gold);await save(join(out,'gold-receipt.json'),{hash:hash(gold)});
    for(const c of evaluation)for(const arm of ['A','B','C','D']){const d=arm==='D',sourceRefs=d?['returned']:[];await save(join(out,'runs',`${c.id}-${arm}.json`),{caseId:c.id,gameId:c.gameId,stratum:c.stratum,split:'evaluation',arm,status:'completed',result:{elapsedMs:100,providerUsage:{status:'reported',tokens:{inputTokens:d?110:90,outputTokens:10}},events:[{type:'submission_locked',submission:{rationale:'测'.repeat(500),sourceRefs}}]},retrieval:d?[{cardIds:['b19'],result:{sourceRefs}}]:[],sourceMap:d?{returned:'b19'}:{}});}
    const key=blindIds.map((caseId,i)=>({caseId,label:'Q'+i,left:'D',right:'B'}));await save(join(out,'blind-key.private.json'),key);
    const ratings={datasetHash:hash(dataset),freezeHash:hash(config),reviewer:'synthetic fixture, not an expert',reviewedAt:new Date().toISOString(),cases:key.map(k=>({label:k.label,left:[2,2,2,2,2],right:[1,1,1,1,1],winner:'left',severeLeft:false,severeRight:false,coveredLeft:['push-fold'],coveredRight:[]}))};await save(join(out,'ratings.json'),ratings);
    result=await report(out);assert.equal(result.blind.all.wins,48);assert.equal(result.blind.random.cases,32);assert.equal(result.blind.challenge.cases,16);assert.equal(result.retrieval.byStratum.all.DminusB.low,1);assert.equal(result.costRatioDtoB,1.2);assert.equal(result.decision,'在本次范围内验证有效');assert.equal(result.citations.length,240);
    ratings.cases[0].severeLeft=true;await save(join(out,'ratings.json'),ratings);result=await report(out);assert.match(result.decision,/未达到/);
  }finally{await rm(out,{recursive:true,force:true});}
},30000);
