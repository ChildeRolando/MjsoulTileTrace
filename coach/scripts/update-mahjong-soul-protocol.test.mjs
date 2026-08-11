import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";

import {
  ProtocolUpdateError,
  updateMahjongSoulProtocol,
} from "./update-mahjong-soul-protocol.mjs";

const registerTest = process.env.VITEST === "true"
  ? (await import("vitest")).test
  : (await import("node:test")).test;

function registerCleanup(context, callback) {
  if (typeof context.after === "function") context.after(callback);
  else if (typeof context.onTestFinished === "function") context.onTestFinished(callback);
  else throw new Error("test cleanup API unavailable");
}

const ENDPOINTS = {
  policyVersion: "mahjong-soul-cn-endpoints/v1",
  loginPageOrigins: ["https://game.maj-soul.com"],
  staticAssetOrigins: ["https://game.maj-soul.com"],
  gatewayDiscoveryOrigins: [
    "https://route-2.maj-soul.com",
    "https://route-3.maj-soul.com:8443",
    "https://route-4.maj-soul.com",
    "https://route-5.maj-soul.com",
    "https://route-6.maj-soul.com",
  ],
  lobbyWebSocketOrigins: [
    "wss://route-2.maj-soul.com",
    "wss://route-3.maj-soul.com:8443",
    "wss://route-4.maj-soul.com",
    "wss://route-5.maj-soul.com",
    "wss://route-6.maj-soul.com",
  ],
  recordDataPrefixes: [
    "https://record-old.maj-soul.com:9443/majsoul/game_record",
  ],
};

const encode = (value) => Buffer.from(value, "utf8");
const json = (value) => encode(JSON.stringify(value));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixtureVendorRoot = new URL(
  "../vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/",
  import.meta.url,
);
const fixtureProto = await readFile(new URL("liqi.proto", fixtureVendorRoot));
const fixtureRpcMap = await readFile(new URL("rpc-map.json", fixtureVendorRoot));
const fixtureOfficialSchema = json(
  protobuf.parse(fixtureProto.toString("utf8"), { keepCase: true }).root.toJSON(),
);

function fixture() {
  const commit = "1".repeat(40);
  const official = {
    resource: json({
      res: { "res/proto/liqi.json": { prefix: "v0.test.1.w" } },
    }),
    liqi: fixtureOfficialSchema,
    config: json({
      ip: [{
        name: "player",
        gateways: ENDPOINTS.gatewayDiscoveryOrigins.map((url, index) => ({
          id: `route-${index + 2}`,
          url,
        })),
        prefix_url: ENDPOINTS.recordDataPrefixes[0],
        contest_chat_url: "wss://must-not-be-emitted.invalid/client",
      }],
      tracker_url: "must-not-be-emitted.invalid/tracker",
      mycard_url: "https://must-not-be-emitted.invalid/payment",
      wapchat_url: "https://must-not-be-emitted.invalid/chat",
      unknown_url: "https://must-not-be-emitted.invalid/arbitrary",
    }),
    current: encode(
      '{"version":"0.test.1.w","force_version":"0.10.0.w","code":"v0.test.1.w/code.js"}',
    ),
  };
  const vendor = new Map([
    ["LICENSE.txt", encode("Apache fixture\n")],
    ["NOTICE", encode("Notice fixture\n")],
    ["src/bridge/majsoul/proto/liqi.proto", fixtureProto],
    ["src/bridge/majsoul/liqi.json", fixtureRpcMap],
  ]);
  const lock = {
    lockVersion: "mahjong-soul-protocol-source/v1",
    region: "cn",
    official: {
      clientVersion: "0.test.1.w",
      currentVersionSnapshot: {
        url: "https://game.maj-soul.com/1/version.json",
        size: official.current.length,
        sha256: digest(official.current),
      },
      resourceIndexUrl: "https://game.maj-soul.com/1/resversion0.test.1.w.json",
      resourceIndexSize: official.resource.length,
      resourceIndexSha256: digest(official.resource),
      liqiUrl: "https://game.maj-soul.com/1/v0.test.1.w/res/proto/liqi.json",
      liqiSize: official.liqi.length,
      liqiSha256: digest(official.liqi),
      configUrl: "https://game.maj-soul.com/1/v0.test.1.w/config.json",
      configSize: official.config.length,
      configSha256: digest(official.config),
    },
    vendor: {
      repository: "https://github.com/shinkuan/Akagi",
      commit,
      license: "Apache-2.0",
      files: [...vendor].map(([source, bytes]) => ({
        source,
        target: source === "src/bridge/majsoul/proto/liqi.proto"
          ? "liqi.proto"
          : source === "src/bridge/majsoul/liqi.json"
            ? "rpc-map.json"
            : source,
        size: bytes.length,
        sha256: digest(bytes),
      })),
    },
  };
  const urls = new Map([
    [lock.official.resourceIndexUrl, official.resource],
    [lock.official.liqiUrl, official.liqi],
    [lock.official.configUrl, official.config],
    [lock.official.currentVersionSnapshot.url, official.current],
    ...[...vendor].map(([source, bytes]) => [
      `https://raw.githubusercontent.com/shinkuan/Akagi/${commit}/${source}`,
      bytes,
    ]),
  ]);
  return { lock, urls, official };
}

