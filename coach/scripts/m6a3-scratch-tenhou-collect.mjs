#!/usr/bin/env node
/**
 * M6-A3 §2 scratch collector — Tenhou public Houou(鳳凰)-table logs.
 *
 * Minimal, dependency-free, single-session, paced. Mirrors the mechanics of
 * the public community tools (phoenix-logs / houou-logs):
 *
 *   1. FileIndex:  GET https://tenhou.net/sc/raw/list.cgi[?old]
 *      -> JS array entries  file:'scc/YYYYMMDDHH.html.gz', size:N
 *   2. Hour index: GET https://tenhou.net/sc/raw/dat/{name}  (gzip HTML)
 *      -> lines "HH:MM | .. | <a href="..?log=LOGID">牌譜</a> | players"
 *      -> keep 4-player hanchan ids (type bits: 0x008 hanchan set, 0x010 3p clear)
 *   3. Log bytes:  GET https://tenhou.net/0/log/?{LOGID}  (mjlog XML)
 *
 * Tenhou ToS: single session, no redistribution. Everything lands in a
 * PRIVATE state dir (never inside the repo); the private downloads.ndjson
 * keeps logId <-> file <-> sha256 so a census hit can later be mapped back
 * to its Mortal-submittable URL. Public reports only ever see content-hash
 * game ids.
 *
 * Usage:
 *   node scripts/m6a3-scratch-tenhou-collect.mjs --state-dir <dir>
 *     [--old] [--max-index N] [--max-logs N] [--delay-ms 1000]
 */
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0";

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { stateDir: null, old: false, maxIndex: null, maxLogs: null, delayMs: 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--state-dir") opts.stateDir = argv[++i];
    else if (a === "--old") opts.old = true;
    else if (a === "--max-index") opts.maxIndex = Number(argv[++i]);
    else if (a === "--max-logs") opts.maxLogs = Number(argv[++i]);
    else if (a === "--delay-ms") opts.delayMs = Number(argv[++i]);
    else fail(`unknown option ${a}`);
  }
  if (!opts.stateDir) fail("usage: m6a3-scratch-tenhou-collect.mjs --state-dir <dir> [--old] [--max-index N] [--max-logs N] [--delay-ms 1000]");
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ac.signal, redirect: "follow" });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buf };
  } finally {
    clearTimeout(t);
  }
}

const opts = parseArgs(process.argv.slice(2));
const stateDir = opts.stateDir;
const rawDir = path.join(stateDir, "raw");
mkdirSync(rawDir, { recursive: true });
const indexesPath = path.join(stateDir, "indexes.json");
const downloadsPath = path.join(stateDir, "downloads.ndjson");
const indexes = existsSync(indexesPath) ? JSON.parse(readFileSync(indexesPath, "utf8")) : {};

const listUrl = `https://tenhou.net/sc/raw/list.cgi${opts.old ? "?old" : ""}`;
console.error(`FILEINDEX ${listUrl}`);
const list = await get(listUrl);
if (list.status !== 200) fail(`list.cgi HTTP ${list.status}`);
const listText = list.buf.toString("utf8");

const entries = [];
const fileIndexRe = /file\s*:\s*'([^']+)'\s*,\s*size\s*:\s*(\d+)/g;
let m;
while ((m = fileIndexRe.exec(listText)) !== null) entries.push({ name: m[1], size: Number(m[2]) });
const houou = entries.filter((e) => path.basename(e.name).startsWith("scc"));
console.error(`file index: ${entries.length} entries, ${houou.length} houou (scc/) files`);

let todo = houou.filter((e) => indexes[e.name] !== e.size);
if (opts.maxIndex !== null && todo.length > opts.maxIndex) todo = todo.slice(0, opts.maxIndex);
console.error(`hour indexes to fetch: ${todo.length}`);

const logIdRe = /^\d{10}gm-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8}$/;
const pendingIds = new Set();
for (const e of todo) {
  const res = await get(`https://tenhou.net/sc/raw/dat/${e.name}`);
  if (res.status !== 200) {
    console.error(`INDEX FAIL ${e.name}: HTTP ${res.status}`);
    continue;
  }
  let text;
  if (e.name.endsWith(".gz")) {
    text = gunzipSync(res.buf).toString("utf8");
  } else {
    text = res.buf.toString("utf8");
  }
  let kept = 0;
  for (const match of text.matchAll(/^(\d{2}:\d{2}).*?log=([^">]+)/gm)) {
    const id = match[2];
    if (!logIdRe.test(id)) continue;
    const type = parseInt(id.slice(13, 17), 16);
    if ((type & 0x008) === 0) continue; // not hanchan
    if ((type & 0x010) !== 0) continue; // 3-player
    const file = path.join(rawDir, `${id}.xml`);
    if (existsSync(file)) continue;
    pendingIds.add(id);
    kept += 1;
  }
  indexes[e.name] = e.size;
  writeFileSync(indexesPath, JSON.stringify(indexes));
  console.error(`INDEX OK ${e.name}: +${kept} pending`);
  await sleep(opts.delayMs);
}

const ids = [...pendingIds];
const limit = opts.maxLogs === null ? ids.length : Math.min(ids.length, opts.maxLogs);
console.error(`logs to download: ${ids.length}${opts.maxLogs !== null ? ` (capped ${limit})` : ""}`);

let ok = 0;
let failCount = 0;
for (let i = 0; i < limit; i += 1) {
  const id = ids[i];
  const url = `https://tenhou.net/0/log/?${id}`;
  let res = await get(url);
  if (res.status !== 200 || !res.buf.toString("utf8", 0, 4096).includes("mjlog")) {
    await sleep(5000);
    res = await get(url); // single retry
  }
  const file = path.join(rawDir, `${id}.xml`);
  if (res.status === 200 && res.buf.toString("utf8", 0, 4096).includes("mjlog")) {
    writeFileSync(file, res.buf);
    const sha256 = createHash("sha256").update(res.buf).digest("hex");
    appendFileSync(downloadsPath, `${JSON.stringify({ logId: id, file, bytes: res.buf.length, sha256 })}\n`);
    ok += 1;
  } else {
    failCount += 1;
    console.error(`LOG FAIL ${id}: HTTP ${res.status}`);
  }
  if ((i + 1) % 50 === 0) console.error(`progress ${i + 1}/${limit} (ok ${ok}, fail ${failCount})`);
  await sleep(opts.delayMs);
}
console.error(`DONE indexes=${todo.length} logs ok=${ok} fail=${failCount}`);
