import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile,rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetLedger, BUDGETS, assertDataset, chooseVersion,writeOnce,save } from './ceiling-protocol.mjs';
import { indexTextbook, retrieveTextbook } from './ceiling-textbook.mjs';
import { pairedDifference, summarizeRows, decide } from './ceiling-report.mjs';
import { decisionRequest,runDecision,serviceFailureStreak,parseSelection } from './ceiling-run.mjs';
import { hash,read } from './ceiling-protocol.mjs';
import { assertStudySource,selfWindows,loadPreparationState,savePreparationState } from './ceiling-prepare.mjs';

describe('ceiling research boundaries', () => {
  it('stops material curation on transport failure instead of consuming the next question',()=>{
    for(const failureCode of ['cli_unexpected_event','cli_unexpected_item','rate_limited'])
      expect(()=>parseSelection({response:{status:'provider_error',failureCode}},'select_chapters',['C001'])).toThrow('oracle_provider_service_failure_stop');
    expect(()=>parseSelection({response:{status:'ready',call:{name:'select_chapters',arguments:'bad json'}}},'select_chapters',['C001'])).toThrow(SyntaxError);
  });
  it('round-trips compact checkpoints through immutable case digests and rejects edited case files',async()=>{
    const out=await mkdtemp(join(tmpdir(),'ceiling-case-refs-')),c={id:'a'.repeat(24),payload:'visible facts'},state={cases:[c],nextRecord:1,covered:[]};
    await writeOnce(join(out,'prepared',c.id+'.json'),c);await savePreparationState(out,state);
    expect((await read(join(out,'prepare-state.json'))).cases).toBeUndefined();
    expect(await loadPreparationState(out)).toEqual(state);
    await writeFile(join(out,'prepared',c.id+'.json'),JSON.stringify({...c,payload:'changed'}));
    await expect(loadPreparationState(out)).rejects.toThrow(/case_changed/);
  });
  it('retries a Windows file-occupancy failure without dropping or weakening the checkpoint',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'ceiling-checkpoint-')),path=join(dir,'state.json');await writeFile(path,JSON.stringify({cases:1}));let attempts=0;
    await save(path,{cases:2},{renameFile:async(...args)=>{if(++attempts<3)throw Object.assign(Error('occupied'),{code:'EPERM'});return rename(...args);},delay:async()=>{}});
    expect(attempts).toBe(3);expect(await read(path)).toEqual({cases:2});
  });
  it('keeps the same game-level West exclusion after lazy snapshot optimization',()=>{
    expect(()=>assertStudySource({completeness:{scores:'complete'},events:[{type:'round_started',roundWind:'E'},{type:'round_started',roundWind:'W'}]})).toThrow(/unsupported_round_wind/);
    expect(()=>assertStudySource({completeness:{scores:'partial'},events:[]})).toThrow(/incomplete/);
    expect(selfWindows({selfActor:0,events:[{type:'tile_drawn',actor:0,tile:{visibility:'visible'},eventId:'draw'},{type:'riichi_declared',actor:0,eventId:'riichi'},{type:'pon_called',actor:0,eventId:'pon'}]}).map(w=>w.kind)).toEqual(['self_turn','post_riichi_discard','post_call_discard']);
  });
  it('publishes immutable files atomically and does not replace a conflicting payload',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'ceiling-atomic-')),path=join(dir,'artifact.json');
    await Promise.all([writeOnce(path,{value:'x'.repeat(100000)}),writeOnce(path,{value:'x'.repeat(100000)})]);
    expect((await read(path)).value).toHaveLength(100000);
    await expect(writeOnce(path,{value:'changed'})).rejects.toThrow(/changed/);
  });
  it('counts actual requests before dispatch, keeps crash claims, and rejects duplicate or exhausted requests', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ceiling-ledger-'));
    const ledger = new BudgetLedger(dir, { smoke: 2 });
    ledger.claim('a', 'smoke', 'digest');
    ledger.settle('a', { status: 'provider_error' });
    ledger.claim('b', 'smoke', 'digest'); // process dies before settlement
    const resumed = new BudgetLedger(dir, { smoke: 2 });
    expect(() => resumed.claim('b', 'smoke', 'digest')).toThrow(/duplicate/);
    expect(() => resumed.claim('c', 'smoke', 'digest')).toThrow(/budget/);
    expect(resumed.snapshot()).toMatchObject({ claimed: 2, unsettled: 1 });
    expect(Object.values(BUDGETS).reduce((a,b)=>a+b,0)).toBe(6000);
  });
  it('rejects cross-split source collisions and never promotes a tiny dataset to the full experiment', () => {
    const c = { id:'a',gameId:'g',sourceHash:'h',split:'development',stratum:'random' };
    expect(()=>assertDataset({cases:[c,{...c,id:'b',gameId:'g2',split:'evaluation'}]})).toThrow();
    expect(()=>assertDataset({cases:[c]})).toThrow(/quota/);
  });
  it('indexes the entire corpus past the old 256 passage limit and keeps whole arguments and figure transcription', () => {
    const units = Array.from({length:300},(_,i)=>({unitId:`u${i}`,chapterId:`c${i}`,chapterTitle:'条件',title:'牌效率',topics:['牌效率'],source:{},blocks:[{id:`p${i}`,type:'p',text:'通常选择进张较多的候选，但有立直威胁时必须比较安全性。'},{id:`f${i}`,type:'figure',figure:{caption:'牌例',transcription:{hand:'123m456p789s1122z',conditions:'南四，落后',decision:'示例'}}}]}));
    const index=indexTextbook({units,corpusId:'x'});
    expect(index.passages).toHaveLength(300);
    const found=retrieveTextbook(index,{query:'牌效率',topics:[]},'V0');
    expect(found.passages.length).toBeGreaterThan(0);
    expect(found.passages.length).toBeLessThanOrEqual(6);
    expect(found.passages.every(p=>p.content.includes('但有立直威胁')&&p.content.includes('123m456p789s1122z'))).toBe(true);
    expect(found.characters).toBeLessThanOrEqual(6000);
  });
  it('does not silently trim an over-budget argument or treat navigation as teaching', () => {
    const units=[{unitId:'huge',chapterId:'c',title:'牌效率',topics:[],blocks:[{type:'p',text:'牌效率'.repeat(3000)}]},{unitId:'nav',chapterId:'n',title:'牌效率',contentRole:'navigation',topics:[],blocks:[{type:'p',text:'牌效率'}]}];
    const result=retrieveTextbook(indexTextbook({units}),{query:'牌效率',topics:[]},'V0');
    expect(result.passages).toHaveLength(0);
    expect(result.rejected.some(x=>x.reason==='whole_argument_over_budget')).toBe(true);
  });
  it('retains failures in denominators and uses paired differences rather than independent groups', () => {
    const rows=[{caseId:'1',gameId:'g1',arm:'A',match:0,status:'timeout'},{caseId:'1',gameId:'g1',arm:'D',match:1,status:'submitted'},{caseId:'2',gameId:'g2',arm:'A',match:1,status:'submitted'},{caseId:'2',gameId:'g2',arm:'D',match:1,status:'submitted'}];
    expect(summarizeRows(rows.filter(r=>r.arm==='A'))).toMatchObject({planned:2,matches:1,rate:.5});
    expect(pairedDifference(rows,'D','A')).toMatchObject({estimate:.5,pairs:2});
    expect(decide({complete:false})).toMatch(/未完成/);
  });
  it('keeps partial usage as a lower bound, leaves unknown fields null, and never adds cached input twice',()=>{
    const s=summarizeRows([{status:'submitted',match:1,usage:{inputTokens:100,cachedInputTokens:40,outputTokens:20,totalTokens:120}},{status:'timeout',match:0,usage:{inputTokens:50,cachedInputTokens:10}},{status:'provider_error',match:0}]);
    expect(s.knownTokensLowerBound).toBe(170);expect(s.unknownUsage).toBe(2);
    expect(s.usageFields.inputTokens).toMatchObject({knownSum:150,unknownRuns:1});
    expect(summarizeRows([{status:'timeout',match:0}]).usageFields.totalTokens.knownSum).toBe(null);
  });
  it('selects on development natural cases only, then Q loss, rule count, and creation order', () => {
    const rows=[{version:'r1',stratum:'random',match:1,regret:1},{version:'r2',stratum:'random',match:1,regret:.5},{version:'r1',stratum:'challenge',match:1,regret:0},{version:'r2',stratum:'challenge',match:0,regret:100}];
    expect(chooseVersion(rows,[{id:'r1',ruleCount:18},{id:'r2',ruleCount:20}])).toBe('r2');
  });
  it('hash-binds the append-only ledger and refuses edited accounting', async () => {
    const dir=await mkdtemp(join(tmpdir(),'ceiling-tamper-')),ledger=new BudgetLedger(dir,{smoke:2});ledger.claim('a','smoke','request');
    const path=join(dir,'calls.jsonl');await writeFile(path,(await readFile(path,'utf8')).replace('request','tampered'));
    expect(()=>new BudgetLedger(dir,{smoke:2})).toThrow(/binding/);
  });
});

