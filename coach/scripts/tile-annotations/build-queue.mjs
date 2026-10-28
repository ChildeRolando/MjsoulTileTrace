import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, readJson, within } from './server.mjs';

const unresolved = text => /牌|万子|萬子|索子|筒子|饼子|餅子|横置|横向|方位|朝向|东家|東家|南家|西家|北家/.test(text)
  && !/隐手|隠手|隐藏手牌|暗手|暗牌|背面|牌背|灰色|占位|骰子|骰点|点棒|点数显示|点数栏|点数增减|得点|橙色矩形|文字标签|状态图标|圆形标记|玩家资料|图例|曲线|系列|统计|和牌率|放铳率|流局率|作者|译者|译文|未显示|未展示|没有展示|未另行显示|已确认|对应确认|未标明|未.*标示|未.*标注|未推断/.test(text);
const tileError = text => /(?:[0-9][mpsz]|万子|萬子|索子|筒子|饼子|牌河|弃牌|手牌|副露|横置|横向|立直宣言|方位|风牌|字牌)/.test(text)
  && !/曲线|图例|统计|系列|近似值|译为|误译|漏译|术语/.test(text);
const normalize = text => text.replace(/\s+/g, ' ').trim();
// Neutral locations from the existing exact-target packets; answers stay collapsed.
const disputePositions = {
  '79-bilibili-cn:cv1729038:b0004:figure': '例1手牌从左至右第1张，请确认牌码。',
  '79-bilibili-cn:cv1729038:b0006:figure': '例1后续手牌从左至右第1张，请确认牌码。',
  '79-bilibili-cn:cv1754620:b0005:figure': '北家牌河中的横置牌：请填写位置、牌码与相对朝向。',
  'modern-yabejp-ja:chapter03-section009:b0080:figure': '下方手牌末尾三张，请按从左至右填写。',
  'modern-yabejp-ja:chapter04-section012:b0005:figure': '图中手牌的索子部分，请按从左至右填写。',
  'nemata-jp-p261-r50': '第261页问题17末段、r50图块的摸入牌，请确认牌码与赤牌状态。',
};

