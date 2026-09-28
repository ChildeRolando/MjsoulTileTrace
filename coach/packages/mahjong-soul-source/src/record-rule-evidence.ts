import { createHash } from "node:crypto";
import { parse as parseProtobuf } from "protobufjs";
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
  const root = parseProtobuf(input.bundle.protoText, { keepCase: true }).root;
  const configType = root.lookupType("lq.GameConfig");
  if (!record(input.head.config) || configType.verify(input.head.config) !== null) {
    throw new MahjongSoulSourceError("mahjong_soul_record_fetch_failed");
  }
  // Explicit and omitted proto defaults have the same identity on both routes.
  const config = configType.toObject(configType.fromObject(input.head.config), {
    defaults: true, arrays: true, objects: true,
  }) as Record<string, unknown>;
  if (!record(config.mode)) return undefined;
  const mode = config.mode;
  const meta = record(config.meta) ? config.meta : {};
  return validateRecordRuleEvidence({
    schemaVersion: "mahjong-soul-record-rules/v1",
    recordId: input.recordId, recordSha256: hash(input.recordBytes),
    configurationSha256: hash(JSON.stringify(config)),
    standardRule: input.head.standard_rule ?? 0,
    category: config.category, mode: mode.mode, matchModeId: meta.mode_id ?? 0,
    hasCustomRules: mode.ai !== false || mode.extendinfo !== "" || mode.detail_rule != null
      || mode.testing_environment != null || (meta.room_id ?? 0) !== 0 || (meta.contest_uid ?? 0) !== 0
      || meta.contest_info != null,
  }, input.recordId, input.recordBytes);
}

export function projectRecordRules(evidence: MahjongSoulRecordRuleEvidence | undefined): RuleSetV2 {
  const unknown: RuleSetV2 = {
    length: "unknown", redFives: { man: "unknown", pin: "unknown", sou: "unknown" },
    openTanyao: "unknown", atamahane: "unknown", westExtension: "unknown", ippatsuCancelledByAnkan: "unknown",
  };
  // Existing four-player South ranked scope, not a default for arbitrary logs.
  // Source/profile evidence and omitted/custom rule policy are documented in
  // docs/plans/2026-09-28-libriichi-legal-action-authority-migration.md section 21.
  if (evidence === undefined || evidence.standardRule !== 2 || evidence.category !== 2
      || evidence.mode !== 2 || evidence.hasCustomRules || ![3, 6, 9, 12, 16].includes(evidence.matchModeId)) return unknown;
  return { length: "south", redFives: { man: 1, pin: 1, sou: 1 }, openTanyao: true,
    atamahane: "unknown", westExtension: "sudden_death", ippatsuCancelledByAnkan: true };
}
