import type { CoachDesktopApi, FixedReviewDetailDto, FixedReviewSnapshotDto } from "@riichi-coach/contracts";

const ANALYSIS_LABELS = {
  complete: "决策比较齐全",
  degraded: "部分决策未作完整比较",
  integrity_failed: "分析来源完整性未通过校验",
} as const;
const REPORT_LABELS = {
  not_generated: "尚未生成教练解说",
  complete: "入选条目的解说齐全",
  partial: "部分解说可用",
  evidence_only: "仅证据可用",
} as const;
const EXPLANATION_LABELS = {
  not_generated: "尚未生成教练解说",
  ready: "解说可用",
  provider_unavailable: "解说服务未就绪",
  request_failed: "解说请求未成功",
  invalid_output: "解说未通过校验",
} as const;
const REASON_LABELS = {
  model_disagreement_above_threshold: "你的选择与模型偏好差异较大",
  no_distinguishable_factor_difference: "候选之间缺少可区分的确定性因素",
} as const;
const TAG_LABELS = { efficiency: "效率", value: "价值", defense: "防守", placement: "顺位", option_value: "选择空间" } as const;
const CONFIDENCE_LABELS = { high: "高", medium: "中", low: "低" } as const;
const AUTHORITY_LABELS = { hard: "确定性证据", advisory: "参考信号", model: "模型评估", coach: "教练推断", structural: "结构引用" } as const;
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
  onReportGenerated?: () => void;
}) {
  let snapshot: FixedReviewSnapshotDto | null = null;
  let operationId: string | null = null;
  let currentPackageId: string | null = null;
  let viewEpoch = 0;
  const document = input.document;
  const isCurrent = (epoch: number, packageId: string) =>
    viewEpoch === epoch && currentPackageId === packageId;

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
    for (const action of detail.mortal) mortal.append(element(document, "p", `${action.label} · ${action.score.toFixed(2)} ${action.scoreUnit} · 评分口径：${action.scoreMethodLabel}`));
    comparison.append(actual, mortal);
    const coach = element(document, "section");
    coach.className = "review-coach";
    coach.append(element(document, "h4", "教练建议"));
    if (detail.coachJudgments.length === 0) coach.append(element(document, "p", EXPLANATION_LABELS[detail.explanationStatus]));
    const evidenceTargets = new Map<string, HTMLElement>();
    const revealEvidenceTarget = (ref: string) => {
      const target = evidenceTargets.get(ref);
      if (target === undefined) return;
      let ancestor = target.parentElement;
      while (ancestor !== null && ancestor !== undefined) {
        if (ancestor.tagName === "DETAILS") (ancestor as HTMLDetailsElement).open = true;
        ancestor = ancestor.parentElement;
      }
      target.focus();
    };
    const evidenceButton = (ref: string, label: string) => {
      const button = element(document, "button", label);
      button.type = "button";
      button.addEventListener("click", () => revealEvidenceTarget(ref));
      return button;
    };
    if (detail.referenceTargets.length > 0) {
      const references = element(document, "section");
      references.className = "review-reference-targets";
      references.append(element(document, "h4", "判断引用目标"));
      for (const item of detail.referenceTargets) {
        const card = element(document, "article");
        card.tabIndex = -1;
        evidenceTargets.set(item.displayRef, card);
        card.append(element(document, "p", `${AUTHORITY_LABELS[item.authority]} · ${item.label}${item.relatedAction === null ? "" : `（${item.relatedAction.label}）`}：${item.summary}`));
        references.append(card);
      }
      comparison.append(references);
    }
    for (const judgment of detail.coachJudgments) {
      const paragraph = element(document, "p", `${judgment.recommendation.label} · 把握度${CONFIDENCE_LABELS[judgment.confidence]} `);
      for (const ref of judgment.premiseRefs) paragraph.append(evidenceButton(ref, "查看判断依据"));
      coach.append(paragraph);
    }
    for (const explanation of detail.explanations) {
      const paragraph = element(document, "p");
      for (const segment of explanation.segments) paragraph.append(document.createTextNode(segment.text));
      for (const ref of explanation.evidenceRefs) paragraph.append(document.createTextNode(" "), evidenceButton(ref, "查看解说证据"));
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
      for (const item of items) {
        const card = element(document, "article");
        card.tabIndex = -1;
        evidenceTargets.set(item.displayRef, card);
        card.append(element(document, "p", `${item.label}${item.relatedAction === null ? "" : `（${item.relatedAction.label}）`}：${item.summary}`));
        for (const detailItem of item.details) {
          const line = element(document, "p", `${detailItem.label}${detailItem.scope === null ? "" : ` · ${detailItem.scope}`}：${detailItem.value}`);
          if (detailItem.tiles.length > 0) line.append(document.createTextNode(`（${detailItem.tiles.map((tile) => `${tile.tile} ${tile.count === null ? "剩余张数未知" : `${tile.count} 张`}`).join("、")}）`));
          card.append(line);
        }
        evidence.append(card);
      }
    }
    const metadata = element(document, "details");
    metadata.append(element(document, "summary", "来源信息"));
    for (const item of detail.provenance) {
      const line = element(document, "p", `${item.label} · ${item.producer} ${item.producerVersion} · 来源 ${item.sourceRefs.join("、") || "无上游引用"}`);
      for (const ref of item.parentRefs) line.append(document.createTextNode(" "), evidenceButton(ref, "查看父项"));
      metadata.append(line);
    }
    section.append(heading, comparison, coach, evidence, metadata);
    input.root.querySelector(".review-detail")?.remove();
    input.root.append(section);
    heading.tabIndex = -1;
    heading.focus();
  };

  const render = (next: FixedReviewSnapshotDto, focusReviewEntry = false) => {
    snapshot = next;
    currentPackageId = next.packageId;
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
    const usage = element(document, "section");
    usage.className = "coach-token-usage";
    usage.append(element(document, "h3", "教练 Token 用量"));
    const tokenFields = element(document, "dl");
    const tokenLabel = (value: number | undefined) => value === undefined ? "未知" : value.toLocaleString("zh-CN");
    definition(document, tokenFields, "输入", tokenLabel(next.coachUsage?.inputTokens));
    definition(document, tokenFields, "输出", tokenLabel(next.coachUsage?.outputTokens));
    definition(document, tokenFields, "总量", tokenLabel(next.coachUsage?.totalTokens));
    definition(document, tokenFields, "缓存输入（已包含在输入中）", tokenLabel(next.coachUsage?.cachedInputTokens));
    if (next.coachProvider != null) usage.append(element(document, "p", `模型：${next.coachProvider.model}${next.coachProvider.reasoningEffort === undefined ? "" : ` · 推理强度 ${next.coachProvider.reasoningEffort}`}`));
    usage.append(tokenFields, element(document, "p", next.activeReportRefId === null
      ? "尚未生成；服务返回用量后显示，随报告保存。"
      : "本报告请求的服务返回用量。未返回统计的失败或重试可能不包含；这不是账号剩余额度。"));
    const live = element(document, "p");
    live.className = "review-live";
    live.setAttribute("aria-live", "polite");
    if (next.analysisStatus !== "complete") {
      const degradedReasons = [
        next.outcomeCounts.source_row_not_expected > 0 ? `只有一种候选，无需模型比较（${next.outcomeCounts.source_row_not_expected} 处）` : null,
        next.outcomeCounts.unsupported_action > 0 ? `暂不支持的行动 ${next.outcomeCounts.unsupported_action} 处` : null,
        next.outcomeCounts.no_mortal_entry > 0 ? `缺少对应的模型分析 ${next.outcomeCounts.no_mortal_entry} 处` : null,
        next.outcomeCounts.binding_mismatch > 0 ? `模型分析与决策对应关系未通过校验 ${next.outcomeCounts.binding_mismatch} 处` : null,
        next.outcomeCounts.model_output_incomplete > 0 ? `模型分析不完整 ${next.outcomeCounts.model_output_incomplete} 处` : null,
        next.outcomeCounts.analysis_blocked > 0 ? `分析条件未满足 ${next.outcomeCounts.analysis_blocked} 处` : null,
      ].filter((reason): reason is string => reason !== null);
      const warning = element(document, "p", `${ANALYSIS_LABELS[next.analysisStatus]}。${degradedReasons.join("；")}`);
      warning.className = "review-warning";
      overview.append(heading, warning, count, countLabel, status, live);
    } else overview.append(heading, count, countLabel, status, live);
    const goList = element(document, "button", "查看复盘条目");
    goList.type = "button";
    overview.append(goList);
    const analysisDetails = element(document, "details");
    analysisDetails.append(element(document, "summary", "分析结果明细"));
    const outcomeLabels = ["可作决策比较", "暂不支持的行动", "单一候选，无需模型比较", "缺少对应的模型分析", "模型分析与决策对应关系未通过校验", "模型分析不完整", "分析条件未满足"];
    Object.values(next.outcomeCounts).forEach((value, index) => analysisDetails.append(element(document, "p", `${outcomeLabels[index]}：${value}`)));
    const explanationDetails = element(document, "details");
    explanationDetails.append(element(document, "summary", "解说状态明细"));
    explanationDetails.append(
      element(document, "p", `可用：${next.explanationCounts.ready}`),
      element(document, "p", `解说服务未就绪：${next.explanationCounts.provider_unavailable}`),
      element(document, "p", `解说请求未成功：${next.explanationCounts.request_failed}`),
      element(document, "p", `解说未通过校验：${next.explanationCounts.invalid_output}`),
    );
    overview.append(analysisDetails, explanationDetails);
    overview.append(usage);
    if (next.activeReportRefId === null) {
      const settingsCard = element(document, "details");
      settingsCard.className = "coach-settings";
      settingsCard.append(element(document, "summary", "教练服务设置"));
      const provider = element(document, "select");
      provider.id = "coach-provider-kind";
      for (const [value, label] of [["codex-cli", "本机 Codex 登录 · gpt-6-luna · max"], ["openai-compatible", "OpenAI-compatible 服务"]] as const) {
        const option = element(document, "option", label); option.value = value; provider.append(option);
      }
      const providerLabel = element(document, "label", "解说服务 "); providerLabel.htmlFor = provider.id; providerLabel.append(provider);
      const apiFields = element(document, "div"); apiFields.hidden = true;
      const address = element(document, "input"); address.id = "coach-base-url"; address.type = "url";
      address.placeholder = "https://服务地址/v1";
      const model = element(document, "input"); model.id = "coach-model-name"; model.placeholder = "模型名称";
      const addressLabel = element(document, "label", "服务地址 "); addressLabel.htmlFor = address.id; addressLabel.append(address);
      const modelLabel = element(document, "label", "模型名称 "); modelLabel.htmlFor = model.id; modelLabel.append(model);
      const importKey = element(document, "button", "从本机环境导入 API key"); importKey.type = "button";
      apiFields.append(addressLabel, modelLabel, element(document, "p", "API key 通过启动环境 RIICHI_COACH_API_KEY 安全导入，不在页面输入或显示。"), importKey);
      let settingsEdited = false;
      provider.addEventListener("change", () => { settingsEdited = true; apiFields.hidden = provider.value !== "openai-compatible"; });
      address.addEventListener("input", () => { settingsEdited = true; });
      model.addEventListener("input", () => { settingsEdited = true; });
      const configStatus = element(document, "p", "正在检查教练服务…"); configStatus.setAttribute("aria-live", "polite");
      const save = element(document, "button", "保存教练设置"); save.type = "button"; save.className = "coach-config-save";
      settingsCard.append(providerLabel, element(document, "p", "Codex 使用本机已有登录；生成在云端进行并消耗该账号额度。仅点击生成后才请求解说。"), apiFields, save, configStatus);
      overview.append(settingsCard);
      const generate = element(document, "button", "生成教练解说");
      generate.type = "button";
      const renderEpoch = viewEpoch;
      const currentCard = () => isCurrent(renderEpoch, next.packageId) && snapshot === next;
      const applyProviderStatus = (value: Awaited<ReturnType<CoachDesktopApi["status"]>>, populate = false) => {
        if (!currentCard()) return;
        if (populate && !settingsEdited && value.settings !== null) {
          provider.value = "providerId" in value.settings ? "codex-cli" : "openai-compatible";
          if (!("providerId" in value.settings)) { address.value = value.settings.baseUrl; model.value = value.settings.modelName; }
          apiFields.hidden = provider.value !== "openai-compatible";
        }
        configStatus.textContent = value.configured ? "教练服务已就绪。" : "教练服务未就绪。Codex 请先完成本机登录；其它服务请保存地址、模型并导入凭据。";
        if (!value.configured) settingsCard.open = true;
      };
      void input.api.status().then(value => applyProviderStatus(value, true)).catch(() => {
        if (currentCard()) { settingsCard.open = true; configStatus.textContent = "无法检查教练服务，请稍后重试。"; }
      });
      save.addEventListener("click", () => void (async () => {
        save.disabled = true;
        try {
          const value = await input.api.configure(provider.value === "codex-cli"
            ? { providerId: "codex-cli", modelName: "gpt-6-luna", reasoningEffort: "max" }
            : { baseUrl: address.value.trim(), modelName: model.value.trim() });
          applyProviderStatus(value);
        } catch { if (currentCard()) configStatus.textContent = "设置未保存，请检查服务地址和模型名称。"; }
        finally { if (currentCard()) save.disabled = false; }
      })());
      importKey.addEventListener("click", () => void (async () => {
        importKey.disabled = true;
        try { applyProviderStatus(await input.api.importCredential()); }
        catch { if (currentCard()) configStatus.textContent = "凭据未导入，请检查本机启动环境。"; }
        finally { if (currentCard()) importKey.disabled = false; }
      })());
      generate.addEventListener("click", () => void (async () => {
        generate.disabled = true;
        save.disabled = true; importKey.disabled = true;
        live.textContent = "正在检查教练服务…";
        const requestEpoch = viewEpoch;
        const requestPackageId = next.packageId;
        const requestOperationId = globalThis.crypto.randomUUID();
        operationId = requestOperationId;
        try {
          const readiness = await input.api.status();
          if (!isCurrent(requestEpoch, requestPackageId) || operationId !== requestOperationId) return;
          applyProviderStatus(readiness);
          if (!readiness.configured) { live.textContent = "请先配置就绪的教练服务，再生成解说。"; return; }
          live.textContent = "正在生成教练解说；等待解说和 Token 统计…";
          const result = await input.api.generateReview({ packageId: requestPackageId, operationId: requestOperationId });
          if (!isCurrent(requestEpoch, requestPackageId) || operationId !== requestOperationId) return;
          if (result.status === "ready") {
            render(result.snapshot, true);
            input.onReportGenerated?.();
          }
          else {
            live.textContent = "教练解说未生成，可以稍后重试。";
            showError("本次解说未生成，当前证据和已有内容保持不变。你可以稍后再试。");
          }
        } catch {
          if (isCurrent(requestEpoch, requestPackageId) && operationId === requestOperationId) {
            live.textContent = "教练解说未生成，可以稍后重试。";
            showError("本次操作未完成，请稍后再试。");
          }
        } finally {
          if (isCurrent(requestEpoch, requestPackageId) && operationId === requestOperationId) {
            operationId = null;
            generate.disabled = false;
            save.disabled = false; importKey.disabled = false;
          }
        }
      })());
      overview.append(generate);
    }
    const list = element(document, "section");
    list.className = "review-list";
    list.hidden = true;
    const listHeading = element(document, "h3", "复盘条目");
    listHeading.tabIndex = -1;
    list.append(listHeading);
    if (next.selection.items.length === 0) list.append(element(document, "p", "当前策略未选出复盘条目。这不代表本局没有失误。"));
    else {
      const table = element(document, "table");
      const header = element(document, "tr");
      for (const label of ["局况 / 决策窗口", "我的行动", "Mortal 偏好", "模型分差 / 固定入选原因", "差异维度", "解说状态 / 详情"]) header.append(element(document, "th", label));
      const head = element(document, "thead"); head.append(header); table.append(head);
      const body = element(document, "tbody");
      for (const item of next.selection.items) {
        const row = element(document, "tr");
        row.setAttribute("data-decision-id", item.decisionId);
        const open = element(document, "button", "查看详情");
        open.type = "button";
        open.addEventListener("click", () => void (async () => {
          const requestEpoch = viewEpoch;
          try {
            const detail = await input.api.getReviewDetail({ packageId: next.packageId, decisionId: item.decisionId, activeReportRefId: next.activeReportRefId });
            if (isCurrent(requestEpoch, next.packageId) && snapshot?.activeReportRefId === next.activeReportRefId) renderDetail(detail);
          } catch {
            if (isCurrent(requestEpoch, next.packageId)) showError("无法打开这条复盘，请返回后重试。");
          }
        })());
        const last = element(document, "td", `${EXPLANATION_LABELS[item.explanationStatus]} `); last.append(open);
        row.append(
          element(document, "td", `第 ${item.rank} 条 · 第 ${item.roundOrdinal + 1} 局 · ${WINDOW_LABELS[item.decisionWindowKind] ?? "决策窗口"}`),
          element(document, "td", item.actualAction?.label ?? "无"),
          element(document, "td", item.mortalPreferredActions.map((action) => `${action.label} ${action.score.toFixed(2)}`).join(" / ")),
          element(document, "td", `${item.errorGap.toFixed(2)} · ${REASON_LABELS[item.selectionReason]}`),
          element(document, "td", item.tags.map((tag) => TAG_LABELS[tag]).join("、") || "无显著差异轴"),
          last,
        );
        body.append(row);
      }
      table.append(body); list.append(table);
    }
    goList.addEventListener("click", () => { list.hidden = false; list.querySelector<HTMLElement>("button, h3")?.focus(); });
    input.root.append(overview, list);
    if (focusReviewEntry) goList.focus();
  };

  const renderOpenState = (message: string, role: "status" | "alert") => {
    input.root.textContent = "";
    input.root.hidden = false;
    const state = element(document, "p", message);
    state.className = role === "status" ? "review-loading" : "review-alert";
    state.setAttribute("role", role);
    state.setAttribute("aria-live", role === "status" ? "polite" : "assertive");
    input.root.append(state);
  };

  return Object.freeze({
    async open(packageId: string) {
      const epoch = ++viewEpoch;
      const previousPackageId = currentPackageId;
      const previousOperationId = operationId;
      currentPackageId = packageId;
      operationId = null;
      snapshot = null;
      renderOpenState("正在打开整盘复盘…", "status");
      try {
        if (previousOperationId !== null) await input.api.cancelGeneration({ operationId: previousOperationId });
        if (previousPackageId !== null) await input.api.leaveReview({ packageId: previousPackageId });
        const next = await input.api.openReview({ packageId });
        if (isCurrent(epoch, packageId)) render(next);
      } catch {
        if (isCurrent(epoch, packageId)) {
          snapshot = null;
          operationId = null;
          currentPackageId = null;
          renderOpenState("无法打开整盘复盘，请稍后再试。", "alert");
        }
        throw new Error("review_unavailable");
      }
    },
    async leave() {
      const packageId = currentPackageId;
      const cancelledOperationId = operationId;
      viewEpoch += 1;
      snapshot = null;
      operationId = null;
      currentPackageId = null;
      input.root.textContent = "";
      input.root.hidden = true;
      if (cancelledOperationId !== null) await input.api.cancelGeneration({ operationId: cancelledOperationId });
      if (packageId !== null) await input.api.leaveReview({ packageId });
    },
  });
}
