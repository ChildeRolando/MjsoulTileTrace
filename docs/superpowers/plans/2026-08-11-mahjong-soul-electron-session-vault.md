# Mahjong Soul Electron Session and Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver M5-B: a cross-platform Electron shell that opens the Mahjong Soul CN official page in an isolated session, captures only a correlated successful login result, keeps the token in the main process, encrypts it across restarts with the operating-system security backend, restores session status conservatively, and clears session data on logout.

**Architecture:** Keep protocol parsing and secret-bearing domain logic in `@riichi-coach/mahjong-soul-source`; add a separate private `@riichi-coach/desktop` workspace for Electron adapters, the login window, the encrypted on-disk store, IPC, preload, and the minimal renderer. The renderer receives only `MahjongSoulSessionStatus`. Login capture uses the verified M5-A bundle and Chrome DevTools Protocol WebSocket events; the vault uses AES-256-GCM with a random 256-bit session key wrapped by Electron `safeStorage`. M5-B does not fetch the recent catalog or any game record.

**Tech Stack:** Electron 43.3.0, TypeScript 5.9, Node.js crypto/fs, Zod 3.25, protobufjs 8.7 via the existing privileged package, Vitest 3.2, Electron `safeStorage`, isolated `session` partitions, and `webContents.debugger` CDP events.

**Approved design:** `docs/superpowers/specs/2026-08-11-mahjong-soul-account-sync-design.md`

**M5-A handoff:** `docs/superpowers/handoffs/2026-08-11-mahjong-soul-protocol-contracts-handoff.md`

**Official Electron references:**

- `https://www.electronjs.org/docs/latest/tutorial/security`
- `https://www.electronjs.org/docs/latest/api/safe-storage`
- `https://www.electronjs.org/docs/latest/api/session`
- `https://www.electronjs.org/docs/latest/api/web-contents`
- `https://www.electronjs.org/docs/latest/api/debugger`

---

## File structure

### Existing privileged package

- `packages/mahjong-soul-source/src/session-vault.ts` — strict encrypted session payload, AES-GCM, key-protector and store ports.
- `packages/mahjong-soul-source/src/login-capture.ts` — stateful client/server frame capture, correlated login success/rejection, no Electron dependency.
- `packages/mahjong-soul-source/src/session-controller.ts` — login/restore/logout state machine over ports.
- `packages/mahjong-soul-source/src/index.ts` — exports only the privileged M5-B types/functions required by desktop main.
- matching focused tests under `packages/mahjong-soul-source/tests/`.

### New Electron package

- `packages/desktop/package.json`, `tsconfig.json`, `tsconfig.build.json` — private Electron workspace.
- `packages/desktop/src/electron-safe-storage.ts` — secure-backend guard and session-key wrapping.
- `packages/desktop/src/recoverable-session-file.ts` — crash-recoverable exclusive session-vault file transaction.
- `packages/desktop/src/cdp-login-observer.ts` — CDP/WebSocket adapter only.
- `packages/desktop/src/mahjong-soul-login-window.ts` — isolated partition, URL/request/permission/download/window policy.
- `packages/desktop/src/mahjong-soul-session-service.ts` — wires provider, vault, controller and partition cleanup.
- `packages/desktop/src/ipc.ts` — fixed safe IPC handlers.
- `packages/desktop/src/preload.ts` — narrow context bridge.
- `packages/desktop/src/main.ts` — Electron lifecycle and two BrowserWindows.
- `packages/desktop/src/renderer/index.html`, `app.ts`, `styles.css` — minimal status/login/logout surface; no token-bearing input.
- `packages/desktop/scripts/copy-renderer.mjs` — copies only the local HTML/CSS assets into `dist/renderer` after TypeScript compilation.
- matching focused tests under `packages/desktop/tests/` with injected Electron-shaped fakes.

### Workspace and documentation

