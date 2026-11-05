import {readFile,realpath,stat} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function readBounded(directory,path) {
  const root=await realpath(directory), actual=await realpath(join(root,path)), rel=relative(root,actual);
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||(await stat(actual)).size>16*1024*1024)throw Error('Mortal 标签来源不可读取');
  return readFile(actual);
}
const parse=bytes=>JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));

// Resolve only the scoring file bound by this study, within catalogued study roots.
export async function readResearchReference(directory,summary,observation,sourceDirectories) {
  if(!observation?.caseRef||!Number.isInteger(summary.caseIndex)||summary.caseIndex<0||!/^[a-zA-Z0-9_-]+$/.test(summary.caseId))return null;
  let binding;
  try {binding=parse(await readBounded(directory,'independent-statistics/input-binding.json'));}
  catch(e){
    if(e.code!=='ENOENT')throw e;
    try {binding=parse(await readBounded(directory,'independent-statistics/selector-static-binding.json'));}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  const name=`${String(summary.caseIndex).padStart(3,'0')}-${summary.caseId}.json`;
  const rows=[...(Array.isArray(binding.cases)?binding.cases:[]),...(Array.isArray(binding.rows)?binding.rows:[])];
  const sourceHash=binding.sourceBindingSha256??binding.defenseSourceBindingSha256;
  if(sourceHash)for(const source of sourceDirectories) {
    let bytes;
    try {bytes=await readBounded(source,'independent-statistics/source-binding.json');}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(digest(bytes)===sourceHash)rows.push(...(parse(bytes).cases??[]));
  }
  const files=Array.isArray(binding.files)?binding.files.filter(f=>f.path?.replaceAll('\\','/').endsWith(`/scoring-preparation/private/${name}`)):[];
  const hashes=new Set([...rows.filter(r=>r.caseId===summary.caseId&&r.caseRef===observation.caseRef).map(r=>r.privateSha256),...files.map(f=>f.sha256)].filter(h=>/^[a-f0-9]{64}$/.test(h)));
  if(!hashes.size)return null;
  if(hashes.size!==1)throw Error('Mortal 标签来源不唯一');
  const expected=[...hashes][0];
  for(const directory of sourceDirectories) {
    const file=join(directory,'scoring-preparation/private',name);
    let bytes;
    try {bytes=await readBounded(directory,`scoring-preparation/private/${name}`);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(digest(bytes)!==expected)continue;
    const label=parse(bytes);
    if(label.caseId!==summary.caseId||label.caseRef!==observation.caseRef||label.label?.caseRef!==observation.caseRef||!observation.candidates?.some(c=>c.actionRef===label.label.actionRef))throw Error('Mortal 标签与当前案例不一致');
    return {reference:label.label.actionRef,referenceSource:file};
  }
  throw Error('未找到与实验记录一致的 Mortal 标签');
}
