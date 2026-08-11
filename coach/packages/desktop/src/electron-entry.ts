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
  createMahjongSoulSessionVault,
  loadMahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import { createElectronSessionKeyProtector, type SafeStoragePort } from "./electron-safe-storage.js";
import { registerMahjongSoulIpc, type IpcMainPort } from "./ipc.js";
import {
  createElectronMahjongSoulLoginProvider,
  type ElectronLoginWindowPort,
} from "./mahjong-soul-login-window.js";
import { createMahjongSoulSessionService } from "./mahjong-soul-session-service.js";
import {
  createMainWindowOptions,
  isAllowedLocalRendererNavigation,
} from "./main.js";
import { createRecoverableSessionFile } from "./recoverable-session-file.js";

const PARTITION = "persist:riichi-coach-mahjong-soul-cn";
const bundleRoot = fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url));
const preloadPath = fileURLToPath(new URL("./preload-entry.js", import.meta.url));
const rendererUrl = pathToFileURL(
  fileURLToPath(new URL("./renderer/index.html", import.meta.url)),
).href;

let mainWindow: BrowserWindow | null = null;
let ipcRegistration: Readonly<{ dispose(): void }> | null = null;

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
  const service = createMahjongSoulSessionService({
    vault,
    loginProvider,
    browserSession: partitionSession,
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
    ipcRegistration = registerMahjongSoulIpc({
      ipcMain: ipcMain as unknown as IpcMainPort,
      service,
      trustedSenderId: window.webContents.id,
    });
    window.on("closed", () => {
      if (mainWindow === window) mainWindow = null;
      ipcRegistration?.dispose();
      ipcRegistration = null;
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
