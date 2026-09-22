import type { CoachDesktopApi, FixedReviewDetailDto, FixedReviewSnapshotDto } from "@riichi-coach/contracts";

const ANALYSIS_LABELS = {
  complete: "分析资料完整",
  degraded: "部分局面资料不完整，仍可查看已有证据",
  integrity_failed: "资料完整性检查未通过，请先重新分析牌谱",
} as const;
const REPORT_LABELS = {
  not_generated: "尚未生成教练解说",
  complete: "教练解说已完整生成",
  partial: "部分条目暂时没有解说，证据仍可查看",
  evidence_only: "教练解说暂不可用，确定性证据仍可查看",
} as const;
const EXPLANATION_LABELS = {
  not_generated: "尚未生成",
  ready: "解说可用",
  provider_unavailable: "教练服务尚未配置",
  request_failed: "教练服务暂时不可用",
  invalid_output: "本条解说未通过证据校验",
} as const;
const REASON_LABELS = {
  model_disagreement_above_threshold: "你的选择与模型偏好差异较大",
  no_distinguishable_factor_difference: "候选之间缺少可区分的确定性因素",
} as const;
const TAG_LABELS = { efficiency: "效率", value: "价值", defense: "防守", placement: "顺位", option_value: "选择空间" } as const;
const CONFIDENCE_LABELS = { high: "高", medium: "中", low: "低" } as const;
const WINDOW_LABELS: Readonly<Record<string, string>> = {
  self_turn: "自摸回合", discard_response: "对手打牌响应", kan_response: "杠响应",
  post_call_discard: "副露后打牌", post_riichi_discard: "立直宣言后打牌",
};

function element<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function definition(document: Document, list: HTMLElement, term: string, value: string): void {
  list.append(element(document, "dt", term), element(document, "dd", value));
}

