import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  LOCAL_MORTAL_ADAPTER_VERSION,
  LOCAL_MORTAL_PROTOCOL_VERSION,
  LIBRIICHI_RULE_PROTOCOL_VERSION,
  libriichiRuleCanonicalJson,
  type LibriichiRuleRequest,
  ManagedMortalRuntimeManifestSchema,
  type LocalMortalInferenceRequest,
  LOCAL_MORTAL_SCORING_PROTOCOL_VERSION,
  type LocalMortalScoringRequest,
} from "@riichi-coach/contracts";
import { ManagedMortalRuntime, loadManagedMortalManifest, sha256File } from "../src/index.js";

const fixture = fileURLToPath(new URL("./fixtures/protocol/fake_runtime.py", import.meta.url));
const dirs: string[] = [];
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setup(mode: string) {
  const dir = await mkdtemp(join(tmpdir(), "mortal-runtime-"));
  dirs.push(dir);
  const checkpoint = join(dir, "checkpoint.pth");
  const runtimePath = join(dir, "fake_runtime.py");
  const mortalSourcePath = join(dir, "mortal");
  const nativeModulePath = join(dir, "libriichi.pyd");
  await mkdir(mortalSourcePath);
  await copyFile(fixture, runtimePath);
  await writeFile(checkpoint, "fixture-checkpoint");
  await writeFile(join(mortalSourcePath, "model.py"), "fixture-model");
  await writeFile(join(mortalSourcePath, "engine.py"), "fixture-engine");
  await writeFile(nativeModulePath, "fixture-native");
  const runtimeHash = await sha256File(runtimePath);
  const checkpointHash = hash("fixture-checkpoint");
  const manifest = ManagedMortalRuntimeManifestSchema.parse({
    manifestVersion: "managed-mortal-runtime-manifest/v1",
    identity: {
      runtimeImplementation: "Equim-chan/Mortal",
      runtimeRevision: "0".repeat(40), runtimeVersion: "Mortal V4", runtimeArtifactSha256: runtimeHash,
      runtimeModelSha256: hash("fixture-model"), runtimeEngineSha256: hash("fixture-engine"),
      checkpointRepository: "Yuchen1457/mortal-582500", checkpointRevision: "1".repeat(40),
      checkpointModelTag: "mortal-hpc@582500", checkpointFileSha256: checkpointHash,
      protocolVersion: LOCAL_MORTAL_PROTOCOL_VERSION, adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
    },
    runtimeEntrypoint: "runtime/local_mortal_runtime.py", checkpointFile: "mortal_582500.pth",
    geometry: { observation: [1012, 34], legalActionSpace: 46, outputWidth: 47 },
    inference: { device: "cpu", mode: "eval", greedy: true, temperature: 1, amp: false },
    licenses: { runtime: "AGPL-3.0-or-later", checkpoint: "AGPL-3.0", redistribution: "verify_at_m8" },
  });
  const identity = { ...manifest.identity, nativeArtifactSha256: hash("fixture-native") };
  const environment: NodeJS.ProcessEnv = { ...process.env, MORTAL_FAKE_MODE: mode };
  const runtime = new ManagedMortalRuntime({
    executable: "python", runtimePath, checkpointPath: checkpoint, mortalSourcePath, nativeModulePath,
    manifest, identity, startTimeoutMs: 2_000, inferenceTimeoutMs: 100,
    environment,
  });
  const request: LocalMortalInferenceRequest = {
    protocolVersion: LOCAL_MORTAL_PROTOCOL_VERSION, requestId: "request-1", identity,
    recordId: "record", canonicalStreamIdentity: "fingerprint",
    decision: { decisionId: "decision", surface: "self", windowKind: "self_turn", triggerEventRef: "event", selfActor: 0 },
    events: [{ eventRef: "event", json: "{\"type\":\"tsumo\"}", canAct: true }],
    candidates: [
      { actionRef: "action:a", runtimeAction: { index: 0, variant: null }, mjaiActionJson: "{\"type\":\"dahai\"}" },
      { actionRef: "action:b", runtimeAction: { index: 1, variant: null }, mjaiActionJson: "{\"type\":\"dahai\"}" },
    ], actualActionRef: "action:a",
  };
  return { runtime, request, checkpoint, runtimePath, mortalSourcePath, nativeModulePath, environment, dir };
}

