import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { appendFile, mkdir } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedMortalRuntimeFromAssets } from '@riichi-coach/mortal-runtime';
import { questionLabNativeReceipt } from '@riichi-coach/question-lab';
import { replayCanonicalStream,createLibriichiRuleProjector,buildScenePatternFacts,matchScenePatterns,JsonlFactEngineClient,ManagedFactEngineTransport } from '@riichi-coach/reasoning';
import { createArenaBlindRuleRequest,screenArenaDecisions,createArenaBlindObservation,createArenaToolBinding,ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { mapMjaiRecord } from '../replay-corpus/canonical.mjs';
import { ScenePatternFactsSchema } from '@riichi-coach/contracts';
import { VERSION,SEED,hash,ordered,read,save,exists,assertSplit } from './common.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
// Same documented Tenhou GO profile as tenhou-source; unobserved rules stay unknown.
export function tenhouRules(locator) {
  const m=locator.match(/\d{10}gm-([0-9a-f]{4})-/); if(!m)throw new Error('study_unknown_game_type');
  const t=parseInt(m[1],16);if(!(t&1)||(t&16)||!(t&8))throw new Error('study_requires_four_player_south');
  const red=t&2?0:1; return {length:'south',redFives:{man:red,pin:red,sou:red},openTanyao:!(t&4),atamahane:false,westExtension:'unknown',ippatsuCancelledByAnkan:'unknown'};
}
const category=f=>{
  const hits=matchScenePatterns(f).results.filter(x=>x.status==='matched').map(x=>x.patternId);
  return {hits, kinds:[...(hits.some(x=>['P01','P02'].includes(x))?['pairs']:[]),...(hits.some(x=>['P08','P10'].includes(x))?['threat']:[]),...(hits.some(x=>['P01','P02','P04'].includes(x))&&hits.some(x=>['P08','P10'].includes(x))?['combined']:[]),...(!hits.includes('P10')&&f.opponents.some(x=>x.openMeldCount===1)||f.candidates.some(x=>x.exactPairKinds?.length===3)&&!hits.includes('P01')?['near-miss']:[])]};
};
export async function prepare({database,out,maxGames=300}) {
  await mkdir(join(out,'prepared-games-v2'),{recursive:true});
  if(await exists(join(out,'dataset.json'))) {const frozen=await read(join(out,'dataset.json'));assertSplit(frozen.cases);return frozen;}
  const db=new DatabaseSync(database,{readOnly:true});
  const records=db.prepare("SELECT v.game_id,v.hash,o.locator FROM variants v JOIN observations o ON o.hash=v.hash WHERE o.source='nikke-tenhou' AND v.format='mjai' GROUP BY v.game_id ORDER BY v.game_id").all();
  const sorted=ordered(records,x=>x.game_id).slice(0,maxGames);
  const assets=process.env.RIICHI_LOCAL_MORTAL_ROOT??join(process.env.LOCALAPPDATA,'RiichiCoach/local-mortal-spike');
  const runtime=await createManagedMortalRuntimeFromAssets({pythonExecutable:join(assets,'python/Scripts/python.exe'),packageRoot:join(root,'packages/mortal-runtime'),artifactRoot:assets,platformManifest:'mortal-582500.windows-x64.json',nativeReceiptPath:await questionLabNativeReceipt(),inferenceTimeoutMs:60000});
  const engine=new JsonlFactEngineClient(new ManagedFactEngineTransport(join(root,'resources')));
  const all=[];let dev=0,test=0;
  try {
    for(const record of sorted) {
      if(dev===20&&test===10)break;
      const cache=join(out,'prepared-games-v2',hash(record.game_id)+'.json');let pool;
      try {
        if(await exists(cache)){pool=await read(cache);pool.forEach(c=>ScenePatternFactsSchema.parse(c.facts));}
        else {
          const rules=tenhouRules(record.locator), raw=zstdDecompressSync(db.prepare('SELECT data FROM variants WHERE hash=?').get(record.hash).data);
          const selfActor=parseInt(hash(SEED+record.game_id).slice(0,2),16)%4;
          const stream=mapMjaiRecord(raw,record.game_id,selfActor,rules), decisions=replayCanonicalStream(stream), project=createLibriichiRuleProjector(stream,runtime.ruleIdentity);
          pool=[];const rounds=new Set();
          // Explore a bounded random ordering of decisions, independent of recorded choices/outcomes.
          for(const {d,i} of ordered(decisions.map((d,i)=>({d,i})),x=>record.game_id+':'+x.i)) {
            if(pool.length>=10)break;
            if(rounds.has(d.snapshot.publicState.roundOrdinal)||!['self_turn','post_call_discard'].includes(d.snapshot.privateState.decisionWindow.kind))continue;
            const ruleRequest=createArenaBlindRuleRequest(project(d)),ruleResponse=await runtime.queryRules(ruleRequest);
            const selected=screenArenaDecisions([{canonicalDecisionOrder:i,decision:{decisionEventRef:d.decisionEventRef,snapshot:d.snapshot,facts:d.facts},ruleRequest,ruleResponse}]).selected[0];
            if(!selected)continue;
            const aliases=new ArenaRunAliasVault(),observation=createArenaBlindObservation({selected,aliases});
            const facts=await buildScenePatternFacts({caseRef:observation.caseRef,snapshot:selected.snapshot,facts:selected.facts,candidates:selected.candidates.map(c=>({actionRef:c.actionRef,action:c.action,origins:['model']})),engine,reference:r=>aliases.reference(r)});
            pool.push({id:hash(record.game_id+':'+i).slice(0,24),gameId:record.game_id,sourceHash:record.hash,sourceLocator:record.locator,roundOrdinal:d.snapshot.publicState.roundOrdinal,selfActor,canonicalDecisionOrder:i,observation,facts,binding:createArenaToolBinding({caseRef:observation.caseRef,selected}),selection:category(facts)});
            rounds.add(d.snapshot.publicState.roundOrdinal);
          }
          await save(cache,pool);
        }
        if(pool.length<6)throw new Error('study_game_has_fewer_than_six_eligible_rounds');
        // Allocate complete games alternately, then fill the larger development split.
        const evaluation=test<10&&(dev>=20||dev>=test*2);
        let chosen;
        if(evaluation){
          const random=ordered(pool,x=>x.id,'random').slice(0,4),ids=new Set(random.map(x=>x.id));
          const challenge=ordered(pool.filter(x=>!ids.has(x.id)&&x.selection.kinds.length),x=>x.id,'challenge').slice(0,2);
          if(challenge.length<2)throw new Error('study_challenge_quota_unavailable');
          chosen=[...random.map(x=>({...x,stratum:'random'})),...challenge.map(x=>({...x,stratum:'challenge'}))];test++;
        }else {chosen=ordered(pool,x=>x.id).slice(0,6).map(x=>({...x,stratum:'development'}));dev++;}
        all.push(...chosen.map(x=>({...x,split:evaluation?'evaluation':'development'})));
        console.log(JSON.stringify({preparedDevelopmentGames:dev,preparedEvaluationGames:test,cases:all.length}));
      }catch(e){await appendFile(join(out,'prepare-exclusions.jsonl'),JSON.stringify({gameId:record.game_id,error:String(e.message),at:new Date().toISOString()})+'\n');console.log(JSON.stringify({excluded:record.game_id,error:e.message}));}
    }
    await save(join(out,'sample-status.json'),{development:dev*6,evaluation:test*6,developmentGames:dev,evaluationGames:test,required:{development:120,evaluation:60},cases:all.map(x=>x.id)});
    assertSplit(all);
    for(const category of ['pairs','threat','combined','near-miss'])if(!all.some(c=>c.stratum==='challenge'&&c.selection.kinds.includes(category)))throw new Error(`study_challenge_coverage_missing:${category}`);
    const blindIds=['random','challenge'].flatMap(s=>ordered(all.filter(x=>x.stratum===s),x=>x.id,'blind').slice(0,s==='random'?32:16).map(x=>x.id));
    const dataset={version:VERSION,seed:SEED,createdAt:new Date().toISOString(),rulesIdentity:runtime.ruleIdentity,factIdentity:await engine.identity(),cases:all,blindIds};
    await save(join(out,'dataset.json'),dataset);await save(join(out,'dataset.sha256.json'),{sha256:hash(dataset)});return dataset;
  }finally{db.close();await Promise.allSettled([runtime.close(),engine.close()]);}
}