export function createFixedReviewUi(input: {
  document: Document;
  root: HTMLElement;
  api: CoachDesktopApi;
}) {
  let snapshot: FixedReviewSnapshotDto | null = null;
  let operationId: string | null = null;
  const document = input.document;

  const showError = (message: string) => {
    const alert = element(document, "p", message);
    alert.className = "review-alert";
    alert.setAttribute("role", "alert");
    input.root.prepend(alert);
  };

  const renderDetail = (detail: FixedReviewDetailDto) => {
    const section = element(document, "section");
    section.className = "review-detail";
    section.setAttribute("aria-labelledby", "review-detail-heading");
    const heading = element(document, "h3", "条目详情");
    heading.id = "review-detail-heading";
    const comparison = element(document, "div");
    comparison.className = "review-comparison";
    const actual = element(document, "section");
    actual.append(element(document, "h4", "你的选择"), element(document, "p", detail.actual?.label ?? "没有可展示的行动"));
    const mortal = element(document, "section");
    mortal.append(element(document, "h4", "Mortal 偏好"));
    for (const action of detail.mortal) mortal.append(element(document, "p", `${action.label} · ${action.score.toFixed(2)} ${action.scoreUnit}`));
    comparison.append(actual, mortal);
    const coach = element(document, "section");
    coach.className = "review-coach";
    coach.append(element(document, "h4", "教练建议"));
    if (detail.coachJudgments.length === 0) coach.append(element(document, "p", EXPLANATION_LABELS[detail.explanationStatus]));
    for (const judgment of detail.coachJudgments) coach.append(element(document, "p", `${judgment.recommendation.label} · 把握度${CONFIDENCE_LABELS[judgment.confidence]}`));
    for (const explanation of detail.explanations) {
      const paragraph = element(document, "p");
      for (const segment of explanation.segments) paragraph.append(document.createTextNode(segment.text));
      coach.append(paragraph);
    }
    const evidence = element(document, "details");
    evidence.open = true;
    evidence.append(element(document, "summary", "证据摘要"));
    const groups = [
      ["hard_evidence", "确定性证据"], ["advisory_signal", "参考信号"], ["coach_inference", "教练推断"],
    ] as const;
    for (const [category, label] of groups) {
      const items = detail.provenance.filter((item) => item.category === category);
      if (items.length === 0) continue;
      evidence.append(element(document, "h5", label));
      for (const item of items) evidence.append(element(document, "p", `${item.label}：${item.summary}`));
    }
    const metadata = element(document, "details");
    metadata.append(element(document, "summary", "来源信息"));
    for (const item of detail.provenance) metadata.append(element(document, "p", `${item.label} · ${item.producer} ${item.producerVersion} · 来源 ${item.sourceRefs.join("、") || "无上游引用"}`));
    section.append(heading, comparison, coach, evidence, metadata);
    input.root.querySelector(".review-detail")?.remove();
    input.root.append(section);
    heading.tabIndex = -1;
    heading.focus();
  };

  const render = (next: FixedReviewSnapshotDto) => {
    snapshot = next;
    input.root.textContent = "";
    input.root.hidden = false;
    const overview = element(document, "section");
    overview.className = "review-overview";
    overview.setAttribute("aria-labelledby", "review-heading");
    const heading = element(document, "h2", "整盘复盘");
    heading.id = "review-heading";
    const count = element(document, "p", `${next.selection.selectedCount}`);
    count.className = "review-selected-count";
    const countLabel = element(document, "p", "处入选复盘");
    const status = element(document, "dl");
    definition(document, status, "分析状态", ANALYSIS_LABELS[next.analysisStatus]);
    definition(document, status, "教练解说", REPORT_LABELS[next.activeReportStatus]);
    definition(document, status, "可用解说", `${next.explanationCounts.ready} / ${next.selection.selectedCount}`);
    const live = element(document, "p");
    live.className = "review-live";
    live.setAttribute("aria-live", "polite");
    if (next.analysisStatus !== "complete") {
      const warning = element(document, "p", ANALYSIS_LABELS[next.analysisStatus]);
      warning.className = "review-warning";
      overview.append(heading, warning, count, countLabel, status, live);
    } else overview.append(heading, count, countLabel, status, live);
    const goList = element(document, "button", "查看复盘条目");
    goList.type = "button";
    overview.append(goList);
    const analysisDetails = element(document, "details");
    analysisDetails.append(element(document, "summary", "分析结果明细"));
    const outcomeLabels = ["可分析", "行动暂不支持", "无需来源行", "模型没有对应条目", "行动对应不一致", "模型输出不完整", "分析被阻断"];
    Object.values(next.outcomeCounts).forEach((value, index) => analysisDetails.append(element(document, "p", `${outcomeLabels[index]}：${value}`)));
    const explanationDetails = element(document, "details");
    explanationDetails.append(element(document, "summary", "解说状态明细"));
    explanationDetails.append(
      element(document, "p", `可用：${next.explanationCounts.ready}`),
      element(document, "p", `服务未配置：${next.explanationCounts.provider_unavailable}`),
      element(document, "p", `请求未完成：${next.explanationCounts.request_failed}`),
      element(document, "p", `证据校验未通过：${next.explanationCounts.invalid_output}`),
    );
    overview.append(analysisDetails, explanationDetails);
    if (next.activeReportRefId === null) {
      const generate = element(document, "button", "生成教练解说");
      generate.type = "button";
      generate.addEventListener("click", () => void (async () => {
        generate.disabled = true;
        live.textContent = "正在生成教练解说…";
        operationId = globalThis.crypto.randomUUID();
        try {
          const result = await input.api.generateReview({ packageId: next.packageId, operationId });
          if (result.status === "ready") render(result.snapshot);
          else showError("本次解说未生成，当前证据和已有内容保持不变。你可以稍后再试。");
        } catch { showError("本次操作未完成，请稍后再试。"); }
        finally { operationId = null; generate.disabled = false; }
      })());
      overview.append(generate);
    }
    const list = element(document, "section");
    list.className = "review-list";
    list.hidden = true;
    list.append(element(document, "h3", "复盘条目"));
    if (next.selection.items.length === 0) list.append(element(document, "p", "当前策略未选出复盘条目。这不代表本局没有失误。"));
    else {
      const table = element(document, "table");
      const header = element(document, "tr");
      for (const label of ["顺序", "局面", "你的选择", "Mortal 偏好", "分差", "入选原因 / 标签", "解说"]) header.append(element(document, "th", label));
      const head = element(document, "thead"); head.append(header); table.append(head);
      const body = element(document, "tbody");
      for (const item of next.selection.items) {
        const row = element(document, "tr");
        const open = element(document, "button", `第 ${item.rank} 条`);
        open.type = "button";
        open.addEventListener("click", () => void input.api.getReviewDetail({ packageId: next.packageId, decisionId: item.decisionId, activeReportRefId: next.activeReportRefId }).then(renderDetail).catch(() => showError("无法打开这条复盘，请返回后重试。")));
        const first = element(document, "td"); first.append(open);
        row.append(
          first,
          element(document, "td", `第 ${item.roundOrdinal + 1} 局 · ${WINDOW_LABELS[item.decisionWindowKind] ?? "决策窗口"}`),
          element(document, "td", item.actualAction?.label ?? "无"),
          element(document, "td", item.mortalPreferredActions.map((action) => `${action.label} ${action.score.toFixed(2)}`).join(" / ")),
          element(document, "td", item.errorGap.toFixed(2)),
          element(document, "td", `${REASON_LABELS[item.selectionReason]} · ${item.tags.map((tag) => TAG_LABELS[tag]).join("、") || "无显著差异轴"}`),
          element(document, "td", EXPLANATION_LABELS[item.explanationStatus]),
        );
        body.append(row);
      }
      table.append(body); list.append(table);
    }
    goList.addEventListener("click", () => { list.hidden = false; list.querySelector<HTMLElement>("button, h3")?.focus(); });
    input.root.append(overview, list);
  };

  return Object.freeze({
    async open(packageId: string) { render(await input.api.openReview({ packageId })); },
    async leave() {
      if (snapshot === null) return;
      if (operationId !== null) await input.api.cancelGeneration({ operationId });
      await input.api.leaveReview({ packageId: snapshot.packageId });
      snapshot = null; operationId = null; input.root.textContent = ""; input.root.hidden = true;
    },
  });
}
