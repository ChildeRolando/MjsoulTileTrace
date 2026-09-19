import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const test = process.env.VITEST === "true"
  ? (await import("vitest")).test
  : (await import("node:test")).test;
import { canonicalize, evaluateWebhook, sourceKey, transitionKey } from "./review-loop-source.mjs";

const fixtures = JSON.parse(readFileSync(new URL("../fixtures/review-loop-v1/decision-cases.json", import.meta.url), "utf8"));
const schema = JSON.parse(readFileSync(new URL("../docs/specs/review-loop-v1.schema.json", import.meta.url), "utf8"));

// The two identity definitions use only this small JSON Schema subset. Reject
// unknown keywords so schema evolution cannot silently weaken fixture checks.
function validateIdentity(value, definition) {
  const supported = ["$ref", "type", "const", "enum", "required", "properties", "additionalProperties", "pattern", "minimum", "maximum"];
  for (const key of Object.keys(definition)) assert(supported.includes(key), `unsupported schema keyword ${key}`);
  if (definition.$ref) return validateIdentity(value, schema.$defs[definition.$ref.split("/").at(-1)]);
  if (definition.type === "object") {
    assert(value && typeof value === "object" && !Array.isArray(value));
    for (const key of definition.required) assert(Object.hasOwn(value, key), key);
    for (const key of Object.keys(value)) {
      assert(Object.hasOwn(definition.properties, key), key);
      validateIdentity(value[key], definition.properties[key]);
    }
    assert.equal(definition.additionalProperties, false);
  } else if (definition.type === "integer") assert(Number.isInteger(value));
  else if (definition.type) assert.equal(typeof value, definition.type);
  if (Object.hasOwn(definition, "const")) assert.equal(value, definition.const);
  if (definition.enum) assert(definition.enum.includes(value));
  if (definition.pattern) assert(new RegExp(definition.pattern).test(value));
  if (definition.minimum !== undefined) assert(value >= definition.minimum);
  if (definition.maximum !== undefined) assert(value <= definition.maximum);
}

test("required normalized webhook coverage", () => {
  assert(fixtures.webhook_cases.length >= 12);
  for (const name of ["valid signed normalized pull_request source", "valid normalized push source",
    "malformed eventPayload", "ambiguous event shape", "wrong repository", "wrong trigger/run association",
    "unsigned trigger deployment configuration", "non-GitHub trigger deployment configuration",
    "duplicate same run", "distinct push + pull_request same effect", "same effect metadata conflict",
    "stale payload but newer live HEAD", "live GitHub lookup failure"]) {
    assert(fixtures.webhook_cases.some((fixture) => fixture.name === name), `missing fixture: ${name}`);
  }
});
for (const fixture of fixtures.webhook_cases) {
  test(fixture.name, () => {
    let ledger = [];
    let dispatches = 0;
    for (const step of fixture.steps) {
      const input = structuredClone(fixtures.webhook_baseline);
      for (const patch of step.patches) {
        const parent = patch.path.slice(0, -1).reduce((v, key) => v[key], input);
        const key = patch.path.at(-1);
        if (patch.remove) delete parent[key];
        else parent[key] = structuredClone(patch.value);
      }
      const before = structuredClone(ledger);
      const output = evaluateWebhook({ ...input, ledger });
      assert.equal(output.transition, step.expected.transition, fixture.name);
      if (output.transition === "BLOCKED") assert.deepEqual(output.ledger, before, fixture.name);
      else {
        validateIdentity(output.source, schema.$defs.webhookSource);
        validateIdentity(output.effect, schema.$defs.effectIdentity);
      }
      if (step.expected.head) assert.equal(output.effect.current_head_sha, step.expected.head, fixture.name);
      if (step.expected.round) assert.equal(output.effect.round, step.expected.round, fixture.name);
      dispatches += output.transition === "DISCARD_AND_REVIEW" ? 1 : 0;
      ledger = output.ledger;
      if (step.corrupt_effect) ledger[0].effect.current_head_sha = "f".repeat(40);
    }
    assert.equal(dispatches, fixture.dispatches, fixture.name);
    if (fixture.sources) assert.equal(ledger[0].sources.length, fixture.sources, fixture.name);
  });
}

test("RFC 8785 serialization, strict rejection, and separate identity projections", () => {
  assert.equal(canonicalize({ z: [1e30, 4.50, -0], a: { b: true, a: null } }), '{"a":{"a":null,"b":true},"z":[1e+30,4.5,0]}');
  assert.equal(canonicalize({ "\uE000": 1, "😀": 2, "\r": 3 }), '{"\\r":3,"😀":2,"":1}');
  for (const invalid of [NaN, Infinity, undefined, 1n, "\ud800", { "\udfff": 1 }, new Date(), [,]]) {
    assert.throws(() => canonicalize(invalid));
  }
  const a = evaluateWebhook({ ...fixtures.webhook_baseline, ledger: [] });
  assert.equal(a.transition, "DISCARD_AND_REVIEW");
  assert.equal(transitionKey({ ...a.effect, source_id: "different" }), a.transition_key);
  assert.notEqual(sourceKey({ ...a.source, source_id: "00000000-0000-0000-0000-000000000009" }), a.source_key);
  assert.throws(() => transitionKey({ round: 1 }));
  const extraMetadata = structuredClone(a.ledger);
  extraMetadata[0].effect.unexpected = true;
  assert.equal(evaluateWebhook({ ...fixtures.webhook_baseline, ledger: extraMetadata }).transition, "BLOCKED");
  const conflictingRound = structuredClone(a.ledger);
  const second = structuredClone(conflictingRound[0]);
  second.effect.current_head_sha = "3".repeat(40);
  second.transition_key = transitionKey(second.effect);
  conflictingRound.push(second);
  assert.equal(evaluateWebhook({ ...fixtures.webhook_baseline, ledger: conflictingRound }).transition, "BLOCKED");
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => canonicalize(cycle));
  const input = structuredClone(fixtures.webhook_baseline);
  input.runs[0].trigger_payload.event = "not-authority";
  input.runs[0].trigger_payload.request = { receivedAt: "different", contentType: "ignored" };
  const reverseKeys = (v) => Array.isArray(v) ? v.map(reverseKeys)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v;
  input.runs[0].trigger_payload.eventPayload = JSON.parse(JSON.stringify(reverseKeys(input.runs[0].trigger_payload.eventPayload), null, 2));
  assert.equal(evaluateWebhook({ ...input, ledger: [] }).source.source_sha256, a.source.source_sha256);
  input.runs[0].trigger_payload.eventPayload.action = "opened";
  assert.notEqual(evaluateWebhook({ ...input, ledger: [] }).source.source_sha256, a.source.source_sha256);
  input.runs[0].trigger_payload.eventPayload.extra = "\ud800";
  assert.equal(evaluateWebhook({ ...input, ledger: [] }).transition, "BLOCKED");
});
