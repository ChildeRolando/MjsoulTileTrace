const { app } = require("electron");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const CRASH_CHILD = process.argv.includes("--crash-after-report-save");

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

app.whenReady().then(async () => {
  const { createReviewSessionRepository } = await import("../dist/review-session-repository.js");
  const root = process.env.RIICHI_ELECTRON_PERSISTENCE_ROOT || mkdtempSync(join(tmpdir(), "riichi-electron-sqlite-"));

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

    const source = await import("@riichi-coach/mahjong-soul-source");
    const reasoning = await import("@riichi-coach/reasoning");
    const realFixture = JSON.parse(readFileSync(join(__dirname, "../../mahjong-soul-source/tests/fixtures/real-record-wire.json"), "utf8"));
    const bundle = await source.loadMahjongSoulProtocolBundle(join(__dirname, "../../../vendor/mahjong-soul-protocol"));
    const recordBytes = source.unwrapGameDetailRecords(bundle, Uint8Array.from(Buffer.from(realFixture.wire, "hex")));
    const mapped = source.mapMahjongSoulRecord({ gameId: `majsoul:${realFixture.recordId}`, recordId: realFixture.recordId, selfActor: 0, recordBytes, bundle });
    if (mapped.status !== "ready") throw new Error("real sanitized record did not reach production canonical mapper");
    const decisions = reasoning.replayCanonicalStream(mapped.stream);
    if (mapped.stream.events.length === 0 || decisions.length === 0) throw new Error("real sanitized record replay was empty");

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
    console.log(`[electron-persistence] PASS electron=${process.versions.electron} node=${process.versions.node} kill-recovery real-record A-B-A complete-partial-evidence migration`);
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
