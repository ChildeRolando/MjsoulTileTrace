# Textbook draft production

Current production uses finite, hash-bound HTML and PDF queues. Completed PDF
pages and existing formal chapters are preserved and reused. Chinese supplements
copy the existing Chinese text; modern Japanese supplements use explicit
Sol/high translation. PDF production fills only enumerated source gaps. The
historical `production/sol-high-full` run remains stopped and immutable.

The production limit is two modern workers, one Chinese worker and one PDF
fallback worker. Every candidate remains a draft until its independent gate
passes. Offline verification makes no model call:

```powershell
node scripts/scene-study/textbook-production.mjs --self-check
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

## HTML supplements

The supplied PDFs and completed drafts remain immutable. HTML supplements use
`textbook-production-web-sources.py`: original HTML, ordered DOM blocks,
emphasis/links/table cells, original image bytes and their hashes are retained.
Modern catalog v2 includes section suffixes, exercise continuations and archives;
capture is separate from scope acceptance. Existing source files are verified and
reused. `--source-version v2` explicitly creates new source/main files.

`textbook-production-web.mjs` accepts `--source` and either a Chinese `--reuse`
map or Japanese `--dictionary`. Chinese body text remains verbatim; exact figures
reuse independently passed PDF evidence. The immutable map snapshot is bound to
the candidate. Other figures require explicit model output by source block ID.
`--reuse-only` refuses paid recognition, `--preflight-only` performs no model
call, and `--variant` preserves an earlier candidate while creating a new version.
Existing candidates validate dependencies before returning without a new call.
The stop file is `processing/web-production/v1/STOP`, checked before dispatch.

`textbook-production-web-dictionary.mjs` identifies only a finite list of new
single-tile assets, preserving exact URLs, bytes, pixels, red status and rotation.
Its draft needs independent visual review. It never converts a filename into an
accepted label. Tile backs retain an unknown face; complex diagrams remain whole
figures. Red fives are displayed as 0m/0p/0s, with explicit sideways annotations.

`textbook-production-web-present.py` creates a separate display candidate.
Single-frame GIF/JPEG originals convert to original-size RGBA PNG; ordered inline
images join with no gap, transparent padding and bottom alignment. Multi-frame
images are refused. Original bytes remain bound and independent audit compares
decoded pixels. Display assets are isolated by the parent candidate byte hash.

All new model calls use explicit Sol/high, an isolated temporary directory,
disabled capabilities and an instruction forbidding any extra tool call.
Unexpected tool events reject the attempt while preserving its raw evidence.
New call records distinguish the complete request prompt hash from the semantic
payload hash and bind the CLI snapshot. Token fields remain null when unknown.


## Complete question batches and isolated repairs

For a large Japanese article, `--batch-plan <plan.json>` binds a complete-unit
plan and its source/unit-map hashes. Each question and answer, required shared
premise and complete HTML table stays together. The groups cover every original
DOM block exactly once; context-only premises are not translated again. Each
group has its own raw output, ledger entry and immutable checkpoint. Resume
validates the original prompt, schema, CLI, ledger and raw bytes before reusing a
completed group. A recorded failure is preserved for explicit handling.
`--stop-file <processing-relative-path>` also stops between groups after the
current paid call has drained. Unknown usage fields remain null in the sum.

`--revision-from`, `--revision-notes` and a new `--variant` perform an isolated
repair: Chinese figures or Japanese text blocks explicitly identified by the
original independent review. Other prose and figures are copied unchanged.
Only the target gets new model output and new independent review. Fixed Chinese
teaching labels can use `textbook-production-web-labels.mjs`; it performs a
literal, independently checked transformation without another recognition call.

`textbook-production-web-formal.mjs` copies the complete existing formal
transcription after exact source-image matching. Parent bodies, corpus,
corrections and original PNGs are frozen by full-file SHA under
`web-production/v1/formal-parents`. The candidate records the actual inherited
review level. Publication alone never substitutes for an independent visual
review. Specific source-order or label corrections retain the original drafts
and reviews and require evidence bound to the exact new candidate bytes.

## PDF sentence slots

For an explicitly unmade page, `--inline-source-flow` enables prompt5-inline.
Native PDF lines and image occurrences provide position evidence; image groups
stop at real source words and retain continuous wrapped tiles. Rows do not
establish the semantic order of a table or multiple columns. The complete page
and any recorded position warnings remain part of the model input.

The existing model schema uses `[[figure:REGION_ID]]` inside a complete paragraph.
The region caption supplies a short readable code or label; its transcription
retains all figure data, orientation, draw/discard labels and unknowns. A region
occurs once, inline or standalone. The draft preserves `rawSlotText`, the original
`sourceText`, parsed `inlineContent`, and `inlineFigureIds`; the presented `text`
contains the readable codes. Chinese non-figure text and native slot positions
must match exactly. Japanese is translated as a whole paragraph, never sliced at
Japanese source offsets. The explicit provenance flow mode binds the archived
native plan and helper bytes in the manifest, raw call and candidate. Older
drafts keep their existing path. Freeze the helper with the other runner files,
then require the matching independent inline audit gate before publishing.
This mode permits one attempt only. `--source-tile-evidence <file>` freezes an
approved exact-asset code input and its approval/pixel-review hashes. Hints apply
only to matching original image bytes, dimensions and positive upright placement;
filenames and unseen rotated/red variants do not establish a code.
