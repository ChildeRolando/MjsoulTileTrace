# COAC-3 review fixes

Addresses the three P2 findings on
`44a633da1ffff7fede80a5fb04f8681d5e7b98c9..e71512aaaf360b60c4cfed8217ba211caa57b244`.
This turn started at `e71512aaaf360b60c4cfed8217ba211caa57b244` with a clean working
tree and working Git/build permissions. The initial sandbox-blocked receipt is
historical; this receipt describes the fix commit accompanying this file.

## Findings addressed

1. **Production package handoff.** `electron-entry.ts` now reads the explicit
   main-process setting `RIICHI_COACH_ANALYSIS_PACKAGE_FILE` during normal startup
   and calls `RecordAnalysisStore.loadAnalysisPackageFile`. The setting is an
   absolute path to an existing M6-C StructuredAnalysisPackage JSON, capped at
   16 MiB. The loader accepts only a regular non-symlink file, bounds the read,
   closes its handle, and passes the existing schema and semantic/provenance
   validator before updating the same store resolved by generation. Missing,
   malformed or tampered input stays unavailable. Renderer still sends only
   packageId, never a file path, package, prompt or raw graph. The regression
   loads a file and reaches a complete report through registered IPC/preload;
   it does not directly seed the store.
2. **Original output audit hash.** The provider returns the original model content
   string unchanged to privileged assembly, including malformed/rejected strings.
   Envelope reasoning fields are still discarded. The main-process service detects
   credential echoes in both literal and JSON-decoded strings and marks the outcome
   rejected without replacing the content. Assembly computes its existing SHA-256
   before rejecting/parsing: formatted valid output and distinct invalid outputs
   retain their own hashes. No provider request/result DTO or report schema changed.
   Only validated overlay data and hashes can leave the main process; rejected
   text and raw CoT do not enter IPC, logs or persistence.
3. **Startup credential isolation.** Importer construction now consumes and removes
   `RIICHI_COACH_API_KEY` synchronously, before Electron readiness, windows or
   diagnostic branches. Normal startup retains the one-shot input only in its
   main-process importer closure until safeStorage is ready. Diagnostic-only
   startup discards it. Tests import the actual entry module under both Mortal
   diagnostic flags and normal startup, assert cleanup before Electron setup and
   readiness, and launch a child using default environment inheritance to prove
   the variable is absent. No diagnostic network or real LLM runs in these tests.

## Exact gates from coach

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | PASS |
| `npm run build` | 0 | PASS, including sandbox preload bundle |
| `npx vitest run` | 0 | PASS: 161 files / 1,848 tests |
| `npm run check:architecture` | 0 | PASS: 6 packages, 370 files, 1,574 imports, zero violations |
| `npm run test:package-import` | 0 | PASS: build and emitted-package import test |

Each exact top-level gate was invoked once in this turn; package-import also ran
its required nested build successfully. Environment failures: none this turn.
The new focused regressions first failed as expected against the reviewed code
(13 failures, exit 1); after implementation the focused five-file run passed
(66 tests, exit 0). No timeouts, security checks or gate commands were relaxed.
The reviewer's earlier unchanged protocol-bundle timeout/rerun remains historical;
the full suite above passed without a rerun here.

## Change-control receipt

**Scope:** close all three reported P2 gaps without full COAC-4 orchestration.

**Locality:** desktop owns file loading, credential startup and provider transport;
reasoning adds one privileged rejection flag to its existing assembly input so
rejection preserves the original hash. Contracts, dependencies, direction table,
renderer allow-list, frozen issue/spec and session-key protector are unchanged.
Cross-package imports remain through public package roots; architecture passes.

**Invariants:** INV-005 is protected by startup/child-environment and IPC secret
echo regressions; INV-006 by bounded file loading and schema/identity failures;
INV-007 by original-output hash regressions; INV-011 continues through report
read-back validation. INV-001 remains under existing grounding/evidence separation
and is not promoted to whole-product completion. No invariant was weakened.

**Traceability:** imported packages retain M6-C identity and provenance. Selection
and slice authority remain unchanged. Audit outputHash now identifies the original
model content instead of a replacement or reserialization.

**Replaceability:** existing contracts provider port and main-only safeStorage/
importer injection remain. The file loader consumes the existing package format;
it does not create a new persistence contract or couple reasoning to filesystem I/O.

**Recoverability:** offline regressions reproduce missing/tampered package imports,
accepted/rejected/credential-bearing responses, and environment inheritance. All
five required gates passed with stubbed HTTP and injected safeStorage.

**Semantic load:** no new architecture-level service or package. File loading
extends RecordAnalysisStore; startup capture extends the existing importer;
credential rejection extends the existing assembly outcome with one optional flag.
The flag prevents losing audit identity when sensitive content must be rejected;
it is not renderer-visible or persisted.

## Remaining limits

Normal startup can now generate from an explicitly loaded, validated M6-C package.
Automatic whole-game package production from ordinary ingestion, full COAC-4
orchestration, renderer key input, streaming, M7 UI and SQLite remain outside scope.
Provider settings remain in-memory; credentials alone persist encrypted. Real
Electron OS-keyring behavior and a real LLM endpoint were not exercised. Controller
re-review and human acceptance remain pending; passing gates is not acceptance.
