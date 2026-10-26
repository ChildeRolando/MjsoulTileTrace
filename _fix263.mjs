import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const p='E:/AgentData/Coach/knowledge/processing/production/sol-high-field-repair12-20261027-p263/candidates/79-cn/page-0263.json';
const raw=await readFile(p,'utf8');
const c=JSON.parse(raw);
console.log('roundtrip_canonical', JSON.stringify(c,null,2)+'\n'===raw);
console.log('parent_candidate_sha256', c.candidateSha256);
const fig=c.figures.find(f=>f.figureId==='79-cn-p263-r1');
let t=fig.transcription;
const edits=[
 ['legend','1z=东，4z=北，5z=中，6z=發，7z=白','1z=东，4z=北，5z=白，6z=發，7z=中'],
 ['dora','宝牌指示牌：3s。','宝牌指示牌：2s。'],
 ['chi','吃2s 3s 4s，2s横置，来自上家南家','吃3s 2s 4s，3s横置，来自上家南家'],
 ['north','先内列后外列）：第一列1z 7z 1m 9p 3m 2s','先内列后外列）：第一列1z 5z 1m 9p 3m 2s'],
 ['east','从右至左）：第一行7z 9p 4z 2m 6z 8m','从右至左）：第一行5z 9p 4z 2m 6z 8m'],
 ['south','先内列后外列）：第一列1z 5z 7z 4z 9s 1m','先内列后外列）：第一列1z 7z 5z 4z 9s 1m'],
];
for(const [name,from,to] of edits){
  const n=t.split(from).length-1;
  if(n!==1) throw new Error(`edit_${name}_occurrences_${n}`);
  t=t.replace(from,to);
}
console.log('---new transcription---');
console.log(t);
fig.transcription=t;
const cp={...c};delete cp.candidateSha256;
c.candidateSha256=sha(JSON.stringify(cp));
const out=JSON.stringify(c,null,2)+'\n';
await writeFile(p,out);
console.log('new_file_sha256', sha(Buffer.from(out)));
console.log('new_candidate_sha256', c.candidateSha256);
