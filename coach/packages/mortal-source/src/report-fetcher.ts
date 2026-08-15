import { MortalSourceError } from "./errors.js";
import {
  MORTAL_ADAPTER_VERSION,
  MortalReportSchema,
  type RawMortalReport,
} from "./report-schema.js";
import { parseMortalReportResultUrl } from "./report-url.js";
import { computeMortalGameFingerprint } from "./report-fingerprint.js";

// The only production download boundary for Mortal (mjai-reviewer) results.
// It fetches the canonical JSON endpoint, re-validates every redirect hop
// against the approved-host policy, caps size and content type, validates the
// pinned report schema, and projects a minimal self-perspective DTO.
//
// Privacy invariants:
//  - the result URL is never logged or interpolated into any error message;
//  - the raw report (mjai_log / split_logs / nicknames) never leaves this
//    module as a value — only the game fingerprint and self-perspective
//    decision entries are projected.

export const MORTAL_REPORT_MAX_BYTES = 4 * 1024 * 1024;
export const MORTAL_REPORT_MAX_REDIRECTS = 3;
export const MORTAL_REPORT_TIMEOUT_MS = 30_000;

export type MortalSourceAction = Record<string, unknown> & { type: string };

export type MortalReportCandidate = Readonly<{
  action: MortalSourceAction;
  probability: number;
  qValue: number;
}>;

export type MortalReportDecisionEntry = Readonly<{
  roundOrdinal: number;
  roundWind: "E" | "S" | "W";
  dealer: number;
  kyoku: number;
  honba: number;
  junme: number;
  tilesLeft: number;
  lastActor: number;
  tile: string;
  tehai: readonly string[];
  atSelfChiPon: boolean;
  atSelfRiichi: boolean;
  atOpponentKakan: boolean;
  expected: MortalSourceAction;
  actual: MortalSourceAction;
  isEqual: boolean;
  details: readonly MortalReportCandidate[];
  shanten: number;
  atFuriten: boolean;
  actualIndex: number;
}>;

export type MortalReportKyoku = Readonly<{
  roundOrdinal: number;
  roundWind: "E" | "S" | "W";
  dealer: number;
  kyoku: number;
  honba: number;
  entries: readonly MortalReportDecisionEntry[];
}>;

export type MortalFetchedReport = Readonly<{
  reportId: string;
  adapterVersion: typeof MORTAL_ADAPTER_VERSION;
  engine: "Mortal";
  version: string;
  modelTag: string;
  playerId: number;
  gameFingerprint: string;
  kyokus: readonly MortalReportKyoku[];
}>;

function failed(
  code:
    | "mortal_result_fetch_failed"
    | "mortal_result_redirect_rejected"
    | "mortal_result_size_exceeded"
    | "mortal_result_content_type_rejected"
    | "mortal_result_invalid_json"
    | "mortal_report_schema_unsupported",
): MortalSourceError {
  return new MortalSourceError(code);
}

