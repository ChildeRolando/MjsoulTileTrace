import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const paths = Object.freeze({
  spec: new URL("../docs/specs/2026-09-20-review-loop-v1.md", import.meta.url),
  schema: new URL("../docs/specs/review-loop-v1.schema.json", import.meta.url),
  manifest: new URL("../docs/specs/review-loop-v1.multica.json", import.meta.url),
  fixtures: new URL("../fixtures/review-loop-v1/decision-cases.json", import.meta.url),
});

export const TRANSITIONS = Object.freeze([
  "DISCARD_AND_REVIEW",
  "ROUTE_TO_FIXER",
  "PASS",
  "BLOCKED",
  "NO_ACTION_ALREADY_DISPATCHED",
]);

export const GATES = Object.freeze({
  typecheck: "npm run typecheck",
  build: "npm run build",
  vitest: "npx vitest run",
  architecture: "npm run check:architecture",
  "package-import": "npm run test:package-import",
});

function result(transition, nextRound = null) {
  assert(TRANSITIONS.includes(transition));
  return { transition, next_round: nextRound };
}

export function decide(input) {
  if (input?.dispatch_state === "identical") {
    return result("NO_ACTION_ALREADY_DISPATCHED");
  }
  if (
    !input
    || input.dispatch_state === "conflict"
    || input.results_state === "conflicting"
    || input.schema_valid !== true
    || input.identity_valid !== true
    || !Number.isInteger(input.round)
    || input.round < 1
    || input.round > 3
  ) {
    return result("BLOCKED");
  }

  if (input.phase === "initial_candidate") {
    return input.results_state === "none" && input.round === 1
      ? result("DISCARD_AND_REVIEW", 1)
      : result("BLOCKED");
  }

  if (input.phase === "fixer") {
    const validNewHead = input.fixer_result_valid === true
      && input.current_head_sha === input.fixer_head_sha
      && input.fixer_head_sha !== input.previous_head_sha;
    if (!validNewHead || input.round === 3) {
      return result("BLOCKED");
    }
    return result("DISCARD_AND_REVIEW", input.round + 1);
  }

  if (input.phase !== "review" || input.results_state !== "single") {
    return result("BLOCKED");
  }

  if (input.current_head_sha !== input.reviewed_head_sha) {
    return input.round < 3
      ? result("DISCARD_AND_REVIEW", input.round + 1)
      : result("BLOCKED");
  }

  const counts = input.finding_counts;
  const validCounts = counts
    && [counts.P1, counts.P2, counts.P3].every(
      (count) => Number.isInteger(count) && count >= 0,
    );
  if (!validCounts) {
    return result("BLOCKED");
  }

  if (
    input.verdict === "ENVIRONMENT_BLOCKED"
    || input.environment_failures > 0
    || input.gates !== "all_green"
  ) {
    return result("BLOCKED");
  }

  const hasBlockingFinding = counts.P1 > 0 || counts.P2 > 0;
  if (hasBlockingFinding) {
    if (input.verdict !== "CHANGES_REQUIRED") {
      return result("BLOCKED");
    }
    return input.round < 3
      ? result("ROUTE_TO_FIXER")
      : result("BLOCKED");
  }

  return input.verdict === "NO_P1_P2"
    ? result("PASS")
    : result("BLOCKED");
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function transitionKey(record) {
  return createHash("sha256").update(canonicalize(record), "utf8").digest("hex");
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

export function runChecks() {
  const spec = readFileSync(paths.spec, "utf8");
  const schema = readJson(paths.schema);
  const manifest = readJson(paths.manifest);
  const fixtureDocument = readJson(paths.fixtures);

  assert.equal(manifest.protocol_version, "review-loop/v1");
  assert.equal(manifest.create_resources, false);
  assert.equal(manifest.fixer.reuse_existing, true);
  assert.equal(manifest.fixer.id, "ba77da89-8574-4dea-8fc2-24e841fc2754");
  assert.equal(manifest.squad, null);

  const controller = manifest.agents.find((agent) => agent.role === "controller");
  const reviewer = manifest.agents.find((agent) => agent.role === "fresh_reviewer");
  assert(controller);
  assert(reviewer);
  assert.equal(controller.model, "gpt-5.6-luna");
  assert.equal(controller.thinking_level, "low");
  assert.equal(controller.max_concurrent_tasks, 1);
  assert.equal(controller.permission_mode, "private");
  assert.equal(controller.visibility, "private");
  assert.equal(reviewer.model, "gpt-6-astra");
  assert.equal(reviewer.thinking_level, "high");
  assert.equal(reviewer.permission_mode, "private");
  assert.equal(reviewer.visibility, "private");
  assert(controller.instructions.includes("${FRESH_REVIEWER_AGENT_ID}"));
  assert(reviewer.instructions.includes("${CONTROLLER_AGENT_ID}"));

  assert.equal(manifest.autopilot.execution_mode, "create_issue");
  assert.equal(manifest.autopilot.project_id, "bc4d48fd-93e1-4377-9342-670a523729ac");
  assert.equal(manifest.autopilot.trigger.kind, "webhook");
  const templateTokens = [...manifest.autopilot.issue_title_template.matchAll(/{{([^}]+)}}/g)]
    .map((match) => match[1]);
  assert.deepEqual(templateTokens, ["date"]);

  assert.equal(schema.properties.protocol_version.const, "review-loop/v1");
  for (const required of [
    "ticket_issue_id",
    "pull_request",
    "base_sha",
    "current_head_sha",
    "reviewed_head_sha",
    "round",
    "verdict",
    "findings",
    "gates",
    "environment_failures",
    "source_review_id",
    "raw_review_sha256",
  ]) {
    assert(schema.required.includes(required), `schema missing ${required}`);
  }

  for (const transition of TRANSITIONS) {
    assert(spec.includes(`\`${transition}\``), `spec missing ${transition}`);
  }
  for (const [id, command] of Object.entries(GATES)) {
    assert(spec.includes(`\`${id}\``));
    assert(spec.includes(`\`${command}\``));
  }

  const requiredCases = [
    "clean pass",
    "P1",
    "P2",
    "P3-only",
    "gate fail",
    "environment blocked",
    "malformed",
    "stale HEAD",
    "stale Fixer result",
    "untrusted review result author",
    "untrusted Fixer result author",
    "round 3",
    "duplicate transition",
    "conflicting results",
    "unverifiable webhook source bytes",
  ];
  const names = fixtureDocument.cases.map((fixture) => fixture.name);
  for (const name of requiredCases) {
    assert(names.includes(name), `missing fixture: ${name}`);
  }
  for (const fixture of fixtureDocument.cases) {
    assert.deepEqual(decide(fixture.input), fixture.expected, fixture.name);
    assert(TRANSITIONS.includes(fixture.expected.transition));
  }

  assert.deepEqual(
    decide({ phase: "future_unknown", schema_valid: true, identity_valid: true, dispatch_state: "absent", results_state: "single", round: 1 }),
    result("BLOCKED"),
  );

  const recordA = { protocol_version: "review-loop/v1", round: 1, transition: "PASS" };
  const recordB = { transition: "PASS", protocol_version: "review-loop/v1", round: 1 };
  assert.equal(transitionKey(recordA), transitionKey(recordB));
  assert.notEqual(transitionKey(recordA), transitionKey({ ...recordA, round: 2 }));

  return {
    repository_root: repoRoot,
    fixtures: fixtureDocument.cases.length,
    transitions: TRANSITIONS.length,
    status: "PASS",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(runChecks()));
}
