const { app, BrowserWindow, ipcMain } = require("electron");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const dist = join(input.repoRoot, "packages", "desktop", "dist");
const status = () => ({
  region: "cn",
  status: "valid",
  displayName: "fixture",
  lastValidatedAt: 1,
});

app.setPath("userData", input.profile);
app.whenReady().then(async () => {
  const [ipc, catalogModule, source] = await Promise.all([
    import(pathToFileURL(join(dist, "ipc.js")).href),
    import(pathToFileURL(join(dist, "catalog-service.js")).href),
    import(pathToFileURL(join(input.repoRoot, "packages", "mahjong-soul-source", "dist", "index.js")).href),
  ]);
  let getStatusCalls = 0;
  let reloginCalls = 0;
  let authCalls = 0;
  let vaultClearCalls = 0;
  let catalogReplaceCalls = 0;
  let catalogClearCalls = 0;
  let logoutCalls = 0;
  let sourceCacheClearCalls = 0;
  let checkCalls = 0;
  let loginCalls = 0;
  let catalogCalls = 0;
  let authenticationPayloadsValid = true;
  const stored = {
    region: "cn", loginMethod: "login", authType: 0, accountId: 101,
    displayName: "fixture", accessToken: source.SecretString.from("fixture-raw-secret"),
    adapterVersion: "0.1.0", clientVersion: "0.11.252.w", createdAt: 1, lastValidatedAt: 1,
    recoveryContext: {
      device: { platform: "pc", hardware: "pc", os: "windows", osVersion: "10", isBrowser: true, software: "Chrome", salePlatform: "web", hardwareVendor: "fixture", modelNumber: "fixture", screenWidth: 1, screenHeight: 1, userAgent: "fixture", screenType: 0 },
      clientVersion: { resource: "0.11.252.w", package: "" },
      currencyPlatforms: [2], version: 1, clientVersionString: "web-0.11.252.w", tag: "chs_t",
    },
  };
  const catalog = catalogModule.createMahjongSoulCatalogService({
    vault: {
      async restore() { return stored; },
      async save() {},
      async markValidated() {},
      async clear() { vaultClearCalls += 1; },
    },
    catalogStore: {
      async replaceSummaries() { catalogReplaceCalls += 1; },
      async list() { return []; },
      async clear() { catalogClearCalls += 1; },
    },
    sessionFactory: catalogModule.createMahjongSoulCatalogSessionFactory({
      createSession: async () => {
        const attempt = authCalls++;
        return {
        async authenticate() { throw new Error("legacy authentication is outside production restore"); },
        async call(method, payload) {
          if (method === ".lq.Lobby.oauth2Check" || method === ".lq.Lobby.oauth2Login") {
            authenticationPayloadsValid &&= payload.type === stored.authType && payload.access_token === stored.accessToken.reveal();
          }
          if (method === ".lq.Lobby.oauth2Check") {
            checkCalls += 1;
            if (attempt === 0) return { error: { code: 151 }, has_account: false };
            if (attempt === 1) {
              if (input.unknownMode === "transport_exception") throw new Error("private upstream prose");
              if (input.unknownMode === "invalid_error_no_account") return { error: { code: "unknown" }, has_account: false };
              return { error: null };
            }
            return { error: null, has_account: true };
          }
          if (method === ".lq.Lobby.oauth2Login") {
            loginCalls += 1;
            return { error: null, account_id: stored.accountId };
          }
          if (method.startsWith(".lq.Lobby.fetch")) catalogCalls += 1;
          if (method === ".lq.Lobby.fetchGameRecordListV2") {
            return { iterator: "fixture-iterator", iterator_expire: 60, actual_begin_time: 1, actual_end_time: 2 };
          }
          if (method === ".lq.Lobby.fetchNextGameRecordList") return { next: false, entries: [], iterator_expire: 60 };
          throw new Error("unexpected lobby request");
        },
        async close() {},
        };
      },
      authenticate: source.authenticateStoredMahjongSoulSession,
    }),
    clock: () => 2_000,
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: join(dist, "preload.bundle.cjs"),
    },
  });
  const sessionRegistration = ipc.registerMahjongSoulIpc({
    ipcMain,
    trustedSenderId: window.webContents.id,
    service: {
      async getStatus() { getStatusCalls += 1; return status(); },
      async openLogin() { reloginCalls += 1; return status(); },
      async logout() { logoutCalls += 1; return { region: "cn", status: "logged_out" }; },
    },
  });
  const catalogRegistration = ipc.registerMahjongSoulCatalogIpc({
    ipcMain,
    trustedSenderId: window.webContents.id,
    service: {
      ...catalog,
      async ingest() { throw new Error("analysis is outside this harness"); },
      clearSourceCache() { sourceCacheClearCalls += 1; return { clearedEntries: 0, pendingMaterials: 0 }; },
    },
  });
  try {
    await window.loadURL(pathToFileURL(join(dist, "renderer", "index.html")).href);
    const rejected = await window.webContents.executeJavaScript(`(async () => {
      const settle = async () => {
        for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      };
      await settle();
      const initialStatus = document.querySelector("#status").textContent;
      const initialDetail = document.querySelector("#detail").textContent;
      const initialLoginHidden = document.querySelector("#login").hidden;
      document.querySelector("#sync").click();
      await settle();
      return {
        initialStatus,
        initialDetail,
        initialLoginHidden,
        rejectedStatus: document.querySelector("#status").textContent,
        rejectedDetail: document.querySelector("#detail").textContent,
        rejectedText: document.querySelector("#catalog-detail").textContent,
        rejectedLoginHidden: document.querySelector("#login").hidden,
        rejectedLoginLabel: document.querySelector("#login").textContent,
        rejectedSyncHidden: document.querySelector("#sync").hidden,
        rejectedSyncDisabled: document.querySelector("#sync").disabled,
        rejectedLoginDisabled: document.querySelector("#login").disabled,
        leakedText: /fixture-raw-secret|private upstream prose|mahjong_soul_session_invalid|mahjong_soul_catalog_sync_failed/.test(document.body.textContent),
      };
    })()`);
    const afterReject = {
      ...rejected,
      getStatusCallsAfterReject: getStatusCalls,
      vaultClearCallsAfterReject: vaultClearCalls,
      catalogReplaceCallsAfterReject: catalogReplaceCalls,
      catalogClearCallsAfterReject: catalogClearCalls,
      logoutCallsAfterReject: logoutCalls,
      sourceCacheClearCallsAfterReject: sourceCacheClearCalls,
      checkCallsAfterReject: checkCalls,
      loginCallsAfterReject: loginCalls,
      catalogCallsAfterReject: catalogCalls,
    };
    const reconnected = await window.webContents.executeJavaScript(`(async () => {
      const settle = async () => {
        for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      };
      document.querySelector("#login").click();
      await settle();
      return {
        unverifiedStatus: document.querySelector("#status").textContent,
        unverifiedDetail: document.querySelector("#detail").textContent,
        unverifiedText: document.querySelector("#catalog-detail").textContent,
        loginHiddenAfterUnverified: document.querySelector("#login").hidden,
        syncHiddenAfterUnverified: document.querySelector("#sync").hidden,
        syncDisabledAfterUnverified: document.querySelector("#sync").disabled,
      };
    })()`);
    const afterUnverified = {
      authCallsAfterUnverified: authCalls,
      getStatusCallsAfterUnverified: getStatusCalls,
      vaultClearCallsAfterUnverified: vaultClearCalls,
      catalogReplaceCallsAfterUnverified: catalogReplaceCalls,
      catalogClearCallsAfterUnverified: catalogClearCalls,
      logoutCallsAfterUnverified: logoutCalls,
      sourceCacheClearCallsAfterUnverified: sourceCacheClearCalls,
      checkCallsAfterUnverified: checkCalls,
      loginCallsAfterUnverified: loginCalls,
      catalogCallsAfterUnverified: catalogCalls,
    };
    const recovered = await window.webContents.executeJavaScript(`(async () => {
      const settle = async () => {
        for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      };
      document.querySelector("#sync").click();
      await settle();
      return {
        recoveredStatus: document.querySelector("#status").textContent,
        recoveredDetail: document.querySelector("#detail").textContent,
        loginHiddenAfterRecovery: document.querySelector("#login").hidden,
        loginLabelAfterRecovery: document.querySelector("#login").textContent,
        catalogTextAfterRecovery: document.querySelector("#catalog-detail").textContent,
        syncHiddenAfterRecovery: document.querySelector("#sync").hidden,
        syncDisabledAfterRecovery: document.querySelector("#sync").disabled,
      };
    })()`);
    const result = {
      ...afterReject,
      ...reconnected,
      ...afterUnverified,
      ...recovered,
      reloginCalls,
      authCalls,
      catalogReplaceCallsAfterRecovery: catalogReplaceCalls,
      vaultClearCallsAfterRecovery: vaultClearCalls,
      catalogClearCallsAfterRecovery: catalogClearCalls,
      logoutCallsAfterRecovery: logoutCalls,
      sourceCacheClearCallsAfterRecovery: sourceCacheClearCalls,
      checkCallsAfterRecovery: checkCalls,
      loginCallsAfterRecovery: loginCalls,
      catalogCallsAfterRecovery: catalogCalls,
      authenticationPayloadsValid,
    };
    console.log(`CATALOG_RECOVERY_RESULT=${JSON.stringify(result)}`);
  } finally {
    catalogRegistration.dispose();
    sessionRegistration.dispose();
    window.destroy();
  }
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
