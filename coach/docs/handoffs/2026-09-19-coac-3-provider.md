# COAC-3 local delivery receipt

Historical receipt for the initial sandboxed attempt. The controller subsequently
committed that implementation as `e71512aaaf360b60c4cfed8217ba211caa57b244`.
Current review fixes, gate results and remaining limits supersede the status below:
[COAC-3 review-fix receipt](2026-09-19-coac-3-review-fixes.md).

Base verified before edits: `44a633da1ffff7fede80a5fb04f8681d5e7b98c9`.
Scope and the repository-required Scope / Locality / Invariants / Traceability /
Replaceability / Recoverability / Semantic Load receipt are in
[the delivery plan](../plans/2026-09-19-coac-3-provider.md).
The implementation is present in the working tree but could not be committed:
`git add` exited 1 because `.git/index.lock` could not be created (Permission denied;
the supplied workspace permissions make `.git` read-only). Local HEAD remains the
base above, so `BASE_COMMIT..HEAD` does not yet contain this implementation. A complete
source patch accompanies the issue handoff. No push, branch change, merge, PR,
delegation or independent reviewer was performed.

## Required gates

Executed exactly from `coach`, with final results:

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | PASS |
| `npm run build` | 1 | ENVIRONMENT_BLOCKED: esbuild service spawn EPERM during preload bundling; workspace TypeScript compilation completed |
| `npx vitest run` | 1 | ENVIRONMENT_BLOCKED: Vitest/tinypool worker spawn EPERM, no tests executed |
| `npm run check:architecture` | 0 | PASS: 6 packages, 368 files, 1555 imports, zero violations |
| `npm run test:package-import` | 1 | ENVIRONMENT_BLOCKED: its required build stopped at esbuild spawn EPERM; package-import tests did not execute |

Iteration exit-code history (including the final invocations above): typecheck
`1 → 0 → 0 → 1 → 0` (implementation/test typing errors fixed); top-level build
`1 → 1` (both environment-blocked). The package-import command additionally invokes
build internally and hit the same environment failure. Full Vitest and architecture
were each invoked once with the results above. No required gate was replaced by a
narrower command, and no test/security configuration was relaxed.

Focused Vitest attempt exited 1 before tests (worker spawn EPERM). A supplemental
thread-pool attempt also exited 1 before tests (Vite Windows realpath helper spawn
EPERM). Intermittent shell-launch AccessDenied affected read-only inspection calls;
those reads were retried successfully.

## Supplemental evidence, not gate substitutions

Directly invoking the installed esbuild binary produced the same sandbox preload
bundle (exit 0). A temporary Node assertion smoke using stubbed fetch and safeStorage
passed (exit 0) for arbitrary credential import, encrypted restart, clear, a grounded
complete report, one transport retry, invalid-output and request-failed degradation,
unavailable-provider zero-network behavior, hostile IPC input rejection, and executing
the bundled preload in a VM that permits only `require("electron")`. The final smoke
ran after the final TypeScript build output and bundle were regenerated. Temporary
smoke/generator scripts and generated bundles are not committed.

Added Vitest regressions cover credential storage failures/corruption/replacement,
Linux backend rejection, timeout/body abort, 429/5xx/reset/network error mapping,
request shape and redirect policy, retry limits, report isolation, prompt byte golden,
empty-selection prompt suppression, selected-only slice transport, strict IPC/preload,
sender/frame checks and the actual sandbox bundle. They typecheck, but the full suite
cannot be claimed passing in this environment.

The committed desktop fixture is derived through the unchanged D1/M6-C canonical
fixture and builder with a model disagreement; it was accepted by the production
package validator during generation and by the supplemental generation smoke.

## Unresolved limits and acceptance

- Three required gates remain ENVIRONMENT_BLOCKED and must run in the controller's
  permitted environment. This is not acceptance or a claim of all-green tests.
- The mandatory local commit is ENVIRONMENT_BLOCKED by `.git` write permissions.
  The controller must permit/perform the local commit before reviewing BASE..HEAD;
  the working-tree implementation and attached source patch are preserved.
- Real Electron OS-keyring behavior and a real LLM endpoint were not exercised.
  All HTTP was stubbed; no real key or LLM request was used.
- Ordinary record ingestion still produces canonical/replay data. The main-only
  validated package handoff is wired and tested, but connecting whole-game package
  production and full COAC-4 generation orchestration remains follow-on work.
- Non-secret settings are in-memory; configure them after restart. Credentials alone
  persist. Renderer key entry, streaming, multi-provider, ReviewSession/SQLite and
  M7 UI are outside scope.

Controller-owned review and human acceptance remain pending.
