const { app } = require("electron");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const CRASH_CHILD = process.argv.includes("--crash-after-report-save");
const OFFLINE_REAL_CHILD = process.argv.includes("--offline-reopen-real");

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

function semanticHash(value) {
  const decisions = value.decisions.map((decision) => decision.outcome === "analysis_ready"
    ? { ...decision, modelEvaluation: { ...decision.modelEvaluation, detailPolicy: { ...decision.modelEvaluation.detailPolicy, frozenAt: null } } }
    : decision);
  return `sha256:${createHash("sha256").update(canonical({
    analysisKey: value.analysisKey,
    record: value.record,
    componentVersions: value.componentVersions,
    analysisPolicy: value.analysisPolicy,
    decisions,
    evidenceRegistry: value.evidenceRegistry,
  })).digest("hex")}`;
}

async function fixtures() {
  const contracts = await import("@riichi-coach/contracts");
  const reasoning = await import("@riichi-coach/reasoning");
  const fixture = contracts.StructuredAnalysisPackageSchema.parse(JSON.parse(
    readFileSync(join(__dirname, "fixtures", "coach-package.json"), "utf8"),
  ));
  const selection = reasoning.selectReviewDecisions(fixture);
  const graph = reasoning.projectContextGraph(fixture);
  const makeComplete = async (variant) => reasoning.generateReviewReport(graph, selection, {
    descriptor: () => ({ providerId: "electron-stub", model: `fixture-${variant}` }),
    complete: async () => ({
      content: JSON.stringify({ decisions: selection.selected.map(({ decisionId }, index) => {
        const nodes = graph.nodes.filter((node) => node.payload?.decisionId === decisionId);
        const candidates = nodes.filter((node) => node.nodeKind === "CandidateAction");
        const premise = nodes.find((node) => node.nodeKind === "KnownGameFact");
        const difference = nodes.find((node) => node.nodeKind === "FactorDifference");
        if (candidates.length === 0 || premise === undefined || difference === undefined) throw new Error("electron fixture missing graph evidence");
        return {
          decisionId,
          judgment: {
            localId: `judgment-${index}`,
            recommendation: candidates[variant === "a" ? 0 : Math.min(1, candidates.length - 1)].payload.actionRef,
            confidence: "medium",
            premiseRefs: [premise.nodeId],
          },
          explanations: [{
            text: variant === "a" ? "A：保留这条可审计差异。" : "B：采用另一条可审计判断。",
            claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }],
            judgmentLocalRef: `judgment-${index}`,
          }],
        };
      }) }),
      transportRetries: 0,
    }),
  }, variant === "a" ? "2026-09-23T00:00:00.000Z" : "2026-09-23T00:01:00.000Z");
  const evidenceOnly = await reasoning.generateReviewReport(graph, selection, {
    descriptor: () => ({ providerId: "unconfigured", model: "unconfigured" }),
    complete: async () => ({ errorCode: "provider_unavailable", transportRetries: 0 }),
  }, "2026-09-23T00:02:00.000Z");
  const partialFixture = structuredClone(fixture);
  const readyClone = structuredClone(partialFixture.decisions[0]);
  readyClone.decisionId = ["decision", partialFixture.record.recordId, `self${partialFixture.record.selfActor}`, "self", "post_riichi_discard", readyClone.normalizedDecisionContext.triggerEventRef].join(":");
  readyClone.normalizedDecisionContext.decisionWindowKind = "post_riichi_discard";
  readyClone.knownGameFacts.decisionWindow.kind = "post_riichi_discard";
  readyClone.comparisonSet.decisionWindow.kind = "post_riichi_discard";
  partialFixture.decisions.push(readyClone);
  partialFixture.semanticContentHash = semanticHash(partialFixture);
  reasoning.validateStructuredAnalysisPackage(partialFixture);
  const partialSelection = {
    policyVersion: "deterministic-review-selector/v1",
    analysisPackageId: partialFixture.packageId,
    analysisPackageStatus: partialFixture.record.status,
    selected: partialFixture.decisions.slice(0, 2).map((decision, index) => ({
      decisionId: decision.decisionId,
      rank: index + 1,
      selectionReason: "model_disagreement_above_threshold",
    })),
  };
  const partialGraph = reasoning.projectContextGraph(partialFixture);
  const partial = await reasoning.generateReviewReport(partialGraph, partialSelection, {
    descriptor: () => ({ providerId: "electron-stub", model: "partial" }),
    complete: async () => {
      const decisionId = partialSelection.selected[0].decisionId;
      const nodes = partialGraph.nodes.filter((node) => node.payload?.decisionId === decisionId);
      const candidate = nodes.find((node) => node.nodeKind === "CandidateAction");
      const premise = nodes.find((node) => node.nodeKind === "KnownGameFact");
      const difference = nodes.find((node) => node.nodeKind === "FactorDifference");
      return { content: JSON.stringify({ decisions: [{
        decisionId,
        judgment: { localId: "judgment-partial", recommendation: candidate.payload.actionRef, confidence: "medium", premiseRefs: [premise.nodeId] },
        explanations: [{ text: "仅第一条生成解说。", claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }], judgmentLocalRef: "judgment-partial" }],
      }] }), transportRetries: 0 };
    },
  }, "2026-09-23T00:03:00.000Z");
  return { fixture, selection, completeA: await makeComplete("a"), completeB: await makeComplete("b"), evidenceOnly, partialFixture, partialSelection, partial };
}

