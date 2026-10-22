"""Archive exact public textbook HTML locally; never commits source books or exercises."""
import concurrent.futures, hashlib, json, pathlib, re, sys, urllib.request
from html.parser import HTMLParser

BASIC = ['pairi/pairi02','pairi/pairi03','pairi/pairi04','pairi/pairi07','pairi/pairi19','pairi/pairi20',
         'teyaku/teyaku03','teyaku/teyaku05','teyaku/teyaku06','teyaku/teyaku09','teyaku/teyaku10',
         'mamori/mamori02','mamori/mamori03','mamori/mamori05','mamori/mamori06','mamori/mamori09','mamori/mamori10',
         'osihiki/osihiki01','osihiki/osihiki02','osihiki/osihiki03']
ADVANCED = ['chapter01/section034','chapter01/section033','chapter01/section029','chapter01/section035',
            'chapter01/section039','chapter01/section021-06','chapter01/section007','chapter02/section013',
            'chapter02/section015','chapter02/section019','chapter02/section017','chapter02/section021',
            'chapter02/section022','chapter02/section023','chapter02/section024','chapter02/section025',
            'chapter02/section026','chapter01/section040','chapter04/section001','chapter04/section009']
class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]; self.skip=0; self.images=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style'): self.skip+=1
        if tag=='img': self.images.append(a); self.parts.append('[牌图:'+a.get('alt','未标注')+']')
        if tag in ('p','br','h1','h2','h3','li'): self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)

def fetch(item,root):
    id,url=item; dest=root/(id+'.json')
    if dest.exists():
        value=json.loads(dest.read_text(encoding='utf-8'))
        if value['url']!=url: raise ValueError('source_identity_changed')
        return {k:value[k] for k in ('id','url','title','sha256')}
    with urllib.request.urlopen(url,timeout=25) as r: raw=r.read()
    m=re.search(br'charset=["\s]*([\w-]+)',raw[:5000],re.I)
    encoding=m.group(1).decode() if m else 'utf-8'
    if encoding.lower() in ('shift_jis','shift-jis','sjis'): encoding='cp932'
    html=raw.decode(encoding,errors='strict')
    parser=Text();parser.feed(html)
    title=re.search(r'<title>(.*?)</title>',html,re.S|re.I).group(1).strip()
    text=re.sub(r'[ \t]+',' ',''.join(parser.parts));text=re.sub(r'\n\s*\n+','\n',text)
    value={'id':id,'url':url,'title':title,'sha256':hashlib.sha256(raw).hexdigest(),'encoding':encoding,'text':text,'images':parser.images}
    dest.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');return {k:value[k] for k in ('id','url','title','sha256')}

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8'); root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
    jobs=[(f'b{i+1:02}',f'http://beginners.biz/{p}.html') for i,p in enumerate(BASIC)]+[(f'a{i+1:02}',f'https://yabejp.web.fc2.com/mahjong/tactics/{p}.html') for i,p in enumerate(ADVANCED)]
    with concurrent.futures.ThreadPoolExecutor(3) as pool: records=list(pool.map(lambda job:fetch(job,root),jobs))
    (root/'manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(records,ensure_ascii=False))
