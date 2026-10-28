"""Read-only native/source inspection. Download originals only; no pixel edits or models."""
import concurrent.futures,hashlib,io,json,pathlib,time,re,sys
import requests,fitz
from PIL import Image
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');D=P/'integration/coac244-311-source-gap-20261028';D.mkdir(exist_ok=True)
R=json.loads((P/'integration/coac249-311-curves-reviewed-20261028.json').read_text(encoding='utf-8-sig'))
S=json.loads(pathlib.Path(R['source']['path']).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest()
rows=[]
for i,im in enumerate(R['images']):
 b=pathlib.Path(im['path']).read_bytes();assert sha(b)==im['sha256'];a=next(a for a in S['assets'] if a['sha256']==im['sha256']);pic=Image.open(io.BytesIO(b))
 rows.append({'figureId':R['targetFigureIds'][i],'path':im['path'],'sha256':sha(b),'bytes':len(b),'size':list(pic.size),'pixelSha256':sha(pic.convert('RGB').tobytes()),'url':a['url']})
for name,ref in [('maker',R['makerRaw']),('review',R['raw'])]:
 x=json.loads(pathlib.Path(ref['path']).read_text(encoding='utf-8-sig'));ex=x['requestExecution'];assert len(ex['images'])==8
 for i,z in enumerate(ex['images']):
  assert z['sha256']==rows[i]['sha256'];assert z['bytes']==rows[i]['bytes'];assert pathlib.Path(z['path'])==pathlib.Path(rows[i]['path'])
 for row in rows:row[name+'ActualInputOriginalBytes']=True
htmlpath=P/'web-sources/v1'/S['html']['path'];h=htmlpath.read_text(encoding='utf-8-sig');assert sha(htmlpath.read_bytes())==S['html']['sha256']
for row in rows:
 name=row['url'].split('/')[-1];idx=h.find(name);row['capturedHtmlImageContext']=h[max(0,idx-110):idx+len(name)+100]
 row['capturedHtmlNativeDimensionPresent']=f'"width":{row["size"][0]},"height":{row["size"][1]}' in h
pdf=pathlib.Path('E:/AgentData/Coach/textbook-source-inspection/79博客-目录书签跳转版.pdf');doc=fitz.open(pdf);assert sha(pdf.read_bytes())==json.loads((P/'79-cn/inventory.json').read_text(encoding='utf-8-sig'))['sha256'];pdfrecords=[]
pageXrefs=[(320,2937),(321,2940),(321,2942),(322,2945),(322,2947),(323,2950),(324,2985),(325,2988)]
for row,(pg,wanted) in zip(rows,pageXrefs):
 page=doc[pg-1]
 for info in page.get_images(full=True):
  xref=info[0];z=doc.extract_image(xref);pic=Image.open(io.BytesIO(z['image']));psha=sha(pic.convert('RGB').tobytes())
  if xref==wanted:
   assert list(pic.size)==row['size']
   rects=page.get_image_rects(xref);drawings=page.get_drawings();over=[d for d in drawings if any(fitz.Rect(d['rect']).intersects(r) for r in rects)]
   pdfrecords.append({'figureId':row['figureId'],'page':pg,'xref':xref,'size':list(pic.size),'imageExtension':z['ext'],'pixelSha256':psha,'matchesWebPixels':psha==row['pixelSha256'],'imageRects':[[r.x0,r.y0,r.x1,r.y1] for r in rects],'pageVectorPaths':len(drawings),'vectorPathsIntersectImage':len(over),'intersectingVectorItemTypes':[[i[0] for i in d['items']] for d in over]})
def fetch(url,name):
 t=time.time();out={'url':url,'savedAs':name,'requestedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 try:
  r=requests.get(url,timeout=(8,18),headers={'User-Agent':'Mozilla/5.0'},allow_redirects=True);b=r.content
  out.update(status=r.status_code,finalUrl=r.url,contentType=r.headers.get('Content-Type'),bytes=len(b),sha256=sha(b),durationSeconds=round(time.time()-t,3));assert len(b)<12_000_000
  (D/'remote').mkdir(exist_ok=True);(D/'remote'/name).write_bytes(b)
  if r.status_code==200 and r.headers.get('Content-Type','').startswith('image/'):
   im=Image.open(io.BytesIO(b));out['size']=list(im.size);out['pixelSha256']=sha(im.convert('RGB').tobytes())
 except Exception as e:out['error']=str(e)
 return out
urls=[(row['url'],f'bare-{i}.bin') for i,row in enumerate(rows)]+[
 ('https://cbingos.gitbooks.io/tfmj/content/7f78b76f010167wg.html','gitbook.html'),
 ('https://www.bilibili.com/opus/205172434569026489','bilibili.html')]
if '--offline' in sys.argv:remote=json.loads((D/'source-inspection.json').read_text(encoding='utf-8-sig'))['remoteChecks']
else:
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as e:remote=list(e.map(lambda x:fetch(*x),urls))
for i,row in enumerate(rows):row['currentBareSourceResponse']=remote[i];row['currentBareResponseSameBytes']=remote[i].get('sha256')==row['sha256']
git=(D/'remote/gitbook.html').read_text(encoding='utf-8',errors='replace') if (D/'remote/gitbook.html').exists() else ''
from bs4 import BeautifulSoup
soup=BeautifulSoup(git,'html.parser');links=[{'src':x.get('src'),'alt':x.get('alt')} for x in soup.find_all('img')];extras=[x.get('href') for x in soup.find_all('a') if any(y in x.get('href','') for y in ['github','sina.com','csv','xlsx','.svg','.pdf'])]
result={'schema':'coac244-cn311-original-source-inspection/1','candidate':R['candidate'],'source':R['source'],'images':rows,'pdf':{'path':str(pdf),'sha256':sha(pdf.read_bytes()),'nativeChartImages':pdfrecords},'remoteChecks':remote,'archiveImageLinks':links,'archiveRelevantLinks':extras,'noResamplingOrEnhancement':True,'noModels':True,'remoteBackendInternalImageProcessing':'unknown; only actual local argv/image bytes can be proven','sourceHtmlHasDataTable':bool(soup.select('table')),'wholeChapterPassed':False}
(D/'source-inspection.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'images':[(x['size'],x['currentBareResponseSameBytes']) for x in rows],'pdfChartCount':len(pdfrecords),'pdfHasLargerRaster':any(x['size']!=rows[i]['size'] for i,x in enumerate(pdfrecords)),'remote':[{'status':z.get('status'),'error':z.get('error')} for z in remote],'archiveImageCount':len(links),'archiveTables':len(soup.select('table'))},ensure_ascii=False))
