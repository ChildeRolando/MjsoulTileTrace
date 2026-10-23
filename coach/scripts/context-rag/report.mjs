import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { createArenaRagRetriever } from '@riichi-coach/desktop/blind-discard-arena-rag';
import { read, save, hash, clusterInterval, exists } from '../scene-study/common.mjs';
import { graphicalScene } from '../scene-study/review-presentation.mjs';
import { writeKnowledgeReader } from '../scene-study/knowledge-reader.mjs';
import { corpus, verify } from './experiment.mjs';
import { boundedRetriever } from '../scene-study/study.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0);
const mean = (xs, f) => xs.length ? sum(xs, f) / xs.length : null;
const pct = x => x === null ? '未知' : `${(x * 100).toFixed(1)}%`;
const num = x => x === null ? '未知' : x.toFixed(2);
export const submission = r => r?.result?.events.find(e => e.type === 'submission_locked')?.submission ?? null;
export function measure(run, needs) {
  const cardIds = [...new Set((run.retrieval ?? []).flatMap(t => t.cardIds))];
  const covered = needs.required.filter(n => n.chapters.some(id => cardIds.includes(id)));
  const refs = (run.retrieval ?? []).flatMap(t => t.result.sourceRefs), s = submission(run);
  const u = run.result?.providerUsage, tokens = u?.tokens ?? u?.reportedPartial;
  return { caseId: run.caseId, gameId: run.gameId, arm: run.arm, status: run.status, cardIds,
    required: needs.required.length, covered: covered.length, recall: covered.length / needs.required.length,
    missing: needs.required.filter(n => !covered.includes(n)).map(n => n.topic),
    inapplicable: cardIds.filter(id => needs.inapplicable.includes(id)),
    queries: (run.retrieval ?? []).length, noHits: (run.retrieval ?? []).filter(t => !t.result.passages.length).length,
    returnedChars: sum(run.retrieval ?? [], t => sum(t.result.passages, p => p.content.length)),
    invalidSourceRefs: (s?.sourceRefs ?? []).filter(r => !refs.includes(r)), cited: (s?.sourceRefs ?? []).map(r => run.sourceMap[r]),
    usageStatus: u?.status === 'reported' && Number.isFinite(tokens?.totalTokens) ? 'reported' : 'unknown', tokens: tokens ?? null, unreportedTurns: u?.unreportedTurnCount ?? (u ? 0 : null),
    elapsedMs: run.result?.elapsedMs ?? run.elapsedMs ?? null, rationaleChars: s?.rationale.length ?? null };
}
export async function probes(out) {
  const k = await read(join(out, 'knowledge.json')), fixtures = await read(new URL('./probes.json', import.meta.url));
  const rows = [];
  for (const [arm, components] of Object.entries({ baseline: {}, smallToBig: { smallToBig: true }, enriched: { contextEnrichment: true }, combined: { smallToBig: true, contextEnrichment: true } })) {
    const aliases = new ArenaRunAliasVault(), sourceMap = {};
    for (const c of k.cards) sourceMap[aliases.reference(`blind-discard-arena-rag/v1\0${c.source.system}\0${c.id}`)] = c.id;
    const retriever = createArenaRagRetriever({ mode: 'local', caseRef: aliases.caseRef('fixed-query-diagnostic'), aliases, components, loadCorpus: async () => corpus(k) });
    for (const f of fixtures) {
      const result = await retriever.query({ query: f.query, limit: 3 }), ids = result.sourceRefs.map(r => sourceMap[r]);
      rows.push({ arm, ...f, cardIds: ids, hit: f.acceptable.some(id => ids.includes(id)), returnedChars: sum(result.passages, p => p.content.length) });
    }
  }
  const result = { knowledgeHash: hash(k), probesHash: hash(fixtures), note: '12 prewritten diagnostic queries: 10 Chinese concepts + 2 canonical topic identifiers. Synthetic retrieval probes, not real-scene accuracy or a heldout benchmark; zero LLM tokens.', rows };
  await save(join(out, 'query-probes.json'), result);
  return result;
}
export async function replayQueries(knowledge, runs, needs) {
  const rows = [];
  for (const run of runs.filter(r => r.split === 'evaluation' && r.retrieval?.length)) {
    const required = needs.cases.find(n => n.caseId === run.caseId).required;
    for (const [arm, components] of Object.entries({ baseline: {}, combined: { smallToBig: true, contextEnrichment: true } })) {
      const aliases = new ArenaRunAliasVault(), sourceMap = {}, trace = [];
      for (const c of knowledge.cards) sourceMap[aliases.reference(`blind-discard-arena-rag/v1\0${c.source.system}\0${c.id}`)] = c.id;
      const retriever = boundedRetriever(createArenaRagRetriever({ mode: 'local', caseRef: aliases.caseRef('replay-query'), aliases, components, loadCorpus: async () => corpus(knowledge) }), trace, sourceMap);
      for (const t of run.retrieval) {
        const m = t.result.retrieval;
        await retriever.query({ query: m.query, limit: m.limit, ...(m.context ? { context: m.context } : {}), ...(m.filter ? { filter: m.filter } : {}) });
      }
      const ids = [...new Set(trace.flatMap(t => t.cardIds))];
      rows.push({ caseId: run.caseId, gameId: run.gameId, queryOriginArm: run.arm, replayArm: arm, queries: trace.map(t => t.query), cardIds: ids,
        required: required.length, covered: required.filter(n => n.chapters.some(id => ids.includes(id))).length, returnedChars: sum(trace, t => sum(t.result.passages, p => p.content.length)) });
    }
  }
  return { note: 'Post-hoc counterfactual replay of the observed query sequences (same filters/limits and deduplication); isolates retrieval ordering from autonomous query randomness. No regenerated explanations and zero LLM tokens; not an independent benchmark.', rows };
}
export async function report(out, failedPilotDirectory) {
  const config = await verify(out), dataset = await read(join(out, 'dataset.json')), needs = await read(join(out, 'needs.json')), knowledge = await read(join(out, 'knowledge.json'));
  const runs = await Promise.all((await readdir(join(out, 'runs'))).filter(n => n.endsWith('.json') && !n.endsWith('.started.json')).map(n => read(join(out, 'runs', n))));
  const rows = runs.filter(r => r.split === 'evaluation').map(r => measure(r, needs.cases.find(n => n.caseId === r.caseId)));
  if (rows.length !== 16 || new Set(rows.map(r => r.caseId + ':' + r.arm)).size !== 16) throw new Error('context_rag_report_requires_all_attempts');
  if ((await read(join(out, 'needs-receipt.json'))).hash !== hash(needs)) throw new Error('context_rag_needs_changed');
  const arms = Object.fromEntries(['baseline', 'combined'].map(arm => {
    const a = rows.filter(r => r.arm === arm);
    return [arm, { attempts: a.length, completed: a.filter(r => r.status === 'completed').length, failures: a.filter(r => r.status !== 'completed').length,
      diagnosticRequiredRecall: sum(a, r => r.covered) / sum(a, r => r.required), covered: sum(a, r => r.covered), required: sum(a, r => r.required),
      calls: sum(a, r => r.queries), noHits: sum(a, r => r.noHits), noQueryRuns: a.filter(r => !r.queries).length,
      inapplicableReturned: sum(a, r => r.inapplicable.length), returnedCards: sum(a, r => r.cardIds.length), invalidSourceRefs: sum(a, r => r.invalidSourceRefs.length),
      meanElapsedMs: mean(a.filter(r => r.elapsedMs !== null), r => r.elapsedMs), meanReturnedChars: mean(a, r => r.returnedChars), knownTotalTokens: sum(a, r => r.tokens?.totalTokens ?? 0), unknownUsageRuns: a.filter(r => r.usageStatus !== 'reported').length }];
  }));
  const pairs = dataset.cases.filter(c => c.split === 'evaluation').map(c => ({ caseId: c.id, gameId: c.gameId, baseline: rows.find(r => r.caseId === c.id && r.arm === 'baseline'), combined: rows.find(r => r.caseId === c.id && r.arm === 'combined') }));
  const usable = pairs.filter(p => p.baseline && p.combined), complete = usable.filter(p => p.baseline.status === 'completed' && p.combined.status === 'completed');
  const costs = complete.filter(p => p.baseline.usageStatus === 'reported' && p.combined.usageStatus === 'reported' && p.baseline.tokens?.totalTokens && p.combined.tokens?.totalTokens);
  const initialRequestChecks = [];
  for (const p of usable) {
    const requests = await Promise.all(['baseline', 'combined'].map(a => read(join(out, 'requests', `evaluation-${p.caseId}-${a}-1.json`))));
    initialRequestChecks.push({ caseId: p.caseId, equal: hash(requests[0]) === hash(requests[1]) });
  }
  const prior = failedPilotDirectory ? await Promise.all((await readdir(join(failedPilotDirectory, 'runs'))).filter(n => n.endsWith('.json') && !n.endsWith('.started.json')).map(n => read(join(failedPilotDirectory, 'runs', n)))) : [];
  const all = [...runs, ...prior];
  const metrics = { version: 'context-rag-report/v1', freezeHash: hash(config), needsHash: hash(needs), scope: '8 fresh games, one paired generation; assistant pre-generation needs, not expert gold', arms, rows, pairs,
    completePairs: complete.length, costPairs: costs.length,
    recallDifference: clusterInterval(usable, xs => mean(xs, x => x.combined.recall - x.baseline.recall)),
    pairedTokenRatio: costs.length ? clusterInterval(costs, xs => sum(xs, x => x.combined.tokens.totalTokens) / sum(xs, x => x.baseline.tokens.totalTokens)) : null,
    initialRequestChecks,
    allAttemptsIncludingDevelopment: { attempts: all.length, failures: all.filter(r => r.status !== 'completed').length, knownTokens: sum(all, r => (r.result?.providerUsage.tokens ?? r.result?.providerUsage.reportedPartial)?.totalTokens ?? 0), unknownUsageRuns: all.filter(r => r.result?.providerUsage.status !== 'reported').length, priorFailedPilotDirectory: failedPilotDirectory ?? null },
    limitations: ['No expert blind review: diagnostic recall does not establish final explanation quality.', '8 games and one draw per model/arm; intervals are descriptive, not a broad validity claim.', 'Unknown failed-call usage is retained as unknown, never zero.', 'Context enrichment uses verified card metadata; expansion is to the full v2 parent card, not unverified raw textbook/image paragraphs.'] };
  await save(join(out, 'metrics.json'), metrics);
  const replay = await replayQueries(knowledge, runs, needs);
  await save(join(out, 'query-replay.json'), replay);
  metrics.queryReplaySummary = Object.fromEntries(['baseline', 'combined'].map(arm => {
    const a = replay.rows.filter(r => r.replayArm === arm);
    return [arm, { sequences: a.length, covered: sum(a, r => r.covered), required: sum(a, r => r.required), returnedChars: sum(a, r => r.returnedChars) }];
  }));
  await save(join(out, 'metrics.json'), metrics);
  const fixed = await probes(out);
  const table = ['|指标|修复枚举后的原检索|small-to-big＋上下文增强|', '|---|---:|---:|',
    `|完成 / 尝试|${arms.baseline.completed} / ${arms.baseline.attempts}|${arms.combined.completed} / ${arms.combined.attempts}|`,
    `|诊断知识需求召回|${arms.baseline.covered}/${arms.baseline.required} (${pct(arms.baseline.diagnosticRequiredRecall)})|${arms.combined.covered}/${arms.combined.required} (${pct(arms.combined.diagnosticRequiredRecall)})|`,
    `|已回报 token 总量|${arms.baseline.knownTotalTokens}|${arms.combined.knownTotalTokens}|`,
    `|用量不完整的运行|${arms.baseline.unknownUsageRuns}|${arms.combined.unknownUsageRuns}|`,
    `|平均耗时（秒）|${num(arms.baseline.meanElapsedMs / 1000)}|${num(arms.combined.meanElapsedMs / 1000)}|`,
    `|平均返回正文字符|${num(arms.baseline.meanReturnedChars)}|${num(arms.combined.meanReturnedChars)}|`,
    `|不适用清单命中 / 返回卡|${arms.baseline.inapplicableReturned}/${arms.baseline.returnedCards}|${arms.combined.inapplicableReturned}/${arms.combined.returnedCards}|`,
    `|无结果检索 / 检索数|${arms.baseline.noHits}/${arms.baseline.calls}|${arms.combined.noHits}/${arms.combined.calls}|`,
    `|越界来源引用|${arms.baseline.invalidSourceRefs}|${arms.combined.invalidSourceRefs}|`].join('\n');
  const prose = `# Arena 轻量上下文检索独立试验\n\n模型：${config.provider.modelName} / ${config.provider.reasoningEffort}。知识卡保持 v2，两个组件可分别装配，旧检索默认不变。\n\n${table}\n\n成功且 token 完整的配对数：${costs.length}。配对总 token 比：${num(metrics.pairedTokenRatio?.estimate ?? null)}；按牌谱重采样 95% 区间 ${num(metrics.pairedTokenRatio?.low ?? null)}–${num(metrics.pairedTokenRatio?.high ?? null)}。缓存输入单列在 metrics.json 每次用量中，已包含于输入，不重复相加。\n\n逐局诊断召回差均值 ${pct(metrics.recallDifference.estimate)}，95% 区间 ${pct(metrics.recallDifference.low)}–${pct(metrics.recallDifference.high)}。需求在生成前由助手依据可见事实标注，没有人工金标准；不能据此声称专家讲解已验证改善。失败与不检索均保留。初始请求两组完全一致：${initialRequestChecks.filter(x => x.equal).length}/${initialRequestChecks.length}。\n\n所有开发及正式尝试 ${all.length} 次；失败 ${metrics.allAttemptsIncludingDevelopment.failures} 次；已知 token ${metrics.allAttemptsIncludingDevelopment.knownTokens}，另有 ${metrics.allAttemptsIncludingDevelopment.unknownUsageRuns} 次用量不完整（不当作 0）。初次开发的 4 次归档枚举错误原样保留。\n\n12 条固定查询另存 query-probes.json，含 10 条中文与 2 条主题英文标识，四种组件组合均运行；仅供定位机制差异，不混入真实牌局主结果。\n\n边界：完整父卡含条件和例外；未额外吞入整章原文或残缺牌图。检索定位偏差、模型主动查询差异及讲解误用需分别判断。默认开关尚未启用，不接入生产 Coach。\n\n[查看完整四家牌局与逐组结果](./review/index.html) · [逐局数据与用量](./metrics.json)\n`;
  const rb = metrics.queryReplaySummary.baseline, rc = metrics.queryReplaySummary.combined;
  const diagnosis = `\n## 同查询复核与结论\n\n将实际 ${rb.sequences} 条查询序列原样重放（包括主题过滤、限额和去重），基线覆盖 ${rb.covered}/${rb.required}，组合检索覆盖 ${rc.covered}/${rc.required}。返回正文由 ${rb.returnedChars} 增至 ${rc.returnedChars} 字符。这是事后检索诊断，未重新生成讲解，不消耗 LLM token。整体生成的覆盖差异同时受到自主查询次数与措辞波动影响，不能当作组件本身的因果收益。\n\n实现已完成，建议保留为 Arena 可选实验配置，当前不替换原默认检索。知识需求预标尚无人审；盲评未做。没有足够证据宣称提升讲解质量。下一步优先改善主动查询的问题覆盖，以及小块粒度和重复元数据；须在新的开发样本上调整后另建冻结试验。\n\n讲解抽查发现将剩余摸牌数写成巡目、自家/他家副露混淆等问题，检索和未检索两类输出中均有出现。详见 [助手诊断记录](./quality-review.json)，不是专家评分或穷尽错误率。引用合法只表示来源已返回，不证明结论得到支持。\n`;
  await writeFile(join(out, 'REPORT.md'), prose.replace('逐局诊断召回差均值', '逐局诊断召回差的宏平均（与表中微平均口径不同）').replace('，95% 区间', '，95% 区间') + diagnosis);
  await render(out, dataset, knowledge, runs, metrics);
  return metrics;
}
async function render(out, dataset, knowledge, runs, metrics) {
  const dir = join(out, 'review'); await mkdir(join(dir, 'assets/tiles'), { recursive: true });
  const source = new URL('../../packages/desktop/src/renderer/tiles/', import.meta.url);
  for (const file of await readdir(source)) if (file.endsWith('.svg')) await copyFile(new URL(file, source), join(dir, 'assets/tiles', file));
  await writeKnowledgeReader(dir, knowledge);
  const reader = join(dir, 'knowledge.html');
  await writeFile(reader, (await readFile(reader, 'utf8')).replaceAll('./knowledge-needs-60.html', './index.html').replaceAll('返回局面标注', '返回检索对照').replace(/<a href="\.\/knowledge-audit\.html">[^<]*<\/a>/, ''));
  const css = (await Promise.all(['../../arena-console/style.css', '../../arena-console/layout.css', '../scene-study/review.css'].map(p => readFile(new URL(p, import.meta.url), 'utf8')))).join('\n');
  const cases = dataset.cases.filter(c => c.split === 'evaluation');
  const articles = cases.map((c, i) => `<article data-case="${i}" ${i ? 'hidden' : ''}><h2>局面 ${i + 1}</h2>${graphicalScene(c.observation)}<div class="comparisons">${['baseline', 'combined'].map(arm => {
    const r = runs.find(r => r.caseId === c.id && r.arm === arm), s = submission(r), m = metrics.rows.find(r => r.caseId === c.id && r.arm === arm);
    return `<section><h3>${arm === 'baseline' ? '原检索（主题已修复）' : '小块定位＋上下文增强'}</h3><p>状态：${esc(r?.status ?? '未运行')} · token：${esc(m?.tokens?.totalTokens ?? '未知')} · 耗时：${num((m?.elapsedMs ?? 0) / 1000)} 秒</p><p class="answer">${esc(s?.rationale ?? r?.error ?? '无有效讲解')}</p><p>${esc(s?.uncertainty)}</p><p>来源：${(m?.cited ?? []).map(id => `<a href="./knowledge.html#${esc(id)}">${esc(id)} ${esc(knowledge.cards.find(c => c.id === id)?.title)}</a>`).join('；')}</p><p>预标需求未检索到：${esc(m?.missing.join('、'))}</p><details><summary>实际查询与完整返回卡</summary>${(r?.retrieval ?? []).map(t => `<h4>${esc(t.query)}</h4>${t.result.passages.map((p, j) => `<p><a href="./knowledge.html#${esc(t.cardIds[j])}">${esc(t.cardIds[j])} ${esc(p.sourceTitle)}</a></p><pre>${esc(p.content)}</pre>`).join('')}`).join('')}</details></section>`;
  }).join('')}</div></article>`).join('');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arena 上下文检索对照</title><style>${css}\n[hidden]{display:none!important}.comparisons{display:grid;grid-template-columns:1fr 1fr;gap:24px}.answer,pre{white-space:pre-wrap;overflow-wrap:anywhere}.comparisons section{min-width:0}@media(max-width:900px){.comparisons{grid-template-columns:1fr}}a{color:#24598c}</style><body class="study-review"><header><b>Arena · 独立检索对照</b><a href="./knowledge.html">阅读教材知识卡与原文链接</a><a href="../REPORT.md">结果报告</a></header><p>8 场新牌谱，各一手。以下展示组别，供诊断，不是专家盲评。完整四家公开信息沿用 Arena 呈现。知识卡保持 v2。</p><nav class="study-navigation"><label>局面 <select id="case-picker">${cases.map((c, i) => `<option value="${i}">${i + 1} / 8</option>`).join('')}</select></label></nav>${articles}<script>document.querySelector('#case-picker').addEventListener('change',e=>document.querySelectorAll('[data-case]').forEach(a=>a.hidden=a.dataset.case!==e.target.value));</script></body></html>`;
  await writeFile(join(dir, 'index.html'), html);
}
