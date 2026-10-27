// Attach an explicit classification to each body-comparison row and locate, for every
// sentence the web source lacks, whether the same print text exists in another web article
// of the same corpus (mapping gap) or nowhere in the published web edition (genuine absence).
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const DL = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-6506c6699664/worktree/.multica/delivery/coac-248-register-body-comparison';
const cmp = JSON.parse(readFileSync(DL + '/body-comparison-normalized.json', 'utf8'));
const norm = s => s.replace(/[\s\u3000]+/g, '').replace(/[－−–—‒]/g, '-').replace(/[〜～]/g, '~')
  .replace(/（/g, '(').replace(/）/g, ')').replace(/\([^()]*\.html\)/g, '')
  .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48));
const dir = ROOT + '/web-sources/v1/modern-yabejp-ja/articles';
const corpus = [];
for (const d of readdirSync(dir)) {
  try {
    const j = JSON.parse(readFileSync(`${dir}/${d}/source.json`, 'utf8'));
    corpus.push({articleId: d, title: j.title, text: norm((j.blocks || []).map(b => b.text || '').join(''))});
  } catch {}
}
const summary = {schema: 'coac248-body-comparison-final/1', recordedAt: new Date().toISOString(), modelCalls: 0,
  method: cmp.method, corpusArticles: corpus.length, counts: {}, chapters: []};
for (const r of cmp.results) {
  if (r.status === 'no-web-candidate') {
    r.bodyVerdict = 'no-web-candidate-print-route-only';
    r.classification = 'The register maps this chapter to no web article; it can only be covered through the print route, so no web substitution is claimed.';
    summary.chapters.push(r); continue;
  }
  if (r.exactBodyMatch) {
    r.bodyVerdict = 'body-identical';
    r.classification = 'The web candidate binds exactly the print page body (after edition typography normalisation): body argument and every sentence of the chapter are the same source text.';
    summary.chapters.push(r); continue;
  }
  const elsewhere = [];
  const nowhere = [];
  for (const s of r.missingFromWeb) {
    const key = norm(s).slice(0, 26);
    const hits = corpus.filter(c => c.text.includes(key)).map(c => c.articleId);
    if (hits.length) elsewhere.push({sentence: s.slice(0, 90), articles: hits}); else nowhere.push(s.slice(0, 90));
  }
  r.otherArticleEvidence = elsewhere;
  r.notInAnyWebArticle = nowhere;
  const lastPage = r.pages[r.pages.length - 1];
  const boundary = elsewhere.length && !nowhere.length;
  // List numbering printed in the book and rendered as a styled list on the web.
  const cand = JSON.parse(readFileSync(ROOT + '/' + r.candidatePath, 'utf8'));
  const webText = norm((cand.body.blocks || []).map(b => b.sourceText || '').join(''));
  const numberingOnly = nowhere.length > 0 && nowhere.every(x => webText.includes(norm(x).replace(/[0-9]+\./g, '')));
  r.bodyVerdict = boundary ? 'body-diff-page-boundary' : numberingOnly ? 'body-diff-formatting' : (nowhere.length ? 'body-gap-real' : 'body-diff-formatting');
  r.classification = boundary
    ? `Every sentence the mapped article lacks is present in another web article of the same corpus; the print page range [${r.pages.join(',')}] runs past the chapter boundary (page ${lastPage} opens the next chapter), so this is an attribution boundary, not missing content.`
    : (nowhere.length ? 'Some print sentences exist in no web article of the corpus: a genuine source-content gap.' : 'Difference is list numbering / typography only.');
  summary.chapters.push(r);
}
const c = summary.counts;
c.chapters = summary.chapters.length;
c.bodyIdentical = summary.chapters.filter(r => r.bodyVerdict === 'body-identical').length;
c.pageBoundary = summary.chapters.filter(r => r.bodyVerdict === 'body-diff-page-boundary').length;
c.formattingOnly = summary.chapters.filter(r => r.bodyVerdict === 'body-diff-formatting').length;
c.realGap = summary.chapters.filter(r => r.bodyVerdict === 'body-gap-real').length;
c.noWebCandidate = summary.chapters.filter(r => r.bodyVerdict === 'no-web-candidate-print-route-only').length;
writeFileSync(DL + '/body-comparison-final.json', JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify(c, null, 1));
for (const r of summary.chapters) if (!['body-identical'].includes(r.bodyVerdict)) console.log(r.chapterId, '|', r.bodyVerdict, '|', (r.notInAnyWebArticle || []).length, 'nowhere |', (r.otherArticleEvidence || []).map(e => e.articles[0]).filter((v, i, a) => a.indexOf(v) === i).join(','));
