Zero-model packaging repair for250's never-started run01a17f90-dd76-7202-b0b2-d4f39be097e0.

The repair uses a private Git index and expected-parent update of idle agent/mika/coac-250, keeping
this task HEAD on agent/ticket/coac-269. Target fix a9e9faa581480d956701ac0b2c01e24f33811a33 extends
completed v29 f1435b1, with no live data or model change. Manifest250 maps16 immutable file moves;
repair250.patch contains the exact packaging-only diff, including the local aliases and full-path guard.

prepare.py/apply-and-test.py are the one-time implementation record, not production scripts and not
safe to rerun after applying. On250, the read-only guard is python _analysis/path250/verify.py.
From269, use verify-package.py --tree <fixed-commit> --checkout-root <future-managed-root>.
Old-tree failure, fixed-tree pass, actual same-branch checkout and future245-character file rejection
in both packaging trees are recorded in preflight-tests.json and checkout-test.json.

resume-once.py restored only the original failed task's wakeup once, preserving the original zero-model
instruction. check-start.py only reads platform state; it never dispatches or retries a task.
started250.json supplies actual started_at, real worktree/head and fix ancestry. Other authorized250
work is allowed to finish naturally while this same recovery waits in the platform queue.

All model calls from this repair:0. No raw/candidate/audit/data-root/active mutation, re-integration,
force push, reset/clean, global setting change, unknown-worktree deletion or extra consumer.
