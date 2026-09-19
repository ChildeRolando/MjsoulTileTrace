// Offline executable protocol model. Inputs representing CLI/live reads must be
// collected by the Controller; this module neither verifies HMAC nor dispatches.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const SOURCE_SEMANTICS = "multica-github-run-jcs/v1";
export const REPOSITORY = "ChildeRolando/MjsoulTileTrace";
export const EFFECT_FIELDS = Object.freeze([
  "protocol_version", "ticket_issue_id", "repository", "pr_number", "base_sha",
  "current_head_sha", "round", "transition",
]);
export const SOURCE_FIELDS = Object.freeze([
  "source_semantics", "source_kind", "source_id", "source_sha256",
]);
const sha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);
const uuid = (s) => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const text = (s) => typeof s === "string" && s.length > 0;
const same = (a, b) => canonicalize(a) === canonicalize(b);

// RFC 8785: UTF-16 key sorting, ECMAScript finite numbers, no Unicode normalization.
export function canonicalize(value, ancestors = new Set()) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    assert(value.isWellFormed(), "JCS invalid Unicode");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "JCS non-finite number");
    return JSON.stringify(value);
  }
  assert(Array.isArray(value) || object(value), "JCS non-JSON value");
  assert(!ancestors.has(value), "JCS cyclic value");
  ancestors.add(value);
  let encoded;
  if (Array.isArray(value)) {
    assert.equal(Object.keys(value).length, value.length, "JCS sparse/extended array");
    encoded = `[${Array.from(value, (v) => canonicalize(v, ancestors)).join(",")}]`;
  } else {
    assert.equal(Object.getOwnPropertySymbols(value).length, 0, "JCS symbol key");
    encoded = `{${Object.keys(value).sort().map((k) =>
      `${canonicalize(k, ancestors)}:${canonicalize(value[k], ancestors)}`).join(",")}}`;
  }
  ancestors.delete(value);
  return encoded;
}
export const semanticHash = (value) => createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
const project = (record, fields) => Object.fromEntries(fields.map((key) => {
  assert(Object.hasOwn(record, key), `missing ${key}`);
  return [key, record[key]];
}));
export function transitionKey(record) {
  const effect = project(record, EFFECT_FIELDS);
  assert.equal(effect.protocol_version, "review-loop/v1");
  assert(uuid(effect.ticket_issue_id) && effect.repository === REPOSITORY && positive(effect.pr_number));
  assert(sha(effect.base_sha) && sha(effect.current_head_sha));
  assert(Number.isInteger(effect.round) && effect.round >= 1 && effect.round <= 3);
  assert(["DISCARD_AND_REVIEW", "ROUTE_TO_FIXER", "PASS", "BLOCKED", "NO_ACTION_ALREADY_DISPATCHED"].includes(effect.transition));
  return semanticHash(effect);
}
export function sourceKey(record) {
  const source = project(record, SOURCE_FIELDS);
  assert(uuid(source.source_id) && /^[0-9a-f]{64}$/.test(source.source_sha256));
  assert((source.source_kind === "multica_github_run" && source.source_semantics === SOURCE_SEMANTICS)
    || (["review_comment", "fixer_comment"].includes(source.source_kind)
      && source.source_semantics === "multica-comment-utf8/v1"));
  return semanticHash(source);
}

export function classifyEvent(payload) {
  assert(object(payload) && payload.repository?.full_name === REPOSITORY, "repository/eventPayload");
  const prFields = ["pull_request", "number", "action"].some((k) => Object.hasOwn(payload, k));
  const pushFields = ["ref", "before", "after", "deleted"].some((k) => Object.hasOwn(payload, k));
  assert(prFields !== pushFields, "unknown/ambiguous event family");
  if (prFields) {
    const pr = payload.pull_request;
    assert(object(pr) && positive(payload.number) && pr.number === payload.number);
    assert(["opened", "reopened", "synchronize", "ready_for_review"].includes(payload.action));
    for (const side of [pr.base, pr.head]) {
      assert(object(side) && sha(side.sha) && text(side.ref) && side.repo?.full_name === REPOSITORY);
    }
    return "pull_request";
  }
  assert(typeof payload.ref === "string" && /^refs\/heads\/.+/.test(payload.ref));
  assert(sha(payload.before) && sha(payload.after) && payload.after !== "0".repeat(40));
  assert.equal(payload.deleted, false);
  return "push";
}

