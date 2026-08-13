# Mahjong Soul Record Ingestion Implementation Plan

> **For agentic workers:** Execute inline with strict RED→GREEN steps and small commits.

**Goal:** Let a signed-in user select an analyzable catalog entry, fetch and validate its full Mahjong Soul record, decode the pinned container, and prepare it for canonical mapping without exposing raw data to the renderer.

**Architecture:** A source-package fetcher owns the trusted RPC/data URL boundary and returns frozen decoded record metadata plus private bytes. A desktop service binds record ID to the encrypted account catalog and authenticated Lobby. IPC returns only a fixed safe progress result. Canonical mapping follows as a separate commit consuming the decoded record.

**Tech Stack:** TypeScript, Electron IPC, protobufjs, SHA-256, Vitest.

---

### Task 1: Trusted full-record fetcher

**Files:**
- Create: `coach/packages/mahjong-soul-source/src/record-fetcher.ts`
- Create: `coach/packages/mahjong-soul-source/tests/record-fetcher.test.ts`
- Modify: `coach/packages/mahjong-soul-source/src/index.ts`

- [ ] Add RED tests for inline data, bounded HTTPS `data_url`, redirect/host/size/timeout rejection, server error, empty data, malformed protobuf, and non-empty current/legacy containers.
- [ ] Implement a fetcher bound to the pinned endpoint policy, requested UUID, fixed client version, byte cap, SHA-256 and `GameDetailRecords` decoder.
- [ ] Run focused tests and typecheck; commit.

### Task 2: Account-bound record ingestion service

**Files:**
- Create: `coach/packages/desktop/src/record-ingestion-service.ts`
- Create: `coach/packages/desktop/tests/record-ingestion-service.test.ts`
- Modify: `coach/packages/desktop/src/electron-entry.ts`

- [ ] Add RED tests proving the record ID must exist in the current account's safe catalog and that only an authenticated Lobby reaches the fetcher.
- [ ] Implement single-flight ingestion, unconditional Lobby close and fixed project errors.
- [ ] Run focused tests and typecheck; commit.

### Task 3: Safe renderer action

**Files:**
- Modify: `coach/packages/desktop/src/ipc.ts`
- Modify: `coach/packages/desktop/src/preload-entry.ts`
- Modify: `coach/packages/desktop/src/renderer/app.ts`
- Modify: `coach/packages/desktop/src/renderer/styles.css`
- Modify: corresponding desktop tests

- [ ] Add RED tests for one `startRecordAnalysis(recordId)` channel accepting only a strict record ID and returning only a fixed safe status.
- [ ] Add an “分析” button per catalog row and render fixed progress/error text without raw bytes, URL or upstream prose.
- [ ] Run focused tests and typecheck; commit.

### Task 4: Canonical mapper handoff

**Files:**
- Create mapper source/tests under `coach/packages/mahjong-soul-source/`
- Reuse `CanonicalEventStreamV2` contracts and validators from `coach/packages/contracts/`

- [ ] Inventory pinned action message types and committed fixtures.
- [ ] Map supported game/round/draw/discard/call/riichi/result events with stable source ordinals and visibility.
- [ ] Reject every unknown or incomplete required action; validate the final canonical stream.
- [ ] Add golden and mutation tests, then connect the ingestion service result to the existing reasoning pipeline.

### Task 5: Gates and H1

- [ ] Run full tests, typecheck, package import and production audit.
- [ ] Run a narrow read-only review for record identity, network boundaries, raw-data containment and mapper completeness.
- [ ] Ask the user only for the final normal-product login/restart/select-record H1 after all automated gates pass.
