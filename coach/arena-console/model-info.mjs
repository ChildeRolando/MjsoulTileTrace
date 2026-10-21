import { tabs, textPages, paginate, roomyLayout } from '/compact-view.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pre = value => `<pre>${esc(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre>`;
const detail = (title, value) => `<details><summary>${esc(title)}</summary>${pre(value)}</details>`;
async function load() {
  const status = document.querySelector('#info-status'), button = document.querySelector('#reload-info'); button.disabled = true;
  try {
    const response = await fetch('/api/model-info'); if (!response.ok) throw new Error('读取配置失败，请重试。');
    const d = await response.json(), c = d.config;
    document.querySelector('#info-content').innerHTML = `
      <section id="connection" class="panel inspector-section"><div class="panel-heading"><h2>连接与预算</h2><span class="tag">当前配置</span></div><dl class="info-grid"><div><dt>模型</dt><dd>${esc(c.model)}</dd></div><div><dt>连接方式</dt><dd>${esc(c.provider)} · ${esc(c.reasoningEffort)}</dd></div><div><dt>单轮输出 Token</dt><dd>${c.maxProviderOutputTokens.toLocaleString()}</dd></div><div><dt>逐题时限</dt><dd>${c.maxRunMs / 1000} 秒</dd></div><div><dt>每题模型轮次 / 工具次数</dt><dd>${c.maxProviderTurns} / ${c.maxToolCalls}</dd></div><div><dt>累计预算报警线</dt><dd>${c.tokenWarningThreshold.toLocaleString()} tokens</dd></div></dl><p class="field-hint">${c.provider === 'codex-cli' ? '本机 Codex 订阅：输出 Token 是传入提示词的可见响应要求，并核验可获得的用量；不是 Codex 服务端强制上限。' : `API 地址：${esc(c.baseUrl)}；输出 Token 通过 max_tokens 传给接口，支持范围由所选模型决定。`} Arena 请求／响应大小另按字节限制，不能与整轮模型用量直接换算。</p>${detail('全部运行预算（含字节与时间限制）', d.limits)}</section>
      <section id="prompts" class="panel inspector-section"><div class="panel-heading"><h2>System prompt</h2><span class="tag">${esc(d.promptVersion)}</span></div><p class="field-hint">以下文本直接来自运行代码。每题另外附加当时可见牌面、合法候选动作，以及各轮真实工具结果。</p>${pre(d.systemPrompt)}${d.codexInstructions ? detail('本机 Codex 订阅适配指令（完整前缀）', d.codexInstructions) : ''}<p class="field-hint">submit_decision 的候选与证据引用约束随案例、轮次生成。Mortal 标签与 Q 评分不进入作答上下文。本页不读取 Codex 内部提示词或私有推理。</p></section>
      <section id="tools" class="panel inspector-section"><div class="panel-heading"><h2>MCP 与提交工具</h2><span class="tag">本机 stdio</span></div><h3>${esc(d.mcp.name)}</h3><p>参数：caseRef 指定当前案例，actionRefs 指定待分析的弃牌，dimensions 指定需要的事实。</p><div class="dimension-list">${d.mcp.dimensions.map(x => `<span class="tag">${esc(x)}</span>`).join(' ')}</div>${pre(d.mcp.description)}<p class="field-hint">ukeire 返回有效进张种类、逐张未见枚数及总枚数；未见枚数不等于牌山剩余枚数。</p>${detail('MCP 实际预算', d.mcp.limits)}<h3>submit_decision</h3><p>提交动作、简短理由、已取得的证据与来源引用、备选动作及不确定性。该工具由 Arena 执行器提供，提交后锁定结果。</p></section>
      <section id="knowledge" class="panel inspector-section"><div class="panel-heading"><h2>RAG 本地知识库</h2><span class="tag">${d.rag.corpus.passages.length} 个片段</span></div><p>在控制台选择 Off / Local / 对照实验。Off 返回检索关闭；Local 使用本地教学摘要与词项检索，不调用在线向量服务。</p><p class="field-hint">语料版本 ${esc(d.rag.corpus.corpusVersion)} · 检索器 ${esc(d.rag.retrieverVersion)}</p>${detail('search_knowledge 参数契约', d.rag.parameters)}${detail('检索预算', d.rag.limits)}${d.rag.corpus.passages.map(p => `<details class="passage"><summary>${esc(p.sourceTitle)} · ${esc(p.id)}</summary><p>${esc(p.content)}</p><p class="field-hint">来源位置：${esc(p.localSourcePath)}<br>适用范围：${esc(p.applicableWhen.join(' / '))}<br>权利依据：${esc(p.rightsBasis)}</p>${detail('片段完整来源信息', p)}</details>`).join('')}</section>`;
    const root=document.querySelector('#info-content');
    tabs(root, [['connection','连接与预算'],['prompts','System prompt'],['tools','MCP 工具'],['knowledge','RAG 知识库']].map(([id,title])=>({title,node:root.querySelector('#'+id)})), 'runtime-sections');
    const knowledge=root.querySelector('#knowledge'); paginate(knowledge,[...knowledge.querySelectorAll(':scope > .passage')],()=>roomyLayout()?6:3,'knowledge-passages','个片段');
    textPages(root);
    root.querySelector('#connection > details').open = roomyLayout();
    status.textContent = '已读取 · ' + new Date().toLocaleTimeString('zh-CN');
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
document.querySelector('#reload-info').addEventListener('click', load);
load();
