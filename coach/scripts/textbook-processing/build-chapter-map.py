"""Deterministic source boundary inventory; no translation/model invocation."""
import json,re,sys,hashlib,unicodedata
from pathlib import Path

def norm(text):
 text=unicodedata.normalize('NFKC',text)
 text=re.sub(r'^\d+(?:[.\-]\d+)*[.\-\s]*','',text)
 return re.sub(r'[\W_\s]','',text)
def text(block): return ''.join(line['text'] for line in block.get('lines',[])).strip()
def size(block): return max([s['size'] for l in block.get('lines',[]) for s in l.get('spans',[])]+[0])
def visual(block): return (block['bbox'][1],block['bbox'][0],block['_ordinal'])
def dump(path,data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def build(root):
 raw=(root/'source-inventory.json').read_bytes(); inventory=json.loads(raw);chapters=[];reports=[];page_owners=[]
 for source in inventory['sources']:
  pages={};ordered=[];big=[]
  for record in source['pages']:
   page=json.loads((root/record['pageData']).read_text(encoding='utf-8'))
   if hashlib.sha256((root/record['pageData']).read_bytes()).hexdigest()!=record['pageDataSha256']: raise ValueError('source page changed')
   for i,b in enumerate(page['blocks']): b['_ordinal']=i;b['_page']=page['page']
   rows=sorted(page['blocks'],key=visual);pages[page['page']]=rows;ordered+=rows
   for b in rows:
    if b['type']=='text' and size(b)>=(13 if source['sourceId']=='79-cn' else 17) and text(b): big.append(b)
  positions={b['id']:i for i,b in enumerate(ordered)};anchors={};toc_matches=[];unmatched=[]
  leaves=[t for i,t in enumerate(source['toc']) if i+1==len(source['toc']) or source['toc'][i+1]['level']<=t['level']]
  for entry in leaves:
   candidates=[b for b in pages[entry['page']] if b['type']=='text' and 0<len(text(b))<160 and size(b)>=13 and (norm(text(b)) in norm(entry['title']) or norm(entry['title']) in norm(text(b)))]
   # Japanese printed title sometimes uses テンパイ where the bookmark says 聴牌.
   if not candidates and source['sourceId']=='nemata-jp': candidates=[b for b in pages[entry['page']] if b['type']=='text' and size(b)>=17 and text(b)]
   if not candidates: unmatched.append(entry);continue
   best=sorted(candidates,key=lambda b:(-size(b),abs(len(norm(text(b)))-len(norm(entry['title'])))))[0]
   anchors[best['id']]={'block':best,'title':text(best),'evidence':'bookmark-and-printed-heading','tocIds':[entry['id']]}
   toc_matches.append({'tocId':entry['id'],'sourceBlockId':best['id'],'sourceTitle':text(best),'bookmarkTitle':entry['title']})
  # The Chinese PDF bookmark omits e.g. 手役5—断幺. Scan all printed lesson titles independently.
  for b in big:
   if source['sourceId']=='nemata-jp' or re.match(r'^(麻雀的基础|牌效率|手役|宝牌[和与]赤牌|鸣牌|立直|防守|状况判断|攻守判断)\s*\d+',text(b)):
    anchors.setdefault(b['id'],{'block':b,'title':text(b),'evidence':'printed-heading-not-bookmarked','tocIds':[]})
  first=ordered[0]
  if not any(a['block']['_page']==1 for a in anchors.values()): anchors[first['id']]={'block':first,'title':'封面、目录与网页说明','evidence':'document-start','tocIds':[],'fixedChineseTitle':True}
  # A separate source index introduces the research appendices; it is not the preceding exercise's conclusion.
  if source['sourceId']=='nemata-jp':
   b=pages[317][0];anchors[b['id']]={'block':b,'title':'研究资料目录与说明','evidence':'separate-appendix-index-source-page','tocIds':['nemata-jp-toc-166'],'fixedChineseTitle':True}
  sorted_anchors=sorted(anchors.values(),key=lambda a:positions[a['block']['id']])
  for a in sorted_anchors:
   heading=a['block'];before=[b for b in pages[heading['_page']] if positions[b['id']]<positions[heading['id']]]
   def page_furniture(b):
    t=text(b)
    return b['type']=='text' and (not t or re.match(r'^第\s*\d+\s*[页頁]',t) or re.match(r'^第[一二三四五六七八九十]+章',t) or ('http://' in t and b['bbox'][1]<20))
   if all(page_furniture(b) for b in before): a['start']=pages[heading['_page']][0]
   else:a['start']=heading
  sorted_anchors[0]['start']=first
  for index,a in enumerate(sorted_anchors):
   start=positions[a['start']['id']];end=positions[sorted_anchors[index+1]['start']['id']]-1 if index+1<len(sorted_anchors) else len(ordered)-1
   if end<start: raise ValueError('overlapping anchors')
   id=f"{source['sourceId']}-chapter-{a['block']['_page']:03}-{a['block']['_ordinal']+1}"
   # Chinese appendix has explicit independent subsection headings. Keep them as units under the original section.
   subheads=[b for b in big if start<positions[b['id']]<=end and source['sourceId']=='79-cn' and b['_page']>=280 and b['id']!=a['block']['id'] and not re.match(r'^第[一二三四五六七八九十]+章',text(b))]
   starts=[a['start']]+subheads;units=[]
   for j,b in enumerate(starts):
    unit_start=positions[b['id']];unit_end=positions[starts[j+1]['id']]-1 if j+1<len(starts) else end
    title=a['title'] if j==0 else text(b);heading=a['block'] if j==0 else b
    units.append({'id':f'{id}-unit-{j+1}','title':title,'sourceTitle':title,'titleStatus':'verified-source-chinese' if source['language']=='zh-CN' or a.get('fixedChineseTitle') else 'source-only-pending-audited-translation','titleSource':{'page':heading['_page'],'sourceBlockId':heading['id']},'from':{'page':b['_page'],'sourceBlockId':b['id']},'to':{'page':ordered[unit_end]['_page'],'sourceBlockId':ordered[unit_end]['id']}})
   c={'id':id,'title':a['title'],'sourceTitle':a['title'],'titleStatus':units[0]['titleStatus'],'titleSource':units[0]['titleSource'],'sourceId':source['sourceId'],'topics':[],'sourcePdfSha256':source['sha256'],'boundaryEvidence':a['evidence'],'tocIds':a['tocIds'],'units':units};chapters.append(c)
   for j,u in enumerate(units):
    l=positions[u['from']['sourceBlockId']];r=positions[u['to']['sourceBlockId']]
    for b in ordered[l:r+1]:page_owners.append({'sourceId':source['sourceId'],'page':b['_page'],'sourceBlockId':b['id'],'chapterId':id,'unitId':u['id']})
  reports.append({'sourceId':source['sourceId'],'pages':len(pages),'blocks':len(ordered),'detectedLargeHeadings':len(big),'chapters':len(sorted_anchors),'tocLeaves':len(leaves),'unmatchedTocLeaves':unmatched,'tocMatches':toc_matches,'additionalPrintedHeadings':[{'page':a['block']['_page'],'sourceBlockId':a['block']['id'],'title':a['title']} for a in sorted_anchors if a['evidence']=='printed-heading-not-bookmarked']})
  if unmatched:raise ValueError(f'unmatched bookmarks: {unmatched}')
 ids=[(r['sourceId'],r['sourceBlockId']) for r in page_owners]
 if len(ids)!=len(set(ids)):raise ValueError('duplicate source ownership')
 result={'schema':'coach-textbook-chapter-map/1','status':'source-boundaries-mapped-translation-and-semantic-review-pending','blockOrder':'page-visual-yx','orderingNote':'Geometry assigns only full-width chapter boundaries. It does not prescribe paragraph or table reading flow; body flow requires independent audit.','inventorySha256':hashlib.sha256(raw).hexdigest(),'chapters':chapters}
 destination=root/'integration';destination.mkdir(exist_ok=True)
 dump(destination/'chapter-map.json',result);dump(destination/'chapter-map-report.json',{'schema':'coach-textbook-source-boundary-report/1','inventorySha256':result['inventorySha256'],'sources':reports,'mappedBlocks':len(page_owners),'chapters':len(chapters),'units':sum(len(c['units']) for c in chapters),'modelCalls':0,'publicationReady':False});dump(destination/'source-block-ownership.json',{'schema':'coach-textbook-source-ownership/1','chapterMapSha256':hashlib.sha256((destination/'chapter-map.json').read_bytes()).hexdigest(),'blocks':page_owners})
 print(json.dumps({'chapters':len(chapters),'units':sum(len(c['units']) for c in chapters),'sourceBlocks':len(page_owners),'sources':[{'id':r['sourceId'],'chapters':r['chapters'],'extraHeadings':r['additionalPrintedHeadings']} for r in reports]},ensure_ascii=False))
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf-8');build(Path(sys.argv[1]))