function fetchFixture(urls, calls, override = new Map()) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    const bytes = override.get(String(url)) ?? urls.get(String(url));
    if (bytes === undefined) {
      return {
        ok: false,
        status: 500,
        arrayBuffer: async () => encode("upstream secret response"),
      };
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes,
    };
  };
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "mjs-protocol-test-"));
  const lockPath = path.join(root, "source-lock.json");
  const outputDir = path.join(root, "bundle");
  const data = fixture();
  await writeFile(lockPath, `${JSON.stringify(data.lock, null, 2)}\n`);
  return { root, lockPath, outputDir, ...data };
}

async function tree(root) {
  const result = new Map();
  async function visit(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), relative);
      else result.set(relative, await readFile(path.join(dir, entry.name)));
    }
  }
  await visit(root);
  return result;
}

function assertSameTree(actual, expected) {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort());
  for (const [name, bytes] of expected) {
    assert.deepEqual(actual.get(name), bytes, name);
  }
}

registerTest("production lock pins raw Akagi Git object bytes, not checkout line endings", async () => {
  const lock = JSON.parse(await readFile(new URL(
    "../vendor/mahjong-soul-protocol/source-lock.json",
    import.meta.url,
  ), "utf8"));
  assert.deepEqual(
    lock.vendor.files.map(({ target, size, sha256 }) => ({ target, size, sha256 })),
    [
      {
        target: "LICENSE.txt",
        size: 10752,
        sha256: "aa0e11e4740a0ae88ea797258500d9b066a68042be2f6036bfe49460b72405f0",
      },
      {
        target: "NOTICE",
        size: 5414,
        sha256: "2ffcce0e8bae52171dfdacd28ff9637334a2cc21d250deb4f30e315e65a3c421",
      },
      {
        target: "liqi.proto",
        size: 240793,
        sha256: "ccfa3f7b39c205e9d4690f61bc1b333df415edfdf8d1e325cd5fc8a5ac30cbb7",
      },
      {
        target: "rpc-map.json",
        size: 42178,
        sha256: "15f44eecb654e3b5cfca7682cf00f3a0a16ae3c76d0450b0257a9e89aa44be80",
      },
    ],
  );
});

