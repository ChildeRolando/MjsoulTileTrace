import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const dir='_analysis/coac250-b8-jpeg',path='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/stage-web-textbook.test.mjs';
const before=await readFile(path,'utf8');await writeFile(dir+'/stage-web-textbook.test.before.mjs',before);
// Existing 1px fixture had a bad IDAT CRC; the stricter decoder must reject corrupt PNGs.
const generated=spawnSync('python',['-c',"from PIL import Image\nimport io,base64\nf=io.BytesIO();Image.new('RGBA',(1,1),'white').save(f,format='PNG');print(base64.b64encode(f.getvalue()).decode())"],{encoding:'utf8',windowsHide:true});assert.equal(generated.status,0);
const old='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=';assert.ok(before.includes(old));
const after=before.replaceAll(old,generated.stdout.trim());await writeFile(path,after);await writeFile(dir+'/stage-web-textbook.test.after.mjs',after);
const integrate=(await readFile('_analysis/coac250-b8-integrate.mjs','utf8')).replaceAll("dir='_analysis/coac250-b8'","dir='_analysis/coac250-b8-jpeg'");
const added=integrate.replace("const targetArticles=new Set(pre.items.map(i=>i.articleId));\n",'')
.replace("for(const image of nc.images)await copyFile(join(destination,image.path),join(output,image.path));","for(const image of nc.images)await copyFile(join(destination,image.path),join(output,image.path));\n  if(receipt.imageDerivations?.length)await cp(destination+'/source-assets',output+'/source-assets',{recursive:true});")
.replace("notes.push({...item.retainedNote,","notes.push({imageDerivations:receipt.imageDerivations??[],...item.retainedNote,");
await writeFile(dir+'/integrate.mjs',added);
// Refresh preflight from immutable handoff and bindings after the previous turn's failure.
const preflight=(await readFile('_analysis/coac250-b8-preflight.mjs','utf8')).replace("dir='_analysis/coac250-b8'","dir='_analysis/coac250-b8-jpeg'");
await writeFile(dir+'/preflight.mjs',preflight);
for(const f of ['coac249-incremental-269-b8-20261027.json','attestation-cv1734739-c14911aa.json','attestation-cv1744266-07a511d4.json','transport-diag-test.mjs']){
 // git supplies the original committed LF bytes, unaffected by worktree CRLF checkout.
 const r=spawnSync('git',['show','38b1383:_analysis/coac250-b8/'+f]);assert.equal(r.status,0);await writeFile(dir+'/'+f,r.stdout);
}
