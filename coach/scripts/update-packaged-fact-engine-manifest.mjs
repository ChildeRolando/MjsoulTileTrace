import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_RELEASE = Object.freeze({
  target: "windows-x64",
  goVersion: "go1.24.13",
  protocolVersion: "mahjong-facts/v1",
  adapterVersion: "0.2.0",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  upstreamModuleVersion: "v0.0.0-20220623011142-514bb97c5a6d",
});
const EXPECTED_MAIN_MODULE = "github.com/riichi-coach/mahjong-facts";
const EXPECTED_HELPER_MODULE = "github.com/EndlessCheng/mahjong-helper";
const EXPECTED_HELPER_SUM =
  "h1:19XekgMg1Rg/jNcI67JtI+SEIUPXkpiRFYOCS7P6CkI=";

function hasExactKeys(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function parseModuleMetadata(moduleMetadata) {
  if (typeof moduleMetadata !== "string") {
    throw new Error("fact engine release inspection failed");
  }
  const lines = moduleMetadata.split(/\r?\n/u).filter((line) => line.length > 0);
  const versionMatch = lines[0]?.match(/:\s+(go\d+\.\d+\.\d+)$/u);
  if (versionMatch === null || versionMatch === undefined) {
    throw new Error("fact engine release inspection failed");
  }
  const records = lines.slice(1).map((line) => line.trimEnd().split("\t").slice(1));
  const exactRecords = (kind, predicate) =>
    records.filter((record) => record[0] === kind && predicate(record));
  const paths = exactRecords("path", () => true);
  const modules = exactRecords("mod", () => true);
  const helperDependencies = exactRecords(
    "dep",
    (record) => record[1] === EXPECTED_HELPER_MODULE,
  );
  const goos = exactRecords("build", (record) => record[1]?.startsWith("GOOS=") ?? false);
  const goarch = exactRecords(
    "build",
    (record) => record[1]?.startsWith("GOARCH=") ?? false,
  );
  const replacements = exactRecords("=>", () => true);
  if (
    versionMatch[1] !== EXPECTED_RELEASE.goVersion ||
    paths.length !== 1 || paths[0]?.length !== 2 ||
    paths[0]?.[1] !== EXPECTED_MAIN_MODULE ||
    modules.length !== 1 || modules[0]?.length !== 3 ||
    modules[0]?.[1] !== EXPECTED_MAIN_MODULE || modules[0]?.[2] !== "(devel)" ||
    helperDependencies.length !== 1 || helperDependencies[0]?.length !== 4 ||
    helperDependencies[0]?.[2] !== EXPECTED_RELEASE.upstreamModuleVersion ||
    helperDependencies[0]?.[3] !== EXPECTED_HELPER_SUM ||
    goos.length !== 1 || goos[0]?.length !== 2 || goos[0]?.[1] !== "GOOS=windows" ||
    goarch.length !== 1 || goarch[0]?.length !== 2 || goarch[0]?.[1] !== "GOARCH=amd64" ||
    replacements.length !== 0
  ) {
    throw new Error("fact engine release inspection failed");
  }
}

export function validateFactEngineReleaseInspection({
  identityResponse,
  moduleMetadata,
}) {
  if (
    !hasExactKeys(identityResponse, [
      "kind", "requestId", "protocolVersion", "identity",
    ]) ||
    identityResponse.kind !== "identity_result" ||
    identityResponse.requestId !== "manifest-update" ||
    identityResponse.protocolVersion !== EXPECTED_RELEASE.protocolVersion ||
    !hasExactKeys(identityResponse.identity, [
      "engine", "upstreamCommit", "adapterVersion", "protocolVersion",
    ]) ||
    identityResponse.identity.engine !== "mahjong-helper" ||
    identityResponse.identity.upstreamCommit !== EXPECTED_RELEASE.upstreamCommit ||
    identityResponse.identity.adapterVersion !== EXPECTED_RELEASE.adapterVersion ||
    identityResponse.identity.protocolVersion !== EXPECTED_RELEASE.protocolVersion
  ) {
    throw new Error("fact engine release inspection failed");
  }
  parseModuleMetadata(moduleMetadata);
}

function validatedRelease(release) {
  const exactKeys = [
    "sha256",
    "size",
    "target",
    "goVersion",
    "protocolVersion",
    "adapterVersion",
    "upstreamCommit",
    "upstreamModuleVersion",
  ];
  if (
    release === null ||
    typeof release !== "object" ||
    Array.isArray(release) ||
    Object.keys(release).sort().join("\0") !== [...exactKeys].sort().join("\0") ||
    typeof release.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(release.sha256) ||
    !Number.isSafeInteger(release.size) ||
    release.size <= 0 ||
    Object.entries(EXPECTED_RELEASE).some(([key, value]) => release[key] !== value)
  ) {
    throw new Error("invalid fact engine release metadata");
  }
  return {
    schemaVersion: 1,
    artifact: "mahjong-facts.exe",
    ...release,
  };
}

export function renderPackagedFactEngineManifests(release) {
  const manifest = validatedRelease(release);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const lines = Object.entries(manifest).map(([key, value]) =>
    `  ${key}: ${JSON.stringify(value)},`
  );
  const typescript = [
    "export const PACKAGED_FACT_ENGINE_MANIFEST = {",
    ...lines,
    "} as const;",
    "",
  ].join("\n");
  return { json, typescript };
}

function checkedCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    ...options,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error("fact engine release verification command failed");
  }
  return result.stdout;
}

async function updatePackagedFactEngineManifests() {
  const coachRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(coachRoot, "..");
  const binary = path.join(
    repoRoot,
    ".tools",
    "mahjong-facts",
    "windows-x64",
    "mahjong-facts.exe",
  );
  const bytes = await readFile(binary);
  const binaryStat = await stat(binary);
  const identityLine = checkedCommand(binary, [], {
    input: `${JSON.stringify({
      kind: "identity",
      requestId: "manifest-update",
      protocolVersion: EXPECTED_RELEASE.protocolVersion,
    })}\n`,
  }).trim();
  let identityResponse;
  try {
    identityResponse = JSON.parse(identityLine);
  } catch {
    throw new Error("fact engine release identity is invalid");
  }
  const moduleMetadata = checkedCommand("go", ["version", "-m", binary]);
  validateFactEngineReleaseInspection({ identityResponse, moduleMetadata });
  const rendered = renderPackagedFactEngineManifests({
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: binaryStat.size,
    ...EXPECTED_RELEASE,
  });
  await writeFile(
    path.join(coachRoot, "resources", "mahjong-facts", "windows-x64", "manifest.json"),
    rendered.json,
    "utf8",
  );
  await writeFile(
    path.join(
      coachRoot,
      "packages",
      "reasoning",
      "src",
      "fact-engine",
      "packaged-manifest.ts",
    ),
    rendered.typescript,
    "utf8",
  );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await updatePackagedFactEngineManifests();
}