registerTest("committed production bundle matches its lock, manifest, and byte-preservation rule", async () => {
  const bundleRoot = fileURLToPath(new URL(
    "../vendor/mahjong-soul-protocol/",
    import.meta.url,
  ));
  const lock = JSON.parse(await readFile(path.join(bundleRoot, "source-lock.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(bundleRoot, "manifest.json"), "utf8"));
  assert.deepEqual(
    (await readFile(new URL("../../.gitattributes", import.meta.url), "utf8"))
      .split(/\r?\n/u)
      .filter((line) => line !== ""),
    ["/coach/vendor/mahjong-soul-protocol/** -text"],
  );
  assert.deepEqual([...(await tree(bundleRoot)).keys()].sort(), [
    `akagi-v3/${lock.vendor.commit}/LICENSE.txt`,
    `akagi-v3/${lock.vendor.commit}/NOTICE`,
    `akagi-v3/${lock.vendor.commit}/liqi.proto`,
    `akagi-v3/${lock.vendor.commit}/rpc-map.json`,
    "endpoints.json",
    "manifest.json",
    "source-lock.json",
  ]);
  assert.deepEqual(manifest.official, {
    clientVersion: lock.official.clientVersion,
    resourceIndex: {
      sourceUrl: lock.official.resourceIndexUrl,
      size: lock.official.resourceIndexSize,
      sha256: lock.official.resourceIndexSha256,
    },
    liqi: {
      sourceUrl: lock.official.liqiUrl,
      size: lock.official.liqiSize,
      sha256: lock.official.liqiSha256,
    },
    config: {
      sourceUrl: lock.official.configUrl,
      size: lock.official.configSize,
      sha256: lock.official.configSha256,
    },
  });
  for (const file of lock.vendor.files) {
    const relative = `akagi-v3/${lock.vendor.commit}/${file.target}`;
    const bytes = await readFile(path.join(bundleRoot, relative));
    assert.equal(bytes.length, file.size);
    assert.equal(digest(bytes), file.sha256);
    assert.deepEqual(
      manifest.assets.find(({ path: assetPath }) => assetPath === relative),
      {
        kind: file.target === "LICENSE.txt" ? "license"
          : file.target === "NOTICE" ? "notice"
            : file.target === "liqi.proto" ? "proto"
              : "rpc_map",
        path: relative,
        sourceUrl: `https://raw.githubusercontent.com/shinkuan/Akagi/${lock.vendor.commit}/${file.source}`,
        size: file.size,
        sha256: file.sha256,
      },
    );
  }
  const endpoints = await readFile(path.join(bundleRoot, "endpoints.json"));
  const endpointAsset = manifest.assets.find(({ kind }) => kind === "endpoint_policy");
  assert.equal(endpoints.length, endpointAsset.size);
  assert.equal(digest(endpoints), endpointAsset.sha256);
});

registerTest("vendors only pinned assets and emits the narrow CN endpoint policy", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  const calls = [];
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, calls),
  });

  assert.equal(calls.some(({ url }) => url.endsWith("version.json")), false);
  assert.ok(calls.every(({ init }) => init?.redirect === "error"));
  assert.deepEqual(
    calls.map(({ url }) => url).sort(),
    [...input.urls.keys()].filter((url) => !url.endsWith("version.json")).sort(),
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(input.outputDir, "endpoints.json"), "utf8")),
    ENDPOINTS,
  );
  const manifest = JSON.parse(await readFile(
    path.join(input.outputDir, "manifest.json"),
    "utf8",
  ));
  assert.deepEqual(manifest.compatibility, {
    status: "compatible",
    clientVersion: input.lock.official.clientVersion,
    officialSchemaSha256: input.lock.official.liqiSha256,
    vendorProtoSha256: input.lock.vendor.files[2].sha256,
    vendorRpcMapSha256: input.lock.vendor.files[3].sha256,
    requiredSurfaceVersion: "mahjong-soul-required-surface/v2",
  });
  const files = [...(await tree(input.outputDir)).keys()].sort();
  assert.deepEqual(files, [
    `akagi-v3/${input.lock.vendor.commit}/LICENSE.txt`,
    `akagi-v3/${input.lock.vendor.commit}/NOTICE`,
    `akagi-v3/${input.lock.vendor.commit}/liqi.proto`,
    `akagi-v3/${input.lock.vendor.commit}/rpc-map.json`,
    "endpoints.json",
    "manifest.json",
    "source-lock.json",
  ]);
  const emitted = Buffer.concat([...(await tree(input.outputDir)).values()]).toString("utf8");
  for (const forbidden of ["tracker", "payment", "contest", "chat", "arbitrary"]) {
    assert.equal(emitted.includes(`must-not-be-emitted.invalid/${forbidden}`), false);
  }
});

registerTest("check rejects a tampered compatibility report/hash association", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
  });
  const manifestPath = path.join(input.outputDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.compatibility.officialSchemaSha256 = "0".repeat(64);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, []),
      mode: "check",
    }),
    (error) => error instanceof ProtocolUpdateError
      && error.code === "mahjong_soul_protocol_check_failed",
  );
});

