import { createHash } from "node:crypto";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parse as parseProtobuf } from "protobufjs";
import { z } from "zod";
import { MahjongSoulSourceError } from "./errors.js";
import {
  MahjongSoulProtocolManifestSchema,
  type MahjongSoulProtocolManifest,
} from "./protocol-manifest.js";

const MANIFEST_MAX_BYTES = 64 * 1024;
const ASSET_MAX_BYTES = Object.freeze({
  license: 64 * 1024,
  notice: 64 * 1024,
  proto: 1024 * 1024,
  rpc_map: 1024 * 1024,
  endpoint_policy: 64 * 1024,
} as const);

const FullyQualifiedNameSchema = z.string().regex(
  /^\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/u,
);
const RpcMapSchema = z.record(
  FullyQualifiedNameSchema,
  z.object({
    req: FullyQualifiedNameSchema,
    resp: FullyQualifiedNameSchema,
  }).strict(),
);

const EndpointPolicySchema = z.object({
  policyVersion: z.literal("mahjong-soul-cn-endpoints/v1"),
  loginPageOrigins: z.tuple([
    z.literal("https://game.maj-soul.com"),
  ]),
  staticAssetOrigins: z.tuple([
    z.literal("https://game.maj-soul.com"),
  ]),
  gatewayDiscoveryOrigins: z.tuple([
    z.literal("https://route-2.maj-soul.com"),
    z.literal("https://route-3.maj-soul.com:8443"),
    z.literal("https://route-4.maj-soul.com"),
    z.literal("https://route-5.maj-soul.com"),
    z.literal("https://route-6.maj-soul.com"),
  ]),
  lobbyWebSocketOrigins: z.tuple([
    z.literal("wss://route-2.maj-soul.com"),
    z.literal("wss://route-3.maj-soul.com:8443"),
    z.literal("wss://route-4.maj-soul.com"),
    z.literal("wss://route-5.maj-soul.com"),
    z.literal("wss://route-6.maj-soul.com"),
  ]),
  recordDataPrefixes: z.tuple([
    z.literal(
      "https://record-old.maj-soul.com:9443/majsoul/game_record",
    ),
  ]),
}).strict();

type RpcMap = z.infer<typeof RpcMapSchema>;
type EndpointPolicy = z.infer<typeof EndpointPolicySchema>;

export interface MahjongSoulProtocolBundle {
  readonly manifest: MahjongSoulProtocolManifest;
  readonly protoText: string;
  readonly rpcMap: Readonly<Record<string, {
    readonly req: string;
    readonly resp: string;
  }>>;
  readonly endpoints: Readonly<{
    readonly loginPageOrigins: readonly ["https://game.maj-soul.com"];
    readonly staticAssetOrigins: readonly ["https://game.maj-soul.com"];
    readonly gatewayDiscoveryOrigins: readonly string[];
    readonly lobbyWebSocketOrigins: readonly string[];
    readonly recordDataPrefixes: readonly string[];
  }>;
}

type ManifestAsset = MahjongSoulProtocolManifest["assets"][number];

