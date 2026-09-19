# COAC-3 privileged provider delivery

Authority: frozen issue `.experiment/issue.json` and
`docs/specs/2026-08-24-m6-d2-graph-grounded-coach-design.md`.
The issue's credential-import amendment supersedes the older spec's configure-key
wording. Neither frozen artifact is changed.

## Scope and wiring

Contracts remain the owner of `LlmCoachProvider`, request/result/error vocabulary,
and now own strict non-secret desktop settings/status/reference DTOs. Desktop owns
the OpenAI-compatible HTTP implementation, credential lifecycle, IPC registration
and the narrow validate → project → select → request → assemble/read-back seam.
Reasoning owns the frozen prompt builder and reuses the existing canonical JSON
serializer and D1 slice builder without widening the slice allow-list.

`electron-entry.ts` initializes the independent credential service under
`userData/coach-provider/provider-credential.json`, consumes an explicitly supplied
`RIICHI_COACH_API_KEY` once at module startup (deleting it before Electron readiness,
windows, diagnostics or child processes), and registers the five
coach IPC channels for the trusted main window. Reopening a window disposes the old
handlers. `riichiCoachProvider` exposes configure, getStatus, importCredential,
clearCredential and generate. No method accepts an API key. Configure accepts only
an HTTPS base URL (no userinfo/query/fragment) and a model name. Settings are held
in memory and must be configured again after restart; credentials survive restart.
Never place a real key in command arguments, a URL, renderer input or a file.

The captured key waits only in the main-process importer closure until safeStorage
is ready. Diagnostic-only launches discard it immediately. Import/clear and generation
are serialized. The importer may be triggered again with no IPC payload, but its
one-shot captured value is then absent and fails closed; it does not reread process.env.
No renderer key-entry UI is provided.

The existing main-process `RecordAnalysisStore` gains a validated, cloned package
handoff (`putAnalysisPackage` / `getAnalysisPackage`); generation accepts only a
packageId already present there. A missing/mismatched package returns the fixed
`unavailable` result. Normal Electron startup now loads an existing M6-C artifact
from the explicit main-process environment setting `RIICHI_COACH_ANALYSIS_PACKAGE_FILE`.
Set that non-secret setting to an absolute path to a StructuredAnalysisPackage JSON
produced by the existing M6-C builder, then call configure/generate using the file's
packageId. The loader accepts only a regular non-symlink file up to 16 MiB, closes its
handle on all paths, and runs the existing strict schema and semantic/provenance
validator before updating the store. Invalid input does not enter the store or reach
the provider. File paths and packages cannot be supplied through renderer IPC.

This is a concrete production loader, not a new persistence format or analysis
producer. Automatic whole-game generation from ordinary record ingestion, full
COAC-4 orchestration, UI and persistence remain outside this delivery. Regression
tests drive file loading through registered generation IPC using the D1/M6-C fixture;
they do not seed the store through its test-only writer.

## Credential and transport behavior

- The provider calls Electron `safeStorage.encryptString` / `decryptString`
  directly. Linux accepts only secure keyring backends; no basic_text fallback.
  Session-key `canonicalBase64(keyBase64, 32)` behavior is untouched.
- The independent record contains only schemaVersion, providerId and base64
  ciphertext. Staging uses exclusive creation, mode 0600, sync, then same-directory
  atomic rename. Memory switches only after rename succeeds. A failed replacement
  preserves the previous encrypted record but drops runtime plaintext and disables
  requests; explicit reinitialization/restart can restore the old valid record.
- Clear drains current credential use, clears memory, then removes the record;
  deletion failure is reported as a fixed error. No SQLite/session/report/audit
  persistence is introduced. JS strings cannot promise physical memory zeroization;
  the service drops its references and never serializes or logs plaintext.
- Provider availability is checked before HTTP. One completion is one attempt;
  the narrow service retries the five frozen transport errors once. No retry for
  unavailable configuration, HTTP auth/protocol errors, malformed draft or grounding
  rejection. Auth/protocol errors produce invalid-output evidence-only reports;
  the frozen vocabulary has no separate authentication result code.
- Requests use redirect:error, an abort deadline covering headers and body, and a
  bounded response body. The original model content string and token counts survive
  only inside the privileged provider/assembly boundary. Envelope reasoning fields
  and upstream error prose are discarded. Assembly hashes the original content bytes
  before strict draft parsing, including rejected/malformed outputs; it never hashes
  a reserialized draft in place of the received content. Echoed credentials, including
  JSON-escaped copies, trigger a privileged rejection flag: assembly still records
  the original digest but emits only invalid-output evidence-only rows. Original
  content, raw CoT and credentials never enter IPC/report/audit beyond the digest.
- IPC and preload reparse strict DTOs and return fixed errors. The renderer report
  schema additionally closes the graph contract's opaque edge payload sink (the v1
  producer emits empty edge payloads). No fetch/provider/credential implementation
  is exposed in the preload.

## Change-control receipt

**Locality:** contracts for shared safe DTOs; reasoning for the frozen prompt;
desktop for privileged implementation and composition; living docs for status.
All cross-package imports use package roots. No dependency additions, direction
table edits or renderer import allow-list expansion. Existing identity schema and
selector version definitions move unchanged to a shared leaf, preserving their
public re-exports. Declaring contracts side-effect-free lets the bundle exclude
unused Node-dependent schemas; the sandbox bundle test permits only Electron.

**Invariants:** INV-001 remains partial at the product level; existing grounding
and report validators govern this seam. INV-005/006 are protected by new credential,
HTTP, IPC, preload and bundle tests plus existing session/security tests. INV-007/011
continue through existing report identity, hash audit and read-back validation.
No invariant is weakened or promoted based on this implementation alone.

**Traceability:** no new fact source. The package remains authoritative, selector
owns selection, D1 owns the transport slice, and LLM output remains an independently
versioned report overlay. Prompt golden bytes, component versions and hashes identify
generation. The desktop JSON test fixture is the D1 single-decision canonical sample
through `runFixtureReview` / `buildStructuredAnalysisPackage`, with source candidate
scores swapped (9m=.8, actual 5p=.2, matching expected/actualIndex); production
`validateStructuredAnalysisPackage` accepts it.

**Replaceability:** HTTP remains behind the contracts port. SafeStorage and importer
are main-only injected capabilities; reasoning does not import desktop or network.

**Recoverability:** offline tests cover arbitrary credentials, corrupt storage,
availability/encryption/decryption/atomic-write failure, replacement, restart,
clear, transport mappings, retry count, ready/degraded reports and hostile IPC.
Existing session-key tests still protect the distinct 32-byte base64 contract.

**Semantic load / admission:** the credential service prevents treating arbitrary
API keys as fixed-size session keys; isolates OS storage/import lifecycle; the session
vault owns account-session recovery, not provider credentials; folding this record
into that vault would couple deletion/recovery and violate the frozen independent
record requirement. The provider implements the existing contracts port; prompt,
IPC and generation functions extend existing boundaries rather than introducing
another report engine. The package handoff extends the existing analysis store.

**Verification:** final gate results are recorded in the handoff for this delivery.
No real LLM call or independent reviewer run is part of this work. Controller review
and acceptance are still required.
