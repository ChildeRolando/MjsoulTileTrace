import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
export const VERSION = 'scene-study/v1';
export const SEED = 'coach-scene-20261023-v1';
export const hash = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
export const ordered = (xs, key, seed=SEED) => [...xs].sort((a,b)=>hash(seed+key(a)).localeCompare(hash(seed+key(b))));
export const read = async p => JSON.parse(await readFile(p,'utf8'));
export async function save(p,v) { await mkdir(dirname(p),{recursive:true}); await writeFile(p+'.tmp',JSON.stringify(v,null,2)+'\n'); await rename(p+'.tmp',p); }
export async function exists(p) {try {await readFile(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export function assertSplit(cases) {
  const games=new Map(), rounds=new Set();
  for(const c of cases) {
    const g=games.get(c.gameId)??{split:c.split,n:0};
    if(g.split!==c.split||++g.n>6)throw new Error('study_game_split_or_cap'); games.set(c.gameId,g);
    const key=[c.gameId,c.roundOrdinal,c.selfActor].join(':'); if(rounds.has(key))throw new Error('study_duplicate_round_seat');rounds.add(key);
  }
  for(const [split,n,g] of [['development',120,20],['evaluation',60,10]]) if(cases.filter(c=>c.split===split).length!==n||[...games.values()].filter(x=>x.split===split).length<g)throw new Error('study_insufficient_samples');
  if(cases.filter(c=>c.stratum==='random').length!==40||cases.filter(c=>c.stratum==='challenge').length!==20)throw new Error('study_strata');
}
export function clusterInterval(rows, statistic, iterations=2000) {
  const groups=[...new Set(rows.map(x=>x.gameId))];
  if(groups.length<2)return {estimate:statistic(rows),low:null,high:null,games:groups.length};
  let s=0x6d2b79f5; const random=()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};
  const values=[];
  for(let n=0;n<iterations;n++){const sample=groups.flatMap(()=>{const g=groups[Math.floor(random()*groups.length)];return rows.filter(x=>x.gameId===g);});const v=statistic(sample);if(Number.isFinite(v))values.push(v);}
  values.sort((a,b)=>a-b);return {estimate:statistic(rows),low:values[Math.floor(values.length*.025)]??null,high:values[Math.floor(values.length*.975)]??null,games:groups.length};
}
