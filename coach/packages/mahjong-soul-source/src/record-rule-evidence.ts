import { createHash } from "node:crypto";
import { parse as parseProtobuf, type Type } from "protobufjs";
import { z } from "zod";
import type { RuleSetV2 } from "@riichi-coach/contracts";
import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

const uint32 = z.number().int().min(0).max(0xffff_ffff);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const EvidenceSchema = z.object({
  schemaVersion: z.literal("mahjong-soul-record-rules/v1"),
  recordId: z.string().min(1).max(128),
  recordSha256: digest,
  configurationSha256: digest,
  standardRule: uint32,
  category: uint32,
  mode: uint32,
  matchModeId: uint32,
  hasCustomRules: z.boolean(),
}).strict();

/** Provider evidence only; remains in main/source, never a renderer DTO. */
export type MahjongSoulRecordRuleEvidence = Readonly<z.infer<typeof EvidenceSchema>>;

export interface MahjongSoulRankedRuleProfile {
  readonly standardRule: unknown;
  readonly category: unknown;
  readonly mode: unknown;
  readonly matchModeId: unknown;
  readonly hasCustomRules: unknown;
}

export interface MahjongSoulCatalogRuleMetadata {
  readonly mode: number;
  readonly ai: boolean;
  readonly extendinfo: string;
  readonly detailRulePresent: boolean;
  readonly detailRuleHasOverride: boolean;
  readonly supportsRankedSouth: boolean;
}

function isProtoMessageType(value: unknown): value is Type {
  return value !== null && typeof value === "object"
    && Array.isArray((value as Type).fieldsArray)
    && (value as Type).fields !== null && typeof (value as Type).fields === "object";
}

function hasOnlyKnownProtoFields(type: Type, value: unknown): boolean {
  if (!record(value)) return false;
  const fields = new Map(type.fieldsArray.map(field => [field.name, field]));
  if (Reflect.ownKeys(value).some(key => {
    if (typeof key !== "string" || !fields.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return !descriptor.enumerable || !("value" in descriptor);
  })) return false;
  for (const [name, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined) continue;
    const field = fields.get(name)!;
    const nested = field.resolvedType;
    if (!isProtoMessageType(nested)) continue;
    if (field.map) {
      if (!record(raw)) return false;
      for (const child of Object.values(raw)) {
        if (!hasOnlyKnownProtoFields(nested, child)) return false;
      }
    } else if (field.repeated) {
      if (!Array.isArray(raw) || !raw.every(child => hasOnlyKnownProtoFields(nested, child))) return false;
    } else if (!hasOnlyKnownProtoFields(nested, raw)) {
      return false;
    }
  }
  return true;
}

function supportedSouthRankedProfile(profile: MahjongSoulRankedRuleProfile): boolean {
  return typeof profile.standardRule === "number" && [1, 2].includes(profile.standardRule)
    && profile.category === 2 && profile.mode === 2
    && profile.hasCustomRules === false
    && typeof profile.matchModeId === "number" && [3, 6, 9, 12, 16].includes(profile.matchModeId);
}

function normalizedConfigTypes(bundle: MahjongSoulProtocolBundle): {
  readonly config: Type;
  readonly detailRule: Type;
} {
  const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
  root.resolveAll();
  return { config: root.lookupType("lq.GameConfig"), detailRule: root.lookupType("lq.GameDetailRule") };
}

function normalizeConfig(
  configType: Type,
  rawConfig: unknown,
): Record<string, unknown> {
  if (!record(rawConfig) || !hasOnlyKnownProtoFields(configType, rawConfig)
    || configType.verify(rawConfig) !== null) {
    throw new MahjongSoulSourceError("mahjong_soul_record_fetch_failed");
  }
  try {
    return configType.toObject(configType.fromObject(rawConfig), {
      defaults: true, arrays: true, objects: true,
    }) as Record<string, unknown>;
  } catch {
    throw new MahjongSoulSourceError("mahjong_soul_record_fetch_failed");
  }
}

function configHasCustomRules(config: Record<string, unknown>, detailRuleHasOverride: boolean): boolean {
  const mode = record(config.mode) ? config.mode : {};
  const meta = record(config.meta) ? config.meta : {};
  return mode.ai !== false || mode.extendinfo !== "" || detailRuleHasOverride
    || mode.testing_environment != null || (meta.room_id ?? 0) !== 0
    || (meta.contest_uid ?? 0) !== 0 || meta.contest_info != null;
}

function detailRuleOverride(
  detailRuleType: Type,
  mode: Record<string, unknown>,
): boolean {
  if (mode.detail_rule === null || mode.detail_rule === undefined) return false;
  const defaultMessage = detailRuleType.toObject(detailRuleType.create(), {
    defaults: true, arrays: true, objects: true,
  });
  const normalizedMessage = detailRuleType.toObject(
    detailRuleType.fromObject(mode.detail_rule),
    { defaults: true, arrays: true, objects: true },
  );
  return JSON.stringify(normalizedMessage) !== JSON.stringify(defaultMessage);
}

/** Normalize catalog metadata with the pinned bundle schema and shared ranked-profile policy. */
export function createMahjongSoulCatalogRuleInspector(bundle: MahjongSoulProtocolBundle): (
  standardRule: number,
  rawConfig: unknown,
) => MahjongSoulCatalogRuleMetadata {
  const { config: configType, detailRule: detailRuleType } = normalizedConfigTypes(bundle);
  return (standardRule, rawConfig) => {
    if (!Number.isInteger(standardRule) || standardRule < 0 || standardRule > 0xffff_ffff) {
      throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
    }
    if (!record(rawConfig) || !record(rawConfig.mode)
      || typeof rawConfig.mode.mode !== "number" || !Number.isInteger(rawConfig.mode.mode)
      || typeof rawConfig.mode.ai !== "boolean" || typeof rawConfig.mode.extendinfo !== "string") {
      throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
    }
    const config = normalizeConfig(configType, rawConfig);
    const mode = config.mode;
    if (!record(mode)) {
      throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
    }
    const modeId = mode.mode;
    if (typeof modeId !== "number" || !Number.isInteger(modeId) || modeId < 0 || modeId > 0xffff_ffff
      || typeof mode.ai !== "boolean" || typeof mode.extendinfo !== "string") {
      throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
    }
    const detailRuleHasOverride = detailRuleOverride(detailRuleType, mode);
    const hasCustomRules = configHasCustomRules(config, detailRuleHasOverride);
    const meta = record(config.meta) ? config.meta : {};
    return Object.freeze({
      mode: modeId,
      ai: mode.ai,
      extendinfo: mode.extendinfo,
      detailRulePresent: mode.detail_rule !== null && mode.detail_rule !== undefined,
      detailRuleHasOverride,
      supportsRankedSouth: supportedSouthRankedProfile({
        standardRule,
        category: config.category,
        mode: modeId,
        matchModeId: meta.mode_id,
        hasCustomRules,
      }),
    });
  };
}

function hash(bytes: Uint8Array | string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function validateRecordRuleEvidence(
  raw: unknown, recordId: string, recordBytes: Uint8Array,
): MahjongSoulRecordRuleEvidence {
  // This flat transport object has no executable serialization or hidden fields.
  if (!record(raw) || Reflect.ownKeys(raw).some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)!;
    return typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor);
  })) throw new MahjongSoulSourceError("mahjong_soul_record_fetch_failed");
  const parsed = EvidenceSchema.safeParse(raw);
  if (!parsed.success) throw new MahjongSoulSourceError("mahjong_soul_record_fetch_failed");
  if (parsed.data.recordId !== recordId || parsed.data.recordSha256 !== hash(recordBytes)) {
    throw new MahjongSoulSourceError("mahjong_soul_record_identity_mismatch");
  }
  return Object.freeze(parsed.data);
}

