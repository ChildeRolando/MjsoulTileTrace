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
  createMahjongSoulCatalogStore,
  createMahjongSoulSessionVault,
  createMahjongSoulOAuth2SessionRestorer,
  authenticateStoredMahjongSoulSession,
  fetchMahjongSoulRecord,
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
} from "@riichi-coach/mahjong-soul-source";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import {
  replayCanonicalStream,
  type ReplayedDecision,
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
  restoreDiagnosticExitCode,
  runMahjongSoulRestoreDiagnostic,
} from "./restore-diagnostic-runner.js";
import { createMahjongSoulSessionService } from "./mahjong-soul-session-service.js";
import {
  createMainWindowOptions,
  isAllowedLocalRendererNavigation,
} from "./main.js";
import { createRecoverableSessionFile } from "./recoverable-session-file.js";
import { createMahjongSoulRecordIngestionService } from "./record-ingestion-service.js";

const PARTITION = "persist:riichi-coach-mahjong-soul-cn";
const bundleRoot = fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url));
const preloadPath = fileURLToPath(new URL("./preload.bundle.cjs", import.meta.url));
const rendererUrl = pathToFileURL(
  fileURLToPath(new URL("./renderer/index.html", import.meta.url)),
).href;

let mainWindow: BrowserWindow | null = null;
let ipcRegistration: Readonly<{ dispose(): void }> | null = null;
let catalogIpcRegistration: Readonly<{ dispose(): void }> | null = null;

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
  if (process.argv.includes("--diagnose-mahjong-soul-restore")) {
    const result = await runMahjongSoulRestoreDiagnostic({
      loginProvider,
      createSession: createLobbySessionFactory({ bundle }),
      bundle,
      now: Date.now,
    });
    console.log(`[riichi-coach] mahjong-soul-restore:${result.status}`);
    app.exit(restoreDiagnosticExitCode(result.status));
    return;
  }
  const partitionSession = session.fromPartition(PARTITION, { cache: true });
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
  const mappedRecords = new Map<string, CanonicalEventStream>();
  const replayedRecords = new Map<string, ReplayedDecision[]>();
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
      const mapped = mapMahjongSoulRecord({
        gameId: `majsoul:${recordId}`,
        selfActor: summary?.selfSeat ?? 0,
        recordId,
        recordBytes: fetched.recordBytes,
        bundle,
      });
      if (mapped.status !== "ready") {
        throw new MahjongSoulSourceError("mahjong_soul_canonical_validation_failed");
      }
      mappedRecords.set(recordId, mapped.stream);
      replayedRecords.set(recordId, replayCanonicalStream(mapped.stream));
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
    window.on("closed", () => {
      if (mainWindow === window) mainWindow = null;
      ipcRegistration?.dispose();
      ipcRegistration = null;
      catalogIpcRegistration?.dispose();
      catalogIpcRegistration = null;
    });
    await window.loadURL(rendererUrl);
  };

  await createMainWindow();
  app.on("activate", () => { void createMainWindow(); });
}

app.whenReady().then(start).catch(() => {
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
