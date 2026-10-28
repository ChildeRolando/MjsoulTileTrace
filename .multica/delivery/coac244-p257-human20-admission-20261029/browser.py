"""Foreground native Chromium check. No browser service or model is started."""
from pathlib import Path
import json,hashlib,subprocess,re,shutil
D=Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-p257-human20-admission-20261029');O=Path(__file__).resolve().parent;S=D/'stage'
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest()
d=load(S/'display-limits.json');bs=load(S/'textbook-bodies.json')['chapters'][0]['blocks'];qa=D/'browser';qa.mkdir(exist_ok=True)
expected={'ids':[b['id'] for b in bs],'notes':[{'id':n['id'],'text':n['text']} for n in d['notes']],'images':len(load(S/'textbook-corpus.json')['images'])}
code='''<script>addEventListener('load',async()=>{const x=EXPECTED;document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})));const f=document.getElementById('nemata-jp-p257-r1');let next=f.nextElementSibling;const notes=x.notes.every(n=>{const e=document.getElementById(n.id),ok=e===next&&e.textContent.startsWith(n.text)&&e.getBoundingClientRect().height>0;next=e.nextElementSibling;return ok});const result={allDisplayBlocksVisible:x.ids.every(id=>!!document.getElementById(id)),allSixNotesVisibleAdjacentBeforeQ10:notes,imagesAllLoaded:document.images.length===x.images&&[...document.images].every(i=>i.complete&&i.naturalWidth>0),originalSourceLinks:document.querySelectorAll('#p257-human20-limit-5 a[href*="source-assets/"]').length===2};const e=document.createElement('pre');e.id='qa-result';e.textContent=JSON.stringify(result);document.body.append(e)});</script>'''.replace('EXPECTED',json.dumps(expected,ensure_ascii=False).replace('<','\\u003c'))
html=(S/'knowledge.html').read_text(encoding='utf-8').replace('src="assets/','src="../stage/assets/').replace('href="assets/','href="../stage/assets/').replace('href="source-assets/','href="../stage/source-assets/')
path=qa/'check.html';path.write_bytes(html.replace('</body>',code+'</body>').encode())
browser=Path('C:/Users/Roland/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe')
r=subprocess.run([str(browser),'--headless','--disable-gpu','--no-sandbox','--no-first-run','--disable-extensions','--allow-file-access-from-files','--virtual-time-budget=10000','--dump-dom',path.as_uri()],capture_output=True,timeout=50)
(qa/'actual-dom.html').write_bytes(r.stdout);(qa/'stderr.txt').write_bytes(r.stderr);assert r.returncode==0,r.stderr[-1500:]
m=re.search(rb'<pre id="qa-result">(.*?)</pre>',r.stdout);assert m,'no browser result';result=json.loads(m.group(1));assert all(result.values()),result
report={'exitCode':0,**result,'displayBlocks':len(bs),'figures':expected['images'],'htmlSha256':sha((S/'knowledge.html').read_bytes()),'actualDomSha256':sha(r.stdout),'actualGlobalMcpArenaReadbackCompleted':False,'newModelCalls':0}
(D/'browser-verification.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());shutil.copyfile(D/'browser-verification.json',O/'browser-verification.json');print(json.dumps(report))
