"""Fetch only eight original-image links actually published in the existing archive."""
import concurrent.futures,json,pathlib,hashlib,io,urllib.parse
import requests
from bs4 import BeautifulSoup
from PIL import Image
D=pathlib.Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-311-source-gap-20261028');s=BeautifulSoup((D/'remote/gitbook.html').read_text(encoding='utf-8'),'html.parser');rows=[]
for n in range(8,16):
 text=s.find(string=lambda t:t and t.strip().startswith('图'+str(n)+'：'))
 assert text,n
 p=text.find_parent('p');ims=p.find_all('img');im=ims[-1] if ims else p.find_previous('img');a=im.find_parent('a');link=a['href'];original=urllib.parse.unquote(link.split('&url=')[1]);url=original.replace('http://','https://')
 rows.append({'figureNumber':n,'caption':p.get_text(' ',strip=True),'publishedPreview':im['src'],'publishedOriginalLink':original,'requestedOriginal':url})
def get(row):
 try:
  r=requests.get(row['requestedOriginal'],timeout=(8,15),headers={'User-Agent':'Mozilla/5.0','Referer':'https://blog.sina.com.cn/'})
  b=r.content;(D/'remote'/('sina-figure'+str(row['figureNumber'])+'.bin')).write_bytes(b);row.update(status=r.status_code,contentType=r.headers.get('Content-Type'),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
  if r.status_code==200 and r.headers.get('Content-Type','').startswith('image/'):
   im=Image.open(io.BytesIO(b));row.update(size=list(im.size),pixelSha256=hashlib.sha256(im.convert('RGB').tobytes()).hexdigest())
 except Exception as e:row['error']=str(e)
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as e:rows=list(e.map(get,rows))
(D/'archive-original-checks.json').write_bytes(json.dumps({'archiveUrl':'https://cbingos.gitbooks.io/tfmj/content/7f78b76f010167wg.html','rows':rows,'noResampling':True},ensure_ascii=False,indent=2).encode('utf-8')+b'\n')
print(json.dumps(rows,ensure_ascii=False))
