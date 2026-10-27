import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { appendFile, readdir, mkdir,rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { createManagedMortalRuntimeFromAssets,loadManagedMortalManifest } from '@riichi-coach/mortal-runtime';
import { questionLabNativeReceipt } from '@riichi-coach/question-lab';
import { freezeDecisionStreamContext,freezeDecisionSnapshotInContext,projectKnownGameFactsV2,createLibriichiRuleProjector,buildScenePatternFacts,matchScenePatterns,bindLocalMortalRuleScores,JsonlFactEngineClient,ManagedFactEngineTransport } from '@riichi-coach/reasoning';
import { createArenaBlindRuleRequest,screenArenaDecisions,createArenaBlindObservation,createArenaToolBinding,createArenaReferenceLabel,ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { projectArenaLocalMortalRuleScoring } from '@riichi-coach/desktop/blind-discard-arena-scorer';
import { mapMjaiRecord } from '../replay-corpus/canonical.mjs';
import { tenhouRules } from '../scene-study/prepare.mjs';
import { snapshotTextbook,VERSIONS } from './ceiling-textbook.mjs';
import { ROOT,VERSION,SEED,QUOTAS,BUDGETS,MODELS,BudgetLedger,hash,read,save,writeOnce,exists,ordered,assertDataset,executionFiles,verify,DEFAULT_DATABASE,DEFAULT_SNAPSHOT } from './ceiling-protocol.mjs';

export async function priorSources(parent,out){
  const games=new Set(),hashes=new Set(),files=[];
  const visit=x=>{if(!x||typeof x!=='object')return;if(typeof x.gameId==='string')games.add(x.gameId);if(typeof x.sourceHash==='string')hashes.add(x.sourceHash);for(const v of Object.values(x))if(v&&typeof v==='object')visit(v);};
  async function scan(dir,depth=0){
    if(depth>5)return;
    for(const e of await readdir(dir,{withFileTypes:true})){
      const p=join(dir,e.name);
      if(e.isDirectory()&&/prepared|formal|smoke|cases|pilot/.test(e.name))await scan(p,depth+1);
      else if(e.isFile()&&e.name.endsWith('.json')&&(/dataset|freeze|selected|sample/.test(e.name)||/prepared/.test(dir))){
        const data=await read(p);visit(data);files.push({path:p,digest:hash(data)});
      }
    }
  }
  for(const e of await readdir(parent,{withFileTypes:true}))if(e.isDirectory()&&join(parent,e.name)!==out&&/study|ablation|selfrag|ceiling/.test(e.name)&&e.name!==basename(out))await scan(join(parent,e.name));
  return {games:[...games].sort(),hashes:[...hashes].sort(),files};
}
function challengeTags(c){
  const ids=matchScenePatterns(c.facts).results.filter(p=>p.status==='matched').map(p=>p.patternId),f=c.facts;
  return [...ids,...(ids.length>=3?['conflict']:[]),...(f.southFourHanchan?['placement']:[]),...(ids.length===0?['no-hit']:[]),...(f.candidates.some(x=>x.exactPairKinds?.length===3)||f.opponents.some(o=>o.openMeldCount===1)?['near-boundary']:[])];
}
export function selfWindows(stream){
  return stream.events.flatMap(e=>{
    if(e.type==='tile_drawn'&&e.actor===stream.selfActor&&e.tile.visibility==='visible')return [{kind:'self_turn',actor:stream.selfActor,triggerEventRef:e.eventId}];
    if(['chi_called','pon_called'].includes(e.type)&&e.actor===stream.selfActor)return [{kind:'post_call_discard',actor:stream.selfActor,triggerEventRef:e.eventId}];
    if(e.type==='riichi_declared'&&e.actor===stream.selfActor)return [{kind:'post_riichi_discard',actor:stream.selfActor,triggerEventRef:e.eventId}];
    return [];
  });
}
export function oneDecision(context,window){
  const snapshot=freezeDecisionSnapshotInContext(context,window),facts=projectKnownGameFactsV2({stream:context.stream,decisionWindow:window,cachedSnapshot:snapshot,streamContext:context});
  // This is a pending research decision. Recorded resolution is deliberately absent.
  return {decisionEventRef:window.triggerEventRef,snapshot,facts,actualDiscard:null,actualAction:null};
}
export function assertStudySource(stream){
  if(stream.completeness.scores!=='complete')throw Error('rules_input_incomplete');
  // Full replay's KnownGameFacts projection rejects West rounds. Keep that
  // game-level eligibility rule when only materializing selected windows.
  if(stream.events.some(e=>e.type==='round_started'&&e.roundWind==='W'))throw Error('known_facts_v2_unsupported_round_wind');
}
export async function loadPreparationState(out){
  const path=join(out,'prepare-state.json');
  if(!await exists(path))return {cases:[],nextRecord:0,screening:{},rejectedGames:0,covered:[]};
  const stored=await read(path);if(stored.checkpointVersion===undefined)return stored;
  if(stored.checkpointVersion!=='case-refs/v1'||!Array.isArray(stored.caseRefs))throw Error('preparation_checkpoint_invalid');
  const {caseRefs,checkpointVersion,...metadata}=stored,cases=[];
  for(const ref of caseRefs){
    if(!/^[a-f0-9]{24}$/.test(ref.id)||!/^[a-f0-9]{64}$/.test(ref.digest))throw Error('preparation_checkpoint_invalid');
    const c=await read(join(out,'prepared',ref.id+'.json'));if(c.id!==ref.id||hash(c)!==ref.digest)throw Error('preparation_checkpoint_case_changed');cases.push(c);
  }
  return {...metadata,cases};
}
export async function savePreparationState(out,state,digests=new Map()){
  const {cases,...metadata}=state;
  const caseRefs=cases.map(c=>{if(!digests.has(c.id))digests.set(c.id,hash(c));return {id:c.id,digest:digests.get(c.id)};});
  await save(join(out,'prepare-state.json'),{...metadata,checkpointVersion:'case-refs/v1',caseRefs});
}
export async function prepareCeiling({out,database=DEFAULT_DATABASE,snapshot=DEFAULT_SNAPSHOT}){
  await mkdir(out,{recursive:true});
  await snapshotTextbook(out,snapshot);
  if(await exists(join(out,'dataset.json'))){const d=await read(join(out,'dataset.json'));assertDataset(d);return d;}
  const exclusionsPath=join(out,'prior-sources.json');
  const prior=await exists(exclusionsPath)?await read(exclusionsPath):await priorSources('E:/AgentData/Coach',out);await writeOnce(exclusionsPath,prior);
  const excluded=new Set(prior.games),excludedHashes=new Set(prior.hashes);
  const db=new DatabaseSync(database,{readOnly:true});
  const records=ordered(db.prepare("SELECT v.game_id,v.hash,MIN(o.locator) locator FROM variants v JOIN observations o ON o.hash=v.hash WHERE o.source='nikke-tenhou' AND v.format='mjai' GROUP BY v.game_id,v.hash ORDER BY v.game_id,v.hash").all().filter(r=>!excluded.has(r.game_id)&&!excludedHashes.has(r.hash)),x=>x.game_id+':'+x.hash,SEED+'games');
  const assets=process.env.RIICHI_LOCAL_MORTAL_ROOT??join(process.env.LOCALAPPDATA,'RiichiCoach/local-mortal-spike');
  const runtime=await createManagedMortalRuntimeFromAssets({pythonExecutable:join(assets,'python/Scripts/python.exe'),packageRoot:join(ROOT,'packages/mortal-runtime'),artifactRoot:assets,platformManifest:'mortal-582500.windows-x64.json',nativeReceiptPath:await questionLabNativeReceipt(),inferenceTimeoutMs:60000});
  const engine=new JsonlFactEngineClient(new ManagedFactEngineTransport(join(ROOT,'resources')));
  const slots=Object.entries(QUOTAS).flatMap(([split,strata])=>Object.entries(strata).flatMap(([stratum,n])=>Array.from({length:n},()=>({split,stratum}))));
  let state=await loadPreparationState(out);const caseDigests=new Map(state.cases.map(c=>[c.id,hash(c)]));
  const usedGames=new Set(state.cases.map(c=>c.gameId)),usedHashes=new Set(state.cases.map(c=>c.sourceHash));
  try{
    for(let ri=state.nextRecord;ri<records.length&&state.cases.length<slots.length;ri++){
      const r=records[ri],slot=slots[state.cases.length];state.nextRecord=ri+1;
      if(usedGames.has(r.game_id)||usedHashes.has(r.hash))continue;
      try{
        const raw=zstdDecompressSync(db.prepare('SELECT data FROM variants WHERE hash=?').get(r.hash).data);
        const selfActor=parseInt(hash(SEED+'seat'+r.game_id).slice(0,2),16)%4;
        const stream=mapMjaiRecord(raw,r.game_id,selfActor,tenhouRules(r.locator));
        // The existing projector also requires complete source scores. Reject the
        // same inadmissible sources before paying to reduce all their events.
        assertStudySource(stream);
        const cachePath=join(out,'preparation-cache',hash(r.game_id)+'.'+slot.stratum+'.json');let pool;
        if(await exists(cachePath)){
          const cached=await read(cachePath),b=cached.body;
          if(hash(b)!==cached.digest||b.version!=='visible-pool/v1'||b.seed!==SEED||b.mode!==slot.stratum||b.sourceHash!==r.hash||b.gameId!==r.game_id||b.selfActor!==selfActor||!Array.isArray(b.pool)||b.pool.some(c=>c.gameId!==r.game_id||c.sourceHash!==r.hash||c.selfActor!==selfActor))throw Error('preparation_cache_changed');
          pool=b.pool;state.screening.cacheHits=(state.screening.cacheHits??0)+1;
        }else{
        const context=freezeDecisionStreamContext(stream),windows=selfWindows(stream),project=createLibriichiRuleProjector(context.stream,runtime.ruleIdentity,context);pool=[];
        for(const {window,i}of ordered(windows.map((window,i)=>({window,i})),x=>r.game_id+':'+x.i,SEED+'windows')){
          if(!['self_turn','post_call_discard'].includes(window.kind))continue;
          const d=oneDecision(context,window);
          const ruleRequest=createArenaBlindRuleRequest(project(d)),ruleResponse=await runtime.queryRules(ruleRequest);
          const screening=screenArenaDecisions([{canonicalDecisionOrder:i,decision:{decisionEventRef:d.decisionEventRef,snapshot:d.snapshot,facts:d.facts},ruleRequest,ruleResponse}]);
          state.screening.checked=(state.screening.checked??0)+1;
          for(const [key,n]of Object.entries(screening.exclusionCounts))state.screening[key]=(state.screening[key]??0)+n;
          const selected=screening.selected[0];if(!selected)continue;
          const aliases=new ArenaRunAliasVault(),observation=createArenaBlindObservation({selected,aliases});
          const facts=await buildScenePatternFacts({caseRef:observation.caseRef,snapshot:selected.snapshot,facts:selected.facts,candidates:selected.candidates.map(c=>({actionRef:c.actionRef,action:c.action,origins:['model']})),engine,reference:ref=>aliases.reference(ref)});
          const c={id:hash(SEED+r.game_id+':'+i).slice(0,24),gameId:r.game_id,sourceHash:r.hash,sourceLocator:r.locator,selfActor,canonicalDecisionOrder:i,roundOrdinal:d.snapshot.publicState.roundOrdinal,observation,facts,binding:createArenaToolBinding({caseRef:observation.caseRef,selected}),...slot};
          pool.push(c);if(pool.length===(slot.stratum==='challenge'?6:1))break;
        }
        const body={version:'visible-pool/v1',seed:SEED,mode:slot.stratum,selfActor,sourceHash:r.hash,gameId:r.game_id,pool:pool.map(({split,stratum,...c})=>c)};
        await writeOnce(cachePath,{body,digest:hash(body)});
        }
        if(!pool.length)throw Error('no_eligible_pure_discard');
        const rank=c=>challengeTags(c).filter(t=>!state.covered.includes(t)).length*100+challengeTags(c).length;
        const picked=slot.stratum==='challenge'?[...pool].sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id))[0]:pool[0],c={...picked,...slot};
        await writeOnce(join(out,'prepared',c.id+'.json'),c);
        state.cases.push(c);caseDigests.set(c.id,hash(c));state.covered=[...new Set([...state.covered,...challengeTags(c)])];usedGames.add(c.gameId);usedHashes.add(c.sourceHash);
        console.log(JSON.stringify({prepared:state.cases.length,required:980,split:c.split,stratum:c.stratum,screening:state.screening.checked}));
      }catch(e){if(e.message==='preparation_cache_changed'||e.message.startsWith('immutable_artifact_changed')||/^E[A-Z]+$/.test(e.code??''))throw e;state.rejectedGames++;await appendFile(join(out,'exclusions.jsonl'),JSON.stringify({gameId:r.game_id,sourceHash:r.hash,error:String(e.message)})+'\n');}
      await savePreparationState(out,state,caseDigests);
    }
    const cases=state.cases;
    const oracle=['random','challenge'].flatMap(s=>ordered(cases.filter(c=>c.split==='evaluation'&&c.stratum===s),c=>c.id,SEED+'oracle').slice(0,s==='random'?150:50).map(c=>c.id));
    const practical=['random','challenge'].flatMap(s=>ordered(cases.filter(c=>oracle.includes(c.id)&&c.stratum===s),c=>c.id,SEED+'practical').slice(0,s==='random'?75:25).map(c=>c.id));
    const stability=['random','challenge'].flatMap(s=>ordered(cases.filter(c=>c.split==='evaluation'&&c.stratum===s),c=>c.id,SEED+'stability').slice(0,s==='random'?40:10).map(c=>c.id));
    const dataset={version:VERSION,seed:SEED,database,priorSourcesDigest:hash(prior),excludedGames:prior.games,excludedHashes:prior.hashes,ruleIdentity:runtime.ruleIdentity,factIdentity:await engine.identity(),screening:state.screening,rejectedGames:state.rejectedGames,sourcePopulation:'nikke-tenhou four-player south without West-extension games; equal game weight; one seeded seat and uniformly permuted eligible pure discard window',cases,oracle,practical,stability};
    assertDataset(dataset);await writeOnce(join(out,'dataset.json'),dataset);return dataset;
  }finally{db.close();await Promise.allSettled([engine.close(),runtime.close()]);}
}
export async function freezeCeiling(out,{repair=false}={}){
  if(!repair&&await exists(join(out,'freeze.json')))return verify(out);
  const d=await read(join(out,'dataset.json'));assertDataset(d);
  const index=await read(join(out,'textbook/index.json')),manifest=await read(join(out,'textbook/manifest.json')),files=await executionFiles();
  const basis={X01:index.passages.filter(p=>(p.title+' '+p.chapterTitle).includes('牌效率')||(p.title+' '+p.chapterTitle).includes('牌效')).map(p=>p.id),X02:['nemata-direction'],X03:'missing-data guard from strict visible-facts contract; not a teaching rule'};
  if(!basis.X01.length||!index.passages.some(p=>p.id==='nemata-direction'))throw Error('new_pattern_textbook_basis_missing');
  const f={version:VERSION,datasetHash:hash(d),textbookDigest:hash(index),textbookManifestHash:hash(manifest),codeDigest:hash(files),executionFiles:files,versions:VERSIONS,newPatternBasis:basis,budgets:BUDGETS,models:MODELS,limits:{maxPassages:6,maxCharacters:6000,maxOutputTokens:32768,timeoutMs:120000,maxInputBytes:65536,maxOutputBytes:16384,concurrency:2},primary:'D-A, natural 600 planned attempts, native Mortal preferred top1',secondary:['D-V0','D-B','D-C'],statistics:{pairedBootstrap:2000,secondaryCorrection:'Holm',minUsefulGain:.05,minSuccessRate:.95},promptVersion:'ceiling-single-decision/v1'};
  f.executionCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
  f.nodeVersion=process.version;
  if(repair){
    const ledger=new BudgetLedger(out),old=await read(join(out,'freeze.json'));
    if(ledger.snapshot().claimed>50||[...ledger.claims.values()].some(c=>c.bucket!=='smoke')||await exists(join(out,'smoke-ready.json'))||old.datasetHash!==f.datasetHash||old.textbookDigest!==f.textbookDigest||old.textbookManifestHash!==f.textbookManifestHash)throw Error('engineering_revision_not_allowed_after_admission');
    const archive=join(out,'engineering-revisions',hash(old));await mkdir(archive,{recursive:true});
    await writeOnce(join(archive,'freeze.json'),old);await writeOnce(join(archive,'freeze-binding.json'),await read(join(out,'freeze-binding.json')));
    f.previousEngineeringFreezeHash=hash(old);
    await save(join(out,'freeze.json'),f);await save(join(out,'freeze-binding.json'),{freezeHash:hash(f)});
  }else{
    // Re-running all after an admitted engineering revision must retain its identity.
    if(await exists(join(out,'freeze.json'))){const previous=await read(join(out,'freeze.json'));if(previous.previousEngineeringFreezeHash)f.previousEngineeringFreezeHash=previous.previousEngineeringFreezeHash;}
    await writeOnce(join(out,'freeze.json'),f);await writeOnce(join(out,'freeze-binding.json'),{freezeHash:hash(f)});
  }
  return f;
}
export async function labelCeiling(out,database=DEFAULT_DATABASE){
  const config=await verify(out),datasetHash=config.datasetHash;
  const d=await read(join(out,'dataset.json')),db=new DatabaseSync(database,{readOnly:true});
  const assets=process.env.RIICHI_LOCAL_MORTAL_ROOT??join(process.env.LOCALAPPDATA,'RiichiCoach/local-mortal-spike');
  const runtime=await createManagedMortalRuntimeFromAssets({pythonExecutable:join(assets,'python/Scripts/python.exe'),packageRoot:join(ROOT,'packages/mortal-runtime'),artifactRoot:assets,platformManifest:'mortal-582500.windows-x64.json',nativeReceiptPath:await questionLabNativeReceipt(),inferenceTimeoutMs:60000});
  const runtimeManifest=await loadManagedMortalManifest(join(ROOT,'packages/mortal-runtime/manifests/mortal-582500.windows-x64.json')),rows=[];
  try{
    for(const c of d.cases){
      const path=join(out,'private-labels',c.id+'.json');let row;
      if(await exists(path)){row=await read(path);if(row.datasetHash!==datasetHash)throw Error('label_dataset_changed');}
      else{
        try{
          const raw=zstdDecompressSync(db.prepare('SELECT data FROM variants WHERE hash=?').get(c.sourceHash).data),stream=mapMjaiRecord(raw,c.gameId,c.selfActor,tenhouRules(c.sourceLocator));
          assertStudySource(stream);
          const context=freezeDecisionStreamContext(stream),window=selfWindows(stream)[c.canonicalDecisionOrder];if(!window)throw Error('label_window_missing');
          const decision=oneDecision(context,window),ruleRequest=createArenaBlindRuleRequest(createLibriichiRuleProjector(context.stream,runtime.ruleIdentity,context)(decision)),ruleResult=await runtime.queryRules(ruleRequest);
          const selected=screenArenaDecisions([{canonicalDecisionOrder:c.canonicalDecisionOrder,decision:{decisionEventRef:decision.decisionEventRef,snapshot:decision.snapshot,facts:decision.facts},ruleRequest,ruleResponse:ruleResult}]).selected[0];
          if(!selected||hash(createArenaToolBinding({caseRef:c.observation.caseRef,selected}))!==hash(c.binding))throw Error('label_candidate_mismatch');
          const request=projectArenaLocalMortalRuleScoring({decision,identity:runtime.identity,ruleRequest,ruleResult}),response=await runtime.scoreRules(request),boundScores=bindLocalMortalRuleScores({request,response,decision});
          row={caseId:c.id,datasetHash,reference:{status:'available',label:createArenaReferenceLabel({caseRef:c.observation.caseRef,boundScores,runtimeManifest})},boundScores};
        }catch(e){row={caseId:c.id,datasetHash,reference:{status:'unavailable',reason:'mortal_error'},error:String(e.message)};}
        await writeOnce(path,row);
      }
      rows.push({caseId:c.id,hash:hash(row),status:row.reference.status});console.log(JSON.stringify({labelled:rows.length,required:d.cases.length,status:row.reference.status}));
    }
  }finally{db.close();await runtime.close();}
  const receipt={datasetHash,runtimeManifest,rows};await writeOnce(join(out,'labels-receipt.json'),receipt);
  if(receipt.rows.length!==d.cases.length||receipt.rows.some(r=>r.status!=='available'))throw Error('labels_incomplete_no_paid_generation');
  for(const c of d.cases){const row=await read(join(out,'private-labels',c.id+'.json')),bound=receipt.rows.find(r=>r.caseId===c.id);if(!bound||bound.hash!==hash(row)||row.datasetHash!==datasetHash||row.reference.status!=='available')throw Error('label_receipt_binding_failed');}
  await writeOnce(join(out,'labels-ready.json'),{datasetHash,receiptHash:hash(receipt),count:d.cases.length});
}
