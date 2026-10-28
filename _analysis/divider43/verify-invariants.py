import hashlib,json,pathlib,re,sys
from html.parser import HTMLParser

class Content(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=False);self.text=[];self.tags=[];self.styles=[];self.ignored=False;self.dividers=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='style' and a.get('id')=='ascii-separator-layout':self.ignored=True;return
  if tag=='span' and a.get('class')=='ascii-separator-line':self.dividers+=1;return
  if not self.ignored:self.tags.append(('start',self.get_starttag_text()))
 def handle_endtag(self,tag):
  if self.ignored and tag=='style':self.ignored=False;return
  # Existing corpus contains spans; compare attributes/start tags exactly below,
  # and compare every end tag after removing only exact inserted wrappers first.
  if not self.ignored:self.tags.append(('end',tag))
 def handle_data(self,data):
  if not self.ignored:self.text.append(data)
 def handle_entityref(self,name):
  if not self.ignored:self.text.append('&'+name+';')
 def handle_charref(self,name):
  if not self.ignored:self.text.append('&#'+name+';')

before=pathlib.Path(sys.argv[1]).read_text(encoding='utf8');after=pathlib.Path(sys.argv[2]).read_text(encoding='utf8')
run=re.compile(r'<span class="ascii-separator-line">(-{64,})</span>')
matches=run.findall(after);assert len(matches)==772
recovered=run.sub(lambda m:m.group(1),after)
recovered=re.sub(r'<style id="ascii-separator-layout">[^<]*</style>','',recovered)
a,b=Content(),Content();a.feed(before);b.feed(recovered)
assert a.tags==b.tags,'existing tag/attribute changed'
assert re.sub(r'\s','',''.join(a.text))==re.sub(r'\s','',''.join(b.text)),'non-whitespace text changed'
assert re.findall('-{64,}',before)==re.findall('-{64,}',recovered),'separator groups changed'
assert re.sub(r'\s','',before)==re.sub(r'\s','',recovered),'changes outside whitespace and inserted wrappers'
print(json.dumps({'passed':True,'groups':len(matches),'existingTagsAndAttributesIdentical':True,'allNonWhitespaceTextIdentical':True,'separatorLengthsAndOrderIdentical':True,'imageAndSourceLinksIdentical':True}))
