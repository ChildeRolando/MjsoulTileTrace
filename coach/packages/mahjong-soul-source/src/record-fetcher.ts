import { createHash } from "node:crypto";
import { parse as parseProtobuf } from "protobufjs";

import { MahjongSoulSourceError } from "./errors.js";
import type { MahjongSoulLobbySession } from "./lobby-session.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";
import { unwrapGameDetailRecords } from "./record-wire.js";
import { classifyRestoreResponseError } from "./restore-diagnostic.js";

const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const RECORD_ID = /^\d{6}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

export type MahjongSoulFetchedRecord = Readonly<{
  readonly recordId: string;
  readonly sha256: `sha256:${string}`;
  readonly container: "actions" | "records";
  readonly actionCount: number;
  readonly recordBytes: Uint8Array;
}>;

function failed(code: "mahjong_soul_record_fetch_failed" | "mahjong_soul_record_identity_mismatch" | "unsupported_mahjong_soul_record_version" = "mahjong_soul_record_fetch_failed"): MahjongSoulSourceError {
  return new MahjongSoulSourceError(code);
}

function trustedRecordUrl(raw: unknown, prefixes: readonly string[]): URL {
  if (typeof raw !== "string" || raw.length > 4096) throw failed();
  let url: URL;
  try { url = new URL(raw); } catch { throw failed(); }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || !prefixes.some((prefix) => raw.startsWith(`${prefix}/`))
  ) throw failed();
  return url;
}

async function downloadedBytes(response: Response): Promise<Uint8Array> {
  if (!response.ok || response.redirected) throw failed();
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_RECORD_BYTES)) throw failed();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_RECORD_BYTES) throw failed();
  return bytes;
}

export async function fetchMahjongSoulRecord(input: {
  readonly session: MahjongSoulLobbySession;
  readonly bundle: MahjongSoulProtocolBundle;
  readonly recordId: string;
  readonly clientVersionString: string;
  readonly fetchImpl: typeof fetch;
}): Promise<MahjongSoulFetchedRecord> {
  try {
    if (!RECORD_ID.test(input.recordId)) throw failed("mahjong_soul_record_identity_mismatch");
    const response = await input.session.call(".lq.Lobby.fetchGameRecord", {
      game_uuid: input.recordId,
      client_version_string: input.clientVersionString,
    });
    if (classifyRestoreResponseError(response) !== "success") throw failed();
    let bytes: Uint8Array;
    if (response.data instanceof Uint8Array && response.data.length > 0) {
      bytes = response.data;
    } else {
      const url = trustedRecordUrl(response.data_url, input.bundle.endpoints.recordDataPrefixes);
      bytes = await downloadedBytes(await input.fetchImpl(url, { redirect: "error" }));
    }
    // The fetchGameRecord payload (inline data and the data_url file alike) is
    // the outer transport Wrapper; unwrap to the unified GameDetailRecords bytes.
    bytes = unwrapGameDetailRecords(input.bundle, bytes);
    if (bytes.length > MAX_RECORD_BYTES) throw failed();
    const root = parseProtobuf(input.bundle.protoText, { keepCase: true }).root;
    const type = root.lookupType("lq.GameDetailRecords");
    const decoded = type.toObject(type.decode(bytes), {
      arrays: true, bytes: Uint8Array, defaults: true,
    }) as { actions?: unknown[]; records?: unknown[] };
    const actions = Array.isArray(decoded.actions) ? decoded.actions : [];
    const records = Array.isArray(decoded.records) ? decoded.records : [];
    const actionCount = actions.filter((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
      const result = (entry as { result?: unknown }).result;
      return result instanceof Uint8Array && result.length > 0;
    }).length;
    const recordCount = records.filter((entry) => entry instanceof Uint8Array && entry.length > 0).length;
    if (actionCount === 0 && recordCount === 0) throw failed("unsupported_mahjong_soul_record_version");
    return Object.freeze({
      recordId: input.recordId,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      container: actionCount > 0 ? "actions" : "records",
      actionCount: actionCount > 0 ? actionCount : recordCount,
      recordBytes: Uint8Array.from(bytes),
    });
  } catch (error) {
    if (error instanceof MahjongSoulSourceError) throw error;
    throw failed();
  }
}
