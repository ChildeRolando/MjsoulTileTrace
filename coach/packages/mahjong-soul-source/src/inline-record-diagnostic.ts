import { parse as parseProtobuf } from "protobufjs";

import { filterAnalyzableRecord } from "./record-filter.js";
import {
  classifyRestoreResponseError,
  createOAuth2LoginPayload,
  snapshotRestoreCandidate,
} from "./restore-diagnostic.js";
import { syncRecentCatalog } from "./catalog-sync.js";
import type { MahjongSoulLobbySession } from "./lobby-session.js";
import type { CapturedMahjongSoulCredential } from "./login-result.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";

export type MahjongSoulInlineRecordStatus =
  | "inline_record_verified"
  | "no_analyzable_record"
  | "record_data_url_not_supported"
  | "record_detail_rejected"
  | "record_container_unsupported"
  | "record_actions_empty"
  | "inconclusive";

export type MahjongSoulInlineRecordResult = Readonly<{
  readonly status: MahjongSoulInlineRecordStatus;
}>;

function result(status: MahjongSoulInlineRecordStatus): MahjongSoulInlineRecordResult {
  return Object.freeze({ status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function diagnoseMahjongSoulInlineRecord(input: {
  readonly credential: CapturedMahjongSoulCredential;
  readonly bundle: MahjongSoulProtocolBundle;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly now: () => number;
}): Promise<MahjongSoulInlineRecordResult> {
  const credential = snapshotRestoreCandidate(input?.credential);
  if (credential === null) return result("inconclusive");
  let session: MahjongSoulLobbySession | null = null;
  try {
    session = await input.createSession();
    const check = await session.call(".lq.Lobby.oauth2Check", {
      type: credential.authType,
      access_token: credential.accessToken.reveal(),
    });
    if (
      classifyRestoreResponseError(check) !== "success"
      || check.has_account !== true
    ) return result("inconclusive");
    const login = await session.call(
      ".lq.Lobby.oauth2Login",
      createOAuth2LoginPayload(credential),
    );
    if (
      classifyRestoreResponseError(login) !== "success"
      || login.account_id !== credential.accountId
    ) return result("inconclusive");
    const now = input.now();
    if (!Number.isSafeInteger(now) || now < 1000) return result("inconclusive");
    let endTime = Math.min(0xffff_ffff, Math.floor(now / 1000));
    let windowSeconds = 30 * 24 * 60 * 60;
    const entries = new Map<string, Awaited<ReturnType<typeof syncRecentCatalog>>["entries"][number]>();
    for (let window = 0; window < 8 && endTime >= 1 && entries.size < 30; window += 1) {
      const beginTime = Math.max(1, endTime - windowSeconds + 1);
      const catalog = await syncRecentCatalog({ session, beginTime, endTime });
      for (const candidate of catalog.entries) entries.set(candidate.uuid, candidate);
      if (beginTime === 1) break;
      endTime = beginTime - 1;
      windowSeconds *= 2;
    }
    const entry = [...entries.values()]
      .sort((left, right) => right.start_time - left.start_time || left.uuid.localeCompare(right.uuid))
      .find((candidate) =>
      filterAnalyzableRecord(candidate, credential.accountId, now).status === "analyzable"
    );
    if (entry === undefined) return result("no_analyzable_record");
    const detail = await session.call(".lq.Lobby.fetchGameRecord", {
      game_uuid: entry.uuid,
      client_version_string: credential.recoveryContext.clientVersionString,
    });
    const error = classifyRestoreResponseError(detail);
    if (error === "rejected") return result("record_detail_rejected");
    if (error !== "success") return result("inconclusive");
    const data = detail.data;
    const dataUrl = detail.data_url;
    if (!(data instanceof Uint8Array) || data.length === 0) {
      if (typeof dataUrl === "string" && dataUrl.length > 0) {
        return result("record_data_url_not_supported");
      }
      return result("record_container_unsupported");
    }
    let decoded: Record<string, unknown>;
    try {
      const root = parseProtobuf(input.bundle.protoText, { keepCase: true }).root;
      const type = root.lookupType("lq.GameDetailRecords");
      decoded = type.toObject(type.decode(data), {
        arrays: true,
        bytes: Uint8Array,
        defaults: true,
      }) as Record<string, unknown>;
    } catch {
      return result("record_container_unsupported");
    }
    if (!isRecord(decoded)) return result("record_container_unsupported");
    const actions = decoded.actions;
    const records = decoded.records;
    if (!Array.isArray(actions) || !Array.isArray(records)) {
      return result("record_container_unsupported");
    }
    const hasLegacyRecord = records.some(
      (record) => record instanceof Uint8Array && record.length > 0,
    );
    const hasAction = actions.some((action) =>
      isRecord(action)
      && action.result instanceof Uint8Array
      && action.result.length > 0
    );
    if (!hasAction && !hasLegacyRecord) {
      return result("record_actions_empty");
    }
    return result("inline_record_verified");
  } catch {
    return result("inconclusive");
  } finally {
    if (session !== null) {
      try { await session.close(); } catch { /* fixed result only */ }
    }
  }
}
