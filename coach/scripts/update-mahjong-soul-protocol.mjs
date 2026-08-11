import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyMahjongSoulProtocolCompatibility,
} from "./mahjong-soul-protocol-compatibility.mjs";

const UPDATE_FAILED = "mahjong_soul_protocol_update_failed";
const CHECK_FAILED = "mahjong_soul_protocol_check_failed";
const CURRENT_DRIFT = "mahjong_soul_protocol_current_drift";

const BUNDLE_VERSION = "mahjong-soul-cn-protocol/v1";
const ADAPTER_VERSION = "0.1.0";
const LOCK_VERSION = "mahjong-soul-protocol-source/v1";
const AKAGI_REPOSITORY = "https://github.com/shinkuan/Akagi";
const AKAGI_RAW_ROOT = "https://raw.githubusercontent.com/shinkuan/Akagi";
const GAME_ORIGIN = "https://game.maj-soul.com";
const VERSION_URL = `${GAME_ORIGIN}/1/version.json`;

const MAXIMUM_SOURCE_SIZES = Object.freeze({
  currentVersion: 1024,
  resourceIndex: 16 * 1024 * 1024,
  liqi: 1024 * 1024,
  config: 64 * 1024,
  license: 128 * 1024,
  notice: 128 * 1024,
  proto: 2 * 1024 * 1024,
  rpcMap: 2 * 1024 * 1024,
});

const VENDOR_FILES = Object.freeze([
  Object.freeze({ source: "LICENSE.txt", target: "LICENSE.txt", kind: "license" }),
  Object.freeze({ source: "NOTICE", target: "NOTICE", kind: "notice" }),
  Object.freeze({
    source: "src/bridge/majsoul/proto/liqi.proto",
    target: "liqi.proto",
    kind: "proto",
  }),
  Object.freeze({
    source: "src/bridge/majsoul/liqi.json",
    target: "rpc-map.json",
    kind: "rpc_map",
  }),
]);

const GATEWAY_ORIGINS = Object.freeze([
  "https://route-2.maj-soul.com",
  "https://route-3.maj-soul.com:8443",
  "https://route-4.maj-soul.com",
  "https://route-5.maj-soul.com",
  "https://route-6.maj-soul.com",
]);
const LOBBY_WEBSOCKET_ORIGINS = Object.freeze(
  GATEWAY_ORIGINS.map((origin) => origin.replace(/^https:/u, "wss:")),
);
const RECORD_PREFIX =
  "https://record-old.maj-soul.com:9443/majsoul/game_record";

export class ProtocolUpdateError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProtocolUpdateError";
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return isRecord(value) &&
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isSize(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function parseHttps(value) {
  if (typeof value !== "string") throw new Error();
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    parsed.search !== "" ||
    parsed.href !== value
  ) throw new Error();
  return parsed;
}

