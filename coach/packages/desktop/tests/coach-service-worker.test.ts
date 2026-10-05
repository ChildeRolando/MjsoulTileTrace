import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CoachProviderConfigSchema,
  AnalyzableRecordSummarySchema,
  StructuredAnalysisPackageSchema,
} from "@riichi-coach/contracts";
import { validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import { createCoachWorkerHost, type CoachWorkerMainBridge, type CoachWorkerTimer } from "../src/coach-worker-host.js";
import { createCoachWorkerClient } from "../src/coach-worker-client.js";
import { recordLabelView } from "../src/renderer/record-label.js";

const codexSettings = CoachProviderConfigSchema.parse({
  providerId: "codex-cli", modelName: "gpt-6-luna", reasoningEffort: "max",
});
const compatibleSettings = CoachProviderConfigSchema.parse({
  baseUrl: "https://fixture.example/v1", modelName: "fixture",
});

function catalogSummary(recordId = "000000-00000000-0000-0000-0000-000000000001") {
  return AnalyzableRecordSummarySchema.parse({
    recordId,
    shareUrl: `https://game.maj-soul.com/1/?paipu=${recordId}_a1`,
    startedAt: 1_754_877_600,
    players: ["A", "B", "C", "D"].map((displayName, seat) => ({
      seat, displayName, finalScore: 25_000, rank: seat + 1,
    })),
    selfSeat: 0,
    rule: {
      playerCount: 4,
      length: "south",
      modeId: 2,
      detailRuleHash: `sha256:${"a".repeat(64)}`,
      displayLabel: "四人南风",
    },
    analysisStatus: "not_analyzed",
    lastSyncedAt: 1_754_887_700,
  });
}

class ManualTimer implements CoachWorkerTimer {
  private clock = 0;
  private nextHandle = 1;
  readonly scheduled: Array<{ handle: number; at: number; callback: () => void }> = [];
  readonly delays: number[] = [];

  now(): number { return this.clock; }

  setTimeout(callback: () => void, delayMs: number): unknown {
    const handle = this.nextHandle++;
    this.delays.push(delayMs);
    this.scheduled.push({ handle, at: this.clock + delayMs, callback });
    return handle;
  }

  clearTimeout(value: unknown): void {
    const handle = Number(value);
    const index = this.scheduled.findIndex((entry) => entry.handle === handle);
    if (index >= 0) this.scheduled.splice(index, 1);
  }

  advanceBy(milliseconds: number): void {
    const target = this.clock + milliseconds;
    while (true) {
      this.scheduled.sort((left, right) => left.at - right.at);
      const next = this.scheduled[0];
      if (next === undefined || next.at > target) break;
      this.scheduled.shift();
      this.clock = next.at;
      next.callback();
    }
    this.clock = target;
  }
}

const activeRoots = new Set<string>();
const activeClients = new Set<ReturnType<typeof createCoachWorkerClient>>();

async function makeReviewFiles(recordId?: string): Promise<{ root: string; userData: string; packageId: string }> {
  const root = await mkdtemp(join(tmpdir(), "coach-worker-test-"));
  activeRoots.add(root);
  const userData = join(root, "user-data");
  const packageDir = join(userData, "analysis-packages");
  await mkdir(packageDir, { recursive: true });
  const fixtureBytes = await readFile(new URL("./fixtures/coach-package.json", import.meta.url));
  let fixtureValue = JSON.parse(fixtureBytes.toString("utf8")) as Record<string, unknown>;
  if (recordId !== undefined) {
    const originalRecordId = "game:fixture";
    const replaceStrings = (value: unknown): unknown => {
      if (typeof value === "string") return value.replaceAll(originalRecordId, recordId);
      if (Array.isArray(value)) return value.map(replaceStrings);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
          key.replaceAll(originalRecordId, recordId),
          replaceStrings(item),
        ]));
      }
      return value;
    };
    fixtureValue = replaceStrings(fixtureValue) as Record<string, unknown>;
    const parsed = StructuredAnalysisPackageSchema.parse(fixtureValue);
    // Pre-generated identities for these two frozen fixture transformations.
    // The production validator below independently checks all IDs and hashes;
    // fixture construction does not import another package's private helpers.
    const identities: Record<string, { packageId: string; semanticContentHash: string }> = {
      "261005-86c19037-4ff0-431d-9111-5a2e2b7dac4d": {
        packageId: "package:sha256:042242005eaa387e8502bdbeaa827471ab084958dd994a808f8013aa888f558d",
        semanticContentHash: "sha256:d3818da2d3ab2d7e6e23733c3becd4582411be0eac77c0a8f2b61471d5c5c001",
      },
      "majsoul:261005-86c19037-4ff0-431d-9111-5a2e2b7dac4d": {
        packageId: "package:sha256:0b9b9c44b7974b3bea2f4b3dad6392fa06ede14c53254976b9073c9b7de0fd06",
        semanticContentHash: "sha256:1e209d8a9bf7dc455c1d5ee354f3c09e79bbe2ccc80322e8766a4cf10bd3bb05",
      },
    };
    const identity = identities[recordId];
    if (identity === undefined) throw new Error("unknown_worker_record_fixture");
    fixtureValue = { ...parsed, ...identity };
    validateStructuredAnalysisPackage(fixtureValue);
  }
  const pkg = StructuredAnalysisPackageSchema.parse(fixtureValue);
  const packageBytes = Buffer.from(JSON.stringify(pkg), "utf8");
  const name = createHash("sha256").update(pkg.packageId).digest("hex");
  await writeFile(join(packageDir, `${name}.json`), packageBytes);
  return { root, userData, packageId: pkg.packageId };
}

