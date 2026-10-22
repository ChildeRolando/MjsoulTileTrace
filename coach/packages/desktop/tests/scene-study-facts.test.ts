import { afterAll,describe,it,expect } from 'vitest';
import { resolve } from 'node:path';
import { canonicalActionRef,sortTilesCanonical,type Tile } from '@riichi-coach/contracts';
import { buildScenePatternFacts,currentHandPatternFacts,JsonlFactEngineClient,ManagedFactEngineTransport,matchScenePatterns } from '@riichi-coach/reasoning';
import { makeArenaMcpCase } from './fixtures/arena-mcp-case.js';

const engine=new JsonlFactEngineClient(new ManagedFactEngineTransport(resolve('resources')));
afterAll(()=>engine.close());
const t=(id:Tile['id'],red=false):Tile=>({id,red});
describe('scene facts use the existing hand engine and candidate projection',()=>{
 it('red normalization and four identical tiles do not create two pairs',async()=>{
   const x=makeArenaMcpCase(),snapshot=structuredClone(x.authorizedCase.binding.decisionSnapshot),facts=structuredClone(x.authorizedCase.facts);
   const tiles=sortTilesCanonical([t('1m'),t('1m'),t('1m'),t('1m'),t('5m'),t('5m',true),t('2p'),t('2p'),t('3s'),t('3s'),t('4s'),t('7s'),t('9s')]);
   snapshot.privateState.concealedTiles=tiles;facts.concealedTiles=tiles;
   const candidates=['7s','9s'].map(id=>{const action={kind:'discard' as const,tile:t(id as Tile['id']),discardMode:'tedashi' as const};return {action,actionRef:canonicalActionRef(action),origins:['model' as const]};});
   const result=await buildScenePatternFacts({caseRef:x.observation.caseRef,snapshot,facts,candidates,engine,reference:r=>x.aliases.reference(r)});
   for(const c of result.candidates){expect(c.exactPairKinds).toEqual([4,10,20]);expect(c.dora).toBeGreaterThanOrEqual(1);expect(c.exactPairKinds).not.toContain(0);}
   expect(matchScenePatterns(result).results.find(p=>p.patternId==='P01')!.status).toBe('not_matched');
 },30000);
 it('current shape is measured before a candidate discard and unknown melds remain unknown',()=>{
   const x=makeArenaMcpCase(),s=structuredClone(x.authorizedCase.binding.decisionSnapshot);
   const before=currentHandPatternFacts(s);expect(before.selfSuitCounts?.reduce((a,b)=>a+b,0)).toBe(14);
   s.publicState.fields.melds='unknown';expect(currentHandPatternFacts(s).selfSuitCounts).toBeNull();
 });
 it('changing excluded labels and future envelopes cannot change projected facts',async()=>{
   const x=makeArenaMcpCase(),base={caseRef:x.observation.caseRef,snapshot:x.authorizedCase.binding.decisionSnapshot,facts:x.authorizedCase.facts,candidates:x.authorizedCase.binding.candidates.map(c=>({actionRef:c.actionRef,action:c.action,origins:['model' as const]})),engine,reference:(r:string)=>x.aliases.reference(r)};
   const a=await buildScenePatternFacts({...base,futureEvents:['future-A'],opponentHands:['secret-A'],actualAction:'A',mortalScores:[100]} as typeof base);
   const b=await buildScenePatternFacts({...base,futureEvents:['future-B'],opponentHands:['secret-B'],actualAction:'B',mortalScores:[-100]} as typeof base);
   expect(a).toEqual(b);expect(matchScenePatterns(a)).toEqual(matchScenePatterns(b));
 },30000);
});
