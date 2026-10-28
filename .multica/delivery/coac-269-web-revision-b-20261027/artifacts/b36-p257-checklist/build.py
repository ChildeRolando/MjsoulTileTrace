"""One-page20-target source-pixel checklist; no model, tile inference, candidate or UI writes."""
import json,hashlib,shutil,math
from pathlib import Path
from PIL import Image
import fitz
HERE=Path(__file__).resolve().parent;ROOT=Path('E:/AgentData/Coach/knowledge/processing');OUT=ROOT/'integration/coac269-p257-twenty-check-v2-20261028'
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bind(p):return {'path':str(p),'sha256':sha(p)}
def save(p,x):Path(p).write_bytes((json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode())
old=load(HERE.parent/'b35-count311/257-scope.json');assert old['candidate']['sha256']=='5403cb35614b1edab17488458dbaf0571e1a48e1972d2d04c9ebc30a03da67dc';assert sha(old['candidate']['path'])==old['candidate']['sha256']
assert len(old['minimalUnresolvedMachinePositions'])==20
assert not (OUT/'manifest.json').exists(),'final packet already sealed'
OUT.mkdir(exist_ok=True);(OUT/'source').mkdir(exist_ok=True);(OUT/'crops').mkdir(exist_ok=True);(OUT/'output/pdf').mkdir(parents=True,exist_ok=True)
assets={}
for name,h in [('257-start','b355aa01cd296c152a22fa2f8d5a623cc999e222b5727b5b8a855a7aef3d4f03'),('257-results','6ab134ee5d55cbcf278be7c54723dd0eabb760c811762e5dbd7a7eb4bd3781e8')]:
 p=ROOT/'assets'/(h+'.png');assert sha(p)==h;to=OUT/'source'/(name+'.png');shutil.copyfile(p,to);assert sha(to)==h;assets[name]=bind(to)
parent=load(old['parent']['path']);render=ROOT/parent['figures'][0]['croppedImagePath'];assert sha(render)==parent['figures'][0]['croppedImageSha256'];shutil.copyfile(render,OUT/'source/257-full-comparison.png');assets['full-comparison']=bind(OUT/'source/257-full-comparison.png')
im=Image.open(assets['257-results']['path']).convert('RGB');assert im.size==(2109,1210)
def box(scope,n):
 if scope=='right' and n==12:return [1825,410,1873,474]
 if scope=='CPU hand':return [round(1317+44.8*(n-1)),986,round(1317+44.8*n),1048]
 if scope=='upper':
  row=(n-1)//6;col=5-(n-1)%6;y=[345,284,222][row];return [round(1474+44.8*col),y,round(1474+44.8*(col+1)),y+61]
 if scope=='left':
  col=2-(n-1)//6;row=(n-1)%6;return [round(1267+61.5*col),round(429+44.8*row),round(1267+61.5*(col+1)),round(429+44.8*(row+1))]
 if scope=='right':
  col=(n-1)//6;row=5-(n-1)%6;return [round(1764+61.5*col),round(429+44.8*row),round(1764+61.5*(col+1)),round(429+44.8*(row+1))]
 if scope=='bottom':
  row=(n-1)//6;col=(n-1)%6;return [round(1473+44.8*col),round(717+61.3*row),round(1473+44.8*(col+1)),round(717+61.3*(row+1))]
 raise ValueError(scope)
regions=[{'id':'CPU hand','label':'本家可见手牌','box':[1317,986,1900,1048],'displayedSlots':13,'meaning':'CPU结果底边手牌列，仅此时点；不计上排起始手牌。'},
 {'id':'CPU upper exposed set','label':'上方公开副露','box':[1118,74,1269,137],'displayedSlots':3,'meaning':'上方左端三张公开牌，旧转录9m×3；不重复计入上方暗手。'},
 {'id':'CPU dora indicator','label':'中央宝牌指示显示','box':[1496,519,1545,580],'displayedSlots':1,'meaning':'中央一张公开指示显示，旧转录6z；四张背面不计。此项不当作CPU手牌或牌河中的另一张。'},
 {'id':'upper','label':'上方牌河','box':[1474,222,1743,407],'displayedSlots':17,'meaning':'最靠中央一排从画面右向左，再向上；上层起始列有空位，不算牌。'},
 {'id':'left','label':'左方牌河','box':[1267,429,1452,699],'displayedSlots':18,'meaning':'从最靠中央列开始，每列自上而下，再向画面左侧。'},
 {'id':'right','label':'右方牌河','box':[1764,410,1949,699],'displayedSlots':17,'meaning':'从最靠中央列开始，每列自下而上，再向画面右侧；最外列顶部空位不算牌。第12显示位为不同长宽方向，独立框取，不套普通行高；不据此新增立直或鸣牌推断。'},
 {'id':'bottom','label':'下方牌河','box':[1473,717,1742,901],'displayedSlots':18,'meaning':'每排自左至右，各排由上到下。'}]
human=[('upper',1),('upper',6),('upper',17),('left',16),('right',1),('right',2),('right',7),('right',13),('right',14)]
assert len(set(human))==9
targets=[]
for i,p in enumerate(old['minimalUnresolvedMachinePositions'],1):
 assert (p['scope'],p['ordinal']) not in human
 b=box(p['scope'],p['ordinal']);cb=[max(0,b[0]-8),max(0,b[1]-8),min(im.width,b[2]+8),min(im.height,b[3]+8)]
 crop=OUT/'crops'/f'T{i:02}.png';im.crop(tuple(cb)).save(crop)
 label=next(r['label'] for r in regions if r['id']==p['scope'])
 reason=f"旧标签{p['tile']}在单一CPU展示中合计"+('8次' if p['tile']=='4p' else '5次')+'；该非人标字段缺少逐位确认。总数仅作定位诊断，不证明此位错。'
 targets.append({'id':f'T{i:02}','scope':p['scope'],'regionLabel':label,'ordinal':p['ordinal'],'oldTile':p['tile'],'sourceImage':assets['257-results'],'sourceImageBlockId':'nemata-jp-p257-b4','coordinateOrigin':'top-left; [left,top,right,bottom), original2109x1210 pixels','targetBox':b,'cropBox':cb,'crop':bind(crop),'cropPixels':'unmodified original pixels, no enlargement/denoise/sharpen/AI reconstruction','suspicion':reason,'newTile':None,'confirmationStatus':'unanswered-draft-not-submitted','existingHumanItem':False,'originalMachineEvidence':p['sourceRaw']})
geometry={'schema':'coac269-p257-20-source-pixel-targets/1','authorization':'01a1824e-b1cf-73f6-b1dd-72f1a33a3bf5','candidate':old['candidate'],'parent':old['parent'],'sourceImages':assets,'regions':regions,'countedSourceView':'source257b4/right CPU result only','targetCount':20,'targets':targets,'protectedHumanPositions':[{'scope':s,'ordinal':n,'box':box(s,n)} for s,n in human],'noCandidateOrAnnotationChange':True,'newModelCalls':0}
save(OUT/'targets.json',geometry);save(HERE/'targets.json',{**geometry,'sourceImages':assets})
# Text-only conservative display proposal: no new candidate/author text/provenance is produced.
facts=old['humanFacts'];trusted=[]
for scope,n,t in [('upper',1,'2z'),('upper',6,'1s'),('upper',17,'1s'),('left',16,'2m'),('right',1,'1m'),('right',2,'4m'),('right',7,'8s'),('right',13,'1m'),('right',14,'3m')]:trusted.append({'scope':scope,'ordinal':n,'tile':t,'orientation':'立直宣言牌' if scope=='left' else None})
proposal={'schema':'coac269-p257-trusted-only-display-proposal/1','proposalOnly':True,'appliedToCandidate':False,'candidate':old['candidate'],'scope':'r1 CPU-result public tile transcription only; author body and other figures untouched','sourceImageMustRemainComplete':True,'trustedHumanFacts':facts,'trustedPublicPositions':trusted,'displayedPublicPositionCount':87,'trustedPositionCount':9,'remaining78Positions':'Explicitly unverified/unknown in conservative CPU-result text; original machine codes retained only in audit. This is not78 new human questions or OCR tasks.','handAndExposedAndIndicatorLabelPolicy':'Separate regions, preserve position existence/count without asserting unconfirmed faces; indicator remains a named display region, not invented duplicate physical tile.','variants':[{'id':'strict-nine-only','description':'完整原图＋九项人工表；其余CPU牌面文字逐位未知。不得把此表称完整牌谱。','limitation':'失去CPU逐牌可访问转录；保留图像并不自动等于文字教学完整性通过，必须独立复核参考比较的贡献。'},{'id':'inherit-reviewed-context','description':'九项人工表＋原独审已明确确认且未改的四画面关系、起始牌/和牌展示、役与点数说明；CPU未核字段仍逐位未知。','limitation':'只能按原真实独审明确范围与精确SHA继承；不得以整体faithful措辞覆盖CPU20位或其余未独立核定牌面。'}],
 'authorArgumentImpact':{'sourceBlockIds':['nemata-jp-p256-b27','nemata-jp-p256-b28','nemata-jp-p256-b29','nemata-jp-p256-b30','nemata-jp-p256-b31','nemata-jp-p256-b32','nemata-jp-p256-b33','nemata-jp-p256-b34','nemata-jp-p256-b35','nemata-jp-p256-b36','nemata-jp-p256-b37','nemata-jp-p256-b38','nemata-jp-p256-b39','nemata-jp-p256-b40','nemata-jp-p257-b1','nemata-jp-p257-b2','nemata-jp-p257-b3','nemata-jp-p257-b4'],'contribution':'Q9条件性鸣牌/一色手及CPU参考结果比较，诈唬为次要、和牌为主；不是仅凭一副截图证明概率或最优性。','canPreserveWithoutNewNumbers':'作者原有条件、措辞、结论和完整源图保持；九人标仅为所指定位置的可信观察。','cannotCertify':'完整合法CPU牌谱、精确可见/剩余张数、受入、概率、安全度或最佳打法；不据未知补数。','Q10Boundary':'b5以后Q10及r2/r3/r4按原独审和未改hash继承，不因CPU字段未决扩大重审。','notAnIndependentSemanticVerdict':True},
 'independentReviewRequiredBeforeAnyAdmission':True,'independentReviewRequest':'Only proposal, no call authorization: compare exact trusted-human application, author ordered Q9 context, preserved image and declared unknown omissions. Do not guess new tile codes or change human facts. Decide whether retained original-image contribution is sufficient or identify exact lost proposition.','reviewInputs':{'context':'E:/AgentData/Coach/knowledge/processing/integration/coac269-311250-zero-preparation-20261028/257-context.json','parentAudit':'E:/AgentData/Coach/knowledge/processing/audit/pages/nemata-jp/page-0257.6283c24943ac239fad731dd356b7c2da4097ecb9b48bcd9b652a242a8919ee88.6baa4a7e1404.json'},'reviewDispatched':False,'wholeChapterPassed':False,'admissionGranted':False,'newModelCalls':0}
save(OUT/'trusted-only-proposal.json',proposal);save(HERE/'trusted-only-proposal.json',proposal)
# One A3 page,20 clear cards; only source pixels, with target border as vector overlay.
doc=fitz.open();page=doc.new_page(width=842,height=1191);font='ReviewCJK';page.insert_font(fontname=font,fontfile='C:/Windows/Fonts/msyh.ttc')
def text(rect,s,size=9,color=(.12,.17,.22)):
 rem=page.insert_textbox(fitz.Rect(rect),s,fontname=font,fontsize=size,lineheight=1.25,color=color);assert rem>=0,(s,rem)
text((28,20,814,48),'PDF257 / CPU结果 - 20个旧机器字段定点核对',17)
text((28,51,814,82),'根先核定位，再决定是否请用户选择性确认。红框是本项靶点，邻牌只作定位；旧值不是正确答案，空白不是“看不清”或确认。',10)
text((28,84,814,110),'源：257b4，2109×1210像素，左上角原点，[左,上,右,下)。九个人标位置全部排除；不回写标注页／队列，不改候选。',9)
labels={'CPU hand':'手牌','upper':'上河','left':'左河','right':'右河','bottom':'下河'}
cw=190;ch=198;gap=9;top=121
for i,t in enumerate(targets):
 col=i%4;row=i//4;x=28+col*(cw+gap);y=top+row*ch;page.draw_rect(fitz.Rect(x,y,x+cw,y+ch-7),color=(.72,.78,.82),width=.6,fill=(.98,.985,.99))
 text((x+8,y+7,x+cw-8,y+26),f"{t['id']}  {labels[t['scope']]}第{t['ordinal']}张  |  旧 {t['oldTile']}",10)
 cb=t['cropBox'];b=t['targetBox'];iw=cb[2]-cb[0];ih=cb[3]-cb[1];scale=min(164/iw,103/ih);w=iw*scale;h=ih*scale;dx=x+(cw-w)/2;dy=y+30+(103-h)/2;page.insert_image(fitz.Rect(dx,dy,dx+w,dy+h),filename=t['crop']['path'],keep_proportion=False)
 page.draw_rect(fitz.Rect(dx+(b[0]-cb[0])*scale,dy+(b[1]-cb[1])*scale,dx+(b[2]-cb[0])*scale,dy+(b[3]-cb[1])*scale),color=(.85,.12,.17),width=1)
 text((x+8,y+137,x+cw-8,y+152),'原图框 '+','.join(map(str,b)),7.7)
 text((x+8,y+153,x+cw-8,y+170),'仅疑旧标签／位置待核；未判此牌错。',8)
 text((x+8,y+172,x+70,y+188),'选择性填写：',8)
 widget=fitz.Widget();widget.field_name=t['id'];widget.field_type=fitz.PDF_WIDGET_TYPE_TEXT;widget.field_value='';widget.rect=fitz.Rect(x+76,y+171,x+cw-8,y+187);widget.text_font='Helv';widget.text_fontsize=9;widget.border_width=.6;widget.border_color=(.5,.6,.7);page.add_widget(widget)
text((28,1120,814,1163),'区域：手牌13；上方副露3；中央指示显示1（旧6z，与手牌／河牌分列）；四河17/18/17/18。完整源图及区域框见同包source/与区域总览。\n计数移除指示显示也不改变本20项涉及的四个旧标签总数。填写仅为核对草稿，不自动保存为人工事实；不得据未填项猜牌或准入。',8.6)
pdf=OUT/'output/pdf/257-20-target-check.pdf';doc.subset_fonts();doc.save(pdf,garbage=4,deflate=True);doc.close()
# Region overview keeps original file separate; overlay is explicitly not a new source.
ov=fitz.open();pg=ov.new_page(width=1054.5,height=700);pg.insert_image(fitz.Rect(0,0,1054.5,605),filename=assets['257-results']['path']);pg.insert_font(fontname=font,fontfile='C:/Windows/Fonts/msyh.ttc')
for i,r in enumerate(regions,1):
 b=fitz.Rect(*(v/2 for v in r['box']));pg.draw_rect(b,color=(.9,.1,.1),width=1);pg.insert_text((b.x0,b.y0-3),str(i),fontsize=10,color=(.9,.1,.1))
pg.insert_textbox(fitz.Rect(12,614,1040,692),'区域定位总览（非新源图；原图在source/完整保留）\n'+'；'.join(f"{i} {r['label']}={r['displayedSlots']}" for i,r in enumerate(regions,1))+'\n左侧“你”的结果、牌背、白色立直棒、源图标题与灰色座位栏均不计为这些公开牌面位置。',fontname=font,fontsize=10)
# Save overview as PNG only to keep exactly one final PDF/page.
ov[0].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(OUT/'region-overview.png');ov.close()
preview=fitz.open(pdf);assert len(preview)==1;widgets=list(preview[0].widgets());assert len(widgets)==20 and all(not w.field_value for w in widgets);preview[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(OUT/'checklist-preview.png');preview.close()
manifest={'schema':'coac269-p257-20-check-package/1','authorization':'01a1824e-b1cf-73f6-b1dd-72f1a33a3bf5','candidate':old['candidate'],'pdf':bind(pdf),'onePage':True,'blankDraftFields':20,'targets':bind(OUT/'targets.json'),'proposal':bind(OUT/'trusted-only-proposal.json'),'originalImages':assets,'rootReviewRequired':True,'independentSemanticReviewExecuted':False,'newModelCalls':0,'originalCandidateModified':False,'annotationServiceModified':False,'formalActiveChanged':False,'files':[bind(p) for p in sorted(OUT.rglob('*')) if p.is_file()]};save(OUT/'manifest.json',manifest);save(HERE/'packet.json',{'path':str(OUT),'manifest':bind(OUT/'manifest.json'),'pdf':bind(pdf),'targetCount':20,'newModelCalls':0});assert sha(old['candidate']['path'])==old['candidate']['sha256'];print(json.dumps({'built':True,'packet':str(OUT),'pdf':str(pdf),'targets':20,'newModelCalls':0}))
