# Arena live trace

This is an embedded results-page module, not a tracing service. One case is one
session; `provider_turn_started` / `provider_turn` pair model requests and
`tool_call` / `tool_result` pair tools by ordinal. New submission events also carry
elapsed time. The existing three-second archive poll supplies updates; a local
clock extends active spans between polls. Only an owned running console step
enables live mode. Pausing, losing the connection, stopping the process or loading
an incomplete historical archive never invents a successful completion.

`model.mjs` is the pure event adapter. `view.jsx` hosts the existing open-source
timeline and detail card in a small React island. The rest of the console remains
plain HTML/JS. The bundle loads only when opening a run. Build with
`npm run build:arena-ui` (also included in `npm run build`).

## Third-party source

- [vis-timeline](https://github.com/visjs/vis-timeline), 8.5.6, MIT or Apache-2.0.
  Used directly from its locked npm dependency for timeline rendering, selection,
  pan, zoom and incremental data updates. No custom waterfall chart engine.
- [affectUI Tool Call Card](https://www.affectui.com/components/tool-call-card),
  MIT, retrieved 2026-11-04 from
  `https://www.affectui.com/r/tool-call-card.json`. Original downloaded TSX SHA256:
  `dc99366802789fe9fd6d549b1254151fbd87c0f7412f5ae1a4fd1bde1473bdac`.
  Copyright and full license are in `vendor/affectui-LICENSE`. Source is vendored;
  visible card text is translated to Chinese. The build extracts its embedded
  CSS into a same-origin stylesheet, keeping the console's CSP unchanged.
  affectUI Pro source is not used.

## Evidence limits

- A model span means one Arena provider request. Internal network requests and
  private reasoning inside Codex CLI are not separately observable here.
- Historical provider events only record completion. Their start uses the prior
  event boundary, includes preparation, and is explicitly approximate. Missing
  tool timestamps mean unknown duration. The slowest label is suppressed when
  any call lacks an exact measured duration.
- Reported model input, its cached subset, model output (tokens), and Arena
  request/response payloads (bytes) remain separate. Unknown is never zero.
- RAG applicability receipts remain attached to their tool result; no invented
  child span or duplicated token totals. Full raw events and the previous event
  log remain available. No new model costs or automatic retries are introduced.
- An existing artifact always owns its score; live rows cannot override it.

For local lifecycle operations use `bin/arena-console-control.ps1`; the existing
shutdown endpoint refuses to stop a console while an experiment runs.
