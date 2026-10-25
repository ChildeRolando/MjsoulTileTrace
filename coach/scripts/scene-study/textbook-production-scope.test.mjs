import {afterEach,describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const sha=value=>createHash('sha256').update(value).digest('hex'),roots=[];
afterEach(async()=>{for(const root of roots.splice(0)){assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('textbook-scope-test-'));await rm(root,{recursive:true,force:true});}});
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'textbook-scope-test-'));roots.push(root);
  const processing=join(root,'processing'),pdfs=join(root,'pdfs'),scripts=join(root,'scripts/scene-study');
  for(const path of [processing,pdfs,scripts,join(processing,'integration'),join(processing,'79-cn/pages'),join(processing,'assets')])await mkdir(path,{recursive:true});
  const original=fileURLToPath(new URL('.',import.meta.url));
  let producer=await readFile(join(original,'textbook-production.mjs'),'utf8');
  producer=producer.replace(/^const dataRoot = .*;$/m,`const dataRoot = ${JSON.stringify(processing)};`).replace(/^const sourceRoot = .*;$/m,`const sourceRoot = ${JSON.stringify(pdfs)};`);
  await writeFile(join(scripts,'textbook-production.mjs'),producer);
  // A preflight must finish without starting either renderer or model.
  await writeFile(join(scripts,'textbook-production-cli.mjs'),"export function invokeTextbookCodex(){throw Error('unexpected_model_call')} export function parseTextbookCliResult(){} export function textbookClosedPrompt(){} export function assertTextbookModelAdmission(){throw Error('unexpected_dispatch')}\n");
  for(const name of ['render-textbook-page.py','render-textbook-region.py'])await writeFile(join(scripts,name),"raise Exception('unexpected_render')\n");
  const pdf=Buffer.from('synthetic PDF bytes, never rendered'),asset=Buffer.from('synthetic image bytes, never decoded');await writeFile(join(pdfs,'fixture.pdf'),pdf);await writeFile(join(processing,'assets/example.png'),asset);
  const selected=['b1','b3','b8'],blocks=Array.from({length:9},(_,i)=>({id:'b'+(i+1),type:i>=7?'image':'text',bbox:[10+i*5,10,14+i*5,20],...(i>=7?{asset:'assets/example.png',imageSha256:sha(asset)}:{lines:[{text:i===0?' ':'source '+(i+1),bbox:[10,10,20,20]}]})}));
  const page={sourceId:'79-cn',page:114,size:[0,0,100,100],plainText:'full inventory is unchanged',blocks},pageBytes=JSON.stringify(page),pageData='79-cn/pages/114.json';await writeFile(join(processing,pageData),pageBytes);
  const inventory={sources:[{sourceId:'79-cn',filename:'fixture.pdf',sha256:sha(pdf),pages:[{page:114,pageData,pageDataSha256:sha(pageBytes)}]}]},inventoryBytes=JSON.stringify(inventory);await writeFile(join(processing,'source-inventory.json'),inventoryBytes);
  const map={inventorySha256:sha(inventoryBytes),chapters:[{chapterId:'new',units:[]}]},mapBytes=JSON.stringify(map);await writeFile(join(processing,'integration/chapter-map.json'),mapBytes);
  const owners=blocks.map(b=>({sourceId:'79-cn',page:114,sourceBlockId:b.id,chapterId:selected.includes(b.id)?'new':'old',unitId:selected.includes(b.id)?'new-1':'old-1'})),ownership={chapterMapSha256:sha(mapBytes),blocks:owners},ownershipBytes=JSON.stringify(ownership);await writeFile(join(processing,'integration/source-block-ownership.json'),ownershipBytes);
  const scope={schema:'coach-textbook-pdf-source-block-scope/1',sourceId:'79-cn',page:114,chapterId:'new',pdfSha256:sha(pdf),pageDataPath:pageData,pageDataSha256:sha(pageBytes),sourceInventorySha256:sha(inventoryBytes),ownership:{path:'integration/source-block-ownership.json',sha256:sha(ownershipBytes)},sourceBlockIds:['b1','b8','b3'],protectedSourceBlockIds:blocks.filter(b=>!selected.includes(b.id)).map(b=>b.id),selectedBlocks:blocks.filter(b=>selected.includes(b.id)),selectedOwners:owners.filter(o=>selected.includes(o.sourceBlockId))};
  const scopePath=join(processing,'scope.json');
  async function run(value=scope,runId='fixture'){await writeFile(scopePath,JSON.stringify(value));return spawnSync(process.execPath,[join(scripts,'textbook-production.mjs'),'--source','79-cn','--page','79-cn:114','--attempts','1','--run-id',runId,'--source-block-scope',scopePath,'--preflight-only'],{encoding:'utf8',windowsHide:true});}
  return{root,processing,scope,run,pageBytes,inventoryBytes};
}

describe('PDF explicit source-block production scope',()=>{
  it('uses two source texts and one new image without changing the nine-block inventory',async()=>{
    const f=await fixture(),result=await f.run();assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);
    assert.equal(output.fullSourceBlockCount,9);assert.deepEqual(output.textTargetIds,['b1','b3']);assert.deepEqual(output.imageTargetIds,['b8']);assert.deepEqual(output.regionSourceBlockIds,[['b8']]);assert.equal(output.modelCalls,0);
    assert.deepEqual(output.sourceBlockScope.sourceBlockIds,['b1','b3','b8']);assert.equal(output.pageDataSha256,sha(f.pageBytes));assert.equal(await readFile(join(f.processing,'79-cn/pages/114.json'),'utf8'),f.pageBytes);assert.equal(await readFile(join(f.processing,'source-inventory.json'),'utf8'),f.inventoryBytes);
    const manifest=JSON.parse(await readFile(join(f.processing,'production/fixture/manifest.json'),'utf8'));assert.deepEqual(manifest.sourceBlockScope,output.sourceBlockScope);
    assert.deepEqual(output.schema.properties.pageFlow.items.anyOf[0].properties.sourceBlockIds.items.enum,['b1','b3']);
  });
  it('rejects overlap with protected content and any changed selected source text',async()=>{
    const f=await fixture(),overlap=structuredClone(f.scope);overlap.protectedSourceBlockIds.push('b3');let result=await f.run(overlap,'overlap');assert.notEqual(result.status,0);assert.match(result.stderr,/source_scope_not_exact_partition/);
    const changed=structuredClone(f.scope);changed.selectedBlocks[0].lines[0].text='rewritten';result=await f.run(changed,'changed');assert.notEqual(result.status,0);assert.match(result.stderr,/source_scope_selected_blocks_or_owners_changed/);
  });
  it('rejects native page tampering rather than producing a smaller replacement inventory',async()=>{
    const f=await fixture();await writeFile(join(f.processing,'79-cn/pages/114.json'),f.pageBytes+' ');const result=await f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/source_scope_page_data_changed/);
  });
});
