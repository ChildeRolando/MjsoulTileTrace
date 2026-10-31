const pages = [['/', '实验控制台'], ['/question-banks', '题库生成'], ['/results', '实验结果'], ['/mistakes', '错题集'], ['/settings', '模型与 API 配置'], ['/model-info', '模型运行配置']];

// One server-rendered navigation for every page, including the initial HTML response.
export function arenaPage(html, pathname) {
  const rail = `<aside class="rail"><a class="brand" href="/" aria-label="Arena Lab 首页"><span class="brand-mark" aria-hidden="true">A</span><span>ARENA</span></a><nav aria-label="主导航">${pages.map(([href, title]) => `<a class="nav-item ${pathname === href ? 'active' : ''}" href="${href}" ${pathname === href ? 'aria-current="page"' : ''}>${title}</a>`).join('')}</nav></aside>`;
  return html.replace(/<aside class="rail">[\s\S]*?<\/aside>/, rail).replace('</head>', '<link rel="stylesheet" href="/layout.css"></head>');
}