registerTest("generation is byte-identical across independent runs", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  const first = path.join(input.root, "first");
  const second = path.join(input.root, "second");
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: first,
    fetchImpl: fetchFixture(input.urls, []),
  });
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: second,
    fetchImpl: fetchFixture(input.urls, []),
  });
  assertSameTree(await tree(first), await tree(second));
});

registerTest("retries only bounded transport failures", async (t) => {
  const recovered = await setup();
  registerCleanup(t, () => rm(recovered.root, { recursive: true, force: true }));
  const recoveredCalls = [];
  const normalFetch = fetchFixture(recovered.urls, recoveredCalls);
  let transientFailures = 0;
  await updateMahjongSoulProtocol({
    lockPath: recovered.lockPath,
    outputDir: recovered.outputDir,
    fetchImpl: async (...args) => {
      if (transientFailures === 0) {
        transientFailures += 1;
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("upstream secret transport prose"), {
            code: "ECONNRESET",
          }),
        });
      }
      return normalFetch(...args);
    },
  });
  assert.equal(transientFailures, 1);
  assert.equal(recoveredCalls.length, recovered.urls.size - 1);

  const exhausted = await setup();
  registerCleanup(t, () => rm(exhausted.root, { recursive: true, force: true }));
  let exhaustedCalls = 0;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: exhausted.lockPath,
      outputDir: exhausted.outputDir,
      fetchImpl: async () => {
        exhaustedCalls += 1;
        throw Object.assign(new Error("upstream secret transport prose"), { code: "ECONNRESET" });
      },
    }),
    (error) => {
      assert.ok(error instanceof ProtocolUpdateError);
      assert.equal(error.code, "mahjong_soul_protocol_update_failed");
      assert.equal(error.message, error.code);
      assert.doesNotMatch(error.message, /upstream|ECONNRESET/u);
      return true;
    },
  );
  assert.equal(exhaustedCalls, 3);

  for (const [name, makeError] of [
    ["abort", () => new DOMException("upstream secret abort prose", "AbortError")],
    ["plain error", () => new Error("upstream secret programmer prose")],
    ["unclassified type error", () => new TypeError("upstream secret type prose")],
  ]) {
    const rejected = await setup();
    registerCleanup(t, () => rm(rejected.root, { recursive: true, force: true }));
    let rejectedCalls = 0;
    await assert.rejects(
      updateMahjongSoulProtocol({
        lockPath: rejected.lockPath,
        outputDir: rejected.outputDir,
        fetchImpl: async () => {
          rejectedCalls += 1;
          throw makeError();
        },
      }),
      (error) => error instanceof ProtocolUpdateError &&
        error.code === "mahjong_soul_protocol_update_failed",
      name,
    );
    assert.equal(rejectedCalls, 1, name);
  }
});

registerTest("rejects bad bytes before replacing an existing bundle", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await mkdir(input.outputDir);
  await writeFile(path.join(input.outputDir, "sentinel"), "keep");
  const override = new Map([[input.lock.official.configUrl, encode("hostile response prose")]]);
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, [], override),
    }),
    (error) => {
      assert.ok(error instanceof ProtocolUpdateError);
      assert.equal(error.code, "mahjong_soul_protocol_update_failed");
      assert.equal(error.message, error.code);
      assert.doesNotMatch(error.message, /hostile|https?:|config/u);
      return true;
    },
  );
  assert.equal(await readFile(path.join(input.outputDir, "sentinel"), "utf8"), "keep");
});

