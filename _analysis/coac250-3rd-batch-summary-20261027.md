# COAC-250 third incremental batch (2026-10-27 ~04:15Z)

Consumed five passed-but-unstaged original chapters; 0 model calls, 0 production calls, formal library untouched.

| Original chapter | Route | Candidate | Audit | Preview chapter | Blocks / figures |
|---|---|---|---|---|---|
| nemata-jp-chapter-197-1 | web (chapter03-section011) | `.rev1.json` `6ad44173…` | passed 02:48:53Z (targeted b0010) | `modern-yabejp-ja-chapter03-section011-chapter` | 6 / 41 |
| nemata-jp-chapter-237-1 | web (chapter04-section016) | `.rev1.json` `d14aac65…` | passed 02:29:26Z (targeted b0002) | `modern-yabejp-ja-chapter04-section016-chapter` | 4 / 0 |
| nemata-jp-chapter-131-1 | web (chapter01-section049) | `.rev1.json` `20e84a64…` | passed 03:07:42Z (targeted b0123) | `modern-yabejp-ja-chapter01-section049-chapter` | 50 / 70 |
| 79-cn-chapter-104-5 | web (cv1726202) | `processing-note-v1.display` `8a3b546c…` | passed-after-specific-source-correction | `79-bilibili-cn-cv1726202-chapter` | 15 / 6 |
| 79-cn-chapter-260-18 | pdf pages 260–265 | p263 field repair `4fb2bd6d…` | passed | `79-cn-chapter-260-18` | 49 / 5 |

Preview: `accepted-content-preview-2026-10-27T04-01-46-235Z`, corpusId `8d2a35db…`.
196 → 201 display chapters, 204 → 209 units, 5,218 → 5,342 blocks, 3,813 → 3,935 figures. No chapter lost or rewritten. selectedWeb 168 → 172, pendingWeb 56 → 51, PDF stages 26 → 27.

## Wiring fixes (in `E:/AgentData/Coach/knowledge/processing` and the pipeline repo)

1. `integration/specific-web-variant-selection.v5.json` (v4 kept as history) selects the three COAC-248 `.rev1` candidates; the builder pin was updated.
2. `stage-web-textbook.mjs`: a revision inherits the parent presentation asset for figures it did not touch. The independent revision audit already excludes that field when proving nothing else changed, so this only restores the derived presentation binding.
3. `stage-web-textbook.mjs`: root-accepted source-correction calls are matched by artifact path as well as call id (the accepted processing-note job records path + sha, not callId).
4. `build-accepted-preview.mjs`: variant/revision filenames are no longer read as separate articles (`.r1`, `.rev1`, `processing-note-v1`).
5. `integration/merge-p263-selection-coac250.mjs` persists the passed p263 candidate into `current-candidate-selection.json` before `prepare-ready-pdf-chapters.mjs` refreshes the ready gate.

## Verification

- Build-blocking validators: MCP 209 units exact, 3,935 images sha-verified, no-hit explicit, 2 diagnostic queries; Arena 209 units, max envelope 15,066 B (limit 16,384); source dedup 9,245 unique web blocks, 0 cross-chapter collisions.
- Targeted MCP readback: all five new units present in `catalog_textbook` and read back block-exact via `read_textbook`.
- Register: `integration/coac250-unified-chapter-register-20261027b.json` updated in place (sha `5529a719…`), previous snapshot kept as `…b.before-coac250-3rd-batch-20261027T0355Z.json`. Covered 201 / needs-repair 53 / unreviewed 2 = 256.
