import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RecordAnalysisTimingHistorySchema, type RecordAnalysisTimingHistory } from "./record-analysis-progress.js";

// A bounded local speed reference, containing phase durations/counts only.
// It is separate from sessions, analysis packages and credential storage.
export function createRecordAnalysisTimingStore(directory: string) {
  const file = join(directory, "record-analysis-timings-v1.json");
  return {
    load(): RecordAnalysisTimingHistory {
      try {
        if (statSync(file).size > 16_384) throw new Error("timing_reference_invalid");
        return RecordAnalysisTimingHistorySchema.parse(JSON.parse(readFileSync(file, "utf8")));
      } catch { return { version: 1, samples: [] }; }
    },
    save(history: RecordAnalysisTimingHistory): void {
      const value = RecordAnalysisTimingHistorySchema.parse(history);
      const temporary = `${file}.tmp`;
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
        renameSync(temporary, file);
      } catch {
        try { unlinkSync(temporary); } catch { /* optional timing reference */ }
      }
    },
  };
}