registerTest("rejects same-length hash mismatches and redirected responses", async (t) => {
  const hashInput = await setup();
  registerCleanup(t, () => rm(hashInput.root, { recursive: true, force: true }));
  const original = hashInput.urls.get(hashInput.lock.official.liqiUrl);
  const sameLength = Buffer.from(original);
  sameLength[0] ^= 1;
  const hashCalls = [];
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: hashInput.lockPath,
      outputDir: hashInput.outputDir,
      fetchImpl: fetchFixture(hashInput.urls, hashCalls, new Map([[
        hashInput.lock.official.liqiUrl,
        sameLength,
      ]])),
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed",
  );
  assert.equal(
    hashCalls.filter(({ url }) => url === hashInput.lock.official.liqiUrl).length,
    1,
  );

  const redirectInput = await setup();
  registerCleanup(t, () => rm(redirectInput.root, { recursive: true, force: true }));
  let redirectCalls = 0;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: redirectInput.lockPath,
      outputDir: redirectInput.outputDir,
      fetchImpl: async (url, init) => {
        redirectCalls += 1;
        assert.equal(init.redirect, "error");
        return {
          ok: true,
          redirected: true,
          arrayBuffer: async () => redirectInput.urls.get(String(url)),
        };
      },
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed",
  );
  assert.equal(redirectCalls, 1);

  const oversizedInput = await setup();
  registerCleanup(t, () => rm(oversizedInput.root, { recursive: true, force: true }));
  let oversizedCalls = 0;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: oversizedInput.lockPath,
      outputDir: oversizedInput.outputDir,
      fetchImpl: async (url) => {
        oversizedCalls += 1;
        const expected = oversizedInput.urls.get(String(url));
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(expected.length + 1));
              controller.close();
            },
          }),
        };
      },
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed",
  );
  assert.equal(oversizedCalls, 1);
});

registerTest("rejects checkout-style CRLF conversion of pinned raw Git bytes", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  const protoUrl = [...input.urls.keys()].find((url) => url.endsWith("/liqi.proto"));
  const rawProto = input.urls.get(protoUrl);
  const crlfProto = Buffer.from(rawProto.toString("utf8").replaceAll("\n", "\r\n"));
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, [], new Map([[protoUrl, crlfProto]])),
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed",
  );
});

registerTest("rejects URL strings that only normalize to approved origins and paths", async (t) => {
  for (const mutate of [
    (lock) => {
      lock.official.resourceIndexUrl = lock.official.resourceIndexUrl.replace(
        "https://",
        "http://",
      );
    },
    (lock) => {
      lock.official.configUrl = lock.official.configUrl.replace(
        "game.maj-soul.com",
        "game.maj-soul.com.attacker.invalid",
      );
    },
    (lock) => {
      lock.official.resourceIndexUrl = lock.official.resourceIndexUrl.replace(
        "game.maj-soul.com/",
        "game.maj-soul.com:443/",
      );
    },
    (lock) => {
      lock.official.configUrl = lock.official.configUrl.replace("/1/", "/1/x/../");
    },
  ]) {
    const input = await setup();
    registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
    const before = structuredClone(input.lock);
    mutate(input.lock);
    const changedUrl = [
      input.lock.official.resourceIndexUrl,
      input.lock.official.configUrl,
    ].find((url) => !input.urls.has(url));
    const originalUrl = changedUrl.includes("resversion")
      ? before.official.resourceIndexUrl
      : before.official.configUrl;
    input.urls.set(changedUrl, input.urls.get(originalUrl));
    await writeFile(input.lockPath, `${JSON.stringify(input.lock, null, 2)}\n`);
    await assert.rejects(
      updateMahjongSoulProtocol({
        lockPath: input.lockPath,
        outputDir: input.outputDir,
        fetchImpl: fetchFixture(input.urls, []),
      }),
      (error) => error instanceof ProtocolUpdateError &&
        error.code === "mahjong_soul_protocol_update_failed",
    );
  }
});

registerTest("rejects source-declared response sizes above project limits", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  input.lock.official.configSize = 1024 * 1024;
  await writeFile(input.lockPath, `${JSON.stringify(input.lock, null, 2)}\n`);
  let fetched = false;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: async () => {
        fetched = true;
        throw new Error("must not fetch");
      },
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed",
  );
  assert.equal(fetched, false);
});

