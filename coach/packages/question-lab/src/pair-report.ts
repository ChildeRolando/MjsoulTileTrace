import { digest } from "./config.js";
import { writeFile } from "node:fs/promises";
import { QuestionLabConfigSchema, type PairScanCoordinate } from "@riichi-coach/contracts";
import { renderReport, tileImage } from "./report.js";
import { pairObservations, pairTargets, predictPair, pairWeights } from "./pair-features.js";
import type { PairStudy } from "./pair-study.js";
import { formatMjaiTile } from "@riichi-coach/mortal-source";
import type { PairFitResult, LabSample, LabLabel } from "@riichi-coach/contracts";
const esc = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
type ScanRecord = { coordinate: PairScanCoordinate; status: string; sampleId?: string; reason?: string; changed?: string[] };
export function compareFlips(study: Pick<PairStudy, "config" | "labels">, a: LabSample, b: LabSample) {
  const la = study.labels.get(a.sampleId), lb = study.labels.get(b.sampleId);
  if (!la || !lb) return { pairFlips: 0, sensitiveFlips: 0, finalSideFlip: false, status: "unlabelled" };
  const ap = pairObservations(a).pairs, bp = pairObservations(b).pairs;
  const at = pairTargets(a, la, study.config.learning.sensitiveGap), bt = pairTargets(b, lb, study.config.learning.sensitiveGap);
  const target = new Map(bt.targets.map(t => [t.pairId, t.y]));
  let pairFlips = 0, sensitiveFlips = 0;
  for (const p of ap) {
    const q = bp.find(q => q.eAction === p.eAction && q.dAction === p.dAction);
    if (!q) continue;
    const x = at.targets.find(t => t.pairId === p.pairId)!.y, y = target.get(q.pairId)!;
    if (x * y < 0) { pairFlips++; if (Math.min(Math.abs(x), Math.abs(y)) <= study.config.learning.sensitiveGap) sensitiveFlips++; }
  }
  const sa = at.summary, sb = bt.summary;
  const finalSideFlip = [sa, sb].every(s => ["efficiency", "dora"].includes(s.side) && !s.thirdTied && (s.outsideGap ?? 0) > study.config.learning.robustGap) && sa.side !== sb.side;
  return { pairFlips, sensitiveFlips, finalSideFlip,
    status: !bp.length ? "竞争消失" : sb.side === "third" ? "第三选择胜出" : sb.side === "both" ? "两侧并列" : sb.side };
}
export async function renderPairReport(study: PairStudy, options: { deadlineAt?: number } = {}) {
  const started = performance.now();
  const checkBudget = () => {
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) throw new Error("report_budget_exhausted");
  };
  checkBudget();
  const stages = await Promise.all([0, 1, 2, 3].map(n => study.archive.read(`generation/round-${n}.json`)));
  const proposalCounts: Record<string, Record<string, number>> = {};
  for (let round = 0; round <= study.config.budget.refinementRounds; round++) {
    const files = await study.archive.list(`attempts/round-${round}`), counts: Record<string, number> = {};
    for (let i = 0; i < files.length; i += 128) {
      checkBudget();
      const attempts = await Promise.all(files.slice(i, i + 128).map(name => study.archive.read(`attempts/round-${round}/${name}`)));
      for (const a of attempts as { status: string }[]) counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    proposalCounts[String(round)] = counts;
  }
  const records = await Promise.all((await study.archive.list("scan-results")).map(n => study.archive.read(`scan-results/${n}`))) as ScanRecord[];
  const latest = (await study.archive.read("fit-final.json") ?? await study.archive.read("fit.json")) as { result: PairFitResult; resultHash: string } | null;
  if (latest && latest.resultHash !== digest(latest.result)) throw new Error("pair_fit_identity_mismatch");
  const rows = study.learningRows().filter(r => latest?.result.evaluated || r.split === "train");
  const strict = study.samples.filter(s => pairObservations(s).pairs.length);
  const visibleMain = strict.filter(s => study.sources[s.sampleId]!.phase !== "threat" && study.labels.has(s.sampleId) &&
    (latest?.result.evaluated || s.split === "train"));
  const finalSides = visibleMain.map(s => pairTargets(s, study.labels.get(s.sampleId)!, study.config.learning.sensitiveGap).summary.side);
  const sourceCounts = Object.fromEntries(["initial", "development", "scan", "refinement", "threat"].map(phase => [phase, study.samples.filter(s => study.sources[s.sampleId]!.phase === phase).length]));
  const failures = Object.fromEntries([...new Set(records.filter(r => r.status !== "ok").map(r => r.reason ?? r.status))].map(k => [k, records.filter(r => (r.reason ?? r.status) === k).length]));
  const initial = stages[0] as { complete: boolean } | null;
  const expectedRefinements = stages.slice(1, 1 + study.config.budget.refinementRounds) as ({ complete: boolean } | null)[];
  const anchors = await study.archive.read("anchors.json") as { ids: string[]; requested: number } | null;
  let expectedScans = 0;
  let scanPlansComplete = true;
  for (const id of anchors?.ids ?? []) {
    for (const prefix of ["", "fine-"]) {
      const plan = await study.archive.read(`scan-plans/${prefix}${id}.json`) as { coordinates: PairScanCoordinate[] } | null;
      expectedScans += plan?.coordinates.length ?? 0;
      if (!plan && (prefix === "" ? study.config.scans.variantsPerAnchor > 0 : study.config.scans.variantsPerAnchor > 36)) scanPlansComplete = false;
    }
  }
  const expectedThreats = study.config.scans.threats ? (anchors?.ids.length ?? 0) * 4 : 0;
  const comparisons = records.filter(r => r.status === "ok" && r.sampleId).flatMap(r => {
    const base = study.samples.find(s => s.sampleId === r.coordinate.anchorId), variant = study.samples.find(s => s.sampleId === r.sampleId);
    return base && variant ? [{ coordinate: r.coordinate, ...compareFlips(study, base, variant) }] : [];
  });
  const flipCounts = (phase: string) => {
    const selected = comparisons.filter(r => r.coordinate.phase === phase);
    return { comparisons: selected.length, fixedPairSignReversals: selected.reduce((n, r) => n + r.pairFlips, 0),
      sensitivePairSignReversals: selected.reduce((n, r) => n + r.sensitiveFlips, 0),
      robustFinalSideFlipComparisons: selected.filter(r => r.finalSideFlip).length,
      anchorsWithRobustFlip: new Set(selected.filter(r => r.finalSideFlip).map(r => r.coordinate.anchorId)).size };
  };
  await study.archive.write("scan-flips.json", comparisons);
  const summary = {
    schemaVersion: "question-lab-study-summary/v2", status: initial?.complete && expectedRefinements.every(r => r?.complete) &&
      latest?.result.evaluated && scanPlansComplete && records.filter(r => r.coordinate.phase === "scan").length >= expectedScans &&
      records.filter(r => r.coordinate.phase === "threat").length >= expectedThreats && study.labels.size === study.samples.length ? "complete" : "partial",
    samples: study.samples.length, strictConflictSamples: strict.length, labelled: study.labels.size, pairs: rows.length,
    sourceCounts, stages, timings: study.timings, scanAttempts: records.length, legalScans: records.filter(r => r.status === "ok").length,
    testGroups: study.split?.testGroups.length ?? 0,
    requestedAnchors: study.config.scans.anchorCount, actualAnchors: anchors?.ids.length ?? 0,
    scanFlips: flipCounts("scan"), threatFlips: flipCounts("threat"),
    failures, proposalCounts, nativeCalls: study.calls, remainingMs: study.remainingMs,
    finalEvaluated: latest?.result.evaluated ?? false,
    holdoutLabelsMasked: !latest?.result.evaluated,
    zeroEstimatePairs: rows.filter(r => r.features.valueBothZero === 1).length,
    pairOutcomeCounts: { efficiency: rows.filter(r => r.y > study.config.learning.sensitiveGap).length,
      dora: rows.filter(r => r.y < -study.config.learning.sensitiveGap).length,
      sensitive: rows.filter(r => Math.abs(r.y) <= study.config.learning.sensitiveGap).length,
      exactZero: rows.filter(r => r.y === 0).length },
    finalSideCounts: Object.fromEntries(["efficiency", "dora", "both", "third"].map(side => [side, finalSides.filter(s => s === side).length])),
  };
  await study.archive.write("generation-summary.json", summary);
  const nativeConfig = QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", name: study.config.name, seed: study.config.seed });
  const metrics = Object.entries(latest?.result.models ?? {}).map(([name, model]) => `<tr><td>${esc(name)}</td><td>${model.status}</td><td>${esc(model.model?.kernel)}</td><td>${model.train?.mae.toFixed(4) ?? "—"}</td><td>${model.test?.mae.toFixed(4) ?? "未评估"}</td><td>${model.test?.rmse.toFixed(4) ?? "未评估"}</td><td>${model.test?.signAccuracy.toFixed(3) ?? "未评估"}</td></tr>`).join("");
  const calibrationRows = latest?.result.models.full?.test?.calibration ?? [];
  const calibrationScale = Math.max(1, ...calibrationRows.flatMap(r => [Math.abs(r.predicted), Math.abs(r.actual)]));
  const calibration = calibrationRows.map(r => `<circle cx="${210 + r.predicted * 150 / calibrationScale}" cy="${180 - r.actual * 150 / calibrationScale}" r="5"><title>${r.count} 对；预测 ${r.predicted.toFixed(3)}；实际 ${r.actual.toFixed(3)}</title></circle>`).join("");
  const explanation = latest?.result.models.full?.explanation;
  const weights = explanation?.standardizedWeights?.map((weight, i) => ({ weight, feature: latest!.result.models.full!.model!.features[i]! })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 16);
  const predictions = new Map((latest?.result.evaluated ? latest.result.models.full?.predictions : latest?.result.models.full?.oof)?.map(p => [p.pairId, p.predicted]) ?? []);
  const slices = [...new Set(rows.map(r => r.features.deltaS!))].sort((a, b) => a - b).map(difference => {
    const subset = rows.filter(r => r.features.deltaS === difference);
    const groups = new Set(subset.map(r => r.groupId));
    const positive = new Set(subset.filter(r => r.y > study.config.learning.sensitiveGap).map(r => r.groupId)), negative = new Set(subset.filter(r => r.y < -study.config.learning.sensitiveGap).map(r => r.groupId));
    const measured = subset.filter(r => predictions.has(r.pairId)), weights = pairWeights(measured);
    const weighted = (squared: boolean) => measured.reduce((sum, r, i) => sum + weights[i]!.weight *
      (squared ? (predictions.get(r.pairId)! - r.y) ** 2 : Math.abs(predictions.get(r.pairId)! - r.y)), 0) / Math.max(1, measured.length);
    const error = measured.length ? `${latest?.result.evaluated ? "独立测试" : "训练分组外预测"} ${measured.length} 对，MAE ${weighted(false).toFixed(4)}、RMSE ${Math.sqrt(weighted(true)).toFixed(4)} Q。` : "尚无可评估预测。";
    return `<p>向听差 ${difference}（${difference === 0 ? "同向听" : "跨向听"}）：${subset.length} 对、${groups.size} 个来源组；效率正分差 ${positive.size} 组、保宝正分差 ${negative.size} 组。${error}${Math.min(positive.size, negative.size) < 10 ? "双侧证据不足，不能宣称稳定边界。" : "是否稳定仍须结合独立测试和反例。"}</p>`;
  }).join("");
  const scanSections = (anchors?.ids ?? []).map(id => {
    checkBudget();
    const base = study.samples.find(s => s.sampleId === id)!;
    const relevant = records.filter(r => r.coordinate.anchorId === id);
    const observed = relevant.map(r => {
      const s = study.samples.find(s => s.sampleId === r.sampleId);
      const flips = s ? compareFlips(study, base, s) : null;
      return `<tr><td>${esc(r.coordinate.axis)}</td><td>${esc(JSON.stringify(r.coordinate.values))}</td><td>${s ? `<a href="#case-${s.sampleId}">${s.sampleId.slice(0, 8)}</a>` : esc(r.reason ?? r.status)}</td><td>${flips?.pairFlips ?? "—"}</td><td>${flips?.finalSideFlip ? "是" : "否"}</td><td>${esc(flips?.status)}</td><td>${esc(r.changed?.join("、"))}</td></tr>`;
    }).join("");
    const fixedPairs = pairObservations(base).pairs;
    const first = fixedPairs[0];
    const pairTiles = first ? [first.eRef, first.dRef].map(ref => {
      const c = base.candidates.find(c => c.actionRef === ref)!;
      return c.action.kind === "discard" ? tileImage(formatMjaiTile(c.action.tile)) : "";
    }) : [];
    const plots: string[] = [];
    for (const axis of ["availability", "scores", "turn"]) {
      const series = relevant.filter(r => r.status === "ok" && r.coordinate.axis === axis && Object.keys(r.coordinate.values).length === 1);
      const keys = [...new Set(series.map(r => Object.keys(r.coordinate.values)[0]!))];
      for (const key of keys) {
        const points = series.filter(r => key in r.coordinate.values).flatMap(r => {
          const s = study.samples.find(s => s.sampleId === r.sampleId)!;
          const same = pairObservations(s).pairs.find(p => p.eAction === fixedPairs[0]?.eAction && p.dAction === fixedPairs[0]?.dAction);
          const label = study.labels.get(s.sampleId);
          if (!same || !label) return [];
          return [{ x: Number(r.coordinate.values[key]), y: pairTargets(s, label, study.config.learning.sensitiveGap).targets.find(t => t.pairId === same.pairId)!.y, id: s.sampleId }];
        }).sort((a, b) => a.x - b.x);
        if (points.length < 2) continue;
        const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
        const yScale = Math.max(1, ...points.map(p => Math.abs(p.y)));
        const px = (x: number) => 40 + 480 * (x - minX) / Math.max(1, maxX - minX), py = (y: number) => 140 - 110 * y / yScale;
        plots.push(`<p>${esc(axis)} / ${esc(key)}：固定 E 弃${pairTiles[0] ?? ""}、D 弃${pairTiles[1] ?? ""}；图中只含仍保持该配对主张归属的合法点。锚点其他背景固定；牌河或时间推进的实际联动变化见表。</p><svg viewBox="0 0 570 290" aria-label="固定配对合法扫描"><path d="M35 25v230M35 140h510" stroke="#aaa" fill="none"/><polyline points="${points.map(p => `${px(p.x)},${py(p.y)}`).join(" ")}" fill="none" stroke="#276d63"/>${points.map(p => `<a href="#case-${p.id}"><circle cx="${px(p.x)}" cy="${py(p.y)}" r="5" fill="#276d63"><title>${p.x}: ${p.y.toFixed(5)}</title></circle></a>`).join("")}<text x="40" y="280">${minX} … ${maxX}；纵轴 Q(E)−Q(D)，范围 ±${yScale.toFixed(2)}</text></svg>`);
      }
    }
    return `<details><summary>锚点 ${id.slice(0, 12)} · ${relevant.length} 个扫描记录</summary><p><a href="#case-${id}">原局面和全部 Q</a>。改变宝牌导致主张变化、第三选择或敏感翻转均单独列出；不能将所有线段称为最终选择边界。</p>${plots.join("")}<div style="overflow:auto"><table><thead><tr><th>轴</th><th>目标</th><th>局面／失败</th><th>固定配对翻转数</th><th>最终侧翻转</th><th>状态</th><th>实际变化</th></tr></thead><tbody>${observed}</tbody></table></div></details>`;
  }).join("");
  const full = latest?.result.models.full?.model;
  const threats = study.samples.filter(s => study.sources[s.sampleId]!.phase === "threat" && study.labels.has(s.sampleId));
  const threatErrors = new Map<string, number[]>();
  if (full) for (const s of threats) {
    const targets = new Map(pairTargets(s, study.labels.get(s.sampleId)!, study.config.learning.sensitiveGap).targets.map(t => [t.pairId, t.y]));
    const errors = pairObservations(s).pairs.map(p => Math.abs(predictPair(full, p.features) - targets.get(p.pairId)!));
    if (errors.length) threatErrors.set(s.groupId, [...(threatErrors.get(s.groupId) ?? []), errors.reduce((a, b) => a + b, 0) / errors.length]);
  }
  const extensionMae = threatErrors.size ? [...threatErrors.values()].map(v => v.reduce((a, b) => a + b, 0) / v.length).reduce((a, b) => a + b, 0) / threatErrors.size : null;
  const studySection = `<section id="pair-study"><h2>严格竞争配对 · SVR</h2><p>E：最小向听 → 最大可见有效牌；D：最多保宝 → 最小向听 → 最大可见有效牌。推荐集合有交集时不进入主实验。y=Q(E弃牌)−Q(D弃牌)。</p><pre>${esc(JSON.stringify(summary, null, 2))}</pre><p>缺失估值以标记表达；双方估值为零只说明 helper 没有区分能力。跨向听时有效牌差不是可直接比较的效率优势。敏感区 ±${study.config.learning.sensitiveGap} Q；最终侧翻转要求侧外优势 >${study.config.learning.robustGap} Q，均非概率或因果证明。</p>${slices}<h3>固定分组消融</h3><p class="candidate-hint muted">窄屏可横向滚动比较全部特征版本。</p><div class="candidate-table" tabindex="0" role="region" aria-label="配对模型比较表" style="overflow-x:auto"><table style="min-width:680px"><thead><tr><th>特征</th><th>状态</th><th>核</th><th>训练 MAE</th><th>独立 MAE</th><th>独立 RMSE</th><th>独立胜负一致率</th></tr></thead><tbody>${metrics}</tbody></table></div><p>同源组总权重一致；三种版本共用划分、训练配对与预算。混淆矩阵为原始计数，行表示真实类别，列表示预测类别，顺序均为保宝／敏感区／效率；误差与胜负一致率按来源组加权。最终独立集只在研究冻结后评估。</p>${calibration ? `<svg viewBox="0 0 420 360" aria-label="Q 分差校准"><path d="M45 180h330M210 15v330M60 330L360 30" stroke="#aaa" fill="none"/><g fill="#276d63">${calibration}</g><text x="10" y="355">横轴预测分差，纵轴实际分差，范围 ±${calibrationScale.toFixed(2)} Q；悬停查看分箱</text></svg>` : ""}<pre>${esc(JSON.stringify(latest?.result.models.full?.test ?? { status: "未评估或证据不足" }, null, 2))}</pre><h3>解释与忠实度</h3><p>浅层树拟合训练组模型输出；忠实度用预测差的 MAE 表达。解释贴近 SVR 不代表 SVR 对 Mortal 的拟合良好。</p><pre>${esc(JSON.stringify({ trainingFidelityMae: explanation?.trainingFidelityMae, testFidelityMae: explanation?.testFidelityMae, weights, constantFeatures: explanation?.constantFeatures }, null, 2))}</pre><pre>${esc(explanation?.tree)}</pre><h3>威胁扩展</h3><p>${threats.length} 个合法变体，${threatErrors.size} 个有配对来源组；冻结主模型的来源组加权外推 MAE ${extensionMae?.toFixed(4) ?? "证据不足"}。该扩展不参与主模型调参。</p></section><section><h2>从真实反例出发的合法扫描</h2><p>固定配对翻转与 Mortal 最终选择侧翻转分别统计；时间推进包含新增历史，不能声称其他条件完全相同。只观察到一个胜负方向、没有翻转或预算不足均保留为真实结果。</p>${scanSections || "没有满足条件的训练锚点，证据不足。"}</section>`;
  await renderReport(study.archive, nativeConfig, {
    ...(options.deadlineAt !== undefined ? { deadlineAt: options.deadlineAt } : {}),
    maskHoldout: !latest?.result.evaluated, afterHeader: studySection,
    experimentMetadata: { schemaVersion: study.config.schemaVersion, reportSchemaVersion: "question-lab-pair-report/v2.1", name: study.config.name, seed: study.config.seed,
      initialCount: study.config.initialCount, budget: study.config.budget, learning: study.config.learning, scans: study.config.scans,
      developmentSourceCount: study.config.developmentArchives.length },
    decorateCase: (sample, label) => pairCaseDecoration(sample, label, study.config.learning.sensitiveGap),
  });
  await study.archive.write("study-summary.json", { ...summary, reportMs: performance.now() - started });
  return { ...summary, report: study.archive.path("report.html") };
}

