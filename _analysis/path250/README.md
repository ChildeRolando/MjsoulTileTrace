Packaging-only fix for250's never-started checkout failure.
All16 moved files retain their Git blob IDs/bytes (12 image copies,4 audit copies).
manifest.json maps old paths/full SHA to short aliases and records local presentation wrapper edits.
Raw/candidates/source/audit provenance, production scripts and live v29 data were not modified.
Use: python _analysis/path250/verify.py [--checkout-root <future-managed-worktree-root>].
The guard covers the entire tracked tree and all new delivery/_analysis files, limit <240 UTF16.
It also checks original/new bytes, inverse image aliases, archive index and every local image URL.
Original reference bytes remain recoverable by manifest.sourceCommit and originalGitBlobId.
