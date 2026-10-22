import { readFile,readdir,writeFile,mkdir,rename,unlink } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoachProviderConfigSchema,KNOWLEDGE_TOPICS } from '@riichi-coach/contracts';
import { matchScenePatterns } from '@riichi-coach/reasoning';
import { ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { runBlindCoachCase,createArenaRagRunnerTool,SCENE_STUDY_PROMPT_VERSION } from '@riichi-coach/desktop/blind-discard-arena-runner';
import { createArenaRagRetriever,ARENA_RAG_RETRIEVER_VERSION } from '@riichi-coach/desktop/blind-discard-arena-rag';
import { createArenaToolCallProvider } from '@riichi-coach/desktop/llm-provider/service';
import { read,save,hash,ordered,exists,assertSplit,VERSION } from './common.mjs';
import { arenaCorpus } from './knowledge.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
export const arms=['A','B','C','D'];
export async function codeDigest() {
  const paths=['packages/contracts/dist/scene-patterns.js','packages/reasoning/dist/scene-patterns.js','packages/reasoning/dist/scene-pattern-facts.js','packages/reasoning/dist/factors/defense-matrix.js','packages/desktop/dist/blind-discard-arena-runner.js','packages/desktop/dist/blind-discard-arena-rag.js','scripts/scene-study/study.mjs','scripts/scene-study/common.mjs'];
  paths.push('scripts/scene-study/evaluate.mjs','scripts/scene-study/materials.mjs','scripts/scene-study/prepare.mjs','scripts/scene-study/knowledge.mjs','packages/desktop/dist/blind-discard-arena-provider.js');
  return hash(await Promise.all(paths.map(async p=>[p,hash(await readFile(join(root,p)))])));
}
export async function freeze(out,settingsPath) {
  if(await exists(join(out,'freeze.json')))return await verify(out);
  const dataset=await read(join(out,'dataset.json'));assertSplit(dataset.cases);
  const knowledge=await read(join(root,'scripts/scene-study/knowledge.json'));
  const defaultPath=join(process.env.APPDATA??'', 'Electron/coach-provider-settings-v1.json');
  const settingsSource=settingsPath??(await exists(defaultPath)?defaultPath:'Coach electron-entry.ts documented default');
  const provider=CoachProviderConfigSchema.parse(settingsPath||await exists(defaultPath)?await read(settingsPath??defaultPath):{providerId:'codex-cli',modelName:'gpt-6-luna',reasoningEffort:'max'});
  const config={version:VERSION,frozenAt:new Date().toISOString(),datasetHash:hash(dataset),knowledgeHash:hash(knowledge),codeHash:await codeDigest(),provider,settingsSource,promptVersion:SCENE_STUDY_PROMPT_VERSION,retriever:ARENA_RAG_RETRIEVER_VERSION,limits:{maxProviderTurns:4,maxToolCalls:2,maxProviderOutputTokens:2048,maxRunElapsedMs:300000},modelParameters:{temperature:'adapter_default_not_overridden',seed:'provider_not_supported'},devIds:ordered(dataset.cases.filter(c=>c.split==='development'),c=>c.id,'development-debug').slice(0,12).map(c=>c.id),schedule:ordered(dataset.cases.flatMap(c=>arms.map(arm=>({caseId:c.id,split:c.split,arm}))),x=>x.caseId+x.arm,'arm-execution'),gates:{patternPrecision:.90,patternRecall:.85,retrievalGain:.10,omissionRelativeDecline:.20,tokenRatio:1.3}};
  await save(join(out,'knowledge.json'),knowledge);await save(join(out,'freeze.json'),config);return config;
}
export async function verify(out) {
  const config=await read(join(out,'freeze.json'));
  if(config.datasetHash!==hash(await read(join(out,'dataset.json')))||config.knowledgeHash!==hash(await read(join(out,'knowledge.json')))||config.codeHash!==await codeDigest())throw new Error('study_frozen_input_changed_use_new_study_directory');
  return config;
}
export async function calibrateDevelopmentBudget(out,outputTokens) {
  if(!Number.isInteger(outputTokens)||outputTokens<2048||outputTokens>131072)throw new Error('study_calibration_budget');
  const old=await read(join(out,'freeze.json')),runs=await loadRuns(out);
  if(await exists(join(out,'gold.json'))||runs.some(r=>r.split==='evaluation'))throw new Error('study_calibration_after_gold_forbidden');
  if(old.datasetHash!==hash(await read(join(out,'dataset.json')))||old.knowledgeHash!==hash(await read(join(out,'knowledge.json'))))throw new Error('study_calibration_dataset_changed');
  await recover(out);
  const started=(await readdir(join(out,'runs'))).filter(n=>n.endsWith('.started.json'));
  if(started.some(n=>n.startsWith('evaluation-')))throw new Error('study_calibration_after_evaluation_forbidden');
  const archive=join(resolve(out),'calibration-history',hash(old));await mkdir(archive,{recursive:true});
  // Both rename targets are fixed children of the explicitly supplied study root.
  await rename(join(out,'runs'),join(archive,'runs'));
  await save(join(archive,'freeze.json'),old);
  const config={...old,frozenAt:new Date().toISOString(),codeHash:await codeDigest(),previousFreezeHash:hash(old),priorDevelopmentAttempts:(old.priorDevelopmentAttempts??0)+started.length,limits:{...old.limits,maxProviderOutputTokens:outputTokens}};
  await save(join(archive,'reason.json'),{reason:'Development-only token budget calibration; reported output includes reasoning tokens. No rule or evaluation outcome tuning.',newOutputTokenLimit:outputTokens});
  await save(join(out,'freeze.json'),config);return config;
}
export async function recover(out) {
  const lock=join(out,'active-run.lock');if(!(await exists(lock)))return;
  const owner=await read(lock);try{process.kill(owner.pid,0);throw new Error('study_run_still_active');}catch(e){if(e.code!=='ESRCH')throw e;}
  const dir=join(out,'runs');for(const name of (await readdir(dir)).filter(n=>n.endsWith('.started.json'))){const target=join(dir,name.replace('.started.json','.json'));if(!(await exists(target))){const started=await read(join(dir,name));await save(target,{...started,status:'interrupted',error:'process_ended_before_result',usage:'unknown'});}}
  await unlink(lock);
}
export function validateGold(gold,dataset,knowledge) {
  if(gold.datasetHash!==hash(dataset)||gold.knowledgeHash!==hash(knowledge)||!gold.reviewer?.trim()||!Number.isFinite(Date.parse(gold.reviewedAt)))throw new Error('study_gold_identity_or_reviewer_missing');
  const cases=dataset.cases.filter(c=>c.split==='evaluation');
  if(gold.cases.length!==60||new Set(gold.cases.map(c=>c.caseId)).size!==60)throw new Error('study_gold_count');
  for(const c of cases){const g=gold.cases.find(x=>x.caseId===c.id);if(!g||g.topics.length!==KNOWLEDGE_TOPICS.length||new Set(g.topics.map(x=>x.topic)).size!==KNOWLEDGE_TOPICS.length)throw new Error('study_gold_topics_missing');
    for(const t of g.topics){if(!KNOWLEDGE_TOPICS.includes(t.topic)||!['required','optional','irrelevant'].includes(t.need)||typeof t.gap!=='boolean'||!Array.isArray(t.chapters)||t.chapters.some(id=>!knowledge.cards.some(k=>k.id===id)))throw new Error('study_gold_invalid');if(t.need==='required'&&!t.gap&&!t.chapters.length)throw new Error('study_gold_required_chapter_missing');}
  }
  return gold;
}
export async function importGold(out,path) {
  await verify(out);const gold=validateGold(await read(path),await read(join(out,'dataset.json')),await read(join(out,'knowledge.json')));
  const dir=join(out,'runs');if(await exists(join(out,'gold.json')))throw new Error('study_gold_already_frozen');
  try {if((await readdir(dir)).some(n=>n.startsWith('evaluation-')))throw new Error('study_gold_must_precede_evaluation');}catch(e){if(e.code!=='ENOENT')throw e;}
  await save(join(out,'gold.json'),gold);await save(join(out,'gold-receipt.json'),{hash:hash(gold),importedAt:new Date().toISOString()});
}
export function boundedRetriever(retriever,trace,sourceMap) {
  let calls=0;const seen=new Set();
  return {mode:'local',async query(raw){if(++calls>2)throw new Error('study_retrieval_budget');const result=await retriever.query({...raw,limit:Math.min(raw.limit??3,3)});
    const passages=result.passages.filter(p=>!seen.has(p.sourceRef)).slice(0,6-seen.size);passages.forEach(p=>seen.add(p.sourceRef));
    const sourceRefs=passages.map(p=>p.sourceRef),filtered={...result,passages,sourceRefs,status:passages.length?'hits':'no_hits',retrieval:{...result.retrieval,resultRefs:sourceRefs}};
    trace.push({query:raw.query,requestedLimit:raw.limit??3,result:filtered,cardIds:sourceRefs.map(r=>sourceMap[r])});return filtered;}};
}
export async function run(out,split='development',maxCases=12) {
  if(!['development','evaluation'].includes(split)||!Number.isInteger(maxCases)||maxCases<1||maxCases>(split==='development'?12:60))throw new Error('study_run_scope');
  const config=await verify(out),dataset=await read(join(out,'dataset.json')),knowledge=await read(join(out,'knowledge.json'));
  if(split==='evaluation') {const g=validateGold(await read(join(out,'gold.json')),dataset,knowledge),r=await read(join(out,'gold-receipt.json'));if(hash(g)!==r.hash)throw new Error('study_gold_changed');}
  const ids=new Set(split==='development'?config.devIds.slice(0,maxCases):dataset.cases.filter(c=>c.split===split).slice(0,maxCases).map(c=>c.id));
  const runDir=join(out,'runs');await mkdir(runDir,{recursive:true});
  // Directory lock prevents concurrent duplicate generations and budget overruns. Recovery is explicit.
  const lock=join(out,'active-run.lock');await writeFile(lock,JSON.stringify({pid:process.pid,at:new Date().toISOString()}),{flag:'wx'});
  try {for(const item of config.schedule.filter(x=>x.split===split&&ids.has(x.caseId))) {
    const name=`${split}-${item.caseId}-${item.arm}`,path=join(runDir,name+'.json');if(await exists(path))continue;
    if(split==='development'&&(config.priorDevelopmentAttempts??0)+(await readdir(runDir)).filter(n=>n.startsWith('development-')&&n.endsWith('.started.json')).length>=48)throw new Error('study_development_48_attempt_cap');
    const startedPath=join(runDir,name+'.started.json');
    if(await exists(startedPath)) {await save(path,{...item,status:'interrupted',error:'previous_attempt_incomplete',started:await read(startedPath)});continue;}
    const c=dataset.cases.find(c=>c.id===item.caseId),trace=[],aliases=new ArenaRunAliasVault(),sourceMap={};
    for(const card of knowledge.cards)sourceMap[aliases.reference(`blind-discard-arena-rag/v1\u0000${card.source.system}\u0000${card.id}`)]=card.id;
    const hasRag=['B','D'].includes(item.arm),provider=createArenaToolCallProvider({settings:config.provider.providerId==='codex-cli'?null:config.provider,arenaCodex:config.provider.providerId==='codex-cli'?{modelName:config.provider.modelName,reasoningEffort:config.provider.reasoningEffort}:undefined,credentials:{readKey:async()=>process.env.RIICHI_COACH_API_KEY??null},fetchImpl:fetch});
    if(!provider)throw new Error('study_provider_unconfigured');
    const observation={...c.observation,tools:{description:hasRag?'可自主检索两套原始网页版教材；最多两次，每次三张，合计最多六张去重知识卡。':'本组无检索工具；请仅根据完整局面与事实补充分析。',supportedCapabilities:hasRag?['search_knowledge']:[]}};
    const retriever=hasRag?boundedRetriever(createArenaRagRetriever({mode:'local',caseRef:observation.caseRef,aliases,loadCorpus:async()=>arenaCorpus(knowledge)}),trace,sourceMap):null;
    await save(startedPath,{...item,freezeHash:hash(config),startedAt:new Date().toISOString(),provider:provider.descriptor()});
    let result;try {result=await runBlindCoachCase({observation,sceneStudy:{facts:c.facts,enablePatterns:['C','D'].includes(item.arm)},grading:{binding:c.binding,reference:{status:'unavailable',reason:'not_requested_in_scene_study'}},provider,tools:retriever?[createArenaRagRunnerTool({caseRef:observation.caseRef,retriever,description:'检索牌效、对子手、役牌、染手、宝牌、等待、振听、立直与副露防守、多家威胁、押引、终盘及点况。自主选择主题，最多两次检索，每次三张。'})]:[],limits:config.limits,onEvent:e=>{appendFileSync(join(runDir,name+'.trace.jsonl'),JSON.stringify(e)+'\n');}});
      await save(path,{...item,gameId:c.gameId,stratum:c.stratum,freezeHash:hash(config),status:result.status,result,retrieval:trace,sourceMap});
    }catch(e){await save(path,{...item,gameId:c.gameId,stratum:c.stratum,freezeHash:hash(config),status:'runner_error',error:String(e.message),retrieval:trace,sourceMap});}
    console.log(JSON.stringify({...item,status:result?.status??'runner_error'}));
  }}finally {const {unlink}=await import('node:fs/promises');await unlink(lock);}
}
export const submission=run=>run?.result?.events.find(e=>e.type==='submission_locked')?.submission??null;
export async function loadRuns(out){try{return await Promise.all((await readdir(join(out,'runs'))).filter(n=>n.endsWith('.json')&&!n.endsWith('.started.json')).map(n=>read(join(out,'runs',n))));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
export function patternTopics(c){return [...new Set(matchScenePatterns(c.facts).results.filter(p=>p.status==='matched').flatMap(p=>p.topics))];}