- `package.json`, `package-lock.json` — pin Electron 43.3.0, add desktop build/typecheck/test/run scripts.
- `smoke/package-import-smoke.mjs` — emitted desktop-safe module import smoke without starting Electron.
- `coach/README.md`, product roadmap, and a new M5-B handoff — accurate boundary and H1 checklist.

---

### Task 1: Add the private Electron workspace and safe IPC contract

**Files:**

- Modify: `coach/package.json`
- Modify: `coach/package-lock.json`
- Create: `coach/packages/desktop/package.json`
- Create: `coach/packages/desktop/tsconfig.json`
- Create: `coach/packages/desktop/tsconfig.build.json`
- Create: `coach/packages/desktop/src/session-api.ts`
- Create: `coach/packages/desktop/tests/session-api.test.ts`

- [ ] **Step 1: Write the failing API test**

Create a test that imports `MahjongSoulDesktopApiSchema`, parses an API whose three methods return only `MahjongSoulSessionStatus`, and rejects any result with `accessToken`, `cookie`, `authorization`, `rawFrame`, or unknown keys. The public shape is:

```ts
export interface MahjongSoulDesktopApi {
  getSessionStatus(): Promise<MahjongSoulSessionStatus>;
  openMahjongSoulLogin(): Promise<MahjongSoulSessionStatus>;
  logoutMahjongSoul(): Promise<MahjongSoulSessionStatus>;
}
```

Do not add catalog methods in M5-B.

- [ ] **Step 2: Run RED**

```powershell
cd coach
npx vitest run packages/desktop/tests/session-api.test.ts
```

Expected: collection fails because `packages/desktop/src/session-api.ts` does not exist.

- [ ] **Step 3: Add the workspace and schema**

Pin these package relationships exactly:

```json
{
  "name": "@riichi-coach/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@riichi-coach/contracts": "0.1.0",
    "@riichi-coach/mahjong-soul-source": "0.1.0",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "electron": "43.3.0"
  }
}
```

`session-api.ts` must parse every returned status with the existing `MahjongSoulSessionStatusSchema`; it must never define a generic `invoke(channel, payload)` renderer API.

- [ ] **Step 4: Extend normal build gates**

Add desktop last in `build` and `typecheck`, add a focused `test:desktop`, and add `desktop` as:

```json
"desktop": "npm run build && electron packages/desktop/dist/main.js"
```

Do not add a remote debugging port or command-line switch.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npx vitest run packages/desktop/tests/session-api.test.ts
npm run typecheck
git add -- package.json package-lock.json packages/desktop/package.json packages/desktop/tsconfig.json packages/desktop/tsconfig.build.json packages/desktop/src/session-api.ts packages/desktop/tests/session-api.test.ts
git commit -m "build: add the Electron desktop boundary"
```

---

### Task 2: Implement the encrypted session-vault domain

**Files:**

- Create: `coach/packages/mahjong-soul-source/src/session-vault.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`
- Create: `coach/packages/mahjong-soul-source/tests/session-vault.test.ts`

- [ ] **Step 1: Write failing vault tests**

Use only fake tokens. Cover:

- random 32-byte key and 12-byte nonce per save;
- AES-256-GCM ciphertext changes for identical credentials;
- authenticated restore of the exact six credential fields plus adapter/client/timestamps;
- tampered wrapped key, nonce, ciphertext, tag, version, adapter or client version fails with `mahjong_soul_session_invalid`;
- key protector unavailable fails with `mahjong_soul_session_storage_unavailable`;
- serialized disk object, thrown errors, JSON, inspect, snapshots and returned safe status contain no token;
- save/restore never mutates the credential or store input;
- `clear()` calls the store deletion boundary and makes restore return `null`;
- unknown file keys and getter/coercion payloads are rejected without invoking attacker methods.

The ports and stored envelope are exact:

```ts
export interface SessionKeyProtector {
  wrap(keyBase64: string): Promise<string>;
  unwrap(wrappedKey: string): Promise<string>;
}

export interface SessionVaultStore {
  read(): Promise<string | null>;
  replace(value: string): Promise<void>;
  clear(): Promise<void>;
}