function parseSourceLock(bytes) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error();
  }
  if (!exactKeys(value, ["lockVersion", "region", "official", "vendor"]) ||
    value.lockVersion !== LOCK_VERSION || value.region !== "cn") throw new Error();
  const officialKeys = [
    "clientVersion",
    "currentVersionSnapshot",
    "resourceIndexUrl",
    "resourceIndexSize",
    "resourceIndexSha256",
    "liqiUrl",
    "liqiSize",
    "liqiSha256",
    "configUrl",
    "configSize",
    "configSha256",
  ];
  const official = value.official;
  if (!exactKeys(official, officialKeys) ||
    typeof official.clientVersion !== "string" ||
    !/^[0-9]+(?:\.[A-Za-z0-9]+){2}\.w$/u.test(official.clientVersion) ||
    !exactKeys(official.currentVersionSnapshot, ["url", "size", "sha256"]) ||
    official.currentVersionSnapshot.url !== VERSION_URL ||
    !isSize(official.currentVersionSnapshot.size) ||
    official.currentVersionSnapshot.size > MAXIMUM_SOURCE_SIZES.currentVersion ||
    !isSha256(official.currentVersionSnapshot.sha256)) throw new Error();

  const resourceUrl = parseHttps(official.resourceIndexUrl);
  const liqiUrl = parseHttps(official.liqiUrl);
  const configUrl = parseHttps(official.configUrl);
  if (resourceUrl.origin !== GAME_ORIGIN || liqiUrl.origin !== GAME_ORIGIN ||
    configUrl.origin !== GAME_ORIGIN ||
    official.resourceIndexUrl !==
      `${GAME_ORIGIN}/1/resversion${official.clientVersion}.json` ||
    official.configUrl !== `${GAME_ORIGIN}/1/v${official.clientVersion}/config.json` ||
    !/^\/1\/v[0-9]+(?:\.[A-Za-z0-9]+){2}\.w\/res\/proto\/liqi\.json$/u
      .test(liqiUrl.pathname) ||
    !isSize(official.resourceIndexSize) ||
    official.resourceIndexSize > MAXIMUM_SOURCE_SIZES.resourceIndex ||
    !isSha256(official.resourceIndexSha256) ||
    !isSize(official.liqiSize) || official.liqiSize > MAXIMUM_SOURCE_SIZES.liqi ||
    !isSha256(official.liqiSha256) ||
    !isSize(official.configSize) || official.configSize > MAXIMUM_SOURCE_SIZES.config ||
    !isSha256(official.configSha256)) throw new Error();

  const vendor = value.vendor;
  if (!exactKeys(vendor, ["repository", "commit", "license", "files"]) ||
    vendor.repository !== AKAGI_REPOSITORY ||
    typeof vendor.commit !== "string" || !/^[0-9a-f]{40}$/u.test(vendor.commit) ||
    vendor.license !== "Apache-2.0" || !Array.isArray(vendor.files) ||
    vendor.files.length !== VENDOR_FILES.length) throw new Error();
  for (let index = 0; index < VENDOR_FILES.length; index += 1) {
    const file = vendor.files[index];
    const required = VENDOR_FILES[index];
    const maximumSize = [
      MAXIMUM_SOURCE_SIZES.license,
      MAXIMUM_SOURCE_SIZES.notice,
      MAXIMUM_SOURCE_SIZES.proto,
      MAXIMUM_SOURCE_SIZES.rpcMap,
    ][index];
    if (!exactKeys(file, ["source", "target", "size", "sha256"]) ||
      file.source !== required.source || file.target !== required.target ||
      !isSize(file.size) || file.size > maximumSize ||
      !isSha256(file.sha256)) throw new Error();
  }
  return value;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function responseBytes(response, maximumSize) {
  if (!isRecord(response) || response.ok !== true || response.redirected === true) {
    throw new Error();
  }
  if (response.body !== undefined && response.body !== null &&
    typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      size += chunk.length;
      if (size > maximumSize) {
        await reader.cancel().catch(() => {});
        throw new Error();
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  }
  if (typeof response.arrayBuffer !== "function") throw new Error();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximumSize) throw new Error();
  return bytes;
}

async function fetchLocked(fetchImpl, url, size, sha256) {
  const response = await fetchImpl(url, { redirect: "error" });
  const bytes = await responseBytes(response, size);
  if (bytes.length !== size || hash(bytes) !== sha256) throw new Error();
  return bytes;
}

function parseJson(bytes) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(value)) throw new Error();
    return value;
  } catch {
    throw new Error();
  }
}

function validateOfficialSources(lock, resourceBytes, liqiBytes, configBytes) {
  const resource = parseJson(resourceBytes);
  const prefix = resource.res?.["res/proto/liqi.json"]?.prefix;
  if (typeof prefix !== "string" ||
    `${GAME_ORIGIN}/1/${prefix}/res/proto/liqi.json` !== lock.official.liqiUrl) {
    throw new Error();
  }
  const liqi = parseJson(liqiBytes);
  if (!exactKeys(liqi, ["nested"]) || !isRecord(liqi.nested)) throw new Error();
  const config = parseJson(configBytes);
  if (!Array.isArray(config.ip)) throw new Error();
  const players = config.ip.filter((entry) => isRecord(entry) && entry.name === "player");
  if (players.length !== 1 || !Array.isArray(players[0].gateways) ||
    players[0].gateways.length !== GATEWAY_ORIGINS.length ||
    players[0].prefix_url !== RECORD_PREFIX) throw new Error();
  for (let index = 0; index < GATEWAY_ORIGINS.length; index += 1) {
    const gateway = players[0].gateways[index];
    if (!isRecord(gateway) || gateway.id !== `route-${index + 2}` ||
      gateway.url !== GATEWAY_ORIGINS[index]) throw new Error();
  }
}