function approvedContentType(value: string | null): boolean {
  if (value === null) return false;
  const mediaType = value.split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

async function fetchFinalResponse(input: {
  url: string;
  fetchImpl: typeof fetch;
  signal?: AbortSignal | null;
}): Promise<Response> {
  let current = input.url;
  for (let hop = 0; hop <= MORTAL_REPORT_MAX_REDIRECTS; hop += 1) {
    const parsed = parseMortalReportResultUrl(current);
    if (parsed.status !== "valid") {
      throw new MortalSourceError("mortal_result_url_invalid");
    }
    let response: Response;
    try {
      response = await input.fetchImpl(current, {
        redirect: "manual",
        signal: input.signal ?? null,
        headers: { accept: "application/json" },
      });
    } catch (error) {
      if (error instanceof MortalSourceError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw failed("mortal_result_fetch_failed");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null || location.length === 0) {
        throw failed("mortal_result_redirect_rejected");
      }
      try {
        current = new URL(location, current).href;
      } catch {
        throw failed("mortal_result_redirect_rejected");
      }
      continue;
    }
    return response;
  }
  throw failed("mortal_result_redirect_rejected");
}

function mjaiStartRoundContexts(report: RawMortalReport): Array<{
  roundOrdinal: number;
  roundWind: "E" | "S" | "W";
  dealer: number;
}> {
  const rounds: Array<{
    roundOrdinal: number;
    roundWind: "E" | "S" | "W";
    dealer: number;
  }> = [];
  let roundOrdinal = 0;
  for (const event of report.mjai_log) {
    if (event.type !== "start_kyoku") continue;
    if (
      (event.bakaze !== "E" && event.bakaze !== "S" && event.bakaze !== "W")
      || typeof event.oya !== "number"
      || !Number.isInteger(event.oya)
      || event.oya < 0
      || event.oya > 3
    ) {
      throw new Error("mjai_round_context_invalid");
    }
    rounds.push({
      roundOrdinal: roundOrdinal++,
      roundWind: event.bakaze,
      dealer: event.oya,
    });
  }
  // The current pinned schema does not guarantee review.kyokus carries a
  // round-wind/dealer field, so the public context comes from mjai_log. The
  // fingerprint v2 already proves the round-start sequence matches canonical;
  // the roundOrdinal here is that same sequence index, not a semantic guess.
  if (rounds.length !== report.review.kyokus.length) {
    throw new Error("mjai_round_count_mismatch");
  }
  return rounds;
}

function projectReport(
  reportId: string,
  report: RawMortalReport,
): MortalFetchedReport {
  const roundContexts = mjaiStartRoundContexts(report);
  const kyokus = report.review.kyokus.map((kyoku, kyokuIndex) => {
    const context = roundContexts[kyokuIndex]!;
    return {
      roundOrdinal: context.roundOrdinal,
      roundWind: context.roundWind,
      dealer: context.dealer,
      kyoku: kyoku.kyoku,
      honba: kyoku.honba,
      entries: kyoku.entries.flatMap((entry): MortalReportDecisionEntry[] => {
        // Opponent-perspective rows are deliberately not projected: their
        // `state.tehai` and private context are not ours to carry around.
        if (entry.last_actor !== report.player_id) return [];
        return [{
          roundOrdinal: context.roundOrdinal,
          roundWind: context.roundWind,
          dealer: context.dealer,
          kyoku: kyoku.kyoku,
          honba: kyoku.honba,
          junme: entry.junme,
          tilesLeft: entry.tiles_left,
          lastActor: entry.last_actor,
          tile: entry.tile,
          tehai: entry.state.tehai,
          atSelfChiPon: entry.at_self_chi_pon,
          atSelfRiichi: entry.at_self_riichi,
          atOpponentKakan: entry.at_opponent_kakan,
          expected: entry.expected as MortalSourceAction,
          actual: entry.actual as MortalSourceAction,
          isEqual: entry.is_equal,
          details: entry.details.map((detail) => ({
            action: detail.action as MortalSourceAction,
            probability: detail.prob,
            qValue: detail.q_value,
          })),
          shanten: entry.shanten,
          atFuriten: entry.at_furiten,
          actualIndex: entry.actual_index,
        }];
      }),
    };
  });

  return Object.freeze({
    reportId,
    adapterVersion: MORTAL_ADAPTER_VERSION,
    engine: "Mortal" as const,
    version: report.version,
    modelTag: report.review.model_tag,
    playerId: report.player_id,
    gameFingerprint: computeMortalGameFingerprint(report.mjai_log),
    kyokus: Object.freeze(kyokus.map((kyoku) => Object.freeze({
      ...kyoku,
      entries: Object.freeze(kyoku.entries),
    }))),
  });
}

export async function fetchMortalReport(input: {
  url: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal | null;
  timeoutMs?: number;
}): Promise<MortalFetchedReport> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw failed("mortal_result_fetch_failed");
  }

  const parsedUrl = parseMortalReportResultUrl(input.url);
  if (parsedUrl.status !== "valid") {
    throw new MortalSourceError("mortal_result_url_invalid");
  }

  const timeoutMs = input.timeoutMs ?? MORTAL_REPORT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw failed("mortal_result_fetch_failed");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const callerSignal = input.signal ?? null;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal !== null) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  try {
    const response = await fetchFinalResponse({
      url: input.url,
      fetchImpl,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw failed("mortal_result_fetch_failed");
    }

    const contentLength = response.headers.get("content-length");
    if (
      contentLength !== null
      && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MORTAL_REPORT_MAX_BYTES)
    ) {
      throw failed("mortal_result_size_exceeded");
    }
    if (!approvedContentType(response.headers.get("content-type"))) {
      throw failed("mortal_result_content_type_rejected");
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await response.arrayBuffer();
    } catch (error) {
      if (callerSignal?.aborted === true) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw failed("mortal_result_fetch_failed");
      }
      throw failed("mortal_result_fetch_failed");
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MORTAL_REPORT_MAX_BYTES) {
      throw failed("mortal_result_size_exceeded");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw failed("mortal_result_invalid_json");
    }

    const parsed = MortalReportSchema.safeParse(raw);
    if (!parsed.success) {
      throw failed("mortal_report_schema_unsupported");
    }

    try {
      return projectReport(parsedUrl.reportId, parsed.data);
    } catch (error) {
      if (error instanceof MortalSourceError) throw error;
      throw failed("mortal_report_schema_unsupported");
    }
  } catch (error) {
    if (callerSignal?.aborted === true) throw error;
    if (error instanceof MortalSourceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw failed("mortal_result_fetch_failed");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (callerSignal !== null) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}