// This fixture was produced through the real canonical/rules/facts projection,
// not by inventing a looser version of the public schemas.
describe('real projected case request and resume',()=>{
  it('halts on unmapped provider failures and keeps every failed request spent',async()=>{
    const c=JSON.parse(await readFile(new URL('./ceiling-case.fixture.json',import.meta.url),'utf8'));
    const index=indexTextbook({units:[]}),out=await mkdtemp(join(tmpdir(),'ceiling-circuit-')),ledger=new BudgetLedger(out,{smoke:10});
    const codes=['cli_unexpected_event','cli_unexpected_item','future_unmapped_diagnostic','must_not_dispatch'];let requests=0,streak=0;
    const providerFactory=()=>({request:async()=>({status:'provider_error',failureCode:codes[requests++]})});
    for(let i=0;i<codes.length;i++){
      const row=await runDecision({out,ledger,c,arm:'A',version:'V0',index,key:'failure-'+i,bucket:'smoke',providerFactory});
      streak=serviceFailureStreak(streak,row);if(streak>=3)break;
    }
    expect(requests).toBe(3);expect(ledger.snapshot()).toMatchObject({claimed:3,settled:3,unsettled:0});
    await runDecision({out,ledger,c,arm:'A',version:'V0',index,key:'failure-0',bucket:'smoke',providerFactory});
    expect(requests).toBe(3);expect(serviceFailureStreak(2,{status:'timeout'})).toBe(3);
    expect(serviceFailureStreak(2,{status:'submitted'})).toBe(0);
  });
  it('cannot expose privileged canaries, performs one request, validates citations and never repeats it',async()=>{
    const fixture=JSON.parse(await readFile(new URL('./ceiling-case.fixture.json',import.meta.url),'utf8')),c={...fixture,gameId:'GAME_CANARY',privateLabels:{answer:'LABEL_CANARY'},actualAction:'ACTUAL_CANARY',future:'FUTURE_CANARY',binding:{secret:'BINDING_CANARY'}};
    const index=indexTextbook({units:[{unitId:'u',chapterId:'c',chapterTitle:'牌效率',title:'牌效率',topics:['牌效率'],blocks:[{id:'p',type:'p',text:'没有其他因素时比较进张，但有威胁时比较安全性。'}]}]});
    const context=decisionRequest(c,'D','r2',index),wire=JSON.stringify(context.request);
    expect(()=>decisionRequest({...c,facts:{...c.facts,mortalQ:1}},'D','r2',index)).toThrow();
    for(const secret of ['LABEL_CANARY','ACTUAL_CANARY','FUTURE_CANARY','BINDING_CANARY','GAME_CANARY'])expect(wire).not.toContain(secret);
    const out=await mkdtemp(join(tmpdir(),'ceiling-call-')),ledger=new BudgetLedger(out,{smoke:2});let requests=0;
    const submission={caseRef:c.observation.caseRef,actionRef:c.observation.candidates[0].actionRef,rationale:'依据当前候选事实比较。',evidenceRefs:[],sourceRefs:[],mainAlternative:null,uncertainty:'未评估隐藏信息。'};
    const providerFactory=()=>({request:async()=>{requests++;return {status:'ready',call:{name:'submit_decision',arguments:JSON.stringify(submission)},outputBytes:100};}});
    const job={out,ledger,c,arm:'D',version:'r2',index,key:'one',bucket:'smoke',providerFactory};
    expect((await runDecision(job)).status).toBe('submitted');expect((await runDecision(job)).status).toBe('submitted');expect(requests).toBe(1);expect(ledger.snapshot().claimed).toBe(1);
    const forged={...submission,sourceRefs:['arena-ref:v1:00000000-0000-4000-8000-000000000000']};
    expect((await runDecision({...job,key:'two',providerFactory:()=>({request:async()=>({status:'ready',call:{name:'submit_decision',arguments:JSON.stringify(forged)},outputBytes:100})})})).status).toBe('invalid_submission');
  });
});