registerTest("fails closed when pinned official or RPC source structure is incompatible", async (t) => {
  const mutations = [
    (input) => ({
      url: input.lock.official.resourceIndexUrl,
      bytes: json({ res: { "res/proto/liqi.json": { prefix: "vwrong" } } }),
      setLock(bytes) {
        input.lock.official.resourceIndexSize = bytes.length;
        input.lock.official.resourceIndexSha256 = digest(bytes);
      },
    }),
    (input) => ({
      url: input.lock.official.liqiUrl,
      bytes: json({ incompatible: true }),
      setLock(bytes) {
        input.lock.official.liqiSize = bytes.length;
        input.lock.official.liqiSha256 = digest(bytes);
      },
    }),
    (input) => {
      const config = JSON.parse(input.urls.get(input.lock.official.configUrl));
      config.ip[0].gateways[0].url = "https://tracker.invalid";
      return {
        url: input.lock.official.configUrl,
        bytes: json(config),
        setLock(bytes) {
          input.lock.official.configSize = bytes.length;
          input.lock.official.configSha256 = digest(bytes);
        },
      };
    },
    (input) => {
      const config = JSON.parse(input.urls.get(input.lock.official.configUrl));
      config.ip[0].prefix_url = "https://payment.invalid/records";
      return {
        url: input.lock.official.configUrl,
        bytes: json(config),
        setLock(bytes) {
          input.lock.official.configSize = bytes.length;
          input.lock.official.configSha256 = digest(bytes);
        },
      };
    },
    (input) => {
      const file = input.lock.vendor.files.find(({ target }) => target === "rpc-map.json");
      const url = [...input.urls.keys()].find((candidate) => candidate.endsWith(file.source));
      return {
        url,
        bytes: json({ ".lq.Lobby.login": { req: 7, resp: ".lq.ResLogin" } }),
        setLock(bytes) {
          file.size = bytes.length;
          file.sha256 = digest(bytes);
        },
      };
    },
  ];
  for (const createMutation of mutations) {
    const input = await setup();
    registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
    const mutation = createMutation(input);
    mutation.setLock(mutation.bytes);
    input.urls.set(mutation.url, mutation.bytes);
    await writeFile(input.lockPath, `${JSON.stringify(input.lock, null, 2)}\n`);
    const calls = [];
    await assert.rejects(
      updateMahjongSoulProtocol({
        lockPath: input.lockPath,
        outputDir: input.outputDir,
        fetchImpl: fetchFixture(input.urls, calls),
      }),
      (error) => error instanceof ProtocolUpdateError &&
        error.code === "mahjong_soul_protocol_update_failed",
    );
    assert.equal(calls.filter(({ url }) => url === mutation.url).length, 1);
  }
});

registerTest("restores the old bundle when the staging-directory switch fails", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await mkdir(input.outputDir);
  await writeFile(path.join(input.outputDir, "sentinel"), "old");
  let renameCount = 0;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, []),
      swapOperations: {
        rename: async (...args) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error("injected switch failure");
          return rename(...args);
        },
        rm,
      },
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed" &&
      !error.message.includes("injected"),
  );
  assert.equal(renameCount, 3);
  assert.equal(await readFile(path.join(input.outputDir, "sentinel"), "utf8"), "old");
  assert.deepEqual(
    (await readdir(input.root)).filter((name) => /\.staging-|\.backup-/u.test(name)),
    [],
  );
});

registerTest("preserves the recoverable backup if both switch and restore fail", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await mkdir(input.outputDir);
  await writeFile(path.join(input.outputDir, "sentinel"), "old");
  let renameCount = 0;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, []),
      swapOperations: {
        rename: async (...args) => {
          renameCount += 1;
          if (renameCount >= 2) throw new Error("injected rename failure");
          return rename(...args);
        },
        rm,
      },
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed" &&
      error.message === error.code,
  );
  const backups = (await readdir(input.root)).filter((name) => name.includes(".backup-"));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(input.root, backups[0], "sentinel"), "utf8"), "old");
  assert.equal((await readdir(input.root)).some((name) => name.includes(".staging-")), false);
});

