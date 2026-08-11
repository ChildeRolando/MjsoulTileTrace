import { z } from "zod";

export const MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION =
  "mahjong-soul-cn-protocol/v1" as const;
export const MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION = "0.1.0" as const;
export const MAHJONG_SOUL_CN_CLIENT_VERSION = "0.11.252.w" as const;

const AKAGI_COMMIT =
  "27e994ad8bacd87833856b3b36b146ebb7cccbbc" as const;
const AKAGI_RAW_ROOT =
  `https://raw.githubusercontent.com/shinkuan/Akagi/${AKAGI_COMMIT}` as const;
const AKAGI_BUNDLE_ROOT = `akagi-v3/${AKAGI_COMMIT}` as const;

const ExactOfficialAssetSchema = (
  sourceUrl: string,
  size: number,
  sha256: string,
) => z.object({
  sourceUrl: z.literal(sourceUrl),
  size: z.literal(size),
  sha256: z.literal(sha256),
}).strict();

const ExactBundleAssetSchema = (
  kind: "license" | "notice" | "proto" | "rpc_map" | "endpoint_policy",
  path: string,
  sourceUrl: string,
  size: number,
  sha256: string,
) => z.object({
  kind: z.literal(kind),
  path: z.literal(path),
  sourceUrl: z.literal(sourceUrl),
  size: z.literal(size),
  sha256: z.literal(sha256),
}).strict();

export const MahjongSoulProtocolManifestSchema = z.object({
  bundleVersion: z.literal(MAHJONG_SOUL_PROTOCOL_BUNDLE_VERSION),
  adapterVersion: z.literal(MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION),
  region: z.literal("cn"),
  official: z.object({
    clientVersion: z.literal(MAHJONG_SOUL_CN_CLIENT_VERSION),
    resourceIndex: ExactOfficialAssetSchema(
      "https://game.maj-soul.com/1/resversion0.11.252.w.json",
      12_688_057,
      "91accb83474e4a530ff9c5e7b9471e7156cdc30410a11dbc223d9f637babcd2f",
    ),
    liqi: ExactOfficialAssetSchema(
      "https://game.maj-soul.com/1/v0.11.243.w/res/proto/liqi.json",
      286_815,
      "f2955c3d10cf2d42bee9309f672c062540941ea0cffe1bd62e3f436c7afc404c",
    ),
    config: ExactOfficialAssetSchema(
      "https://game.maj-soul.com/1/v0.11.252.w/config.json",
      1_173,
      "56d077557335d457e4c961ae752965c5944236287069cb716111ef30e73abca1",
    ),
  }).strict(),
  vendor: z.object({
    repository: z.literal("https://github.com/shinkuan/Akagi"),
    commit: z.literal(AKAGI_COMMIT),
    license: z.literal("Apache-2.0"),
  }).strict(),
  compatibility: z.object({
    status: z.literal("compatible"),
    clientVersion: z.literal(MAHJONG_SOUL_CN_CLIENT_VERSION),
    officialSchemaSha256: z.literal(
      "f2955c3d10cf2d42bee9309f672c062540941ea0cffe1bd62e3f436c7afc404c",
    ),
    vendorProtoSha256: z.literal(
      "ccfa3f7b39c205e9d4690f61bc1b333df415edfdf8d1e325cd5fc8a5ac30cbb7",
    ),
    vendorRpcMapSha256: z.literal(
      "15f44eecb654e3b5cfca7682cf00f3a0a16ae3c76d0450b0257a9e89aa44be80",
    ),
    requiredSurfaceVersion: z.literal(
      "mahjong-soul-required-surface/v1",
    ),
  }).strict(),
  assets: z.tuple([
    ExactBundleAssetSchema(
      "license",
      `${AKAGI_BUNDLE_ROOT}/LICENSE.txt`,
      `${AKAGI_RAW_ROOT}/LICENSE.txt`,
      10_752,
      "aa0e11e4740a0ae88ea797258500d9b066a68042be2f6036bfe49460b72405f0",
    ),
    ExactBundleAssetSchema(
      "notice",
      `${AKAGI_BUNDLE_ROOT}/NOTICE`,
      `${AKAGI_RAW_ROOT}/NOTICE`,
      5_414,
      "2ffcce0e8bae52171dfdacd28ff9637334a2cc21d250deb4f30e315e65a3c421",
    ),
    ExactBundleAssetSchema(
      "proto",
      `${AKAGI_BUNDLE_ROOT}/liqi.proto`,
      `${AKAGI_RAW_ROOT}/src/bridge/majsoul/proto/liqi.proto`,
      240_793,
      "ccfa3f7b39c205e9d4690f61bc1b333df415edfdf8d1e325cd5fc8a5ac30cbb7",
    ),
    ExactBundleAssetSchema(
      "rpc_map",
      `${AKAGI_BUNDLE_ROOT}/rpc-map.json`,
      `${AKAGI_RAW_ROOT}/src/bridge/majsoul/liqi.json`,
      42_178,
      "15f44eecb654e3b5cfca7682cf00f3a0a16ae3c76d0450b0257a9e89aa44be80",
    ),
    ExactBundleAssetSchema(
      "endpoint_policy",
      "endpoints.json",
      "https://game.maj-soul.com/1/v0.11.252.w/config.json",
      700,
      "0da6d77d2978ced65f7de441d48f62a148eb444522aa0b63f5e15ea9a0a0a224",
    ),
  ]),
}).strict();

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type MahjongSoulProtocolManifest = DeepReadonly<z.infer<
  typeof MahjongSoulProtocolManifestSchema
>>;
