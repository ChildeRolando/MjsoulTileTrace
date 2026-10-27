Zero-model receipt capture for COAC-269 / 283 b0396 and b0962.

`handoff.json` is the exact249 handoff, SHA
`daf6806291fdeab42f0e490acfac072bded84aaae8b01cd228710405383d3894`.
`result.json` and `inheritance.json` retain the complete target reviews and scope proof.
`captured.json` maps short packaged names to complete original paths and SHA values; files from
249's git evidence are pinned to commit283ff5fd945c7ec5be57e5822a49f657be81d75e.
Original source, candidate, parent, audits, checkpoints, raw, runtime, image and process bytes are
copied without modification. Other-chapter facts in the original handoff are historical context;
this receipt neither modifies those owners nor dispatches any work for them.

Run `python capture.py`, then `node verify-return.mjs` in this directory (shared data root required).
Both tools only read existing model evidence. Verification writes local derived summaries only.
`verification.json` contains all four real calls and the exhausted4/4 budget.
`effective-remaining.json` is a ticket-local view over the pinned250 register plus these two
verified passes; it does not replace the shared register or declare the whole chapter accepted.