/** Extract only rule identifiers from the SAME fetchGameRecord response as bytes. */
export function extractRecordRuleEvidence(input: {
  bundle: MahjongSoulProtocolBundle; head: unknown; recordId: string; recordBytes: Uint8Array;
}): MahjongSoulRecordRuleEvidence | undefined {
  if (input.head === null || input.head === undefined) return undefined;
  if (!record(input.head) || input.head.uuid !== input.recordId) {
    throw new MahjongSoulSourceError("mahjong_soul_record_identity_mismatch");
  }
  if (input.head.config === null || input.head.config === undefined) return undefined;
  const { config: configType, detailRule: detailRuleType } = normalizedConfigTypes(input.bundle);
  const config = normalizeConfig(configType, input.head.config);
  if (!record(config.mode)) return undefined;
  const mode = config.mode;
  const meta = record(config.meta) ? config.meta : {};
  // Ranked responses may carry an explicit default GameDetailRule. Its
  // presence does not override the normalized ranked preset.
  const hasDetailOverride = detailRuleOverride(detailRuleType, mode);
  const hasCustomRules = configHasCustomRules(config, hasDetailOverride);
  return validateRecordRuleEvidence({
    schemaVersion: "mahjong-soul-record-rules/v1",
    recordId: input.recordId, recordSha256: hash(input.recordBytes),
    configurationSha256: hash(JSON.stringify(config)),
    standardRule: input.head.standard_rule ?? 0,
    category: config.category, mode: mode.mode, matchModeId: meta.mode_id ?? 0,
    hasCustomRules,
  }, input.recordId, input.recordBytes);
}

export function projectRecordRules(evidence: MahjongSoulRecordRuleEvidence | undefined): RuleSetV2 {
  const unknown: RuleSetV2 = {
    length: "unknown", redFives: { man: "unknown", pin: "unknown", sou: "unknown" },
    openTanyao: "unknown", atamahane: "unknown", westExtension: "unknown", ippatsuCancelledByAnkan: "unknown",
  };
  // Existing four-player South ranked scope, not a default for arbitrary logs.
  // Source/profile evidence and omitted/custom rule policy are documented in
  // docs/plans/2026-09-28-libriichi-legal-action-authority-migration.md sections 21/27.
  if (evidence === undefined || !supportedSouthRankedProfile({
    standardRule: evidence.standardRule,
    category: evidence.category,
    mode: evidence.mode,
    matchModeId: evidence.matchModeId,
    hasCustomRules: evidence.hasCustomRules,
  })) return unknown;
  return { length: "south", redFives: { man: 1, pin: 1, sou: 1 }, openTanyao: true,
    atamahane: "unknown", westExtension: "sudden_death", ippatsuCancelledByAnkan: true };
}