function validateRpcMap(bytes) {
  const rpcMap = parseJson(bytes);
  for (const entry of Object.values(rpcMap)) {
    if (!exactKeys(entry, ["req", "resp"]) ||
      typeof entry.req !== "string" || typeof entry.resp !== "string") throw new Error();
  }
}

function endpointPolicy() {
  return {
    policyVersion: "mahjong-soul-cn-endpoints/v1",
    loginPageOrigins: [GAME_ORIGIN],
    staticAssetOrigins: [GAME_ORIGIN],
    gatewayDiscoveryOrigins: [...GATEWAY_ORIGINS],
    lobbyWebSocketOrigins: [...LOBBY_WEBSOCKET_ORIGINS],
    recordDataPrefixes: [RECORD_PREFIX],
  };
}

function stableJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBundle(
  stagingDir,
  lock,
  lockBytes,
  vendorBytes,
  compatibility,
) {
  const commitRoot = `akagi-v3/${lock.vendor.commit}`;
  const endpointsBytes = stableJson(endpointPolicy());
  const assets = lock.vendor.files.map((file, index) => ({
    kind: VENDOR_FILES[index].kind,
    path: `${commitRoot}/${file.target}`,
    sourceUrl: `${AKAGI_RAW_ROOT}/${lock.vendor.commit}/${file.source}`,
    size: file.size,
    sha256: file.sha256,
  }));
  assets.push({
    kind: "endpoint_policy",
    path: "endpoints.json",
    sourceUrl: lock.official.configUrl,
    size: endpointsBytes.length,
    sha256: hash(endpointsBytes),
  });
  const manifest = {
    bundleVersion: BUNDLE_VERSION,
    adapterVersion: ADAPTER_VERSION,
    region: "cn",
    official: {
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
    },
    vendor: {
      repository: lock.vendor.repository,
      commit: lock.vendor.commit,
      license: lock.vendor.license,
    },
    compatibility,
    assets,
  };
  await mkdir(path.join(stagingDir, commitRoot), { recursive: true });
  await writeFile(path.join(stagingDir, "source-lock.json"), lockBytes);
  await writeFile(path.join(stagingDir, "endpoints.json"), endpointsBytes);
  await writeFile(path.join(stagingDir, "manifest.json"), stableJson(manifest));
  for (let index = 0; index < lock.vendor.files.length; index += 1) {
    await writeFile(
      path.join(stagingDir, commitRoot, lock.vendor.files[index].target),
      vendorBytes[index],
    );
  }
}

async function buildStaging(lock, lockBytes, stagingDir, fetchImpl) {
  await mkdir(stagingDir, { recursive: false });
  const official = lock.official;
  const resourceBytes = await fetchLocked(
    fetchImpl,
    official.resourceIndexUrl,
    official.resourceIndexSize,
    official.resourceIndexSha256,
  );
  const liqiBytes = await fetchLocked(
    fetchImpl,
    official.liqiUrl,
    official.liqiSize,
    official.liqiSha256,
  );
  const configBytes = await fetchLocked(
    fetchImpl,
    official.configUrl,
    official.configSize,
    official.configSha256,
  );
  validateOfficialSources(lock, resourceBytes, liqiBytes, configBytes);
  const vendorBytes = [];
  for (const file of lock.vendor.files) {
    vendorBytes.push(await fetchLocked(
      fetchImpl,
      `${AKAGI_RAW_ROOT}/${lock.vendor.commit}/${file.source}`,
      file.size,
      file.sha256,
    ));
  }
  validateRpcMap(vendorBytes[3]);
  const compatibility = verifyMahjongSoulProtocolCompatibility({
    clientVersion: lock.official.clientVersion,
    officialSchemaBytes: liqiBytes,
    vendorProtoBytes: vendorBytes[2],
    vendorRpcMapBytes: vendorBytes[3],
  });
  await writeBundle(
    stagingDir,
    lock,
    lockBytes,
    vendorBytes,
    compatibility,
  );
}

