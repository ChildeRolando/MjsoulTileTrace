import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir,link,unlink,rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, read, ordered, exists } from '../scene-study/common.mjs';
export { hash, read, ordered, exists };
export const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
export const VERSION='mortal-scene-ceiling/v1';
export const SEED='coach-ceiling-20261028-v1';
export const GENERATION_TIMEOUT_MS=300000;
export const BUDGETS=Object.freeze({development:800,evaluation:4000,oracle:600,practical:400,stability:100,smoke:100});
export const MODELS=Object.freeze({strong:{modelName:'gpt-6.1-sol',reasoningEffort:'high'},practical:{modelName:'gpt-6-luna',reasoningEffort:'max'}});
export const QUOTAS=Object.freeze({pilot:{random:20,challenge:0},development:{random:120,challenge:40},evaluation:{random:600,challenge:200}});
export const ARMS=['A','B','C','D','V0'];
export const DEFAULT_SNAPSHOT='E:/AgentData/Coach/knowledge/processing/integration/accepted-content-preview-2026-10-27T19-21-37-757Z';
export const DEFAULT_DATABASE='E:/AgentData/Coach/public-replays-20261022/corpus.sqlite';
export const DEFAULT_OUT='E:/AgentData/Coach/scene-pattern-ceiling-20261028';
export const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;

export async function save(path,value,{renameFile=rename,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  await mkdir(dirname(path),{recursive:true});const text=JSON.stringify(value,null,2)+'\n',temporary=path+'.pending-'+process.pid+'-'+randomUUID();
  await writeFile(temporary,text,{flag:'wx'});
  for(let attempt=0;attempt<6;attempt++){
    try{await renameFile(temporary,path);return;}
    catch(e){
      if(await readFile(path,'utf8').then(s=>s===text,()=>false)){await unlink(temporary);return;}
      if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt===5)throw e;
      await delay(100*2**attempt);
    }
  }
}

export async function writeOnce(path,value) {
  const text=JSON.stringify(value,null,2)+'\n';await mkdir(dirname(path),{recursive:true});
  if(await exists(path)){if(await readFile(path,'utf8')!==text)throw Error('immutable_artifact_changed:'+path);return;}
  const temporary=path+'.pending-'+process.pid+'-'+randomUUID();
  await writeFile(temporary,text,{flag:'wx'});
  try{await link(temporary,path);}catch(e){if(e.code!=='EEXIST'||await readFile(path,'utf8')!==text)throw e;}finally{await unlink(temporary);}
}
export function assertDataset(dataset) {
  const games=new Set(),sources=new Set(),ids=new Set();
  for(const c of dataset.cases){
    if(games.has(c.gameId)||sources.has(c.sourceHash)||ids.has(c.id))throw Error('dataset_source_collision');
    games.add(c.gameId);sources.add(c.sourceHash);ids.add(c.id);
    if(dataset.excludedGames?.includes(c.gameId)||dataset.excludedHashes?.includes(c.sourceHash))throw Error('dataset_prior_source_collision');
  }
  for(const [split,strata] of Object.entries(QUOTAS))for(const [stratum,n]of Object.entries(strata))if(dataset.cases.filter(c=>c.split===split&&c.stratum===stratum).length!==n)throw Error(`dataset_quota:${split}:${stratum}`);
  for(const c of dataset.cases)if(!QUOTAS[c.split]||!(c.stratum in QUOTAS[c.split]))throw Error('dataset_unknown_split');
  if(dataset.cases.length!==980)throw Error('dataset_quota_total');
}

