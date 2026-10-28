import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendP257Batch, batchId } from './append-p257-batch.mjs';
import { sha256, startServer } from './server.mjs';

test('20-target incremental batch preserves old data, excludes protected slots and restores new answers in isolated storage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-p257-batch-'));
  const root = path.join(dir,'processing');fs.mkdirSync(root);
  let app;
  const write = (file, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);
    return {path:file,sha256:sha256(bytes)};
  };
  const png = (width,height) => {
    const bytes = Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
    bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes;
  };
  try {
    const source=write('source.png',png(2109,1210)), crop=write('crop.png',png(30,40));
    const candidate=write('candidate.json',{figures:[{figureId:'nemata-jp-p257-r1',sourceImageBlockIds:['nemata-jp-p257-b4']}],body:{blocks:[{type:'text',text:'fixture context'}]}});
    const parent=write('parent.json',{}), raw=write('raw.json',{parsedOutput:{figures:[{transcription:'old machine fixture'}]}});
    const slots=[['CPU hand',6],['upper',3],['upper',8],['left',11],['right',10],['right',12],['bottom',5],['bottom',6],['CPU hand',7],['left',7],['right',9],['CPU hand',9],['left',9],['right',16],['right',17],['CPU hand',10],['CPU hand',11],['upper',5],['right',4],['bottom',14]];
    const protectedSlots=[['upper',1],['upper',6],['upper',17],['left',16],['right',1],['right',2],['right',7],['right',13],['right',14]];
    const geometry={schema:'coac269-p257-20-source-pixel-targets/1',targetCount:20,candidate,parent,
      sourceImages:{'257-results':source},regions:[],protectedHumanPositions:protectedSlots.map(([scope,ordinal])=>({scope,ordinal})),
      targets:slots.map(([scope,ordinal],n)=>({id:`T${String(n+1).padStart(2,'0')}`,scope,ordinal,regionLabel:scope,
        oldTile:'4p',sourceImage:source,sourceImageBlockId:'nemata-jp-p257-b4',targetBox:[11,21,29,49],cropBox:[10,20,40,60],crop,
        newTile:null,existingHumanItem:false,originalMachineEvidence:raw,suspicion:'fixture diagnostic'}))};
    const options=()=>{const targets=write('targets.json',geometry);const ref=write('manifest.json',{targets,files:[]});return {manifestPath:ref.path,manifestSha256:ref.sha256};};
    const old={id:'old-id',targetId:'old-target',imagePath:source.path,imageSha256:source.sha256,canonical:'old-chapter',position:'old-position',blocking:false};
    const base={schema:'coach-tile-annotation-queue/1',items:[old]}, original=structuredClone(base);
    const queue=appendP257Batch(root,base,options());
    assert.deepEqual(base,original);
    assert.deepEqual(queue.items.slice(20),base.items);
    assert.deepEqual(queue.counts,{total:21,blocking:20,nonblocking:1});
    assert.equal(queue.defaultBatch,batchId);
    assert.equal(new Set(queue.items.map(i=>i.id)).size,21);
    assert.equal(queue.items.slice(0,20).every(i=>i.batchId===batchId && !('result' in i)),true);
    assert.deepEqual(appendP257Batch(root,queue,options()).items,queue.items);
    const dataDir=path.join(dir,'human'),queuePath=path.join(dir,'queue.json');
    fs.mkdirSync(dataDir);
    const oldEvent={...old,result:{status:'answered',tiles:['2m'],orientation:'',note:'old fixture'},revision:1,timestamp:'2026-01-01T00:00:00Z'};
    const oldBytes=Buffer.from(JSON.stringify(oldEvent)+'\n');fs.writeFileSync(path.join(dataDir,'events.jsonl'),oldBytes);
    fs.writeFileSync(queuePath,JSON.stringify(queue));
    const start=async()=>{app=await startServer({root,queuePath,dataDir,port:0});return `http://127.0.0.1:${app.server.address().port}`;};
    let url=await start();
    const state=await(await fetch(url+'/api/state')).json(),item=queue.items[0];
    assert.equal(state.annotations[item.id],undefined);
    assert.equal((await fetch(url+'/crop/'+item.id)).status,200);
    assert.equal((await fetch(url+'/crop/'+old.id)).status,404);
    assert.notEqual((await fetch(url+'/crop/%2e%2e%2fsource.png')).status,200);
    const response=await fetch(url+'/api/annotations',{method:'POST',headers:{'Content-Type':'application/json','X-Annotation-Token':state.token},
      body:JSON.stringify({id:item.id,imageSha256:item.imageSha256,expectedRevision:0,result:{status:'answered',tiles:'9m',orientation:'',note:'isolated fixture'}})});
    assert.equal(response.status,200);
    await app.close();url=await start();
    const restored=await(await fetch(url+'/api/state')).json();
    assert.deepEqual(restored.annotations[item.id].result.tiles,['9m']);
    assert.deepEqual(restored.annotations[old.id],oldEvent);
    const exported=await(await fetch(url+'/api/export')).json();
    assert.equal(exported.events.length,2);assert.deepEqual(exported.events[0],oldEvent);
    assert.deepEqual(fs.readFileSync(path.join(dataDir,'events.jsonl')).subarray(0,oldBytes.length),oldBytes);
    fs.writeFileSync(path.join(root,'crop.png'),'tampered');
    assert.equal((await fetch(url+'/crop/'+item.id)).status,409);
    write('crop.png',png(30,40));fs.writeFileSync(path.join(root,'source.png'),'tampered');
    assert.equal((await fetch(url+'/crop/'+item.id)).status,409);
    write('source.png',png(2109,1210));
    await app.close();app=null;
    geometry.targets[0].scope='upper';geometry.targets[0].ordinal=1;
    assert.throws(()=>appendP257Batch(root,base,options()),/原人标/);
    geometry.targets[0].scope='CPU hand';geometry.targets[0].ordinal=6;
    geometry.targets[0].targetBox=[0,0,3000,4000];
    assert.throws(()=>appendP257Batch(root,base,options()),/定位框/);
    geometry.targets[0].targetBox=[11,21,29,49];
    const binding=options();fs.writeFileSync(path.join(root,'crop.png'),'tampered');
    assert.throws(()=>appendP257Batch(root,base,binding),/SHA/);
  } finally {if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
