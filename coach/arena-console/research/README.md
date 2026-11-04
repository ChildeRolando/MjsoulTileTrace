# Research archive readers

This page reads existing files and never starts experiments or imports research
counts into the Arena run dashboard. Markdown uses [react-markdown](https://github.com/remarkjs/react-markdown)
and [remark-gfm](https://github.com/remarkjs/remark-gfm); JSON uses the read-only
[uiw react-json-view](https://github.com/uiwjs/react-json-view) component. All are
MIT licensed, pinned in package-lock.json and bundled locally. License notices
are available at `/reader.mjs.LEGAL.txt`. HTML is not executed, remote report
images are not fetched, and source files remain unchanged. Download preserves
the source text; malformed JSON remains an explicit error with the original text.

`arena-research-case.mjs` joins statistics to the existing frozen case/group
mapping, batch manifest, and Arena events. It supports ordinary ablation batches,
two-stage textbook decision batches, and the v3 raw baseline. Cases are selected
by case ID and group, never by a guessed filename or the first matching result.
Frozen plan/batch hashes and run/case/candidate bindings are checked on read.
The textbook selector plan uses its original JSON.stringify hash convention.
An unsupported study remains report-only; partial traces do not become completed
results. Existing local Mortal references are shown only when their case binding
and candidate action match. Missing recommendations are not recomputed.

Case presentation reuses the Arena tile/board and trace waterfall components.
The event reader preserves actual requests, responses, tool arguments/results,
and publicly recorded summaries. Internal provider reasoning is not available.
Precomputed module facts are visible in requests and are not presented as tool
calls. Textbook selection requests/responses/usage are exposed as a separate
preparation phase; they are not counted again as decision-phase waterfall calls.

2026-11-05 validation: 17 focused Vitest tests plus 7 Node trace tests; UI bundle
and architecture checks; 38 real first/last cases across all groups of seven
recent experiments, including the second batch and textbook selector records.
Browser checks cover Markdown tables/section navigation, JSON hierarchy,
group/case changes, actual request events, four-player context at 1920×1080 and
1366×768. No model calls or source archive mutations were made.
