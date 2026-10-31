#!/usr/bin/env node
// COAC-269 line B: zero-call joint-exclusion precheck (post duplication incident).
// Exclusion is computed by canonical original chapter id from the union of:
//   1. the latest ACTIVE preview unit-map/selection (accepted-preview-current.json),
//   2. the latest unified chapter register (coac250-unified-chapter-register-20261027b.json),
//   3. every per-chapter latest PASSED audit receipt (source-sha bound).
// No model call, no shared list/selection/pointer write.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const P = 'E:/AgentData/Coach/knowledge/processing';
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => path.relative(P, p).replaceAll('\\', '/');

const scopePath = path.join(P, 'integration/modern-production-scope-v3.json');
const ptrPath = path.join(P, 'integration/accepted-preview-current.json');
const registerPath = path.join(P, 'integration/coac250-unified-chapter-register-20261027b.json');
const candidatesDir = path.join(P, 'web-production/v1/candidates/modern-yabejp-ja');
const auditDir = path.join(P, 'audit/web/articles/modern-yabejp-ja');

const scope = readJson(scopePath);
const ptr = readJson(ptrPath);
const previewDir = ptr.output;
const receiptPath = path.join(previewDir, 'accepted-preview-receipt.json');
const unitMapPath = path.join(previewDir, 'textbook-unit-map.json');
const receipt = readJson(receiptPath);
const unitMap = readJson(unitMapPath);
const register = readJson(registerPath);

// ---- canonical <-> article map (authoritative scope) ----
const byArticle = new Map();
for (const a of scope.articles) {
  byArticle.set(a.articleId, {
    sourceId: a.sourceId,
    sourceFileSha256: a.sourceFileSha256,
    chapterIds: a.pdfChapterIds || [],
  });
}
const articleByChapter = new Map();
for (const [articleId, v] of byArticle) for (const c of v.chapterIds) articleByChapter.set(c, {articleId, sourceFileSha256: v.sourceFileSha256});

// ---- audit index: article -> receipts ----
const auditsByArticle = new Map();
let auditsScanned = 0;
for (const f of fs.readdirSync(auditDir)) {
  if (!f.endsWith('.json')) continue;
  let j; try { j = readJson(path.join(auditDir, f)); } catch { continue; }
  auditsScanned++;
  const art = j.source && j.source.articleId; if (!art) continue;
  if (!auditsByArticle.has(art)) auditsByArticle.set(art, []);
  auditsByArticle.get(art).push({file: f, audit: j});
}

// ---- candidate index: article -> [{file, sha, audits}] ----
const candidatesByArticle = new Map();
for (const f of fs.readdirSync(candidatesDir)) {
  if (!f.endsWith('.json')) continue;
  const articleId = f.split('.')[0];
  const bytes = fs.readFileSync(path.join(candidatesDir, f));
  const h = sha(bytes);
  const audits = auditsByArticle.get(articleId) || [];
  const bound = audits.filter(x => x.audit.production && path.basename(String(x.audit.production.path)) === f && x.audit.production.sha256 === h);
  if (!candidatesByArticle.has(articleId)) candidatesByArticle.set(articleId, []);
  candidatesByArticle.get(articleId).push({
    file: f,
    sha256: h,
    audits: bound.map(x => ({file: x.file, status: x.audit.status, recordedAt: x.audit.recordedAt, sourceSha256: x.audit.source && x.audit.source.sourceSha256})),
  });
}

// ---- coverage union by canonical chapter id ----
const covered = new Map();
const cover = (cid, reason, ev) => {
  if (!cid) return;
  if (!covered.has(cid)) covered.set(cid, {reasons: [], evidence: []});
  const e = covered.get(cid);
  if (!e.reasons.includes(reason)) e.reasons.push(reason);
  if (ev) e.evidence.push({reason, ...ev});
};

