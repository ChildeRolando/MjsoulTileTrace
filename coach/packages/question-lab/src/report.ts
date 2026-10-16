import { writeFile } from "node:fs/promises";
import type {
  QuestionLabConfig,
  LabSample,
  LabLabel,
} from "@riichi-coach/contracts";
import { formatMjaiTile } from "@riichi-coach/mortal-source";
import { Archive } from "./archive.js";
import { readSamples, readLabels } from "./batch.js";
import { pendingDecision } from "./projection.js";
import type { Boundaries } from "./learning.js";
import { tileArtDefinitions, tileArtName } from "./tile-art.js";

const escape = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const names: Record<string, string> = {
  turn: "巡目",
  remainingDraws: "剩余摸牌",
  selfRiichi: "本人立直",
  dealer: "庄家",
  round: "局次",
  honba: "本场",
  riichiSticks: "供托",
  score: "点数",
  scoreGap: "与他家最高分差",
  shantenMin: "最小向听",
  shantenMax: "最大向听",
  ukeireMax: "最大有效牌余枚",
  ukeireMin: "最小有效牌余枚",
  doraMax: "最多保留宝牌",
  doraMin: "最少保留宝牌",
  threats: "威胁数",
  meldCount: "本人副露数",
  candidateCount: "合法动作数",
  discardCount: "可分析弃牌数",
  valueEstimateMax: "最高打点估计",
  valueEstimateMin: "最低打点估计",
  shapePairCount: "对子形状数",
  shapeSequenceCount: "顺子形状数",
};
const actionNames: Record<string, string> = {
  discard: "弃牌",
  declare_riichi: "立直",
  riichi_discard: "立直弃牌",
  chi: "吃",
  pon: "碰",
  daiminkan: "明杠",
  ankan: "暗杠",
  kakan: "加杠",
  tsumo: "自摸",
  ron: "荣和",
  pass: "跳过",
  kyuushu_kyuuhai: "九种九牌",
};
export function tileImage(tile: string): string {
  const name = tileArtName(tile);
  const honors: Record<string, string> = { E: "東", S: "南", W: "西", N: "北", P: "白", F: "發", C: "中" };
  const label = honors[tile] ?? `${tile[0]}${tile[1] === "m" ? "万" : tile[1] === "p" ? "筒" : "索"}${tile.endsWith("r") ? "赤" : ""}`;
  return `<svg class="tile" viewBox="0 0 272 360" role="img" aria-label="${escape(label)}"><use href="#tile-art-${name}"/></svg>`;
}
function sampleCard(
  s: LabSample,
  label: LabLabel | undefined,
  hypothesisNames: Record<string, string>,
  decoration: { summary?: string; body?: string } = {},
): string {
  const decision = pendingDecision(s.stream),
    f = decision.facts;
  const show = (tiles: string[]) => tiles.map(tileImage).join("");
  const selected = label?.preferredActionRefs ?? [];
  return `<details class="case" id="case-${s.sampleId}" data-search="${escape(`${s.sampleId} ${s.hypotheses.map((h) => `${h.id} ${hypothesisNames[h.id] ?? h.id}`).join(" ")}`)}"><summary>${s.sampleId.slice(0, 12)} · ${s.split === "test" ? "独立测试" : "训练"} · ${s.features.turn}巡 · ${label?.otherChoice ? "其他动作胜出" : label?.sensitive ? "分差敏感" : "普通样本"}${decoration.summary ? ` · ${escape(decoration.summary)}` : ""}</summary><div class="tiles">${show(f.concealedTiles.map(formatMjaiTile))}<span class="draw">${f.currentDraw ? tileImage(formatMjaiTile(f.currentDraw.tile)) : ""}</span></div><p>本局 ${f.roundWind === "E" ? "东" : "南"}${f.currentRound?.status === "known" ? f.currentRound.hand : ""} · ${f.dealer ? "庄家" : "闲家"} · ${f.currentRound?.status === "known" ? `${f.currentRound.honba}本场 · 供托${f.currentRound.riichiSticks}` : ""} · 剩余摸牌 ${f.remainingDraws} · 点数 ${f.scores?.status === "known" ? f.scores.byActor.join(" / ") : "未知"}</p><p>宝牌指示牌：${show(f.doraIndicators.map(formatMjaiTile))}</p>
    <div class="rivers">${f.rivers
      .map(
        (river, actor) =>
          `<div><span>玩家 ${actor}${actor === f.actor ? "（本人）" : ""}${decision.snapshot.publicState.riichiStates[actor]!.status === "accepted" ? " · 立直" : ""}</span>${show(river.map((r) => formatMjaiTile(r.tile)))}${f.melds
            .filter((m) => m.actor === actor)
            .map(
              (m) =>
                `<span class="meld">${escape(actionNames[m.kind] ?? m.kind)} ${show(m.tiles.map(formatMjaiTile))}</span>`,
            )
            .join("")}</div>`,
      )
      .join("")}</div>
    <p class="candidate-hint muted">窄屏可横向滚动查看全部候选指标和 Q 值。</p><div class="candidate-table" tabindex="0" role="region" aria-label="完整候选评分表" style="overflow-x:auto"><table><thead><tr><th>行动</th><th>向听</th><th>有效牌余枚</th><th>宝牌</th><th>立直打点估计</th><th>Q</th>${s.hypotheses.map((h) => `<th>${escape(hypothesisNames[h.id] ?? h.id)}</th>`).join("")}</tr></thead><tbody>${s.candidates.map((c) => `<tr${selected.includes(c.actionRef) ? ' class="best"' : ""}><td>${"tile" in c.action ? `${escape(actionNames[c.action.kind] ?? c.action.kind)} ${tileImage(formatMjaiTile(c.action.tile))}` : escape(actionNames[c.action.kind] ?? c.action.kind)} ${selected.includes(c.actionRef) ? "Mortal 最优" : ""}</td><td>${c.metrics.shanten ?? "未知"}</td><td>${c.metrics.ukeire ?? "未知"}</td><td>${c.metrics.dora ?? "未知"}</td><td>${c.metrics.valueEstimate === null ? "未知" : Math.round(c.metrics.valueEstimate).toLocaleString("zh-CN")}</td><td>${label?.scores.find((q) => q.actionRef === c.actionRef)?.qValue.toFixed(5) ?? "未评分"}</td>${s.hypotheses.map((h) => `<td>${h.actionRefs.includes(c.actionRef) ? "✓" : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p>模式主张：${s.hypotheses.map((h) => `${escape(hypothesisNames[h.id] ?? h.id)}：${h.applicable ? `${h.actionRefs.length} 个行动` : "不适用"}`).join("；")}</p>${s.variant > 0 ? `<p>相对基础局面的实际变化：${s.changed.map(escape).join("、") || "无可见变化"}。</p>` : ""}<p class="muted">合法构造；自然出现频率未校准。打点为 helper 启发式估计。构造见证与标签分别存档。</p>${decoration.body ?? ""}</details>`;
}
function slicePlot(
  samples: LabSample[],
  labels: Map<string, LabLabel>,
  taskId: string,
): string {
  const ids = taskId.split("+"),
    eligible = samples.filter(
      (s) =>
        ids.every((id) =>
          s.hypotheses.some((h) => h.id === id && h.applicable),
        ) && labels.has(s.sampleId),
    );
  if (!eligible.length) return "";
  const anchors = [
    "round",
    "dealer",
    "selfRiichi",
    "threats",
    "meldCount",
    "score",
    "scoreGap",
  ];
  const groups = new Map<string, LabSample[]>();
  for (const s of eligible) {
    const k = anchors.map((f) => s.features[f]).join(",");
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const subset = [...groups.values()].sort((a, b) => b.length - a.length)[0]!;
  const dimensions = ["turn", "ukeireMax", "doraMax", "shantenMin"].filter(
    (f) => new Set(subset.map((s) => s.features[f])).size > 1,
  );
  if (dimensions.length < 2)
    return "<p>该固定背景内样本不足以绘制二维条件切片。</p>";
  const [a, b] = dimensions as [string, string],
    xs = subset.map((s) => s.features[a]!),
    ys = subset.map((s) => s.features[b]!),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const points = subset
    .map((s) => {
      const l = labels.get(s.sampleId)!,
        h = s.hypotheses.find((h) => h.id === ids[0])!,
        support = h.actionRefs.some((ref) =>
          l.preferredActionRefs.includes(ref),
        );
      return `<a href="#case-${s.sampleId}"><circle cx="${50 + ((s.features[a]! - x0) / (x1 - x0)) * 500}" cy="${250 - ((s.features[b]! - y0) / (y1 - y0)) * 210}" r="4" fill="${support ? "#276d63" : "#b35949"}"><title>${escape(s.sampleId.slice(0, 12))}</title></circle></a>`;
    })
    .join("");
  return `<p class="muted">固定背景：${anchors.map((f) => `${escape(names[f] ?? f)}=${subset[0]!.features[f]}`).join("，")}。其他特征仍可能变化；只绘制实际生成的合法局面。</p><svg viewBox="0 0 610 300" role="img" aria-label="合法局面条件切片"><path d="M45 25v235h525" stroke="#999" fill="none"/>${points}<text x="280" y="290">${escape(names[a] ?? a)}</text><text x="3" y="20">${escape(names[b] ?? b)}</text></svg><p>绿色：首个模式获支持；赭色：未获支持。${subset.length} 个样本。</p>`;
}
export async function renderReport(
  archive: Archive,
  config: QuestionLabConfig,
  options: {
    maskHoldout?: boolean;
    deadlineAt?: number;
    afterHeader?: string;
    experimentMetadata?: Record<string, unknown>;
    decorateCase?: (sample: LabSample, label: LabLabel | undefined) => { summary?: string; body?: string };
  } = {},
) {
  const started = performance.now();
  const art = await tileArtDefinitions();
  const allSamples = await readSamples(archive, options.deadlineAt);
  const samples = options.maskHoldout ? allSamples.filter(s => s.split === "train") : allSamples,
    labels = await readLabels(archive, samples, options.deadlineAt),
    boundaries = ((await archive.read("boundaries-final.json")) ??
      (await archive.read("boundaries.json"))) as Boundaries | null;
  const generation = await archive.read("generation-summary.json"),
    manifest = await archive.read("manifest.json");
  const coverage = [
    "turn",
    "remainingDraws",
    "round",
    "honba",
    "riichiSticks",
    "score",
    "scoreGap",
    "selfRiichi",
    "threats",
    "meldCount",
    "shantenMin",
    "ukeireMax",
    "doraMax",
  ]
    .map((field) => {
      const values = samples
        .map((s) => s.features[field]!)
        .filter(Number.isFinite);
      if (!values.length) return "";
      const min = values.reduce((a, b) => Math.min(a, b)),
        max = values.reduce((a, b) => Math.max(a, b));
      return `<tr><td>${escape(names[field] ?? field)}</td><td>${min}</td><td>${max}</td><td>${new Set(values).size}</td></tr>`;
    })
    .join("");
  const combinations = Object.entries(
    (boundaries?.supportedCombinations ?? {}) as Record<string, number>,
  )
    .map(
      ([ids, count]) =>
        `<tr><td>${escape(
          ids
            ? ids
                .split("+")
                .map(
                  (id) =>
                    config.hypotheses.find((h) => h.id === id)?.name ?? id,
                )
                .join(" ＋ ")
            : "均未获支持",
        )}</td><td>${count}</td></tr>`,
    )
    .join("");
  const tasks = Object.entries(boundaries?.tasks ?? {})
    .map(([id, t]) => {
      const metrics = t.holdout as
        { confusionMatrix?: number[][]; classes?: string[] } | undefined;
      const missingHoldoutClasses =
        metrics?.classes &&
        Object.keys(t.classCounts as object).some((name) => {
          const index = metrics.classes!.indexOf(name);
          return (
            index < 0 || !metrics.confusionMatrix?.[index]?.some((n) => n > 0)
          );
        });
      const counterexamples = (t.counterexamples as string[] | undefined) ?? [];
      const explanation = t.explanation as
        | {
            tree?: string;
            trainingFidelity?: number;
            holdoutFidelity?: number;
            focusFeatures?: string[];
            standardizedWeights?: number[][];
            classOrder?: string[];
            boundaryPairs?: { a: string; b: string }[];
          }
        | undefined;
      const weights =
        explanation?.standardizedWeights
          ?.map((row, index) => {
            const classes = explanation.classOrder ?? [],
              pairs = classes.flatMap((a, i) =>
                classes.slice(i + 1).map((b) => [a, b]),
              );
            const pair = pairs[index] ?? [];
            const positive = classes.length === 2 ? pair[1] : pair[0];
            return `<p>标准化系数：${escape(pair.join(" / "))}；正方向对应 ${escape(positive)}。</p><table><thead><tr><th>特征</th><th>系数</th></tr></thead><tbody>${row
              .map((value, i) => ({ name: t.featureNames[i]!, value }))
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
              .slice(0, 8)
              .map(
                (r) =>
                  `<tr><td>${escape(names[r.name] ?? r.name)}</td><td>${r.value.toFixed(4)}</td></tr>`,
              )
              .join("")}</tbody></table>`;
          })
          .join("") ?? "";
      return `<section><h2>${escape(id)}</h2><p>${t.status === "fitted" ? "已拟合候选边界" : "证据不足"} · 训练 ${escape(t.trainCount)} · 独立测试 ${escape(t.testCount)}</p>${t.holdout ? `<pre>${escape(JSON.stringify(t.holdout, null, 2))}</pre>` : ""}${
        explanation
          ? `<p>重点检查：${explanation.focusFeatures?.map((f) => escape(names[f] ?? f)).join("、") ?? ""}。</p><p>解释训练忠实度 ${explanation.trainingFidelity?.toFixed(3)}；独立测试忠实度 ${explanation.holdoutFidelity?.toFixed(3) ?? "尚未评估"}。</p>${weights}<pre>${escape(explanation.tree)}</pre><p>边界两侧：${
              explanation.boundaryPairs
                ?.slice(0, 6)
                .map(
                  (p) =>
                    `<a href="#case-${p.a}">${p.a.slice(0, 8)}</a> ↔ <a href="#case-${p.b}">${p.b.slice(0, 8)}</a>`,
                )
                .join(" · ") ?? ""
            }</p>`
          : ""
      }${missingHoldoutClasses ? "<p>独立测试类别覆盖不足：当前指标仅描述实际覆盖的类别，尚无充分证据验证所有类别边界。</p>" : ""}<p>独立测试反例：${counterexamples.length ? counterexamples.map((sid) => `<a href="#case-${escape(sid)}">${escape(sid.slice(0, 8))}</a>`).join(" · ") : "当前未记录；证据不足时不表示没有反例"}</p>${slicePlot(samples, labels, id)}</section>`;
    })
    .join("");
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(config.name)}</title><style>
  :root{font-family:"Microsoft YaHei",system-ui,sans-serif;color:#243332;background:#f3f2ed;line-height:1.65}body{margin:0 auto;padding:36px 24px 80px;max-width:1120px}h1{font-size:28px;line-height:1.3}h2{font-size:21px}header{border-top:5px solid #276d63;padding:18px 0}section,.case{background:#fff;padding:22px;margin:20px 0;border:1px solid #deded5;border-radius:8px}.muted{font-size:13px;color:#68736e}.stats{display:flex;gap:36px;flex-wrap:wrap}.stats strong{font-size:30px;display:block}summary{cursor:pointer;font-weight:600}summary:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #468f82;outline-offset:3px}.tile.tile{vertical-align:middle;width:40px;max-width:40px;height:auto;aspect-ratio:272/360;flex-shrink:0}.tile-definitions{position:absolute;width:0;height:0;overflow:hidden}.tiles{margin:22px 0;display:flex;flex-wrap:wrap;gap:2px}.draw{margin-left:14px}.rivers .tile.tile{width:26px}.rivers>div{padding:5px 0}.rivers>div>span:first-child{display:inline-block;min-width:100px}.meld{display:inline-block;margin-left:12px}.best{background:#e6f3ed}.case table{min-width:740px}.candidate-hint{display:none}.candidate-table:focus-visible{outline:3px solid #468f82;outline-offset:3px}table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}th,td{border-bottom:1px solid #ddd;padding:8px}td .tile.tile{width:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f6f2;padding:14px;font-size:12px}a{color:#276d63}input{width:min(90%,500px);padding:10px;border:1px solid #889b93;border-radius:4px}svg{max-width:700px;width:100%;font-size:13px}details[open] summary{margin-bottom:20px}@media(max-width:600px){.candidate-hint{display:block}body{padding:20px 12px}.case,section{padding:12px}table{font-size:12px}th,td{padding:4px}.tile.tile{width:30px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  </style>${art.html}<header><p class="muted">QUESTION LAB · 离线研究档案</p><h1>${escape(config.name)}</h1><p>固定 Mortal 版本在已覆盖局面范围内的可观察选择规律。边界解释不代表模型内部原因或因果证明。</p><div class="stats"><div><strong>${samples.length}</strong>${options.maskHoldout ? "可展示合法样本" : "合法样本"}</div><div><strong>${labels.size}</strong>${options.maskHoldout ? "已展示标注" : "已标注"}</div><div><strong>${new Set(allSamples.filter((s) => s.split === "test").map((s) => s.groupId)).size}</strong>独立测试来源组</div><div><strong>${[...labels.values()].filter((l) => l.sensitive).length}</strong>分差敏感</div></div></header>${options.afterHeader ?? ""}
  <section><h2>生成与覆盖</h2><pre>${escape(JSON.stringify(generation, null, 2))}</pre><p>训练／测试按基础牌形来源组隔离。置换牌种和同源变体不能跨组。无稳定边界属于有效研究结果。</p><details><summary>实际可见事实覆盖范围</summary><p>以下仅为成功样本的观测范围；不表示范围内均匀覆盖或每个组合都有样本。</p><table><thead><tr><th>事实</th><th>最小值</th><th>最大值</th><th>不同取值数</th></tr></thead><tbody>${coverage}</tbody></table></details>${combinations ? `<details><summary>模式共同获支持的组合</summary><p>${boundaries?.evaluated ? "最终全部已标注样本" : "仅训练样本"}；计数描述 Mortal 对模式行动集合的支持关系，不表示全局优先级。</p><table><thead><tr><th>获支持组合</th><th>题数</th></tr></thead><tbody>${combinations}</tbody></table></details>` : ""}</section>${tasks}
  <section><h2>局面题目</h2><label for="search">按样本编号或模式筛选</label><p><input id="search" placeholder="输入样本编号或模式名称"></p><p class="muted">点击边界牌例链接会展开对应题目。</p></section>${samples.map((s) => { if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) throw new Error("report_budget_exhausted"); return sampleCard(s, labels.get(s.sampleId), Object.fromEntries(config.hypotheses.map((h) => [h.id, h.name])), options.decorateCase?.(s, labels.get(s.sampleId))); }).join("")}
  <details><summary>共享牌面与许可</summary><p>使用 Coach / Arena 的同一套 B 版牌面，包括一索鸟与赤五。所有图片均已嵌入，可离线查看。</p><p>素材来源：zddd312/mahjong-tiles（7629eeeba620ba9f0a98907bc40c0776523af989）；赤五轮廓另含 lietxia/mahjong_graphic（3e275804ff58325306710bef3a7406860444bc6a）。</p><pre>${escape(art.license)}</pre></details><details><summary>实验与生产者身份</summary><pre>${escape(JSON.stringify({ ...(options.experimentMetadata ?? { name: config.name, seed: config.seed, experiment: config.experiment, budget: config.budget }), producers: (manifest as { identity?: { producers?: unknown } } | null)?.identity?.producers }, null, 2))}</pre><p>完整配置与全知构造见证保留在本地审计档案，未嵌入题面。</p></details><script>document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.case').forEach(x=>x.hidden=!x.dataset.search.toLowerCase().includes(q))});function reveal(){const id=location.hash.slice(1);const el=document.getElementById(id);if(el&&el.classList.contains('case')){el.hidden=false;el.open=true}}addEventListener('hashchange',reveal);reveal();</script></html>`;
  await writeFile(archive.path("report.html"), html, "utf8");
  await archive.write("report-timing.json", {
    schemaVersion: "question-lab-report-timing/v1",
    sampleCount: samples.length,
    tileArtwork: art.identity,
    durationMs: performance.now() - started,
  });
  return archive.path("report.html");
}
