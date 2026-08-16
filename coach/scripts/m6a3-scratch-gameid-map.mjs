#!/usr/bin/env node
// Scratch: build the PRIVATE gameId -> (logId, file) reverse map from the
// collector's downloads.ndjson (logId <-> file <-> sha256). gameId is
// tenhou-g:<sha256[0..16]>. Output stays in the private corpus state dir.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ndjson = process.argv[2];
const out = process.argv[3];
if (!ndjson || !out) {
  console.error("usage: m6a3-scratch-gameid-map.mjs <downloads.ndjson> <out.json>");
  process.exit(2);
}
const map = {};
for (const line of readFileSync(ndjson, "utf8").split(/\r?\n/).filter(Boolean)) {
  const entry = JSON.parse(line);
  map[`tenhou-g:${entry.sha256.slice(0, 16)}`] = { logId: entry.logId, file: entry.file };
}
writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`, { mode: 0o600 });
console.error(`mapped ${Object.keys(map).length} games -> ${out}`);