// 1) latest active preview
const previewSelectedArticles = new Set();
for (const w of receipt.selectedWeb || []) {
  const base = path.basename(String(w.candidatePath));
  const art = base.split('.')[0];
  previewSelectedArticles.add(art);
  const info = byArticle.get(art);
  for (const cid of info ? info.chapterIds : []) {
    cover(cid, 'active-preview-selectedWeb', {articleId: art, candidate: base, candidateSha256: w.candidateSha256, auditStatus: w.auditStatus});
  }
}
for (const s of (receipt.selectedPdf && receipt.selectedPdf.stages) || []) {
  const r = s.receipt || {};
  for (const cid of r.chapterIds || []) cover(cid, 'active-preview-selectedPdf', {stage: path.basename(String(s.stagePath)), status: r.status});
}
for (const s of receipt.formalReplacements || []) cover(s.newChapterId || s.oldChapterId, 'active-preview-formalReplacement', {articleId: s.articleId});
for (const s of receipt.legacyAudits || []) cover(s.chapterId, 'active-preview-legacyAudit', {status: s.status});
for (const s of receipt.supplementChapters || []) cover(s.chapterId, 'active-preview-supplement', {supplementOf: s.supplementOf});

// 2) latest unified register
for (const r of register.rows || []) {
  if (r.verdict === 'covered-effective') {
    cover(r.chapterId, 'unified-register-covered-effective', {
      auditStatus: r.existingCandidate && r.existingCandidate.auditStatus,
      candidateSha256: r.existingCandidate && r.existingCandidate.sha256,
      auditRecordedAt: r.existingCandidate && r.existingCandidate.auditRecordedAt,
    });
  }
}

// 3) per-chapter latest passed receipt bound to the current source sha
for (const [articleId, cands] of candidatesByArticle) {
  const info = byArticle.get(articleId);
  if (!info) continue;
  for (const c of cands) {
    const passed = c.audits.filter(a => String(a.status).startsWith('passed') && a.sourceSha256 === info.sourceFileSha256);
    if (!passed.length) continue;
    const latest = passed.map(a => a.recordedAt).sort().at(-1);
    for (const cid of info.chapterIds) {
      cover(cid, 'latest-passed-audit-current-source', {articleId, candidate: c.file, candidateSha256: c.sha256, auditStatus: passed[0].status, auditRecordedAt: latest});
    }
  }
  if (previewSelectedArticles.has(articleId)) for (const cid of info.chapterIds) cover(cid, 'active-preview-unit-map', {articleId});
}

// ---- reserved (248) and claims ----
const RESERVED = [
  {re: /-chapter-(198|187|199|201|236|283)-\d+$/, why: '248 reserved chapter number'},
  {re: /-chapter-215-4$/, why: '248 reserved 215-4'},
];
const claimedBy = new Map();
for (const dir of [path.join(P, 'parallel/claims'), path.join(P, 'web-production/v1/coac269-20261027/claims')]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(dir, f);
    let j; try { j = readJson(p); } catch { continue; }
    if (!j.chapterId) continue;
    if (!claimedBy.has(j.chapterId)) claimedBy.set(j.chapterId, []);
    claimedBy.get(j.chapterId).push({path: rel(p), owner: j.owner || j.claimedBy || null, plannedOutput: j.plannedOutput || j.outputPath || null});
  }
}

