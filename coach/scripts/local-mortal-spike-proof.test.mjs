import assert from "node:assert/strict";
import { test } from "vitest";
import { countProvenWave1, resolveAcceptanceCommit } from "./local-mortal-spike-proof.mjs";

test("wave-1 counts require inference and a validated ModelEvaluation for the same window", () => {
  const window = { decisionEventRef: "event-1", snapshot: { privateState: { decisionWindow: { kind: "discard_response" } } }, actualAction: { kind: "ron" } };
  const pkg = { decisions: [{ surface: "response", outcome: "analysis_ready", normalizedDecisionContext: { triggerEventRef: "event-1" }, modelEvaluation: {} }] };
  assert.equal(countProvenWave1([window], [], pkg).actual.resp_hora_actual, 0);
  assert.equal(countProvenWave1([window], [{ surface: "response", decision: window, request: { candidates: [] } }], pkg).actual.resp_hora_actual, 1);
  assert.equal(countProvenWave1([window], [{ surface: "response", decision: window, request: { candidates: [] } }], { decisions: [] }).actual.resp_hora_actual, 0);
});

test("pass hora subcoverage requires a proven pass window with a hora candidate", () => {
  const window = { decisionEventRef: "pass-1", snapshot: { privateState: { decisionWindow: { kind: "discard_response" } } }, actualAction: { kind: "pass" } };
  const inference = { surface: "response", decision: window, request: { candidates: [{ mjaiActionJson: '{"type":"hora"}' }] } };
  const pkg = { decisions: [{ surface: "response", outcome: "analysis_ready", normalizedDecisionContext: { triggerEventRef: "pass-1" }, modelEvaluation: {} }] };
  assert.equal(countProvenWave1([window], [inference], pkg).passFamilies.hora, 1);
  assert.equal(countProvenWave1([window], [], pkg).passFamilies.hora, 0);
  assert.equal(countProvenWave1([window], [inference], { decisions: [] }).passFamilies.hora, 0);
});

test("receipt commit comes from HEAD and rejects mismatched environment or tracked changes", () => {
  const head = "a".repeat(40);
  assert.equal(resolveAcceptanceCommit({ head, externalSha: undefined, status: "" }), head);
  assert.throws(() => resolveAcceptanceCommit({ head, externalSha: "b".repeat(40), status: "" }), /GITHUB_SHA/);
  assert.throws(() => resolveAcceptanceCommit({ head, externalSha: undefined, status: " M coach\/script.mjs" }), /working tree/);
});
