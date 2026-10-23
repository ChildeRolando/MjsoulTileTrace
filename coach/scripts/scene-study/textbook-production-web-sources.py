"""Capture the two authorized HTML sources, preserving DOM order and original assets."""
import argparse, hashlib, json, re, sys, subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, parse_qs, unquote
import requests
from bs4 import BeautifulSoup, NavigableString, Comment, Tag

sys.stdout.reconfigure(encoding="utf-8")
ROOT=Path("E:/AgentData/Coach/knowledge/processing/web-sources/v1")
BOOKS={
 "79-sina-cn":{"language":"zh-CN","index":"http://blog.sina.com.cn/s/articlelist_2138617711_0_1.html","encoding":"utf-8","selector":"#sina_keyword_ad_area2.articalContent"},
 "modern-yabejp-ja":{"language":"ja","index":"http://yabejp.web.fc2.com/mahjong/tactics.html","encoding":"shift_jis","selector":"#contents"},
 "79-bilibili-cn":{"language":"zh-CN","index":"https://api.bilibili.com/x/article/list/web/articles?id=45758","encoding":"utf-8","selector":".opus-module-content"},
}
SESSION=requests.Session()
SESSION.headers.update({"User-Agent":"Mozilla/5.0 (compatible; TextbookSourceCapture/1.0)"})
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.now(timezone.utc).isoformat()
def save_json(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def rel(path):return path.relative_to(ROOT).as_posix()
def canonical(url):
 p=urlsplit(url);return ("https://" if "bilibili.com" in p.netloc else "http://")+p.netloc+p.path+("?"+p.query if p.query else "")
def capture(url,book):
 folder=ROOT/book/"html"/sha(url.encode())[:24]; meta_path=folder/"fetch.json"
 if meta_path.exists():
  meta=json.loads(meta_path.read_text(encoding="utf-8"));data=(ROOT/meta["path"]).read_bytes()
  if sha(data)!=meta["sha256"] or meta["requestedUrl"]!=url:raise ValueError("cached_html_binding_changed")
  return data,meta
 folder.mkdir(parents=True,exist_ok=True);path=folder/"source.html"
 if book=="79-bilibili-cn":
  root_snapshot=Path("E:/AgentData/Coach/knowledge/processing/web-sources/root-checks/bilibili-cv1689340.html")
  if url=="https://www.bilibili.com/read/cv1689340" and root_snapshot.exists():
   data=root_snapshot.read_bytes()
   if sha(data)!="e65711eda84b4c4e8bf461fce29220e9050e097388955c20754ef170880e0b5a":raise ValueError("root_snapshot_binding_changed")
   path.write_bytes(data);network={"httpStatus":200,"finalUrl":url,"contentType":"text/html; charset=utf-8","captureProvider":"root-verified-byte-snapshot","snapshotPath":str(root_snapshot)}
  else:
   result=subprocess.run(["pwsh","-NoProfile","-File",str(Path(__file__).with_name("textbook-production-fetch.ps1")),"-Url",url,"-OutPath",str(path)],capture_output=True,text=True,encoding="utf-8",check=True)
   network=json.loads(result.stdout);data=path.read_bytes()
   if network["httpStatus"]!=200:raise ValueError("web_fetch_http_status:"+str(network["httpStatus"]))
  if "api.bilibili.com" not in url and BeautifulSoup(data.decode("utf-8"),"lxml").select_one(BOOKS[book]["selector"]) is None:raise ValueError("bilibili_challenge_or_empty_shell_not_source_content")
 else:
  r=SESSION.get(url,timeout=45);r.raise_for_status();data=r.content;path.write_bytes(data)
  network={"httpStatus":r.status_code,"finalUrl":r.url,"contentType":r.headers.get("Content-Type")}
 meta={"requestedUrl":url,**network,"fetchedAt":now(),"encoding":BOOKS[book]["encoding"],"path":rel(path),"sha256":sha(data),"bytes":len(data)}
 save_json(meta_path,meta);return data,meta
def soup(data,book):
 try:text=data.decode(BOOKS[book]["encoding"],errors="strict")
 except UnicodeDecodeError:
  if book!="modern-yabejp-ja":raise
  text=data.decode("cp932",errors="strict")
 return BeautifulSoup(text,"lxml")
def catalog(book):
 cfg=BOOKS[book];pending=[cfg["index"]];seen=set();articles={};indices=[]
 if book=="modern-yabejp-ja":pending.append("http://yabejp.web.fc2.com/mahjong/archives.html")
 if book=="79-bilibili-cn":
  data,meta=capture(cfg["index"],book);api=json.loads(data)
  if api.get("code")!=0:raise ValueError("bilibili_catalog_not_success")
  items=api["data"]["articles"]
  out={"schema":"coach-textbook-web-source-catalog/1","sourceId":book,"language":"zh-CN","capturedAt":now(),"indices":[meta],"articleCount":len(items),"articles":[{"url":"https://www.bilibili.com/read/cv"+str(a["id"]),"listingTitle":a["title"],"articleId":"cv"+str(a["id"]),"scopeCandidate":bool(re.search("日本麻雀.*(?:讲座|译文)",a["title"])) or a["title"]=="详细日本麻将教学（入门篇）","scopeDecision":"requires-title-originalURL-and-PDF-body-alignment","summary":a.get("summary","")} for a in items],"attribution":{"reposter":api["data"].get("author"),"series":api["data"].get("list")},"note":"123 collection entries are not all approved textbook scope; unrelated tutorials must be excluded."}
  save_json(ROOT/book/"catalog.json",out);return out
 while pending:
  url=pending.pop(0)
  if url in seen:continue
  seen.add(url)
  try:data,meta=capture(url,book)
  except Exception as e:
   indices.append({"requestedUrl":url,"status":"failed","failure":str(e),"fetchedAt":now()});continue
  indices.append(meta);dom=soup(data,book)
  for a in dom.select("a[href]"):
   target=canonical(urljoin(url,a["href"]));label=a.get("title") or a.get_text(" ",strip=True)
   if book=="79-sina-cn":
    if re.search(r"/s/articlelist_2138617711_\d+_\d+\.html$",target) and target not in seen:pending.append(target)
    if re.search(r"/s/blog_7f78b76f[0-9a-z]+\.html$",target):articles.setdefault(target,{"url":target,"listingTitle":label,"titleStatus":"listing-may-truncate"})
   elif book=="modern-yabejp-ja" and re.search(r"/mahjong/(?:tactics/chapter\d+/(?:section|exercise|exhibition)[\d-]+|archives/[^?#]+)\.html$",target):
    heading=a.find_previous(["h2","h3"])
    articles.setdefault(target,{"url":target,"listingTitle":label,"catalogHeading":heading.get_text(" ",strip=True) if heading else None,"titleStatus":"source-catalog","scopeDecision":"requires-PDF-scope-comparison" if "exhibition" in target or "/archives/" in target else "textbook-tactics-or-exercise"})
    if "exercise" in target and target not in seen:pending.append(target)
 out={"schema":"coach-textbook-web-source-catalog/1","sourceId":book,"language":cfg["language"],"capturedAt":now(),"indices":indices,"articles":list(articles.values()),"articleCount":len(articles),"scope":"explicit-Sina-author-directory" if book=="79-sina-cn" else "explicit-modern-tactics-links","note":"Catalog completeness does not imply every article or asset is downloaded, translated, or independently accepted."}
 save_json(ROOT/book/("catalog-v2.json" if book=="modern-yabejp-ja" else "catalog.json"),out);return out
def image_urls(img,url):
 options=[];a=img.find_parent("a",href=True)
 if a and "showpic.html" in a["href"]:
  match=re.search(r"(?:#|&)url=(.+?)(?:&|$)",a["href"])
  if match:options.append(unquote(match.group(1)))
 for name in ["real_src","data-src","src"]:
  value=img.get(name)
  if value and "sg_trans.gif" not in value:
   target=urljoin(url,value)
   if "hdslb.com/bfs/article/" in target and "@" in target:options.append(target.split("@",1)[0])
   options.append(target)
 return list(dict.fromkeys(options))
def asset(url,book):
 key=sha(url.encode())[:24];meta_path=ROOT/book/"asset-urls"/(key+".json")
 if meta_path.exists():
  record=json.loads(meta_path.read_text(encoding="utf-8"))
  if record.get("status")=="downloaded":
   data=(ROOT/record["path"]).read_bytes()
   if sha(data)!=record["sha256"] or record["url"]!=url:raise ValueError("cached_asset_binding_changed")
   if "default_s_bmiddle.gif" in record.get("finalUrl",""):
    record["status"]="placeholder";record["failure"]="Source server redirected to missing-image placeholder";save_json(meta_path,record)
  return record
 try:
  r=SESSION.get(url,timeout=40);r.raise_for_status();kind=r.headers.get("Content-Type","").split(";")[0]
  if not kind.startswith("image/"):raise ValueError("not_image:"+kind)
  data=r.content;digest=sha(data);ext={"image/gif":"gif","image/png":"png","image/jpeg":"jpg","image/webp":"webp"}.get(kind,"image")
  path=ROOT/book/"assets"/(digest+"."+ext);path.parent.mkdir(parents=True,exist_ok=True)
  if path.exists() and sha(path.read_bytes())!=digest:raise ValueError("asset_digest_path_changed")
  path.write_bytes(data)
  record={"assetId":book+":"+key,"status":"downloaded","url":url,"finalUrl":r.url,"fetchedAt":now(),"httpStatus":r.status_code,"contentType":kind,"bytes":len(data),"sha256":digest,"path":rel(path)}
  if "default_s_bmiddle.gif" in r.url:record.update(status="placeholder",failure="Source server redirected to missing-image placeholder")
 except Exception as e:record={"assetId":book+":"+key,"status":"failed","url":url,"fetchedAt":now(),"failure":str(e)}
 save_json(meta_path,record);return record
def tile_hint(url,title,alt):
 p=urlsplit(url).path;match=re.search(r"/tile_([a-z]+)/([mpsj])([0-9])([^/]*)\.png$",p)
 if not match:return None
 size,suit,num,suffix=match.groups();rank=int(num)
 # These are filename-derived proposals only. Actual images, title/alt, red
 # status, rotation and size variants must pass the independent dictionary check.
 return {"proposedCode":str(rank if rank else 5)+("z" if suit=="j" else suit),"filename":p.rsplit("/",1)[-1],"sizeVariant":size,"suffix":suffix,"redStatus":"unverified","orientation":"unverified","title":title,"alt":alt,"status":"pending-independent-image-dictionary-check"}
def article(book,url,version=""):
 if version and not re.fullmatch(r"[a-zA-Z0-9_-]+",version):raise ValueError("invalid_source_version")
 key=(re.search(r"blog_([^/.]+)",url).group(1) if book=="79-sina-cn" else re.search(r"cv\d+",url).group(0) if book=="79-bilibili-cn" else "/".join(urlsplit(url).path.split("/")[-2:]).replace("/","-").replace(".html",""))
 existing=ROOT/book/"articles"/key/("source."+version+".json" if version else "source.json")
 if existing.exists():
  saved=json.loads(existing.read_text(encoding="utf-8"))
  if saved["url"]!=url or saved["sourceId"]!=book:raise ValueError("existing_source_identity_changed")
  for binding in [saved["html"],saved["main"],*saved["assets"]]:
   if not binding.get("path") or sha((ROOT/binding["path"]).read_bytes())!=binding["sha256"]:raise ValueError("existing_source_dependency_changed")
  print(json.dumps({"sourceId":book,"articleId":key,"sourcePath":str(existing),"state":"immutable-existing-source"}),flush=True);return saved
 data,meta=capture(url,book);dom=soup(data,book);main=dom.select_one(BOOKS[book]["selector"])
 if main is None:raise ValueError("missing_main_selector:"+url)
 title=(dom.select_one(".opus-module-title__content") or dom.select_one("h2.titName") or main.find(["h1","h2"]) or dom.title).get_text(" ",strip=True)
 if book=="79-sina-cn" and title.endswith("_新浪博客"):title=title.rsplit("_",2)[0]
 base=ROOT/book/"articles"/key;base.mkdir(parents=True,exist_ok=True)
 main_path=base/("main."+version+".html" if version else "main.html")
 main_bytes=str(main).encode("utf-8");main_path.write_bytes(main_bytes)
 blocks=[];paragraphs=[];assets={};ignored=[];links=[]
 def emit_leaf(tag,path,table=None):
  pid=f"{book}:{key}:p{len(paragraphs)+1:04d}";ids=[];pending=[];images=[]
  def add_block(value):
   block_id=f"{book}:{key}:b{len(blocks)+1:04d}";blocks.append({"id":block_id,"paragraphId":pid,"tag":tag.name,"domPath":path,"tableContext":table,**value});ids.append(block_id)
  def flush_text():
   nonlocal pending
   if pending:
    text="".join(s["text"] for s in pending)
    if text.strip():add_block({"type":"text","text":text,"segments":pending})
   pending=[]
  def flush_images():
   nonlocal images
   if images:add_block({"type":"image-run","images":images})
   images=[]
  def walk(node,marks=(),href=None):
   if isinstance(node,Comment):return
   if isinstance(node,NavigableString):
    text=re.sub(r"[\r\n\t ]+"," ",str(node))
    if not text.strip() and not pending:return
    flush_images();pending.append({"text":text,"marks":list(marks),"href":href});return
   if not isinstance(node,Tag) or node.name in ["script","style","noscript","iframe","object"]:return
   if node.name=="br":flush_text();flush_images();return
   if node.name=="img":
    flush_text();urls=image_urls(node,url)
    if urls and all(urlsplit(u).hostname=="www.assoc-amazon.jp" and urlsplit(u).path=="/e/ir" for u in urls) and str(node.get("width"))=="1" and str(node.get("height"))=="1" and not node.get("alt",""):
     ignored.append({"reason":"explicit-amazon-affiliate-tracking-pixel-1x1-empty-alt","sourceUrls":urls,"attrs":dict(node.attrs)});return
    if urls and all(re.search(r"/(?:back|home|next)\.gif$",urlsplit(x).path) for x in urls):
     ignored.append({"reason":"explicit-book-navigation-image","sourceUrls":urls,"attrs":dict(node.attrs)});return
    if not urls:ignored.append({"reason":"placeholder-without-original","attrs":dict(node.attrs)});return
    record=None
    for image_url in urls:
     record=asset(image_url,book)
     if record["status"]=="downloaded":break
    assets[record["assetId"]]=record
    title_attr=node.get("title","");alt=node.get("alt","")
    images.append({"occurrenceId":f"{book}:{key}:i{sum(len(b.get('images',[])) for b in blocks)+len(images)+1:05d}","assetId":record["assetId"],"sourceUrls":urls,"alt":alt,"title":title_attr,"width":node.get("width"),"height":node.get("height"),"tileHint":tile_hint(record["url"],title_attr,alt)})
    return
   style=node.get("style","");classes=" ".join(node.get("class",[]));new_marks=marks
   if node.name in ["em","strong","b","i","dfn","u"] or re.search(r"bold|red|color\s*:\s*[^;\s]",style+classes):new_marks=marks+(node.name+":"+style+":"+classes,)
   if node.name=="a" and node.get("href"):
    href=urljoin(url,node["href"]);links.append({"visibleText":node.get_text("",strip=True),"href":href})
   for child in node.children:walk(child,new_marks,href)
  for child in tag.children:walk(child)
  flush_text();flush_images()
  if ids:paragraphs.append({"id":pid,"tag":tag.name,"domPath":path,"sourceBlockIds":ids,"tableContext":table})
 def traverse(node,path="main",table=None):
  if not isinstance(node,Tag):return
  children=[c for c in node.children if isinstance(c,Tag)]
  if node.name=="table":
   tid=f"{book}:{key}:table:{path}"
   for ri,row in enumerate(node.find_all("tr",recursive=True)):
    if row.find_parent("table") is not node:continue
    for ci,cell in enumerate(row.find_all(["td","th"],recursive=False)):
     traverse(cell,f"{path}/row{ri}/cell{ci}",{"tableId":tid,"row":ri,"column":ci,"rowspan":cell.get("rowspan","1"),"colspan":cell.get("colspan","1"),"header":cell.name=="th"})
   return
  block_children=[c for c in children if c.name in ["p","div","h1","h2","h3","h4","h5","h6","ul","ol","li","table","section","blockquote"]]
  if block_children:
   # Preserve direct inline material as well as nested paragraph blocks.
   group=[];group_index=0
   def flush_group():
    nonlocal group,group_index
    if group:
     wrapper=BeautifulSoup("<span></span>","lxml").span
     for child in group:wrapper.append(child.__copy__())
     emit_leaf(wrapper,f"{path}/inline{group_index}",table);group=[];group_index+=1
   for i,child in enumerate(list(node.children)):
    if isinstance(child,Tag) and child in block_children:flush_group();traverse(child,f"{path}/{child.name}[{i}]",table)
    else:group.append(child)
   flush_group()
  else:emit_leaf(node,path,table)
 traverse(main)
 original_links=[x for x in links if "beginners.biz" in x["href"] or "beginners.biz" in x["visibleText"]]
 for visible in re.findall(r"https?://beginners\.biz/[A-Za-z0-9_./-]+"," ".join(b.get("text","") for b in blocks)):
  if not any(x["visibleText"]==visible for x in original_links):original_links.append({"visibleText":visible,"href":None,"evidence":"visible-body-text"})
 output={"schema":"coach-textbook-web-article-source/1","sourceId":book,"articleId":key,"url":url,"title":title,"language":BOOKS[book]["language"],"fetchedAt":meta["fetchedAt"],"html":meta,"main":{"selector":BOOKS[book]["selector"],"path":rel(main_path),"sha256":sha(main_bytes)},"blocks":blocks,"paragraphs":paragraphs,"assets":list(assets.values()),"links":links,"originalReferenceLinks":original_links,"ignoredPlaceholders":ignored,"attributionNote":"Original source attribution, translator disclaimers and reference visible text are preserved in the body. Link href and visible URL are recorded separately, never treated as equivalent without review.","status":"captured-not-translated-or-audited"}
 if any(a["status"]!="downloaded" for a in assets.values()):output["status"]="blocked-invalid-or-missing-original-image"
 output["extractorSha256"]=sha(Path(__file__).read_bytes())
 output["sourceSha256"]=sha(json.dumps(output,ensure_ascii=False,separators=(",",":")).encode())
 save_json(existing,output)
 print(json.dumps({"sourceId":book,"articleId":key,"sourcePath":str(existing),"textBlocks":sum(b["type"]=="text" for b in blocks),"imageRuns":sum(b["type"]=="image-run" for b in blocks),"uniqueAssets":len(assets),"failedAssets":sum(a["status"]!="downloaded" for a in assets.values())},ensure_ascii=False),flush=True)
 return output
def main():
 p=argparse.ArgumentParser();p.add_argument("--book",choices=list(BOOKS));p.add_argument("--catalog",action="store_true");p.add_argument("--url");p.add_argument("--source-version",default="");args=p.parse_args()
 books=[args.book] if args.book else list(BOOKS)
 for book in books:
  if args.catalog:
   result=catalog(book);print(json.dumps({"sourceId":book,"articleCount":result["articleCount"],"catalogPath":str(ROOT/book/("catalog-v2.json" if book=="modern-yabejp-ja" else "catalog.json"))},ensure_ascii=False),flush=True)
  if args.url:article(book,args.url,args.source_version)
 if not args.catalog and not args.url:p.error("choose --catalog or --url")
if __name__=="__main__":main()
