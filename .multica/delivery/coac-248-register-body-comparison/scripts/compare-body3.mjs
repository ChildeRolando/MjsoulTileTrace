// Deterministic sentence-level body comparison (edition-normalised).
// Normalises the typographic differences between the print edition and the web edition
// (dashes, wave dashes, half/full-width parentheses, in-text section links and URLs) before
// diffing, so what remains is genuine content difference, not typesetting.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const read = p => readFileSync(join(ROOT, p), 'utf8');
const sha = b => createHash('sha256').update(b).digest('hex');
const FURNITURE = [/^現代麻雀技術論-/, /^http:\/\/yabejp/, /^第\s*\d+\s*頁/, /^\d{4}-\d\d-\d\d/, /^第\s*\d+\s*页/, /^79-cn/];

function norm(s) {
  return s
    .replace(/[\s\u3000]+/g, '')
    .replace(/－|−|–|—|‒|ー(?=\d)/g, '-')
    .replace(/[〜～]/g, '~')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/\([^()]*\.html\)/g, '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
    .replace(/\((?:https?:\/\/)[^)]*\)/g, '');
}
function pdfBody(sourceId, pages) {
  let txt = '', images = 0;
  for (const p of pages) {
    const pj = JSON.parse(read(`${sourceId}/pages/${String(p).padStart(3, '0')}.json`));
    txt += (pj.plainText || '').split('\n').filter(l => !FURNITURE.some(r => r.test(l.trim()))).join('');
    images += (pj.blocks || []).filter(b => b.type === 'image').length;
  }
  return {text: norm(txt), images};
}
const sents = t => t.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean);
function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ka = new Uint8Array(n), kb = new Uint8Array(m);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ka[i] = 1; kb[j] = 1; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return {onlyA: a.filter((_, k) => !ka[k]), onlyB: b.filter((_, k) => !kb[k])};
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
  const {onlyA, onlyB} = lcs(sents(pdf.text), sents(webText));
  out.push({
    chapterId: r.chapterId, verdict: r.verdict, pages,
    candidatePath: cand, candidateSha256: sha(readFileSync(join(ROOT, cand))),
    auditStatus: r.existingCandidate.auditStatus, sourceBoundCurrent: r.existingCandidate.sourceBoundCurrent,
    pdfChars: pdf.text.length, webSourceChars: webText.length,
    webBlocks: (c.body?.blocks || []).length, webFigures: (c.figures || []).length, pdfFigureBlocks: pdf.images,
    exactBodyMatch: pdf.text === webText,
    missingFromWeb: onlyA, webOnly: onlyB,
    missingChars: onlyA.reduce((n, s) => n + s.length, 0),
    webOnlyChars: onlyB.reduce((n, s) => n + s.length, 0),
  });
}
const withCand = out.filter(r => r.existingCandidate === undefined);
const summary = {
  schema: 'coac248-register-body-comparison/3',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  method: 'sentence-level LCS after edition normalisation (dash/wave-dash/parenthesis width, in-text section links and URLs); print source = nemata-jp PDF page text layer minus page furniture',
  chapters: out.length,
  exact: out.filter(r => r.exactBodyMatch).length,
  noWebCandidate: out.filter(r => r.status === 'no-web-candidate').length,
  withGenuineDifference: out.filter(r => (r.missingFromWeb || []).length).length,
  missingSentencesTotal: out.reduce((n, r) => n + ((r.missingFromWeb || []).length), 0),
  results: out,
};
console.log(JSON.stringify(summary, null, 1));
