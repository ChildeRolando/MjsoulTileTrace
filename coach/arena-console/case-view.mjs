import { sortedTiles, tileAsset } from '/presentation.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => new Intl.NumberFormat('en-US').format(value);
const date = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const labels = { running: '运行中', stopping: '正在停止', stopped: '已停止', completed: '执行完成', failed: '执行失败',
  timeout: '超时', provider_error: '模型调用失败', provider_unavailable: '模型不可用', cancelled: '已取消', budget_exhausted: '达到逐题预算',
  tool_failure: '工具失败', invalid_submission: '提交无效', label_binding_failure: '标签绑定失败', off: 'RAG Off', local: 'Local RAG', fault: '受控故障', compare: 'RAG 对照', catalog: '刷新题库', 'mortal-details': '补算 Mortal 评分' };
function tileText(tile) {
  const id = typeof tile === 'string' ? tile : tile?.id;
  if (!id) return '未知牌';
  return `${tile?.red ? '赤' : ''}${({ '1z': '东', '2z': '南', '3z': '西', '4z': '北', '5z': '白', '6z': '发', '7z': '中' })[id] ?? id.replace(/([mps])$/, suit => ({ m: '万', p: '筒', s: '索' })[suit])}`;
}
function actionText(ref) {
  try { const value = JSON.parse(decodeURIComponent(ref.slice('action:v1:'.length)));
    if (ref.startsWith('action:v1:') && value[0] === 'discard') return `${value[2] === 'tsumogiri' ? '摸切' : '手切'} ${tileText({ id: value[1][0], red: value[1][1] })}`;
  } catch { /* old or unknown action stays inspectable in structured data */ }
  return '查看动作原始记录';
}
function structured(key, title, value) {
  return `<details data-detail-key="${esc(key)}"><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(value, null, 2) ?? '未记录')}</pre></details>`;
}
function tileImages(tiles, label) {
  return `<div class="tile-group"><span class="tile-label">${label}</span><div class="tile-row" role="group" aria-label="${label}">${tiles.map(tile => {
    const asset = tileAsset(tile), text = esc(tileText(tile));
    return asset ? `<img class="mahjong-tile" src="${asset}" alt="${text}" title="${text}" width="36" height="48">` : `<span>${text}</span>`;
  }).join('') || '<span class="field-hint">无</span>'}</div></div>`;
}
function observationView(observation) {
  const state = observation.visibleState;
  return `<div class="observation-summary"><p><b>${esc(({ E: '东', S: '南', W: '西' })[state.roundWind])}${state.hand}局 · ${state.honba}本场</b> · 供托 ${state.riichiSticks} · 剩余摸牌 ${state.remainingDraws ?? '未知'}</p>${tileImages(sortedTiles(state.self.concealedTiles), '手牌（已理牌）')}<div class="visible-tiles">${tileImages(state.self.currentDraw ? [state.self.currentDraw.tile] : [], '当前摸牌')}${tileImages(state.doraIndicators, '宝牌指示')}</div>${publicTableView(observation)}<p class="field-hint">候选：${observation.candidates.map(candidate => esc(actionText(candidate.actionRef))).join(' / ')}</p></div>`;
}
const completenessText = value => ({ complete: '完整', partial: '部分', unknown: '未知', missing: '缺失' })[value] ?? value;
function publicTableView(observation) {
  const state = observation.visibleState, self = observation.decision.selfActor;
  const wind = { E: '东', S: '南', W: '西', N: '北' };
  const relative = ['自家', '下家', '对家', '上家'];
  const meldNames = { chi: '吃', pon: '碰', daiminkan: '大明杠', ankan: '暗杠', kakan: '加杠' };
  return `<section class="public-table" aria-label="四家公开场面"><h4>四家公开场面</h4><p class="field-hint">牌河按出牌顺序排列；↓ 为摸切，红色边框为立直宣言牌，取走标记表示该牌已被鸣走。</p><div class="table-players">${Array.from({ length: 4 }, (_, offset) => {
    const actor = (self + offset) % 4, riichi = state.riichiStates.find(row => row.actor === actor);
    const melds = state.melds.filter(row => row.actor === actor);
    return `<article class="table-player ${riichi?.status !== 'none' ? 'has-riichi' : ''}"><h5>${relative[offset]} · ${wind[state.seatWinds[actor]] ?? '未知'}家 ${actor === state.dealer ? '· 庄' : ''}<span>${number(state.scores[actor])} 点 · ${riichi?.status === 'accepted' ? '立直成立' : riichi?.status === 'declared' ? '立直宣言' : riichi?.status === 'none' ? '未立直' : '立直状态未知'}</span></h5><div class="river-tiles" aria-label="${relative[offset]}牌河">${state.rivers[actor].map(discard => `<span class="river-tile ${discard.riichiDeclarationRef ? 'riichi-discard' : ''}"><img src="${tileAsset(discard.tile)}" alt="${esc(tileText(discard.tile))}${discard.discardMode === 'tsumogiri' ? '，摸切' : '，手切'}${discard.calledByRef ? '，已被鸣走' : ''}${discard.riichiDeclarationRef ? '，立直宣言牌' : ''}" width="24" height="32"><small>${discard.calledByRef ? '取走' : discard.discardMode === 'tsumogiri' ? '↓' : ''}</small></span>`).join('') || '<span class="field-hint">尚无弃牌</span>'}</div><div class="player-melds">${melds.map(meld => {
      const tiles = meld.kind === 'ankan' ? meld.tiles : [...meld.consumedTiles, meld.calledTile, ...(meld.kind === 'kakan' ? [meld.addedTile] : [])];
      return tileImages(tiles, meldNames[meld.kind]);
    }).join('') || '<span class="field-hint">无副露／杠</span>'}</div></article>`;
  }).join('')}</div><p class="field-hint">信息完整性：牌河 ${esc(completenessText(state.completeness.rivers))} · 鸣牌 ${esc(completenessText(state.completeness.melds))} · 分数 ${esc(completenessText(state.completeness.scores))}</p></section>`;
}
function matchBadge(score) {
  return score?.status === 'matched' ? '<span class="match-badge is-match">Mortal 匹配</span>' : score?.status === 'not_matched' ? '<span class="match-badge is-mismatch">Mortal 不匹配</span>' : '<span class="match-badge">未评分</span>';
}
function usageCount(value, unit) { return value === undefined ? '未报告' : `${number(value)} ${unit}`; }
function modelUsageView(event) {
  const usage = event.usage;
  return `<section class="usage-scope" aria-label="整轮模型用量"><h4>整轮模型用量 <span>模型报告 · tokens</span></h4><dl><div><dt>模型输入</dt><dd>${usageCount(usage?.inputTokens, 'tokens')}</dd></div><div class="cache-usage"><dt>其中缓存输入</dt><dd>${usageCount(usage?.cachedInputTokens, 'tokens')}</dd></div><div><dt>模型输出</dt><dd>${usageCount(usage?.outputTokens, 'tokens')}</dd></div></dl><p>缓存输入已包含在模型输入中，不重复累加。这里统计整轮模型处理的用量，与下方 Arena 载荷的范围和单位不同。</p></section><section class="usage-scope payload-scope" aria-label="Arena 请求／响应大小"><h4>Arena 请求／响应大小 <span>Arena 侧记录 · bytes</span></h4><dl><div><dt>Arena 请求大小</dt><dd>${usageCount(event.inputBytes, 'bytes')}</dd></div><div><dt>Arena 响应大小</dt><dd>${usageCount(event.outputBytes, 'bytes')}</dd></div></dl><p>Arena 协议请求与结构化响应的载荷大小；不等于整轮模型上下文，也不是 Token 用量。</p></section>`;
}
function traceEvent(event, index, ordinal, events) {
  const diagnostic = `${event.failureCode ? `<p class="tool-warning">错误码：${esc(event.failureCode)}</p>` : ''}${event.reconnectCount ? `<p class="field-hint">CLI 连接重试 ${event.reconnectCount} 次 · 同一进程内等待最终结果</p>` : ''}`;
  const key = `${ordinal}-${index}`, time = event.elapsedMs === undefined ? '' : ` · ${(event.elapsedMs / 1000).toFixed(2)}s`;
  if (event.type === 'run_started') return `<li class="trace-item"><div class="trace-heading">开始案例 <span>${esc(date(event.startedAt))}</span></div>${event.observation ? `${observationView(event.observation)}${structured(key, '展开完整案例输入', event.observation)}` : '<p class="field-hint">旧归档未记录案例输入。</p>'}</li>`;
  if (event.type === 'provider_turn') return `<li class="trace-item"><div class="trace-heading">第 ${event.turn} 轮模型调用 <span>${esc(labels[event.result] ?? (event.result === 'tool_call' ? '选择操作' : event.result))}${time}</span></div>${diagnostic}<div class="decision-summary"><span class="micro">公开决策摘要</span><p>${esc(event.decisionSummary ?? '本轮没有已记录的公开摘要（调用失败、旧归档或接口未提供）。')}</p></div>${event.toolName ? `<p class="field-hint">选择 ${esc(event.toolName)}</p>` : ''}${modelUsageView(event)}</li>`;
  if (event.type === 'tool_call') return `<li class="trace-item"><div class="trace-heading">工具调用 #${event.ordinal} <span>第 ${event.turn} 轮${time}</span></div><strong class="tool-name">${esc(event.toolName)}</strong>${event.request === null ? '<p class="tool-warning">请求未通过校验；未保留未经验证的原始参数。</p>' : structured(key, '查看完整调用参数', event.request)}</li>`;
  if (event.type === 'tool_result') {
    const call = events.find(row => row.type === 'tool_call' && row.ordinal === event.ordinal);
    const duration = call?.elapsedMs !== undefined && event.elapsedMs !== undefined ? ` · 耗时 ${event.elapsedMs - call.elapsedMs}ms` : '';
    return `<li class="trace-item ${event.status === 'error' ? 'trace-error' : ''}"><div class="trace-heading">工具返回 #${event.ordinal} <span>${event.status === 'ok' ? '成功' : '失败'}${time}${duration}</span></div><strong class="tool-name">${esc(event.toolName)}</strong>${event.code ? `<p class="tool-warning">${esc(event.code)}</p>` : ''}${event.result === undefined ? '<p class="field-hint">本次没有返回可用的数据。</p>' : structured(key, '查看完整返回结果', event.result)}</li>`;
  }
  if (event.type === 'submission_locked') { const answer = event.submission;
    return `<li class="trace-item"><div class="trace-heading">最终提交 <span>已锁定</span></div><strong class="answer-action">${esc(actionText(answer.actionRef))}</strong><p>${esc(answer.rationale)}</p>${answer.mainAlternative ? `<p><b>备选：${esc(actionText(answer.mainAlternative.actionRef))}</b><br>${esc(answer.mainAlternative.reasonNotChosen)}</p>` : ''}<p><b>不确定性：</b>${esc(answer.uncertainty || '未填写')}</p><p class="field-hint">${answer.evidenceRefs.length} 个证据引用 · ${answer.sourceRefs.length} 个来源引用</p>${structured(key, '查看提交及全部引用', answer)}</li>`;
  }
  if (event.type === 'submission_rejected') return `<li class="trace-item trace-error"><div class="trace-heading">提交被拒绝</div><p>${esc(({ schema_invalid: '提交格式无效', case_mismatch: '案例绑定不符', action_not_offered: '选择了候选集以外的动作', alternative_not_offered: '备选动作不在候选集中', reference_not_observed: '引用了未实际取得的证据或来源' })[event.reason] ?? event.reason)}</p><code>${esc(event.reason)}</code></li>`;
  return `<li class="trace-item"><div class="trace-heading">案例执行结束 <span>${esc(labels[event.status] ?? event.status)}${time}</span></div></li>`;
}
function mortalTable(data, ordinal, result) {
  if (!result) return '<p class="field-hint">Mortal 评分将在本案例执行结束后展示。</p>';
  const detail = data.mortalDetails?.cases.find(c => c.caseOrdinal === ordinal);
  if (!detail) return '<p class="field-hint">此案例尚未保存 Mortal Top 10。可使用上方“补算 Mortal 评分”，无需调用模型。</p>';
  const selected = result.attempt.submission?.actionRef;
  return `<section class="mortal-ranking"><h3>Mortal Top 10 <span class="tag">Q 评分</span></h3><p class="field-hint">分数越高越偏好，并非胜率或预期得点。共 ${detail.candidateCount} 个候选，展示 ${detail.rows.length} 个。${data.mortalDetails.origin === 'recomputed' ? '按原实验冻结牌面与 Mortal 版本补算。' : '本轮原始评分。'}</p><table><thead><tr><th scope="col">排名</th><th scope="col">动作</th><th scope="col">Q 评分</th><th scope="col">选择</th></tr></thead><tbody>${detail.rows.map((row, i) => `<tr class="${row.actionRef === selected ? 'model-choice' : ''}"><td>${i + 1}</td><td>${esc(actionText(row.actionRef))}</td><td class="q-value">${row.qValue.toFixed(4)}</td><td>${row.actionRef === detail.preferredActionRef ? '<span class="tag">Mortal 首选</span> ' : ''}${row.actionRef === selected ? '<span class="tag">模型所选</span>' : ''}</td></tr>`).join('')}</tbody></table>${selected && !detail.rows.some(r => r.actionRef === selected) ? `<p class="field-hint">模型所选 ${esc(actionText(selected))} 未进入 Top 10。</p>` : ''}</section>`;
}

export { esc, actionText, tileText, structured, tileImages, observationView, mortalTable, traceEvent, matchBadge, usageCount };