function bridge(overrides: Partial<CoachWorkerMainBridge> = {}) {
  const calls = { read: 0, import: 0, clear: 0, saved: [] as unknown[] };
  const mainBridge: CoachWorkerMainBridge = {
    readCredentialKey: async () => { calls.read += 1; return "private-fixture-key"; },
    importCredential: async () => { calls.import += 1; },
    clearCredential: async () => { calls.clear += 1; },
    saveSettings: async (settings) => { calls.saved.push(settings); },
    ...overrides,
  };
  return { mainBridge, calls };
}

function createActualClient(input: {
  root: string;
  userData: string;
  goldenTestMode?: boolean;
  initialSettings?: ReturnType<typeof CoachProviderConfigSchema.parse>;
}) {
  const host = createCoachWorkerHost({
    workerData: {
      userData: input.userData,
      reviewRoot: join(input.root, "review-library"),
      initialSettings: input.initialSettings ?? codexSettings,
      initialCatalog: [catalogSummary()],
      goldenTestMode: input.goldenTestMode ?? false,
    },
    mainBridge: bridge().mainBridge,
    workerEntry: new URL("../dist/coach-service-worker.js", import.meta.url),
  });
  const client = createCoachWorkerClient(host);
  activeClients.add(client);
  return client;
}

async function makeFakeHost(input: {
  entry: string;
  timer?: CoachWorkerTimer;
}) {
  const result = await makeReviewFiles();
  const host = createCoachWorkerHost({
    workerData: {
      userData: result.userData,
      reviewRoot: join(result.root, "review-library"),
      initialSettings: codexSettings,
      initialCatalog: [],
      goldenTestMode: false,
    },
    mainBridge: bridge().mainBridge,
    workerEntry: pathToFileURL(input.entry),
    ...(input.timer === undefined ? {} : { timer: input.timer }),
  });
  return { ...result, host, client: createCoachWorkerClient(host) };
}

afterEach(async () => {
  for (const client of activeClients) await client.close().catch(() => undefined);
  activeClients.clear();
  for (const root of activeRoots) await rm(root, { recursive: true, force: true });
  activeRoots.clear();
});

