// Real-scale integration regression. Run after build with the complete CPU
// receipt and an output directory outside the checkout; never reduce the input.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openSync, readSync, closeSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { basename, dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getHeapStatistics } from "node:v8";
import { selectReviewDecisions } from "@riichi-coach/reasoning";
import { parsePackageJsonChunks } from "../dist/package-artifact-storage.js";
import { createReviewSessionRepository } from "../dist/review-session-repository.js";

const [receiptArgument, outputArgument] = process.argv.slice(2);
assert.ok(receiptArgument && outputArgument, "Pass the complete production receipt and output root");
assert.ok(!/max[-_]old[-_]space[-_]size|heap[-_]size/.test([...process.execArgv, process.env.NODE_OPTIONS ?? ""].join(" ")), "Do not enlarge the default heap");
assert.ok(getHeapStatistics().heap_size_limit <= 5_000_000_000, "Default heap budget must remain bounded");
const coachRoot = fileURLToPath(new URL("../../../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: coachRoot, encoding: "utf8", windowsHide: true }).trim();
const receiptPath = resolve(receiptArgument), outputRoot = resolve(outputArgument);
const checkout = git("rev-parse", "--show-toplevel");
const outputRelative = relative(checkout, outputRoot);
assert.ok(outputRelative === ".." || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative), "Keep runtime evidence outside the checkout");
const source = JSON.parse(readFileSync(receiptPath, "utf8"));
assert.equal(source.packages.length, 9, "Use all nine original production perspectives");
const largest = [...source.packages].sort((a, b) => b.artifact.byteLength - a.artifact.byteLength)[0];
assert.ok(largest.artifact.byteLength >= 5_490_000_000, "Preserve the R19 real package scale");
assert.equal(basename(largest.artifact.file), largest.artifact.file);
const input = join(dirname(receiptPath), largest.artifact.file);
mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(join(outputRoot, "package-persistence-"));
const marks = [], startedAt = new Date().toISOString(), started = Date.now();
const mark = (phase, extra = {}) => {
  const value = { phase, ms: Date.now() - started, ...process.memoryUsage(), ...extra };
  marks.push(value);
  console.log(JSON.stringify(value));
};
const hash = createHash("sha256");
let size = 0;
function* chunks() {
  const fd = openSync(input, "r"), buffer = Buffer.alloc(65536);
  try {
    let count;
    while ((count = readSync(fd, buffer)) > 0) {
      const chunk = buffer.subarray(0, count);
      size += count;
      hash.update(chunk);
      yield chunk;
    }
  } finally { closeSync(fd); }
}
mark("start", { node: process.version, heapSizeLimit: getHeapStatistics().heap_size_limit, input });
let pkg = parsePackageJsonChunks(chunks());
assert.equal(size, largest.artifact.byteLength);
assert.equal(hash.digest("hex"), largest.artifact.sha256);
assert.equal(pkg.packageId, largest.packageId);
assert.equal(pkg.semanticContentHash, largest.semanticContentHash);
const expected = { packageId: pkg.packageId, hash: pkg.semanticContentHash, decisions: pkg.decisions.length, boundaries: pkg.legalActionEvidence.results.length };
mark("loaded", { size, ...expected });
const selection = selectReviewDecisions(pkg);
mark("selected", { selected: selection.selected.length });
const library = join(output, "library"), repository = createReviewSessionRepository({ root: library });
let state = repository.saveSession(pkg, selection);
const graph = { nodes: state.readBack.currentGraph.nodes.length, edges: state.readBack.currentGraph.edges.length };
assert.equal(state.analysisPackage.packageId, expected.packageId);
assert.equal(state.analysisPackage.semanticContentHash, expected.hash);
mark("saved", graph);
state = null;
pkg = null;
repository.close();
mark("closed");
const reopened = createReviewSessionRepository({ root: library });
state = reopened.openByPackageId(expected.packageId);
assert.equal(state.analysisPackage.packageId, expected.packageId);
assert.equal(state.analysisPackage.semanticContentHash, expected.hash);
assert.equal(state.analysisPackage.decisions.length, expected.decisions);
assert.equal(state.analysisPackage.legalActionEvidence.results.length, expected.boundaries);
assert.deepEqual(state.selection, selection);
assert.equal(state.readBack.currentGraph.nodes.length, graph.nodes);
assert.equal(state.readBack.currentGraph.edges.length, graph.edges);
reopened.close();
mark("reopened", graph);
const receipt = { status: "PASS", scope: "unchanged largest real CPU package; default heap; production repository save/close/new repository reopen", codeCommit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain") !== "", artifactCommit: source.commit, sourceReceipt: receiptPath, artifact: largest.artifact, startedAt, finishedAt: new Date().toISOString(), library, marks };
writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: "PASS", receipt: join(output, "receipt.json") }));
