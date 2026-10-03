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
  const [ipc, catalogModule] = await Promise.all([
    import(pathToFileURL(join(dist, "ipc.js")).href),
    import(pathToFileURL(join(dist, "catalog-service.js")).href),
  ]);
  let getStatusCalls = 0;
  let reloginCalls = 0;
  let authCalls = 0;
  let vaultClearCalls = 0;
  let catalogReplaceCalls = 0;
  let catalogClearCalls = 0;
  let logoutCalls = 0;
  const authOutcomes = ["rejected", "unverified", "authenticated"];
  const stored = { region: "cn", accountId: 101, displayName: "fixture" };
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
      createSession: async () => ({
        async authenticate() {},
        async call(method) {
          if (method === ".lq.Lobby.fetchGameRecordListV2") {
            return { iterator: "fixture-iterator", iterator_expire: 60, actual_begin_time: 1, actual_end_time: 2 };
          }
          if (method === ".lq.Lobby.fetchNextGameRecordList") return { next: false, entries: [], iterator_expire: 60 };
          throw new Error("unexpected lobby request");
        },
        async close() {},
      }),
      async authenticate() {
        const outcome = authOutcomes[authCalls];
        authCalls += 1;
        return outcome;
      },
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
      clearSourceCache() { return { clearedEntries: 0, pendingMaterials: 0 }; },
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
