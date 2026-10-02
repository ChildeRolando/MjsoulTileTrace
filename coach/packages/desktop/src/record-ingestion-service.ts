import {
  MahjongSoulSourceError,
  type MahjongSoulCatalogStore,
  type MahjongSoulFetchedRecord,
  type MahjongSoulLobbySession,
  type MahjongSoulSessionVault,
  type StoredMahjongSoulSession,
} from "@riichi-coach/mahjong-soul-source";
import type { RecordAnalysisStore } from "./record-analysis-store.js";
import type {
  PaipuReviewPreparationInput,
  PaipuReviewPreparationResult,
} from "./paipu-import-service.js";

const RECORD_ID = /^\d{6}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

export interface MahjongSoulRecordIngestionService {
  ingest(recordId: string): Promise<MahjongSoulIngestedRecord>;
}

export type MahjongSoulIngestedRecord = MahjongSoulFetchedRecord & Readonly<{
  readonly selfActor: number;
}>;

// Capture the account's catalog seat during ingestion. A missing or invalid
// seat fails closed; the captured value travels with the fetched bytes through
// analysis and review preparation even if the active vault account changes.
export function requireCatalogSelfSeat(
  summaries: readonly { readonly recordId: string; readonly selfSeat: number }[],
  recordId: string,
): number {
  const summary = summaries.find((entry) => entry?.recordId === recordId);
  if (
    summary === undefined
    || !Number.isInteger(summary.selfSeat)
    || summary.selfSeat < 0
    || summary.selfSeat > 3
  ) {
    throw new MahjongSoulSourceError("mahjong_soul_record_not_analyzable");
  }
  return summary.selfSeat;
}

type AccountRecordReviewInput = Readonly<Pick<
  MahjongSoulIngestedRecord,
  "recordId" | "recordBytes" | "ruleEvidence" | "selfActor"
>>;

export function createAccountRecordReviewHandoff(input: {
  readonly ingest: (recordId: string) => Promise<AccountRecordReviewInput>;
  readonly analysisStore: Pick<RecordAnalysisStore, "analyzeRecord">;
  readonly prepareReview: (input: PaipuReviewPreparationInput) => Promise<PaipuReviewPreparationResult>;
}): (recordId: string) => Promise<Readonly<{
  status: "review_ready";
  sessionId: string;
  packageId: string;
}>> {
  return async (recordId) => {
    const ingested = await input.ingest(recordId);
    if (ingested.recordId !== recordId) throw error("mahjong_soul_record_not_analyzable");
    const outcome = input.analysisStore.analyzeRecord({
      recordId,
      selfActor: ingested.selfActor,
      recordBytes: ingested.recordBytes,
      ...(ingested.ruleEvidence === undefined ? {} : { ruleEvidence: ingested.ruleEvidence }),
    });
    if (outcome.status !== "analysis_ready") {
      throw new MahjongSoulSourceError("mahjong_soul_canonical_validation_failed");
    }
    const prepared = await input.prepareReview({
      recordId,
      selfActor: ingested.selfActor,
      stream: outcome.stream,
      decisions: outcome.decisions,
    });
    return Object.freeze({ status: "review_ready" as const, ...prepared });
  };
}

function error(code: "mahjong_soul_record_not_analyzable" | "mahjong_soul_record_fetch_failed") {
  return new MahjongSoulSourceError(code);
}

export function createMahjongSoulRecordIngestionService(input: {
  readonly vault: MahjongSoulSessionVault;
  readonly catalogStore: MahjongSoulCatalogStore;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly authenticate: (
    lobby: MahjongSoulLobbySession,
    stored: StoredMahjongSoulSession,
  ) => Promise<"authenticated" | "rejected" | "unverified">;
  readonly fetchRecord: (
    lobby: MahjongSoulLobbySession,
    stored: StoredMahjongSoulSession,
    recordId: string,
    selfActor: number,
  ) => Promise<MahjongSoulFetchedRecord>;
  readonly readCachedRecord?: (
    stored: StoredMahjongSoulSession,
    recordId: string,
    selfActor: number,
  ) => MahjongSoulFetchedRecord | null | Promise<MahjongSoulFetchedRecord | null>;
  readonly writeCachedRecord?: (
    stored: StoredMahjongSoulSession,
    record: MahjongSoulFetchedRecord,
  ) => void | Promise<void>;
}): MahjongSoulRecordIngestionService {
  const active = new Map<string, Promise<MahjongSoulIngestedRecord>>();
  return Object.freeze({
    ingest(recordId: string): Promise<MahjongSoulIngestedRecord> {
      if (typeof recordId !== "string" || !RECORD_ID.test(recordId)) {
        return Promise.reject(error("mahjong_soul_record_not_analyzable"));
      }
      return input.vault.restore().then((stored) => {
        if (stored === null) throw error("mahjong_soul_record_not_analyzable");
        const activeKey = `${stored.accountId}#${recordId}`;
        const existing = active.get(activeKey);
        if (existing !== undefined) return existing;
        const operation = (async (): Promise<MahjongSoulIngestedRecord> => {
          const summaries = await input.catalogStore.list(stored.accountId);
          const selfActor = requireCatalogSelfSeat(summaries, recordId);
          const cached = await input.readCachedRecord?.(stored, recordId, selfActor) ?? null;
          if (cached !== null) {
            if (cached.recordId !== recordId || cached.actionCount < 1) throw error("mahjong_soul_record_fetch_failed");
            return Object.freeze({ ...cached, selfActor });
          }
          let lobby: MahjongSoulLobbySession | null = null;
          try {
            lobby = await input.createSession();
            if (await input.authenticate(lobby, stored) !== "authenticated") {
              throw error("mahjong_soul_record_fetch_failed");
            }
            const fetched = await input.fetchRecord(lobby, stored, recordId, selfActor);
            if (fetched.recordId !== recordId || fetched.actionCount < 1) throw error("mahjong_soul_record_fetch_failed");
            await input.writeCachedRecord?.(stored, fetched);
            return Object.freeze({ ...fetched, selfActor });
          } catch (cause) {
            if (cause instanceof MahjongSoulSourceError) throw cause;
            throw error("mahjong_soul_record_fetch_failed");
          } finally {
            if (lobby !== null) await lobby.close().catch(() => undefined);
          }
        })().finally(() => {
          if (active.get(activeKey) === operation) active.delete(activeKey);
        });
        active.set(activeKey, operation);
        return operation;
      });
    },
  });
}