export function admitWebhook(input) {
  const { config, runs, intake_issue_id, live } = input;
  assert(uuid(config.autopilot_id) && uuid(config.trigger_id) && uuid(intake_issue_id));
  assert.equal(config.trigger.autopilot_id, config.autopilot_id);
  assert.equal(config.trigger.id, config.trigger_id);
  assert.equal(config.trigger.kind, "webhook");
  assert.equal(config.trigger.provider, "github");
  assert.equal(config.trigger.has_signing_secret, true);
  // Deployment evidence, never a flag supplied by the webhook payload.
  assert.equal(config.hmac_before_run_verified, true);
  assert.equal(input.runs_complete, true, "incomplete run pagination");
  assert(Array.isArray(runs));
  const matches = runs.filter((run) => run.issue_id === intake_issue_id);
  assert.equal(matches.length, 1, "non-unique intake run");
  const run = matches[0];
  assert(uuid(run.id) && run.autopilot_id === config.autopilot_id);
  assert.equal(run.source, "webhook");
  assert.equal(run.trigger_id, config.trigger_id);
  const payload = run.trigger_payload?.eventPayload;
  const family = classifyEvent(payload);
  const source = {
    source_semantics: SOURCE_SEMANTICS, source_kind: "multica_github_run",
    source_id: run.id, source_sha256: semanticHash(payload),
  };
  assert.equal(live.ok, true, "live lookup failed");
  assert.equal(live.complete, true, "incomplete live PR lookup");
  assert(Array.isArray(live.prs));
  const candidates = live.prs.filter((pr) => family === "pull_request"
    ? pr.number === payload.number
    : pr.head_sha === payload.after && pr.state === "open" && pr.draft === false);
  assert.equal(candidates.length, 1, "non-unique live PR");
  const pr = candidates[0];
  assert(pr.repository === REPOSITORY && pr.head_repository === REPOSITORY);
  assert(pr.state === "open" && pr.draft === false && positive(pr.number));
  assert(sha(pr.base_sha) && sha(pr.head_sha));
  assert(pr.ticket?.admission_valid === true && uuid(pr.ticket.issue_id));
  assert.equal(pr.ticket.project_id, "bc4d48fd-93e1-4377-9342-670a523729ac");
  return { source, family, pr };
}

export function evaluateWebhook(input) {
  const original = input.ledger ?? [];
  try {
    const { source, family, pr } = admitWebhook(input);
    const source_key = sourceKey(source);
    assert(Array.isArray(original));
    const occupiedRounds = new Set();
    // Validate every stored immutable record before allowing a duplicate shortcut.
    for (const entry of original) {
      assert.deepEqual(Object.keys(entry.effect).sort(), [...EFFECT_FIELDS].sort());
      assert.equal(entry.transition_key, transitionKey(entry.effect), "effect metadata conflict");
      const slot = canonicalize([entry.effect.ticket_issue_id, entry.effect.repository,
        entry.effect.pr_number, entry.effect.round, entry.effect.transition]);
      assert(!occupiedRounds.has(slot), "conflicting round effects");
      occupiedRounds.add(slot);
      assert(text(entry.child_id) && Array.isArray(entry.sources) && entry.sources.length > 0);
      for (const previous of entry.sources) {
        assert.equal(previous.source_key, sourceKey(previous));
        if (previous.source_kind === source.source_kind && previous.source_id === source.source_id) {
          assert.equal(previous.source_key, source_key, "source provenance conflict");
        }
      }
    }
    const identity = {
      protocol_version: "review-loop/v1", ticket_issue_id: pr.ticket.issue_id,
      repository: REPOSITORY, pr_number: pr.number, base_sha: pr.base_sha,
      current_head_sha: pr.head_sha,
    };
    const prior = original.filter((e) => e.effect.ticket_issue_id === identity.ticket_issue_id
      && e.effect.repository === identity.repository && e.effect.pr_number === identity.pr_number
      && e.effect.transition === "DISCARD_AND_REVIEW");
    const matching = prior.filter((e) => Object.entries(identity).every(([k, v]) => e.effect[k] === v));
    assert(matching.length <= 1, "duplicate effect children");
    const ledger = structuredClone(original);
    if (matching.length) {
      const effect = matching[0].effect;
      const entry = ledger.find((e) => e.transition_key === matching[0].transition_key);
      if (!entry.sources.some((s) => s.source_key === source_key)) entry.sources.push({ ...source, source_key });
      return { transition: "NO_ACTION_ALREADY_DISPATCHED", effect, source, source_key,
        transition_key: entry.transition_key, family, ledger };
    }
    const round = Math.max(0, ...prior.map((e) => e.effect.round)) + 1;
    assert(round <= 3, "round limit");
    const effect = { ...identity, round, transition: "DISCARD_AND_REVIEW" };
    const transition_key = transitionKey(effect);
    // Offline stand-in for a successfully persisted child, not a platform write.
    ledger.push({ transition_key, effect, child_id: `fixture-child-${round}`, sources: [{ ...source, source_key }] });
    return { transition: effect.transition, effect, source, source_key, transition_key, family, ledger };
  } catch {
    return { transition: "BLOCKED", ledger: original };
  }
}
