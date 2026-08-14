import { parseMahjongSoulCnShareUrl } from "@riichi-coach/contracts";
import type { MahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import {
  captureRecordViaOfficialClient,
  OfficialClientCaptureError,
  type CaptureRecordWindowPort,
  type OfficialClientCaptureResult,
} from "./official-client-record-capture.js";
import type { RecordAnalysisStore } from "./record-analysis-store.js";

// The paipu-URL ingestion route: paste a Mahjong Soul share URL + choose the
// analysis seat, and the app rides its own official-client session to obtain
// the record, then runs the SAME post-ingestion analysis as the account
// catalog route:
//
//   strict parseMahjongSoulCnShareUrl (BEFORE any BrowserWindow)
//     -> captureRecordViaOfficialClient (original validated URL; INNER bytes)
//     -> shared record-analysis-store (map + strict replay)
//     -> safe metadata only
//
// This is a sibling ingestion source, NOT a special case of catalog ingest:
// the record is NOT required to exist in the user's catalog store, and
// createMahjongSoulRecordIngestionService.ingest() is intentionally unused
// (it enforces stored-session + catalog membership, which is exactly what
// shared links do not have).
//
// Identity never defaults: selfActor must be provided explicitly (0..3) and
// recordId is derived deterministically from the validated URL. Concurrent
// duplicate imports for the same recordId + selfActor share one active
// promise, so a double click cannot open two official-client windows.

export type PaipuImportResult = Readonly<
  | {
    readonly status: "analysis_ready";
    readonly recordId: string;
    readonly selfActor: number;
    readonly canonicalEventCount: number;
    readonly replayDecisionCount: number;
  }
  | { readonly status: "invalid_url" }
  | { readonly status: "invalid_self_actor" }
  | { readonly status: "no_capture" }
  | { readonly status: "unsupported_semantics" }
  | { readonly status: "analysis_failed" }
>;

export interface MahjongSoulPaipuImportService {
  importPaipu(input: {
    readonly shareUrl: string;
    /** Must be provided explicitly; there is no default seat. */
    readonly selfActor: number;
  }): Promise<PaipuImportResult>;
}

export function createMahjongSoulPaipuImportService(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly analysis: RecordAnalysisStore;
  readonly createWindow: () => CaptureRecordWindowPort;
  readonly timeoutMs: number;
}): MahjongSoulPaipuImportService {
  const active = new Map<string, Promise<PaipuImportResult>>();

  return Object.freeze({
    async importPaipu(request: {
      readonly shareUrl: string;
      readonly selfActor: number;
    }): Promise<PaipuImportResult> {
      // 1. The share URL is strictly parsed BEFORE any BrowserWindow exists:
      //    an invalid URL must never open a window.
      let recordId: string;
      try {
        recordId = parseMahjongSoulCnShareUrl(request?.shareUrl).recordId;
      } catch {
        return { status: "invalid_url" };
      }

      // 2. The analysis seat is explicit — never inferred from the `_a`
      //    suffix (its relationship to the seat has not been pinned) and
      //    never defaulted.
      const selfActor = request?.selfActor;
      if (!Number.isInteger(selfActor) || selfActor < 0 || selfActor > 3) {
        return { status: "invalid_self_actor" };
      }

      // 3. Concurrent duplicate imports for the same recordId + selfActor
      //    resolve together; only one official-client window is opened.
      const key = `${recordId}#${selfActor}`;
      const existing = active.get(key);
      if (existing !== undefined) return existing;

      const operation = (async (): Promise<PaipuImportResult> => {
        let captured: OfficialClientCaptureResult;
        try {
          captured = await captureRecordViaOfficialClient({
            bundle: input.bundle,
            // The exact validated share URL is what gets navigated; the
            // recordId was derived from it separately.
            url: request.shareUrl,
            createWindow: input.createWindow,
            timeoutMs: input.timeoutMs,
          });
        } catch (error) {
          // Fixed fail-closed mapping: an unauthenticated window that cannot
          // fetch the replay, a refused navigation, or a protocol violation
          // all mean "no record obtained" — never a fabricated one.
          if (!(error instanceof OfficialClientCaptureError)) throw error;
          return { status: "no_capture" };
        }
        if (captured.status === "no_capture") {
          return { status: "no_capture" };
        }

        // 4/5. captured.recordBytes is INNER GameDetailRecords: the shared
        // analysis path is byte-identical to the account fetch route.
        const outcome = input.analysis.analyzeRecord({
          recordId,
          selfActor,
          recordBytes: captured.recordBytes,
        });
        switch (outcome.status) {
          case "analysis_ready":
            return Object.freeze({
              status: "analysis_ready" as const,
              recordId,
              selfActor,
              canonicalEventCount: outcome.stream.events.length,
              replayDecisionCount: outcome.decisions.length,
            });
          case "unsupported_semantics":
            return { status: "unsupported_semantics" };
          default:
            return { status: "analysis_failed" };
        }
      })().finally(() => {
        if (active.get(key) === operation) active.delete(key);
      });
      active.set(key, operation);
      return operation;
    },
  });
}
