"""Read-only HTTP/CDP inspection of the existing v43 reader, not a rebuild or review."""
import asyncio,hashlib,json,pathlib,subprocess,time,urllib.request,urllib.error
import websockets
ROOT=pathlib.Path('E:/AgentData/Coach/knowledge/processing/integration')
D=ROOT/'coac250-v43-local-inspection-20261029'
load=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
pointer=load(ROOT/'accepted-preview-current.json');out=pathlib.Path(pointer['output']);base='http://127.0.0.1:8766/'
assert pointer['selectionVersion']==43 and pointer['corpusId']=='bd7a83525edb8cb69f27d8aa050dcb010047f79ae318748bdbe448d5b797836d'
protected=[ROOT/'accepted-preview-current.json',pathlib.Path('E:/AgentData/Coach/knowledge/review/textbook-corpus.json'),out/'knowledge.html',out/'textbook-corpus.json',out/'textbook-bodies.json',out/'knowledge-index.json']
before={str(p):sha(p.read_bytes()) for p in protected};assert before[str(protected[1])]=='9836ee5b7043a1f9d9b13bc36e2dcb653d16b883ccb1975d71945365bc759af2'
http=[]
for name in ['knowledge.html','textbook-corpus.json','knowledge-index.json']:
 with urllib.request.urlopen(base+name,timeout=15) as response: blob=response.read();assert response.status==200
 assert sha(blob)==sha((out/name).read_bytes());http.append({'path':name,'status':200,'bytes':len(blob),'sha256':sha(blob)})