function ruleRequest(runtime: ManagedMortalRuntime): LibriichiRuleRequest {
  const events = [{ eventRef: "event", json: '{"type":"tsumo","actor":0,"pai":"1m"}' }];
  const content = {
    protocolVersion: LIBRIICHI_RULE_PROTOCOL_VERSION, operation: "legal_actions" as const,
    identity: runtime.ruleIdentity, canonicalStreamIdentity: "canonical-中文",
    eventPrefixSha256: hash(libriichiRuleCanonicalJson(events)),
    decision: { decisionId: "event", surface: "self" as const, windowKind: "self_turn" as const,
      triggerEventRef: "event", selfActor: 0, roundOrdinal: 0, riichiPhase: "none" as const },
    ruleSet: { length: "south" as const, redFives: { man: 1 as const, pin: 1 as const, sou: 1 as const },
      openTanyao: true, atamahane: false, westExtension: "sudden_death" as const, ippatsuCancelledByAnkan: true },
    events,
  };
  return { ...content, requestId: hash(libriichiRuleCanonicalJson(content)) };
}

function scoringRequest(runtime: ManagedMortalRuntime, identity: LocalMortalInferenceRequest["identity"]): LocalMortalScoringRequest {
  const rules = ruleRequest(runtime);
  const result = {
    protocolVersion: rules.protocolVersion, requestId: rules.requestId, identity: rules.identity,
    status: "ok" as const, actions: [
      { runtimeAction: { index: 0, variant: null }, mjaiActionJson: '{"type":"dahai","actor":0,"pai":"1m","tsumogiri":false}' },
      { runtimeAction: { index: 1, variant: null }, mjaiActionJson: '{"type":"dahai","actor":0,"pai":"2m","tsumogiri":true}' },
    ],
  };
  const content = {
    protocolVersion: LOCAL_MORTAL_SCORING_PROTOCOL_VERSION, operation: "score_actions" as const, identity,
    ruleRequest: rules, ruleResult: { ...result, resultId: hash(libriichiRuleCanonicalJson(result)) },
  };
  return { ...content, requestId: hash(libriichiRuleCanonicalJson(content)) };
}