// ---- eligible repair targets ----
const pendingWebArticles = new Set((receipt.pendingWeb || []).map(x => path.basename(String(x.path)).split('.')[0]));
const entryCheck = (candidateFile, auditFile) => {
  // replicates the revision entry guard: exactly one non-faithful text block target,
  // every other text block faithful, every figure with a faithful check
  const cand = readJson(path.join(candidatesDir, candidateFile));
  const audit = readJson(path.join(auditDir, auditFile));
  const mr = audit.modelReview || {};
  const textBlocks = [...new Set(cand.body.blocks.filter(b => b.type === 'text').flatMap(b => b.sourceBlockIds || []))];
  const figures = (cand.figures || []).map(f => f.figureId);
  const bc = mr.blockChecks || [];
  const fc = mr.figureChecks || [];
  const nonFaithful = textBlocks.filter(id => !bc.some(c => c.id === id && c.verdict === 'faithful'));
  const figuresWithoutFaithful = figures.filter(id => !fc.some(c => c.id === id && c.verdict === 'faithful'));
  return {
    textBlocks: textBlocks.length,
    blockChecks: bc.length,
    nonFaithfulTextBlocks: nonFaithful.length,
    targetBlockIds: nonFaithful,
    figures: figures.length,
    figureChecks: fc.length,
    figuresWithoutFaithfulCheck: figuresWithoutFaithful.length,
    revisableByCurrentEntry: nonFaithful.length === 1 && figuresWithoutFaithful.length === 0,
  };
};
const eligible = [];
const skipped = [];
for (const [cid, info] of articleByChapter) {
  if (covered.has(cid)) continue;
  const art = info.articleId;
  const cands = candidatesByArticle.get(art) || [];
  const repairParents = cands.filter(c => c.audits.some(a => a.status === 'needs-repair' && a.sourceSha256 === info.sourceFileSha256));
  const audited = cands.filter(c => c.audits.length);
  if (RESERVED.some(r => r.re.test(cid))) { skipped.push({chapterId: cid, articleId: art, reason: 'reserved'}); continue; }
  if (!repairParents.length) { skipped.push({chapterId: cid, articleId: art, reason: audited.length ? 'no-current-needs-repair-parent' : 'no-audited-parent-candidate'}); continue; }
  const claims = claimedBy.get(cid) || [];
  const rec = {
    chapterId: cid,
    articleId: art,
    parents: repairParents.map(c => {
      const a = c.audits.find(x => x.status === 'needs-repair');
      let guard = null;
      try { guard = entryCheck(c.file, a.file); } catch (e) { guard = {error: String(e.message)}; }
      return {file: c.file, sha256: c.sha256, audit: a.file, auditStatus: a.status, auditRecordedAt: a.recordedAt, guard};
    }),
    sourceSha256: info.sourceFileSha256,
    inActivePreviewPendingWeb: pendingWebArticles.has(art),
    claimed: claims,
  };
  if (claims.length) skipped.push({chapterId: cid, articleId: art, reason: 'claimed', claimed: claims});
  else eligible.push(rec);
}
const chapterNum = id => { const m = id.match(/-chapter-(\d+)-(\d+)$/); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; };
eligible.sort((a, b) => { const x = chapterNum(a.chapterId), y = chapterNum(b.chapterId); return y[0] - x[0] || y[1] - x[1]; });

// ---- incident negative controls ----
const controls = {};
for (const [cid, expectCovered] of [['nemata-jp-chapter-246-1', true], ['nemata-jp-chapter-237-1', true], ['nemata-jp-chapter-131-1', true], ['nemata-jp-chapter-183-1', false]]) {
  const c = covered.get(cid);
  controls[cid] = {
    expectCovered,
    covered: !!c,
    reasons: c ? c.reasons : [],
    eligible: eligible.some(e => e.chapterId === cid),
    skipped: skipped.some(s => s.chapterId === cid),
    evidence: c ? c.evidence : [],
  };
}
const controlOk = Object.entries(controls).every(([, v]) => v.covered === v.expectCovered);

// old protocol replay: b2/b3 only tested <article>.coac269rev1.json existence
const oldProtocolMiss = [];
for (const cid of ['nemata-jp-chapter-246-1', 'nemata-jp-chapter-237-1', 'nemata-jp-chapter-131-1']) {
  const art = articleByChapter.get(cid).articleId;
  const passedOther = (candidatesByArticle.get(art) || []).filter(c => !/coac269rev1/.test(c.file) && c.audits.some(a => String(a.status).startsWith('passed')));
  oldProtocolMiss.push({
    chapterId: cid,
    articleId: art,
    oldCheck: art + '.coac269rev1.json (absent at preflight time, hence no_existing_variant passed)',
    missedPassedCandidates: passedOther.map(c => ({file: c.file, sha256: c.sha256, status: c.audits[0].status, recordedAt: c.audits[0].recordedAt})),
  });
}