async function readTree(root) {
  const result = new Map();
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error();
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile()) result.set(relative, await readFile(absolute));
      else throw new Error();
    }
  }
  await visit(root);
  return result;
}

async function treesEqual(leftRoot, rightRoot) {
  const left = await readTree(leftRoot);
  const right = await readTree(rightRoot);
  if (left.size !== right.size) return false;
  for (const [name, bytes] of left) {
    const other = right.get(name);
    if (other === undefined || !bytes.equals(other)) return false;
  }
  return true;
}

const DEFAULT_SWAP_OPERATIONS = Object.freeze({ rename, rm });

async function replaceDirectory(stagingDir, outputDir, operations) {
  const backupDir = `${outputDir}.backup-${process.pid}-${randomUUID()}`;
  let hadOutput = false;
  try {
    const existing = await lstat(outputDir);
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error();
    hadOutput = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (hadOutput) await operations.rename(outputDir, backupDir);
  try {
    await operations.rename(stagingDir, outputDir);
  } catch (error) {
    if (hadOutput) {
      try {
        await operations.rename(backupDir, outputDir);
      } catch (restoreError) {
        throw new AggregateError([error, restoreError]);
      }
    }
    throw error;
  }
  if (hadOutput) {
    await operations.rm(backupDir, { recursive: true, force: true }).catch(() => {});
  }
}

function stagingSibling(outputDir) {
  return path.join(
    path.dirname(outputDir),
    `.${path.basename(outputDir)}.staging-${process.pid}-${randomUUID()}`,
  );
}

async function checkCurrent(lock, fetchImpl) {
  const snapshot = lock.official.currentVersionSnapshot;
  const bytes = await fetchLocked(fetchImpl, snapshot.url, snapshot.size, snapshot.sha256);
  const current = parseJson(bytes);
  if (!exactKeys(current, ["version", "force_version", "code"]) ||
    current.version !== lock.official.clientVersion ||
    current.code !== `v${lock.official.clientVersion}/code.js` ||
    typeof current.force_version !== "string") throw new Error();
}

export async function updateMahjongSoulProtocol({
  lockPath,
  outputDir,
  fetchImpl = globalThis.fetch,
  mode = "write",
  swapOperations = DEFAULT_SWAP_OPERATIONS,
}) {
  const code = mode === "check" ? CHECK_FAILED
    : mode === "check-current" ? CURRENT_DRIFT
      : UPDATE_FAILED;
  let stagingDir;
  try {
    if (!new Set(["write", "check", "check-current"]).has(mode) ||
      typeof lockPath !== "string" || typeof outputDir !== "string" ||
      typeof fetchImpl !== "function" ||
      !exactKeys(swapOperations, ["rename", "rm"]) ||
      typeof swapOperations.rename !== "function" ||
      typeof swapOperations.rm !== "function") throw new Error();
    const lockBytes = await readFile(lockPath);
    const lock = parseSourceLock(lockBytes);
    if (mode === "check-current") {
      await checkCurrent(lock, fetchImpl);
      return;
    }
    await mkdir(path.dirname(outputDir), { recursive: true });
    stagingDir = stagingSibling(outputDir);
    await buildStaging(lock, lockBytes, stagingDir, fetchImpl);
    if (mode === "check") {
      if (!await treesEqual(stagingDir, outputDir)) throw new Error();
      await rm(stagingDir, { recursive: true, force: true });
      stagingDir = undefined;
      return;
    }
    await replaceDirectory(stagingDir, outputDir, swapOperations);
    stagingDir = undefined;
  } catch {
    if (stagingDir !== undefined) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
    throw new ProtocolUpdateError(code);
  }
}

async function main() {
  const coachRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = path.join(coachRoot, "vendor", "mahjong-soul-protocol");
  const lockPath = path.join(outputDir, "source-lock.json");
  const argument = process.argv[2];
  const mode = argument === undefined ? "write"
    : argument === "--check" ? "check"
      : argument === "--check-current" ? "check-current"
        : null;
  if (mode === null || process.argv.length > 3) throw new ProtocolUpdateError(UPDATE_FAILED);
  await updateMahjongSoulProtocol({ lockPath, outputDir, mode });
}

if (process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof ProtocolUpdateError ? error.code : UPDATE_FAILED;
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
