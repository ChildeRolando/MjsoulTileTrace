// Uses an already installed Playwright and browser; never downloads dependencies or calls models.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { startServer, sha256 } from './server.mjs';

const modulePath = process.env.COACH_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'coach-label-browser-'));
let browser, app;
try {
  const root = path.join(dir,'processing'); fs.mkdirSync(root);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM4cAAAAASUVORK5CYII=','base64');
  fs.writeFileSync(path.join(root,'fixture.png'),bytes);
  const queue = {schema:'coach-tile-annotation-queue/1',items:[1,2].map(n=>({id:`fixture-${n}`,targetId:`tile-${n}`,canonical:'isolated-fixture',book:'独立临时测试',chapter:'测试',imageSha256:sha256(bytes),imagePath:'fixture.png',position:'左河第1张',bbox:[0,0,1,1],blocking:n===1,admission:n===1?'阻塞':'非阻塞',machine:{transcription:'测试候选'}}))};
  const queuePath=path.join(dir,'queue.json');fs.writeFileSync(queuePath,JSON.stringify(queue));
  const dataDir=path.join(dir,'human');
  app=await startServer({root,queuePath,dataDir,port:0});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({executablePath:process.env.COACH_BROWSER,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(base);
  await page.waitForFunction(()=>document.querySelector('#overview').naturalWidth>0);
  await page.waitForFunction(()=>{
    const image=document.querySelector('#overview').getBoundingClientRect(), rect=document.querySelector('#box rect');
    if(!rect)return false;
    const bounds=rect.getBoundingClientRect();
    return getComputedStyle(rect).stroke==='rgb(211, 46, 36)' && Math.abs(bounds.x-image.x)<1 && Math.abs(bounds.y-image.y)<1;
  });
  assert.equal(await page.locator('#machine').evaluate(e=>e.open),false);
  await page.fill('#tiles','赤5m 東');
  await page.waitForFunction(()=>document.querySelector('#saveState').textContent.startsWith('已保存'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#tiles').value==='0m 1z');
  let exported=await page.request.get(base+'/api/export').then(r=>r.json());
  assert.deepEqual(exported.events[0].result.tiles,['0m','1z']);
  await page.fill('#tiles','2p');await page.keyboard.press('Control+Enter');
  await page.waitForFunction(()=>document.querySelector('#jump').value==='fixture-2');
  await page.keyboard.press('Alt+ArrowLeft');await page.waitForFunction(()=>document.querySelector('#tiles').value==='2p');
  await page.locator('#history summary').click();await page.click('#withdraw');
  await page.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('已撤回'));
  const eventsBefore=fs.readFileSync(path.join(dataDir,'events.jsonl'),'utf8').trim().split('\n').length;
  await page.fill('#tiles','8z');await page.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('无法识别牌码'));
  assert.equal(fs.readFileSync(path.join(dataDir,'events.jsonl'),'utf8').trim().split('\n').length,eventsBefore);
  await page.selectOption('#status','unclear');await page.waitForFunction(()=>document.querySelector('#saveState').textContent.startsWith('已保存'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status').value==='unclear');
  assert.equal(await page.locator('#tiles').isDisabled(),true);
  await page.selectOption('#filter','todo');assert.equal(await page.locator('#jump option').count(),1);
  await page.selectOption('#filter','all');
  await page.route('**/api/annotations',route=>route.abort());
  await page.fill('#tiles','9s');await page.waitForFunction(()=>document.querySelector('#saveState').textContent.startsWith('未保存'));
  await page.unroute('**/api/annotations');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#jump').value==='fixture-2');
  assert.equal(await page.locator('#tiles').inputValue(),'');
  for(const width of [1440,800,390]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`overflow at ${width}`);
  }
  assert.deepEqual(errors,[]);
  exported=await page.request.get(base+'/api/export').then(r=>r.json());
  assert.equal(exported.events.some(e=>e.result.status==='withdrawn'),true);
  console.log(JSON.stringify({result:'passed',checks:['automatic-file-save','tile-validation','refresh-restoration','edit-history','withdrawal','export','keyboard-navigation','remaining-filter','network-failure-recovery','1440/800/390-layout'],temporaryEvents:exported.events.length,userRecordsWritten:0}));
} finally {
  if(browser)await browser.close();if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});
}
