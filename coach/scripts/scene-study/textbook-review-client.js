(() => {
  'use strict';
  const library = JSON.parse(document.getElementById('library-data').textContent);
  const byId = id => document.getElementById(id);
  const loaded = new Map();
  const storageKey = 'coach-textbook-chapter-review:' + library.sourceCommit;
  let chapter, controller, storageAvailable = true, reviews = {};
  try { reviews = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { storageAvailable = false; }
  if (!reviews || typeof reviews !== 'object' || Array.isArray(reviews)) reviews = {};
  const sourceFor = c => library.sources.find(s => s.id === c.sourceId);
  const rawUrl = s => 'https://raw.githubusercontent.com/' + library.repository + '/' + library.sourceCommit + '/' + encodeURIComponent(s.filename);
  const repoUrl = s => 'https://github.com/' + library.repository + '/blob/' + library.sourceCommit + '/' + encodeURIComponent(s.filename);
  function save() {
    reviews[chapter.id] = { status: byId('review-choice').value, comment: byId('review-comment').value, sourceSha256: sourceFor(chapter).sha256, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(storageKey, JSON.stringify(reviews)); storageAvailable = true; } catch { storageAvailable = false; }
    byId('save-status').textContent = storageAvailable ? '意见已保存在本机浏览器；审核后可导出。' : '浏览器无法保存意见；离开前请导出。';
  }
  function showPage(page) {
    const url = loaded.get(chapter.sourceId);
    if (!url) return;
    byId('page-picker').value = String(page);
    byId('document-frame').src = url + '#page=' + page + '&zoom=page-width';
    byId('open-pdf').href = url + '#page=' + page;
    byId('document-frame').hidden = false;
    byId('document-empty').hidden = true;
    byId('page-controls').hidden = false;
  }
  function render() {
    const id = location.hash.slice(1);
    chapter = library.chapters.find(c => c.id === id) || library.chapters[0];
    const source = sourceFor(chapter);
    for (const a of document.querySelectorAll('[data-chapter]')) {
      if (a.dataset.chapter === chapter.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    byId('chapter-title').textContent = chapter.title;
    byId('chapter-location').textContent = source.title + ' · ' + chapter.sourceHeading + ' · PDF ' + chapter.startPage + '–' + chapter.endPage + ' 页';
    byId('chapter-index').textContent = chapter.indexDescription;
    byId('chapter-boundary').textContent = chapter.boundary;
    byId('review-focus').textContent = chapter.reviewFocus;
    byId('source-link').href = repoUrl(source);
    byId('page-picker').replaceChildren(...Array.from({ length: chapter.endPage - chapter.startPage + 1 }, (_, i) => {
      const p = chapter.startPage + i, option = document.createElement('option'); option.value = String(p); option.textContent = '第 ' + p + ' 页'; return option;
    }));
    byId('page-anchors').replaceChildren(...chapter.anchors.map(anchor => {
      const a = document.createElement('a'); a.href = '#'+chapter.id; a.textContent = anchor.label + ' · ' + anchor.page;
      a.addEventListener('click', event => { event.preventDefault(); if (loaded.has(chapter.sourceId)) showPage(anchor.page); else byId('reader-status').textContent = '请先加载中文教材，再定位到第 ' + anchor.page + ' 页。'; }); return a;
    }));
    const r = reviews[chapter.id];
    byId('review-choice').value = ['pending','accept','revise','reject'].includes(r?.status) ? r.status : 'pending';
    byId('review-comment').value = typeof r?.comment === 'string' ? r.comment : '';
    if (loaded.has(source.id)) {
      showPage(chapter.bodyStartPage);
      byId('reader-status').textContent = '正在阅读原 PDF，文字与牌图未被改写。阅读器若未显示，可在独立窗口打开。';
    } else {
      byId('document-frame').hidden = true; byId('document-empty').hidden = false; byId('page-controls').hidden = true;
      if (!controller) byId('reader-status').textContent = '点击阅读会加载用户指定的中文 PDF；也可从本机打开同一文件。';
    }
    document.title = chapter.title + ' · 中文教材审阅';
  }
  async function openBytes(bytes, source) {
    if (bytes.byteLength !== source.bytes) throw new Error('文件大小与登记教材不符，请使用指定仓库中的同一 PDF。');
    if (!globalThis.crypto?.subtle) throw new Error('此浏览器无法核验教材文件，请通过来源链接阅读。');
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== source.sha256) throw new Error('文件内容与已核对教材不一致，未打开。请使用指定版本。');
    if (loaded.has(source.id)) URL.revokeObjectURL(loaded.get(source.id));
    loaded.set(source.id, URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
    render();
  }
  byId('load-source').addEventListener('click', async () => {
    if (loaded.has(chapter.sourceId)) { showPage(chapter.bodyStartPage); return; }
    const source = sourceFor(chapter);
    controller = new AbortController(); byId('load-source').disabled = true; byId('cancel-load').hidden = false;
    try {
      byId('reader-status').textContent = '正在连接教材来源…';
      const response = await fetch(rawUrl(source), { signal: controller.signal });
      if (!response.ok) throw new Error('来源暂时无法读取（HTTP ' + response.status + '）。');
      const reader = response.body.getReader(), parts = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > source.bytes) { await reader.cancel(); throw new Error('教材文件大小发生变化。'); }
        parts.push(value); byId('reader-status').textContent = '正在加载中文教材：' + (size / 1e6).toFixed(1) + ' / ' + (source.bytes / 1e6).toFixed(1) + ' MB';
      }
      const bytes = new Uint8Array(size); let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.length; }
      await openBytes(bytes.buffer, source);
    } catch (error) {
      byId('reader-status').textContent = error.name === 'AbortError' ? '已取消加载。可稍后重试或打开本机 PDF。' : error.message + ' 可通过来源链接下载，再从本机打开。';
    } finally { controller = null; byId('load-source').disabled = false; byId('cancel-load').hidden = true; }
  });
  byId('cancel-load').addEventListener('click', () => controller?.abort());
  byId('local-pdf').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (controller) { byId('reader-status').textContent = '请先取消正在进行的加载，再选择本机文件。'; event.target.value=''; return; }
    const source = sourceFor(chapter);
    try {
      if (file.size !== source.bytes) throw new Error('请选择指定版本的中文 PDF。');
      await openBytes(await file.arrayBuffer(), source);
    } catch (error) { byId('reader-status').textContent = error.message; }
    finally { event.target.value = ''; }
  });
  byId('page-picker').addEventListener('change', event => showPage(Number(event.target.value)));
  byId('review-choice').addEventListener('change', save);
  byId('review-comment').addEventListener('input', save);
  byId('export-review').addEventListener('click', () => {
    const value = { schema:'coach-textbook-human-review/1', exportedAt:new Date().toISOString(), sourceCommit:library.sourceCommit, chapters:library.chapters.map(c => ({ chapterId:c.id, sourceSha256:sourceFor(c).sha256, status:reviews[c.id]?.status || 'pending', comment:reviews[c.id]?.comment || '', updatedAt:reviews[c.id]?.updatedAt || null })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type:'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = '教材三章审核意见.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', () => { controller?.abort(); for (const url of loaded.values()) URL.revokeObjectURL(url); });
  render();
  byId('save-status').textContent = storageAvailable ? '意见保存在本机浏览器，不自动上传。' : '本机保存不可用，请在审核后导出意见。';
})();