// Sources are read only. This writes a separate, reproducible queue snapshot only.
export function buildQueue(root) {
  root = fs.realpathSync(root);
  const inputFiles = new Map(), warnings = [], items = new Map();
  const relative = file => path.relative(root, file).replaceAll('\\', '/');
  function load(file, expected) {
    const absolute = within(root, file), bytes = fs.readFileSync(absolute), hash = sha256(bytes);
    if (expected && expected !== hash) throw new Error(`输入SHA不匹配：${file}`);
    inputFiles.set(relative(absolute), hash);
    return readJson(absolute);
  }
  const register = load('integration/coac250-unified-chapter-register-20261027b.json');
  const accepted = load('integration/accepted-preview-current.json');
  const webSelection = load('integration/current-web-candidate-selection.json');
  const pdfSelection = load('integration/current-candidate-selection.json');
  const closure = load('integration/coac244-remaining26-closure-register-20261028.json');
  const rows = register.rows;
  const references = new Map();
  const put = ref => references.set(path.resolve(root, ref.candidatePath), ref);
  // Accepted selections are authoritative for covered chapters, never their old rejected parent.
  for (const ref of accepted.selectedWeb ?? webSelection.candidates) put({ ...ref, accepted: true });
  for (const stage of accepted.selectedPdf?.stages ?? []) {
    for (const ref of stage.receipt?.pages ?? []) {
      if (ref.scopeOnly) continue;
      const selected = ref.candidate ?? ref;
      put({ ...ref, ...selected, candidatePath: selected.candidatePath ?? selected.path,
        candidateSha256: selected.candidateSha256 ?? selected.sha256, accepted: true, canonical: stage.receipt.chapterIds?.[0] ?? stage.receipt.chapterId });
    }
  }
  for (const ref of pdfSelection.pages ?? []) {
    if (!references.has(path.resolve(root, ref.candidatePath)) && ref.auditStatus === 'passed') {
      // Only actual preview stages establish admission; don't add unused alternate PDF copies.
      continue;
    }
  }
  const pendingPdf = accepted.selectedPdf?.pending ?? [];
  // Remaining register supplies current unresolved web figures; all non-tile issues are filtered.
  for (const row of rows.filter(row => !row.covered && row.existingCandidate)) {
    const scoped = row.latestScopedCandidate;
    put({ candidatePath: scoped?.candidate?.path ?? row.existingCandidate.path,
      candidateSha256: scoped?.candidate?.sha256 ?? row.existingCandidate.sha256,
      auditPath: scoped?.parentAudit?.path ?? row.existingCandidate.auditPath,
      canonical: row.chapterId, row, accepted: false });
  }
  // The continuation register records the latest PDF candidates for uncovered PDF-only chapters.
  const continuation = load('integration/coac250-uncovered-chapter-continuation-register-20261027b.json');
  for (const row of rows.filter(row => !row.covered && !row.existingCandidate)) {
    const cont = continuation.rows.find(x => x.chapterId === row.chapterId);
    for (const detail of cont?.pagesDetail ?? []) {
      if (!row.pdfRoute.missingPassedPages.includes(detail.page)) continue;
      const receipt = detail.latestReceipt;
      if (!receipt?.path) continue;
      const audit = load(receipt.path);
      const candidatePath = audit.production?.path ?? audit.production?.candidatePath;
      if (candidatePath) put({ candidatePath, candidateSha256: audit.production.sha256, auditPath: receipt.path, canonical: row.chapterId, accepted: false });
    }
  }
  for (const pending of pendingPdf) {
    if (pending.candidatePath && pending.auditPath) put({ ...pending, accepted: false });
  }

  // These exact receipts supersede their old parent findings, but a faithful repair does not
  // clear unresolved tiles. Strict limitedUnknownOkay=false remains blocking even when a
  // separate author-fidelity display register lists the chapter as covered.
  for (const key of ['109','167','201','232']) {
    const reviewPath=`integration/coac249-${key}-target-impact-reviewed-20261028.json`;
    if (!fs.existsSync(within(root,reviewPath))) continue;
    const review=load(reviewPath), candidate=load(review.candidate.path,review.candidate.sha256);
    const raw=load(review.raw.path,review.raw.sha256);
    load(review.source.path,review.source.sha256);
    load(review.parent.path,review.parent.sha256);
    load(review.parentAudit.path,review.parentAudit.sha256);
    if (raw.success!==true || raw.binding?.productionSha256!==review.candidate.sha256
      || raw.binding?.canonical!==review.canonical || raw.binding?.sourceFileSha256!==review.source.sha256
      || JSON.stringify(raw.output)!==JSON.stringify(review.modelReview)) throw new Error(`精确审校绑定不匹配：${key}`);
    const positions=key==='232'
      // This receipt scopes unknowns by source blocks, not figureId. Match both the exact
      // unknown text and its source block; never infer a tile from an uncertain whole figure.
      ? raw.output.unknownImpacts?.map(impact=>{
        const matches=candidate.figures.filter(f=>f.unknowns?.includes(impact.unknownText)
          && f.sourceBlockIds?.some(id=>impact.sourceBlockIds?.includes(id))
          && raw.output.targetChecks?.some(check=>check.id===f.figureId));
        if(matches.length!==1)throw new Error(`精确审校位置不匹配：${key}`);
        return {figureId:matches[0].figureId,unknownText:impact.unknownText};
      })
      : key==='201'
      ? candidate.figures.filter(f=>f.figureId===raw.output.carriedIssue?.targetId).flatMap(f=>(f.unknowns??[]).map(unknownText=>({figureId:f.figureId,unknownText})))
      : raw.output.unknownImpacts;
    if (!positions?.length || positions.some(p=>!candidate.figures.some(f=>f.figureId===p.figureId && f.unknowns?.includes(p.unknownText)))) throw new Error(`精确审校位置不匹配：${key}`);
    if (key==='232' ? raw.output.scopeComplete!=='yes' || raw.output.contextContinuity?.verdict!=='faithful'
        || !raw.output.targetChecks?.length || raw.output.targetChecks.some(check=>!['faithful','uncertain'].includes(check.verdict)
          || ![...candidate.body.blocks,...candidate.figures].some(target=>(target.id??target.figureId)===check.id || target.sourceBlockIds?.includes(check.id)))
        || raw.binding.parentSha256!==review.parent.sha256 || raw.binding.parentAuditSha256!==review.parentAudit.sha256
        || review.verification?.limitedUnknownOkay!==false
      : key==='201' ? review.verification?.limitedEvidenceVerified!==true || raw.output.carriedIssue?.positionConfirmed!==true
        || raw.output.carriedIssue.currentDisplayFaithful!==true || raw.output.carriedIssue.authorArgumentFaithfulWithCurrentLimitation!==true || raw.output.carriedIssue.requiresResolvedMeaningOrExactTileForAuthorArgument!==false
      : review.verification?.repairPassed!==true || raw.output.completeTargetScopeCompared!==true || !raw.output.repairChecks?.length || raw.output.repairChecks.some(c=>c.verdict!=='faithful') || typeof review.verification.limitedUnknownOkay!=='boolean') throw new Error(`精确审校结论不完整：${key}`);
    for (const [id,ref] of references) {
      if (ref.canonical===review.canonical || (path.basename(path.dirname(ref.candidatePath))===candidate.source.sourceId && path.basename(ref.candidatePath).startsWith(candidate.source.articleId+'.'))) references.delete(id);
    }
    const nonblocking=key==='201' || review.verification.limitedUnknownOkay===true;
    put({candidatePath:review.candidate.path,candidateSha256:review.candidate.sha256,auditPath:reviewPath,
      canonical:review.canonical,row:rows.find(r=>r.chapterId===review.canonical),accepted:nonblocking,
      priority:key==='167'?3:key==='232'?100:0,reviewedPositions:positions,reviewRaw:raw,reviewRawPath:review.raw.path,
      admission:nonblocking?'非阻塞：限定展示证据有效，牌码仍未知':'严格逐牌核验仍阻塞：limitedUnknownOkay=false',
      reviewState:{limitedUnknownOkay:review.verification.limitedUnknownOkay??null,limitedEvidenceVerified:review.verification.limitedEvidenceVerified??null,wholeChapterPassed:review.wholeChapterPassed??false}});
  }

  function add(ref, candidate, source, figure, position, machineIssues, kind = 'unknown') {
    if (kind === 'unknown' && (!unresolved(position) || /表示宝牌本身还是宝牌指示牌/.test(position))) return;
    let bindings = [];
    if (candidate.source.sourcePath) {
      const sourceIds = figure.sourceBlockIds ?? [];
      const assetIds = new Set(source.blocks.filter(b => sourceIds.includes(b.id)).flatMap(b => b.images ?? []).map(i => i.assetId));
      for (const binding of figure.sourceAssetBindings ?? []) {
        const asset = source.assets.find(a => a.assetId === binding.assetId);
        if (!asset || !assetIds.has(binding.assetId) || asset.sha256 !== binding.sha256) throw new Error(`图片未绑定源靶点：${figure.figureId}`);
        const file = `web-sources/v1/${asset.path}`;
        bindings.push({ path: file, sha256: asset.sha256, sourceBlockId: sourceIds.join(',') });
      }
    } else {
      for (const id of figure.sourceImageBlockIds ?? []) {
        const block = source.blocks.find(b => b.id === id);
        if (block?.asset && block.imageSha256) bindings.push({ path: block.asset, sha256: block.imageSha256, sourceBlockId: id });
      }
      // A composed PDF figure may contain many tiny image blocks. Use its existing whole-region
      // render, retaining every original source SHA, rather than presenting isolated tile strips.
      if (bindings.length > 1 && figure.croppedImagePath && figure.croppedImageSha256) {
        bindings = [{ path: figure.croppedImagePath, sha256: figure.croppedImageSha256,
          sourceBlockId: bindings.map(b => b.sourceBlockId).join(','), originalImages: bindings }];
      }
    }
    if (!bindings.length) { warnings.push(`无源图绑定，未猜配图片：${figure.figureId}`); return; }
    const row = ref.row ?? rows.find(row => row.approvedWebCorrespondence?.articleId === candidate.source.articleId);
    const canonical = ref.canonical ?? row?.chapterId ?? figure.chapterId ?? candidate.body.blocks.find(b => b.chapterId)?.chapterId ?? ref.chapterIds?.[0];
    if (!canonical) throw new Error(`缺少canonical：${figure.figureId}`);
    const blocks = candidate.source.sourcePath ? source.blocks : candidate.body.blocks;
    const idx = blocks.findIndex(b => (figure.sourceBlockIds ?? figure.sourceImageBlockIds ?? []).includes(b.id) || b.figureId === figure.figureId || (b.sourceBlockIds ?? []).some(id => (figure.sourceImageBlockIds ?? []).includes(id)));
    const context = blocks.slice(Math.max(0, idx - 2), idx + 3).filter(b => b.type === 'text').map(b => b.text ?? b.sourceText ?? '').join('\n').slice(0,6000);
    for (const binding of bindings) {
      const absolute = within(root, binding.path);
      if (ref.reviewRaw && !ref.reviewRaw.requestExecution?.images?.some(image=>image.sha256===binding.sha256)) {
        // 167's original is GIF; its exact review used the existing source-bound PNG presentation.
        // Bind that declared original-size alias and its actual bytes; keep showing the original.
        const alias=figure.presentationAsset, derivation=alias?.derivation;
        const reviewedAlias=ref.reviewRaw.requestExecution?.images?.find(image=>image.sha256===alias?.sha256 && path.resolve(root,image.path)===path.resolve(root,alias.path));
        if (!reviewedAlias || derivation?.kind!=='single-source-image-rgba-to-png' || derivation.alignment!=='original-size'
          || derivation.sourceAssetBindings?.length!==1 || derivation.sourceAssetBindings[0].sha256!==binding.sha256) throw new Error(`精确审校图片不匹配：${figure.figureId}`);
        const aliasPath=within(root,alias.path), aliasHash=sha256(fs.readFileSync(aliasPath));
        if(aliasHash!==alias.sha256)throw new Error(`精确审校图片别名SHA不匹配：${figure.figureId}`);
        inputFiles.set(relative(aliasPath),aliasHash);
      }
      let available = fs.existsSync(absolute);
      if (available && sha256(fs.readFileSync(absolute)) !== binding.sha256) throw new Error(`原图SHA不匹配：${binding.path}`);
      const targetId = `${binding.sourceBlockId}:${kind}:${sha256(normalize(position)).slice(0,16)}`;
      const id = sha256(`${binding.sha256}\n${targetId}`).slice(0,32);
      const existing = items.get(id);
      const pixelBox = position.match(/原嵌图坐标\[([\d., ]+)\)/)?.[1]?.split(',').map(Number);
      const prompt = position.replace(/；原嵌图坐标.*/, '').replace(/无法可靠区分[^；。]+/g, '牌面待确认').replace(/无法可靠辨认[^；。]*/g, '牌面待确认').replace(/右上6z副露组/, '右上副露组').split('。')[0];
      const item = { id, targetId, figureId: figure.figureId, canonical,
        book: canonical.startsWith('79-') ? '79 日麻讲座（中文）' : '现代麻雀技术论（Nemata）',
        chapter: source.title ?? row?.title ?? canonical, page: candidate.source.page ?? Number(canonical.match(/chapter-(\d+)/)?.[1]) ?? null,
        position, prompt, blocking: !ref.accepted, admission: ref.admission ?? (ref.accepted ? '已准入，保留未知' : '阻塞编校或展示准入'),
        priority:(ref.priority??100)+(ref.reviewedPositions?.findIndex(p=>p.figureId===figure.figureId && p.unknownText===position)??0),
        imagePath: available ? relative(absolute) : null, imageSha256: binding.sha256,
        sourceBlockId: binding.sourceBlockId, regionBBox: figure.bbox ?? null, bbox: pixelBox?.length === 4 ? pixelBox : null,
        originalImages: binding.originalImages ?? [{ path: binding.path, sha256: binding.sha256 }],
        context, machine: { transcription: figure.transcription, unknowns: figure.unknowns, issues: machineIssues, reviewState:ref.reviewState },
        evidence: [{ candidatePath: relative(path.resolve(root, ref.candidatePath)), candidateSha256: inputFiles.get(relative(path.resolve(root, ref.candidatePath))), auditPath: ref.auditPath ? relative(path.resolve(root, ref.auditPath)) : null, reviewRawPath:ref.reviewRawPath?relative(path.resolve(root,ref.reviewRawPath)):null, sourcePath: candidate.source.sourcePath ?? `${candidate.source.sourceId}/pages/${String(candidate.source.page).padStart(3, '0')}.json` }] };
      if (existing) { existing.blocking ||= item.blocking; existing.evidence.push(...item.evidence); }
      else items.set(id, item);
    }
  }

  for (const ref of references.values()) {
    const candidate = load(ref.candidatePath, ref.candidateSha256);
    const sourcePath = candidate.source.sourcePath ?? `${candidate.source.sourceId}/pages/${String(candidate.source.page).padStart(3,'0')}.json`;
    const source = load(sourcePath, candidate.source.sourceSha256 ?? candidate.source.pageDataSha256);
    const audit = ref.auditPath ? load(ref.auditPath) : {};
    let issues = audit.modelReview?.issues ?? audit.issues ?? [];
    // Scope-composed 283 has an authoritative effective register; old aggregate findings are history.
    if (ref.row?.latestScopedCandidate?.effectiveIssueRegister) {
      const effective = load(ref.row.currentEffectiveIssueRegister?.path ?? ref.row.latestScopedCandidate.effectiveIssueRegister.path);
      issues = (effective.issues ?? []).filter(issue => !/resolved|source-note/.test(issue.status)).map(issue => issue.originalIssue ?? issue);
    }
    const countBefore = items.size;
    for (let figure of candidate.figures ?? []) {
      if (!candidate.source.sourcePath && ref.canonical && figure.chapterId && figure.chapterId !== ref.canonical) continue;
      let activeRef = ref;
      // b0785's later review supersedes its old seat finding, while original uncertainty stays.
      if (ref.row?.b0785Evidence && figure.figureId.includes(':b0785:')) {
        const evidence = ref.row.b0785Evidence;
        const donor = load(evidence.candidate.path, evidence.candidate.sha256);
        figure = donor.figures.find(x => x.figureId === figure.figureId);
        activeRef = { ...ref, candidatePath: evidence.candidate.path, candidateSha256: evidence.candidate.sha256 };
        issues = issues.filter(x => !x.targetId?.includes(':b0785'));
      }
      if (!figure) continue;
      const figIssues = issues.filter(issue => issue.targetId === figure.figureId || (figure.sourceBlockIds ?? []).includes(issue.targetId));
      // Unknown positions are independent targets, deduplicated by source SHA + source location.
      for (const position of figure.unknowns ?? []) {
        if (!ref.reviewedPositions || ref.reviewedPositions.some(p=>p.figureId===figure.figureId && p.unknownText===position)) add(activeRef, candidate, source, figure, position, figIssues);
      }
      if (!ref.accepted) {
        const errors = figIssues.filter(i => ['error', 'uncertain'].includes(i.severity) && tileError(`${i.description} ${i.sourceEvidence}`));
        // An uncertain review already represented by concrete unknown positions is the same task.
        const distinctErrors = errors.filter(e => (e.severity === 'error' || !(figure.unknowns ?? []).some(unresolved)) && !/可见牌码转录准确|具体牌码被占位符替代/.test(e.description)
          // The 213 b0032 error names the very same left outer-column second tile already queued.
          && !(figure.figureId === 'modern-yabejp-ja:chapter03-section026:b0032:figure' && /左家.*第2张/.test(e.sourceEvidence)));
        if (distinctErrors.length) add(activeRef, candidate, source, figure, disputePositions[figure.figureId] ?? '核对图中可见手牌、牌河与副露的牌序及方位；请说明所核对的位置。', distinctErrors, 'dispute');
      }
    }
    if (items.size > countBefore) {
      for (const call of candidate.provenance?.attempts ?? []) {
        if (!call.rawArtifactPath) continue;
        const rawRoot = candidate.provenance.artifactRoot || (candidate.provenance.runId ? `production/${candidate.provenance.runId}` : path.dirname(path.dirname(path.dirname(ref.candidatePath))));
        const rawPath = path.join(rawRoot, call.rawArtifactPath);
        load(rawPath, call.rawArtifactSha256);
      }
    }
  }
  const sorted = [...items.values()].sort((a,b) => Number(b.blocking) - Number(a.blocking) || a.priority-b.priority || a.canonical.localeCompare(b.canonical) || a.targetId.localeCompare(b.targetId));
  return { schema: 'coach-tile-annotation-queue/1', generatedAt: new Date().toISOString(), modelCalls: 0,
    counts: { total: sorted.length, blocking: sorted.filter(x=>x.blocking).length, nonblocking: sorted.filter(x=>!x.blocking).length },
    inputs: [...inputFiles].map(([file, sha256])=>({ path: file, sha256 })),
    unresolvedChapters: rows.filter(x=>!x.covered).map(x=>x.chapterId), closureRegisterRowsRead: closure.rows.length,
    exclusions: '文字翻译、作者姓名、统计图、隐手/骰子、已修正通过靶点；未猜测缺失绑定或单牌坐标。', warnings: [...new Set(warnings)], items: sorted };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? 'E:/AgentData/Coach/knowledge/processing';
  const out = process.argv[3] ?? 'E:/AgentData/Coach/knowledge/human-annotations/queue.json';
  const queue = buildQueue(root);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const snapshots = path.join(path.dirname(out),'queues'); fs.mkdirSync(snapshots,{recursive:true});
  if (fs.existsSync(out)) {
    const old = fs.readFileSync(out), snapshot = path.join(snapshots,sha256(old)+'.json');
    if (!fs.existsSync(snapshot)) fs.writeFileSync(snapshot,old,{flag:'wx'});
  }
  const serialized = JSON.stringify(queue,null,2)+'\n';
  fs.writeFileSync(path.join(snapshots,sha256(serialized)+'.json'),serialized);
  fs.writeFileSync(out+'.tmp',serialized,'utf8'); fs.renameSync(out+'.tmp',out);
  console.log(JSON.stringify({ output: out, counts: queue.counts, warnings: queue.warnings }));
}
