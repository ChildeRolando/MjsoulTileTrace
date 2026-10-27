// Test-only memory writes. No synthetic audit/raw is written to the shared ledger.
import * as real from 'node:fs/promises';
import {resolve} from 'node:path';
const memory=new Map();
const key=p=>resolve(p instanceof URL?p.pathname.replace(/^\/([A-Za-z]:)/,'$1'):p);
function writable(p){if(!key(p).replaceAll('\\','/').startsWith('E:/AgentData/Coach/knowledge/processing/audit/'))throw Error('offline_overlay_forbidden_write:'+key(p));}
export const overlay={memory,clear:()=>memory.clear(),set:(p,value)=>memory.set(key(p),Buffer.from(value)),get:p=>memory.get(key(p)),keys:()=>[...memory.keys()]};
export async function readFile(p,options){const b=memory.get(key(p));if(!b)return real.readFile(p,options);const encoding=typeof options==='string'?options:options?.encoding;return encoding?b.toString(encoding):Buffer.from(b);}
export async function writeFile(p,value,options){writable(p);if(options?.flag==='wx'){let exists=memory.has(key(p));if(!exists)try{await real.access(p);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}if(exists){const e=Error('EEXIST');e.code='EEXIST';throw e;}}memory.set(key(p),Buffer.from(value));}
export async function appendFile(p,value){writable(p);let prior=Buffer.alloc(0);try{prior=await readFile(p);}catch(e){if(e.code!=='ENOENT')throw e;}memory.set(key(p),Buffer.concat([prior,Buffer.from(value)]));}
export async function mkdir(p){writable(p);}
export const readdir=real.readdir;
export const realpath=real.realpath;
export const access=real.access;
export const stat=real.stat;
export const copyFile=async()=>{throw Error('offline_overlay_copy_forbidden');};
export const rm=async()=>{throw Error('offline_overlay_remove_forbidden');};