async function realProductionPackage() {
  const contracts = await import("@riichi-coach/contracts");
  const mortal = await import("@riichi-coach/mortal-source");
  const reasoning = await import("@riichi-coach/reasoning");
  const bridge = await import("../../reasoning/dist/import/legacy-event-stream-bridge.js");
  const raw = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json"), "utf8"));
  const imported = reasoning.importRegressionFixture(raw);
  const bridged = bridge.bridgeLegacyRegressionEvents(imported.events, imported.selfActor, {
    sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9",
  });
  if (bridged.status !== "ready") throw new Error(`real production bridge failed: ${bridged.code}`);
  const stream = bridged.stream;
  const decisions = reasoning.replayCanonicalStream(stream);
  const responseDecisions = reasoning.replayCanonicalResponseWindows(stream);
  const entries = raw.decisions.map((entry) => Object.freeze({
    roundOrdinal: 0, roundWind: "E", dealer: 0, kyoku: 0, honba: 0,
    junme: entry.junme, tilesLeft: 46, lastActor: 3, tile: entry.tile,
    tehai: Object.freeze([...entry.state.tehai]), fuuros: Object.freeze([]),
    atSelfChiPon: false, atSelfRiichi: false, atOpponentKakan: false,
    expected: { ...entry.expected }, actual: { ...entry.actual }, isEqual: entry.is_equal,
    details: Object.freeze(entry.details.map((detail) => ({
      action: { ...detail.action }, probability: detail.prob, qValue: detail.q_value,
    }))),
    shanten: entry.shanten, atFuriten: entry.at_furiten, actualIndex: entry.actual_index,
  }));
  const report = Object.freeze({
    reportId: raw.source.reportId, adapterVersion: "mortal-source/2", engine: "Mortal",
    version: "1.5.10", modelTag: raw.source.modelTag, playerId: raw.source.playerId,
    gameFingerprint: mortal.computeMortalGameFingerprint(raw.mjaiLog),
    kyokus: Object.freeze([{ roundOrdinal: 0, roundWind: "E", dealer: 0, kyoku: 0, honba: 0, entries: Object.freeze(entries) }]),
  });
  const engine = new reasoning.JsonlFactEngineClient(new reasoning.ManagedFactEngineTransport(join(__dirname, "../../../resources")));
  let review;
  try {
    review = await reasoning.runMortalFullGameReview({
      stream, decisions, responseDecisions, report, engine,
      now: () => Date.parse("2026-09-23T00:10:00.000Z"),
      coverageRegistry: reasoning.createMortalCoverageRegistry(reasoning.MORTAL_COVERAGE_BRANCHES),
    });
  } finally { await engine.close(); }
  if (review.status !== "coverage_ready") throw new Error(`real production review failed: ${review.code}`);
  const retained = review.retainedAnalyses[0];
  const pkg = reasoning.buildStructuredAnalysisPackage({
    review, stream, decisions, responseDecisions,
    componentVersions: {
      packageSchema: contracts.STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
      canonicalReplay: "canonical-riichi-events/v2", mapperAdapter: "legacy-regression-bridge/v2",
      factEngine: {
        engine: "mahjong-helper", upstreamCommit: contracts.MAHJONG_HELPER_COMMIT,
        adapterVersion: contracts.FACT_ENGINE_ADAPTER_VERSION,
        protocolVersion: contracts.FACT_ENGINE_PROTOCOL_VERSION,
      },
      factorPipeline: "factor-pipeline/v1",
      mortalSourceModel: { identity: contracts.MORTAL_PROVIDER_IDENTITY, version: "mortal-source/2", modelTag: raw.source.modelTag },
    },
    frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
    now: () => Date.parse("2026-09-23T00:10:00.000Z"),
  });
  reasoning.validateStructuredAnalysisPackage(pkg);
  return pkg;
}