interface StoredSessionEnvelopeV1 {
  readonly version: "mahjong-soul-session-vault/v1";
  readonly wrappedKey: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly authenticationTag: string;
}
```

- [ ] **Step 2: Run RED**

```powershell
npx vitest run packages/mahjong-soul-source/tests/session-vault.test.ts
```

Expected: missing `session-vault.js`.

- [ ] **Step 3: Implement strict encryption and restore**

`createMahjongSoulSessionVault({protector, store, randomBytes, now})` exposes:

```ts
save(credential: CapturedMahjongSoulCredential): Promise<void>;
restore(): Promise<StoredMahjongSoulSession | null>;
markValidated(at: number): Promise<void>;
clear(): Promise<void>;
```

The encrypted JSON payload contains `region`, `loginMethod`, `authType`, `accountId`, `displayName`, `accessToken`, `adapterVersion`, `clientVersion`, `createdAt`, and `lastValidatedAt`. Validate it before constructing a new `SecretString`. Use one snapshot read per attacker-controlled property. Map every non-storage authentication/shape failure to `mahjong_soul_session_invalid`; never reflect raw crypto or upstream prose.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run packages/mahjong-soul-source/tests/session-vault.test.ts
npm run typecheck
git add -- packages/mahjong-soul-source/src/session-vault.ts packages/mahjong-soul-source/src/index.ts packages/mahjong-soul-source/tests/session-vault.test.ts
git commit -m "feat: encrypt Mahjong Soul session credentials"
```

---

### Task 3: Add secure OS key wrapping and crash-recoverable storage

**Files:**

- Create: `coach/packages/desktop/src/electron-safe-storage.ts`
- Create: `coach/packages/desktop/src/recoverable-session-file.ts`
- Create: `coach/packages/desktop/tests/electron-safe-storage.test.ts`
- Create: `coach/packages/desktop/tests/recoverable-session-file.test.ts`

- [ ] **Step 1: Write `safeStorage` RED tests**

Inject a minimal adapter rather than mocking the Electron module globally:

```ts
interface SafeStoragePort {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<string>;
}
```

Assert Windows and macOS accept an available backend; Linux accepts `gnome_libsecret`, `kwallet`, `kwallet5`, or `kwallet6`; Linux rejects `basic_text` and `unknown`; every unavailable/decrypt/tamper error becomes `mahjong_soul_session_storage_unavailable`; base64 is canonical; inputs and errors are not logged or interpolated.

- [ ] **Step 2: Write file-store RED tests**

Use a temporary parent directory and cover:

- first write, replacement, read and clear;
- exactly one fixed lock held across recovery/write/switch/cleanup;
- sibling staging + backup transaction and next-start recovery;
- old complete value or new complete value after each injected crash point, never partial JSON;
- concurrent invocation fails closed and cannot delete another invocation's live artifacts;
- owner-verified atomic unlock rename before best-effort cleanup;
- symlink/junction/reparse ancestors and non-regular files rejected;
- file size capped at 64 KiB before allocation;
- files created with owner-only permissions where the OS supports them;
- clear removes active/backup/staging session artifacts but never traverses outside the application-owned vault directory.

- [ ] **Step 3: Run RED**

```powershell
npx vitest run packages/desktop/tests/electron-safe-storage.test.ts packages/desktop/tests/recoverable-session-file.test.ts
```

- [ ] **Step 4: Implement adapters**

