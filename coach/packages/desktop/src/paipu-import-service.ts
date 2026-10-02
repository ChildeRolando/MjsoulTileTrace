import { parseMahjongSoulCnShareUrl } from "@riichi-coach/contracts";
import {
  resolveMahjongSoulPaipuPerspective,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import {
  captureRecordViaOfficialClient,
  OfficialClientCaptureError,
  type CaptureRecordWindowPort,
  type OfficialClientCaptureResult,
} from "./official-client-record-capture.js";
import type { RecordAnalysisStore } from "./record-analysis-store.js";

// The paipu-URL ingestion route: paste a Mahjong Soul share URL and the app
// rides its own official-client session to obtain the record, resolves the
// analysis perspective from the URL's identity, and runs the SAME
// post-ingestion analysis as the account catalog route:
//
//   strict parseMahjongSoulCnShareUrl (BEFORE any BrowserWindow)
//     -> { recordId, perspectiveToken }
//     -> captureRecordViaOfficialClient (original validated URL; INNER bytes
//        + record identity from the SAME fetchGameRecord response)
//     -> resolveMahjongSoulPaipuPerspective (URL perspective id JOIN record
//        accounts -> exactly one seat; any mismatch fails closed — live
//        evidence shows real `_a` suffixes never match the captured account
//        space, so real links currently resolve to identity_mismatch by
//        design until that id space is mapped)
//     -> shared record-analysis-store (map + strict replay)
//     -> safe metadata only
//
// There is NO manual seat: the user never chooses or knows a seat. There is
// no catalog membership requirement either (URL import is a sibling
// ingestion source, not catalog ingest). Concurrent duplicate imports for
// the same immutable request identity (recordId + perspectiveToken)
// share one active promise.

export type PaipuImportResult = Readonly<
  | {
    /** Main-process-only success after package validation and session create/reuse. */
    readonly status: "review_ready";
    readonly recordId: string;
    readonly selfActor: number;
    readonly sessionId: string;
    readonly packageId: string;
    readonly canonicalEventCount: number;
    readonly replayDecisionCount: number;
  }
  | {
    readonly status: "analysis_ready";
    readonly recordId: string;
    /**
     * Auto-resolved from the URL identity join. Internal to the main
     * process — the IPC boundary strips it before anything reaches the
     * renderer.
     */
    readonly selfActor: number;
    readonly canonicalEventCount: number;
    readonly replayDecisionCount: number;
  }
  | { readonly status: "invalid_url" }
  | { readonly status: "identity_mismatch" }
  | { readonly status: "no_capture" }
  | { readonly status: "unsupported_semantics" }
  | { readonly status: "analysis_failed" }
>;

export interface MahjongSoulPaipuImportService {
  importPaipu(input: {
    readonly shareUrl: string;
  }): Promise<PaipuImportResult>;
}

export type PaipuReviewPreparationInput = Readonly<{
  readonly recordId: string;
  readonly selfActor: number;
  readonly stream: NonNullable<Extract<ReturnType<RecordAnalysisStore["analyzeRecord"]>, { status: "analysis_ready" }>['stream']>;
  readonly decisions: NonNullable<Extract<ReturnType<RecordAnalysisStore["analyzeRecord"]>, { status: "analysis_ready" }>['decisions']>;
}>;

export type PaipuReviewPreparationResult = Readonly<{
  readonly sessionId: string;
  readonly packageId: string;
}>;

export function createMahjongSoulPaipuImportService(input: {
  readonly bundle: MahjongSoulProtocolBundle;
  readonly analysis: RecordAnalysisStore;
  readonly createWindow: () => CaptureRecordWindowPort;
  readonly timeoutMs: number;
  /** Main composition owns local-model/package/session work. The source
   * adapter only hands it the validated canonical/replay result. */
  readonly prepareReview?: (
    input: PaipuReviewPreparationInput,
  ) => Promise<PaipuReviewPreparationResult>;
}): MahjongSoulPaipuImportService {
  const active = new Map<string, Promise<PaipuImportResult>>();

  return Object.freeze({
    async importPaipu(request: {
      readonly shareUrl: string;
    }): Promise<PaipuImportResult> {
      // 1. The share URL is strictly parsed BEFORE any BrowserWindow exists:
      //    an invalid URL must never open a window. The perspective account
      //    id comes from the URL itself — never a seat.
      let parsed: { readonly recordId: string; readonly perspectiveToken: number };
      try {
        parsed = parseMahjongSoulCnShareUrl(request?.shareUrl);
      } catch {
        return { status: "invalid_url" };
      }

      // 2. Concurrent duplicate imports for the same immutable request
      //    identity resolve together; only one window is opened.
      const key = `${parsed.recordId}#${parsed.perspectiveToken}`;
      const existing = active.get(key);
      if (existing !== undefined) return existing;

      const operation = (async (): Promise<PaipuImportResult> => {
        let captured: OfficialClientCaptureResult;
        try {
          captured = await captureRecordViaOfficialClient({
            bundle: input.bundle,
            // The exact validated share URL is what gets navigated.
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

        // 3. Resolve the perspective by the strict identity join. A
        //    mismatch is fatal for this import: no analysis, no cache, no
        //    guessed seat.
        let perspective: { readonly recordId: string; readonly selfActor: number };
        try {
          perspective = resolveMahjongSoulPaipuPerspective({
            parsedUrl: parsed,
            capturedIdentity: captured.recordIdentity,
          });
        } catch {
          return { status: "identity_mismatch" };
        }
        if (perspective.recordId !== parsed.recordId) {
          return { status: "identity_mismatch" };
        }

        // 4. The shared analysis path is byte-identical to the account
        //    fetch route; only the seat differs (auto-resolved).
        const outcome = input.analysis.analyzeRecord({
          recordId: parsed.recordId,
          selfActor: perspective.selfActor,
          recordBytes: captured.recordBytes,
          ...(captured.ruleEvidence === undefined ? {} : { ruleEvidence: captured.ruleEvidence }),
        });
        switch (outcome.status) {
          case "analysis_ready":
            if (input.prepareReview !== undefined) {
              try {
                const prepared = await input.prepareReview({
                  recordId: parsed.recordId,
                  selfActor: perspective.selfActor,
                  stream: outcome.stream,
                  decisions: outcome.decisions,
                });
                return Object.freeze({
                  status: "review_ready" as const,
                  recordId: parsed.recordId,
                  selfActor: perspective.selfActor,
                  sessionId: prepared.sessionId,
                  packageId: prepared.packageId,
                  canonicalEventCount: outcome.stream.events.length,
                  replayDecisionCount: outcome.decisions.length,
                });
              } catch {
                // Package/runtime/session failures collapse to the same safe
                // source outcome. No navigation occurs because no review-ready
                // DTO crosses the IPC boundary.
                return { status: "analysis_failed" };
              }
            }
            return Object.freeze({
              status: "analysis_ready" as const,
              recordId: parsed.recordId,
              selfActor: perspective.selfActor,
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
