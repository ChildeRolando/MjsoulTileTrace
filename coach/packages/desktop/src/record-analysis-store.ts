import { StructuredAnalysisPackageSchema, type CanonicalEventStream, type StructuredAnalysisPackage } from "@riichi-coach/contracts";
import { validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type {
  MahjongSoulCanonicalMapperResult,
  MahjongSoulMapperDiagnostic,
} from "@riichi-coach/mahjong-soul-source";
import type { ReplayedDecision } from "@riichi-coach/reasoning";

// The single post-ingestion analysis component shared by EVERY Mahjong Soul
// ingestion route (the account/catalog fetch route and the paipu-URL capture
// route). It owns the only in-memory analysis state:
//
//   INNER GameDetailRecords recordBytes + selfActor
//     -> mapMahjongSoulRecord (ready only; never a partial stream)
//     -> replayCanonicalStream
//     -> mappedRecords / replayedRecords
//
// Route convergence invariant: the same record bytes + the same selfActor
// MUST produce an identical canonical stream and identical replay decisions,
// independent of how the bytes entered the process. There is no second
// analysis cache implementation and no second mapper entry point.
//
// A record the mapper refuses is never cached and never half-analyzed: the
// outcome carries a fixed status for the caller to surface safely.

export type RecordAnalysisOutcome =
  | {
    readonly status: "analysis_ready";
    readonly stream: CanonicalEventStream;
    readonly decisions: readonly ReplayedDecision[];
  }
  | {
    readonly status: "unsupported_semantics";
    readonly code: "mahjong_soul_canonical_unsupported_semantics";
  }
  | {
    readonly status: "mapping_failed";
    readonly code: "mahjong_soul_canonical_mapping_failed";
  }
  | {
    readonly status: "validation_failed";
    readonly code: "mahjong_soul_canonical_validation_failed";
  }
  | {
    readonly status: "replay_failed";
  };

export interface RecordAnalysisStore {
  /** Explicit main-process file import; no path or package-input IPC exists. */
  loadAnalysisPackageFile(filePath: string): Promise<string | undefined>;
  /** Main-process producer handoff only; never exposed through IPC. */
  putAnalysisPackage(value: StructuredAnalysisPackage): void;
  getAnalysisPackage(packageId: string): StructuredAnalysisPackage | undefined;
  analyzeRecord(input: {
    readonly recordId: string;
    readonly selfActor: number;
    readonly recordBytes: Uint8Array;
  }): RecordAnalysisOutcome;
  getMappedRecord(recordId: string, selfActor: number): CanonicalEventStream | undefined;
  getReplayedDecisions(
    recordId: string,
    selfActor: number,
  ): readonly ReplayedDecision[] | undefined;
}

// Analysis state is keyed by recordId + selfActor: one record imported from
// two seats is two different analyses, and neither may overwrite the other.
function stateKey(recordId: string, selfActor: number): string {
  return `${recordId}#${selfActor}`;
}

export function createRecordAnalysisStore(input: {
  readonly mapRecord: (input: {
    readonly gameId: string;
    readonly selfActor: number;
    readonly recordId: string;
    readonly recordBytes: Uint8Array;
  }) => MahjongSoulCanonicalMapperResult;
  readonly replay: (stream: CanonicalEventStream) => readonly ReplayedDecision[];
}): RecordAnalysisStore {
  const mappedRecords = new Map<string, CanonicalEventStream>();
  const analysisPackages = new Map<string, StructuredAnalysisPackage>();
  const putAnalysisPackage = (value: StructuredAnalysisPackage): void => {
    validateStructuredAnalysisPackage(value);
    analysisPackages.set(value.packageId, structuredClone(StructuredAnalysisPackageSchema.parse(value)));
  };
  const replayedRecords = new Map<string, ReplayedDecision[]>();

  const analyzeRecord = (request: {
    readonly recordId: string;
    readonly selfActor: number;
    readonly recordBytes: Uint8Array;
  }): RecordAnalysisOutcome => {
    if (
      typeof request.recordId !== "string"
      || request.recordId.length === 0
      || !Number.isInteger(request.selfActor)
      || request.selfActor < 0
      || request.selfActor > 3
      || !(request.recordBytes instanceof Uint8Array)
    ) {
      return { status: "mapping_failed", code: "mahjong_soul_canonical_mapping_failed" };
    }

    let mapped: MahjongSoulCanonicalMapperResult;
    try {
      mapped = input.mapRecord({
        gameId: `majsoul:${request.recordId}`,
        selfActor: request.selfActor,
        recordId: request.recordId,
        recordBytes: request.recordBytes,
      });
    } catch {
      return { status: "mapping_failed", code: "mahjong_soul_canonical_mapping_failed" };
    }

    if (mapped.status !== "ready") {
      switch (mapped.code) {
        case "mahjong_soul_canonical_unsupported_semantics":
          return { status: "unsupported_semantics", code: mapped.code };
        case "mahjong_soul_canonical_validation_failed":
          return { status: "validation_failed", code: mapped.code };
        default:
          return { status: "mapping_failed", code: "mahjong_soul_canonical_mapping_failed" };
      }
    }

    let decisions: readonly ReplayedDecision[];
    try {
      decisions = input.replay(mapped.stream);
    } catch {
      return { status: "replay_failed" };
    }

    const key = stateKey(request.recordId, request.selfActor);
    mappedRecords.set(key, mapped.stream);
    replayedRecords.set(key, [...decisions]);
    return { status: "analysis_ready", stream: mapped.stream, decisions };
  };

  return Object.freeze({
    async loadAnalysisPackageFile(filePath: string): Promise<string | undefined> {
      // This is a loader for an existing M6-C artifact, not a new analysis
      // producer or persistence format. Never reflect path/JSON/parser prose.
      const maximumBytes = 16 * 1024 * 1024;
      try {
        if (!isAbsolute(filePath)) return undefined;
        const info = await lstat(filePath);
        if (!info.isFile() || info.isSymbolicLink() || info.size > maximumBytes) return undefined;
        const handle = await open(filePath, "r");
        let serialized: string;
        try {
          const before = await handle.stat();
          if (!before.isFile() || before.size > maximumBytes) return undefined;
          const buffer = Buffer.alloc(Math.min(before.size + 1, maximumBytes + 1));
          let total = 0;
          while (total < buffer.length) {
            const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
            if (bytesRead === 0) break;
            total += bytesRead;
          }
          const after = await handle.stat();
          if (total > maximumBytes || total !== before.size || total !== after.size
            || before.dev !== after.dev || before.ino !== after.ino) return undefined;
          serialized = buffer.subarray(0, total).toString("utf8");
        } finally { await handle.close(); }
        const pkg = StructuredAnalysisPackageSchema.parse(JSON.parse(serialized));
        putAnalysisPackage(pkg);
        return pkg.packageId;
      } catch { return undefined; }
    },
    putAnalysisPackage,
    getAnalysisPackage(packageId: string): StructuredAnalysisPackage | undefined {
      const value = analysisPackages.get(packageId);
      return value === undefined ? undefined : structuredClone(StructuredAnalysisPackageSchema.parse(value));
    },
    analyzeRecord,
    getMappedRecord: (recordId: string, selfActor: number) =>
      mappedRecords.get(stateKey(recordId, selfActor)),
    getReplayedDecisions: (recordId: string, selfActor: number) =>
      replayedRecords.get(stateKey(recordId, selfActor)),
  });
}
