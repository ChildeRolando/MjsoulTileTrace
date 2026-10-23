# Textbook draft production

The authorized full run uses the two inventoried PDFs only. It writes to
`E:\AgentData\Coach\knowledge\processing\production\sol-high-full` and keeps
every output in draft status until the independent audit passes it.

Run the production model explicitly with:

```powershell
node scripts/scene-study/textbook-production.mjs --model gpt-6.1-sol --concurrency 3 --attempts 2 --candidate-overrides E:\AgentData\Coach\knowledge\processing\integration\calibration-candidate-selection.json
```

Use `--source 79-cn --page 79-cn:5 --model gpt-6.1-sol --attempts 1` for one
page. The page argument must be `sourceId:number`; a filter that selects no
pages fails before any model call. `--self-check` runs offline schema and
chapter-boundary fixtures.

`--self-check` also exercises raw malformed-JSON preservation, completed turns
after reconnect notices, partially unknown token usage, candidate/source/page
binding, missing resume dependencies, revision note binding, and the production
scheduler with an observed peak of three simultaneous workers. It makes no
model calls and does not write a production manifest.

For a returned page, preserve the original run and create a new revision run:

```powershell
node scripts/scene-study/textbook-production.mjs --model gpt-6.1-sol --source nemata-jp --page nemata-jp:67 --run-id sol-high-repair-p67-1 --revision-from <original-candidate.json> --revision-notes <independent-audit.json> --attempts 1
```

Both revision arguments are required. The audit must bind the original
candidate's complete file SHA-256. The new manifest records the parent and
audit file hashes; the producer rereads the source images independently and
treats suggested repairs as locators. Revision candidates need a fresh audit.
The original candidate and its calls remain in their original run.

The manifest binds the input inventory, PDFs, chapter map, source-block
ownership, prompt/schema versions, model, and production scripts. Candidate
reuse checks its digest, source hashes, rendered image hashes, and raw call
artifacts. Missing or changed dependencies stop reuse instead of regenerating
an existing candidate. Every model attempt writes a call ID, usage when available, CLI
events, raw final output/stdout, and diagnostics to the run's `raw-calls`
directory and `calls.jsonl`, including the raw artifact's complete file hash.
Run usage reports show a known subtotal and the number of unknown calls for
each token field. An entirely unknown subtotal is `null`, never zero.
The optional candidate-selection file uses the publisher's
`coach-textbook-candidate-selection/1` format. Its four accepted calibration
pages are excluded from new production after their complete file hashes and
source identities are checked. The manifest binds the selection file and its
entries; final assembly rechecks their independent audits.
The independent audit owns visual-reading order
and semantic review; the producer enforces unique complete source-ID coverage
and prevents paragraph or image-region groups from crossing unit boundaries.
