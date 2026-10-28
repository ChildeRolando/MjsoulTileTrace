"""Package derived evidence only; never copy source books, images, or raw UI records."""
import collections,hashlib,json,pathlib,shutil
D=pathlib.Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-human-final-20261028')
O=pathlib.Path('.multica/delivery/coac244-human-final-20261028')
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def put(name,value):
    (O/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');shutil.copyfile(O/name,D/name)
e=read(D/'final-evidence.json');v=read(D/'derivation-receipts.json')
primary={x['itemId'] for r in v.values() for x in r['humanFacts']}
group=[]
for canonical in sorted({x['canonical'] for x in e['observations']}):
    rows=[x for x in e['observations'] if x['canonical']==canonical]
    items=[]
    for r in rows:
        cls=r['evidenceClass']
        action='bind exact latest candidate and original figure; replace only specified position and matching unknown; reverse all other fields to parent; verify author conditions and actual visible limitations'
        if not r['inCurrentQueue']:action='already produced/reviewed target: compare actual latest candidate, retain as corroboration, do not repeat the old repair'
        if r['itemId'] in primary:action='prepared in primary receipts; owner exclusive by plans.json'
        if cls=='position-mapping-needed':action='do not fill three target slots: saved 7s8s9s and note full right-hand sequence do not match old target description of fourth-fifth-sixth p tiles; resolve ordinal-to-figure mapping, preserve human full sequence as observation'
        if cls=='human-inference-not-pixel-evidence':action='preserve human supplied value separately from pixel evidence; two notes explicitly infer from matching honor tiles, the second330 value has no method note; broken original remains unavailable, do not claim visible tile or invent direction'
        if cls=='direction-unanswered-code-only':action='tile code 7z does not answer direction; retain source direction unknown'
        if cls=='missing':action='retain source-missing record; no visible value supplied; no automatic reconstruction'
        if canonical=='79-cn-chapter-201-6':action+='; note adjacent 2m vs old3m separately: new exact slot mapping and whitelist required before changing it'
        if canonical=='nemata-jp-chapter-213-1':action+='; human9p prevails as this authorized target observation; preserve old machine7p faithful record and extra note6p/6s conflicts, do not silently expand whitelist'
        items.append({k:r.get(k) for k in ['itemId','targetId','figureId','position','imageSha256','result','evidenceClass','historicalMachineConflict','timestamp','revision','eventSha256','currentEvidence','inCurrentQueue']}|{'nextStep':action,'newModelCallsAuthorized':0,'applicationPermit':False})
    group.append({'canonical':canonical,'latestItems':len(rows),'classes':dict(collections.Counter(r['evidenceClass'] for r in rows)),'items':items})
put('secondary-batches.json',{'schema':'coac244-human-final-secondary-exact-followups/1','noAutomaticWholeChapterReview':True,'newModelCalls':0,'chapters':group,'unrelatedRemainingScope':'79-cn-chapter-311-18 is eight curves/144 slots already in269 existing run; human PDF311 belongs to nemata-jp-chapter-309-1, not that curve chapter.'})
for n in ['derivation-receipts.json','regression.json']:shutil.copyfile(D/n,O/n)
put('review-budget-proposal.json',{'authorization':'proposal only; this turn permits zero new model calls','232':{'maker':0,'vision':0,'semanticApplicationReviewMaximum':1,'model':'gpt-6.1-sol/high','scope':'accepted human9m exact application plus existing reviewed3s/text and full ordered argument; no pixel guessing'},'257':{'maker':0,'vision':0,'semanticApplicationReviewMaximum':1,'model':'gpt-6.1-sol/high','scope':'nine trusted human positions, full related ordered context; precisely assess inherited transcription count conflicts and author argument limits; not a request to invent correction of other tiles'},'261':{'maker':0,'vision':0,'newReview':0,'scope':'reuse exact same-SHA genuine91507699 source adjudication and human3m; do not change to5m'},'monetaryCost':'unknown; no charged child calls executed','newModelCallsExecuted':0})
failed=D/'candidates/232.human-final.json'
put('local-drafts.json',{'rejectedDrafts':[{'path':str(failed),'sha256':hashlib.sha256(failed.read_bytes()).hexdigest(),'reason':'zero-call count check rejected missing separators around inserted9m; never admitted or dispatched; corrected v2 listed in receipt'}],'modelCalls':0})
lines=['最终人标快照及精确应用包（2026-10-28）','',
'授权：244评论01a18217-36bb-7c2e-9dd7-46600908ab9a。此包只完成确定性应用和审计证明，不生成模型raw、普通passed或正式active。',
'',f"最终导出 {e['exportedAt']}：190历史事件，54最新保存项；52 answered、2源缺失，unclear/skipped/withdrawn/未填均0。当前服务队列48项＝46 answered＋2missing，另6项为历史队列已保存项。旧111事件逐字前缀保留；新增79事件、34项，旧20项最新状态未变。",'',
'52项answered中：46项可映射的明确人工牌码/方位观察；1项右手牌位映射有歧义；3项损坏图标填值缺少可见像素依据（其中两条备注明确推理，另一条未说明方法）；2项方向题只填7z没有回答方向。后5项不能当像素/方向已证实，人工填值完整保留。final-evidence的human-inference-not-pixel-evidence是这三条的粗分类，不意味着第三条用户声称用过推理。历史机器冲突2项：261人标3m对旧5m、JP213人标9p对旧7p。JP193位置冲突另列。', '',
'原始final导出、190条独立保存记录、历史队列均保留在共享目录snapshot，SHA在capture/input-bindings；它们及原书正文/图片不进入Git或本附件。派生证据保留用户保存时间、revision、逐事件SHA、稳定ID/靶点/原图SHA。每次应用前重新核最新保存事件；任何撤回/跳过/看不清/新保存均拒绝旧应用。', '',
'本次真实产物：','']
for k in ['232','257','261']:
    r=v[k];lines += [f"- {k} / {r['canonical']}：`{r['candidate']['path']}`，SHA `{r['candidate']['sha256']}`。"]
lines+=['','232只替换右河第二张unknown为人标9m、删除相应unknown；原3s、文字、两项其它未知及所有非目标对象保留。39个公开牌位，未超四张，确定性检查通过。248独占此应用scope。尚须既有合法精确准入及独立应用/原文论证核验、250真实回读，不重新猜牌。','',
'PDF257四条保存覆盖九牌位：上1/6/17＝2z/1s/1s；左16＝2m立直宣言；右1/2/7/13/14＝1m/4m/8s/1m/3m。只转录及相应四条unknown改动，四项隐藏/不可见等unknown保留。CPU单帧87个公开位置数量不变。**完整牌谱计数不通过**：原机转录已有4p×8、9s×5；与人标组合后还有1s×5、8s×5。逐位置清单见derivation-receipts的counts.after.overFour。不得据此改人标凑数；须在现有owner判断旧机器字段/位置的具体错配及是否影响作者论证，不能称全九unknown闭合等于整页通过。','',
'PDF261不改稿：原候选已为3m；人标3m与真实91507699同SHA独立裁决target-is-3m、affectedExampleFaithful=true一致。旧5m error及b33派生退回均原样留档，未伪改severity。复用原精确source-adjudication路线交250，不再花模型票数猜3m/5m。257/261均269独占，不能再套旧5m制作方案。','',
'执行（共享根integration/coac244-human-final-20261028；固定入口没有invoke）：','',
'```powershell',f'node {D.as_posix()}/entry.mjs verify 232 01a17471-0529-7d3d-bd8d-8b54ef38290d',f'node {D.as_posix()}/entry.mjs verify 257 01a17cae-06e4-7b30-a93f-3a030d1ae63f',f'node {D.as_posix()}/entry.mjs verify 261 01a17cae-06e4-7b30-a93f-3a030d1ae63f',f'node {D.as_posix()}/check.mjs','```','',
'entry request只准备文本请求。232/257请求分别含完整实际source/body/figure顺序及人工事实；PDF源transform的-0按JSON运输为0，原文件SHA/字节保持原样。两项如需语义模型，分别最多提案1次sol/high、images=[]、0retry，根明确安排前不得执行。261提案0新调用。货币费用未知；本轮真实新模型/制作/识图/复审调用均0。','',
'37项零调用检查含错误owner、源/父/图/正文/unknown/原图对象/伪造model provenance越界拒绝、撤回与改值拒绝、原始body逆向还原、selfhash和真实运输上下文。232首次无分隔符草稿被免费预检拒绝，完整保留为未交付草稿，v2才是指定产物。','',
'后续人标补录（当前不自动改稿，不重复已完成有限准入）：']
lines+=['', '| 完整canonical | 最新保存项 | 后续 |','|---|---:|---|']
for g in group:
    desc='精确人标补录；保留旧raw和未靶条件，核现行候选后仅复核应用'
    if g['canonical']=='nemata-jp-chapter-193-1':desc='6p已修不重复；右手7s8s9s与旧第4–6筒子靶位须先定映射；6z方位可精确补录'
    elif g['canonical']=='nemata-jp-chapter-213-1':desc='人工9p/2z；旧机器7p及备注相邻错误留冲突，先精确字段白名单'
    elif g['canonical']=='nemata-jp-chapter-309-1':desc='PDF310/315源缺失；PDF311发为人工推理，非像素恢复'
    elif g['canonical']=='nemata-jp-chapter-328-1':desc='两处中为人工推理；两方向题没有方向答案，未知保留'
    elif g['canonical']=='nemata-jp-chapter-232-1':desc='已审手牌3s不重做；9m派生在248'
    elif g['canonical']=='nemata-jp-chapter-250-1':desc='257九位派生+计数未决；261复用原3m裁决，在269'
    lines.append(f"| {g['canonical']} | {g['latestItems']} | {desc} |")
lines+=['','secondary-batches逐ID给出具体位置、原图/候选/源SHA、备注事实及下一步骤；不把备注当执行指令。没有逐章重审授权。另中文79-cn-chapter-311-18八曲线144点在269现有阶段，不与PDF311损坏图标混用。','', '整书仍未完成。250唯一合库写者；没有真实应用许可/完整限定条件/回读就不宣布整章passed，不切active。']
(O/'README.md').write_text('\n'.join(lines)+'\n',encoding='utf-8');shutil.copyfile(O/'README.md',D/'README.md')
print(json.dumps({'chapters':len(group),'observations':len(e['observations']),'sharedRoot':str(D)},ensure_ascii=False))
