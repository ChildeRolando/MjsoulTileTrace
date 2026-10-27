// Deterministic body comparison: web-article bound source text vs the original PDF pages.
// Zero model calls. Establishes, per chapter, whether the web draft's own source text is the
// same body the print source carries, and names the segments the print source has that the
// web source does not (genuine missing content) and vice versa (web-only additions).
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const read = p => readFileSync(join(ROOT, p), 'utf8');
const sha = b => createHash('sha256').update(b).digest('hex');
const norm = s => s.replace(/[\s\u3000]+/g, '');

const FURNITURE = [
  /^現代麻雀技術論-/, /^http:\/\/yabejp/, /^第\s*\d+\s*頁/, /^\d{4}-\d\d-\d\d/,
  /^79-cn/, /^第\s*\d+\s*页/,
];

function pdfBody(sourceId, pages) {
  let txt = '';
  let images = 0, textBlocks = 0;
  const per = [];
  for (const p of pages) {
    const pj = JSON.parse(read(`${sourceId}/pages/${String(p).padStart(3, '0')}.json`));
    const lines = (pj.plainText || '').split('\n').filter(l => !FURNITURE.some(r => r.test(l.trim())));
    txt += lines.join('');
    const ib = (pj.blocks || []).filter(b => b.type === 'image').length;
    const tb = (pj.blocks || []).filter(b => b.type === 'text').length;
    images += ib; textBlocks += tb;
    per.push({page: p, textBlocks: tb, imageBlocks: ib, chars: norm(lines.join('')).length});
  }
  return {text: norm(txt), images, textBlocks, per};
}

function webSource(candidateRel) {
  const c = JSON.parse(read(candidateRel));
  const blocks = c.body?.blocks || [];
  let out = '';
  for (const b of blocks) out += b.sourceText ?? '';
  return {
    text: norm(out),
    blocks: blocks.length,
    figures: (c.figures || []).length,
    figureImages: (c.figures || []).reduce((n, f) => n + ((f.images || []).length || (f.sourceImages || []).length || 0), 0),
    path: candidateRel,
    candidateSha256: sha(readFileSync(join(ROOT, candidateRel))),
  };
}

// Greedy chunk coverage: how much of A appears in B, and where A's unmatched runs are.
function coverage(a, b, chunk = 32) {
  const hits = [];
  const runs = [];
  let run = null;
  for (let i = 0; i < a.length; i += chunk) {
    const piece = a.slice(i, Math.min(i + chunk, a.length));
    const found = piece.length >= 8 && b.includes(piece);
    hits.push(found);
    if (!found) {
      if (!run) run = {start: i, text: piece};
      else run.text += piece;
    } else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  const matched = hits.filter(Boolean).length;
  return {ratio: hits.length ? matched / hits.length : 0, missingRuns: runs.slice(0, 8).map(r => ({at: r.start, text: r.text.slice(0, 160)}))};
}

const rows = JSON.parse(readFileSync(join(ROOT, 'integration/coac250-unified-chapter-register-20261027.json'), 'utf8')).rows;
const results = [];
for (const r of rows) {
  if (!r.chapterId.startsWith('nemata-jp')) continue;
  const pages = (r.pdfRoute?.pagesDetail || []).map(p => p.page);
  if (!pages.length) { results.push({chapterId: r.chapterId, status: 'no-pdf-pages', verdict: r.verdict}); continue; }
  const cand = r.existingCandidate?.path;
  const pdf = pdfBody('nemata-jp', pages);
  if (!cand) {
    results.push({chapterId: r.chapterId, verdict: r.verdict, status: 'no-web-candidate', pages, pdfChars: pdf.text.length, pdfImages: pdf.images});
    continue;
  }
  const web = webSource(cand);
  const exact = pdf.text === web.text;
  const pdfInWeb = coverage(pdf.text, web.text);
  const webInPdf = coverage(web.text, pdf.text);
  results.push({
    chapterId: r.chapterId,
    verdict: r.verdict,
    pages,
    candidatePath: web.path,
    candidateSha256: web.candidateSha256,
    auditStatus: r.existingCandidate.auditStatus,
    pdfChars: pdf.text.length,
    webSourceChars: web.text.length,
    webBlocks: web.blocks,
    webFigures: web.figures,
    pdfFigureBlocks: pdf.images,
    exactBodyMatch: exact,
    pdfCoveredByWeb: Number(pdfInWeb.ratio.toFixed(3)),
    webCoveredByPdf: Number(webInPdf.ratio.toFixed(3)),
    pdfOnlyRuns: pdfInWeb.missingRuns,
    webOnlyRuns: webInPdf.missingRuns,
  });
}
const summary = {
  schema: 'coac248-register-body-comparison/1',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  method: 'normalised character comparison of the web candidate bound sourceText against the original PDF page text layer (page furniture stripped); chunk coverage at 32 characters',
  chapters: results.length,
  exact: results.filter(r => r.exactBodyMatch).length,
  noWebCandidate: results.filter(r => r.status === 'no-web-candidate').length,
  partial: results.filter(r => r.exactBodyMatch === false && r.pdfCoveredByWeb !== undefined).length,
  results,
};
console.log(JSON.stringify(summary, null, 1));
