export interface MainWindowOptions {
  readonly width: 920;
  readonly height: 680;
  readonly show: true;
  readonly webPreferences: Readonly<{
    preload: string;
    contextIsolation: true;
    sandbox: true;
    nodeIntegration: false;
    webviewTag: false;
    navigateOnDragDrop: false;
  }>;
}

export function createMainWindowOptions(preloadPath: string): MainWindowOptions {
  if (typeof preloadPath !== "string" || preloadPath.length === 0 || preloadPath.includes("\0")) {
    throw new Error("mahjong_soul_login_protocol_unsupported");
  }
  return Object.freeze({
    width: 920,
    height: 680,
    show: true,
    webPreferences: Object.freeze({
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      navigateOnDragDrop: false,
    }),
  });
}

export function isAllowedLocalRendererNavigation(
  candidate: string,
  expected: string,
): boolean {
  return typeof candidate === "string"
    && typeof expected === "string"
    && candidate === expected;
}