corpus=load(out/'textbook-corpus.json');assert corpus['corpusId']==pointer['corpusId'];assert len(corpus['units'])==266 and len(corpus['images'])==6288
bodies=load(out/'textbook-bodies.json');chapterIds=[x['chapterId'] for x in bodies['chapters']]
targets=[
 {'label':'232四条审校限制','anchor':'limited232-1','chapter':'modern-yabejp-ja-chapter04-section012-chapter','notes':['limited232-'+str(i) for i in range(1,5)],'image':'modern-yabejp-ja-chapter04-section012-b5'},
 {'label':'257六条审校限制','anchor':'p257-human20-limit-1','chapter':'nemata-jp-chapter-250-1','notes':['p257-human20-limit-'+str(i) for i in range(1,7)],'image':'nemata-jp-p257-r1'},
 {'label':'261问题17摸入3m','anchor':'nemata-jp-p261-r50','chapter':'nemata-jp-chapter-250-1','notes':[],'image':'nemata-jp-p261-r50'},
 {'label':'311原图与曲线说明','anchor':'limited311-original-1','chapter':'79-bilibili-cn-cv1815400-chapter','notes':['limited311-original-1','limited311-required-1'],'image':None},
 {'label':'311手牌A限制','anchor':'limited311-required-9','chapter':'79-bilibili-cn-cv1815400-chapter','notes':['limited311-required-9'],'image':'79-bilibili-cn-cv1815400-b154'}
]
browser=pathlib.Path('C:/Users/Roland/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe')
profile=D/'browser-profile';profile.mkdir(exist_ok=True);portfile=profile/'DevToolsActivePort'
if portfile.exists():portfile.unlink()
log=(D/'browser.log').open('wb')
process=subprocess.Popen([str(browser),'--headless','--disable-gpu','--no-first-run','--no-sandbox','--disable-extensions','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+str(profile),'about:blank'],stdout=log,stderr=log)
rows=[]
async def inspect():
 for _ in range(100):
  if portfile.exists():break
  assert process.poll() is None,'owned browser exited';await asyncio.sleep(.1)
 assert portfile.exists(),'CDP not ready'
 port=int(portfile.read_text().splitlines()[0])
 pages=json.loads(urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/json/list').read())
 endpoint=next(x['webSocketDebuggerUrl'] for x in pages if x['type']=='page')
 async with websockets.connect(endpoint,max_size=2**22) as ws:
  serial=0
  async def call(method,params={}):
   nonlocal serial
   serial+=1;ident=serial;await ws.send(json.dumps({'id':ident,'method':method,'params':params}))
   while True:
    result=json.loads(await asyncio.wait_for(ws.recv(),20))
    if result.get('id')==ident:
     assert 'error' not in result,result
     return result.get('result',{})
  await call('Page.enable')
  for target in targets:
   url=base+'knowledge.html#'+target['anchor'];await call('Page.navigate',{'url':url})
   expression='''(()=>{const t=TARGET,c=document.getElementById(t.chapter),e=document.getElementById(t.anchor);if(!c||c.hidden||!e||e.getBoundingClientRect().height===0)return null;const f=t.image?document.getElementById(t.image):null,im=f?.querySelector('img');return {url:location.href,chapter:c.id,visibleArticleCount:[...document.querySelectorAll('[data-article]')].filter(x=>!x.hidden).length,activeNav:document.querySelector('[data-chapter][aria-current="page"]')?.dataset.chapter,anchor:e.id,anchorVisible:e.getBoundingClientRect().height>0,notes:t.notes.map(id=>{const x=document.getElementById(id);return{id,visible:!!x&&x.getBoundingClientRect().height>0,text:x?.textContent}}),image:im?{src:im.src,loaded:im.complete&&im.naturalWidth>0}:null,sourceLinks:[...document.querySelectorAll('#p257-human20-limit-5 a[href*="source-assets/"]')].map(a=>a.href),navigationCount:document.querySelectorAll('[data-chapter]').length,text:e.textContent.slice(0,400)}})()'''.replace('TARGET',json.dumps(target,ensure_ascii=False))
   result=None
   for _ in range(100):
    r=await call('Runtime.evaluate',{'expression':expression,'returnByValue':True});result=r.get('result',{}).get('value')
    if result and (not target['image'] or result.get('image',{}).get('loaded')):break
    await asyncio.sleep(.1)
   assert result and result['anchorVisible'] and result['visibleArticleCount']==1,result
   assert result['activeNav']==target['chapter'] and result['navigationCount']==258,result
   assert all(x['visible'] for x in result['notes']),result
   if target['image']:assert result['image']['loaded'],result
   if target['anchor']=='nemata-jp-p261-r50':assert '3m' in result['text'],result
   rows.append({'label':target['label'],**result})
  await call('Browser.close')
try:
 asyncio.run(inspect());process.wait(timeout=10)
finally:
 if process.poll() is None:process.terminate();process.wait(timeout=10)
 log.close()
links=rows[1]['sourceLinks'];assert len(links)==2
originalLinks=[]
for url in links:
 with urllib.request.urlopen(url,timeout=10) as response:blob=response.read();assert response.status==200
 expected=out/url.split(base,1)[1];assert sha(blob)==sha(expected.read_bytes());originalLinks.append({'url':url,'status':200,'sha256':sha(blob)})
assert all(sha(pathlib.Path(p).read_bytes())==digest for p,digest in before.items()),'Protected preview/formal file changed'
result={'verified':True,'service':load(D/'service.json'),'previewVersion':43,'corpusId':corpus['corpusId'],'http':http,'browserTargets':rows,'originalSourceLinks':originalLinks,'protectedFilesUnchanged':before,'existingArenaReaderRoute':False,'arenaConsoleStarted':False,'readOnlyLoopback':True,'newModelCalls':0,'newReviewCalls':0,'contentChanged':False,'formalActiveChanged':False,'temporaryBrowserExited':process.poll() is not None}
(D/'inspection.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
local=pathlib.Path(__file__).parent/'inspection.json'
# Store only route and visibility metadata, not author text, in Git.
for row in result['browserTargets']:
 row.pop('text',None)
 for note in row['notes']:note.pop('text',None)
local.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'verified':True,'url':base+'knowledge.html','version':43,'targets':len(rows),'sourceLinks':len(links),'contentChanged':False,'formalActiveChanged':False,'servicePid':result['service']['pid']}))
