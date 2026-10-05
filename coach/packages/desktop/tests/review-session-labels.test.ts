import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnalyzableRecordSummarySchema,
  RecordLabelSchema,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import type { ReviewSessionSummary } from "../src/review-session-repository.js";
import { createReviewSessionLabelStore } from "../src/review-session-labels.js";
import { recordLabelView } from "../src/renderer/record-label.js";

const roots: string[] = [];
const stores: ReturnType<typeof createReviewSessionLabelStore>[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function root(): string {
  const value = mkdtempSync(join(tmpdir(), "riichi-record-labels-"));
  roots.push(value);
  return value;
}

function labelStore(rootPath: string): ReturnType<typeof createReviewSessionLabelStore> {
  const store = createReviewSessionLabelStore({ root: rootPath });
  stores.push(store);
  return store;
}

function createLibrary(rootPath: string): void {
  mkdirSync(rootPath, { recursive: true });
  const db = new DatabaseSync(join(rootPath, "library.sqlite"));
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE analysis_packages(package_ref_id TEXT PRIMARY KEY, package_id TEXT NOT NULL UNIQUE);
      CREATE TABLE review_sessions(
        session_id TEXT PRIMARY KEY,
        package_ref_id TEXT NOT NULL,
        UNIQUE(session_id,package_ref_id),
        FOREIGN KEY(package_ref_id) REFERENCES analysis_packages(package_ref_id) ON DELETE CASCADE
      );
      INSERT INTO analysis_packages VALUES('package-ref-a','package-a');
      INSERT INTO analysis_packages VALUES('package-ref-b','package-b');
      INSERT INTO review_sessions VALUES('session-a','package-ref-a');
      INSERT INTO review_sessions VALUES('session-b','package-ref-b');`);
  } finally { db.close(); }
}

const recordId = "261005-86c19037-4ff0-431d-9111-5a2e2b7dac4d";
const summary = AnalyzableRecordSummarySchema.parse({
  recordId,
  shareUrl: `https://game.maj-soul.com/1/?paipu=${recordId}_a1`,
  startedAt: 1_791_187_200,
  players: [
    { seat: 0, displayName: "Northwind", finalScore: 35_200, rank: 1 },
    { seat: 1, displayName: "Kite", finalScore: 28_600, rank: 2 },
    { seat: 2, displayName: "River", finalScore: 21_100, rank: 3 },
    { seat: 3, displayName: "Cloud", finalScore: 15_100, rank: 4 },
  ],
  selfSeat: 2,
  rule: { playerCount: 4, length: "south", modeId: 2, detailRuleHash: `sha256:${"a".repeat(64)}`, displayLabel: "四人南风" },
  analysisStatus: "ready",
  lastSyncedAt: 1_791_200_000,
});

function packageIdentity(packageId: string, id = `majsoul:${recordId}`, selfActor = 2): StructuredAnalysisPackage {
  return { packageId, record: { recordId: id, selfActor } } as StructuredAnalysisPackage;
}

function sessionSummary(packageId: string, sessionId: string, updatedAt = "2026-10-05T02:03:04.000Z"): ReviewSessionSummary {
  return { packageId, sessionId, analysisStatus: "complete", activeReportRefId: null, updatedAt };
}