async function stubReportFor(pkg) {
  const reasoning = await import("@riichi-coach/reasoning");
  const selection = reasoning.selectReviewDecisions(pkg);
  const graph = reasoning.projectContextGraph(pkg);
  return reasoning.generateReviewReport(graph, selection, {
    descriptor: () => ({ providerId: "electron-stub", model: "real-fixture" }),
    complete: async () => ({
      content: JSON.stringify({ decisions: selection.selected.map(({ decisionId }, index) => {
        const nodes = graph.nodes.filter((node) => node.payload?.decisionId === decisionId);
        const candidate = nodes.find((node) => node.nodeKind === "CandidateAction");
        const premise = nodes.find((node) => node.nodeKind === "KnownGameFact");
        const difference = nodes.find((node) => node.nodeKind === "FactorDifference");
        if (!candidate || !premise || !difference) throw new Error("real package lacks grounded review evidence");
        return {
          decisionId,
          judgment: { localId: `real-judgment-${index}`, recommendation: candidate.payload.actionRef, confidence: "medium", premiseRefs: [premise.nodeId] },
          explanations: [{ text: "这条判断由同一真实牌谱的可审计差异支持。", claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }], judgmentLocalRef: `real-judgment-${index}` }],
        };
      }) }),
      transportRetries: 0,
    }),
  }, "2026-09-23T00:11:00.000Z");
}

