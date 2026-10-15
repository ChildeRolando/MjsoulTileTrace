const pages = [['/', '实验控制台'], ['/results', '实验结果'], ['/mistakes', '错题集'], ['/settings', '模型与 API 配置'], ['/model-info', '模型运行配置']];

// One server-rendered navigation for every page, including the initial HTML response.
export function arenaPage(html, pathname) {
  const rail = `<aside class="rail"><a class="brand" href="/" aria-label="Arena Lab 首页"><span class="brand-mark" aria-hidden="true">A</span><span>ARENA<span class="brand-sub">LAB / 实验工作台</span></span></a><div class="rail-caption">WORKSPACE</div><nav aria-label="主导航">${pages.map(([href, title], i) => `<a class="nav-item ${pathname === href ? 'active' : ''}" href="${href}" ${pathname === href ? 'aria-current="page"' : ''}><span class="nav-number" aria-hidden="true">0${i + 1}</span>${title}</a>`).join('')}</nav><section class="rail-note"><span class="tiny-label">BLIND DISCARD ARENA</span><strong>先取证，再决策。</strong><p>真实 MCP · 本地知识<br>实验结果 · 错题复查</p><span class="tag">本机实验工作台</span></section><div class="rail-bottom"><span class="status-dot" aria-hidden="true"></span>本机运行</div></aside>`;
  return html.replace(/<aside class="rail">[\s\S]*?<\/aside>/, rail).replace('</head>', '<link rel="stylesheet" href="/layout.css"></head>');
}