registerTest("does not report failure after a committed switch if backup cleanup fails", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await mkdir(input.outputDir);
  await writeFile(path.join(input.outputDir, "sentinel"), "old");
  let cleanupAttempted = false;
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
    swapOperations: {
      rename,
      rm: async (target, options) => {
        if (String(target).includes(".backup-")) {
          cleanupAttempted = true;
          throw new Error("injected cleanup failure");
        }
        return rm(target, options);
      },
    },
  });
  assert.equal(cleanupAttempted, true);
  await assert.rejects(readFile(path.join(input.outputDir, "sentinel")));
  assert.equal(JSON.parse(await readFile(
    path.join(input.outputDir, "manifest.json"),
    "utf8",
  )).region, "cn");
  assert.equal(
    (await readdir(input.root)).filter((name) => name.includes(".backup-")).length,
    1,
  );
});

registerTest("recovers an interrupted directory switch before reading the in-bundle lock", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
  });
  const inBundleLock = path.join(input.outputDir, "source-lock.json");
  const backup = `${input.outputDir}.backup-999-00000000-0000-4000-8000-000000000001`;
  const staging = path.join(
    input.root,
    ".bundle.staging-999-00000000-0000-4000-8000-000000000002",
  );
  await rename(input.outputDir, backup);
  await mkdir(staging);
  await writeFile(path.join(staging, "incomplete"), "new");

  await updateMahjongSoulProtocol({
    lockPath: inBundleLock,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
    mode: "check",
  });

  assert.equal(JSON.parse(await readFile(inBundleLock, "utf8")).region, "cn");
  assert.deepEqual(
    (await readdir(input.root)).filter((name) => /\.staging-|\.backup-/u.test(name)),
    [],
  );
});

registerTest("cleans a committed switch backup on the next invocation", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
  });
  const backup = `${input.outputDir}.backup-999-00000000-0000-4000-8000-000000000003`;
  await mkdir(backup);
  await writeFile(path.join(backup, "old"), "old");

  await updateMahjongSoulProtocol({
    lockPath: path.join(input.outputDir, "source-lock.json"),
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
    mode: "check",
  });

  assert.equal((await readdir(input.root)).some((name) => name.includes(".backup-")), false);
});

registerTest("fails closed instead of guessing between multiple interrupted backups", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  const backups = [
    `${input.outputDir}.backup-999-00000000-0000-4000-8000-000000000004`,
    `${input.outputDir}.backup-999-00000000-0000-4000-8000-000000000005`,
  ];
  for (const backup of backups) {
    await mkdir(backup);
    await writeFile(path.join(backup, "old"), "old");
  }

  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, []),
    }),
    (error) => error instanceof ProtocolUpdateError
      && error.code === "mahjong_soul_protocol_update_failed",
  );
  assert.deepEqual(
    (await readdir(input.root)).filter((name) => name.includes(".backup-")).sort(),
    backups.map((backup) => path.basename(backup)).sort(),
  );
});

registerTest("an exclusive update lock keeps concurrent invocations from deleting live artifacts", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  let enterFirstFetch;
  let releaseFirstFetch;
  const firstFetchEntered = new Promise((resolve) => { enterFirstFetch = resolve; });
  const firstFetchRelease = new Promise((resolve) => { releaseFirstFetch = resolve; });
  const normalFetch = fetchFixture(input.urls, []);
  let firstCall = true;
  const first = updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: async (...args) => {
      if (firstCall) {
        firstCall = false;
        enterFirstFetch();
        await firstFetchRelease;
      }
      return normalFetch(...args);
    },
  });
  await firstFetchEntered;

  let secondFetchCalls = 0;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: async (...args) => {
        secondFetchCalls += 1;
        return normalFetch(...args);
      },
    }),
    (error) => error instanceof ProtocolUpdateError
      && error.code === "mahjong_soul_protocol_update_failed",
  );
  assert.equal(secondFetchCalls, 0);

  releaseFirstFetch();
  await first;
  assert.equal(JSON.parse(await readFile(
    path.join(input.outputDir, "manifest.json"),
    "utf8",
  )).region, "cn");
  assert.deepEqual(
    (await readdir(input.root)).filter((name) =>
      /\.staging-|\.backup-|\.update-lock/u.test(name)),
    [],
  );
});