Use the async Electron APIs. The protector wraps only the random session key encoded as canonical base64. `RecoverableSessionFile` owns `<userData>/mahjong-soul/session/`; no caller-provided path or filename enters its operations.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npx vitest run packages/desktop/tests/electron-safe-storage.test.ts packages/desktop/tests/recoverable-session-file.test.ts
npm run typecheck
git add -- packages/desktop/src/electron-safe-storage.ts packages/desktop/src/recoverable-session-file.ts packages/desktop/tests/electron-safe-storage.test.ts packages/desktop/tests/recoverable-session-file.test.ts
git commit -m "feat: persist sessions with OS-backed encryption"
```

---

### Task 4: Capture only correlated login frames

**Files:**

- Create: `coach/packages/mahjong-soul-source/src/login-capture.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`
- Create: `coach/packages/mahjong-soul-source/tests/login-capture.test.ts`
- Create: `coach/packages/desktop/src/cdp-login-observer.ts`
- Create: `coach/packages/desktop/tests/cdp-login-observer.test.ts`

- [ ] **Step 1: Write pure capture RED tests**

Feed the committed fake-token frame fixture through `createLiqiCodec`. Cover client request before response, exact request ID correlation, login and oauth2Login separately, ignored unrelated methods, fixed authentication rejection, duplicate/response-before-request/unknown frame poisoning, expected login method and account binding during restore, and close-after-terminal-result.

The safe result union is:

```ts
type LoginCaptureResult =
  | { readonly status: "authenticated"; readonly credential: CapturedMahjongSoulCredential }
  | { readonly status: "rejected" };
```

No numeric upstream error code or payload is returned.

- [ ] **Step 2: Write CDP adapter RED tests**

Use a fake debugger port. Assert:

- it attaches without opening a remote debugging port;
- enables `Network` and maps `Network.webSocketCreated` request IDs to an exact allowlisted WSS origin;
- accepts only opcode 2 binary `payloadData` decoded from canonical base64;
- sent frames go to `decodeClientFrame`, received frames go to `decodeServerFrame`;
- frames for an unknown, non-allowlisted, changed-origin, text, malformed-base64, oversized or closed socket fail closed;
- detach and codec close happen exactly once on result, cancellation and error;
- CDP errors and hostile parameters become fixed `mahjong_soul_login_protocol_unsupported`.

- [ ] **Step 3: Run RED**

```powershell
npx vitest run packages/mahjong-soul-source/tests/login-capture.test.ts packages/desktop/tests/cdp-login-observer.test.ts
```

- [ ] **Step 4: Implement and run GREEN**

The adapter receives `bundle.endpoints.lobbyWebSocketOrigins`; it must not accept a caller-supplied broader host set. It never logs frame bytes or decoded payloads.

```powershell
npx vitest run packages/mahjong-soul-source/tests/login-capture.test.ts packages/desktop/tests/cdp-login-observer.test.ts
npm run typecheck
git add -- packages/mahjong-soul-source/src/login-capture.ts packages/mahjong-soul-source/src/index.ts packages/mahjong-soul-source/tests/login-capture.test.ts packages/desktop/src/cdp-login-observer.ts packages/desktop/tests/cdp-login-observer.test.ts
git commit -m "feat: observe correlated Mahjong Soul logins"
```

---

### Task 5: Build the isolated official login window

**Files:**

- Create: `coach/packages/desktop/src/mahjong-soul-login-window.ts`
- Create: `coach/packages/desktop/tests/mahjong-soul-login-window.test.ts`

- [ ] **Step 1: Write policy RED tests**

With Electron-shaped fakes, assert the window uses:

```ts
{
  webPreferences: {
    partition: "persist:riichi-coach-mahjong-soul-cn",
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    navigateOnDragDrop: false,
  },
}
```

Assert:

- initial URL is exactly `https://game.maj-soul.com/1/`;
- main/subframe navigation is limited to the exact login-page origin and HTTPS;
- request filtering allows only manifest-owned login/static/gateway-discovery HTTPS and fixed lobby WSS origins;
- `blob:` is accepted only when its embedded origin is the official login origin;
- `data:`, `file:`, `javascript:`, arbitrary HTTPS/WSS, normalized lookalikes, credentials in URLs, fragments that alter identity, and redirects outside policy are blocked;
- every permission request/check is denied;
- downloads are cancelled;
- new windows and webviews are denied;
- no preload is attached to the remote window;
- close, load failure, timeout, explicit rejection and success each detach the observer once;
- visible interactive mode and hidden restore mode use the same partition and security policy.

- [ ] **Step 2: Run RED**

