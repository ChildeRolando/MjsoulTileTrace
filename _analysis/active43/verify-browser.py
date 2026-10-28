import asyncio,hashlib,json,pathlib,subprocess,urllib.request
import websockets
D=pathlib.Path('E:/AgentData/Coach/knowledge/processing/integration/coac250-formal-v43-20261029');formal=pathlib.Path('E:/AgentData/Coach/knowledge/review');load=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'));sha=lambda x:hashlib.sha256(x).hexdigest()
service=load(D/'service.json');base='http://127.0.0.1:8767/';assert pathlib.Path(service['directory'])==formal
with urllib.request.urlopen(base+'knowledge.html',timeout=10) as r:html=r.read();assert r.status==200
assert html==(formal/'knowledge.html').read_bytes();assert html.count(b'<span class="ascii-separator-line">')==772
sealed=load(D/'release-inputs.json');assert sha(html)==next(f['sha256'] for f in sealed['files'] if f['name']=='knowledge.html')
targets=[
 {'id':'limited232-1','chapter':'modern-yabejp-ja-chapter04-section012-chapter','notes':['limited232-'+str(i) for i in range(1,5)],'image':'modern-yabejp-ja-chapter04-section012-b5'},
 {'id':'p257-human20-limit-1','chapter':'nemata-jp-chapter-250-1','notes':['p257-human20-limit-'+str(i) for i in range(1,7)],'image':'nemata-jp-p257-r1'},
 {'id':'nemata-jp-p261-r50','chapter':'nemata-jp-chapter-250-1','notes':[],'image':'nemata-jp-p261-r50'},
 {'id':'limited311-original-1','chapter':'79-bilibili-cn-cv1815400-chapter','notes':['limited311-original-1','limited311-required-1'],'image':None},
 {'id':'limited311-required-9','chapter':'79-bilibili-cn-cv1815400-chapter','notes':['limited311-required-9'],'image':'79-bilibili-cn-cv1815400-b154'},
 {'id':'79-bilibili-cn-cv1689302-b3','chapter':'79-bilibili-cn-cv1689302-chapter','notes':[],'image':None},
 {'id':'79-bilibili-cn-cv1689331-b3','chapter':'79-bilibili-cn-cv1689331-chapter','notes':[],'image':None}]
browser=pathlib.Path('C:/Users/Roland/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe');profile=D/'browser-profile';profile.mkdir(exist_ok=True);portfile=profile/'DevToolsActivePort'
if portfile.exists():portfile.unlink()
log=(D/'browser.log').open('wb');process=subprocess.Popen([str(browser),'--headless','--disable-gpu','--no-first-run','--no-sandbox','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+str(profile),'about:blank'],stdout=log,stderr=log);rows=[]
async def verify():
 for _ in range(100):
  if portfile.exists():break
  assert process.poll() is None;await asyncio.sleep(.1)
 port=int(portfile.read_text().splitlines()[0]);pages=json.loads(urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/json/list').read());endpoint=next(p['webSocketDebuggerUrl'] for p in pages if p['type']=='page')
 async with websockets.connect(endpoint,max_size=2**22) as ws:
  serial=0
  async def call(method,params={}):
   nonlocal serial
   serial+=1;ident=serial;await ws.send(json.dumps({'id':ident,'method':method,'params':params}))
   while True:
    msg=json.loads(await asyncio.wait_for(ws.recv(),20))
    if msg.get('id')==ident:
     assert 'error' not in msg,msg
     return msg.get('result',{})
  await call('Page.enable')
  for t in targets:
   await call('Page.navigate',{'url':base+'knowledge.html#'+t['id']})
   code='''(()=>{const t=TARGET,p=document.getElementById(t.id),a=document.getElementById(t.chapter);if(!p||a.hidden||!p.getBoundingClientRect().height)return null;const image=t.image?document.getElementById(t.image)?.querySelector('img'):null;return{url:location.href,chapter:a.id,anchor:p.id,visible:true,notes:t.notes.map(id=>({id,visible:!!document.getElementById(id)?.getBoundingClientRect().height})),imageLoaded:image?image.complete&&image.naturalWidth>0:null,separatorGroups:[...p.querySelectorAll('.ascii-separator-line')].map(e=>({length:e.textContent.length,display:getComputedStyle(e).display,whiteSpace:getComputedStyle(e).whiteSpace})),sourceLinks:[...document.querySelectorAll('#p257-human20-limit-5 a[href*="source-assets/"]')].map(a=>a.href),navigationCount:document.querySelectorAll('[data-chapter]').length}})()'''.replace('TARGET',json.dumps(t))
   result=None
   for _ in range(100):
    raw=await call('Runtime.evaluate',{'expression':code,'returnByValue':True});result=raw.get('result',{}).get('value')
    if result and (not t['image'] or result['imageLoaded']):break
    await asyncio.sleep(.1)
   assert result and result['navigationCount']==258,result
   assert all(n['visible'] for n in result['notes']),result
   if t['image']:assert result['imageLoaded'],result
   if t['id'].startswith('79-bilibili-cn-cv1689'):
    assert len(result['separatorGroups'])==3
    assert all(g['display']=='block' and g['whiteSpace']=='pre' for g in result['separatorGroups'])
   rows.append(result)
  await call('Browser.close')
try:asyncio.run(verify());process.wait(timeout=10)
finally:
 if process.poll() is None:process.terminate();process.wait(timeout=10)
 log.close()
links=rows[1]['sourceLinks'];assert len(links)==2;originals=[]
for url in links:
 with urllib.request.urlopen(url,timeout=10) as r:data=r.read();assert r.status==200
 assert data==(formal/url.split(base,1)[1]).read_bytes();originals.append({'url':url,'sha256':sha(data),'status':200})
result={'passed':True,'formalDirectory':str(formal),'url':service['url'],'htmlSha256':sha(html),'corpusId':load(formal/'textbook-corpus.json')['corpusId'],'targets':rows,'originalSourceImages':originals,'all772SeparatorsRetained':True,'temporaryBrowserExited':process.poll() is not None,'newModelCalls':0};(D/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'passed':True,'formalUrl':service['url'],'targets':len(rows),'sourceLinks':len(links),'separators':772}))
