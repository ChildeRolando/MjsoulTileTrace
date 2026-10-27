import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const {decodeWebStageImage,stageWebTextbook}=await import(pathToFileURL(repo+'/scripts/textbook-processing/stage-web-textbook.mjs'));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('PNG passthrough, exact JPEG-derived pixels, MIME and damaged-image refusals; semantic gate preserved',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coac250-jpeg-'));
 try{
  const generated=spawnSync('python',['-c',"from PIL import Image\nimport sys\np=sys.argv[1];im=Image.new('RGB',(9,3),'red');im.putpixel((8,2),(0,123,255));im.save(p+'/source.jpg');im.save(p+'/source.png')",root],{windowsHide:true});assert.equal(generated.status,0,String(generated.stderr));
  const png=await readFile(join(root,'source.png')),jpeg=await readFile(join(root,'source.jpg'));
  const p=await decodeWebStageImage(join(root,'source.png'),{sha256:sha(png)}, {sha256:sha(png),contentType:'image/png'});assert.equal(p.derived,false);assert.equal(p.sourceSha256,sha(png));
  const j=await decodeWebStageImage(join(root,'source.jpg'),{sha256:sha(jpeg)},{sha256:sha(jpeg),contentType:'image/jpeg'});assert.equal(j.derived,true);assert.equal(j.pixelExact,true);assert.equal(j.decodedRgbaSha256,j.derivedRgbaSha256);assert.notEqual(j.sourceSha256,j.derivedSha256);assert.equal(j.width,9);assert.equal(j.height,3);assert.equal(sha(Buffer.from(j.pngBase64,'base64')),j.derivedSha256);
  await assert.rejects(()=>decodeWebStageImage(join(root,'source.jpg'),{sha256:sha(jpeg)},{sha256:sha(jpeg),contentType:'image/png'}),/mime_mismatch/);
  await assert.rejects(()=>decodeWebStageImage(join(root,'source.png'),{sha256:sha(png)},{sha256:sha(png),contentType:'image/jpeg'}),/mime_mismatch/);
  await writeFile(join(root,'wrong.png'),jpeg);await assert.rejects(()=>decodeWebStageImage(join(root,'wrong.png'),{sha256:sha(jpeg)}),/mime_mismatch/);
  await assert.rejects(()=>decodeWebStageImage(join(root,'source.jpg'),{sha256:'0'.repeat(64)}),/image_identity/);
  for(const [name,data] of [['bad.jpg',jpeg.subarray(0,30)],['bad.png',png.subarray(0,30)]]){await writeFile(join(root,name),data);await assert.rejects(()=>decodeWebStageImage(join(root,name),{sha256:sha(data)}),/image_decode/);}
  await writeFile(join(root,'fake.jpg'),Buffer.from('invalid'));await assert.rejects(()=>decodeWebStageImage(join(root,'fake.jpg'),{sha256:sha('invalid')}),/image_format/);
  const url='https://example.org/chapter',source={sourceId:'source-cn',articleId:'chapter',title:'中文正文',language:'zh-CN',url,html:{sha256:sha('html'),bytes:4},blocks:[{id:'p1',domPath:'main/p',tag:'p'},{id:'i1',domPath:'main/img',tag:'img'}],assets:[{assetId:'image',sha256:sha(jpeg),contentType:'image/jpeg'}]};
  const sb=JSON.stringify(source);await writeFile(join(root,'source.json'),sb);
  const candidate={schema:'coach-textbook-web-article-draft/1',source:{sourcePath:'source.json',sourceSha256:sha(sb),htmlSha256:source.html.sha256,url},body:{blocks:[{type:'text',sourceBlockIds:['p1'],text:'完整论证和条件。'},{type:'figure',sourceBlockIds:['i1'],figureId:'f1'}]},figures:[{figureId:'f1',caption:'原图例',transcription:'原图例的完整文字',unknowns:[],sourceAssetBindings:[{assetId:'image',path:'source.jpg',sha256:sha(jpeg)}]}]};
  const cb=JSON.stringify(candidate);await writeFile(join(root,'candidate.json'),cb);const verify=async()=>({status:'passed',production:{sha256:sha(cb)},auditPath:'fixture-receipt'});
  const dest=join(root,'stage'),r=await stageWebTextbook({processingRoot:root,candidatePath:'candidate.json',destination:dest,verify});assert.equal(r.imageDerivations.length,1);assert.equal(r.imageDerivations[0].sourceMimeType,'image/jpeg');assert.equal(r.imageDerivations[0].pixelExact,true);assert.equal(sha(await readFile(join(dest,r.imageDerivations[0].originalCopy))),sha(jpeg));assert.equal(await readFile(join(root,'candidate.json'),'utf8'),cb);
  const corpus=JSON.parse(await readFile(join(dest,'textbook-corpus.json'),'utf8'));assert.equal(corpus.units[0].blocks[1].figure.imageProvenance.method,j.method);assert.deepEqual(corpus.units[0].blocks[1].figure.imageProvenance.sourceAssetSha256s,[sha(jpeg)]);
  await assert.rejects(()=>stageWebTextbook({processingRoot:root,candidatePath:'candidate.json',destination:join(root,'refused'),verify:async()=>({...await verify(),status:'needs-repair'})}),/audit_identity/);
 }finally{await rm(root,{recursive:true,force:true});}
});