registerTest("a failed release-quarantine cleanup does not leave the updater locked", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  let cleanupAttempted = false;
  const lockOperations = {
    rename,
    rm: async (target, options) => {
      if (String(target).includes(".update-lock-released-")) {
        cleanupAttempted = true;
        throw new Error("injected release cleanup failure");
      }
      return rm(target, options);
    },
  };
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
    lockOperations,
  });
  assert.equal(cleanupAttempted, true);

  await updateMahjongSoulProtocol({
    lockPath: path.join(input.outputDir, "source-lock.json"),
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
    mode: "check",
  });
  assert.equal(
    (await readdir(input.root)).some((name) => name === ".bundle.update-lock"),
    false,
  );
});

registerTest("reclaims a well-formed lock owned by an exited process", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  const deadPid = child.pid;
  assert.equal(typeof deadPid, "number");
  await once(child, "exit");
  const lockDir = path.join(input.root, ".bundle.update-lock");
  await mkdir(lockDir);
  await writeFile(path.join(lockDir, "owner.json"), `${JSON.stringify({
    pid: deadPid,
    token: "00000000-0000-4000-8000-000000000006",
  })}\n`);

  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
  });
  assert.equal(JSON.parse(await readFile(
    path.join(input.outputDir, "manifest.json"),
    "utf8",
  )).region, "cn");
  assert.equal(
    (await readdir(input.root)).some((name) => name === ".bundle.update-lock"),
    false,
  );
});

registerTest("reports a fixed failure when the atomic unlock rename fails", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, []),
      lockOperations: {
        rename: async (source, target) => {
          if (String(target).includes(".update-lock-released-")) {
            throw new Error("injected unlock failure");
          }
          return rename(source, target);
        },
        rm,
      },
    }),
    (error) => error instanceof ProtocolUpdateError
      && error.code === "mahjong_soul_protocol_update_failed"
      && !error.message.includes("injected"),
  );
});

registerTest("fails closed on unexpected source-lock keys", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  input.lock.vendor.files[0].unexpected = "secret";
  await writeFile(input.lockPath, `${JSON.stringify(input.lock, null, 2)}\n`);
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, []),
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_update_failed" &&
      !error.message.includes("secret"),
  );
});

registerTest("check compares exact bytes without modifying the checked bundle", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, []),
  });
  const before = await tree(input.outputDir);
  const cleanCalls = [];
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, cleanCalls),
    mode: "check",
  });
  assert.equal(cleanCalls.some(({ url }) => url.endsWith("version.json")), false);
  assertSameTree(await tree(input.outputDir), before);

  await writeFile(path.join(input.outputDir, "endpoints.json"), "{}\n");
  const mutated = await tree(input.outputDir);
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, []),
      mode: "check",
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_check_failed",
  );
  assertSameTree(await tree(input.outputDir), mutated);
});

registerTest("check-current is the only mode that fetches mutable version metadata", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  const calls = [];
  await updateMahjongSoulProtocol({
    lockPath: input.lockPath,
    outputDir: input.outputDir,
    fetchImpl: fetchFixture(input.urls, calls),
    mode: "check-current",
  });
  assert.deepEqual(calls.map(({ url }) => url), [
    input.lock.official.currentVersionSnapshot.url,
  ]);
  assert.equal(calls[0].init.redirect, "error");
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: fetchFixture(input.urls, [], new Map([[
        input.lock.official.currentVersionSnapshot.url,
        encode('{"version":"changed","force_version":"0.10.0.w","code":"changed/code.js"}'),
      ]])),
      mode: "check-current",
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.code === "mahjong_soul_protocol_current_drift" &&
      error.message === error.code,
  );
});

registerTest("rejects failed upstream responses without exposing URL or response prose", async (t) => {
  const input = await setup();
  registerCleanup(t, () => rm(input.root, { recursive: true, force: true }));
  let calls = 0;
  await assert.rejects(
    updateMahjongSoulProtocol({
      lockPath: input.lockPath,
      outputDir: input.outputDir,
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: false,
          status: 500,
          arrayBuffer: async () => encode("private upstream prose"),
        };
      },
    }),
    (error) => error instanceof ProtocolUpdateError &&
      error.message === "mahjong_soul_protocol_update_failed" &&
      !/private|https?:|500/u.test(error.message),
  );
  assert.equal(calls, 1);
});