const out = {
  schema: 'coac269-joint-exclusion-precheck/1',
  ticket: 'COAC-269',
  recordedAt: new Date().toISOString(),
  purpose: 'zero-call joint exclusion by canonical original chapter id before any next-batch selection/claim; no model call, no shared write',
  modelCalls: 0,
  productionCalls: 0,
  inputs: {
    scope: {path: rel(scopePath), sha256: sha(fs.readFileSync(scopePath)), articles: scope.articles.length, recordedAt: scope.recordedAt},
    activePreviewPointer: {path: rel(ptrPath), sha256: sha(fs.readFileSync(ptrPath)), output: rel(previewDir), createdAt: ptr.createdAt},
    activePreviewReceipt: {path: rel(receiptPath), sha256: sha(fs.readFileSync(receiptPath)), createdAt: receipt.createdAt, selectedWeb: (receipt.selectedWeb || []).length, pendingWeb: (receipt.pendingWeb || []).length, selectedPdf: (receipt.selectedPdf || []).length},
    activePreviewUnitMap: {path: rel(unitMapPath), sha256: sha(fs.readFileSync(unitMapPath)), units: unitMap.length, chapters: new Set(unitMap.map(u => u.chapterId)).size},
    unifiedRegister: {path: rel(registerPath), sha256: sha(fs.readFileSync(registerPath)), recordedAt: register.recordedAt, rows: (register.rows || []).length, verdicts: register.counts && register.counts.verdicts},
    auditReceipts: {dir: rel(auditDir), scanned: auditsScanned},
  },
  chapterDenominator: {
    scopeChapters: articleByChapter.size,
    coveredByUnion: [...articleByChapter.keys()].filter(c => covered.has(c)).length,
    uncoveredByUnion: [...articleByChapter.keys()].filter(c => !covered.has(c)).length,
  },
  coverageReasons: (() => { const m = {}; for (const v of covered.values()) for (const r of v.reasons) m[r] = (m[r] || 0) + 1; return m; })(),
  incidentControls: controls,
  incidentControlsOk: controlOk,
  oldProtocolMiss,
  eligibleRepairTargets: eligible,
  skipped,
  skippedReasons: (() => { const m = {}; for (const s of skipped) m[s.reason] = (m[s.reason] || 0) + 1; return m; })(),
  nextBatchRule: 'claim by chapterId + current candidateSHA; the claim must record the canonical chapter id, the current parent candidate sha, the passed-candidate absence proof and this precheck receipt sha; a chapter in the coverage union is ineligible regardless of parent sha',
};
const outPath = path.join(P, 'web-production/v1/coac269-20261027/preflight', 'joint-exclusion-' + sha(JSON.stringify(controls) + JSON.stringify(eligible.map(e => e.chapterId))).slice(0, 16) + '.json');
fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  receipt: rel(outPath),
  sha256: sha(fs.readFileSync(outPath)),
  controlsOk: controlOk,
  controls: Object.fromEntries(Object.entries(controls).map(([k, v]) => [k, {covered: v.covered, reasons: v.reasons, skipped: v.skipped}])),
  eligible: eligible.map(e => ({
    chapterId: e.chapterId,
    articleId: e.articleId,
    parent: e.parents.map(p => ({file: p.file, sha256: p.sha256, auditRecordedAt: p.auditRecordedAt, target: p.guard && p.guard.targetBlockIds, figures: p.guard && p.guard.figures, figuresWithoutFaithfulCheck: p.guard && p.guard.figuresWithoutFaithfulCheck, revisable: p.guard && p.guard.revisableByCurrentEntry})),
    inActivePreviewPendingWeb: e.inActivePreviewPendingWeb,
  })),
  skipped: skipped.map(s => ({chapterId: s.chapterId, articleId: s.articleId, reason: s.reason})),
  skippedReasons: out.skippedReasons,
  counts: out.chapterDenominator,
  coverageReasons: out.coverageReasons,
  oldProtocolMiss,
}, null, 2));