describe("local saved review labels", () => {
  it("persists catalog metadata by session/package and keeps it when the catalog is cleared", () => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    store.rememberCatalog([summary]);
    store.observePackage(packageIdentity("package-a"));

    const enriched = store.enrichSession(sessionSummary("package-a", "session-a"));
    expect(enriched.recordLabel).toMatchObject({
      title: expect.stringContaining("四人南风"),
      recordId: `majsoul:${recordId}`,
      selfSeat: 2,
      startedAt: summary.startedAt,
      players: summary.players,
    });
    store.close();

    const reopened = labelStore(rootPath);
    try {
      reopened.rememberCatalog([]);
      reopened.observePackage(packageIdentity("package-a"));
      expect(reopened.enrichSession(sessionSummary("package-a", "session-a")).recordLabel).toEqual(enriched.recordLabel);
      const db = new DatabaseSync(join(rootPath, "library.sqlite"), { readOnly: true });
      try {
        const payload = JSON.parse(String(db.prepare("SELECT label_payload FROM review_session_labels WHERE session_id='session-a'").get()?.label_payload));
        expect(payload).not.toHaveProperty("shareUrl");
        expect(payload).not.toHaveProperty("accountId");
      } finally { db.close(); }
    } finally { reopened.close(); }
  });

  it("matches canonical majsoul game IDs to the raw catalog ID and preserves full labels after reopening without a catalog", () => {
    const rootPath = root();
    createLibrary(rootPath);
    const canonicalId = `majsoul:${recordId}`;
    const store = labelStore(rootPath);
    store.rememberCatalog([summary]);
    store.observePackage(packageIdentity("package-a", canonicalId));

    const saved = store.enrichSession(sessionSummary("package-a", "session-a")).recordLabel;
    expect(saved.title).toContain("四人南风");
    expect(saved.players).toEqual(summary.players);
    store.close();

    const reopened = labelStore(rootPath);
    try {
      reopened.rememberCatalog([]);
      reopened.observePackage(packageIdentity("package-a", canonicalId));
      expect(reopened.enrichSession(sessionSummary("package-a", "session-a")).recordLabel).toEqual(saved);

      reopened.observePackage(packageIdentity("package-b", canonicalId));
      const fallback = reopened.enrichSession(sessionSummary("package-b", "session-b")).recordLabel;
      expect(fallback).toMatchObject({
        title: "雀魂牌谱 · 2026-10-05",
        recordId: canonicalId,
        selfSeat: 2,
        startedAt: null,
      });
      expect(fallback.players).toEqual(Array.from({ length: 4 }, (_, seat) => ({
        seat, displayName: null, rank: null, finalScore: null, gradingScore: null, gradingScoreUnit: null,
      })));
    } finally { reopened.close(); }
  });

  it("does not associate an unprefixed package ID with a matching MahjongSoul catalog entry", () => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    try {
      store.rememberCatalog([summary]);
      store.observePackage(packageIdentity("package-a", recordId));

      const label = store.enrichSession(sessionSummary("package-a", "session-a")).recordLabel;
      expect(label.recordId).toBe(recordId);
      expect(label.startedAt).toBeNull();
      expect(label.players).toEqual(Array.from({ length: 4 }, (_, seat) => ({
        seat, displayName: null, rank: null, finalScore: null, gradingScore: null, gradingScoreUnit: null,
      })));
    } finally { store.close(); }
  });

  it("uses a human saved-date fallback for legacy sessions without reading package contents", () => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    try {
      const enriched = store.enrichSession(sessionSummary("package-b", "session-b", "2025-12-31T23:59:00.000Z"));
      expect(enriched.recordLabel).toMatchObject({
        title: "牌谱复盘 · 保存于 2025-12-31",
        recordId: null,
        selfSeat: null,
        startedAt: null,
      });
      const view = recordLabelView(enriched.recordLabel, enriched.updatedAt);
      expect(view.title).toBe("牌谱复盘 · 保存于 2025-12-31 · Mortal统计中");
      expect(view.players).toEqual([]);
      expect(view.title).not.toContain("package-b");
    } finally { store.close(); }
  });

  it("updates agreement and preserves a legacy raw-ID label from the actual canonical package without a catalog", () => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    store.rememberCatalog([summary]);
    store.observePackage(packageIdentity("package-a"));
    const before = store.enrichSession(sessionSummary("package-a", "session-a")).recordLabel;
    const legacy = { ...before, recordId, mortalAgreementStatus: undefined, mortalAgreement: undefined };
    const db = new DatabaseSync(join(rootPath, "library.sqlite"));
    try {
      db.prepare("UPDATE review_session_labels SET label_payload=? WHERE session_id='session-a'").run(JSON.stringify(legacy));
    } finally { db.close(); }
    store.rememberCatalog([]);
    const loaded = Object.assign(packageIdentity("package-a"), { decisions: [{
      outcome: "analysis_ready", modelEvaluation: {
        engineId: "mortal", candidates: [{ actionRef: "action:actual" }, { actionRef: "action:other" }],
        preferredActions: ["action:actual"], scoredActualModelActionRef: "action:actual",
      },
    }] });
    store.observePackage(loaded);
    const after = store.enrichSession(sessionSummary("package-a", "session-a")).recordLabel;
    expect(after).toMatchObject({ title: before.title, players: before.players, startedAt: before.startedAt,
      recordId: `majsoul:${recordId}`, selfSeat: 2,
      mortalAgreementStatus: "ready", mortalAgreement: { agreementCount: 1, scoredDecisionCount: 1 } });
  });

  it("creates a dated unknown-player fallback for an opened package with no remembered catalog", () => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    try {
      store.rememberCatalog([]);
    expect(() => store.observePackage(packageIdentity("package-b", "majsoul:261005-86c19037-4ff0-431d-9111-5a2e2b7dac4d", 2))).not.toThrow();
      const label = store.enrichSession(sessionSummary("package-b", "session-b")).recordLabel;
      expect(label.title).toBe("雀魂牌谱 · 2026-10-05");
      expect(label.startedAt).toBeNull();
      expect(label.selfSeat).toBe(2);
      expect(label.players).toHaveLength(4);
      expect(label.players.every(player => player.displayName === null && player.rank === null && player.finalScore === null)).toBe(true);
    } finally { store.close(); }
  });

  it.each(["game:fixture", "majsoul:fixture"])("uses an unknown-date fallback for invalid catalog ID %s without throwing", id => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    try {
      store.rememberCatalog([]);
      expect(() => store.observePackage(packageIdentity("package-b", id, 0))).not.toThrow();
      const session = store.enrichSession(sessionSummary("package-b", "session-b"));
      expect(session.recordLabel.title).toBe("牌谱 · 日期未知");
      expect(session.recordLabel.mortalAgreementStatus).toBe("unavailable");
      expect(recordLabelView(session.recordLabel, session.updatedAt).title).toContain("Mortal统计不可用");
    } finally { store.close(); }
  });

  it.each(["empty catalog", "catalog from a different self seat"])(
    "does not replace a complete label after later observation with %s",
    laterCatalog => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    try {
      store.rememberCatalog([summary]);
      store.observePackage(packageIdentity("package-a"));
      const before = store.enrichSession(sessionSummary("package-a", "session-a")).recordLabel;

      store.rememberCatalog(laterCatalog === "empty catalog"
        ? []
        : [AnalyzableRecordSummarySchema.parse({ ...summary, selfSeat: 1 })]);
      store.observePackage(packageIdentity("package-a"));

      expect(store.enrichSession(sessionSummary("package-a", "session-a")).recordLabel).toEqual(before);
    } finally { store.close(); }
  });

  it("does not associate raw-ID or wrong-seat package labels with a catalog entry", () => {
    const rootPath = root();
    createLibrary(rootPath);
    const store = labelStore(rootPath);
    try {
      store.rememberCatalog([summary]);
      store.observePackage(packageIdentity("package-a", recordId, 2));
      const rawIdLabel = store.enrichSession(sessionSummary("package-a", "session-a")).recordLabel;
      expect(rawIdLabel.recordId).toBe(recordId);
      expect(rawIdLabel.title).toBe("牌谱 · 日期未知");
      expect(rawIdLabel.title).not.toContain("四人南风");

      store.observePackage(packageIdentity("package-b", `majsoul:${recordId}`, 1));
      const wrongSeatLabel = store.enrichSession(sessionSummary("package-b", "session-b")).recordLabel;
      expect(wrongSeatLabel.recordId).toBe(`majsoul:${recordId}`);
      expect(wrongSeatLabel.selfSeat).toBe(1);
      expect(wrongSeatLabel.title).not.toContain("四人南风");
    } finally { store.close(); }
  });

  it("shows unknown room without exposing the opaque mode ID", () => {
    const label = RecordLabelSchema.parse({
      title: "2026-10-05 · 四人南风",
      recordId: `majsoul:${recordId}`,
      selfSeat: 2,
      startedAt: summary.startedAt,
      players: summary.players,
      rankedMode: { id: 4_294_967_000, label: null },
      mortalAgreementStatus: "not_applicable",
      mortalAgreement: null,
    });
    const title = recordLabelView(label, "2026-10-05T00:00:00.000Z").title;
    expect(title).toContain("段位房间未知");
    expect(title).not.toContain("mode_id");
    expect(title).not.toContain("4294967000");
  });

  it("keeps missing values explicit and highlights the actual self seat in the renderer projection", () => {
    const label = RecordLabelSchema.parse({
      title: "2026-10-05 10:00 · 四人南风",
      recordId,
      selfSeat: 2,
      startedAt: summary.startedAt,
      players: [
        { seat: 0, displayName: "Northwind", finalScore: 35_200, rank: 4 },
        { seat: 1, displayName: "Kite", finalScore: 28_600, rank: 2 },
        { seat: 2, displayName: null, finalScore: null, rank: null },
        { seat: 3, displayName: "Cloud", finalScore: 15_100, rank: 1 },
      ],
    });
    const view = recordLabelView(label, "2026-10-05T00:00:00.000Z");
    expect(view.players.map(player => player.isSelf)).toEqual([false, false, false, true]);
    expect(view.players[0]?.text).toContain("第1名");
    expect(view.players[1]?.text).toContain("第2名");
    expect(view.players[2]?.text).toContain("第4名");
    expect(view.players[3]?.text).toContain("姓名未知");
    expect(view.players[3]?.text).toContain("名次未知");
    expect(view.players[3]?.text).toContain("分数未知");
    expect(() => RecordLabelSchema.parse({ ...label, players: label.players.map((player, index) => ({ ...player, rank: index < 2 ? 1 : player.rank })) })).toThrow();
  });

  it("shows saved Mortal agreement on a generic fallback without inventing catalog identity", () => {
    const label = RecordLabelSchema.parse({
      title: "牌谱复盘 · 保存于 2026-10-05",
      recordId: null,
      selfSeat: null,
      startedAt: null,
      players: Array.from({ length: 4 }, (_, seat) => ({
        seat, displayName: null, finalScore: null, rank: null, gradingScore: null,
      })),
      mortalAgreementStatus: "ready",
      mortalAgreement: { agreementCount: 1, scoredDecisionCount: 2 },
    });
    const view = recordLabelView(label, "2026-10-05T00:00:00.000Z");
    expect(view.title).toBe("牌谱复盘 · 保存于 2026-10-05 · Mortal 50%（1/2）");
    expect(view.agreementDescription).toContain("有效评分且至少有两个候选动作");
    expect(view.agreementDescription).toContain("不读取教练偏好");
    expect(view.players).toEqual([]);
  });
});
