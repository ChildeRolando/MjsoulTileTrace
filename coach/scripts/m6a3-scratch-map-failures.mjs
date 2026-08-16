#!/usr/bin/env node
// Scratch: report per-file mapper status over a raw corpus dir (private).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: m6a3-scratch-map-failures.mjs <rawDir>");
  process.exit(2);
}
const counts = {};
const failures = [];
for (const name of readdirSync(dir).filter((n) => n.endsWith(".xml")).sort()) {
  const raw = readFileSync(path.join(dir, name), "utf8");
  const digest = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
  const mapped = mapTenhouRecord({ raw, gameId: `tenhou-g:${digest}`, selfActor: 0 });
  counts[mapped.status === "ready" ? "ready" : mapped.code] = (counts[mapped.status === "ready" ? "ready" : mapped.code] ?? 0) + 1;
  if (mapped.status !== "ready" && failures.length < 12) {
    failures.push({ name, code: mapped.code });
  }
}
console.log(JSON.stringify({ counts, failures }, null, 2));
