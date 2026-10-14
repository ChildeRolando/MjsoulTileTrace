// One-time preparation for existing local libraries. Each package has a bounded
// process lifetime so preparing a library does not retain several large graphs.
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2] && resolve(process.argv[2]);
if (!root || !existsSync(join(root, "library.sqlite"))) throw new Error("Pass an existing review-library directory");
if (process.argv[3]) {
  const { createReviewSessionRepository } = await import("../dist/review-session-repository.js");
  const repository = createReviewSessionRepository({ root });
  const started = performance.now();
  try {
    const view = repository.openPresentation(process.argv[3]);
    if (!view) throw new Error("review_unavailable");
    console.log(JSON.stringify({ packageId: process.argv[3], preparedMs: performance.now() - started, selected: view.details.length }));
  } finally { repository.close(); }
} else {
  const db = new DatabaseSync(join(root, "library.sqlite"), { readOnly: true });
  const packages = db.prepare("SELECT p.package_id FROM analysis_packages p JOIN review_sessions s ON s.package_ref_id=p.package_ref_id ORDER BY p.package_id").all();
  db.close();
  for (const row of packages) {
    const child = spawnSync(process.execPath, ["--max-old-space-size=8192", fileURLToPath(import.meta.url), root, String(row.package_id)], { stdio: "inherit", windowsHide: true });
    if (child.status !== 0) process.exit(child.status ?? 1);
  }
}
