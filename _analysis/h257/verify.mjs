import {readFile,access,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',I=root+'/integration/',dir=new URL('./',import.meta.url),load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const f=await load(new URL('final.json',dir)),archive=await load(new URL('archive.json',dir));
for(const r of archive)assert.equal(sha(await readFile(new URL(r.copy,dir))),r.sha256,'archived_bytes:'+r.copy);
for(const r of f.protectedBefore)assert.equal(sha(await readFile(r.path)),r.sha256,'protected_changed:'+r.path);
const selection=await load(f.selection.path),rows=selection.pages.filter(r=>r.sourceId==='nemata-jp'&&r.page===261);assert.equal(rows.length,1);assert.equal(rows[0].candidateSha256,'376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359');assert.equal(rows[0].auditStatus,'passed-after-source-adjudication');assert.deepEqual(rows[0].adjudication,f.page261.sourceAdjudication);
const concurrentOwnerAdditions=[];
for(let i=0;i<3;i++){const ref=f.registers[i],d=await load(ref.path),targets=d.rows.filter(r=>['nemata-jp-chapter-250-1','79-cn-chapter-311-18'].includes(r.chapterId)),expected=await load(new URL('rows'+i+'.after.json',dir));
 if(sha(await readFile(ref.path))!==ref.sha256){assert.equal(i,1,'unexpected_non_owner_change');const row=targets.find(r=>r.chapterId==='79-cn-chapter-311-18'),note=row.sourceGapDiagnosis;assert(note);assert.equal(note.sha256,'3f64c9a720b2c83cdd9f4e0caebefaaf2365137543e1249b59b57a8ef5ebe82c');assert.equal(note.sourceReadback.sha256,'4d774701f59fe5db838c0bbe8e9ad8700c2c9655d01df2ffff2fe5268cd51efb');for(const r of [note,note.sourceReadback])assert.equal(sha(await readFile(r.path)),r.sha256);concurrentOwnerAdditions.push({kind:'244-additive-source-gap-diagnosis-after250-registration',binding:note,originalFalsePreserved:true,author144PointTableRequired:false,doesNotGrantAdmission:true,ownerRegisterNow:{path:ref.path,sha256:sha(await readFile(ref.path))}});delete row.sourceGapDiagnosis;}
 assert.deepEqual(targets,expected);assert(targets.every(r=>r.covered!==true));}
const reg=await load(f.registers[0].path);assert.equal(reg.counts.effectiveCoveredOriginalChapters,253);assert.equal(reg.counts.displayBlocks,7673);assert.equal(reg.rows.filter(r=>!r.covered).length,3);assert.equal(reg.rows.filter(r=>!r.covered).reduce((n,r)=>n+r.units,0),18);
for(const p of [I+'accepted-consumer.lock',I+'selection-maintainer.lock.json',I+'ACCEPTED-CONSUMER-STOP']){try{await access(p);throw Error('unexpected_lock_or_stop:'+p);}catch(e){if(e.code!=='ENOENT')throw e;}}
assert.equal(f.newModelCalls,0);assert.equal(f.actualNewMcpArenaReadback,false);assert.equal(f.page257.fullRecordMultiplicityPassed,false);assert.equal(f.cn311.repairPassed,false);assert.equal(f.cn311.limitedUnknownOkay,false);
const result={passed:true,archivesVerified:archive.length,page261SelectedOnce:true,protectedFilesUnchanged:f.protectedBefore.length,remainingChapters:3,remainingUnits:18,coverage:'253/256 chapters;285/303 units',concurrentOwnerAdditions,noNewPreview:true,noNewModelCalls:true,noRunOwnedWorkPending:true,formalActiveChanged:false};
await writeFile(new URL('verification.json',dir),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
