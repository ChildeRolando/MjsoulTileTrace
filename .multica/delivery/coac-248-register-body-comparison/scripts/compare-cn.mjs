// Same deterministic body comparison for the Chinese source (79-cn): the Chinese web
// article's own text against the Chinese PDF page text layer.
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const DL = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-6506c6699664/worktree/.multica/delivery/coac-248-register-body-comparison';
const read = p => readFileSync(ROOT + '/' + p, 'utf8');
const FURN = [/^第\s*\d+\s*页/, /^-+$/, /^\s*$/, /^（待续）$/, /^79-cn/];
const norm = s => s.replace(/[\s\u3000]+/g, '').replace(/（/g, '(').replace(/）/g, ')')
  .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
  .replace(/[－−–—‒]/g, '-').replace(/\d+\([^()]*\.html\)/g, m => m.match(/^\d+/)[0]);
const sents = t => t.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean);
function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ka = new Uint8Array(n), kb = new Uint8Array(m); let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { ka[i] = 1; kb[j] = 1; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return {onlyA: a.filter((_, k) => !ka[k]), onlyB: b.filter((_, k) => !kb[k])};
}
const reg = JSON.parse(read('integration/coac250-unified-chapter-register-20261027.json'));
const rows = reg.rows.filter(r => r.chapterId.startsWith('79-cn') && r.verdict !== 'covered-effective');
const artDir = ROOT + '/web-sources/v1/79-bilibili-cn/articles';
const corpus = [];
for (const d of readdirSync(artDir)) {
  try { const j = JSON.parse(readFileSync(`${artDir}/${d}/source.json`, 'utf8'));
    corpus.push({articleId: d, text: norm((j.blocks || []).map(b => b.text || '').join(''))}); } catch {}
}
const out = [];
for (const r of rows) {
  const pages = (r.pdfRoute?.pagesDetail || []).map(p => p.page);
  let pdf = '';
  for (const p of pages) { const pj = JSON.parse(read(`79-cn/pages/${String(p).padStart(3, '0')}.json`));
    pdf += (pj.plainText || '').split('\n').filter(l => !FURN.some(x => x.test(l.trim()))).join(''); }
  pdf = norm(pdf);
  const cand = r.existingCandidate?.path;
  if (!cand) { out.push({chapterId: r.chapterId, verdict: r.verdict, pages, status: 'no-web-candidate', pdfChars: pdf.length}); continue; }
  const c = JSON.parse(read(cand));
  const web = norm((c.body.blocks || []).map(b => b.sourceText || '').join(''));
  const {onlyA, onlyB} = lcs(sents(pdf), sents(web));
  const elsewhere = onlyA.map(s => ({sentence: s.slice(0, 90),
    articles: corpus.filter(x => x.text.includes(norm(s).slice(0, 26))).map(x => x.articleId)}));
  const nowhere = elsewhere.filter(e => !e.articles.length);
  out.push({chapterId: r.chapterId, verdict: r.verdict, pages, candidatePath: cand, pdfChars: pdf.length, webChars: web.length,
    exactBodyMatch: pdf === web, missingSentences: onlyA.length, webOnlySentences: onlyB.length,
    notInAnyWebArticle: nowhere.map(e => e.sentence),
    elsewhereArticles: [...new Set(elsewhere.flatMap(e => e.articles))],
    bodyVerdict: pdf === web ? 'body-identical' : nowhere.length ? 'body-gap-real' : 'body-mapped-elsewhere'});
}
const summary = {schema: 'coac248-body-comparison-cn/1', recordedAt: new Date().toISOString(), modelCalls: 0,
  method: 'sentence-level LCS of the Chinese web article text against the 79-cn PDF page text layer (headers/rules stripped)',
  corpusArticles: corpus.length, counts: {}, chapters: out};
const c = summary.counts;
c.chapters = out.length; c.bodyIdentical = out.filter(r => r.bodyVerdict === 'body-identical').length;
c.mappedElsewhere = out.filter(r => r.bodyVerdict === 'body-mapped-elsewhere').length;
c.realGap = out.filter(r => r.bodyVerdict === 'body-gap-real').length;
c.noWebCandidate = out.filter(r => r.status === 'no-web-candidate').length;
writeFileSync(DL + '/body-comparison-cn.json', JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify(c, null, 1));
for (const r of out) if (r.bodyVerdict !== 'body-identical') console.log(r.chapterId, '|', r.status || r.bodyVerdict, '| miss', r.missingSentences, '| nowhere', (r.notInAnyWebArticle || []).length, '|', (r.elsewhereArticles || []).slice(0, 3).join(','));
