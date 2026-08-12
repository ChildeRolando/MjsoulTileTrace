import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulLobbySession } from "./lobby-session.js";
import type { RawRecordListEntry } from "./record-filter.js";

const CATALOG_SYNC_FAILED = "mahjong_soul_catalog_sync_failed" as const;

const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 10;

export interface CatalogSyncInput {
  readonly session: MahjongSoulLobbySession;
  readonly pageSize?: number;
  readonly maxPages?: number;
}

export interface CatalogSyncResult {
  readonly entries: RawRecordListEntry[];
}

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

// The sync only needs a stable UUID for dedupe; full analyzable filtering happens
// later in `filterAnalyzableRecord`. This light check still rejects malformed
// entries so a hostile payload cannot corrupt the local catalog.
function isLightEntry(value: unknown): value is RawRecordListEntry {
  if (!isRecord(value)) return false;
  if (typeof value.uuid !== "string" || value.uuid.length === 0) return false;
  if (!isUint32(value.version)) return false;
  if (!isUint32(value.standard_rule)) return false;
  if (!Array.isArray(value.players)) return false;
  return true;
}

export async function syncRecentCatalog(
  input: CatalogSyncInput,
): Promise<CatalogSyncResult> {
  const session = input.session;
  const pageSize = input.pageSize ?? 10;
  const maxPages = input.maxPages ?? 3;
  if (
    !isObjectLike(session)
    || typeof session.call !== "function"
    || !Number.isInteger(pageSize)
    || pageSize < 1
    || pageSize > MAX_PAGE_SIZE
    || !Number.isInteger(maxPages)
    || maxPages < 1
    || maxPages > MAX_PAGES
  ) {
    throw catalogFailed();
  }

  const listResult = await session.call(".lq.Lobby.fetchGameRecordListV2", {});
  if (
    !isRecord(listResult)
    || typeof listResult.iterator !== "string"
    || listResult.iterator.length === 0
  ) {
    throw catalogFailed();
  }
  const iterator = listResult.iterator;

  const entries: RawRecordListEntry[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page += 1) {
    const nextResult = await session.call(".lq.Lobby.fetchNextGameRecordList", {
      iterator,
      count: pageSize,
    });
    if (!isRecord(nextResult) || !Array.isArray(nextResult.entries)) {
      throw catalogFailed();
    }
    for (const raw of nextResult.entries) {
      if (!isLightEntry(raw)) throw catalogFailed();
      const entry = raw;
      if (seen.has(entry.uuid)) continue;
      seen.add(entry.uuid);
      entries.push(entry);
    }
    if (nextResult.next !== true) break;
  }
  return { entries };
}
