// Presentation-only state: never changes archived results or experiment inputs.
const positions = new Map();
export const roomyLayout = () => innerWidth >= 1600 && innerHeight >= 950;
const responsiveViews = new Map();
function responsive(root, key, render) {
  for (const [id, view] of responsiveViews) if (!view.root.isConnected) responsiveViews.delete(id);
  responsiveViews.set(key, { root, render });
}
window.addEventListener('resize', () => {
  for (const [key, view] of responsiveViews) {
    if (view.root.isConnected) view.render(); else responsiveViews.delete(key);
  }
});
export function tabs(root, sections, key, initial = 0) {
  const nav = document.createElement('div'); nav.className = 'section-tabs';
  nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', '内容分区');
  const entries = sections.filter(s => s.node);
  let selected = Math.min(positions.get(key) ?? initial, entries.length - 1);
  function select(index, focus = false) {
    selected = index; positions.set(key, index);
    entries.forEach((entry, i) => {
      entry.node.hidden = i !== index; entry.button.setAttribute('aria-selected', String(i === index));
      entry.button.tabIndex = i === index ? 0 : -1;
    });
    if (focus) entries[index].button.focus();
  }
  entries.forEach((entry, index) => {
    const id = `section-${encodeURIComponent(key)}-${index}`, button = document.createElement('button'); entry.button = button;
    button.type = 'button'; button.textContent = entry.title; button.id = `${id}-tab`; button.setAttribute('role', 'tab');
    entry.node.id ||= id; button.setAttribute('aria-controls', entry.node.id);
    entry.node.setAttribute('role', 'tabpanel'); entry.node.setAttribute('aria-labelledby', button.id); entry.node.tabIndex = 0;
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (selected + 1) % entries.length : event.key === 'ArrowLeft' ? (selected + entries.length - 1) % entries.length : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : null;
      if (next !== null) { event.preventDefault(); select(next, true); }
    });
    nav.append(button);
  });
  root.prepend(nav); select(selected);
}

export function paginate(root, items, size, key, label = '记录') {
  const pageSize = () => typeof size === 'function' ? size() : size;
  if (typeof size !== 'function' && items.length <= size) return;
  const nav = document.createElement('nav'); nav.className = 'compact-pager'; nav.setAttribute('aria-label', `${label}翻页`);
  const previous = document.createElement('button'), next = document.createElement('button'), count = document.createElement('span');
  previous.textContent = '上一页'; next.textContent = '下一页'; previous.type = next.type = 'button';
  previous.className = next.className = 'quiet-button'; count.setAttribute('role', 'status');
  let page = Math.min(positions.get(key) ?? 0, Math.max(0, Math.ceil(items.length / pageSize()) - 1));
  function render() {
    const limit = pageSize(); page = Math.min(page, Math.max(0, Math.ceil(items.length / limit) - 1));
    positions.set(key, page); items.forEach((node, i) => node.hidden = i < page * limit || i >= (page + 1) * limit);
    count.textContent = `${page + 1} / ${Math.ceil(items.length / limit)} 页 · ${items.length} ${label}`;
    previous.disabled = page === 0; next.disabled = (page + 1) * limit >= items.length; nav.hidden = items.length <= limit;
  }
  previous.onclick = () => { page--; render(); }; next.onclick = () => { page++; render(); };
  nav.append(previous, count, next); root.append(nav); render();
  if (typeof size === 'function') responsive(root, key, render);
}