```powershell
npx vitest run packages/desktop/tests/mahjong-soul-login-window.test.ts
```

- [ ] **Step 3: Implement `ElectronLoginProvider`**

Expose:

```ts
run(input: {
  readonly mode: "interactive" | "restore";
  readonly expected?: {
    readonly loginMethod: "login" | "oauth2Login";
    readonly accountId: number;
  };
}): Promise<
  | { readonly status: "authenticated"; readonly credential: CapturedMahjongSoulCredential }
  | { readonly status: "rejected" }
  | { readonly status: "unverified" }
  | { readonly status: "cancelled" }
>;
```

`unverified` covers load/network failure and a bounded hidden restore timeout; it must not delete a stored credential. `rejected` requires an explicitly correlated login rejection. An interactive user close is `cancelled`.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run packages/desktop/tests/mahjong-soul-login-window.test.ts
npm run typecheck
git add -- packages/desktop/src/mahjong-soul-login-window.ts packages/desktop/tests/mahjong-soul-login-window.test.ts
git commit -m "feat: isolate the Mahjong Soul login window"
```

---

### Task 6: Implement restore, login and logout lifecycle

**Files:**

- Create: `coach/packages/mahjong-soul-source/src/session-controller.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`
- Create: `coach/packages/mahjong-soul-source/tests/session-controller.test.ts`
- Create: `coach/packages/desktop/src/mahjong-soul-session-service.ts`
- Create: `coach/packages/desktop/tests/mahjong-soul-session-service.test.ts`

- [ ] **Step 1: Write controller RED tests**

Test the exact state machine:

```text
no vault -> logged_out
interactive start -> authenticating
captured+saved -> valid
vault restore -> session_validating
same method+account captured -> valid and lastValidatedAt updated
restore load/network/timeout -> offline_unverified, vault preserved
explicit correlated rejection -> logged_out, vault cleared
method/account mismatch -> logged_out, vault cleared
logout -> logged_out after vault and partition clear
```

Also cover single-flight login, close/cancel returns the prior safe status, save failure never reports valid, status values are frozen/strict, getter attacks are snapshotted, and no thrown error contains token/display-name/upstream prose.

- [ ] **Step 2: Write desktop service RED tests**

Verify logout order closes the active login/observer, clears the isolated partition with session `clearStorageData` and `clearCache`, and only then clears the vault. M5-B has no catalog store or direct RPC connection, so the service must not invent either one or touch completed reports. A partition-clear error preserves the vault, returns the fixed storage-unavailable error and does not report a false logged-out success.

- [ ] **Step 3: Run RED**

```powershell
npx vitest run packages/mahjong-soul-source/tests/session-controller.test.ts packages/desktop/tests/mahjong-soul-session-service.test.ts
```

- [ ] **Step 4: Implement and run GREEN**

The controller takes `vault`, `loginProvider`, `clearBrowserSession`, and `clock` ports. It never imports Electron. The desktop service supplies the concrete ports and owns the one controller instance.

```powershell
npx vitest run packages/mahjong-soul-source/tests/session-controller.test.ts packages/desktop/tests/mahjong-soul-session-service.test.ts
npm run typecheck
git add -- packages/mahjong-soul-source/src/session-controller.ts packages/mahjong-soul-source/src/index.ts packages/mahjong-soul-source/tests/session-controller.test.ts packages/desktop/src/mahjong-soul-session-service.ts packages/desktop/tests/mahjong-soul-session-service.test.ts
git commit -m "feat: manage Mahjong Soul session lifecycle"
```

---

### Task 7: Wire safe IPC, preload and the minimal desktop shell

**Files:**

- Create: `coach/packages/desktop/src/ipc.ts`
- Create: `coach/packages/desktop/src/preload.ts`
- Create: `coach/packages/desktop/src/main.ts`
- Create: `coach/packages/desktop/src/renderer/index.html`
- Create: `coach/packages/desktop/src/renderer/app.ts`
- Create: `coach/packages/desktop/src/renderer/styles.css`
- Create: `coach/packages/desktop/scripts/copy-renderer.mjs`
- Modify: `coach/packages/desktop/package.json`
- Create: `coach/packages/desktop/tests/ipc.test.ts`
- Create: `coach/packages/desktop/tests/preload.test.ts`
- Create: `coach/packages/desktop/tests/main-security.test.ts`

- [ ] **Step 1: Write IPC/preload RED tests**

Allow exactly these channels:

```ts
"mahjong-soul:get-session-status"
"mahjong-soul:open-login"
"mahjong-soul:logout"
```

Handlers accept no payload, parse every result through `MahjongSoulSessionStatusSchema`, map failures to the existing fixed source error codes, and never return `Error`, stack, account ID, token, Cookie, header or frame data. Preload exposes only the three named functions from Task 1.

- [ ] **Step 2: Write main-window RED tests**

The local main window uses `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a fixed local preload path, denies new windows/navigation away from the packaged local UI, and registers IPC only after `app.whenReady()`. `activate` recreates only the main window; `window-all-closed` follows platform convention. No remote content is loaded in the main window.