/** One exclusive run process owns this append-only, fsync-before-dispatch ledger. */
export class BudgetLedger {
  constructor(out,budgets=BUDGETS){
    mkdirSync(out,{recursive:true});this.path=join(out,'calls.jsonl');this.budgets=budgets;this.rows=[];this.claims=new Map();this.settled=new Set();
    if(existsSync(this.path)){
      const data=readFileSync(this.path,'utf8');if(data&&!data.endsWith('\n'))throw Error('ledger_incomplete_tail');
      for(const line of data.trim().split('\n').filter(Boolean)){
        const row=JSON.parse(line),{digest,...body}=row;
        if(body.seq!==this.rows.length||body.previous!==(this.rows.at(-1)?.digest??null)||digest!==hash(body))throw Error('ledger_binding_changed');
        this.accept(row);this.rows.push(row);
      }
    }
    this.snapshot();
  }
  accept(row){
    if(row.type==='claim'){
      if(this.claims.has(row.key)||!Object.hasOwn(this.budgets,row.bucket))throw Error('ledger_duplicate_or_unknown');
      this.claims.set(row.key,row);
    }else if(row.type==='settle'){
      if(!this.claims.has(row.key)||this.settled.has(row.key))throw Error('ledger_settle_without_claim');this.settled.add(row.key);
    }else throw Error('ledger_unknown_type');
  }
  append(body){
    const row={...body,seq:this.rows.length,previous:this.rows.at(-1)?.digest??null};row.digest=hash(row);
    const fd=openSync(this.path,'a');try{writeSync(fd,JSON.stringify(row)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
    this.accept(row);this.rows.push(row);return row;
  }
  claim(key,bucket,requestDigest){
    if(this.claims.has(key))throw Error('duplicate_model_request');
    const s=this.snapshot();if(!(bucket in this.budgets)||s.buckets[bucket]>=this.budgets[bucket]||s.claimed>=Object.values(this.budgets).reduce((a,b)=>a+b,0))throw Error('model_call_budget_exhausted');
    return this.append({type:'claim',key,bucket,requestDigest,at:new Date().toISOString()});
  }
  settle(key,result){return this.append({type:'settle',key,result,at:new Date().toISOString()});}
  snapshot(){
    const buckets=Object.fromEntries(Object.keys(this.budgets).map(k=>[k,0]));for(const row of this.claims.values())buckets[row.bucket]++;
    if(Object.keys(buckets).some(k=>buckets[k]>this.budgets[k]))throw Error('ledger_budget_exceeded');
    return {claimed:this.claims.size,settled:this.settled.size,unsettled:this.claims.size-this.settled.size,buckets,limits:this.budgets};
  }
}

export function chooseVersion(rows,versions){
  const rank=versions.map((v,i)=>{const rs=rows.filter(r=>r.version===v.id&&r.stratum==='random');return {...v,i,rate:mean(rs.map(r=>r.match))??-1,q:mean(rs.filter(r=>Number.isFinite(r.regret)).map(r=>r.regret))??Infinity};});
  return rank.sort((a,b)=>b.rate-a.rate||a.q-b.q||a.ruleCount-b.ruleCount||a.i-b.i)[0]?.id;
}

export async function executionFiles(){
  const paths=[];
  async function walk(dir){for(const e of await readdir(join(ROOT,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else if(e.name.endsWith('.js')||e.name.endsWith('.json')||e.name.endsWith('.mjs'))paths.push(p);}}
  for(const pkg of ['contracts','reasoning','desktop','mortal-runtime','mortal-source','tenhou-source','question-lab'])await walk(`packages/${pkg}/dist`);
  for(const p of ['ceiling-protocol.mjs','ceiling-textbook.mjs','ceiling-prepare.mjs','ceiling-run.mjs'])paths.push('scripts/mortal-ablation/'+p);
  paths.push('scripts/mortal-ablation/prepare.mjs','scripts/scene-study/prepare.mjs','scripts/scene-study/common.mjs','scripts/replay-corpus/canonical.mjs','scripts/replay-corpus/identity.mjs');
  paths.push('bin/scene-pattern-ceiling.mjs','package.json','package-lock.json');
  return Promise.all(paths.sort().map(async p=>[p,hash(await readFile(join(ROOT,p)))]));
}
export async function verify(out){
  const f=await read(join(out,'freeze.json'));
  if(f.nodeVersion!==process.version)throw Error('frozen_node_runtime_changed');
  if((await read(join(out,'freeze-binding.json'))).freezeHash!==hash(f))throw Error('freeze_metadata_changed');
  if(f.version!==VERSION||f.codeDigest!==hash(await executionFiles()))throw Error('frozen_execution_code_changed');
  const d=await read(join(out,'dataset.json'));assertDataset(d);
  const prior=await read(join(out,'prior-sources.json'));
  if(d.priorSourcesDigest!==hash(prior)||hash(d.excludedGames)!==hash(prior.games)||hash(d.excludedHashes)!==hash(prior.hashes))throw Error('prior_source_binding_changed');
  if(f.datasetHash!==hash(d)||f.textbookDigest!==hash(await read(join(out,'textbook/index.json'))))throw Error('frozen_input_changed');
  const manifest=await read(join(out,'textbook/manifest.json'));
  if(f.textbookManifestHash!==hash(manifest))throw Error('frozen_textbook_manifest_changed');
  for(const [file,digest]of Object.entries(manifest.files))if(hash(await readFile(join(out,'textbook',file)))!==digest)throw Error('frozen_textbook_file_changed:'+file);
  return f;
}