export async function renderPairBudgetStop(study: Pick<PairStudy, "archive" | "config" | "samples" | "labels">) {
  const summary = { status: "partial", reason: "report_budget_exhausted", samples: study.samples.length,
    labelled: study.labels.size, reportIncomplete: true };
  await study.archive.write("report-budget-stop.json", summary);
  await writeFile(study.archive.path("report.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(study.config.name)}</title><main><h1>${esc(study.config.name)}</h1><p>本次预算已用尽，完整报告尚未生成。</p><p>已完成的 ${summary.samples} 个局面、${summary.labelled} 个标注及已有模型保存在同一档案。使用相同版本单独运行 report 命令可重建完整报告。</p></main></html>`);
  return { ...summary, report: study.archive.path("report.html") };
}

export function pairCaseDecoration(s: LabSample, label: LabLabel | undefined, sensitiveGap: number): { summary?: string; body?: string } {
  const pairs = pairObservations(s).pairs;
  if (!pairs.length) return {};
  const targets = label ? pairTargets(s, label, sensitiveGap) : null;
  const sideNames = { efficiency: "效率侧胜出", dora: "保宝侧胜出", both: "两侧并列", third: "第三选择胜出" };
  const table = pairs.map(p => {
    const a = s.candidates.find(c => c.actionRef === p.eRef)!, b = s.candidates.find(c => c.actionRef === p.dRef)!;
    return `<tr><td>${a.action.kind === "discard" ? tileImage(formatMjaiTile(a.action.tile)) : ""}</td><td>${b.action.kind === "discard" ? tileImage(formatMjaiTile(b.action.tile)) : ""}</td><td>${p.features.deltaU}</td><td>${p.features.deltaS}</td><td>${p.features.deltaD}</td><td>${p.features.valuePairKnown ? `${p.features.deltaV}${p.features.valueBothZero ? "（helper 双零）" : ""}` : "未知"}</td><td>${targets?.targets.find(t => t.pairId === p.pairId)?.y.toFixed(5) ?? "未标注"}</td></tr>`;
  }).join("");
  return { ...(targets ? { summary: sideNames[targets.summary.side] } : {}),
    body: `<p>集合最高分差 ${targets?.summary.setGap?.toFixed(5) ?? "未知"}；最终侧 ${esc(targets?.summary.side)}。以下为全部真实配对。</p><div style="overflow:auto"><table><thead><tr><th>E 弃牌</th><th>D 弃牌</th><th>有效牌差</th><th>向听差</th><th>宝牌差</th><th>估值差</th><th>Q 差</th></tr></thead><tbody>${table}</tbody></table></div>` };
}
