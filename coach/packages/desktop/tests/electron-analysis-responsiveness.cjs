// Run with isolated RIICHI_ANALYSIS_BENCH_ROOT and recorded real replies.
// Exercises the actual production analysis-worker, repository and DTO host.
const { app, BrowserWindow, ipcMain } = require("electron");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");
const coach = resolve(__dirname, "../../..");
const root = process.env.RIICHI_ANALYSIS_BENCH_ROOT;
if (!root) throw Error("benchmark_path_required");
mkdirSync(root, { recursive: true });
app.setPath("userData", join(root, "user-data"));
const load = path => import(pathToFileURL(join(coach, path)));
app.whenReady().then(async () => {
  const source = await load("packages/mahjong-soul-source/dist/index.js");
  const reasoning = await load("packages/reasoning/dist/index.js");
  const { createAnalysisWorkerHost } = await load("packages/desktop/dist/analysis-worker-host.js");
  const { createRecordAnalysisWorkerStore } = await load("packages/desktop/dist/record-analysis-worker-store.js");
  const bundle = await source.loadMahjongSoulProtocolBundle(join(coach, "vendor/mahjong-soul-protocol"));
  const fixture = JSON.parse(readFileSync(join(coach, "packages/mahjong-soul-source/tests/fixtures/real-record-complete.json"), "utf8"));
  const mapped = source.mapMahjongSoulRecord({ gameId: "majsoul:performance-20261014", selfActor: 3,
    recordId: fixture.recordId, recordBytes: source.unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex")), bundle, ruleEvidence: fixture.ruleEvidence });
  if (mapped.status !== "ready") throw Error("mapper_failed");
  // The host seam receives already replayed inputs from ingestion. Measure
  // that seam, including transfer/startup, rather than benchmark-only setup.
  const request = { recordId: fixture.recordId, selfActor: 3, stream: mapped.stream, decisions: reasoning.replayCanonicalStream(mapped.stream) };
  const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  ipcMain.handle("analysis-benchmark-ping", () => "pong");
  await window.loadURL("data:text/html," + encodeURIComponent(`<script>
    const {ipcRenderer}=require('electron');window.samples=[];
    setInterval(async()=>{const start=performance.now();await ipcRenderer.invoke('analysis-benchmark-ping');samples.push(performance.now()-start);},50);
  </script>`));
  const recorded = Boolean(process.env.RIICHI_ANALYSIS_RECORDED_RESPONSES);
  const host = createAnalysisWorkerHost(recorded ? { workerEntry: pathToFileURL(join(coach, "packages/desktop/tests/fixtures/analysis-worker-recorded.mjs")) } : {});
  const phases = []; let stage; let started; let last = performance.now(); const gaps = []; const rss = [];
  const timer = setInterval(() => { const now = performance.now(); gaps.push(now - last); last = now; rss.push(process.memoryUsage().rss); }, 20);
  const artifactRoot = process.env.RIICHI_LOCAL_MORTAL_ROOT;
  const start = performance.now();
  let result;
  try {
    const preflight = createRecordAnalysisWorkerStore();
    const preflightStart = performance.now();
    try {
      const input = { recordId: fixture.recordId, selfActor: 3, recordBytes: source.unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex")), ruleEvidence: fixture.ruleEvidence };
      const outcome = await preflight.analyzeRecord(input);
      if (outcome.status !== "analysis_ready") throw Error("preflight_failed");
      if (await preflight.analyzeRecord(input) !== outcome) throw Error("preflight_not_reused");
    } finally { await preflight.close(); }
    phases.push({ stage: "preflight", ms: performance.now() - preflightStart });
    result = await host.run({ request,
      runtimeOptions: { artifactRoot, pythonExecutable: join(artifactRoot, "python/Scripts/python.exe"), packageRoot: join(coach, "packages/mortal-runtime"),
        platformManifest: "mortal-582500.windows-x64.json", nativeReceiptPath: process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT, nativeModulePath: process.env.RIICHI_LIBRIICHI_NATIVE_MODULE },
      resourcesDir: join(coach, "resources"), reviewRoot: join(root, "library"), catalog: [], goldenTestMode: false }, progress => {
      if (stage !== progress.stage) {
        const now = performance.now(); if (stage) phases.push({ stage, ms: now - started });
        stage = progress.stage; started = now; console.log(stage);
      }
    });
    phases.push({ stage, ms: performance.now() - started });
  } finally { clearInterval(timer); await host.close(); }
  const elapsedMs = performance.now() - start;
  const samples = await window.webContents.executeJavaScript("window.samples");
  const db = new DatabaseSync(join(root, "library/library.sqlite"), { readOnly: true });
  const row = db.prepare("SELECT * FROM analysis_packages WHERE package_id=?").get(result.packageId);
  const header = Buffer.from(row.payload);
  const { readPackageArtifact } = await load("packages/desktop/dist/package-artifact-storage.js");
  const decodeStarted = performance.now(); const pkg = readPackageArtifact(db, row); const decodeMs = performance.now() - decodeStarted;
  reasoning.validateStructuredAnalysisPackage(pkg);
  const storageBytes = Number(db.prepare("SELECT SUM(length(payload)) AS bytes FROM analysis_package_chunks").get().bytes);
  db.close();
  const receipt = { result, phases, elapsedMs, maxMainGapMs: Math.max(...gaps), maxWindowRequestMs: Math.max(...samples), peakRssBytes: Math.max(...rss),
    storageCodec: header.subarray(0, 8).toString("ascii"), rawStorageBytes: Number(header.readBigUInt64LE(16)), storageBytes, decodeMs,
    semanticContentHash: pkg.semanticContentHash, logicalBytes: Buffer.byteLength(JSON.stringify(pkg)),
    limits: recorded ? "Fixed recorded replies with I/O turns; measures production packaging/save and UI responsiveness, not native inference latency; hidden Electron window."
      : "Real production native/helper analysis and save with a hidden Electron window; CPU model runtime, OS caches not cleared." };
  writeFileSync(join(root, "receipt.json"), JSON.stringify(receipt, null, 2));
  if (receipt.maxWindowRequestMs >= 200 || receipt.maxMainGapMs >= 200) throw Error("analysis_responsiveness_budget_exceeded");
  console.log(JSON.stringify(receipt)); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