- [ ] **Step 3: Implement the renderer**

Render only five safe states and three controls: status, “登录雀魂”, “退出账号”, and retry refresh. Never render or accept a token/account-ID field. Disable duplicate actions while a command is pending. Use plain local HTML/CSS/TypeScript; no frontend framework is added in M5-B. `main.ts` loads `new URL("./renderer/index.html", import.meta.url)` from `dist`; the package build runs TypeScript first and then `copy-renderer.mjs`, which copies only `index.html` and `styles.css` to `dist/renderer` while `tsc` emits `app.js` there.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx vitest run packages/desktop/tests/ipc.test.ts packages/desktop/tests/preload.test.ts packages/desktop/tests/main-security.test.ts
npm run typecheck
git add -- packages/desktop/package.json packages/desktop/src/ipc.ts packages/desktop/src/preload.ts packages/desktop/src/main.ts packages/desktop/src/renderer/index.html packages/desktop/src/renderer/app.ts packages/desktop/src/renderer/styles.css packages/desktop/scripts/copy-renderer.mjs packages/desktop/tests/ipc.test.ts packages/desktop/tests/preload.test.ts packages/desktop/tests/main-security.test.ts
git commit -m "feat: expose Mahjong Soul login in Electron"
```

---

### Task 8: Add cross-platform restart/security integration gates

**Files:**

- Create: `coach/packages/desktop/tests/session-restart.integration.test.ts`
- Create: `coach/packages/desktop/tests/security-boundary.integration.test.ts`
- Modify: `coach/smoke/package-import-smoke.mjs`
- Modify: `coach/package.json`

- [ ] **Step 1: Write the restart RED test**

Create the first service instance with fake safeStorage and fake login provider, save a fake credential, dispose all in-memory objects, then create a second instance over the same temporary user-data directory. Assert it enters `session_validating`, accepts only the same method/account capture, becomes `valid`, and can log out. Inspect every file and emitted result: the fake token must not appear in plaintext.

- [ ] **Step 2: Write the boundary RED test**

Instrument logging, IPC, renderer calls, thrown errors, crash-shaped serialization, inspect, JSON, snapshots, session status and filesystem reads. Assert the token, Cookie, authorization header, raw request/response frames, account ID and hostile upstream prose do not cross the main-process privileged boundary. Assert no `fetch`, `WebSocket`, catalog RPC or game-record RPC is called by M5-B tests.

- [ ] **Step 3: Extend package/import gates**

Run desktop tests in normal `npm test`; import only `session-api.js` and other Electron-free emitted modules in the Node smoke. Do not import `main.js` in plain Node.

- [ ] **Step 4: Run the full automated matrix**

```powershell
cd coach
npm test
npm run typecheck
npm run test:package-import
npm audit --omit=dev
cd ..
node --test tests/*.mjs
cd coach/tools/mahjong-facts
& 'C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin\go.exe' test ./... -count=1
& 'C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin\go.exe' vet ./...
```

- [ ] **Step 5: Run a fresh read-only security review**

Require zero Critical/Important findings on token redaction, safeStorage fallback, vault crash behavior, navigation/request policy, CDP correlation, renderer/IPC shape, restore semantics and logout deletion. Fix each finding with a new observed RED before GREEN.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/desktop/tests/session-restart.integration.test.ts packages/desktop/tests/security-boundary.integration.test.ts smoke/package-import-smoke.mjs package.json
git commit -m "test: verify secure Mahjong Soul session restart"
```

---

### Task 9: Perform H1 and hand off M5-B

**Files:**

- Modify: `coach/README.md`
- Modify: `docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md`
- Create: `docs/superpowers/handoffs/2026-08-11-mahjong-soul-electron-session-handoff.md`

- [ ] **Step 1: Run pre-H1 characterization**

Start the Electron app with a fresh application data directory. Verify the renderer shows `logged_out`, the login window opens only `https://game.maj-soul.com/1/`, blocked navigation/download/permission attempts remain blocked, and closing without login returns to `logged_out`. Do not use a real account yet.

- [ ] **Step 2: Ask the user to perform H1**

The user personally enters credentials and any verification only in the official page. The agent must not request a token, password, screenshot of developer tools, Cookie, local-storage export, or raw frame.

H1 passes only when the user confirms all of the following:

1. official CN login succeeds in the isolated window;
2. the main UI shows only the safe display name/status;
3. after a full app restart the session becomes `valid` or conservatively `offline_unverified`, never silently logged out because of temporary network failure;
4. logout clears the official-page session and encrypted session vault;
5. reopening login after logout requires official authentication again;
6. completed local analysis assets, if present, remain untouched.

- [ ] **Step 3: Treat missing official ancillary hosts as a new pinned-policy change**

If the official login fails because a CAPTCHA or identity resource is blocked, record only the blocked origin and resource purpose—never query data or token—and stop. Add that exact official origin to the versioned source lock/endpoint policy only in a separate RED→GREEN protocol update with source evidence and reviewer approval. Never add wildcard hosts or bypass certificate errors.

- [ ] **Step 4: Write the handoff**

Record exact commits, tests, Electron version, protocol identity, supported OS architecture, H1 result, remaining limitations, and explicit next scope: M5-C recent-30 catalog synchronization with only analyzable four-player South entries. State that M5-B does not yet provide a record list.

- [ ] **Step 5: Final gates and commit**

```powershell
cd coach
npm test
npm run typecheck
npm run test:package-import
npm audit --omit=dev
git diff --check -- coach/README.md docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md docs/superpowers/handoffs/2026-08-11-mahjong-soul-electron-session-handoff.md
git add -- coach/README.md docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md docs/superpowers/handoffs/2026-08-11-mahjong-soul-electron-session-handoff.md
git commit -m "docs: hand off Mahjong Soul Electron sessions"
```

---

## Plan self-review

- **Spec coverage:** M5-B covers the Electron shell, isolated official login, correlated login capture, main-process-only secret handling, OS-backed encrypted persistence, cross-restart validation, conservative offline behavior, logout deletion, safe IPC and H1. Recent catalog, game-record fetching and canonical mapping remain explicitly outside this plan.
- **Trust boundary:** renderer, IPC, logs, reports, tests and errors never receive tokens, account IDs, Cookies, headers or raw frames. Only the main-process provider, vault and later official RPC adapter can reveal `SecretString`.
- **Cross-platform:** Electron/safeStorage is used on Windows, macOS and Linux; Linux `basic_text` and `unknown` are hard failures, not plaintext fallback.
- **Protocol consistency:** both login methods remain discriminated; restore accepts only the same method and account. M5-B does not claim the two token types are interchangeable.
- **No placeholders:** each task names exact files, APIs, negative paths, commands and commit boundary.
- **H1 boundary:** all automated tests use fake secrets. Real credentials are entered only by the user in the official Electron page.
