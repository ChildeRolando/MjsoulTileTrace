# Mahjong Soul OAuth2 Restore Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove or disprove, without exposing credentials, whether a CN password-login access token can establish a fresh Lobby session through the official `oauth2Check → oauth2Login` sequence.

**Architecture:** Keep login capture, network discovery/transport, protocol authentication, and diagnostic orchestration as separate strict units. The diagnostic is capability-gated and does not enable renderer catalog sync; it returns only frozen project-owned stage codes and always closes its fresh Lobby connection.

**Tech Stack:** TypeScript, Electron 43, protobufjs, Vitest, existing verified Mahjong Soul CN bundle.

---

### Task 1: Define the diagnostic result and captured recovery context

**Files:**
- Modify: `coach/packages/mahjong-soul-source/src/login-result.ts`
- Modify: `coach/packages/mahjong-soul-source/src/liqi-codec.ts`
- Modify: `coach/packages/mahjong-soul-source/tests/login-result.test.ts`
- Modify: `coach/packages/mahjong-soul-source/tests/liqi-codec.test.ts`

- [ ] Add RED tests proving an observed successful login projects only the non-secret OAuth2 request context: device, client version, currency platforms, numeric version, client version string and tag. Assert account, password and random key are absent from JSON, inspect and keys.
- [ ] Run the two focused files and observe failure because the context is absent.
- [ ] Add strict frozen `MahjongSoulOAuth2RecoveryContext`; snapshot each allowed field once and reject unknown/malformed shapes. Never retain `random_key`, account or password.
- [ ] Re-run focused tests and commit `feat: capture safe Mahjong Soul recovery context`.

### Task 2: Implement the OAuth2 restore state machine

**Files:**
- Create: `coach/packages/mahjong-soul-source/src/restore-diagnostic.ts`
- Create: `coach/packages/mahjong-soul-source/tests/restore-diagnostic.test.ts`
- Modify: `coach/packages/mahjong-soul-source/src/lobby-session.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`

- [ ] Add RED tests for the exact sequence `oauth2Check`, `oauth2Login`, `fetchInfo`, `fetchGameRecordListV2`; bind `has_account` and login account ID to the captured account, while treating `fetchInfo` only as an authenticated capability probe because its response has no account ID.
- [ ] Add RED tests for each fixed result: `oauth2_check_rejected`, `oauth2_login_rejected`, `identity_mismatch`, `catalog_probe_rejected`, and `inconclusive`; every path closes once and never reflects payload prose.
- [ ] Extend the package-owned Lobby allowlist with `oauth2Check`. Add a strict session method that sends full recovery context and rejects server errors using fixed codes.
- [ ] Implement `diagnoseMahjongSoulIndependentRestore` with a one-record, bounded-time catalog probe and unconditional close.
- [ ] Re-run focused tests and commit `feat: diagnose independent Mahjong Soul restore`.

### Task 3: Add strict CN gateway discovery and WebSocket transport

**Files:**
- Create: `coach/packages/mahjong-soul-source/src/gateway-discovery.ts`
- Create: `coach/packages/mahjong-soul-source/tests/gateway-discovery.test.ts`
- Create: `coach/packages/desktop/src/lobby-transport.ts`
- Create: `coach/packages/desktop/tests/lobby-transport.test.ts`
- Create: `coach/packages/desktop/src/lobby-session-factory.ts`
- Create: `coach/packages/desktop/tests/lobby-session-factory.test.ts`

- [ ] Add RED tests rejecting caller-supplied origins, `ws:`, credentials, fragments, unknown authorities/ports, redirects, oversized JSON, server prose and routes outside `bundle.endpoints.lobbyWebSocketOrigins`.
- [ ] Add RED tests for discovery/connect/send/open/close timeouts and close-before-open; all errors must be fixed project codes.
- [ ] Implement manifest-owned discovery URL selection, response-size limits, exact allowlist mapping and bounded WebSocket transport.
- [ ] Implement a factory returning a fresh `MahjongSoulLobbySession`; failure always closes partial resources.
- [ ] Re-run focused tests and commit `feat: connect a restricted Mahjong Soul lobby`.

### Task 4: Add a diagnostic-only Electron orchestration path

**Files:**
- Modify: `coach/packages/desktop/src/electron-entry.ts`
- Create: `coach/packages/desktop/src/restore-diagnostic-runner.ts`
- Create: `coach/packages/desktop/tests/restore-diagnostic-runner.test.ts`
- Modify: `coach/packages/desktop/package.json`

- [x] Add RED tests proving the runner requires one fresh visible login capture, executes one fresh-session diagnostic, emits only a fixed stage code, and has no vault/catalog write port or renderer capability.
- [ ] Add RED tests for rejected/cancelled/unverified capture and hostile thrown values; no secret or upstream prose may appear. Existing v1 vault sessions are deliberately not used because they lack the recovery context being tested.
- [x] Implement an explicit diagnostic launch flag handled only in Electron main. Keep normal production `sessionFactory` fail-closed and the renderer sync capability hidden.
- [x] Add `desktop:diagnose-mahjong-soul-restore`; it always opens one visible official window and never migrates or reads the existing encrypted v1 credential during this one-time capability diagnostic.
- [x] Re-run focused tests and commit `feat: run Mahjong Soul restore diagnostic`.

### Task 5: Verify automatically, then run the one-time human diagnostic

**Files:**
- Create after the run: `docs/superpowers/handoffs/2026-08-13-mahjong-soul-oauth2-restore-result.md`

- [ ] Run focused tests, full `npm test`, typecheck, package-import and production audit.
- [x] Run the Electron diagnostic. The user enters account/password/CAPTCHA only inside the official CN window if reauthentication is required.
- [ ] Record only client version, adapter version and the fixed terminal stage. Do not record account, nickname, token, UUID, raw frame, URL or server prose.
- [x] If verified, record that production M5-E may proceed with independent Lobby restore. Do not enable renderer sync until the separate production wiring and lifecycle review is complete.
- [x] Commit `docs: record Mahjong Soul restore diagnostic` only after the observed result is known.

## Self-review

- Every production behavior has an observed RED before implementation.
- The diagnostic cannot enable catalog sync or mutate persistent state.
- Password, CAPTCHA and random key are not captured.
- Server-selected gateways can only narrow the checked manifest allowlist.
- A failed hypothesis produces evidence for the next design; it does not trigger an unreviewed fallback.
