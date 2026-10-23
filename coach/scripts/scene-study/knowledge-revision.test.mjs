import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { KNOWLEDGE_TOPICS } from '@riichi-coach/contracts';
import { reviseKnowledge } from './revise-knowledge.mjs';
import { compareDrafts } from './compare-annotations.mjs';
import { hash } from './common.mjs';

const previous=JSON.parse(await readFile(new URL('./knowledge.json',import.meta.url),'utf8'));
const spec=JSON.parse(await readFile(new URL('./knowledge-v2-revisions.json',import.meta.url),'utf8'));
const sources=Object.fromEntries(previous.cards.map(c=>[c.id,{sha256:c.source.htmlSha256,url:c.source.url,title:c.source.title,text:'Synthetic provenance fixture, not textbook evidence.'}]));
test('revision preserves the frozen knowledge and all non-condition content',()=>{
  const original=JSON.stringify(previous),{knowledge,audit}=reviseKnowledge(previous,spec,sources,'2026-10-23T00:00:00Z');
  expect(JSON.stringify(previous)).toBe(original);expect(knowledge.parentKnowledgeHash).toBe(hash(previous));expect(audit).toHaveLength(40);
  for(const card of knowledge.cards){const old=previous.cards.find(c=>c.id===card.id);for(const key of ['id','title','topics','concept','source','tileExamples','imagePolicy'])expect(card[key]).toEqual(old[key]);expect(card.content.length).toBeGreaterThanOrEqual(200);expect(card.content.length).toBeLessThanOrEqual(400);expect(card.conditions).not.toEqual(old.conditions);}
  expect(knowledge.cards.filter(c=>c.exceptions!==previous.cards.find(o=>o.id===c.id).exceptions).map(c=>c.id)).toEqual(['b09','a01','a04','a09']);
});
test('revision refuses missing/duplicate card audits and mismatched original source',()=>{
  const duplicate=structuredClone(spec);duplicate.revisions[1]=duplicate.revisions[0];expect(()=>reviseKnowledge(previous,duplicate,sources,'now')).toThrow('revision_card_identity');
  const changed=structuredClone(sources);changed.b12.url='https://example.org/wrong';expect(()=>reviseKnowledge(previous,spec,changed,'now')).toThrow('revision_source_binding');
});
function pair(){
  const dataset={cases:Array.from({length:60},(_,i)=>({id:String(i),gameId:String(Math.floor(i/6)),split:'evaluation',stratum:i%6<4?'random':'challenge'}))};
  const before={datasetHash:hash(dataset),cases:dataset.cases.map(c=>({caseId:c.id,topics:KNOWLEDGE_TOPICS.map(topic=>({topic,need:'optional',gap:false,chapters:['b01'],confidence:'medium',reason:'test'})),notes:''}))};
  const after=structuredClone(before);return {dataset,before,after};
}
test('gap resolution distinguishes a new chapter match from merely downgrading the need',()=>{
  const {dataset,before,after}=pair();
  for(const i of [0,1])Object.assign(before.cases[i].topics[0],{need:'required',gap:true,chapters:[]});
  Object.assign(after.cases[0].topics[0],{need:'required',chapters:['b01']});
  Object.assign(after.cases[2].topics[0],{need:'required',gap:true,chapters:[]});
  const result=compareDrafts(dataset,before,after);
  expect(result.oldRequiredGaps).toBe(2);expect(result.newRequiredGaps).toBe(1);expect(result.oldGapsNowRequiredWithChapters).toBe(1);expect(result.oldGapsNowDowngraded).toBe(1);expect(result.newGapItems).toHaveLength(1);expect(result.kind).toContain('not_accuracy');
  expect(result.gapCountChangePerCase.random.games).toBe(10);
});
test('comparison rejects unpaired, incomplete and altered datasets; chapter order is not a change',()=>{
  const {dataset,before,after}=pair();before.cases[0].topics[0].chapters=['b01','a01'];after.cases[0].topics[0].chapters=['a01','b01'];expect(compareDrafts(dataset,before,after).changedTopicDecisions).toBe(0);
  const incomplete=structuredClone(after);incomplete.cases[0].topics[0].need=null;expect(()=>compareDrafts(dataset,before,incomplete)).toThrow('complete_paired_60');
  const missing=structuredClone(after);missing.cases[1]=missing.cases[0];expect(()=>compareDrafts(dataset,before,missing)).toThrow('complete_paired_60');
  expect(()=>compareDrafts({...dataset,changed:true},before,after)).toThrow('dataset_binding');
});
test('explicit failure report retains all 60 cases without treating missing labels as no gaps',()=>{
  const {dataset,before,after}=pair();
  Object.assign(before.cases[0].topics[0],{need:'required',gap:true,chapters:[]});
  after.cases[0].topics.forEach(t=>Object.assign(t,{need:null,gap:false,chapters:[]}));
  const result=compareDrafts(dataset,before,after,{allowIncomplete:true});
  expect(result.cases).toBe(60);expect(result.pairedCases).toBe(59);expect(result.topicDecisions).toBe(944);
  expect(result.oldRequiredGapsAll60).toBe(1);expect(result.oldRequiredGaps).toBe(0);
  expect(result.incompleteCaseIds).toEqual(['0']);expect(result.gapCountChangePerCase.all).toBe(null);
  expect(result.allOldGapItems[0].after.need).toBe(null);expect(result.oldGapsNowDowngraded).toBe(0);
});
