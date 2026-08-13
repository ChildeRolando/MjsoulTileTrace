import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulLobbySession } from "./lobby-session.js";
import type { RawRecordListEntry } from "./record-filter.js";

const CATALOG_SYNC_FAILED = "mahjong_soul_catalog_sync_failed" as const;

const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 10;
const RECENT_CATALOG_LIMIT = 30;

export interface CatalogSyncInput {
  readonly session: MahjongSoulLobbySession;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly beginTime?: number;
  readonly endTime?: number;
}

export interface CatalogSyncResult {
  readonly entries: RawRecordListEntry[];
}

type RawListEntryWithoutMode = Omit<
  RawRecordListEntry,
  | "game_mode"
  | "game_mode_ai"
  | "game_mode_extendinfo"
  | "game_mode_detail_rule_present"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUint32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= 0xffff_ffff;
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function catalogFailed(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(CATALOG_SYNC_FAILED);
}

// A non-zero `.lq.Error.code` means the lobby rejected the call; an absent error
// or a zero code is success. Exact code → session-invalid mapping is pinned in
// M5-E, so every non-zero code here fails closed as a catalog error.
function hasServerError(value: Record<string, unknown>): boolean {
  const error = value.error;
  if (error === undefined || error === null) return false;
  if (!isRecord(error)) return true;
  const code = error.code;
  return !isUint32(code) || code !== 0;
}

// The sync only needs a stable UUID for dedupe; full analyzable filtering happens
// later in `filterAnalyzableRecord`. This light check still rejects malformed
// entries so a hostile payload cannot corrupt the local catalog.
function isLightEntry(value: unknown): value is RawListEntryWithoutMode {
  if (!isRecord(value)) return false;
  if (typeof value.uuid !== "string" || value.uuid.length === 0) return false;
  if (!isUint32(value.version)) return false;
  if (!isUint32(value.standard_rule)) return false;
  if (!isUint32(value.start_time) || !isUint32(value.end_time)) return false;
  if (!Array.isArray(value.players)) return false;
  return true;
}

export async function syncRecentCatalog(
  input: CatalogSyncInput,
): Promise<CatalogSyncResult> {
  const session = input.session;
  const pageSize = input.pageSize ?? 100;
  const maxPages = input.maxPages ?? MAX_PAGES;
  const beginTime = input.beginTime ?? 1;
  const endTime = input.endTime ?? 0xffff_ffff;
  if (
    !isObjectLike(session)
    || typeof session.call !== "function"
    || !Number.isInteger(pageSize)
    || pageSize < 1
    || pageSize > MAX_PAGE_SIZE
    || !Number.isInteger(maxPages)
    || maxPages < 1
    || maxPages > MAX_PAGES
    || !isUint32(beginTime)
    || beginTime === 0
    || !isUint32(endTime)
    || endTime < beginTime
  ) {
    throw catalogFailed();
  }

  const listResult = await session.call(".lq.Lobby.fetchGameRecordListV2", {
    tag: 0,
    begin_time: beginTime,
    end_time: endTime,
  });
  if (
    !isRecord(listResult)
    || hasServerError(listResult)
    || typeof listResult.iterator !== "string"
    || listResult.iterator.length === 0
    || !isUint32(listResult.iterator_expire)
    || listResult.iterator_expire === 0
    || listResult.actual_begin_time !== beginTime
    || listResult.actual_end_time !== endTime
  ) {
    throw catalogFailed();
  }
  const iterator = listResult.iterator;

  const entries: RawListEntryWithoutMode[] = [];
  const seen = new Map<string, string>();
  let complete = false;
  for (let page = 0; page < maxPages; page += 1) {
    const nextResult = await session.call(".lq.Lobby.fetchNextGameRecordList", {
      iterator,
      count: pageSize,
    });
    if (
      !isRecord(nextResult)
      || hasServerError(nextResult)
      || !Array.isArray(nextResult.entries)
      || typeof nextResult.next !== "boolean"
      || !isUint32(nextResult.iterator_expire)
      || nextResult.iterator_expire === 0
      || nextResult.entries.length > pageSize
    ) {
      throw catalogFailed();
    }
    for (const raw of nextResult.entries) {
      if (!isLightEntry(raw)) throw catalogFailed();
      const entry = raw;
      if (
        entry.start_time < beginTime
        || entry.start_time > endTime
        || entry.end_time < entry.start_time
      ) throw catalogFailed();
      const fingerprint = JSON.stringify(entry);
      const existing = seen.get(entry.uuid);
      if (existing !== undefined) {
        if (existing !== fingerprint) throw catalogFailed();
        continue;
      }
      seen.set(entry.uuid, fingerprint);
      entries.push(entry);
    }
    if (nextResult.next !== true) {
      complete = true;
      break;
    }
  }
  if (!complete) throw catalogFailed();
  entries.sort((left, right) =>
    right.start_time - left.start_time || left.uuid.localeCompare(right.uuid)
  );
  entries.splice(RECENT_CATALOG_LIMIT);
  if (entries.length === 0) return { entries: [] };
  const detailResult = await session.call(".lq.Lobby.fetchGameRecordsDetail", {
    uuid_list: entries.map((entry) => entry.uuid),
  });
  if (
    !isRecord(detailResult)
    || hasServerError(detailResult)
    || !Array.isArray(detailResult.record_list)
    || detailResult.record_list.length !== entries.length
  ) {
    throw catalogFailed();
  }
  const detailsByUuid = new Map<string, {
    mode: number;
    standardRule: number;
    ai: boolean;
    extendinfo: string;
    detailRulePresent: boolean;
  }>();
  for (const raw of detailResult.record_list) {
    if (!isRecord(raw) || typeof raw.uuid !== "string" || detailsByUuid.has(raw.uuid)) {
      throw catalogFailed();
    }
    const config = raw.config;
    const modeContainer = isRecord(config) ? config.mode : undefined;
    const mode = isRecord(modeContainer) ? modeContainer.mode : undefined;
    const ai = isRecord(modeContainer) ? modeContainer.ai : undefined;
    const extendinfo = isRecord(modeContainer) ? modeContainer.extendinfo : undefined;
    const detailRule = isRecord(modeContainer) ? modeContainer.detail_rule : undefined;
    if (
      !isUint32(mode)
      || typeof ai !== "boolean"
      || typeof extendinfo !== "string"
      || !isUint32(raw.standard_rule)
      || (detailRule !== null && detailRule !== undefined)
    ) throw catalogFailed();
    detailsByUuid.set(raw.uuid, {
      mode,
      standardRule: raw.standard_rule,
      ai,
      extendinfo,
      detailRulePresent: false,
    });
  }
  return {
    entries: entries.map((entry) => {
      const detail = detailsByUuid.get(entry.uuid);
      if (detail === undefined || detail.standardRule !== entry.standard_rule) {
        throw catalogFailed();
      }
      return Object.freeze({
        ...entry,
        game_mode: detail.mode,
        game_mode_ai: detail.ai,
        game_mode_extendinfo: detail.extendinfo,
        game_mode_detail_rule_present: detail.detailRulePresent,
      });
    }),
  };
}
