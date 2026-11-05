const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createResearchLibrary} from '../bin/arena-research.mjs';
import {readResearchReference} from '../bin/arena-research-reference.mjs';
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'arena-research-'));
 const after=callback=>typeof t.after==='function'?t.after(callback):t.onTestFinished(callback);
 after(()=>rm(root,{recursive:true,force:true}));
 const sources=join(root,'sources');await mkdir(sources);const config=join(root,'research-sources.json');await writeFile(config,JSON.stringify({roots:[sources]}));
 const write=async(study,path,value)=>{const file=join(sources,study,path);await mkdir(join(file,'..'),{recursive:true});await writeFile(file,typeof value==='string'?value:JSON.stringify(value));};
 return {root,sources,config,write,lib:createResearchLibrary(config)};
}
test('research listing keeps prepared and synthetic material out of the default view',async t=>{
 const f=await fixture(t);await f.write('real-study','报告.md','# 完成的对照研究\n原始结论');await f.write('real-study','independent-statistics/independent-results.json',{status:'complete',groups:{basic:{valid:2,matches:1,tokens:{totalTokens:{unknown:1}}}},cases:{basic:[{match:true},{match:false},{failure:'timeout'}]}});
 await f.write('synthetic-smoke','报告.md','# 模拟研究');await f.write('ready-study','research-plan.json',{status:'preparation'});await f.write('feasibility','报告.md','# 训练只读预检');await f.write('real-study','execution-preparation/synthetic-e2e/summary.json',{status:'complete'});
 const list=await f.lib.list();assert.equal(list.studies.filter(s=>!s.hidden).length,1);
 const real=list.studies.find(s=>s.name==='real-study');assert.equal(real.documents.length,2);const detail=await f.lib.detail(real.id);assert.equal(detail.groups[0].valid,2);assert.equal(detail.groups[0].cases.length,3);assert.equal(detail.groups[0].matches,1);assert.equal(detail.groups[0].reported.tokens.totalTokens.unknown,1);
 const doc=await f.lib.document(real.id,real.documents.find(d=>d.path==='报告.md').id);assert.equal(doc.text,'# 完成的对照研究\n原始结论');assert.equal(await readFile(join(f.sources,'real-study/报告.md'),'utf8'),doc.text);
});
test('documents use catalog IDs, reject arbitrary paths and retain unreadable statistics as an error',async t=>{
 const f=await fixture(t);await f.write('study','报告.md','# 研究');await f.write('study','independent-statistics/independent-results.json','{partial');
 const row=(await f.lib.list()).studies[0];await assert.rejects(()=>f.lib.detail('../study'),{status:404});await assert.rejects(()=>f.lib.document(row.id,'../research-plan.json'),{status:404});assert.match((await f.lib.detail(row.id)).statisticsError,/暂不可读取/);
});
test('missing source and absent configuration remain explicit, while refreshed catalogs discover new reports',async t=>{
 const f=await fixture(t);assert.equal((await f.lib.list()).studies.length,0);await f.write('new','报告.md','# 新研究');assert.equal((await f.lib.list(true)).studies.length,1);
 await writeFile(f.config,JSON.stringify({roots:[join(f.root,'missing')]}));assert.equal((await f.lib.list(true)).unavailable.length,1);assert.deepEqual((await createResearchLibrary(join(f.root,'absent')).list()).studies,[]);
});

test('execution receipts expose real attempts without inventing Mortal matches',async t=>{
 const f=await fixture(t);await f.write('baseline','arena-integration/batch-execution-receipt.json',{cases:[{status:'completed',attempt:'submitted'},{status:'failed',attempt:'timeout'}]});
 const row=(await f.lib.list()).studies[0], detail=await f.lib.detail(row.id);
 assert.equal(row.hidden,false);assert.equal(detail.groups[0].cases.length,2);assert.equal(detail.groups[0].valid,1);assert.equal(detail.groups[0].matches,null);
});
test('Windows UTF-8 BOM source configuration discovers the same reports',async t=>{
 const f=await fixture(t);await f.write('real-study','报告.md','# 实验结果');
 await writeFile(f.config,'\uFEFF'+JSON.stringify({roots:[f.sources]}));
 assert.equal((await f.lib.list()).studies[0].title,'实验结果');
});

