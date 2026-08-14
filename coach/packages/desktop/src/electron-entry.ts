import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  type BrowserWindowConstructorOptions,
} from "electron";
import {
  MahjongSoulSourceError,
  MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION,
  createMahjongSoulCatalogStore,
  createMahjongSoulSessionVault,
  createMahjongSoulOAuth2SessionRestorer,
  authenticateStoredMahjongSoulSession,
  fetchMahjongSoulRecord,
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  readSessionRestoreRejection,
  syncRecentCatalog,
  type MahjongSoulLobbySession,
  type RawRecordListEntry,
} from "@riichi-coach/mahjong-soul-source";
import {
  parseMahjongSoulCnShareUrl,
} from "@riichi-coach/contracts";
import {
  buildMahjongSoulReplayAudit,
  replayCanonicalStream,
  serializeMahjongSoulReplayAudit,
} from "@riichi-coach/reasoning";
import { createMahjongSoulCatalogService } from "./catalog-service.js";
import { createElectronSessionKeyProtector, type SafeStoragePort } from "./electron-safe-storage.js";
import {
  registerMahjongSoulCatalogIpc,
  registerMahjongSoulIpc,
  type IpcMainPort,
} from "./ipc.js";
import {
  createElectronMahjongSoulLoginProvider,
  type ElectronLoginWindowPort,
} from "./mahjong-soul-login-window.js";
import { createLobbySessionFactory } from "./lobby-session-factory.js";
import {
  replayDiagnosticExitCode,
  runMahjongSoulReplayDiagnostic,
} from "./replay-diagnostic-runner.js";
import {
  restoreDiagnosticExitCode,
  runMahjongSoulRestoreDiagnostic,
} from "./restore-diagnostic-runner.js";
import {
  captureRecordDiagnosticExitCode,
  runRecordCaptureDiagnostic,
} from "./capture-record-diagnostic-runner.js";
import type { CaptureRecordWindowPort } from "./official-client-record-capture.js";
import { createMahjongSoulPaipuImportService } from "./paipu-import-service.js";
import { registerMahjongSoulPaipuImportIpc } from "./ipc.js";
import { createMahjongSoulSessionService } from "./mahjong-soul-session-service.js";
import {
  createMainWindowOptions,
  isAllowedLocalRendererNavigation,
} from "./main.js";
import { createRecoverableSessionFile } from "./recoverable-session-file.js";
import { createMahjongSoulRecordIngestionService } from "./record-ingestion-service.js";
import { createRecordAnalysisStore } from "./record-analysis-store.js";
import { readCliFlag } from "./diagnostic-flags.js";

const PARTITION = "persist:riichi-coach-mahjong-soul-cn";
const bundleRoot = fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url));
const preloadPath = fileURLToPath(new URL("./preload.bundle.cjs", import.meta.url));
const rendererUrl = pathToFileURL(
  fileURLToPath(new URL("./renderer/index.html", import.meta.url)),
).href;

let mainWindow: BrowserWindow | null = null;
let ipcRegistration: Readonly<{ dispose(): void }> | null = null;
let catalogIpcRegistration: Readonly<{ dispose(): void }> | null = null;
let paipuIpcRegistration: Readonly<{ dispose(): void }> | null = null;

// The official-client window used by BOTH record-capture routes (the paipu
// URL import and the capture diagnostic): the app's persistent Mahjong Soul
// partition with the full hardening set. It is shown in the foreground — the
// Unity WebGL client needs a real render context to connect the gateway.
// The renderer never chooses a navigation target: only a main-process
// strict-parsed CN share URL ever reaches loadURL.
function createOfficialClientCaptureWindow(): CaptureRecordWindowPort {
  const window = new BrowserWindow({
    show: true,
    width: 1180,
    height: 820,
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      // The Unity WebGL client drives its resource loading off rAF; a
      // throttled (occluded/backgrounded) window stalls at "正在初始化遊戲資源
      // 0%" and never connects the gateway — the record is then never fetched.
      // The capture window must keep rendering regardless of focus.
      backgroundThrottling: false,
    },
  });
  // Bring it to the front: in the product app the main window already holds
  // focus, and an occluded capture window is exactly the stall above even
  // with throttling disabled.
  window.moveTop();
  window.focus();
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.session.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.on("will-download", (event, item) => {
    event.preventDefault();
    item.cancel();
  });
  // did-navigate = main-frame commit. The capture primitive dispatches
  // Network.enable there: Electron 43's debugger sendCommand hangs forever
  // on an uncommitted about:blank target (verified live 2026-08-15), and the
  // commit always precedes any page JavaScript opening the Lobby WebSocket.
  let commitListener: (() => void) | null = null;
  (window.webContents as unknown as {
    on(event: "did-navigate", listener: () => void): void;
  }).on("did-navigate", () => { commitListener?.(); });
  return {
    webContents: {
      debugger: window.webContents.debugger,
      onDidNavigateCommit(listener: () => void): void {
        commitListener = listener;
      },
    },
    loadURL: (target: string) => window.loadURL(target),
    close: () => { window.close(); },
    isDestroyed: () => window.isDestroyed(),
  };
}

function hardenLocalWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedLocalRendererNavigation(url, rendererUrl)) event.preventDefault();
  });
  const frameNavigation = window.webContents as unknown as {
    on(
      event: "will-frame-navigate",
      listener: (
        event: { preventDefault(): void },
        details: { readonly url: string },
      ) => void,
    ): void;
  };
  frameNavigation.on("will-frame-navigate", (event, details) => {
    if (!isAllowedLocalRendererNavigation(details.url, rendererUrl)) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.on("will-download", (event, item) => {
    event.preventDefault();
    item.cancel();
  });
}

const DESKTOP_APP_VERSION = "0.1.0";

async function syncRecentCatalogEntries(
  session: MahjongSoulLobbySession,
  now: number,
): Promise<RawRecordListEntry[]> {
  let endTime = Math.min(0xffff_ffff, Math.floor(now / 1000));
  let windowSeconds = 30 * 24 * 60 * 60;
  const entries = new Map<string, RawRecordListEntry>();
  for (let window = 0; window < 8 && endTime >= 1 && entries.size < 30; window += 1) {
    const beginTime = Math.max(1, endTime - windowSeconds + 1);
    const catalog = await syncRecentCatalog({ session, beginTime, endTime });
    for (const candidate of catalog.entries) entries.set(candidate.uuid, candidate);
    if (beginTime === 1) break;
    endTime = beginTime - 1;
    windowSeconds *= 2;
  }
  return [...entries.values()];
}

async function writeReplayAuditFile(
  auditDir: string,
  recordId: string,
  serialized: string,
): Promise<string> {
  await mkdir(auditDir, { recursive: true, mode: 0o700 });
  const target = join(auditDir, `${recordId}.json`);
  await writeFile(target, serialized, { mode: 0o600 });
  return target;
}

async function start(): Promise<void> {
  const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  const loginProvider = createElectronMahjongSoulLoginProvider({
    bundle,
    createWindow: (options) => new BrowserWindow(
      {
        ...options,
        width: 1180,
        height: 820,
        autoHideMenuBar: true,
      } as BrowserWindowConstructorOptions,
    ) as unknown as ElectronLoginWindowPort,
  });
  const protector = createElectronSessionKeyProtector({
    safeStorage: safeStorage as unknown as SafeStoragePort,
    platform: process.platform,
  });
  const store = createRecoverableSessionFile({
    root: join(app.getPath("userData"), "mahjong-soul-session"),
  });
  const vault = createMahjongSoulSessionVault({
    protector,
    store,
    now: Date.now,
  });
  if (process.argv.includes("--diagnose-mahjong-soul-restore")) {
    const result = await runMahjongSoulRestoreDiagnostic({
      loginProvider,
      createSession: createLobbySessionFactory({ bundle }),
      bundle,
      now: Date.now,
    });
    console.log(`[riichi-coach] mahjong-soul-restore:${result.status}`);
    if (result.restoreRejection !== undefined) {
      console.log(
        `[riichi-coach] restore-rejection ${JSON.stringify(result.restoreRejection)}`,
      );
    }
    app.exit(restoreDiagnosticExitCode(result.status));
    return;
  }
  if (process.argv.includes("--diagnose-mahjong-soul-capture-record")) {
    // The paipu URL must be provided explicitly; there is no fallback replay
    // (a hardcoded real game link would keep propagating a player's identity).
    // NOTE: the URL must use the attached form (--paipu-url=<url>) when other
    // flags follow — Electron 43 on Windows dies before app code when a
    // space-separated switch carries an http(s):// value with more args
    // behind it (see diagnostic-flags.ts).
    const url = readCliFlag(process.argv, "paipu-url");
    if (url === undefined) {
      console.error(
        "[riichi-coach] mahjong-soul-capture-record:error missing_required_flag --paipu-url=<url>",
      );
      app.exit(2);
      return;
    }
    // Identity never defaults: the observed seat is required, and the record
    // id is derived strictly from the paipu URL (deterministic parse).
    const selfActorArg = readCliFlag(process.argv, "self-actor");
    const selfActor = selfActorArg === "0" || selfActorArg === "1"
      || selfActorArg === "2" || selfActorArg === "3"
      ? Number(selfActorArg)
      : undefined;
    if (selfActor === undefined) {
      console.error(
        "[riichi-coach] mahjong-soul-capture-record:error missing_required_flag --self-actor=<0|1|2|3>",
      );
      app.exit(2);
      return;
    }
    let recordId: string;
    try {
      recordId = parseMahjongSoulCnShareUrl(url).recordId;
    } catch {
      console.error(
        "[riichi-coach] mahjong-soul-capture-record:error invalid_paipu_url",
      );
      app.exit(2);
      return;
    }
    const captureAuditDir = join(
      app.getPath("userData"),
      "mahjong-soul-replay-audit",
    );
    const result = await runRecordCaptureDiagnostic({
      bundle,
      url,
      recordId,
      selfActor,
      createWindow: createOfficialClientCaptureWindow,
      timeoutMs: 240_000,
      pipeline: {
        mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
        replay: replayCanonicalStream,
        serializeAudit: ({ stream, decisions }) => serializeMahjongSoulReplayAudit(
          buildMahjongSoulReplayAudit({
            stream,
            decisions,
            recordId,
            protocolVersion: MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION,
            appVersion: DESKTOP_APP_VERSION,
            now: Date.now,
          }),
        ),
        writeAudit: (serialized) =>
          writeReplayAuditFile(captureAuditDir, recordId, serialized),
      },
    });
    const resultPath = join(app.getPath("temp"), "mahjong-soul-capture-result.json");
    await writeFile(resultPath, JSON.stringify(result));
    console.log(
      `[riichi-coach] mahjong-soul-capture-record:${JSON.stringify(result)} ${resultPath}`,
    );
    app.exit(captureRecordDiagnosticExitCode(result.status));
    return;
  }
  if (process.argv.includes("--diagnose-mahjong-soul-replay")) {
    const recordId = readCliFlag(process.argv, "record-id");
    const auditDir = join(app.getPath("userData"), "mahjong-soul-replay-audit");
    const result = await runMahjongSoulReplayDiagnostic({
      vault,
      createSession: createLobbySessionFactory({ bundle }),
      authenticate: async (lobby, stored) => {
        const status = await authenticateStoredMahjongSoulSession(lobby, stored);
        // The rejection probe is opt-in: it replays oauth2Check + oauth2Login a
        // second time, which pollutes a clean single-restore experiment and can
        // aggravate server-side rate-limiting. Default runs issue exactly one
        // oauth2Check through the normal restore path above.
        if (status !== "authenticated" && process.argv.includes("--probe-rejection")) {
          try {
            const detail = await readSessionRestoreRejection(lobby, stored);
            console.log(
              `[riichi-coach] restore-rejection ${JSON.stringify(detail)}`,
            );
          } catch {
            // Best-effort; the fixed status is still reported below.
          }
        }
        return status;
      },
      syncCatalog: syncRecentCatalogEntries,
      fetchRecord: (lobby, stored, recordId) => fetchMahjongSoulRecord({
        session: lobby,
        bundle,
        recordId,
        clientVersionString: stored.recoveryContext.clientVersionString,
        fetchImpl: globalThis.fetch,
      }),
      mapRecord: (input) => mapMahjongSoulRecord({ ...input, bundle }),
      replay: replayCanonicalStream,
      serializeAudit: (stream, decisions, recordId) => serializeMahjongSoulReplayAudit(
        buildMahjongSoulReplayAudit({
          stream,
          decisions,
          recordId,
          protocolVersion: MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION,
          appVersion: DESKTOP_APP_VERSION,
          now: Date.now,
        }),
      ),
      writeAudit: (serialized, recordId) =>
        writeReplayAuditFile(auditDir, recordId, serialized),
      now: Date.now,
      recordId,
    });
    console.log(
      `[riichi-coach] mahjong-soul-replay:${result.status}`
      + (result.auditPath !== undefined ? ` ${result.auditPath}` : ""),
    );
    app.exit(replayDiagnosticExitCode(result.status));
    return;
  }
  const partitionSession = session.fromPartition(PARTITION, { cache: true });
  const catalogStore = createMahjongSoulCatalogStore({
    protector,
    store: createRecoverableSessionFile({
      root: join(app.getPath("userData"), "mahjong-soul-catalog"),
    }),
  });
  const catalogService = createMahjongSoulCatalogService({
    vault,
    catalogStore,
    sessionFactory: async (stored) => {
      const lobby = await createLobbySessionFactory({ bundle })();
      const restored = await authenticateStoredMahjongSoulSession(lobby, stored);
      if (restored !== "authenticated") {
        await lobby.close();
        throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
      }
      return lobby;
    },
    clock: Date.now,
  });
  const analysisStore = createRecordAnalysisStore({
    mapRecord: (mappedInput) => mapMahjongSoulRecord({ ...mappedInput, bundle }),
    replay: replayCanonicalStream,
  });
  const recordIngestionService = createMahjongSoulRecordIngestionService({
    vault,
    catalogStore,
    createSession: createLobbySessionFactory({ bundle }),
    authenticate: authenticateStoredMahjongSoulSession,
    fetchRecord: async (lobby, stored, recordId) => {
      const fetched = await fetchMahjongSoulRecord({
        session: lobby,
        bundle,
        recordId,
        clientVersionString: stored.recoveryContext.clientVersionString,
        fetchImpl: globalThis.fetch,
      });
      const summaries = await catalogStore.list(stored.accountId);
      const summary = summaries.find((entry) => entry.recordId === recordId);
      const outcome = analysisStore.analyzeRecord({
        recordId,
        selfActor: summary?.selfSeat ?? 0,
        recordBytes: fetched.recordBytes,
      });
      if (outcome.status !== "analysis_ready") {
        throw new MahjongSoulSourceError("mahjong_soul_canonical_validation_failed");
      }
      return fetched;
    },
  });
  const service = createMahjongSoulSessionService({
    vault,
    loginProvider,
    sessionRestorer: createMahjongSoulOAuth2SessionRestorer({
      createSession: createLobbySessionFactory({ bundle }),
    }),
    browserSession: partitionSession,
    cancelCatalogSync: () => catalogService.cancelAndDrain(),
    resumeCatalogSync: () => catalogService.resume(),
    clearCatalog: () => catalogStore.clear(),
    clock: Date.now,
  });
  // The paipu-URL ingestion route: official-client capture on the app's
  // persistent (already authenticated) Mahjong Soul session, converging on
  // the same shared analysis store as the account/catalog route.
  const paipuImportService = createMahjongSoulPaipuImportService({
    bundle,
    analysis: analysisStore,
    createWindow: createOfficialClientCaptureWindow,
    timeoutMs: 240_000,
  });
  await service.initialize();

  const createMainWindow = async (): Promise<void> => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) return;
    const window = new BrowserWindow({
      ...createMainWindowOptions(preloadPath),
      autoHideMenuBar: true,
    });
    mainWindow = window;
    hardenLocalWindow(window);
    ipcRegistration?.dispose();
    catalogIpcRegistration?.dispose();
    paipuIpcRegistration?.dispose();
    ipcRegistration = registerMahjongSoulIpc({
      ipcMain: ipcMain as unknown as IpcMainPort,
      service,
      trustedSenderId: window.webContents.id,
    });
    catalogIpcRegistration = registerMahjongSoulCatalogIpc({
      ipcMain: ipcMain as unknown as IpcMainPort,
      service: Object.freeze({
        syncAnalyzableRecords: () => catalogService.syncAnalyzableRecords(),
        listAnalyzableRecords: () => catalogService.listAnalyzableRecords(),
        ingest: (recordId: string) => recordIngestionService.ingest(recordId),
      }),
      trustedSenderId: window.webContents.id,
    });
    paipuIpcRegistration = registerMahjongSoulPaipuImportIpc({
      ipcMain: ipcMain as unknown as IpcMainPort,
      service: paipuImportService,
      trustedSenderId: window.webContents.id,
    });
    window.on("closed", () => {
      if (mainWindow === window) mainWindow = null;
      ipcRegistration?.dispose();
      ipcRegistration = null;
      catalogIpcRegistration?.dispose();
      catalogIpcRegistration = null;
      paipuIpcRegistration?.dispose();
      paipuIpcRegistration = null;
    });
    await window.loadURL(rendererUrl);
  };

  await createMainWindow();
  app.on("activate", () => { void createMainWindow(); });
}

const isDiagnosticRun = process.argv.includes("--diagnose-mahjong-soul-restore")
  || process.argv.includes("--diagnose-mahjong-soul-replay")
  || process.argv.includes("--diagnose-mahjong-soul-capture-record");

app.whenReady().then(start).catch((error) => {
  console.error("[riichi-coach] startup failed:", error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  // Diagnostic runs exit explicitly via app.exit() after their one-shot flow.
  // Letting the login window's close trigger app.quit() here would terminate the
  // process before the headless restore and its status line can run.
  if (process.platform !== "darwin" && !isDiagnosticRun) app.quit();
});