describe("Coach review service worker", () => {
  it("recovers an older raw-ID sidecar only after canonical package identity and seat match", async () => {
    const rawRecordId = "261005-86c19037-4ff0-431d-9111-5a2e2b7dac4d";
    const canonicalRecordId = `majsoul:${rawRecordId}`;
    const files = await makeReviewFiles(canonicalRecordId);
    const client = createActualClient({ ...files, goldenTestMode: true });
    const reviewRoot = join(files.root, "review-library");
    try {
      await client.ready();
      await client.rememberCatalog([catalogSummary(rawRecordId)]);
      await client.openReview(files.packageId);
      const oldLabel = {
        title: "旧保存标题",
        recordId: rawRecordId,
        selfSeat: 0,
        startedAt: null,
        players: Array.from({ length: 4 }, (_, seat) => ({
          seat, displayName: `旧玩家${seat}`, finalScore: null, rank: null, gradingScore: null, gradingScoreUnit: null,
        })),
        rankedMode: null,
        mortalAgreementStatus: "not_applicable",
        mortalAgreement: null,
      };
      const database = new DatabaseSync(join(reviewRoot, "library.sqlite"));
      try {
        database.exec("PRAGMA busy_timeout=5000");
        database.prepare("UPDATE review_session_labels SET label_payload=?").run(JSON.stringify(oldLabel));
      } finally { database.close(); }

      const pending = await client.listReviewSessions();
      expect(pending[0]?.recordLabel?.mortalAgreementStatus).toBe("pending");
      let recovered: Awaited<ReturnType<typeof client.listReviewSessions>>[number] | undefined;
      for (let attempt = 0; attempt < 100; attempt++) {
        const sessions = await client.listReviewSessions();
        recovered = sessions[0];
        if (recovered?.recordLabel?.mortalAgreementStatus === "ready") break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(recovered?.recordLabel).toMatchObject({
        title: expect.stringContaining("四人南风"),
        recordId: canonicalRecordId,
        selfSeat: 0,
        players: expect.arrayContaining([expect.objectContaining({ seat: 0, displayName: "A" })]),
        mortalAgreementStatus: "ready",
        mortalAgreement: { agreementCount: 0, scoredDecisionCount: 1 },
      });
    } finally {
      await client.close().catch(() => undefined);
      activeClients.delete(client);
    }
  }, 15_000);

  it("backfills missing and corrupt labels through the real worker without assigning generic IDs to the catalog", async () => {
    const files = await makeReviewFiles();
    const client = createActualClient({ ...files, goldenTestMode: true });
    const reviewRoot = join(files.root, "review-library");
    try {
      await client.ready();
      await client.openReview(files.packageId);
      const database = new DatabaseSync(join(reviewRoot, "library.sqlite"));
      try {
        database.exec("PRAGMA busy_timeout=5000");
        database.prepare("DELETE FROM review_session_labels").run();
      } finally { database.close(); }

      const waitForReadyLabel = async () => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const sessions = await client.listReviewSessions();
          const label = sessions[0]?.recordLabel;
          if (label?.mortalAgreementStatus === "ready") return { session: sessions[0]!, label };
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error("worker_mortal_label_backfill_timeout");
      };

      const missing = await client.listReviewSessions();
      expect(missing[0]?.recordLabel?.mortalAgreementStatus).toBe("pending");
      const firstReady = await waitForReadyLabel();
      expect(firstReady.label.recordId).toBe("game:fixture");
      expect(firstReady.label.selfSeat).toBe(0);
      expect(firstReady.label.mortalAgreement).toMatchObject({ agreementCount: 0, scoredDecisionCount: 1 });
      const firstReadyView = recordLabelView(firstReady.label, firstReady.session.updatedAt);
      expect(firstReadyView.title).toContain("Mortal 0%（0/1）");
      expect(firstReady.label.title).not.toContain("雀魂牌谱");

      const corruptDb = new DatabaseSync(join(reviewRoot, "library.sqlite"));
      try {
        corruptDb.exec("PRAGMA busy_timeout=5000");
        corruptDb.prepare("UPDATE review_session_labels SET label_payload='not-json'").run();
      } finally { corruptDb.close(); }
      const corrupt = await client.listReviewSessions();
      expect(corrupt[0]?.recordLabel?.mortalAgreementStatus).toBe("pending");
      const repaired = await waitForReadyLabel();
      expect(repaired.label.recordId).toBe("game:fixture");
      expect(repaired.label.mortalAgreement).toMatchObject({ agreementCount: 0, scoredDecisionCount: 1 });
    } finally {
      await client.close().catch(() => undefined);
      activeClients.delete(client);
    }
  }, 15_000);

  it("keeps a raw UUID package unbound to the same-ID catalog while its saved stats stay ready", async () => {
    const rawRecordId = "261005-86c19037-4ff0-431d-9111-5a2e2b7dac4d";
    const files = await makeReviewFiles(rawRecordId);
    const client = createActualClient({ ...files, goldenTestMode: true });
    try {
      await client.ready();
      await client.rememberCatalog([catalogSummary(rawRecordId)]);
      await client.openReview(files.packageId);
      const waitForReady = async () => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const sessions = await client.listReviewSessions();
          const label = sessions[0]?.recordLabel;
          if (label?.mortalAgreementStatus === "ready") return { session: sessions[0]!, label };
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error("worker_mortal_label_backfill_timeout");
      };
      const ready = await waitForReady();
      expect(ready.label).toMatchObject({
        recordId: rawRecordId,
        selfSeat: 0,
        mortalAgreementStatus: "ready",
        mortalAgreement: { agreementCount: 0, scoredDecisionCount: 1 },
      });
      expect(recordLabelView(ready.label, ready.session.updatedAt).title).not.toContain("四人南风");

      const repeated = await client.listReviewSessions();
      expect(repeated[0]?.recordLabel?.mortalAgreementStatus).toBe("ready");
      expect(repeated[0]?.recordLabel?.mortalAgreement).toEqual(ready.label.mortalAgreement);
    } finally {
      await client.close().catch(() => undefined);
      activeClients.delete(client);
    }
  }, 15_000);

  it("runs review read-back and generation in the worker, with a live main heartbeat and working cancel/leave", async () => {
    const env = {
      golden: process.env.RIICHI_MVP_GOLDEN_TEST,
      delay: process.env.RIICHI_MVP_GOLDEN_PROVIDER_DELAY_MS,
    };
    process.env.RIICHI_MVP_GOLDEN_TEST = "1";
    process.env.RIICHI_MVP_GOLDEN_PROVIDER_DELAY_MS = "250";
    const files = await makeReviewFiles();
    const client = createActualClient({ ...files, goldenTestMode: true });
    try {
      await client.ready();
      await client.rememberCatalog([catalogSummary()]);
      const opened = await client.openReview(files.packageId);
      expect(opened.packageId).toBe(files.packageId);
      expect(JSON.stringify(opened)).not.toContain('"analysisKey"');
      expect(JSON.stringify(opened)).not.toContain('"record":');
      const selected = opened.selection.items[0];
      expect(selected).toBeDefined();

      let heartbeats = 0;
      const heartbeat = setInterval(() => { heartbeats += 1; }, 5);
      const generation = client.generateReview(files.packageId, "worker-cancel-op");
      try {
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(await client.ping()).toBe("pong");
        await client.cancelGeneration("worker-cancel-op");
        expect(await generation).toEqual({ status: "failed", code: "operation_cancelled" });
      } finally { clearInterval(heartbeat); }
      expect(heartbeats).toBeGreaterThan(0);
      expect((await client.openReview(files.packageId)).activeReportRefId).toBeNull();

      const leavingGeneration = client.generateReview(files.packageId, "worker-leave-op");
      await new Promise((resolve) => setTimeout(resolve, 25));
      await client.leaveReview(files.packageId);
      expect(await leavingGeneration).toEqual({ status: "failed", code: "operation_cancelled" });
      const reopened = await client.openReview(files.packageId);
      expect(reopened.activeReportRefId).toBeNull();
      const generated = await client.generateReview(files.packageId, "worker-success-op");
      expect(generated.status).toBe("ready");
      if (generated.status !== "ready") throw new Error("worker_generation_failed");
      const decisionId = selected!.decisionId;
      const detail = await client.getReviewDetail(files.packageId, decisionId, generated.snapshot.activeReportRefId);
      expect(detail.decisionId).toBe(decisionId);
      expect(JSON.stringify(detail)).not.toContain('"analysisKey"');
      expect(JSON.stringify(detail)).not.toContain('"record":');
      expect(await client.listReviewSessions()).toHaveLength(1);
    } finally {
      await client.close().catch(() => undefined);
      activeClients.delete(client);
      if (env.golden === undefined) delete process.env.RIICHI_MVP_GOLDEN_TEST;
      else process.env.RIICHI_MVP_GOLDEN_TEST = env.golden;
      if (env.delay === undefined) delete process.env.RIICHI_MVP_GOLDEN_PROVIDER_DELAY_MS;
      else process.env.RIICHI_MVP_GOLDEN_PROVIDER_DELAY_MS = env.delay;
    }
  }, 10_000);

  it("routes credential and settings operations through the private main bridge without returning the key", async () => {
    const files = await makeReviewFiles();
    const { mainBridge, calls } = bridge();
    const host = createCoachWorkerHost({
      workerData: {
        userData: files.userData,
        reviewRoot: join(files.root, "review-library"),
        initialSettings: compatibleSettings,
        initialCatalog: [],
        goldenTestMode: false,
      },
      mainBridge,
      workerEntry: new URL("../dist/coach-service-worker.js", import.meta.url),
    });
    const client = createCoachWorkerClient(host);
    activeClients.add(client);
    try {
      await client.ready();
      const status = await client.status();
      expect(status).toEqual({ configured: true, settings: compatibleSettings });
      expect(JSON.stringify(status)).not.toContain("private-fixture-key");
      await client.configure(codexSettings);
      await client.importCredential();
      await client.clearCredential();
      expect(calls).toEqual({ read: 1, import: 1, clear: 1, saved: [codexSettings] });
    } finally {
      await client.close().catch(() => undefined);
      activeClients.delete(client);
    }
  });

  it("keeps the generation deadline beyond the former 180-240 second window", async () => {
    const manualTimer = new ManualTimer();
    const fakePath = fileURLToPath(new URL("./fixtures/coach-worker-reply.mjs", import.meta.url));
    const result = await makeFakeHost({ entry: fakePath, timer: manualTimer });
    try {
      await result.host.ready;
      const response = result.host.request("generateReview", {
        packageId: "fixture-package", operationId: "long-budget-op",
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      manualTimer.advanceBy(240_000);
      expect(await response).toEqual({ status: "failed", code: "generation_failed" });
      expect(manualTimer.delays).toContain(600_000);
    } finally { await result.host.close().catch(() => undefined); }
  });

  it("rejects every pending call on the bounded deadline and validates worker responses", async () => {
    const timer = new ManualTimer();
    const silent = await makeFakeHost({
      entry: fileURLToPath(new URL("./fixtures/coach-worker-silent.mjs", import.meta.url)),
      timer,
    });
    await silent.host.ready;
    const status = silent.client.status();
    const ping = silent.client.ping();
    await new Promise((resolve) => setTimeout(resolve, 20));
    timer.advanceBy(180_000);
    await expect(status).rejects.toThrow("provider_unavailable");
    await expect(ping).rejects.toThrow("provider_unavailable");
    await expect(silent.client.status()).rejects.toThrow("provider_unavailable");

    const invalid = await makeFakeHost({
      entry: fileURLToPath(new URL("./fixtures/coach-worker-invalid-response.mjs", import.meta.url)),
    });
    try {
      await invalid.host.ready;
      await expect(invalid.client.status()).rejects.toThrow("provider_unavailable");
    } finally { await invalid.host.close().catch(() => undefined); }
  });

  it("rejects worker operations outside the private allow-list and keeps the production entry on the worker seam", async () => {
    const files = await makeReviewFiles();
    const host = createCoachWorkerHost({
      workerData: {
        userData: files.userData,
        reviewRoot: join(files.root, "review-library"),
        initialSettings: codexSettings,
        initialCatalog: [],
        goldenTestMode: false,
      },
      mainBridge: bridge().mainBridge,
      workerEntry: new URL("../dist/coach-service-worker.js", import.meta.url),
    });
    try {
      await host.ready;
      await expect(host.request("runArbitraryCode" as never, { path: "C:\\secret" })).rejects.toThrow("provider_unavailable");
      const entry = await readFile(new URL("../src/electron-entry.ts", import.meta.url), "utf8");
      expect(entry).toContain("createCoachWorkerHost");
      expect(entry).toContain("service: coachService");
      expect(entry).not.toContain("createCoachService, createPackageReferenceReader");
    } finally { await host.close().catch(() => undefined); }
  });
});
