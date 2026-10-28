"""Foreground local Chromium DOM check of the sealed stage; never starts a service."""
from pathlib import Path
import json,hashlib,subprocess,re,shutil
P=Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-311-native-admission-20261028');O=Path(__file__).resolve().parent
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
stage=P/'stage';display=load(stage/'display-limits.json');original=display['originalBlocks'];notes=display['notes']
qa=P/'browser';qa.mkdir(exist_ok=True)
expected={'authorIds':[b['id'] for b in original],'notes':[{'id':n['id'],'text':n['text'],'after':next(b['id'] for b in original if b['type']=='figure' and n['afterSourceBlockId'] in b['locator']['sourceBlockIds'])} for n in notes]}
code='''<script>addEventListener('load',async()=>{
const expected=EXPECTED;document.querySelectorAll('img').forEach(i=>i.loading='eager');
await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r})));
const authorIds=expected.authorIds.every(id=>!!document.getElementById(id));
const allNotes=expected.notes.every(n=>{const e=document.getElementById(n.id),f=document.getElementById(n.after);if(!e||!f||!e.textContent.startsWith(n.text)||!e.getBoundingClientRect().height)return false;for(let q=f.nextElementSibling;q;q=q.nextElementSibling){if(q===e)return true;if(!q.id.startsWith('limited311-'))return false;}return false});
const images=[...document.images].length===21&&[...document.images].every(i=>i.complete&&i.naturalWidth>0&&i.naturalHeight>0);
const result={author225:authorIds,notes18VisibleAndAdjacent:allNotes,images21Loaded:images};
const e=document.createElement('pre');e.id='qa-result';e.textContent=JSON.stringify(result);document.body.append(e);
});</script>'''.replace('EXPECTED',json.dumps(expected,ensure_ascii=False).replace('<','\\u003c'))
html=(stage/'knowledge.html').read_text(encoding='utf-8').replace('src="assets/','src="../stage/assets/').replace('href="assets/','href="../stage/assets/')
path=qa/'check.html';path.write_text(html.replace('</body>',code+'</body>'),encoding='utf-8')
browser=Path('C:/Users/Roland/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe')
run=subprocess.run([str(browser),'--headless','--disable-gpu','--no-sandbox','--no-first-run','--disable-extensions','--allow-file-access-from-files','--virtual-time-budget=8000','--dump-dom',path.as_uri()],capture_output=True,timeout=45)
(qa/'actual-dom.html').write_bytes(run.stdout);(qa/'stderr.txt').write_bytes(run.stderr)
assert run.returncode==0,run.stderr[-1000:]
m=re.search(rb'<pre id="qa-result">(.*?)</pre>',run.stdout);assert m,'no browser result'
result=json.loads(m.group(1));assert all(result.values()),result
report={'exitCode':0,**result,'inputHtmlSha256':sha((stage/'knowledge.html').read_bytes()),'actualDomSha256':sha(run.stdout),'globalMcpArenaReadbackCompleted':False,'newModelCalls':0}
(P/'browser-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');shutil.copyfile(P/'browser-verification.json',O/'browser-verification.json')
print(json.dumps(report))
