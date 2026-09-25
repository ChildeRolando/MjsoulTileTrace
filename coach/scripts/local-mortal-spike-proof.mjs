import { execFileSync } from "node:child_process";

const actualBranches = {
  chi: "resp_chi_actual", pon: "resp_pon_actual",
  daiminkan: "resp_daiminkan_actual", ron: "resp_hora_actual",
  pass: "resp_pass_on_discard",
};

export function countProvenWave1(responseDecisions, evaluated, validatedPackage) {
  const actual = Object.fromEntries([
    "resp_chi_actual", "resp_pon_actual", "resp_daiminkan_actual",
    "resp_hora_actual", "resp_pass_on_discard", "resp_chankan_actual",
  ].map((key) => [key, 0]));
  const passFamilies = Object.fromEntries(["chi", "pon", "daiminkan", "hora"].map((key) => [key, 0]));
  const inferred = new Map();
  for (const row of evaluated) {
    if (row.surface !== "response") continue;
    const ref = row.decision.decisionEventRef;
    if (inferred.has(ref)) throw new Error(`duplicate inferred response window: ${ref}`);
    inferred.set(ref, row);
  }
  const packaged = new Map();
  for (const row of validatedPackage.decisions) {
    if (row.surface !== "response" || row.outcome !== "analysis_ready" || row.modelEvaluation === undefined) continue;
    const ref = row.normalizedDecisionContext.triggerEventRef;
    if (packaged.has(ref)) throw new Error(`duplicate packaged response window: ${ref}`);
    packaged.set(ref, row);
  }
  for (const decision of responseDecisions) {
    const ref = decision.decisionEventRef;
    const inference = inferred.get(ref);
    const model = packaged.get(ref);
    if (!inference || !model) continue;
    const kind = decision.snapshot.privateState.decisionWindow.kind;
    const action = decision.actualAction?.kind;
    if (kind === "kan_response" && action === "ron") actual.resp_chankan_actual++;
    if (kind !== "discard_response") continue;
    const branch = actualBranches[action];
    if (branch) actual[branch]++;
    if (action !== "pass") continue;
    for (const candidate of inference.request.candidates) {
      const type = JSON.parse(candidate.mjaiActionJson).type;
      const family = type === "hora" ? "hora" : type;
      if (family in passFamilies) passFamilies[family] = 1;
    }
  }
  return { actual, passFamilies };
}

export function resolveAcceptanceCommit({ head, externalSha, status }) {
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("acceptance repository HEAD is unavailable");
  if (status.trim() !== "") throw new Error("acceptance working tree has tracked changes");
  if (externalSha !== undefined && externalSha !== head) throw new Error("GITHUB_SHA does not match acceptance repository HEAD");
  return head;
}

export function readAcceptanceCommit(repoRoot, externalSha = process.env.GITHUB_SHA) {
  const git = (...args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" }).trim();
  try {
    return resolveAcceptanceCommit({
      head: git("rev-parse", "--verify", "HEAD"),
      externalSha,
      status: git("status", "--porcelain", "--untracked-files=no"),
    });
  } catch (error) {
    throw new Error(`acceptance commit verification failed: ${error.message}`, { cause: error });
  }
}
