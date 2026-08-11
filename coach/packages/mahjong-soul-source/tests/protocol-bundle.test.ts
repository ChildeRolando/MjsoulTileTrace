import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAHJONG_SOUL_CN_CLIENT_VERSION,
  MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
  MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION,
  MahjongSoulSourceError,
  type MahjongSoulProtocolManifest,
  loadMahjongSoulProtocolBundle,
} from "../src/index.js";
import {
  parseVerifiedEndpointPolicy,
  parseVerifiedProto,
  parseVerifiedRpcMap,
} from "../src/protocol-bundle.js";

const sourceBundle = fileURLToPath(new URL(
  "../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));
const commit = "27e994ad8bacd87833856b3b36b146ebb7cccbbc";
const fixedCode = "mahjong_soul_login_protocol_unsupported";

async function temporaryBundle(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "riichi-coach-protocol-"));
  const root = join(parent, "bundle");
  await cp(sourceBundle, root, { recursive: true });
  return root;
}

async function usingBundle(
  operation: (root: string) => Promise<void>,
): Promise<void> {
  const root = await temporaryBundle();
  try {
    await operation(root);
  } finally {
    await rm(dirname(root), { recursive: true, force: true });
  }
}

async function readManifest(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as
    Record<string, unknown>;
}

async function writeManifest(
  root: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function expectFixedFailure(
  operation: () => Promise<unknown>,
  forbidden: readonly string[] = [],
): Promise<void> {
  try {
    await operation();
    throw new Error("expected protocol bundle rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(MahjongSoulSourceError);
    expect((error as Error).message).toBe(fixedCode);
    for (const value of forbidden) {
      expect((error as Error).message).not.toContain(value);
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertManifestTypeIsDeeplyReadonly(
  manifest: MahjongSoulProtocolManifest,
): void {
  // @ts-expect-error The runtime value is frozen, so its type must be readonly.
  manifest.region = "cn";
  // @ts-expect-error Nested official metadata is readonly too.
  manifest.official.clientVersion = "0.11.252.w";
  // @ts-expect-error The fixed asset tuple cannot be reordered.
  manifest.assets.reverse();
  // @ts-expect-error Individual asset metadata cannot be changed.
  manifest.assets[0].sha256 =
    "aa0e11e4740a0ae88ea797258500d9b066a68042be2f6036bfe49460b72405f0";
}
void assertManifestTypeIsDeeplyReadonly;

describe("Mahjong Soul protocol bundle", () => {
  it("loads the pinned CN bundle into deeply frozen project-owned data", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(sourceBundle);

    expect(MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION)
      .toBe("mahjong-soul-cn-protocol/v1");
    expect(MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION).toBe("0.1.0");
    expect(MAHJONG_SOUL_CN_CLIENT_VERSION).toBe("0.11.252.w");
    expect(bundle.manifest.assets.map((asset) => asset.kind)).toEqual([
      "license",
      "notice",
      "proto",
      "rpc_map",
      "endpoint_policy",
    ]);
    expect(bundle.protoText).toContain("message Wrapper");
    expect(bundle.rpcMap[".lq.Lobby.login"]).toEqual({
      req: ".lq.ReqLogin",
      resp: ".lq.ResLogin",
    });
    expect(bundle.endpoints).toEqual({
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
    });
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.manifest)).toBe(true);
    expect(Object.isFrozen(bundle.manifest.assets)).toBe(true);
    expect(Object.isFrozen(bundle.manifest.assets[0])).toBe(true);
    expect(Object.isFrozen(bundle.rpcMap)).toBe(true);
    expect(Object.isFrozen(bundle.rpcMap[".lq.Lobby.login"])).toBe(true);
    expect(Object.isFrozen(bundle.endpoints)).toBe(true);
    expect(Object.isFrozen(bundle.endpoints.gatewayDiscoveryOrigins)).toBe(true);
  });

  it("uses bounded file-handle reads instead of unbounded readFile", async () => {
    const actualFs = await import("node:fs/promises");
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      ...actualFs,
      readFile: async () => {
        throw new Error("unbounded readFile must not be used");
      },
    }));
    try {
      const isolatedModule = await import("../src/protocol-bundle.js");
      const bundle = await isolatedModule.loadMahjongSoulProtocolBundle(
        sourceBundle,
      );
      expect(bundle.manifest.region).toBe("cn");
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });

  it("rejects missing, extra, or changed manifest literals", async () => {
    const mutations: Array<(manifest: Record<string, any>) => void> = [
      (manifest) => { delete manifest.region; },
      (manifest) => { manifest.unexpected = "server-token-prose"; },
      (manifest) => { manifest.bundleVersion = "mahjong-soul-cn-protocol/v2"; },
      (manifest) => { manifest.adapterVersion = "0.2.0"; },
      (manifest) => { manifest.region = "en"; },
      (manifest) => { manifest.official.clientVersion = "0.11.253.w"; },
      (manifest) => { manifest.official.liqi.sha256 = "0".repeat(64); },
      (manifest) => { manifest.vendor.commit = "0".repeat(40); },
      (manifest) => { manifest.vendor.repository = "https://attacker.invalid"; },
      (manifest) => { manifest.vendor.license = "unknown"; },
      (manifest) => { manifest.assets[0].sourceUrl = "https://tracker.invalid"; },
      (manifest) => { manifest.assets[0].size += 1; },
      (manifest) => { manifest.assets[0].sha256 = "0".repeat(64); },
      (manifest) => { manifest.assets.reverse(); },
      (manifest) => { manifest.assets.push({ ...manifest.assets[0] }); },
    ];

    for (const mutate of mutations) {
      await usingBundle(async (root) => {
        const manifest = await readManifest(root);
        mutate(manifest);
        await writeManifest(root, manifest);
        await expectFixedFailure(
          () => loadMahjongSoulProtocolBundle(root),
          ["server-token-prose", "attacker.invalid", root],
        );
      });
    }
  });

  it("requires the exact compatibility report and binds its three hashes", async () => {
    const mutations: Array<(manifest: Record<string, any>) => void> = [
      (manifest) => { delete manifest.compatibility; },
      (manifest) => { manifest.compatibility.status = "unchecked"; },
      (manifest) => {
        manifest.compatibility.requiredSurfaceVersion =
          "mahjong-soul-required-surface/v2";
      },
      (manifest) => {
        manifest.compatibility.officialSchemaSha256 = "0".repeat(64);
      },
      (manifest) => {
        manifest.compatibility.vendorProtoSha256 = "0".repeat(64);
      },
      (manifest) => {
        manifest.compatibility.vendorRpcMapSha256 = "0".repeat(64);
      },
    ];

    for (const mutate of mutations) {
      await usingBundle(async (root) => {
        const manifest = await readManifest(root) as Record<string, any>;
        mutate(manifest);
        await writeManifest(root, manifest);
        await expectFixedFailure(() => loadMahjongSoulProtocolBundle(root));
      });
    }
  });

  it("rejects modified or missing upstream and generated assets", async () => {
    const assets = [
      `akagi-v3/${commit}/LICENSE.txt`,
      `akagi-v3/${commit}/NOTICE`,
      `akagi-v3/${commit}/liqi.proto`,
      `akagi-v3/${commit}/rpc-map.json`,
      "endpoints.json",
    ];
    for (const asset of assets) {
      await usingBundle(async (root) => {
        const target = join(root, ...asset.split("/"));
        const bytes = await readFile(target);
        bytes[0] = (bytes[0] ?? 0) ^ 1;
        await writeFile(target, bytes);
        await expectFixedFailure(() => loadMahjongSoulProtocolBundle(root));
      });
      await usingBundle(async (root) => {
        const target = join(root, ...asset.split("/"));
        await rm(target);
        await expectFixedFailure(() => loadMahjongSoulProtocolBundle(root));
      });
    }
  });

  it("rejects traversal and symbolic-link or junction assets", async () => {
    await usingBundle(async (root) => {
      const manifest = await readManifest(root) as Record<string, any>;
      manifest.assets[2].path = "../outside/liqi.proto";
      await writeManifest(root, manifest);
      await expectFixedFailure(() => loadMahjongSoulProtocolBundle(root), [root]);
    });

    await usingBundle(async (root) => {
      const vendorDir = join(root, "akagi-v3", commit);
      const outsideParent = await mkdtemp(join(tmpdir(), "riichi-coach-link-"));
      const outside = join(outsideParent, "vendor");
      try {
        await cp(vendorDir, outside, { recursive: true });
        await rm(vendorDir, { recursive: true });
        await symlink(
          outside,
          vendorDir,
          process.platform === "win32" ? "junction" : "dir",
        );
        expect((await lstat(vendorDir)).isSymbolicLink()).toBe(true);
        await expectFixedFailure(
          () => loadMahjongSoulProtocolBundle(root),
          [outside, root],
        );
      } finally {
        await rm(outsideParent, { recursive: true, force: true });
      }
    });
  });

  it("rejects malformed proto and RPC JSON without reflecting contents", async () => {
    await usingBundle(async (root) => {
      const target = join(root, "akagi-v3", commit, "liqi.proto");
      await writeFile(target, "hostile proto token payload");
      await expectFixedFailure(
        () => loadMahjongSoulProtocolBundle(root),
        ["hostile proto token payload", target, root],
      );
    });
    await usingBundle(async (root) => {
      const target = join(root, "akagi-v3", commit, "rpc-map.json");
      await writeFile(target, "{hostile rpc token payload");
      await expectFixedFailure(
        () => loadMahjongSoulProtocolBundle(root),
        ["hostile rpc token payload", target, root],
      );
    });

    await expectFixedFailure(
      async () => parseVerifiedProto("hostile proto token payload"),
      ["hostile proto token payload"],
    );
    await expectFixedFailure(
      async () => parseVerifiedRpcMap(
        '{".lq.Lobby.login":{"req":7,"resp":"hostile rpc token payload"}}',
      ),
      ["hostile rpc token payload"],
    );
  });

  it("rejects unapproved endpoint fields and tracker or payment origins", async () => {
    for (const endpoints of [
      {
        policyVersion: "mahjong-soul-cn-endpoints/v1",
        loginPageOrigins: ["https://game.maj-soul.com"],
        staticAssetOrigins: ["https://game.maj-soul.com"],
        gatewayDiscoveryOrigins: ["https://tracker.invalid"],
        lobbyWebSocketOrigins: ["wss://route-2.maj-soul.com"],
        recordDataPrefixes: ["https://record-old.maj-soul.com/records"],
      },
      {
        policyVersion: "mahjong-soul-cn-endpoints/v1",
        loginPageOrigins: ["https://game.maj-soul.com"],
        staticAssetOrigins: ["https://game.maj-soul.com"],
        gatewayDiscoveryOrigins: [],
        lobbyWebSocketOrigins: [],
        recordDataPrefixes: ["https://payment.invalid/records"],
        advertisingOrigins: ["https://ads.invalid"],
      },
    ]) {
      await usingBundle(async (root) => {
        const text = `${JSON.stringify(endpoints, null, 2)}\n`;
        await writeFile(join(root, "endpoints.json"), text);
        const manifest = await readManifest(root) as Record<string, any>;
        const endpointAsset = manifest.assets[4];
        endpointAsset.size = Buffer.byteLength(text);
        endpointAsset.sha256 = sha256(text);
        await writeManifest(root, manifest);
        await expectFixedFailure(
          () => loadMahjongSoulProtocolBundle(root),
          ["tracker.invalid", "payment.invalid", "ads.invalid", root],
        );
      });
    }

    const validPolicy = {
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
    await expectFixedFailure(
      async () => parseVerifiedEndpointPolicy(JSON.stringify({
        ...validPolicy,
        advertisingOrigins: ["https://ads.invalid"],
      })),
      ["ads.invalid"],
    );
    await expectFixedFailure(
      async () => parseVerifiedEndpointPolicy(JSON.stringify({
        ...validPolicy,
        gatewayDiscoveryOrigins: [
          "https://tracker.invalid",
          ...validPolicy.gatewayDiscoveryOrigins.slice(1),
        ],
      })),
      ["tracker.invalid"],
    );
    await expectFixedFailure(
      async () => parseVerifiedEndpointPolicy(JSON.stringify({
        ...validPolicy,
        recordDataPrefixes: ["https://payment.invalid/records"],
      })),
      ["payment.invalid"],
    );
  });
});
