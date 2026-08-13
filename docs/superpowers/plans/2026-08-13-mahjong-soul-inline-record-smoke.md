# Mahjong Soul Inline Record Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development and execute this single task inline.

**Goal:** Prove with one real CN login that the app can select an analyzable recent game, fetch its inline full record, and decode a non-empty supported action container.

**Architecture:** Add one source-package diagnostic that authenticates a fresh Lobby, reuses `syncRecentCatalog` and `filterAnalyzableRecord`, fetches only inline `ResGameRecord.data`, then decodes `GameDetailRecords` from the pinned protobuf bundle. Extend the existing Electron diagnostic runner and fixed exit-code map; do not persist data or expose it to renderer.

**Tech Stack:** TypeScript, Vitest, protobufjs, Electron, existing Liqi codec and M5-C catalog primitives.

---

### Task 1: Inline full-record smoke

**Files:**
- Create: `coach/packages/mahjong-soul-source/src/inline-record-diagnostic.ts`
- Create: `coach/packages/mahjong-soul-source/tests/inline-record-diagnostic.test.ts`
- Modify: `coach/packages/mahjong-soul-source/src/lobby-session.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`
- Modify: `coach/packages/desktop/src/restore-diagnostic-runner.ts`
- Modify: `coach/packages/desktop/tests/restore-diagnostic-runner.test.ts`
- Modify: `coach/packages/desktop/src/electron-entry.ts`

- [ ] **Step 1: Write failing source tests**

Cover one fake authenticated Lobby with a recent analyzable entry and a protobufjs-encoded `GameDetailRecords` containing one `GameAction`. Assert `inline_record_verified`. Add fixed cases for no analyzable entry, `data_url` without inline bytes, rejected detail, unsupported container, empty container, UUID-bound request, and unconditional Lobby close. Assert results contain only `status` and never contain token, UUID, or upstream prose.

- [ ] **Step 2: Run source tests and observe RED**

Run:

```powershell
cd coach
npx vitest run packages/mahjong-soul-source/tests/inline-record-diagnostic.test.ts
```

Expected: module/export missing.

- [ ] **Step 3: Implement the minimal source diagnostic**

Add `fetchGameRecord` to `LobbyDirectCallMethod`. Implement the exact sequence:

```text
fresh session
oauth2Check
oauth2Login
recent catalog + current filter
first analyzable UUID
fetchGameRecord(game_uuid, client_version_string)
inline data only
decode lq.GameDetailRecords
actions.length > 0 OR records.length > 0
always close
```

Reuse the validated recovery-context payload shape from `restore-diagnostic.ts`; keep all failures as fixed status enums.

- [ ] **Step 4: Write and run failing Electron runner tests**

Assert the runner invokes the inline diagnostic after fresh visible capture and maps all new fixed statuses to stable unique exit codes. Run:

```powershell
npx vitest run packages/desktop/tests/restore-diagnostic-runner.test.ts
```

Expected: missing inline mode/result mapping.

- [ ] **Step 5: Wire the existing diagnostic command and reach GREEN**

The existing `--diagnose-mahjong-soul-restore` command should now execute the inline-record smoke and exit `0` only for `inline_record_verified`. It must still initialize no vault, catalog store, renderer IPC, or persistent partition.

Run:

```powershell
npx vitest run packages/mahjong-soul-source/tests/inline-record-diagnostic.test.ts packages/desktop/tests/restore-diagnostic-runner.test.ts
npm run typecheck
npm test
npm run test:package-import
```

Expected: all pass.

- [ ] **Step 6: Review, commit, and run the real smoke**

Require read-only review with Critical 0 / Important 0. Commit implementation, then launch the visible diagnostic once and read its stable exit code in the same waiting process. Record only the fixed result in a handoff. Do not save the record bytes.
