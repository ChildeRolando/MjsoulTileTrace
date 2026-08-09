import assert from "node:assert/strict";
import {
  renderPackagedFactEngineManifests,
  validateFactEngineReleaseInspection,
} from "./update-packaged-fact-engine-manifest.mjs";

const release = {
  sha256: "a".repeat(64),
  size: 1234,
  target: "windows-x64",
  goVersion: "go1.24.13",
  protocolVersion: "mahjong-facts/v1",
  adapterVersion: "0.2.0",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  upstreamModuleVersion: "v0.0.0-20220623011142-514bb97c5a6d",
};

function rendersMatchingManifests() {
  const rendered = renderPackagedFactEngineManifests(release);
  const json = JSON.parse(rendered.json);
  assert.deepEqual(json, {
    schemaVersion: 1,
    artifact: "mahjong-facts.exe",
    ...release,
  });
  assert.match(rendered.typescript, /PACKAGED_FACT_ENGINE_MANIFEST/);
  for (const value of Object.values(json)) {
    if (typeof value === "string") assert.ok(rendered.typescript.includes(value));
  }
  assert.ok(rendered.json.endsWith("\n"));
  assert.ok(rendered.typescript.endsWith("\n"));
}

function rejectsMalformedMetadata() {
  assert.throws(() => renderPackagedFactEngineManifests({
    ...release,
    sha256: "not-a-digest",
  }), /invalid fact engine release metadata/);
  assert.throws(() => renderPackagedFactEngineManifests({
    ...release,
    size: 0,
  }), /invalid fact engine release metadata/);
}

const identityResponse = {
  kind: "identity_result",
  requestId: "manifest-update",
  protocolVersion: "mahjong-facts/v1",
  identity: {
    engine: "mahjong-helper",
    upstreamCommit: release.upstreamCommit,
    adapterVersion: release.adapterVersion,
    protocolVersion: release.protocolVersion,
  },
};
const moduleMetadata = [
  "mahjong-facts.exe: go1.24.13",
  "\tpath\tgithub.com/riichi-coach/mahjong-facts",
  "\tmod\tgithub.com/riichi-coach/mahjong-facts\t(devel)\t",
  `\tdep\tgithub.com/EndlessCheng/mahjong-helper\t${release.upstreamModuleVersion}\th1:19XekgMg1Rg/jNcI67JtI+SEIUPXkpiRFYOCS7P6CkI=`,
  "\tbuild\tGOOS=windows",
  "\tbuild\tGOARCH=amd64",
].join("\n");

function requiresExactIdentityAndEmbeddedModuleMetadata() {
  assert.doesNotThrow(() => validateFactEngineReleaseInspection({
    identityResponse,
    moduleMetadata,
  }));
  for (const badIdentity of [
    { ...identityResponse, requestId: "other" },
    { ...identityResponse, hostile: true },
    {
      ...identityResponse,
      identity: { ...identityResponse.identity, adapterVersion: "9.9.9" },
    },
    {
      ...identityResponse,
      identity: { ...identityResponse.identity, hostile: true },
    },
  ]) {
    assert.throws(() => validateFactEngineReleaseInspection({
      identityResponse: badIdentity,
      moduleMetadata,
    }), /fact engine release inspection failed/);
  }
  for (const badMetadata of [
    moduleMetadata.replace("go1.24.13", "go1.25.0"),
    moduleMetadata.replace(
      "path\tgithub.com/riichi-coach/mahjong-facts",
      "path\tgithub.com/attacker/lookalike",
    ),
    moduleMetadata.replace(release.upstreamModuleVersion, "v9.9.9"),
    moduleMetadata.replace(
      "h1:19XekgMg1Rg/jNcI67JtI+SEIUPXkpiRFYOCS7P6CkI=",
      "h1:wrong",
    ),
    moduleMetadata.replace("\tbuild\tGOOS=windows", "\tbuild\tGOOS=linux"),
    moduleMetadata.replace("\tbuild\tGOOS=windows", ""),
    `${moduleMetadata}\n\tbuild\tGOOS=windows`,
    moduleMetadata.replace("\tbuild\tGOARCH=amd64", ""),
    `${moduleMetadata}\n\tbuild\tGOARCH=amd64`,
    moduleMetadata.replace("\tpath\tgithub.com/riichi-coach/mahjong-facts\n", ""),
    `${moduleMetadata}\n\tdep\tgithub.com/EndlessCheng/mahjong-helper\t${release.upstreamModuleVersion}\th1:19XekgMg1Rg/jNcI67JtI+SEIUPXkpiRFYOCS7P6CkI=`,
    `${moduleMetadata}\n\t=>\tgithub.com/attacker/replaced-helper\tv9.9.9\th1:wrong`,
  ]) {
    assert.throws(() => validateFactEngineReleaseInspection({
      identityResponse,
      moduleMetadata: badMetadata,
    }), /fact engine release inspection failed/);
  }
}

const cases = [
  ["renders matching strict JSON and TypeScript trust manifests", rendersMatchingManifests],
  ["rejects malformed release metadata", rejectsMalformedMetadata],
  ["requires exact identity and embedded module metadata", requiresExactIdentityAndEmbeddedModuleMetadata],
];

if (process.env.VITEST === "true") {
  const { it } = await import("vitest");
  for (const [name, body] of cases) it(name, body);
} else {
  const { test } = await import("node:test");
  for (const [name, body] of cases) test(name, body);
}
