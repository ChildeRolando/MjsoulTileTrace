import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CoachProviderConfigSchema, AnalyzableRecordSummarySchema } from "@riichi-coach/contracts";
import { createCoachWorkerHost, type CoachWorkerMainBridge, type CoachWorkerTimer } from "../src/coach-worker-host.js";
import { createCoachWorkerClient } from "../src/coach-worker-client.js";

const codexSettings = CoachProviderConfigSchema.parse({
  providerId: "codex-cli", modelName: "gpt-6-luna", reasoningEffort: "max",
});
const compatibleSettings = CoachProviderConfigSchema.parse({
  baseUrl: "https://fixture.example/v1", modelName: "fixture",
});

function catalogSummary() {
  const recordId = "000000-00000000-0000-0000-0000-000000000001";
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

async function makeReviewFiles(): Promise<{ root: string; userData: string; packageId: string }> {
  const root = await mkdtemp(join(tmpdir(), "coach-worker-test-"));
  activeRoots.add(root);
  const userData = join(root, "user-data");
  const packageDir = join(userData, "analysis-packages");
  await mkdir(packageDir, { recursive: true });
  const packageBytes = await readFile(new URL("./fixtures/coach-package.json", import.meta.url));
  const pkg = JSON.parse(packageBytes.toString("utf8")) as { packageId: string };
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
