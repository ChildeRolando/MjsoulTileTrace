import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function validateLibrary(library) {
  if (library.schema !== 'coach-textbook-index/1' || library.policy.cardRole !== 'index-only' || library.policy.modelExperiments !== false) throw new Error('textbook_index_policy');
  const sources = new Map(library.sources.map(s => [s.id, s]));
  const ids = new Set(library.chapters.map(c => c.id));
  if (sources.size !== library.sources.length || ids.size !== library.chapters.length) throw new Error('textbook_duplicate_id');
  for (const source of sources.values()) {
    if (!/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-f0-9]{40}$/.test(source.gitBlob) || source.bytes <= 0) throw new Error('textbook_source_identity');
  }
  for (const c of library.chapters) {
    const s = sources.get(c.sourceId);
    if (!s || s.language !== 'zh-CN' || s.format !== 'pdf' || !Number.isInteger(c.startPage) || !Number.isInteger(c.endPage) || c.startPage < 1 || c.endPage > s.pages || c.startPage > c.bodyStartPage || c.bodyStartPage > c.endPage) throw new Error('textbook_chapter_boundary');
    if (['content', 'concept', 'conditions', 'exceptions'].some(k => Object.hasOwn(c, k))) throw new Error('textbook_index_contains_teaching_body');
    if (c.anchors.some(a => !Number.isInteger(a.page) || a.page < c.startPage || a.page > c.endPage) || c.relatedChapterIds.some(id => !ids.has(id))) throw new Error('textbook_index_reference');
  }
  return library;
}

export async function buildTextbookReview(destination) {
  const library = validateLibrary(JSON.parse(await readFile(new URL('./textbook-library.json', import.meta.url), 'utf8')));
  const css = await readFile(new URL('./textbook-review.css', import.meta.url), 'utf8');
  const script = await readFile(new URL('./textbook-review-client.js', import.meta.url), 'utf8');
  const links = library.chapters.map(c => `<a href="#${esc(c.id)}" data-chapter="${esc(c.id)}">${esc(c.title)}<small>PDF ${c.startPage}–${c.endPage} 页</small></a>`).join('');
  const sources = library.sources.map(s => `<section><h3>${esc(s.title)}</h3><p>${esc(s.attribution)}</p><p>${esc(s.sourceNote)}</p><a href="https://github.com/${library.repository}/blob/${library.sourceCommit}/${encodeURIComponent(s.filename)}" target="_blank" rel="noopener noreferrer">查看来源文件</a></section>`).join('');
  const data = JSON.stringify(library).replaceAll('<', '\\u003c');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(library.title)} · Coach</title><style>${css}</style></head>
<body><header><strong>Coach · 中文教材审阅</strong><span>三章样稿 · 等待你的审核</span></header>
<div class="reader-layout"><aside><nav aria-label="章节目录">${links}</nav><p class="quiet">目录只负责定位。正文阅读现成中文教材，保留完整论证、牌例与原有措辞。</p><button id="export-review" type="button">导出三章审核意见</button><p id="save-status" class="quiet" role="status"></p></aside>
<main><h1 id="chapter-title"></h1><p id="chapter-location" class="quiet"></p><p id="chapter-index"></p><p id="chapter-boundary" class="boundary"></p>
<div class="reading-controls"><button type="button" id="load-source">阅读本章中文教材</button><button type="button" id="cancel-load" hidden>取消加载</button><a id="source-link" target="_blank" rel="noopener noreferrer">打开来源文件</a><label class="local-file">从本机打开同一 PDF<input id="local-pdf" type="file" accept="application/pdf,.pdf"></label></div>
<p id="reader-status" role="status">点击阅读会从你提供的仓库加载中文 PDF。也可选择已下载的同一文件。</p>
<div id="page-controls" class="page-controls" hidden><label for="page-picker">教材页码</label><select id="page-picker"></select><a id="open-pdf" target="_blank" rel="noopener">在独立窗口阅读</a></div>
<div id="page-anchors" class="page-anchors" aria-label="段落位置"></div>
<div id="document-empty" class="document-empty"><p>教材正文在这里阅读</p><p>页面直接显示原 PDF，不经过摘要、重新翻译或牌图重绘。首次加载约 13.6 MB，三章共用同一文件。</p></div>
<iframe id="document-frame" title="中文教材原 PDF" hidden></iframe>
<section class="review"><h2>审核这一章</h2><p id="review-focus"></p><p class="quiet">下列意见评价本章是否适合作为知识正文，不等同于已经逐句核验译文。备注可写明教材页码和牌例。</p>
<label for="review-choice">结论</label><select id="review-choice"><option value="pending">尚未审核</option><option value="accept">可作为正文</option><option value="revise">需要修订</option><option value="reject">不采用本章</option></select>
<label for="review-comment">审核意见</label><textarea id="review-comment" rows="4" placeholder="例如：第 115–116 页的条件需要连读；某处译法或牌例需要核对。"></textarea></section>
<details><summary>材料来源与整理说明</summary><p>知识卡仅保存主题、页码、段落位置和章节关系，不保存改写后的教材结论。三个样稿均使用已有中文译文；本轮未做日文逐句校勘，也未运行模型实验。</p>${sources}</details>
</main></div><script id="library-data" type="application/json">${data}</script><script>${script}</script></body></html>`;
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, 'knowledge.html'), html, 'utf8');
  await writeFile(join(destination, 'knowledge-index.json'), JSON.stringify(library, null, 2) + '\n', 'utf8');
  return { entry: join(destination, 'knowledge.html'), chapters: library.chapters.length, copiedTeachingText: false, modelCalls: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/scene-study/textbook-review.mjs OUTPUT_DIRECTORY');
  console.log(JSON.stringify(await buildTextbookReview(resolve(output))));
}