function unsupported(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(
    "mahjong_soul_login_protocol_unsupported",
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function isWithinRoot(root: string, target: string): boolean {
  const difference = relative(root, target);
  return difference === "" || (
    difference !== ".."
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

async function resolveRegularFile(
  root: string,
  relativePath: string,
): Promise<{
  readonly path: string;
  readonly device: bigint;
  readonly inode: bigint;
}> {
  const lexicalTarget = resolve(root, relativePath);
  if (!isWithinRoot(root, lexicalTarget)) throw unsupported();

  const difference = relative(root, lexicalTarget);
  let cursor = root;
  for (const segment of difference.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink()) throw unsupported();
  }

  const canonicalTarget = await realpath(lexicalTarget);
  if (!isWithinRoot(root, canonicalTarget)) throw unsupported();
  const metadata = await stat(canonicalTarget, { bigint: true });
  if (!metadata.isFile()) throw unsupported();
  return {
    path: canonicalTarget,
    device: metadata.dev,
    inode: metadata.ino,
  };
}

async function readBoundedFile(
  root: string,
  relativePath: string,
  maximumBytes: number,
  exactBytes?: number,
): Promise<Buffer> {
  const checked = await resolveRegularFile(root, relativePath);
  const handle = await open(checked.path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile()
      || opened.dev !== checked.device
      || opened.ino !== checked.inode
      || opened.size > BigInt(maximumBytes)
      || (exactBytes !== undefined && opened.size !== BigInt(exactBytes))
    ) {
      throw unsupported();
    }

    const buffer = Buffer.allocUnsafe(maximumBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        length,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }

    const afterRead = await handle.stat({ bigint: true });
    if (
      afterRead.dev !== checked.device
      || afterRead.ino !== checked.inode
      || afterRead.size !== BigInt(length)
      || length > maximumBytes
      || (exactBytes !== undefined && length !== exactBytes)
    ) {
      throw unsupported();
    }
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function readVerifiedAsset(
  root: string,
  asset: ManifestAsset,
): Promise<Buffer> {
  const bytes = await readBoundedFile(
    root,
    asset.path,
    ASSET_MAX_BYTES[asset.kind],
    asset.size,
  );
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== asset.sha256) throw unsupported();
  return bytes;
}

function projectEndpoints(policy: EndpointPolicy): MahjongSoulProtocolBundle["endpoints"] {
  return {
    loginPageOrigins: policy.loginPageOrigins,
    staticAssetOrigins: policy.staticAssetOrigins,
    gatewayDiscoveryOrigins: policy.gatewayDiscoveryOrigins,
    lobbyWebSocketOrigins: policy.lobbyWebSocketOrigins,
    recordDataPrefixes: policy.recordDataPrefixes,
  };
}

function verifyCompatibilityHashBinding(
  manifest: MahjongSoulProtocolManifest,
): void {
  const proto = manifest.assets.find((asset) => asset.kind === "proto");
  const rpcMap = manifest.assets.find((asset) => asset.kind === "rpc_map");
  if (
    proto === undefined
    || rpcMap === undefined
    || manifest.compatibility.clientVersion !== manifest.official.clientVersion
    || manifest.compatibility.officialSchemaSha256
      !== manifest.official.liqi.sha256
    || manifest.compatibility.vendorProtoSha256 !== proto.sha256
    || manifest.compatibility.vendorRpcMapSha256 !== rpcMap.sha256
  ) {
    throw unsupported();
  }
}

export function parseVerifiedProto(protoText: string): void {
  try {
    if (typeof protoText !== "string") throw unsupported();
    parseProtobuf(protoText);
  } catch {
    throw unsupported();
  }
}

export function parseVerifiedRpcMap(text: string): RpcMap {
  try {
    if (typeof text !== "string") throw unsupported();
    return deepFreeze(RpcMapSchema.parse(JSON.parse(text)));
  } catch {
    throw unsupported();
  }
}

export function parseVerifiedEndpointPolicy(
  text: string,
): MahjongSoulProtocolBundle["endpoints"] {
  try {
    if (typeof text !== "string") throw unsupported();
    const policy = EndpointPolicySchema.parse(JSON.parse(text));
    return deepFreeze(projectEndpoints(policy));
  } catch {
    throw unsupported();
  }
}

export async function loadMahjongSoulProtocolBundle(
  rootDir: string,
): Promise<MahjongSoulProtocolBundle> {
  try {
    if (typeof rootDir !== "string") throw unsupported();
    const rootMetadata = await lstat(rootDir);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
      throw unsupported();
    }
    const root = await realpath(rootDir);
    const manifestBytes = await readBoundedFile(
      root,
      "manifest.json",
      MANIFEST_MAX_BYTES,
    );
    const manifest = MahjongSoulProtocolManifestSchema.parse(
      JSON.parse(decodeUtf8(manifestBytes)),
    );
    verifyCompatibilityHashBinding(manifest);

    const assetBytes = new Map<ManifestAsset["kind"], Buffer>();
    for (const asset of manifest.assets) {
      assetBytes.set(asset.kind, await readVerifiedAsset(root, asset));
    }

    const protoText = decodeUtf8(assetBytes.get("proto")!);
    parseVerifiedProto(protoText);
    const rpcMap = parseVerifiedRpcMap(
      decodeUtf8(assetBytes.get("rpc_map")!),
    );
    const endpoints = parseVerifiedEndpointPolicy(
      decodeUtf8(assetBytes.get("endpoint_policy")!),
    );

    return deepFreeze({
      manifest,
      protoText,
      rpcMap,
      endpoints,
    });
  } catch {
    throw unsupported();
  }
}