describe("managed scoring of the sole native rule result", () => {
  it("binds every score to the exact rule result and native action", async () => {
    const { runtime, request } = await setup("success");
    try {
      const scoring = scoringRequest(runtime, request.identity);
      const response = await runtime.scoreRules(scoring);
      expect(response.status).toBe("ok");
      if (response.status !== "ok") throw new Error("fixture");
      expect(response.ruleResultId).toBe(scoring.ruleResult.resultId);
      expect(response.candidates).toEqual(scoring.ruleResult.actions.map((row, i) => ({
        runtimeAction: row.runtimeAction, ruleActionId: hash(libriichiRuleCanonicalJson(row)), qValue: i + 1,
      })));
      expect(response.preferredRuntimeAction).toEqual({ index: 1, variant: null });
    } finally { await runtime.close(); }
  });

  it.each([
    ["score_wrong_request", "mortal_protocol_invalid"], ["score_wrong_result", "mortal_runtime_identity_mismatch"],
    ["score_swapped_action_id", "mortal_candidate_mismatch"], ["score_wrong_identity", "mortal_runtime_identity_mismatch"],
    ["duplicate", "mortal_candidate_mismatch"], ["missing", "mortal_protocol_invalid"],
    ["unknown_preferred", "mortal_candidate_mismatch"], ["score_wrong_preferred", "mortal_candidate_mismatch"],
    ["extra_field", "mortal_protocol_invalid"], ["trailing_prose", "mortal_protocol_invalid"],
    ["extra_response", "mortal_protocol_invalid"], ["timeout", "mortal_runtime_timeout"], ["crash", "mortal_runtime_crash"],
  ])(
    "rejects %s and cleans up", async (mode, code) => {
      const { runtime, request } = await setup(mode);
      try { await expect(runtime.scoreRules(scoringRequest(runtime, request.identity))).rejects.toMatchObject({ code }); }
      finally { await runtime.close(); }
    });

  it("rejects stale content or result binding before starting a process", async () => {
    const { runtime, request, environment, dir } = await setup("success");
    const started = join(dir, "started.txt");
    environment.MORTAL_FAKE_START_COUNT_FILE = started;
    for (const mutation of ["input", "result", "native"] as const) {
      const scoring = scoringRequest(runtime, request.identity);
      if (mutation === "input") scoring.ruleRequest.canonicalStreamIdentity = "different";
      if (mutation === "result") scoring.ruleResult.requestId = "f".repeat(64);
      if (mutation === "native") scoring.identity.nativeArtifactSha256 = "f".repeat(64);
      const { requestId: _old, ...content } = scoring;
      scoring.requestId = hash(libriichiRuleCanonicalJson(content));
      await expect(runtime.scoreRules(scoring)).rejects.toHaveProperty("code");
    }
    await expect(readFile(started, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("managed libriichi rule operation", () => {
  it("does not start queued operations after an explicit close", async () => {
    const { runtime, request, environment, dir } = await setup("success");
    const started = join(dir, "started.txt");
    environment.MORTAL_FAKE_START_COUNT_FILE = started;
    const pending = Promise.allSettled([runtime.queryRules(ruleRequest(runtime)), runtime.infer(request)]);
    await runtime.close();
    const results = await pending;
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result).toMatchObject({ status: "rejected", reason: { code: "mortal_runtime_unavailable" } });
    }
    await expect(readFile(started, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(runtime.queryRules(ruleRequest(runtime))).resolves.toMatchObject({ status: "ok" });
    await runtime.close();
  });
  it("needs neither checkpoint nor model source, and survives failed model verification", async () => {
    const { runtime, request, checkpoint, mortalSourcePath } = await setup("success");
    await rm(checkpoint);
    await rm(join(mortalSourcePath, "model.py"));
    await rm(join(mortalSourcePath, "engine.py"));
    try {
      const rules = ruleRequest(runtime);
      expect(runtime.ruleIdentity).not.toHaveProperty("checkpointModelTag");
      await expect(runtime.queryRules(rules)).resolves.toMatchObject({ status: "ok", actions: [{ runtimeAction: { index: 0, variant: null } }] });
      await expect(runtime.infer(request)).rejects.toMatchObject({ code: "mortal_runtime_identity_mismatch" });
      await expect(runtime.queryRules(rules)).resolves.toMatchObject({ status: "ok" });
    } finally { await runtime.close(); }
  });
  it.each(["rule_wrong_request", "rule_wrong_identity", "rule_wrong_hash", "rule_duplicate", "rule_extra_score"])(
    "rejects %s without producing a rule result", async mode => {
      const { runtime } = await setup(mode);
      try { await expect(runtime.queryRules(ruleRequest(runtime))).rejects.toMatchObject({
        code: mode === "rule_duplicate" ? "mortal_candidate_mismatch" : "mortal_protocol_invalid",
      }); } finally { await runtime.close(); }
    });
  it("rejects modified inputs before issuing a request", async () => {
    const { runtime } = await setup("success");
    const request = ruleRequest(runtime);
    request.canonicalStreamIdentity = "another-stream";
    await expect(runtime.queryRules(request)).rejects.toMatchObject({ code: "mortal_protocol_invalid" });
  });
  it("distinguishes no action from a one-action result", async () => {
    const { runtime } = await setup("rule_non_action");
    try {
      const response = await runtime.queryRules(ruleRequest(runtime));
      expect(response).toMatchObject({ status: "non_action", reason: "native_cannot_act" });
      expect(response).not.toHaveProperty("actions");
    } finally { await runtime.close(); }
  });
  it("serializes simultaneous rule and scoring requests on the exact child", async () => {
    const { runtime, request } = await setup("success");
    try {
      const results = await Promise.all([runtime.queryRules(ruleRequest(runtime)), runtime.infer(request), runtime.queryRules(ruleRequest(runtime))]);
      expect(results.map(result => result.status)).toEqual(["ok", "ok", "ok"]);
    } finally { await runtime.close(); }
  });
});

describe("managed Mortal exact-child protocol", () => {
  for (const operation of ["infer", "close"] as const) {
    it(`R14: ${operation} settles after an idle protocol failure already terminated the child`, async () => {
      const { runtime, request, environment, dir } = await setup("idle_protocol_failure");
      const pidFile = join(dir, "pid.txt");
      const releaseFile = join(dir, "release.txt");
      environment.MORTAL_FAKE_PID_FILE = pidFile;
      environment.MORTAL_FAKE_RELEASE_FILE = releaseFile;
      await runtime.start();
      const pid = Number(await readFile(pidFile, "utf8"));
      await writeFile(releaseFile, "release");
      await expect.poll(() => {
        try { process.kill(pid, 0); return false; } catch { return true; }
      }).toBe(true);
      // The child has actually exited before the operation, so a late exit listener cannot work.
      const result = operation === "infer" ? runtime.infer(request) : runtime.close();
      let timer: NodeJS.Timeout | undefined;
      const bounded = Promise.race([result, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("cleanup did not settle")), 2_500);
      })]);
      try {
        if (operation === "infer") {
          await expect(bounded).rejects.toMatchObject({ code: "mortal_protocol_invalid" });
        } else {
          await expect(bounded).resolves.toBeUndefined();
        }
      } finally { clearTimeout(timer); }
      environment.MORTAL_FAKE_MODE = "success";
      await expect(runtime.infer(request)).resolves.toMatchObject({ status: "ok" });
      await runtime.close();
    }, 7_000);
  }

  it("keeps checked-out wrapper and Tenhou fixture bytes equal to their manifests", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifests/mortal-582500.windows-x64.json", import.meta.url), "utf8"));
    const wrapperPath = fileURLToPath(new URL("../runtime/local_mortal_runtime.py", import.meta.url));
    expect(await sha256File(wrapperPath)).toBe(manifest.identity.runtimeArtifactSha256);
    const fixtures = JSON.parse(await readFile(new URL("../../reasoning/tests/fixtures/local-mortal/fixture-manifest.json", import.meta.url), "utf8"));
    const attrs = await readFile(new URL("../../../../.gitattributes", import.meta.url), "utf8");
    expect(attrs).toContain("/coach/packages/mortal-runtime/runtime/local_mortal_runtime.py -text");
    expect(attrs).toContain("/coach/packages/reasoning/tests/fixtures/local-mortal/tenhou-*.xml -text");
    for (const fixture of fixtures.fixtures.filter((item: { sourceKind: string }) => item.sourceKind === "tenhou")) {
      const path = fileURLToPath(new URL(`../../reasoning/tests/fixtures/local-mortal/${fixture.source}`, import.meta.url));
      expect(await sha256File(path)).toBe(fixture.sha256);
    }
  });
  it("verifies artifacts and accepts one strict, identity-bound response", async () => {
    const { runtime, request } = await setup("success");
    try {
      const response = await runtime.infer(request);
      expect(response.status).toBe("ok");
    } finally { await runtime.close(); }
  });

  it("contains a ready child's EPIPE and permits a fresh retry", async () => {
    const {runtime,request,environment}=await setup("closed_stdin");
    try {
      await expect(runtime.infer(request)).rejects.toMatchObject({code:"mortal_runtime_crash"});
      environment.MORTAL_FAKE_MODE="success";
      await expect(runtime.infer(request)).resolves.toMatchObject({status:"ok"});
    } finally {await runtime.close();}
  });

  for (const [mode, code] of [
    ["duplicate", "mortal_candidate_mismatch"], ["missing", "mortal_candidate_mismatch"],
    ["unknown_preferred", "mortal_candidate_mismatch"],
    ["extra_field", "mortal_protocol_invalid"], ["extra_prose", "mortal_protocol_invalid"],
    ["oversize", "mortal_protocol_invalid"], ["crash", "mortal_runtime_crash"],
    ["trailing_prose", "mortal_protocol_invalid"], ["extra_response", "mortal_protocol_invalid"],
    ["unterminated_oversize", "mortal_protocol_invalid"],
    ["timeout", "mortal_runtime_timeout"],
  ] as const) {
    it(`fails closed on ${mode}`, async () => {
      const { runtime, request } = await setup(mode);
      try {
        await expect(runtime.infer(request)).rejects.toMatchObject({ code });
      } finally { await runtime.close(); }
    });
  }

  for (const [mode, code] of [
    ["actual_mismatch", "mortal_actual_action_mismatch"],
    ["output_incomplete", "mortal_output_incomplete"],
    ["runtime_unavailable", "mortal_runtime_unavailable"],
  ] as const) {
    it(`returns only the fixed safe error for ${mode}`, async () => {
      const { runtime, request } = await setup(mode);
      try {
        await expect(runtime.infer(request)).resolves.toMatchObject({ status: "error", code });
      } finally { await runtime.close(); }
    });
  }

  it("rejects a replaced checkpoint before subprocess start", async () => {
    const { runtime, request, checkpoint } = await setup("success");
    await writeFile(checkpoint, "replaced");
    await expect(runtime.infer(request)).rejects.toMatchObject({ code: "mortal_checkpoint_identity_mismatch" });
    await runtime.close();
  });

  it("rejects a replaced runtime before subprocess start", async () => {
    const { runtime, request, runtimePath } = await setup("success");
    await writeFile(runtimePath, "replaced");
    await expect(runtime.infer(request)).rejects.toMatchObject({ code: "mortal_runtime_identity_mismatch" });
    await runtime.close();
  });

  for (const artifact of ["model.py", "engine.py"] as const) {
    it(`rejects a replaced upstream ${artifact} before subprocess start`, async () => {
      const { runtime, request, mortalSourcePath } = await setup("success");
      await writeFile(join(mortalSourcePath, artifact), "replaced");
      await expect(runtime.infer(request)).rejects.toMatchObject({ code: "mortal_runtime_identity_mismatch" });
      await runtime.close();
    });
  }

  it("rejects a replaced native module before subprocess start", async () => {
    const { runtime, request, nativeModulePath } = await setup("success");
    await writeFile(nativeModulePath, "replaced");
    await expect(runtime.infer(request)).rejects.toMatchObject({ code: "mortal_runtime_identity_mismatch" });
    await runtime.close();
  });

  for (const mode of ["slow_start", "exit_before_ready"] as const) {
    it(`cleans a failed ${mode} child and permits a fresh retry`, async () => {
      const { runtime, request, environment } = await setup(mode);
      try {
        await expect(runtime.start()).rejects.toMatchObject({ code: "mortal_runtime_unavailable" });
        environment.MORTAL_FAKE_MODE = "success";
        await expect(runtime.infer(request)).resolves.toMatchObject({ status: "ok" });
      } finally {
        await runtime.close();
      }
    }, 5_000);
  }

  it("shares one startup handshake across concurrent and repeated start calls", async () => {
    const { runtime, environment, dir } = await setup("success");
    const startCountPath = join(dir, "start-count.txt");
    environment.MORTAL_FAKE_START_COUNT_FILE = startCountPath;
    try {
      await Promise.all([runtime.start(), runtime.start(), runtime.start()]);
      await runtime.start();
      expect((await readFile(startCountPath, "utf8")).trim().split("\n")).toHaveLength(1);
    } finally {
      await runtime.close();
    }
  });

  it("does not spawn after close races artifact verification", async () => {
    const { runtime, environment, dir } = await setup("success");
    const startCountPath = join(dir, "start-count.txt");
    environment.MORTAL_FAKE_START_COUNT_FILE = startCountPath;
    const starting = runtime.start();
    await runtime.close();
    await expect(starting).rejects.toMatchObject({ code: "mortal_runtime_unavailable" });
    await expect(readFile(startCountPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(runtime.start()).resolves.toBeUndefined();
    await runtime.close();
  });

  for (const pythonPath of ["", join(tmpdir(), "polluted-python-path")] as const) {
    it(`passes the verified native module explicitly with PYTHONPATH=${pythonPath === "" ? "empty" : "polluted"}`, async () => {
      const { runtime, nativeModulePath, environment } = await setup("success");
      environment.PYTHONPATH = pythonPath;
      environment.MORTAL_FAKE_EXPECT_NATIVE = nativeModulePath;
      try {
        await expect(runtime.start()).resolves.toBeUndefined();
      } finally {
        await runtime.close();
      }
    });
  }

  it("fails startup when the checked native path differs from the path supplied to the child", async () => {
    const { runtime, environment, dir } = await setup("success");
    environment.MORTAL_FAKE_EXPECT_NATIVE = join(dir, "different", "libriichi.pyd");
    try {
      await expect(runtime.start()).rejects.toMatchObject({ code: "mortal_runtime_unavailable" });
    } finally {
      await runtime.close();
    }
  });

  it("converts missing artifacts and invalid requests to fixed safe errors", async () => {
    const { runtime, request, runtimePath } = await setup("success");
    await rm(runtimePath);
    await expect(runtime.infer(request)).rejects.toEqual(expect.objectContaining({
      code: "mortal_runtime_identity_mismatch", message: "mortal_runtime_identity_mismatch",
    }));
    expect(() => JSON.stringify(runtime)).not.toThrow();
    await expect(runtime.infer({ ...request, unexpected: runtimePath } as never)).rejects.toEqual(expect.objectContaining({
      code: "mortal_protocol_invalid", message: "mortal_protocol_invalid",
    }));
  });

  it("converts missing, unreadable, and malformed manifests to a fixed safe error", async () => {
    const { dir } = await setup("success");
    const missing = join(dir, "missing.json");
    const unreadable = join(dir, "manifest-directory");
    const malformed = join(dir, "malformed.json");
    await mkdir(unreadable);
    await writeFile(malformed, "{");
    for (const path of [missing, unreadable, malformed]) {
      await expect(loadManagedMortalManifest(path)).rejects.toEqual(expect.objectContaining({
        code: "mortal_runtime_identity_mismatch", message: "mortal_runtime_identity_mismatch",
      }));
    }
  });

  it("rejects a request whose runtime identity differs from the managed manifest", async () => {
    const { runtime, request } = await setup("success");
    const mismatched = { ...request, identity: { ...request.identity, runtimeRevision: "f".repeat(40) } };
    try {
      await expect(runtime.infer(mismatched)).rejects.toMatchObject({ code: "mortal_runtime_identity_mismatch" });
    } finally { await runtime.close(); }
  });

  it("rejects a request whose actual action is absent from the candidate universe", async () => {
    const { runtime, request } = await setup("success");
    try {
      await expect(runtime.infer({ ...request, actualActionRef: "action:missing" }))
        .rejects.toMatchObject({ code: "mortal_actual_action_mismatch" });
    } finally { await runtime.close(); }
  });
});