app.whenReady().then(async () => {
  const { createReviewSessionRepository } = await import("../dist/review-session-repository.js");
  const root = process.env.RIICHI_ELECTRON_PERSISTENCE_ROOT || mkdtempSync(join(tmpdir(), "riichi-electron-sqlite-"));

  if (OFFLINE_REAL_CHILD) {
    const { createFixedReviewController } = await import("../dist/fixed-review-controller.js");
    const expected = JSON.parse(readFileSync(join(root, "real-expected.json"), "utf8"));
    let networkRequests = 0;
    let llmRequests = 0;
    globalThis.fetch = async () => { networkRequests += 1; throw new Error("offline_network_blocked"); };
    const repository = createReviewSessionRepository({ root });
    const controller = createFixedReviewController({
      readPackage: async () => { networkRequests += 1; throw new Error("offline_source_blocked"); },
      generateReport: async () => { llmRequests += 1; throw new Error("offline_llm_blocked"); },
      repository,
    });
    const snapshot = await controller.openReview(expected.packageId);
    const detail = controller.getReviewDetail(expected.packageId, expected.decisionId, snapshot.activeReportRefId);
    const sessions = repository.listSessions();
    if (JSON.stringify(snapshot) !== JSON.stringify(expected.snapshot)
      || JSON.stringify(detail) !== JSON.stringify(expected.detail)
      || JSON.stringify(sessions) !== JSON.stringify(expected.sessions)) {
      throw new Error("real offline Overview/List/Detail read-back mismatch");
    }
    if (networkRequests !== 0 || llmRequests !== 0) throw new Error(`offline request leak network=${networkRequests} llm=${llmRequests}`);
    repository.close();
    console.log("[electron-persistence] real-offline PASS network=0 llm=0");
    app.exit(0);
    return;
  }

  if (CRASH_CHILD) {
    const { fixture, selection, completeA } = await fixtures();
    const repository = createReviewSessionRepository({
      root,
      createId: () => "electron-session",
      beforeActivationReadBack: () => process.abort(),
    });
    repository.saveSession(fixture, selection);
    repository.saveReport(fixture.packageId, completeA, "electron-report-a", "electron-operation-a");
    app.exit(99);
    return;
  }

  let exitCode = 1;
  try {
    const { fixture, selection, completeA, completeB, evidenceOnly, partialFixture, partialSelection, partial } = await fixtures();
    const crash = spawnSync(process.execPath, [__filename, "--crash-after-report-save"], {
      env: { ...process.env, RIICHI_ELECTRON_PERSISTENCE_ROOT: root },
      stdio: "pipe",
      timeout: 30_000,
    });
    if (crash.status === 0) throw new Error("crash child unexpectedly exited cleanly");

    let repository = createReviewSessionRepository({ root });
    let state = repository.openByPackageId(fixture.packageId);
    if (state.activeReportRefId !== "electron-report-a" || state.activeReport?.reportId !== completeA.reportId) {
      throw new Error("electron kill/WAL recovery mismatch");
    }
    repository.saveReport(fixture.packageId, completeB, "electron-report-b", "electron-operation-b");
    repository.activateExisting(fixture.packageId, "electron-report-a", "electron-activate-a");
    repository.close();

    repository = createReviewSessionRepository({ root });
    state = repository.openByPackageId(fixture.packageId);
    if (state.activeReportRefId !== "electron-report-a" || JSON.stringify(state.activeReport) !== JSON.stringify(completeA)) {
      throw new Error("different-content A-to-B-to-A isolation mismatch");
    }
    repository.close();

    const partialRoot = mkdtempSync(join(tmpdir(), "riichi-electron-partial-"));
    const partialRepository = createReviewSessionRepository({ root: partialRoot, createId: () => "electron-partial" });
    partialRepository.saveSession(partialFixture, partialSelection);
    partialRepository.saveReport(partialFixture.packageId, partial, "electron-partial", "electron-partial-operation");
    partialRepository.close();
    const partialReopen = createReviewSessionRepository({ root: partialRoot });
    if (partialReopen.openByPackageId(partialFixture.packageId).activeReport?.generationStatus !== "partial") {
      throw new Error("partial offline read-back mismatch");
    }
    partialReopen.close();
    rmSync(partialRoot, { recursive: true, force: true });

    const evidenceRoot = mkdtempSync(join(tmpdir(), "riichi-electron-evidence-"));
    const evidence = createReviewSessionRepository({ root: evidenceRoot, createId: () => "electron-evidence" });
    evidence.saveSession(fixture, selection);
    evidence.saveReport(fixture.packageId, evidenceOnly, "electron-evidence-only", "electron-evidence-operation");
    evidence.close();
    const evidenceReopen = createReviewSessionRepository({ root: evidenceRoot });
    if (evidenceReopen.openByPackageId(fixture.packageId).activeReport?.generationStatus !== "evidence_only") {
      throw new Error("evidence-only offline read-back mismatch");
    }
    evidenceReopen.close();
    rmSync(evidenceRoot, { recursive: true, force: true });

    // R3-P2-3: one supported, sanitized real Mortal fixture traverses the
    // production deterministic analysis/package builder, selector, first
    // stubbed Coach generation, Overview/List/Detail presenter, SQLite save,
    // and a distinct Electron process that blocks and counts network/LLM.
    const { createFixedReviewController } = await import("../dist/fixed-review-controller.js");
    const realPackage = await realProductionPackage();
    const realReport = await stubReportFor(realPackage);
    const realRoot = mkdtempSync(join(tmpdir(), "riichi-electron-real-main-chain-"));
    let providerRequests = 0;
    let realRepository = createReviewSessionRepository({ root: realRoot, createId: () => "real-session" });
    const realController = createFixedReviewController({
      readPackage: async (packageId) => {
        if (packageId !== realPackage.packageId) throw new Error("unexpected real package identity");
        return realPackage;
      },
      generateReport: async () => { providerRequests += 1; return realReport; },
      createReportRefId: () => "real-report-ref",
      repository: realRepository,
    });
    const beforeGeneration = await realController.openReview(realPackage.packageId);
    if (beforeGeneration.activeReportStatus !== "not_generated") throw new Error("real main chain did not start at not_generated");
    const generated = await realController.generateReview(realPackage.packageId, "real-generate-operation");
    if (generated.status !== "ready" || providerRequests !== 1) throw new Error("real stubbed first generation failed");
    const realSnapshot = generated.snapshot;
    const decisionId = realSnapshot.selection.items[0]?.decisionId;
    if (!decisionId || realSnapshot.selection.items.length === 0) throw new Error("real List projection was empty");
    const realDetail = realController.getReviewDetail(realPackage.packageId, decisionId, realSnapshot.activeReportRefId);
    if (realDetail.coachJudgments.length === 0 || realDetail.explanations.length === 0 || realDetail.provenance.length === 0) {
      throw new Error("real Detail projection omitted judgment/explanation/provenance");
    }
    const expected = {
      packageId: realPackage.packageId,
      decisionId,
      snapshot: realSnapshot,
      detail: realDetail,
      sessions: realRepository.listSessions(),
    };
    writeFileSync(join(realRoot, "real-expected.json"), JSON.stringify(expected));
    realRepository.close();
    const offline = spawnSync(process.execPath, [__filename, "--offline-reopen-real"], {
      env: { ...process.env, RIICHI_ELECTRON_PERSISTENCE_ROOT: realRoot },
      stdio: "pipe",
      timeout: 30_000,
    });
    if (offline.status !== 0 || !offline.stdout.toString().includes("real-offline PASS network=0 llm=0")) {
      throw new Error(`real offline child failed: ${offline.stderr.toString() || offline.stdout.toString()}`);
    }
    rmSync(realRoot, { recursive: true, force: true });

    const migrationRoot = mkdtempSync(join(tmpdir(), "riichi-electron-migration-"));
    const migrationDb = new DatabaseSync(join(migrationRoot, "library.sqlite"));
    migrationDb.exec("CREATE TABLE sentinel(value TEXT NOT NULL); INSERT INTO sentinel VALUES('preserve'); CREATE TABLE review_sessions(conflict TEXT); PRAGMA user_version=0");
    migrationDb.close();
    try { createReviewSessionRepository({ root: migrationRoot }); throw new Error("malformed migration unexpectedly succeeded"); }
    catch (error) { if (error.message === "malformed migration unexpectedly succeeded") throw error; }
    const migrationVerify = new DatabaseSync(join(migrationRoot, "library.sqlite"));
    if (migrationVerify.prepare("SELECT value FROM sentinel").get().value !== "preserve") throw new Error("migration rollback removed prior data");
    migrationVerify.close();
    rmSync(migrationRoot, { recursive: true, force: true });

    const db = new DatabaseSync(join(root, "library.sqlite"));
    const values = {
      foreignKeys: Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys),
      journalMode: String(db.prepare("PRAGMA journal_mode").get().journal_mode),
      synchronous: Number(db.prepare("PRAGMA synchronous").get().synchronous),
      userVersion: Number(db.prepare("PRAGMA user_version").get().user_version),
    };
    db.close();
    if (values.foreignKeys !== 1 || values.journalMode !== "wal" || values.synchronous !== 2 || values.userVersion !== 1) {
      throw new Error(`unexpected sqlite pragmas: ${JSON.stringify(values)}`);
    }
    console.log(`[electron-persistence] PASS electron=${process.versions.electron} node=${process.versions.node} kill-recovery real-main-chain-offline-zero-requests A-B-A complete-partial-evidence migration`);
    exitCode = 0;
  } catch (error) {
    console.error("[electron-persistence] FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    rmSync(root, { recursive: true, force: true });
    app.exit(exitCode);
  }
}).catch((error) => {
  console.error("[electron-persistence] FAIL", error instanceof Error ? error.message : String(error));
  app.exit(1);
});
