// Deterministic body comparison, sentence-level: web candidate bound sourceText vs original PDF page text.
// Zero model calls. Sentences are split on 。！？； and compared by LCS so the output names exactly which
// print-source sentences the web source lacks (genuine missing content) and which are web-only additions.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const read = p => readFileSync(join(ROOT, p), 'utf8');
const sha = b => createHash('sha256').update(b).digest('hex');
const norm = s => s.replace(/[\s\u3000]+/g, '');
const FURNITURE = [/^現代麻雀技術論-/, /^http:\/\/yabejp/, /^第\s*\d+\s*頁/, /^\d{4}-\d\d-\d\d/, /^第\s*\d+\s*页/, /^79-cn/];

function pdfBody(sourceId, pages) {
  let txt = '', images = 0, textBlocks = 0;
  for (const p of pages) {
    const pj = JSON.parse(read(`${sourceId}/pages/${String(p).padStart(3, '0')}.json`));
    txt += (pj.plainText || '').split('\n').filter(l => !FURNITURE.some(r => r.test(l.trim()))).join('');
    images += (pj.blocks || []).filter(b => b.type === 'image').length;
    textBlocks += (pj.blocks || []).filter(b => b.type === 'text').length;
  }
  return {text: norm(txt), images, textBlocks};
}
function sentences(t) {
  return t.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean);
}
function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keepA = new Uint8Array(n), keepB = new Uint8Array(m);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { keepA[i] = 1; keepB[j] = 1; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return {onlyA: a.filter((_, k) => !keepA[k]), onlyB: b.filter((_, k) => !keepB[k])};
}

const rows = JSON.parse(readFileSync(join(ROOT, 'integration/coac250-unified-chapter-register-20261027.json'), 'utf8')).rows;
const out = [];
for (const r of rows) {
  if (!r.chapterId.startsWith('nemata-jp')) continue;
  const pages = (r.pdfRoute?.pagesDetail || []).map(p => p.page);
  const cand = r.existingCandidate?.path;
  if (!pages.length) { out.push({chapterId: r.chapterId, verdict: r.verdict, status: 'no-pdf-pages'}); continue; }
  const pdf = pdfBody('nemata-jp', pages);
  if (!cand) { out.push({chapterId: r.chapterId, verdict: r.verdict, status: 'no-web-candidate', pages, pdfChars: pdf.text.length, pdfFigureBlocks: pdf.images}); continue; }
  const c = JSON.parse(read(cand));
  const webText = norm((c.body?.blocks || []).map(b => b.sourceText ?? '').join(''));
  const ps = sentences(pdf.text), ws = sentences(webText);
  const {onlyA, onlyB} = lcs(ps, ws);
  out.push({
    chapterId: r.chapterId, verdict: r.verdict, pages,
    candidatePath: cand, candidateSha256: sha(readFileSync(join(ROOT, cand))),
    auditStatus: r.existingCandidate.auditStatus,
    sourceBoundCurrent: r.existingCandidate.sourceBoundCurrent,
    pdfSentences: ps.length, webSentences: ws.length,
    pdfChars: pdf.text.length, webSourceChars: webText.length,
    webBlocks: (c.body?.blocks || []).length,
    webFigures: (c.figures || []).length, pdfFigureBlocks: pdf.images,
    exactBodyMatch: pdf.text === webText,
    missingFromWeb: onlyA,              // print-source sentences absent from the web source
    webOnly: onlyB,                     // sentences the web source carries that the print page does not
  });
}
const summary = {
  schema: 'coac248-register-body-comparison/2',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  method: 'normalised sentence-level LCS of the web candidate bound sourceText against the original nemata-jp PDF page text layer (page furniture stripped)',
  chapters: out.length,
  exact: out.filter(r => r.exactBodyMatch).length,
  noWebCandidate: out.filter(r => r.status === 'no-web-candidate').length,
  withMissingPrintContent: out.filter(r => (r.missingFromWeb || []).length).length,
  absentSentencesTotal: out.reduce((n, r) => n + ((r.missingFromWeb || []).length), 0),
  results: out,
};
console.log(JSON.stringify(summary, null, 1));