test('recent final report filenames are readable and preferred over older reports',async t=>{
 const f=await fixture(t);await f.write('recent','independent-statistics/统计报告.md','# 最新实验');
 await f.write('recent','independent-statistics/报告.md','# 旧报告');await f.write('recent','independent-statistics/结果解读附页.md','# 解读');
 const s=(await f.lib.list()).studies[0];assert.equal(s.title,'最新实验');assert.equal(s.documents.length,3);assert.equal(s.hidden,false);
});

test('historical groups resolve only catalogued hash-bound sources with the same outcome',async t=>{
 const f=await fixture(t), c={caseId:'case-a',match:false,failure:null,choice:{tile:'1m',red:false}};
 const stats={groups:{original:{valid:1,matches:0}},cases:{original:[c]}};
 await f.write('source','independent-statistics/independent-results.json',stats);
 const sourceResultsSha256=createHash('sha256').update(JSON.stringify(stats)).digest('hex');
 await f.write('current','independent-statistics/independent-results.json',{groups:{reused:{valid:1,matches:0}},cases:{reused:[c]}});
 const registry={groups:[{group:'reused',sourceGroup:'original',archive:join(f.sources,'source'),sourceResultsSha256}]};
 await f.write('current','independent-statistics/reuse-registry.json',registry);
 const s=(await f.lib.list()).studies.find(s=>s.name==='current');
 const d=await f.lib.case(s.id,'reused',0);assert.deepEqual(d.summary,c);assert.match(d.source,/历史复用：source/);
 await f.write('source','independent-statistics/independent-results.json',{...stats,status:'changed'});
 await assert.rejects(()=>f.lib.case(s.id,'reused',0),/来源未能唯一/);
 await f.write('current','independent-statistics/reuse-registry.json',{groups:[{...registry.groups[0],archive:join(f.root,'outside')}]});
 await assert.rejects(()=>f.lib.case(s.id,'reused',0),/来源未能唯一/);
});

for(const format of ['rows','files','source-binding'])test(`Mortal reference restores the bound recommendation (${format})`,async t=>{
 const f=await fixture(t), summary={caseId:'case-a',caseIndex:0}, action='action-red-five';
 const observation={caseRef:'ref-a',candidates:[{actionRef:action,tile:{id:'5m',red:true}}]};
 const label={caseId:'case-a',caseRef:'ref-a',label:{caseRef:'ref-a',actionRef:action}};
 const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'), path='scoring-preparation/private/000-case-a.json';
 await f.write('source',path,label);
 const rows=[{caseId:'case-a',caseRef:'ref-a',privateSha256:sha(label)}];
 if(format==='rows')await f.write('current','independent-statistics/input-binding.json',{rows});
 if(format==='files')await f.write('current','independent-statistics/input-binding.json',{files:[{path:join(f.sources,'source',path),sha256:sha(label)}]});
 if(format==='source-binding'){
  const source={cases:rows};await f.write('source','independent-statistics/source-binding.json',source);
  await f.write('current','independent-statistics/selector-static-binding.json',{defenseSourceBindingSha256:sha(source)});
 }
 const current=join(f.sources,'current'), roots=[current,join(f.sources,'source')];
 assert.equal((await readResearchReference(current,summary,observation,roots)).reference,action);
 await assert.rejects(()=>readResearchReference(current,summary,{...observation,candidates:[]},roots),/当前案例/);
 await f.write('source',path,{...label,label:{caseRef:'ref-a',actionRef:'changed'}});
 await assert.rejects(()=>readResearchReference(current,summary,observation,roots),/未找到/);
});