export function textPages(root) {
  for (const pre of root.querySelectorAll('pre:not([data-paged]), p[data-reader]:not([data-paged])')) {
    pre.dataset.paged = 'true';
    const full = pre.textContent;
    const inCase = Boolean(pre.closest('.case-workspace, .snapshot-workspace'));
    const charLimit = pre.tagName === 'PRE' ? (roomyLayout() ? 1800 : inCase ? 300 : 650) : roomyLayout() ? 1000 : 400;
    const lineLimit = roomyLayout() ? 22 : inCase ? 6 : 12;
    // Keep every character, including line breaks; page breaks are presentation only.
    const pages = []; let chunk = '', lines = 0;
    for (const char of full) {
      chunk += char; if (char === '\n') lines++;
      if (chunk.length >= charLimit || lines >= lineLimit) { pages.push(chunk); chunk = ''; lines = 0; }
    }
    if (chunk) pages.push(chunk);
    if (pages.length <= 1) continue;
    const wrap = document.createElement('div'); wrap.className = 'text-reader'; pre.before(wrap); wrap.append(pre);
    const nav = document.createElement('nav'); nav.className = 'compact-pager'; nav.setAttribute('aria-label', '全文翻页');
    const prev = document.createElement('button'), next = document.createElement('button'), count = document.createElement('span'), download = document.createElement('button'), jump = document.createElement('input');
    jump.type = 'number'; jump.min = '1'; jump.max = String(pages.length); jump.className = 'page-jump'; jump.setAttribute('aria-label', '全文页码');
    prev.textContent = '上一页'; next.textContent = '下一页'; download.textContent = '下载全文';
    for (const button of [prev, next, download]) { button.type = 'button'; button.className = 'quiet-button'; }
    let index = 0; count.setAttribute('role', 'status');
    const show = () => { pre.textContent = pages[index]; jump.value = String(index + 1); count.textContent = `/ ${pages.length} 页 · 全文保留`; prev.disabled = !index; next.disabled = index === pages.length - 1; };
    jump.onchange = () => { index = Math.max(0, Math.min(pages.length - 1, Math.trunc(Number(jump.value) || 1) - 1)); show(); };
    prev.onclick = () => { index--; show(); }; next.onclick = () => { index++; show(); };
    download.onclick = () => { const url = URL.createObjectURL(new Blob([full], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'arena-full-text.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    nav.append(prev, jump, count, next, download); wrap.append(nav); show();
  }
}

export function compactContent(root, key) {
  for (const [index, list] of [...root.querySelectorAll('.trace-list')].entries()) {
    paginate(list.parentElement, [...list.children], 1, `${key}-trace-${index}`, '步骤');
  }
  for (const [index, ranking] of [...root.querySelectorAll('.mortal-ranking')].entries()) {
    paginate(ranking, [...ranking.querySelectorAll('tbody tr')], () => roomyLayout() ? 10 : 5, `${key}-mortal-${index}`, '个评分');
  }
  for (const [index, observation] of [...root.querySelectorAll('.observation-summary')].entries()) {
    const table = observation.querySelector('.public-table'); if (!table) continue;
    const hand = document.createElement('div');
    for (const node of [...observation.childNodes]) if (node !== table) hand.append(node);
    hand.className = 'observation-hand';
    const context = document.createElement('details'), summary = document.createElement('summary');
    context.className = 'board-context'; summary.textContent = '四家牌河与副露'; context.append(summary, table);
    observation.append(hand, context);
    let wide = roomyLayout(); context.open = wide;
    responsive(observation, `${key}-board-${index}`, () => { if (wide !== roomyLayout()) { wide = roomyLayout(); context.open = wide; } });
    paginate(table, [...table.querySelectorAll('.table-player')], () => roomyLayout() ? 4 : 2, `${key}-players-${index}`, '位玩家');
  }
  for (const usage of root.querySelectorAll('.usage-scope')) {
    const detail = document.createElement('details'), summary = document.createElement('summary');
    detail.name = `${key}-usage`;
    summary.textContent = usage.querySelector('h4').textContent; usage.before(detail); detail.append(summary, usage);
  }
  for (const paragraph of root.querySelectorAll('p')) {
    if (!paragraph.children.length && paragraph.textContent.length > 400) paragraph.dataset.reader = 'true';
  }
  textPages(root);
}
