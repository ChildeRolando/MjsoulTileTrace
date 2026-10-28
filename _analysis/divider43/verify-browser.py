import asyncio,hashlib,json,pathlib,subprocess,urllib.request
import websockets
BASE=pathlib.Path('E:/AgentData/Coach/knowledge/processing/integration')
D=BASE/'coac250-ascii-divider-layout-20261029';local=pathlib.Path(__file__).parent
load=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
sha=lambda x:hashlib.sha256(x).hexdigest()
application=load(local/'application.json');output=pathlib.Path(application['output']);url='http://127.0.0.1:8766/knowledge.html'
with urllib.request.urlopen(url,timeout=10) as r:served=r.read();assert r.status==200
assert sha(served)==application['after']['sha256']
assert served.count(b'<span class="ascii-separator-line">')==772
bodies=load(output/'textbook-bodies.json');byid={b['id']:b for c in bodies['chapters'] for b in c['blocks']}
targets=[{'id':'79-bilibili-cn-cv1689302-b3','chapter':'79-bilibili-cn-cv1689302-chapter'}, {'id':'79-bilibili-cn-cv1689331-b3','chapter':'79-bilibili-cn-cv1689331-chapter'}]
browser=pathlib.Path('C:/Users/Roland/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe');profile=D/'browser-profile';profile.mkdir(exist_ok=True);portfile=profile/'DevToolsActivePort'
if portfile.exists():portfile.unlink()
log=(D/'browser.log').open('wb');process=subprocess.Popen([str(browser),'--headless','--disable-gpu','--no-first-run','--no-sandbox','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+str(profile),'about:blank'],stdout=log,stderr=log)
rows=[]
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
   await call('Page.navigate',{'url':url+'#'+t['id']})
   code='''(()=>{const t=TARGET,p=document.getElementById(t.id),a=document.getElementById(t.chapter);if(!p||a.hidden)return null;const clone=p.cloneNode(true);clone.querySelectorAll('.paragraph-source').forEach(x=>x.remove());const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);function point(n,last){const s=n.textContent,m=last?/\\S(?=\\s*$)/.exec(s):/\\S/.exec(s);if(!m)return null;const r=document.createRange();r.setStart(n,m.index);r.setEnd(n,m.index+1);const q=r.getBoundingClientRect();return{top:q.top,bottom:q.bottom}}const spans=[...p.querySelectorAll('.ascii-separator-line')].map(e=>{const i=nodes.indexOf(e.firstChild),previous=nodes.slice(0,i).reverse().map(n=>point(n,true)).find(Boolean),next=nodes.slice(i+1).map(n=>point(n,false)).find(Boolean),r=e.getBoundingClientRect(),s=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);return{length:e.textContent.length,display:s.display,whiteSpace:s.whiteSpace,rectCount:range.getClientRects().length,top:r.top,bottom:r.bottom,previousBottom:previous?.bottom??null,nextTop:next?.top??null,separateBefore:!previous||previous.bottom<=r.top+1,separateAfter:!next||next.top>=r.bottom-1}});const caption=a.querySelector('figcaption');return {id:t.id,chapter:t.chapter,url:location.href,visible:p.getBoundingClientRect().height>0,nonWhitespaceText:clone.textContent.replace(/\\s/g,''),spans,captionPresent:!!caption&&caption.textContent.length>0,firstImageSrc:a.querySelector('img')?.src??null,navigationCount:document.querySelectorAll('[data-chapter]').length}})()'''.replace('TARGET',json.dumps(t))
   result=None
   for _ in range(100):
    raw=await call('Runtime.evaluate',{'expression':code,'returnByValue':True});result=raw.get('result',{}).get('value')
    if result and result['visible']:break
    await asyncio.sleep(.1)
   assert result and result['visible'];assert result['navigationCount']==258
   assert result['nonWhitespaceText']==''.join(byid[t['id']]['text'].split()),'non-whitespace body changed'
   assert len(result['spans'])==3,result
   for span in result['spans']:
    assert span['display']=='block' and span['whiteSpace']=='pre' and span['rectCount']==1,span
    assert span['separateBefore'] and span['separateAfter'],span
   result.pop('nonWhitespaceText');rows.append(result)
  await call('Browser.close')
try:asyncio.run(verify());process.wait(timeout=10)
finally:
 if process.poll() is None:process.terminate();process.wait(timeout=10)
 log.close()
images=[]
for row in rows:
 if row['firstImageSrc']:
  with urllib.request.urlopen(row['firstImageSrc'],timeout=10) as r:data=r.read();assert r.status==200
  images.append({'url':row['firstImageSrc'],'status':200,'bytes':len(data),'sha256':sha(data)})
assert images and all(row['captionPresent'] for row in rows)
for ref in application['protectedFiles']:assert sha(pathlib.Path(ref['path']).read_bytes())==ref['sha256'],ref['path']
result={'verified':True,'url':url,'htmlSha256':sha(served),'visibleGroupsInDocument':772,'actualSamples':rows,'imageChecks':images,'allOriginalProtectedFilesUnchanged':True,'newModelCalls':0,'formalActiveChanged':False,'temporaryBrowserExited':process.poll() is not None}
(local/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');(D/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'verified':True,'actualParagraphs':len(rows),'actualSeparatorsMeasured':sum(len(r['spans']) for r in rows),'visualOwnLine':True,'normalImagesAndCaptions':True,'protectedFilesUnchanged':True}))
